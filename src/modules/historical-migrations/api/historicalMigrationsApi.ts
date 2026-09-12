import { API_BASE_URL, httpRequest } from "@/src/services/httpClient";

export const migrationEntities=["citizens","vehicles","agents","infractions","infraction_items","payments","payment_allocations","receipts","adjustments","solvencies"] as const;
export type MigrationEntity=(typeof migrationEntities)[number];
export interface MigrationBatch{id:number;public_reference:string;source_system:string;entity_type:MigrationEntity;status:string;total_rows:number;valid_rows:number;rejected_rows:number;duplicate_rows:number;backup_reference:string|null;created_at:string;}
export interface BatchDetail{batch:MigrationBatch;files:Record<string,unknown>[];logs:Record<string,unknown>[];openConflicts:number;errors:number;}
interface Envelope<T>{data:T;meta:{requestId:string}}

export const historicalMigrationsApi={
  list:()=>httpRequest<Envelope<{rows:MigrationBatch[];total:number}>>("/admin/historical-migrations/batches?pageSize=100"),
  detail:(id:number)=>httpRequest<Envelope<BatchDetail>>(`/admin/historical-migrations/batches/${id}`),
  preview:(id:number)=>httpRequest<Envelope<{rows:Record<string,unknown>[];total:number}>>(`/admin/historical-migrations/batches/${id}/preview?pageSize=100`),
  errors:(id:number)=>httpRequest<Envelope<{rows:Record<string,unknown>[];total:number}>>(`/admin/historical-migrations/batches/${id}/errors?pageSize=100`),
  conflicts:(id:number)=>httpRequest<Envelope<{rows:Record<string,unknown>[];total:number}>>(`/admin/historical-migrations/batches/${id}/conflicts?pageSize=100`),
  upload:(file:File,entity:MigrationEntity,sourceSystem:string)=>httpRequest<Envelope<{batch:MigrationBatch;idempotentReplay:boolean}>>("/admin/historical-migrations/uploads",{method:"POST",body:file,headers:{"content-type":"text/csv","x-file-name":file.name,"x-source-system":sourceSystem,"x-migration-entity":entity}}),
  validate:(id:number)=>httpRequest<Envelope<BatchDetail>>(`/admin/historical-migrations/batches/${id}/validate`,{method:"POST",body:{}}),
  approve:(id:number)=>httpRequest<Envelope<BatchDetail>>(`/admin/historical-migrations/batches/${id}/approve`,{method:"POST",body:{}}),
  importBatch:(id:number,confirmation:string)=>httpRequest<Envelope<unknown>>(`/admin/historical-migrations/batches/${id}/import`,{method:"POST",body:{confirmation}}),
  revert:(id:number,confirmation:string)=>httpRequest<Envelope<unknown>>(`/admin/historical-migrations/batches/${id}/revert`,{method:"POST",body:{confirmation}}),
  map:(id:number,input:{mappingType:string;entityType?:MigrationEntity;sourceValue:string;targetEntityType?:string;targetEntityId?:number;targetValue?:string;conflictId?:number})=>httpRequest<Envelope<BatchDetail>>(`/admin/historical-migrations/batches/${id}/mappings`,{method:"PATCH",body:input}),
  templateUrl:(entity:MigrationEntity)=>`${API_BASE_URL}/admin/historical-migrations/templates/${entity}`,
  reportUrl:(id:number)=>`${API_BASE_URL}/admin/historical-migrations/batches/${id}/report`,
};
