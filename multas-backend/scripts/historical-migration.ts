import { createInterface } from "node:readline/promises";
import { basename, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import type { RowDataPacket } from "mysql2/promise";
import { historicalEntities, type HistoricalEntity } from "../src/modules/historical-migrations/application/HistoricalCsv.js";
import { withContainer } from "./runtime.js";

const [command,...argumentsList]=process.argv.slice(2);
const options=new Map(argumentsList.filter((value)=>value.startsWith("--")).map((value)=>{const [key,...rest]=value.slice(2).split("=");return [key??"",rest.join("=")];}));

await withContainer(async(container)=>{
  const admins=await container.database.query<(RowDataPacket&{id:string})[]>("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.code='ADMIN' AND u.status='ACTIVE' ORDER BY u.created_at LIMIT 1");
  const actor=admins[0]?.id;if(!actor)throw new Error("No existe un administrador activo para auditar la operación.");
  if(command==="dry-run"){
    const path=required("path");const entity=required("entity");if(!historicalEntities.includes(entity as HistoricalEntity))throw new Error(`Entidad inválida. Use: ${historicalEntities.join(", ")}.`);
    const absolute=resolve(path);const upload=await container.historicalMigrations.upload({content:await readFile(absolute),originalName:basename(absolute),mimeType:"text/csv",sourceSystem:options.get("source")??"MICROSOFT_ACCESS",entity:entity as HistoricalEntity,actorUserId:actor});
    const validation=await container.historicalMigrations.validate(upload.batch.id,actor,"cli-historical-dry-run");process.stdout.write(`${JSON.stringify({mode:"DRY_RUN",operationalWrites:0,idempotentReplay:upload.idempotentReplay,validation},null,2)}\n`);return;
  }
  if(command==="commit"||command==="revert"){
    const batch=required("batch");const detail=await container.historicalMigrations.detail(batch);const expected=`${command==="commit"?"IMPORTAR":"REVERTIR"} ${detail.batch.public_reference}`;const supplied=options.get("confirm")??await prompt(expected);if(supplied!==expected)throw new Error(`Confirmación inválida. Debe escribir exactamente: ${expected}`);
    const result=command==="commit"?await container.historicalMigrations.commit(batch,actor,supplied,"cli-historical-commit"):await container.historicalMigrations.revert(batch,actor,supplied,"cli-historical-revert");process.stdout.write(`${JSON.stringify({mode:command.toUpperCase(),result},null,2)}\n`);return;
  }
  if(command==="cleanup"){const result=await container.historicalMigrations.purgeExpiredFiles(actor,"cli-historical-cleanup");process.stdout.write(`${JSON.stringify({mode:"CLEANUP",result},null,2)}\n`);return;}
  throw new Error("Comando inválido. Use dry-run, commit o revert.");
});

function required(name:string):string{const value=options.get(name);if(!value)throw new Error(`Falta --${name}=...`);return value;}
async function prompt(expected:string){if(!process.stdin.isTTY)throw new Error(`Se requiere confirmación interactiva o --confirm="${expected}".`);const terminal=createInterface({input:process.stdin,output:process.stdout});try{return await terminal.question(`Escriba exactamente ${expected}: `);}finally{terminal.close();}}
