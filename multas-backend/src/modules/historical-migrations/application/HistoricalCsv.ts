import { z } from "zod";
import { HttpError } from "../../../shared/http/HttpError.js";

export const historicalEntities = ["citizens","vehicles","agents","infractions","infraction_items","payments","payment_allocations","receipts","adjustments","solvencies"] as const;
export type HistoricalEntity = (typeof historicalEntities)[number];
export type CsvRecord = Record<string,string>;
export type ValidatedCsvRecord = CsvRecord&{
  legacy_id:string;status:string;identification_type:string;identification_number:string;identification_normalized:string;nit:string;nit_normalized:string;first_names:string;last_names:string;address:string;phone:string;email:string;
  plate:string;plate_normalized:string;registration_card:string;vehicle_type:string;brand:string;line:string;model_year:string;color:string;vin_chassis:string;engine_number:string;owner_legacy_id:string;ownership_started_at:string;
  user_email:string;badge_number:string;hired_at:string;ticket_number:string;case_number:string;site_code:string;agent_legacy_id:string;device_uuid:string;citizen_legacy_id:string;vehicle_legacy_id:string;occurred_at:string;driver_absent:string;driver_refused_signature:string;location:string;observations:string;total_amount:string;
  infraction_legacy_id:string;article_code:string;amount:string;payment_order_number:string;cash_session_id:string;payment_method_code:string;currency:string;confirmed_at:string;external_reference:string;payment_legacy_id:string;receipt_number:string;issued_at:string;
  adjustment_type:string;direction:string;reason:string;legal_basis:string;authorization_reference:string;requested_at:string;decided_at:string;solvency_request_number:string;solvency_number:string;expires_at:string;validity_rule_version_id:string;
};

const optional = (maximum: number) => z.preprocess((value) => value === "" ? undefined : value, z.string().trim().max(maximum).optional());
const required = (maximum: number) => z.string().trim().min(1).max(maximum);
const legacyId = required(191).regex(/^[\p{L}\p{N}._:@/-]+$/u, "El legacy_id contiene caracteres no admitidos.");
const status = (values: readonly [string,...string[]]) => z.enum(values);
const money = z.string().trim().regex(/^(?:0|[1-9]\d{0,11})\.\d{2}$/, "Use un monto positivo con dos decimales.");
const dateTime = z.string().trim().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(value)) return false;
  const normalized = value.length === 10 ? `${value}T00:00:00.000Z` : `${value.replace(" ","T")}${value.includes("Z") ? "" : "Z"}`;
  return !Number.isNaN(new Date(normalized).getTime());
}, "Use fecha ISO YYYY-MM-DD o YYYY-MM-DD HH:mm:ss.");
const optionalDate = z.preprocess((value) => value === "" ? undefined : value, dateTime.optional());
const optionalId = z.preprocess((value) => value === "" ? undefined : value, legacyId.optional());
const integer = z.string().trim().regex(/^\d+$/);
const yesNo = z.preprocess((value) => value === "" ? "0" : value, z.enum(["0","1"]));

export const entityHeaders: Record<HistoricalEntity,readonly string[]> = {
  citizens: ["legacy_id","identification_type","identification_number","nit","first_names","last_names","address","phone","email","status"],
  vehicles: ["legacy_id","plate","registration_card","vehicle_type","brand","line","model_year","color","vin_chassis","engine_number","status","owner_legacy_id","ownership_started_at"],
  agents: ["legacy_id","user_email","badge_number","status","hired_at"],
  infractions: ["legacy_id","ticket_number","case_number","site_code","agent_legacy_id","device_uuid","citizen_legacy_id","vehicle_legacy_id","status","occurred_at","driver_absent","driver_refused_signature","location","observations","total_amount"],
  infraction_items: ["legacy_id","infraction_legacy_id","article_code","amount"],
  payments: ["legacy_id","payment_order_number","cash_session_id","payment_method_code","amount","currency","status","confirmed_at","external_reference"],
  payment_allocations: ["legacy_id","payment_legacy_id","infraction_legacy_id","amount"],
  receipts: ["legacy_id","payment_legacy_id","receipt_number","issued_at"],
  adjustments: ["legacy_id","infraction_legacy_id","adjustment_type","direction","amount","status","reason","legal_basis","authorization_reference","requested_at","decided_at"],
  solvencies: ["legacy_id","solvency_request_number","solvency_number","vehicle_legacy_id","status","issued_at","expires_at","validity_rule_version_id"],
};

