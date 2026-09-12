import { randomBytes } from "node:crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { centsToDecimal, decimalToCents } from "../../../shared/domain/Money.js";
import { HttpError } from "../../../shared/http/HttpError.js";
import type { MySqlDatabase } from "../../../shared/infrastructure/mysql/MySqlConnection.js";
import { calculateBalance } from "../../payments/application/PaymentService.js";

type Actor = { userId: number; requestId: string };
type RequestRow = RowDataPacket & { id: number; request_number: string; vehicle_id: number; status: string; vehicle_plate_snapshot: string; vehicle_registration_snapshot: string; vehicle_description_snapshot: string; owner_citizen_id: number; owner_name_snapshot: string; owner_identification_snapshot: string; financial_balance_snapshot: string; open_infractions_snapshot: number; open_appeals_snapshot: number; pending_payments_snapshot: number; requested_by_user_id: number; requested_at: Date; reviewed_at: Date | null; rejection_reason: string | null };
type SolvencyRow = RowDataPacket & { id: number; solvency_request_id: number; solvency_number: string; public_reference: string; vehicle_id: number; vehicle_snapshot: string | object; owner_snapshot: string | object; financial_snapshot: string | object; status: "VALID" | "REVOKED" | "OBSERVED" | "EXPIRED"; issued_at: Date; expires_at: Date; revoked_at: Date | null; revocation_reason: string | null; observed_at: Date | null; observation_reason: string | null };

export class SolvencyService {
  public constructor(private readonly database: MySqlDatabase) {}

  public async options() {
    return this.database.query<RowDataPacket[]>(
      `SELECT v.id,v.plate_original,v.registration_card,v.brand,v.vehicle_line,v.color,
              CONCAT(c.first_names,' ',c.last_names) owner_name
       FROM vehicles v JOIN vehicle_ownerships vo ON vo.vehicle_id=v.id AND vo.is_current=1
       JOIN citizens c ON c.id=vo.citizen_id WHERE v.status='ACTIVE' ORDER BY v.plate_normalized LIMIT 500`,
    );
  }

