import { Router, type Request } from "express";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import type { AppContainer } from "../../../bootstrap/container.js";
import { authenticate } from "../../../shared/http/authenticate.js";
import { authorize } from "../../../shared/http/authorize.js";
import { HttpError } from "../../../shared/http/HttpError.js";
import { getRequestId } from "../../../shared/http/request-context.js";

const vehicleInput = z.object({
  plate: z.string().trim().min(2).max(20), registrationCard: z.string().trim().min(1).max(100),
  vehicleType: z.string().trim().min(1).max(100), brand: z.string().trim().min(1).max(100),
  line: z.string().trim().min(1).max(100), modelYear: z.number().int().min(1900).max(2200).nullable().optional(),
  color: z.string().trim().min(1).max(80), vinChassis: z.string().trim().max(100).nullable().optional(),
  engineNumber: z.string().trim().max(100).nullable().optional(),
});
const vehicleUpdate = vehicleInput.partial().refine((value) => Object.keys(value).length > 0, "Debe enviar al menos un campo.");
const ownershipInput = z.object({ citizenId: z.coerce.number().int().positive(), startedAt: z.coerce.date().optional(), source: z.string().trim().min(1).max(50).default("REGISTRATION") });
const endOwnershipInput = z.object({ endedAt: z.coerce.date().optional() });
const listQuery = z.object({ search: z.string().trim().max(100).default(""), status: z.enum(["ACTIVE", "INACTIVE"]).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) });

type VehicleRow = RowDataPacket & {
  id: string | number; plate_original: string; registration_card: string; vehicle_type: string; brand: string;
  vehicle_line: string; model_year: number | null; color: string; vin_chassis: string | null;
  engine_number: string | null; status: "ACTIVE" | "INACTIVE"; deactivated_at: Date | null;
  created_at: Date; updated_at: Date; owner_id: string | number | null; owner_first_names: string | null; owner_last_names: string | null;
};
type OwnershipRow = RowDataPacket & { id: string | number; vehicle_id: string | number; citizen_id: string | number; first_names: string; last_names: string; started_at: Date; ended_at: Date | null; is_current: number; source: string; created_at: Date };

function plate(value: string): string { return value.normalize("NFKD").replace(/[^a-zA-Z0-9]/g, "").toUpperCase(); }
function isDuplicate(error: unknown): boolean { return typeof error === "object" && error !== null && "errno" in error && error.errno === 1062; }
function mapVehicle(row: VehicleRow) {
  return { id: String(row.id), plate: row.plate_original, registrationCard: row.registration_card, vehicleType: row.vehicle_type, brand: row.brand, line: row.vehicle_line, modelYear: row.model_year, color: row.color, vinChassis: row.vin_chassis, engineNumber: row.engine_number, status: row.status, deactivatedAt: row.deactivated_at, createdAt: row.created_at, updatedAt: row.updated_at, currentOwner: row.owner_id ? { id: String(row.owner_id), firstNames: row.owner_first_names, lastNames: row.owner_last_names } : null };
}
async function audit(container: AppContainer, request: Request, action: string, type: string, id: string): Promise<void> {
  await container.auditRepository.record({ actorUserId: request.auth?.user.id ?? null, actorSessionId: request.auth?.id ?? null, action, module: "vehicles", entityType: type, entityId: id, outcome: "SUCCESS", requestId: getRequestId(), ipAddress: request.ip ?? null, userAgent: request.get("user-agent")?.slice(0, 500) ?? null });
}
async function queryResult<T extends RowDataPacket[]>(connection: PoolConnection, sql: string, values: unknown[]): Promise<T> {
  const [rows] = await connection.query<T>(sql, values);
  return rows;
}