const schemas: Record<HistoricalEntity,z.ZodType> = {
  citizens: z.object({ legacy_id:legacyId,identification_type:required(30),identification_number:required(100),nit:optional(30),first_names:required(150),last_names:required(150),address:optional(500),phone:optional(30),email:z.preprocess((value)=>value===""?undefined:value,z.email().max(191).optional()),status:status(["ACTIVE","INACTIVE"]) }).loose(),
  vehicles: z.object({ legacy_id:legacyId,plate:required(20),registration_card:required(100),vehicle_type:required(100),brand:required(100),line:required(100),model_year:z.preprocess((value)=>value===""?undefined:value,z.string().regex(/^\d{4}$/).refine((value)=>Number(value)>=1900&&Number(value)<=2200).optional()),color:required(80),vin_chassis:optional(100),engine_number:optional(100),status:status(["ACTIVE","INACTIVE"]),owner_legacy_id:optionalId,ownership_started_at:optionalDate }).loose(),
  agents: z.object({ legacy_id:legacyId,user_email:z.email().max(191),badge_number:required(50),status:status(["ACTIVE","INACTIVE","SUSPENDED"]),hired_at:optionalDate }).loose(),
  infractions: z.object({ legacy_id:legacyId,ticket_number:required(80),case_number:required(80),site_code:required(30),agent_legacy_id:legacyId,device_uuid:required(100),citizen_legacy_id:optionalId,vehicle_legacy_id:legacyId,status:required(40),occurred_at:dateTime,driver_absent:yesNo,driver_refused_signature:yesNo,location:required(500),observations:optional(5000),total_amount:money }).loose(),
  infraction_items: z.object({ legacy_id:legacyId,infraction_legacy_id:legacyId,article_code:required(30),amount:money.refine((value)=>value!=="0.00","El monto debe ser mayor que cero.") }).loose(),
  payments: z.object({ legacy_id:legacyId,payment_order_number:required(80),cash_session_id:integer,payment_method_code:required(50),amount:money.refine((value)=>value!=="0.00"),currency:z.literal("GTQ"),status:status(["REGISTERED","CONFIRMED"]),confirmed_at:optionalDate,external_reference:optional(200) }).superRefine((value,context)=>{if(value.status==="CONFIRMED"&&!value.confirmed_at)context.addIssue({code:"custom",path:["confirmed_at"],message:"Un pago confirmado requiere fecha."});}),
  payment_allocations: z.object({ legacy_id:legacyId,payment_legacy_id:legacyId,infraction_legacy_id:legacyId,amount:money.refine((value)=>value!=="0.00") }).loose(),
  receipts: z.object({ legacy_id:legacyId,payment_legacy_id:legacyId,receipt_number:required(80),issued_at:dateTime }).loose(),
  adjustments: z.object({ legacy_id:legacyId,infraction_legacy_id:legacyId,adjustment_type:status(["DISCOUNT","PARTIAL_EXEMPTION","TOTAL_EXEMPTION","SURCHARGE","AMOUNT_CORRECTION"]),direction:status(["CREDIT","DEBIT"]),amount:money.refine((value)=>value!=="0.00"),status:status(["PENDING_APPROVAL","APPROVED","REJECTED"]),reason:required(500),legal_basis:optional(500),authorization_reference:required(200),requested_at:dateTime,decided_at:optionalDate }).superRefine((value,context)=>{if(value.status!=="PENDING_APPROVAL"&&!value.decided_at)context.addIssue({code:"custom",path:["decided_at"],message:"El estado decidido requiere fecha de decisión."});}),
  solvencies: z.object({ legacy_id:legacyId,solvency_request_number:required(80),solvency_number:required(80),vehicle_legacy_id:legacyId,status:status(["VALID","REVOKED","OBSERVED","EXPIRED"]),issued_at:dateTime,expires_at:dateTime,validity_rule_version_id:integer }).superRefine((value,context)=>{if(new Date(normalizeDate(value.expires_at))<=new Date(normalizeDate(value.issued_at)))context.addIssue({code:"custom",path:["expires_at"],message:"La vigencia debe terminar después de la emisión."});}),
};

export function parseAndDecodeCsv(content:Buffer):{encoding:"UTF-8"|"WINDOWS-1252";headers:string[];records:CsvRecord[]} {
  if(content.length===0)throw new HttpError({code:"MIGRATION_FILE_EMPTY",message:"El archivo CSV está vacío.",statusCode:422});
  if(isForbiddenSignature(content)||content.includes(0))throw new HttpError({code:"MIGRATION_FILE_CONTENT_INVALID",message:"El archivo no corresponde a texto CSV seguro.",statusCode:415});
  let text:string;let encoding:"UTF-8"|"WINDOWS-1252"="UTF-8";
  try{text=new TextDecoder("utf-8",{fatal:true}).decode(content);}catch{encoding="WINDOWS-1252";text=new TextDecoder("windows-1252",{fatal:true}).decode(content);}
  text=text.replace(/^\uFEFF/,"");
  const matrix=parseCsv(text);
  if(matrix.length<2)throw new HttpError({code:"MIGRATION_CSV_ROWS_REQUIRED",message:"El CSV debe incluir encabezados y al menos una fila.",statusCode:422});
  const headers=matrix[0]?.map((value)=>value.trim())??[];
  if(headers.some((header)=>!header||header.length>100)||new Set(headers).size!==headers.length)throw new HttpError({code:"MIGRATION_CSV_HEADERS_INVALID",message:"Los encabezados están vacíos, duplicados o exceden el límite.",statusCode:422});
  const records=matrix.slice(1).filter((row)=>row.some((value)=>value.trim()!=="")).map((row)=>Object.fromEntries(headers.map((header,index)=>[header,row[index]?.trim()??""])));
  if(records.length===0)throw new HttpError({code:"MIGRATION_CSV_ROWS_REQUIRED",message:"El CSV no contiene filas de datos.",statusCode:422});
  return {encoding,headers,records};
}

