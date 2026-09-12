/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { randomBytes, randomUUID } from "node:crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { HttpError } from "../../../shared/http/HttpError.js";
import type { HistoricalEntity, ValidatedCsvRecord } from "./HistoricalCsv.js";

type ImportContext={sourceSystem:string;batchId:number;actorUserId:string;requestId:string};
type Imported={table:string;id:number};
type Data=ValidatedCsvRecord;
type DbValue=string|number|Date|null;
type DbRow=RowDataPacket&{id:DbValue;status:DbValue;target_table:DbValue;target_id:DbValue;target_entity_type:DbValue;target_entity_id:DbValue;target_value:DbValue;badge_number:DbValue;first_name:DbValue;last_name:DbValue;identification_number:DbValue;first_names:DbValue;last_names:DbValue;nit:DbValue;address:DbValue;plate_original:DbValue;registration_card:DbValue;vehicle_type:DbValue;brand:DbValue;vehicle_line:DbValue;color:DbValue;code:DbValue;name:DbValue;legal_basis:DbValue;vehicle_plate_snapshot:DbValue;vehicle_registration_snapshot:DbValue;vehicle_description_snapshot:DbValue;owner_citizen_id:DbValue;owner_name_snapshot:DbValue;owner_identification_snapshot:DbValue;financial_balance_snapshot:DbValue;open_infractions_snapshot:DbValue;open_appeals_snapshot:DbValue;pending_payments_snapshot:DbValue};

export class OperationalHistoricalImporter {
  public async importRow(connection:PoolConnection,entity:HistoricalEntity,data:Data,context:ImportContext):Promise<Imported>{
    const existing=await this.legacyTarget(connection,context.sourceSystem,entity,data.legacy_id);
    if(existing)return existing;
    let imported:Imported;
    switch(entity){
      case "citizens": imported=await this.citizen(connection,data);break;
      case "vehicles": imported=await this.vehicle(connection,data,context);break;
      case "agents": imported=await this.agent(connection,data);break;
      case "infractions": imported=await this.infraction(connection,data,context);break;
      case "infraction_items": imported=await this.infractionItem(connection,data,context);break;
      case "payments": imported=await this.payment(connection,data,context);break;
      case "payment_allocations": imported=await this.paymentAllocation(connection,data,context);break;
      case "receipts": imported=await this.receipt(connection,data,context);break;
      case "adjustments": imported=await this.adjustment(connection,data,context);break;
      case "solvencies": imported=await this.solvency(connection,data,context);break;
    }
    await this.reference(connection,context,entity,data.legacy_id,imported);
    return imported;
  }

  public async revertImported(connection:PoolConnection,table:string,id:number):Promise<void>{
    if(!allowedTargetTables.has(table))throw new HttpError({code:"MIGRATION_REVERT_TARGET_INVALID",message:"El destino histórico no puede revertirse de forma automática.",statusCode:409});
    const blocker=await this.findBlocker(connection,table,id);
    if(blocker)throw new HttpError({code:"MIGRATION_REVERT_UNSAFE",message:`La reversión está bloqueada por referencias posteriores en ${blocker}.`,statusCode:409});
    await connection.query(`DELETE FROM ${table} WHERE id=?`,[id]);
  }