export function createVehicleRouter(container: AppContainer): Router {
  const router = Router();
  router.use(authenticate(container.authRepository, container.env));
  router.get("/", authorize("vehicles.read", container.auditRepository), async (request, response, next) => {
    try {
      const query = listQuery.parse(request.query); const clauses: string[] = []; const values: (string | number)[] = [];
      if (query.status) { clauses.push("v.status = ?"); values.push(query.status); }
      if (query.search) { clauses.push("(v.plate_normalized LIKE ? OR v.registration_card LIKE ? OR v.brand LIKE ? OR v.vehicle_line LIKE ?)"); const like = `%${query.search}%`; values.push(`%${plate(query.search)}%`, like, like, like); }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const count = await container.database.query<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) total FROM vehicles v ${where}`, values);
      const rows = await container.database.query<VehicleRow[]>(`SELECT v.*, c.id owner_id, c.first_names owner_first_names, c.last_names owner_last_names FROM vehicles v LEFT JOIN vehicle_ownerships o ON o.vehicle_id=v.id AND o.is_current=1 LEFT JOIN citizens c ON c.id=o.citizen_id ${where} ORDER BY v.plate_normalized LIMIT ? OFFSET ?`, [...values, query.pageSize, (query.page - 1) * query.pageSize]);
      response.json({ data: rows.map(mapVehicle), meta: { page: query.page, pageSize: query.pageSize, total: count[0]?.total ?? 0, requestId: getRequestId() } });
    } catch (error) { next(error); }
  });
  router.get("/:id", authorize("vehicles.read", container.auditRepository), async (request, response, next) => {
    try {
      const id = z.coerce.number().int().positive().parse(request.params["id"]);
      const rows = await container.database.query<VehicleRow[]>("SELECT v.*, c.id owner_id, c.first_names owner_first_names, c.last_names owner_last_names FROM vehicles v LEFT JOIN vehicle_ownerships o ON o.vehicle_id=v.id AND o.is_current=1 LEFT JOIN citizens c ON c.id=o.citizen_id WHERE v.id=?", [id]);
      if (!rows[0]) throw new HttpError({ code: "VEHICLE_NOT_FOUND", message: "Vehículo no encontrado.", statusCode: 404 });
      response.json({ data: mapVehicle(rows[0]), meta: { requestId: getRequestId() } });
    } catch (error) { next(error); }
  });
  router.post("/", authorize("vehicles.create", container.auditRepository), async (request, response, next) => {
    try {
      const input = vehicleInput.parse(request.body);
      const result = await container.database.query<ResultSetHeader>("INSERT INTO vehicles (plate_original,plate_normalized,registration_card,vehicle_type,brand,vehicle_line,model_year,color,vin_chassis,engine_number) VALUES (?,?,?,?,?,?,?,?,?,?)", [input.plate, plate(input.plate), input.registrationCard, input.vehicleType, input.brand, input.line, input.modelYear ?? null, input.color, input.vinChassis ?? null, input.engineNumber ?? null]);
      await audit(container, request, "VEHICLE_CREATED", "vehicle", String(result.insertId)); response.status(201).json({ data: { id: String(result.insertId) }, meta: { requestId: getRequestId() } });
    } catch (error) { if (isDuplicate(error)) return next(new HttpError({ code: "VEHICLE_DUPLICATE", message: "La placa ya está registrada.", statusCode: 409 })); next(error); }
  });
  router.patch("/:id", authorize("vehicles.update", container.auditRepository), async (request, response, next) => {
    try {
      const id = z.coerce.number().int().positive().parse(request.params["id"]); const input = vehicleUpdate.parse(request.body); const columns: string[] = []; const values: unknown[] = [];
      const add = (column: string, value: unknown) => { columns.push(`${column}=?`); values.push(value); };
      if (input.plate !== undefined) { add("plate_original", input.plate); add("plate_normalized", plate(input.plate)); }
      const fields = [["registrationCard", "registration_card"], ["vehicleType", "vehicle_type"], ["brand", "brand"], ["line", "vehicle_line"], ["modelYear", "model_year"], ["color", "color"], ["vinChassis", "vin_chassis"], ["engineNumber", "engine_number"]] as const;
      for (const [key, column] of fields) if (input[key] !== undefined) add(column, input[key]);
      const result = await container.database.query<ResultSetHeader>(`UPDATE vehicles SET ${columns.join(",")} WHERE id=?`, [...values, id]);
      if (!result.affectedRows) throw new HttpError({ code: "VEHICLE_NOT_FOUND", message: "Vehículo no encontrado.", statusCode: 404 });
      await audit(container, request, "VEHICLE_UPDATED", "vehicle", String(id)); response.sendStatus(204);
    } catch (error) { if (isDuplicate(error)) return next(new HttpError({ code: "VEHICLE_DUPLICATE", message: "La placa ya está registrada.", statusCode: 409 })); next(error); }
  });
  for (const [path, status, action] of [["deactivate", "INACTIVE", "VEHICLE_DEACTIVATED"], ["activate", "ACTIVE", "VEHICLE_ACTIVATED"]] as const) {
    router.post(`/:id/${path}`, authorize("vehicles.deactivate", container.auditRepository), async (request, response, next) => {
      try { const id = z.coerce.number().int().positive().parse(request.params["id"]); const result = await container.database.query<ResultSetHeader>("UPDATE vehicles SET status=?, deactivated_at=IF(?='INACTIVE',CURRENT_TIMESTAMP(3),NULL) WHERE id=?", [status, status, id]); if (!result.affectedRows) throw new HttpError({ code: "VEHICLE_NOT_FOUND", message: "Vehículo no encontrado.", statusCode: 404 }); await audit(container, request, action, "vehicle", String(id)); response.sendStatus(204); } catch (error) { next(error); }
    });
  }
  router.get("/:id/ownerships", authorize("vehicles.read", container.auditRepository), async (request, response, next) => {
    try { const id = z.coerce.number().int().positive().parse(request.params["id"]); const rows = await container.database.query<OwnershipRow[]>("SELECT o.id,o.vehicle_id,o.citizen_id,o.started_at,o.ended_at,o.is_current,o.source,o.created_at,c.first_names,c.last_names FROM vehicle_ownerships o JOIN citizens c ON c.id=o.citizen_id WHERE o.vehicle_id=? ORDER BY o.started_at DESC,o.id DESC", [id]); response.json({ data: rows.map((row) => ({ id: String(row.id), vehicleId: String(row.vehicle_id), citizenId: String(row.citizen_id), citizenName: `${row.first_names} ${row.last_names}`, startedAt: row.started_at, endedAt: row.ended_at, isCurrent: Boolean(row.is_current), source: row.source, createdAt: row.created_at })), meta: { requestId: getRequestId() } }); } catch (error) { next(error); }
  });
  router.post("/:id/ownerships", authorize("vehicle_ownerships.manage", container.auditRepository), async (request, response, next) => {
    try {
      const vehicleId = z.coerce.number().int().positive().parse(request.params["id"]); const input = ownershipInput.parse(request.body); const startedAt = input.startedAt ?? new Date();
      const ownershipId = await container.database.withTransaction(async (connection) => {
        const vehicles = await queryResult<RowDataPacket[]>(connection, "SELECT id FROM vehicles WHERE id=? FOR UPDATE", [vehicleId]); if (!vehicles[0]) throw new HttpError({ code: "VEHICLE_NOT_FOUND", message: "Vehículo no encontrado.", statusCode: 404 });
        const citizens = await queryResult<(RowDataPacket & { status: string })[]>(connection, "SELECT id,status FROM citizens WHERE id=?", [input.citizenId]); if (!citizens[0]) throw new HttpError({ code: "CITIZEN_NOT_FOUND", message: "Ciudadano no encontrado.", statusCode: 404 }); if (citizens[0].status !== "ACTIVE") throw new HttpError({ code: "CITIZEN_INACTIVE", message: "El propietario debe estar activo.", statusCode: 409 });
        const current = await queryResult<RowDataPacket[]>(connection, "SELECT id FROM vehicle_ownerships WHERE vehicle_id=? AND is_current=1 FOR UPDATE", [vehicleId]); if (current[0]) throw new HttpError({ code: "OWNERSHIP_ALREADY_ACTIVE", message: "Finalice la propiedad vigente antes de asignar otra.", statusCode: 409 });
        const [result] = await connection.query<ResultSetHeader>("INSERT INTO vehicle_ownerships (vehicle_id,citizen_id,started_at,source,created_by_user_id) VALUES (?,?,?,?,?)", [vehicleId, input.citizenId, startedAt, input.source, request.auth?.user.id ?? null]); return String(result.insertId);
      });
      await audit(container, request, "VEHICLE_OWNERSHIP_ASSIGNED", "vehicle_ownership", ownershipId); response.status(201).json({ data: { id: ownershipId }, meta: { requestId: getRequestId() } });
    } catch (error) { next(error); }
  });
  router.post("/:vehicleId/ownerships/:ownershipId/end", authorize("vehicle_ownerships.manage", container.auditRepository), async (request, response, next) => {
    try { const vehicleId = z.coerce.number().int().positive().parse(request.params["vehicleId"]); const ownershipId = z.coerce.number().int().positive().parse(request.params["ownershipId"]); const input = endOwnershipInput.parse(request.body); const result = await container.database.query<ResultSetHeader>("UPDATE vehicle_ownerships SET is_current=0,ended_at=? WHERE id=? AND vehicle_id=? AND is_current=1", [input.endedAt ?? new Date(), ownershipId, vehicleId]); if (!result.affectedRows) throw new HttpError({ code: "OWNERSHIP_NOT_ACTIVE", message: "La propiedad vigente no fue encontrada.", statusCode: 404 }); await audit(container, request, "VEHICLE_OWNERSHIP_ENDED", "vehicle_ownership", String(ownershipId)); response.sendStatus(204); } catch (error) { next(error); }
  });
  return router;
}