export function validateHeaders(entity:HistoricalEntity,headers:readonly string[]):{missing:string[];unexpected:string[]} {
  const expected=new Set(entityHeaders[entity]);const actual=new Set(headers);
  return {missing:[...expected].filter((header)=>!actual.has(header)),unexpected:[...actual].filter((header)=>!expected.has(header))};
}

export function validateRecord(entity:HistoricalEntity,record:CsvRecord){const parsed=schemas[entity].safeParse(record);return parsed.success?{success:true as const,data:parsed.data as ValidatedCsvRecord}:{success:false as const,error:parsed.error};}

export function normalizeDeterministic(entity:HistoricalEntity,record:ValidatedCsvRecord):ValidatedCsvRecord {
  const result={...record};
  if(entity==="vehicles")result.plate_normalized=normalizePlate(record.plate);
  if(entity==="citizens"){
    result.identification_normalized=normalizeIdentifier(record.identification_number);
    if(record.nit)result.nit_normalized=normalizeIdentifier(record.nit);
  }
  for(const key of Object.keys(result))if(key.endsWith("_at")&&result[key])result[key]=normalizeDate(result[key]);
  return result;
}

export function applyColumnMappings(record:CsvRecord,mappings:ReadonlyMap<string,string>):CsvRecord {
  return Object.fromEntries(Object.entries(record).map(([key,value])=>[mappings.get(key)??key,value]));
}

export function normalizePlate(value:string):string{return value.normalize("NFKD").replace(/[^a-zA-Z0-9]/g,"").toUpperCase();}
export function normalizeIdentifier(value:string):string{return value.normalize("NFKD").replace(/[^a-zA-Z0-9]/g,"").toUpperCase();}
export function normalizeDate(value:string):string{
  const normalized=value.length===10?`${value}T00:00:00.000Z`:`${value.replace(" ","T")}${value.endsWith("Z")?"":"Z"}`;
  return new Date(normalized).toISOString().slice(0,23).replace("T"," ");
}

export function maskMigrationValue(field:string,value:unknown):string|null {
  if(value===null||value===undefined||value==="")return null;const text=stringifyScalar(value);
  if(["first_names","last_names","address","phone","email","identification_number","nit","observations","reason","legal_basis"].includes(field))return text.length<=2?"**":`${text.slice(0,1)}***${text.slice(-1)}`;
  return text.length>80?`${text.slice(0,77)}...`:text;
}

export function csvCell(value:unknown):string{
  const raw=value===null||value===undefined?"":stringifyScalar(value);const protectedValue=/^[=+\-@]/.test(raw)?`'${raw}`:raw;return `"${protectedValue.replaceAll('"','""')}"`;
}

function stringifyScalar(value:unknown):string{return typeof value==="string"?value:typeof value==="number"||typeof value==="boolean"||typeof value==="bigint"?value.toString():JSON.stringify(value);}

function parseCsv(text:string):string[][]{
  const rows:string[][]=[];let row:string[]=[];let field="";let quoted=false;
  for(let index=0;index<text.length;index+=1){const char=text[index];if(quoted){if(char==='"'&&text[index+1]==='"'){field+='"';index+=1;}else if(char==='"')quoted=false;else field+=char??"";}else if(char==='"'){if(field)throw malformed();quoted=true;}else if(char===","){row.push(field);field="";}else if(char==="\n"){row.push(field.replace(/\r$/, ""));rows.push(row);row=[];field="";}else field+=char??"";}
  if(quoted)throw malformed();if(field||row.length){row.push(field.replace(/\r$/, ""));rows.push(row);}const width=rows[0]?.length??0;if(rows.some((item)=>item.length!==width))throw malformed();return rows;
}

function malformed(){return new HttpError({code:"MIGRATION_CSV_MALFORMED",message:"El archivo contiene una estructura CSV inválida.",statusCode:422});}
function isForbiddenSignature(content:Buffer):boolean{return content.subarray(0,2).toString("ascii")==="MZ"||content.subarray(0,4).equals(Buffer.from([0x50,0x4b,0x03,0x04]))||content.subarray(0,8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]));}