  public async createRequest(vehicleId: number, actor: Actor) {
    return this.database.withTransaction(async (connection) => {
      const eligibility = await this.eligibility(connection, vehicleId);
      assertEligible(eligibility);
      const requestNumber = await nextDocumentNumber(connection, eligibility.siteId, "SOLVENCY_REQUEST", new Date().getUTCFullYear());
      try {
        const [created] = await connection.query<ResultSetHeader>(
          `INSERT INTO solvency_requests (request_number,vehicle_id,vehicle_plate_snapshot,vehicle_registration_snapshot,vehicle_description_snapshot,owner_citizen_id,owner_name_snapshot,owner_identification_snapshot,financial_balance_snapshot,open_infractions_snapshot,open_appeals_snapshot,pending_payments_snapshot,requested_by_user_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [requestNumber, vehicleId, eligibility.plate, eligibility.registration, eligibility.vehicleDescription, eligibility.ownerId, eligibility.ownerName, eligibility.ownerIdentification, eligibility.balance, eligibility.debtCount, eligibility.openAppeals, eligibility.pendingPayments, actor.userId],
        );
        await connection.query(
          "INSERT INTO solvency_request_status_history (solvency_request_id,from_status,to_status,action,changed_by_user_id,request_id) VALUES (?,NULL,'PENDING_REVIEW','CREATE',?,?)",
          [created.insertId, actor.userId, actor.requestId],
        );
        return await this.loadRequest(connection, created.insertId);
      } catch (error) {
        if (isDuplicateKey(error)) throw new HttpError({ code: "SOLVENCY_REQUEST_ALREADY_OPEN", message: "El vehículo ya tiene una solicitud pendiente.", statusCode: 409 });
        throw error;
      }
    });
  }

  public async listRequests(input: { status?: string | undefined }) {
    const where = input.status ? "WHERE sr.status=?" : "";
    return this.database.query<RequestRow[]>(
      `SELECT sr.* FROM solvency_requests sr ${where} ORDER BY sr.requested_at DESC`, input.status ? [input.status] : [],
    );
  }

  public async getRequest(id: number) {
    const request = await this.loadRequest(this.database, id);
    const solvencies = await this.database.query<SolvencyRow[]>("SELECT * FROM solvencies WHERE solvency_request_id=?", [id]);
    const history = await this.database.query<RowDataPacket[]>("SELECT * FROM solvency_request_status_history WHERE solvency_request_id=? ORDER BY created_at,id", [id]);
    return { ...request, solvency: solvencies[0] ? solvencyDto(solvencies[0]) : null, history };
  }

  public async approveRequest(id: number, actor: Actor) {
    return this.database.withTransaction(async (connection) => {
      const request = await this.loadRequest(connection, id, true);
      if (request.status !== "PENDING_REVIEW") throw new HttpError({ code: "SOLVENCY_REQUEST_NOT_PENDING", message: "La solicitud ya fue resuelta.", statusCode: 409 });
      const eligibility = await this.eligibility(connection, request.vehicle_id);
      assertEligible(eligibility);
      const [rules] = await connection.query<(RowDataPacket & { id: number; value_integer: number })[]>(
        `SELECT id,value_integer FROM institutional_rule_versions
         WHERE rule_code='SOLVENCY_VALIDITY_DAYS' AND value_type='INTEGER' AND value_integer>0
           AND effective_from<=UTC_TIMESTAMP(3) AND (effective_to IS NULL OR effective_to>UTC_TIMESTAMP(3))
         ORDER BY effective_from DESC,id DESC LIMIT 1 FOR UPDATE`,
      );
      const rule = rules[0];
      if (!rule) throw new HttpError({ code: "SOLVENCY_VALIDITY_NOT_CONFIGURED", message: "La vigencia de la solvencia no está configurada institucionalmente.", statusCode: 409 });
      const [expired] = await connection.query<(RowDataPacket & { id: number })[]>("SELECT id FROM solvencies WHERE vehicle_id=? AND status='VALID' AND expires_at<=UTC_TIMESTAMP(3) FOR UPDATE", [request.vehicle_id]);
      for (const row of expired) {
        await connection.query("UPDATE solvencies SET status='EXPIRED' WHERE id=?", [row.id]);
        await connection.query("INSERT INTO solvency_status_history (solvency_id,from_status,to_status,action,reason,changed_by_user_id,request_id) VALUES (?,'VALID','EXPIRED','AUTO_EXPIRE','Vencimiento de vigencia configurada',?,?)", [row.id, actor.userId, actor.requestId]);
      }
      const [active] = await connection.query<RowDataPacket[]>("SELECT id FROM solvencies WHERE vehicle_id=? AND status='VALID' FOR UPDATE", [request.vehicle_id]);
      if (active[0]) throw new HttpError({ code: "SOLVENCY_ALREADY_VALID", message: "El vehículo ya posee una solvencia vigente.", statusCode: 409 });
      const issuedAt = new Date(); const expiresAt = new Date(issuedAt.getTime() + rule.value_integer * 86_400_000);
      const solvencyNumber = await nextDocumentNumber(connection, eligibility.siteId, "SOLVENCY", issuedAt.getUTCFullYear());
      await connection.query("UPDATE solvency_requests SET status='APPROVED',reviewed_by_user_id=?,reviewed_at=UTC_TIMESTAMP(3) WHERE id=?", [actor.userId, id]);
      await connection.query("INSERT INTO solvency_request_status_history (solvency_request_id,from_status,to_status,action,changed_by_user_id,request_id) VALUES (?,'PENDING_REVIEW','APPROVED','APPROVE',?,?)", [id, actor.userId, actor.requestId]);
      try {
        const [created] = await connection.query<ResultSetHeader>(
          `INSERT INTO solvencies (solvency_request_id,solvency_number,public_reference,vehicle_id,vehicle_snapshot,owner_snapshot,financial_snapshot,status,validity_rule_version_id,issued_by_user_id,issued_at,expires_at)
           VALUES (?,?,?,?,?,?,?,'VALID',?,?,?,?)`,
          [id, solvencyNumber, randomReference(), request.vehicle_id, JSON.stringify({ plate: eligibility.plate, registration: eligibility.registration, description: eligibility.vehicleDescription }), JSON.stringify({ citizenId: String(eligibility.ownerId), name: eligibility.ownerName, identification: eligibility.ownerIdentification }), JSON.stringify({ balance: eligibility.balance, debtCount: eligibility.debtCount, openAppeals: eligibility.openAppeals, pendingPayments: eligibility.pendingPayments, currency: "GTQ" }), rule.id, actor.userId, issuedAt, expiresAt],
        );
        await connection.query("INSERT INTO solvency_status_history (solvency_id,from_status,to_status,action,changed_by_user_id,request_id) VALUES (?,NULL,'VALID','ISSUE',?,?)", [created.insertId, actor.userId, actor.requestId]);
        return solvencyDto(await this.loadSolvency(connection, created.insertId));
      } catch (error) {
        if (isDuplicateKey(error)) throw new HttpError({ code: "SOLVENCY_DUPLICATE", message: "La solicitud o el vehículo ya tiene una solvencia vigente.", statusCode: 409 });
        throw error;
      }
    });
  }

  public async rejectRequest(id: number, reason: string, actor: Actor) {
    return this.database.withTransaction(async (connection) => {
      const request = await this.loadRequest(connection, id, true);
      if (request.status !== "PENDING_REVIEW") throw new HttpError({ code: "SOLVENCY_REQUEST_NOT_PENDING", message: "La solicitud ya fue resuelta.", statusCode: 409 });
      await connection.query("UPDATE solvency_requests SET status='REJECTED',reviewed_by_user_id=?,reviewed_at=UTC_TIMESTAMP(3),rejection_reason=? WHERE id=?", [actor.userId, reason, id]);
      await connection.query("INSERT INTO solvency_request_status_history (solvency_request_id,from_status,to_status,action,reason,changed_by_user_id,request_id) VALUES (?,'PENDING_REVIEW','REJECTED','REJECT',?,?,?)", [id, reason, actor.userId, actor.requestId]);
      return this.loadRequest(connection, id);
    });
  }

  public async getSolvency(id: number) { return solvencyDto(await this.loadSolvency(this.database, id)); }

  public async revokeSolvency(id: number, reason: string, actor: Actor) {
    return this.database.withTransaction(async (connection) => {
      const solvency = await this.loadSolvency(connection, id, true);
      if (solvency.status === "REVOKED") return solvencyDto(solvency);
      if (solvency.status === "EXPIRED") throw new HttpError({ code: "SOLVENCY_NOT_REVOCABLE", message: "La solvencia ya está vencida.", statusCode: 409 });
      await connection.query("UPDATE solvencies SET status='REVOKED',revoked_by_user_id=?,revoked_at=UTC_TIMESTAMP(3),revocation_reason=? WHERE id=?", [actor.userId, reason, id]);
      await connection.query("INSERT INTO solvency_status_history (solvency_id,from_status,to_status,action,reason,changed_by_user_id,request_id) VALUES (?,?,'REVOKED','REVOKE',?,?,?)", [id, solvency.status, reason, actor.userId, actor.requestId]);
      return solvencyDto(await this.loadSolvency(connection, id));
    });
  }

  public async verify(publicReference: string, actor: { userId: number; requestId: string } | null = null) {
    return this.database.withTransaction(async (connection) => {
      const [rows] = await connection.query<SolvencyRow[]>("SELECT * FROM solvencies WHERE public_reference=? FOR UPDATE", [publicReference]);
      const solvency = rows[0];
      if (!solvency) throw new HttpError({ code: "PUBLIC_SOLVENCY_NOT_FOUND", message: "No se encontró el documento solicitado.", statusCode: 404 });
      if (solvency.status === "VALID" && solvency.expires_at.getTime() <= Date.now()) {
        const historyActor = actor?.userId ?? (await systemActor(connection));
        await connection.query("UPDATE solvencies SET status='EXPIRED' WHERE id=?", [solvency.id]);
        await connection.query("INSERT INTO solvency_status_history (solvency_id,from_status,to_status,action,reason,changed_by_user_id,request_id) VALUES (?,'VALID','EXPIRED','AUTO_EXPIRE','Vencimiento de vigencia configurada',?,?)", [solvency.id, historyActor, actor?.requestId ?? "00000000-0000-0000-0000-000000000000"]);
        solvency.status = "EXPIRED";
      }
      return publicSolvencyDto(solvency);
    });
  }

  private async eligibility(connection: PoolConnection, vehicleId: number) {
    const [vehicles] = await connection.query<(RowDataPacket & { id: number; plate_original: string; registration_card: string; brand: string; vehicle_line: string; color: string; site_id: number; citizen_id: number; owner_name: string; owner_identification: string })[]>(
      `SELECT v.id,v.plate_original,v.registration_card,v.brand,v.vehicle_line,v.color,
              COALESCE((SELECT i.site_id FROM infractions i WHERE i.vehicle_id=v.id ORDER BY i.occurred_at DESC LIMIT 1),(SELECT id FROM sites WHERE is_active=1 ORDER BY id LIMIT 1)) site_id,
              c.id citizen_id,CONCAT(c.first_names,' ',c.last_names) owner_name,c.identification_number owner_identification
       FROM vehicles v JOIN vehicle_ownerships vo ON vo.vehicle_id=v.id AND vo.is_current=1
       JOIN citizens c ON c.id=vo.citizen_id AND c.status='ACTIVE'
       WHERE v.id=? AND v.status='ACTIVE' FOR UPDATE`, [vehicleId]);
    const vehicle = vehicles[0];
    if (!vehicle) throw new HttpError({ code: "SOLVENCY_VEHICLE_OR_OWNER_INVALID", message: "El vehículo activo y su propietario vigente son obligatorios.", statusCode: 409 });
    if (!vehicle.site_id) throw new HttpError({ code: "SOLVENCY_SITE_NOT_CONFIGURED", message: "No existe una sede activa para emitir la solvencia.", statusCode: 409 });
    const [infractions] = await connection.query<(RowDataPacket & { id: number })[]>("SELECT id FROM infractions WHERE vehicle_id=? AND status='VALIDADA' FOR UPDATE", [vehicleId]);
    let balance = 0n; let debtCount = 0;
    for (const infraction of infractions) { const value = await calculateBalance(connection, infraction.id); const pending = decimalToCents(value.pendingBalance); balance += pending; if (pending > 0n) debtCount += 1; }
    const [pendingRows] = await connection.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM payments p JOIN payment_orders po ON po.id=p.payment_order_id JOIN infractions i ON i.id=po.infraction_id
       WHERE i.vehicle_id=? AND p.status='REGISTERED'`, [vehicleId]);
    const [appealRows] = await connection.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM appeals a JOIN infractions i ON i.id=a.infraction_id
       WHERE i.vehicle_id=? AND a.status IN ('PRESENTADA','EN_REVISION','REQUIERE_INFORMACION')`, [vehicleId]);
    return { siteId: vehicle.site_id, plate: vehicle.plate_original, registration: vehicle.registration_card, vehicleDescription: `${vehicle.brand} ${vehicle.vehicle_line} · ${vehicle.color}`, ownerId: vehicle.citizen_id, ownerName: vehicle.owner_name, ownerIdentification: vehicle.owner_identification, balance: centsToDecimal(balance), debtCount, pendingPayments: pendingRows[0]?.total ?? 0, openAppeals: appealRows[0]?.total ?? 0 };
  }

  private async loadRequest(database: Queryable, id: number, lock = false): Promise<RequestRow> {
    const rows = await queryRows<RequestRow[]>(database, `SELECT * FROM solvency_requests WHERE id=?${lock ? " FOR UPDATE" : ""}`, [id]);
    if (!rows[0]) throw new HttpError({ code: "SOLVENCY_REQUEST_NOT_FOUND", message: "Solicitud de solvencia no encontrada.", statusCode: 404 });
    return rows[0];
  }

  private async loadSolvency(database: Queryable, id: number, lock = false): Promise<SolvencyRow> {
    const rows = await queryRows<SolvencyRow[]>(database, `SELECT * FROM solvencies WHERE id=?${lock ? " FOR UPDATE" : ""}`, [id]);
    if (!rows[0]) throw new HttpError({ code: "SOLVENCY_NOT_FOUND", message: "Solvencia no encontrada.", statusCode: 404 });
    return rows[0];
  }
}

type Queryable = MySqlDatabase | PoolConnection;
async function queryRows<T extends RowDataPacket[]>(database: Queryable, sql: string, values: unknown[]): Promise<T> { if ("withTransaction" in database) return database.query<T>(sql, values); const [rows] = await database.query<T>(sql, values); return rows; }
function assertEligible(value: { balance: string; pendingPayments: number; openAppeals: number }) {
  if (decimalToCents(value.balance) > 0n) throw new HttpError({ code: "SOLVENCY_OUTSTANDING_BALANCE", message: "No se puede emitir una solvencia con saldo pendiente.", statusCode: 409 });
  if (value.pendingPayments > 0) throw new HttpError({ code: "SOLVENCY_PENDING_PAYMENT", message: "Existe un pago registrado aún no confirmado.", statusCode: 409 });
  if (value.openAppeals > 0) throw new HttpError({ code: "SOLVENCY_OPEN_APPEAL", message: "Una impugnación abierta bloquea la emisión hasta su resolución.", statusCode: 409 });
}
async function nextDocumentNumber(connection: PoolConnection, siteId: number, documentType: string, year: number): Promise<string> { const [rows] = await connection.query<(RowDataPacket & { id: number; prefix: string; next_number: number; padding_length: number })[]>("SELECT id,prefix,next_number,padding_length FROM document_sequences WHERE site_id=? AND document_type=? AND sequence_year=? FOR UPDATE", [siteId, documentType, year]); const row = rows[0]; if (!row) throw new HttpError({ code: "DOCUMENT_SEQUENCE_NOT_CONFIGURED", message: `El correlativo ${documentType} no está configurado para la sede y año.`, statusCode: 409 }); await connection.query("UPDATE document_sequences SET next_number=next_number+1 WHERE id=?", [row.id]); return `${row.prefix}${String(row.next_number).padStart(row.padding_length, "0")}`; }
function solvencyDto(row: SolvencyRow) { return { id: String(row.id), requestId: String(row.solvency_request_id), solvencyNumber: row.solvency_number, publicReference: row.public_reference, vehicleId: String(row.vehicle_id), vehicleSnapshot: parseJson(row.vehicle_snapshot), ownerSnapshot: parseJson(row.owner_snapshot), financialSnapshot: parseJson(row.financial_snapshot), status: row.status, issuedAt: row.issued_at, expiresAt: row.expires_at, revokedAt: row.revoked_at, revocationReason: row.revocation_reason, observedAt: row.observed_at, observationReason: row.observation_reason }; }
function publicSolvencyDto(row: SolvencyRow) { return { solvencyNumber: row.solvency_number, publicReference: row.public_reference, status: row.status, valid: row.status === "VALID" && row.expires_at.getTime() > Date.now(), issuedAt: row.issued_at, expiresAt: row.expires_at, notice: row.status === "VALID" ? "Documento vigente." : "Documento no válido." }; }
function parseJson(value: string | object) { return typeof value === "string" ? JSON.parse(value) as unknown : value; }
function randomReference() { return randomBytes(20).toString("hex"); }
function isDuplicateKey(error: unknown) { return typeof error === "object" && error !== null && "errno" in error && error.errno === 1062; }
async function systemActor(connection: PoolConnection): Promise<number> { const [rows] = await connection.query<(RowDataPacket & { id: number })[]>("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.status='ACTIVE' AND r.code='ADMIN' ORDER BY u.id LIMIT 1"); if (!rows[0]) throw new HttpError({ code: "SOLVENCY_STATUS_UPDATE_UNAVAILABLE", message: "No fue posible actualizar el estado del documento.", statusCode: 503 }); return rows[0].id; }