  private async citizen(connection:PoolConnection,data:Data):Promise<Imported>{
    const [result]=await connection.query<ResultSetHeader>(`INSERT INTO citizens (identification_type,identification_number,identification_normalized,nit,nit_normalized,first_names,last_names,address,phone,email,status,deactivated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,[data.identification_type,data.identification_number,data.identification_normalized,data.nit||null,data.nit_normalized||null,data.first_names,data.last_names,data.address||null,data.phone||null,data.email||null,data.status,data.status==="INACTIVE"?new Date():null]);
    return {table:"citizens",id:result.insertId};
  }

  private async vehicle(connection:PoolConnection,data:Data,context:ImportContext):Promise<Imported>{
    const [result]=await connection.query<ResultSetHeader>(`INSERT INTO vehicles (plate_original,plate_normalized,registration_card,vehicle_type,brand,vehicle_line,model_year,color,vin_chassis,engine_number,status,deactivated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,[data.plate,data.plate_normalized,data.registration_card,data.vehicle_type,data.brand,data.line,data.model_year?Number(data.model_year):null,data.color,data.vin_chassis||null,data.engine_number||null,data.status,data.status==="INACTIVE"?new Date():null]);
    if(data.owner_legacy_id){const owner=await this.requireLegacyOrMapping(connection,context.sourceSystem,"citizens",data.owner_legacy_id);const [ownership]=await connection.query<ResultSetHeader>("INSERT INTO vehicle_ownerships (vehicle_id,citizen_id,started_at,source,created_by_user_id) VALUES (?,?,?,?,?)",[result.insertId,owner.id,data.ownership_started_at||new Date(),"HISTORICAL_MIGRATION",context.actorUserId]);await this.reference(connection,context,"vehicle_ownerships",`${data.legacy_id}:ownership`,{table:"vehicle_ownerships",id:ownership.insertId});}
    return {table:"vehicles",id:result.insertId};
  }

  private async agent(connection:PoolConnection,data:Data):Promise<Imported>{
    const user=await this.one(connection,"SELECT id FROM users WHERE email=? AND status='ACTIVE'",[data.user_email]);if(!user)throw missing("usuario del agente");
    const [result]=await connection.query<ResultSetHeader>("INSERT INTO agents (user_id,badge_number,status,hired_at) VALUES (?,?,?,?)",[user.id,data.badge_number,data.status,data.hired_at||null]);return {table:"agents",id:result.insertId};
  }

  private async infraction(connection:PoolConnection,data:Data,context:ImportContext):Promise<Imported>{
    const agent=await this.requireLegacyOrMapping(connection,context.sourceSystem,"agents",data.agent_legacy_id,"AGENT");const vehicle=await this.requireLegacyOrMapping(connection,context.sourceSystem,"vehicles",data.vehicle_legacy_id);const citizen=data.citizen_legacy_id?await this.requireLegacyOrMapping(connection,context.sourceSystem,"citizens",data.citizen_legacy_id):null;
    const site=await this.one(connection,"SELECT id FROM sites WHERE code=? AND is_active=1",[data.site_code]);const device=await this.one(connection,"SELECT id FROM devices WHERE device_uuid=?",[data.device_uuid]);if(!site||!device)throw missing("sede o dispositivo");
    const agentSnapshot=await this.one(connection,"SELECT a.badge_number,u.first_name,u.last_name FROM agents a JOIN users u ON u.id=a.user_id WHERE a.id=?",[agent.id]);const vehicleSnapshot=await this.one(connection,"SELECT * FROM vehicles WHERE id=?",[vehicle.id]);const citizenSnapshot=citizen?await this.one(connection,"SELECT * FROM citizens WHERE id=?",[citizen.id]):null;if(!agentSnapshot||!vehicleSnapshot)throw missing("snapshots operativos");
    const submitted=data.status==="BORRADOR"?null:data.occurred_at;const validated=data.status==="VALIDADA"?data.occurred_at:null;const validator=data.status==="VALIDADA"?context.actorUserId:null;
    const [result]=await connection.query<ResultSetHeader>(`INSERT INTO infractions (ticket_number,case_number,site_id,agent_id,device_id,citizen_id,vehicle_id,status,occurred_at,driver_absent,driver_refused_signature,observations,agent_badge_snapshot,agent_name_snapshot,citizen_identification_snapshot,citizen_name_snapshot,citizen_nit_snapshot,citizen_address_snapshot,vehicle_plate_snapshot,vehicle_registration_card_snapshot,vehicle_type_snapshot,vehicle_brand_snapshot,vehicle_line_snapshot,vehicle_color_snapshot,location_snapshot,total_amount,created_by_user_id,submitted_at,validated_at,validated_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[data.ticket_number,data.case_number,site.id,agent.id,device.id,citizen?.id??null,vehicle.id,data.status,data.occurred_at,Number(data.driver_absent),Number(data.driver_refused_signature),data.observations||null,agentSnapshot.badge_number,`${agentSnapshot.first_name} ${agentSnapshot.last_name}`,citizenSnapshot?.identification_number??null,citizenSnapshot?`${citizenSnapshot.first_names} ${citizenSnapshot.last_names}`:null,citizenSnapshot?.nit??null,citizenSnapshot?.address??null,vehicleSnapshot.plate_original,vehicleSnapshot.registration_card,vehicleSnapshot.vehicle_type,vehicleSnapshot.brand,vehicleSnapshot.vehicle_line,vehicleSnapshot.color,data.location,data.total_amount,context.actorUserId,submitted,validated,validator]);
    const [location]=await connection.query<ResultSetHeader>("INSERT INTO infraction_locations (infraction_id,place_name,address) VALUES (?,?,?)",[result.insertId,data.location,data.location]);await this.reference(connection,context,"infraction_locations",`${data.legacy_id}:location`,{table:"infraction_locations",id:location.insertId});return {table:"infractions",id:result.insertId};
  }

  private async infractionItem(connection:PoolConnection,data:Data,context:ImportContext):Promise<Imported>{
    const infraction=await this.requireLegacyOrMapping(connection,context.sourceSystem,"infractions",data.infraction_legacy_id);let type=await this.one(connection,"SELECT id,code,name,legal_basis FROM infraction_types WHERE code=?",[data.article_code]);if(!type){const mapped=await this.mappingTarget(connection,context.sourceSystem,"infraction_items","ARTICLE",data.article_code);if(mapped?.target_entity_id)type=await this.one(connection,"SELECT id,code,name,legal_basis FROM infraction_types WHERE id=?",[mapped.target_entity_id]);}if(!type)throw missing("artículo");const rate=await this.one(connection,"SELECT id FROM infraction_rate_versions WHERE infraction_type_id=? AND amount=? ORDER BY effective_from DESC,id DESC LIMIT 1",[type.id,data.amount]);if(!rate)throw missing("versión tarifaria");const [result]=await connection.query<ResultSetHeader>("INSERT INTO infraction_items (infraction_id,infraction_type_id,rate_version_id,type_code_snapshot,type_name_snapshot,legal_basis_snapshot,amount_snapshot) VALUES (?,?,?,?,?,?,?)",[infraction.id,type.id,rate.id,type.code,type.name,type.legal_basis,data.amount]);return {table:"infraction_items",id:result.insertId};
  }

  private async payment(connection:PoolConnection,data:Data,context:ImportContext):Promise<Imported>{
    const order=await this.one(connection,"SELECT id,status FROM payment_orders WHERE order_number=?",[data.payment_order_number]);const session=await this.one(connection,"SELECT id FROM cash_sessions WHERE id=?",[data.cash_session_id]);let method=await this.one(connection,"SELECT id FROM payment_methods WHERE code=?",[data.payment_method_code]);if(!method){const mapped=await this.mappingTarget(connection,context.sourceSystem,"payments","PAYMENT_METHOD",data.payment_method_code);if(mapped?.target_entity_id)method=await this.one(connection,"SELECT id FROM payment_methods WHERE id=?",[mapped.target_entity_id]);}if(!order||!session||!method)throw missing("orden, caja o método de pago");if(order.status!=="USED")throw new HttpError({code:"MIGRATION_PAYMENT_ORDER_NOT_USED",message:"La orden histórica debe estar marcada como utilizada antes de asociar el pago.",statusCode:409});const requestId=context.requestId||randomUUID();const confirmed=data.status==="CONFIRMED";const [result]=await connection.query<ResultSetHeader>(`INSERT INTO payments (public_reference,payment_order_id,cash_session_id,payment_method_id,amount,currency,external_reference,status,created_by_user_id,created_request_id,created_at,confirmed_by_user_id,confirmation_request_id,confirmed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[randomBytes(20).toString("hex"),order.id,session.id,method.id,data.amount,"GTQ",data.external_reference||null,data.status,context.actorUserId,requestId,data.confirmed_at||new Date(),confirmed?context.actorUserId:null,confirmed?requestId:null,confirmed?data.confirmed_at:null]);
    if(confirmed){const [movement]=await connection.query<ResultSetHeader>("INSERT INTO cash_movements (cash_session_id,movement_type,direction,amount,payment_id,reason,created_by_user_id,request_id,created_at) VALUES (?,'PAYMENT','IN',?,?,'Pago histórico migrado',?,?,?)",[session.id,data.amount,result.insertId,context.actorUserId,requestId,data.confirmed_at]);await this.reference(connection,context,"cash_movements",`${data.legacy_id}:movement`,{table:"cash_movements",id:movement.insertId});}
    return {table:"payments",id:result.insertId};
  }

  private async paymentAllocation(connection:PoolConnection,data:Data,context:ImportContext):Promise<Imported>{const payment=await this.requireLegacyOrMapping(connection,context.sourceSystem,"payments",data.payment_legacy_id);const infraction=await this.requireLegacyOrMapping(connection,context.sourceSystem,"infractions",data.infraction_legacy_id);const [result]=await connection.query<ResultSetHeader>("INSERT INTO payment_allocations (payment_id,infraction_id,amount) VALUES (?,?,?)",[payment.id,infraction.id,data.amount]);return {table:"payment_allocations",id:result.insertId};}
  private async receipt(connection:PoolConnection,data:Data,context:ImportContext):Promise<Imported>{const payment=await this.requireLegacyOrMapping(connection,context.sourceSystem,"payments",data.payment_legacy_id);const [result]=await connection.query<ResultSetHeader>("INSERT INTO payment_receipts (payment_id,receipt_number,issued_at,issued_by_user_id,original_request_id) VALUES (?,?,?,?,?)",[payment.id,data.receipt_number,data.issued_at,context.actorUserId,context.requestId]);return {table:"payment_receipts",id:result.insertId};}
  private async adjustment(connection:PoolConnection,data:Data,context:ImportContext):Promise<Imported>{const infraction=await this.requireLegacyOrMapping(connection,context.sourceSystem,"infractions",data.infraction_legacy_id);const decided=data.status!=="PENDING_APPROVAL";const [result]=await connection.query<ResultSetHeader>(`INSERT INTO infraction_adjustments (infraction_id,adjustment_type,direction,amount,reason,legal_basis,authorization_reference,status,requested_by_user_id,decided_by_user_id,decision_comment,requested_at,decided_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,[infraction.id,data.adjustment_type,data.direction,data.amount,data.reason,data.legal_basis||null,data.authorization_reference,data.status,context.actorUserId,decided?context.actorUserId:null,decided?"Decisión histórica migrada":null,data.requested_at,decided?data.decided_at:null]);return {table:"infraction_adjustments",id:result.insertId};}

  private async solvency(connection:PoolConnection,data:Data,context:ImportContext):Promise<Imported>{const request=await this.one(connection,"SELECT * FROM solvency_requests WHERE request_number=? AND status='APPROVED'",[data.solvency_request_number]);const vehicle=await this.requireLegacyOrMapping(connection,context.sourceSystem,"vehicles",data.vehicle_legacy_id);const rule=await this.one(connection,"SELECT id FROM institutional_rule_versions WHERE id=?",[data.validity_rule_version_id]);if(!request||!rule)throw missing("solicitud aprobada o regla de vigencia");const revoked=data.status==="REVOKED";const observed=data.status==="OBSERVED";const [result]=await connection.query<ResultSetHeader>(`INSERT INTO solvencies (solvency_request_id,solvency_number,public_reference,vehicle_id,vehicle_snapshot,owner_snapshot,financial_snapshot,status,validity_rule_version_id,issued_by_user_id,issued_at,expires_at,revoked_by_user_id,revoked_at,revocation_reason,observed_at,observation_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[request.id,data.solvency_number,randomBytes(20).toString("hex"),vehicle.id,JSON.stringify({plate:request.vehicle_plate_snapshot,registration:request.vehicle_registration_snapshot,description:request.vehicle_description_snapshot}),JSON.stringify({citizenId:String(request.owner_citizen_id),name:request.owner_name_snapshot,identification:request.owner_identification_snapshot}),JSON.stringify({balance:request.financial_balance_snapshot,openInfractions:request.open_infractions_snapshot,openAppeals:request.open_appeals_snapshot,pendingPayments:request.pending_payments_snapshot}),data.status,rule.id,context.actorUserId,data.issued_at,data.expires_at,revoked?context.actorUserId:null,revoked?data.issued_at:null,revoked?"Revocación histórica migrada":null,observed?data.issued_at:null,observed?"Observación histórica migrada":null]);return {table:"solvencies",id:result.insertId};}

  private async legacyTarget(connection:PoolConnection,source:string,entity:string,legacyId:string):Promise<Imported|null>{const row=await this.one(connection,"SELECT target_table,target_id FROM legacy_source_references WHERE source_system=? AND entity_type=? AND legacy_id=? AND reverted_at IS NULL",[source,entity,legacyId]);return row?{table:String(row.target_table),id:Number(row.target_id)}:null;}
  private async requireLegacyOrMapping(connection:PoolConnection,source:string,entity:string,legacyId:string,mappingType="TABLE"):Promise<Imported>{const target=await this.legacyTarget(connection,source,entity,legacyId);if(target)return target;const mapped=await this.mappingTarget(connection,source,entity,mappingType,legacyId);if(mapped?.target_entity_id)return {table:String(mapped.target_entity_type??targetTableByEntity[entity]??entity),id:Number(mapped.target_entity_id)};throw missing(`${entity}:${legacyId}`);}
  private async mappingTarget(connection:PoolConnection,source:string,entity:string,mappingType:string,sourceValue:string){return this.one(connection,"SELECT target_entity_type,target_entity_id,target_value FROM migration_entity_mappings WHERE source_system=? AND entity_type=? AND mapping_type=? AND source_value=? AND status='APPROVED' ORDER BY version DESC LIMIT 1",[source,entity,mappingType,sourceValue]);}
  private async reference(connection:PoolConnection,context:ImportContext,entity:string,legacyId:string,target:Imported):Promise<void>{await connection.query("INSERT INTO legacy_source_references (source_system,entity_type,legacy_id,target_table,target_id,imported_by_batch_id) VALUES (?,?,?,?,?,?)",[context.sourceSystem,entity,legacyId,target.table,target.id,context.batchId]);}
  private async one(connection:PoolConnection,sql:string,values:unknown[]):Promise<DbRow|null>{const [rows]=await connection.query<DbRow[]>(sql,values);return rows[0]??null;}

  private async findBlocker(connection:PoolConnection,table:string,id:number):Promise<string|null>{const checks=dependencyChecks[table]??[];for(const [dependency,column] of checks){const row=await this.one(connection,`SELECT id FROM ${dependency} WHERE ${column}=? LIMIT 1`,[id]);if(row)return dependency;}return null;}
}

const allowedTargetTables=new Set(["citizens","vehicles","vehicle_ownerships","agents","infractions","infraction_locations","infraction_items","payments","cash_movements","payment_allocations","payment_receipts","infraction_adjustments","solvencies"]);
const targetTableByEntity:Record<string,string>={citizens:"citizens",vehicles:"vehicles",agents:"agents",infractions:"infractions",infraction_items:"infraction_items",payments:"payments",payment_allocations:"payment_allocations",receipts:"payment_receipts",adjustments:"infraction_adjustments",solvencies:"solvencies"};
const dependencyChecks:Record<string,readonly [string,string][]>= {
  citizens:[["vehicle_ownerships","citizen_id"],["driver_licenses","citizen_id"],["infractions","citizen_id"],["solvency_requests","owner_citizen_id"]],
  vehicles:[["vehicle_ownerships","vehicle_id"],["infractions","vehicle_id"],["solvency_requests","vehicle_id"],["solvencies","vehicle_id"]],
  agents:[["infractions","agent_id"]],
  infractions:[["infraction_locations","infraction_id"],["infraction_items","infraction_id"],["payment_allocations","infraction_id"],["appeals","infraction_id"],["infraction_adjustments","infraction_id"],["payment_orders","infraction_id"]],
  payments:[["cash_movements","payment_id"],["payment_allocations","payment_id"],["payment_receipts","payment_id"],["payment_reversals","payment_id"],["reconciliation_items","payment_id"]],
  infraction_adjustments:[["infraction_adjustment_history","adjustment_id"],["infraction_adjustments","reverses_adjustment_id"]],
  solvencies:[["solvency_status_history","solvency_id"]],
};
function missing(resource:string){return new HttpError({code:"MIGRATION_REFERENCE_MISSING",message:`No existe la referencia requerida: ${resource}.`,statusCode:409});}
