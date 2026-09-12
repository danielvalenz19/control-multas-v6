import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import express, { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import type { AppContainer } from "../../../bootstrap/container.js";
import { centsToDecimal, decimalToCents } from "../../../shared/domain/Money.js";
import { HttpError } from "../../../shared/http/HttpError.js";
import { authorize, authorizeAny } from "../../../shared/http/authorize.js";
import { getRequestId } from "../../../shared/http/request-context.js";
import { recordOperation } from "../../../shared/http/operations.js";
import { inspectPrivateEvidence } from "../../../shared/http/private-evidence.js";

const listInput = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(["PRESENTADA", "EN_REVISION", "REQUIERE_INFORMACION", "RESUELTA_CONFIRMADA", "RESUELTA_MODIFICADA", "RESUELTA_ANULADA", "DESISTIDA"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const appealCreate = z.object({
  infractionId: z.coerce.number().int().positive(),
  appellantCitizenId: z.coerce.number().int().positive().nullable().optional(),
  appellantName: z.string().trim().min(2).max(300).optional(),
  appellantIdentification: z.string().trim().max(150).nullable().optional(),
  filedAt: z.iso.datetime({ offset: true }).optional(),
  reason: z.string().trim().min(3).max(500),
  description: z.string().trim().min(10).max(10_000),
});

const appealUpdate = appealCreate.pick({
  appellantCitizenId: true,
  appellantName: true,
  appellantIdentification: true,
  reason: true,
  description: true,
}).partial().refine((value) => Object.keys(value).length > 0);

const commentInput = z.object({ comment: z.string().trim().min(5).max(1000) });
const resolutionInput = z.object({
  decision: z.enum(["CONFIRM", "MODIFY", "ANNUL"]),
  summary: z.string().trim().min(10).max(10_000),
  legalBasis: z.string().trim().min(3).max(500),
  resolvedAmount: z.string().regex(/^\d+(?:\.\d{1,2})?$/).optional(),
}).superRefine((value, context) => {
  if (value.decision === "MODIFY" && value.resolvedAmount === undefined) {
    context.addIssue({ code: "custom", path: ["resolvedAmount"], message: "El monto resuelto es obligatorio al modificar." });
  }
});

type AppealRow = RowDataPacket & {
  id: number;
  appeal_number: string;
  infraction_id: number;
  status: string;
  created_by_user_id: number;
  appellant_name_snapshot: string;
};

export function createAppealRouter(container: AppContainer): Router {
  const router = Router();

  router.get("/", authorize("appeals.read", container.auditRepository), async (request, response, next) => {
    try {
      const input = listInput.parse(request.query);
      const clauses: string[] = [];
      const values: unknown[] = [];
      if (input.status) { clauses.push("a.status=?"); values.push(input.status); }
      if (input.search) {
        const like = `%${input.search}%`;
        clauses.push("(a.appeal_number LIKE ? OR i.ticket_number LIKE ? OR a.appellant_name_snapshot LIKE ? OR a.reason LIKE ?)");
        values.push(like, like, like, like);
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const totals = await container.database.query<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) total FROM appeals a JOIN infractions i ON i.id=a.infraction_id ${where}`, values);
      const rows = await container.database.query<RowDataPacket[]>(
        `SELECT a.id,a.appeal_number,a.infraction_id,i.ticket_number,a.appellant_name_snapshot,a.filed_at,a.reason,a.status,a.deadline_at,a.deadline_configuration_status,
                a.municipal_assignee_user_id,CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,'')) assignee_name,a.created_at
         FROM appeals a JOIN infractions i ON i.id=a.infraction_id
         LEFT JOIN users u ON u.id=a.municipal_assignee_user_id
         ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
        [...values, input.pageSize, (input.page - 1) * input.pageSize],
      );
      response.json({ data: rows, meta: { page: input.page, pageSize: input.pageSize, total: totals[0]?.total ?? 0, requestId: getRequestId() } });
    } catch (error) { next(error); }
  });

  router.get("/:id", authorize("appeals.read", container.auditRepository), async (request, response, next) => {
    try {
      const id = positiveId(request.params["id"]);
      const rows = await container.database.query<RowDataPacket[]>(
        `SELECT a.*,i.ticket_number,i.case_number,i.status infraction_status,i.total_amount original_amount,
                CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,'')) assignee_name,
                CONCAT(COALESCE(r.first_name,''),' ',COALESCE(r.last_name,'')) resolved_by_name
         FROM appeals a JOIN infractions i ON i.id=a.infraction_id
         LEFT JOIN users u ON u.id=a.municipal_assignee_user_id LEFT JOIN users r ON r.id=a.resolved_by_user_id WHERE a.id=?`,
        [id],
      );
      if (!rows[0]) throw notFound();
      const [evidence, history, adjustments] = await Promise.all([
        container.database.query<RowDataPacket[]>("SELECT id,original_name,mime_type,size_bytes,checksum_sha256,status,created_at FROM appeal_evidence WHERE appeal_id=? ORDER BY created_at", [id]),
        container.database.query<RowDataPacket[]>("SELECT h.*,u.username changed_by FROM appeal_status_history h JOIN users u ON u.id=h.changed_by_user_id WHERE h.appeal_id=? ORDER BY h.created_at,h.id", [id]),
        container.database.query<RowDataPacket[]>("SELECT id,adjustment_type,direction,amount,status,reason,authorization_reference,requested_at FROM infraction_adjustments WHERE source_appeal_id=? ORDER BY requested_at", [id]),
      ]);
      response.json({ data: { ...rows[0], evidence, history, adjustments }, meta: { requestId: getRequestId() } });
    } catch (error) { next(error); }
  });

  router.post("/", authorize("appeals.create", container.auditRepository), async (request, response, next) => {
    try {
      const input = appealCreate.parse(request.body);
      const actorId = Number(request.auth?.user.id);
      const filedAt = input.filedAt ? new Date(input.filedAt) : new Date();
      const created = await container.database.withTransaction(async (connection) => {
        const [infractions] = await connection.query<(RowDataPacket & { site_id: number; status: string; citizen_name_snapshot: string | null; citizen_identification_snapshot: string | null })[]>(
          "SELECT site_id,status,citizen_name_snapshot,citizen_identification_snapshot FROM infractions WHERE id=? FOR UPDATE", [input.infractionId],
        );
        const infraction = infractions[0];
        if (!infraction) throw new HttpError({ code: "INFRACTION_NOT_FOUND", message: "Infracción no encontrada.", statusCode: 404 });
        if (infraction.status !== "VALIDADA") throw new HttpError({ code: "APPEAL_INFRACTION_NOT_VALIDATED", message: "Solo una infracción validada puede impugnarse.", statusCode: 409 });
        let name = input.appellantName ?? infraction.citizen_name_snapshot;
        let identification = input.appellantIdentification ?? infraction.citizen_identification_snapshot;
        if (input.appellantCitizenId) {
          const [citizens] = await connection.query<(RowDataPacket & { name: string; identification: string })[]>(
            "SELECT CONCAT(first_names,' ',last_names) name,identification_number identification FROM citizens WHERE id=? AND status='ACTIVE'", [input.appellantCitizenId],
          );
          if (!citizens[0]) throw new HttpError({ code: "APPELLANT_NOT_FOUND", message: "Interesado activo no encontrado.", statusCode: 404 });
          name = citizens[0].name;
          identification = citizens[0].identification;
        }
        if (!name) throw new HttpError({ code: "APPELLANT_REQUIRED", message: "Debe identificar al interesado.", statusCode: 422 });
        const appealNumber = await nextDocumentNumber(connection, infraction.site_id, "APPEAL", filedAt.getUTCFullYear());
        const [rules] = await connection.query<(RowDataPacket & { id: number; value_integer: number })[]>(
          `SELECT id,value_integer FROM institutional_rule_versions
           WHERE rule_code='APPEAL_DEADLINE_DAYS' AND value_type='INTEGER' AND value_integer>0
             AND effective_from<=? AND (effective_to IS NULL OR effective_to>?)
           ORDER BY effective_from DESC,id DESC LIMIT 1`, [filedAt, filedAt],
        );
        const rule = rules[0];
        const deadline = rule ? new Date(filedAt.getTime() + rule.value_integer * 86_400_000) : null;
        const [result] = await connection.query<ResultSetHeader>(
          `INSERT INTO appeals (appeal_number,infraction_id,appellant_citizen_id,appellant_name_snapshot,appellant_identification_snapshot,filed_at,reason,description,deadline_at,deadline_rule_version_id,deadline_configuration_status,created_by_user_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [appealNumber, input.infractionId, input.appellantCitizenId ?? null, name, identification ?? null, filedAt, input.reason, input.description, deadline, rule?.id ?? null, rule ? "CONFIGURED" : "PENDING_CONFIRMATION", actorId],
        );
        await connection.query("INSERT INTO appeal_status_history (appeal_id,from_status,to_status,action,changed_by_user_id) VALUES (?,NULL,'PRESENTADA','CREATE',?)", [result.insertId, actorId]);
        return { id: String(result.insertId), appealNumber, deadlineAt: deadline?.toISOString() ?? null, deadlineConfigurationStatus: rule ? "CONFIGURED" : "PENDING_CONFIRMATION" };
      });
      await recordOperation(container, request, { action: "APPEAL_CREATED", module: "appeals", entityType: "appeal", entityId: created.id, newValues: created });
      await container.notifications.emit({ eventCode: "APPEAL_FILED", recipientUserIds: await container.notifications.recipientsForPermissions(["appeals.review"]), deduplicationKey: `appeal-filed:${created.id}`, resourceType: "appeal", resourceId: created.id, securePath: `/admin/impugnaciones/${created.id}` });
      response.status(201).json({ data: created, meta: { requestId: getRequestId() } });
    } catch (error) { next(error); }
  });

  router.patch("/:id", authorize("appeals.create", container.auditRepository), async (request, response, next) => {
    try {
      const id = positiveId(request.params["id"]);
      const input = appealUpdate.parse(request.body);
      const actorId = Number(request.auth?.user.id);
      await container.database.withTransaction(async (connection) => {
        const [rows] = await connection.query<AppealRow[]>("SELECT * FROM appeals WHERE id=? FOR UPDATE", [id]);
        const row = rows[0];
        if (!row) throw notFound();
        if (!request.auth?.user.roles.includes("ADMIN") && row.created_by_user_id !== actorId) throw new HttpError({ code: "APPEAL_NOT_OWNED", message: "Solo puede corregir sus propias impugnaciones.", statusCode: 403 });
        if (!["PRESENTADA", "REQUIERE_INFORMACION"].includes(row.status)) throw invalidTransition();
        const columns: string[] = [];
        const values: unknown[] = [];
        const mapping = { appellantCitizenId: "appellant_citizen_id", appellantName: "appellant_name_snapshot", appellantIdentification: "appellant_identification_snapshot", reason: "reason", description: "description" } as const;
        for (const [key, column] of Object.entries(mapping) as [keyof typeof mapping, string][]) {
          if (input[key] !== undefined) { columns.push(`${column}=?`); values.push(input[key]); }
        }
        await connection.query(`UPDATE appeals SET ${columns.join(",")} WHERE id=?`, [...values, id]);
      });
      await recordOperation(container, request, { action: "APPEAL_UPDATED", module: "appeals", entityType: "appeal", entityId: String(id), newValues: input });
      response.sendStatus(204);
    } catch (error) { next(error); }
  });

  router.post("/:id/submit", authorizeAny(["appeals.create", "appeals.review"], container.auditRepository), async (request, response, next) => {
    try {
      const id = positiveId(request.params["id"]);
      await transitionAppeal(container, request, id, ["PRESENTADA", "REQUIERE_INFORMACION"], "EN_REVISION", "SUBMIT", null, true);
      response.sendStatus(204);
    } catch (error) { next(error); }
  });

  router.post("/:id/request-information", authorize("appeals.review", container.auditRepository), async (request, response, next) => {
    try {
      const id = positiveId(request.params["id"]);
      const input = commentInput.parse(request.body);
      await transitionAppeal(container, request, id, ["EN_REVISION"], "REQUIERE_INFORMACION", "REQUEST_INFORMATION", input.comment, false);
      response.sendStatus(204);
    } catch (error) { next(error); }
  });

  router.post("/:id/withdraw", authorizeAny(["appeals.create", "appeals.review"], container.auditRepository), async (request, response, next) => {
    try {
      const id = positiveId(request.params["id"]);
      const input = commentInput.parse(request.body);
      await transitionAppeal(container, request, id, ["PRESENTADA", "EN_REVISION", "REQUIERE_INFORMACION"], "DESISTIDA", "WITHDRAW", input.comment, false);
      response.sendStatus(204);
    } catch (error) { next(error); }
  });

  router.post("/:id/resolve", authorize("appeals.resolve", container.auditRepository), async (request, response, next) => {
    try {
      const id = positiveId(request.params["id"]);
      const input = resolutionInput.parse(request.body);
      const actorId = Number(request.auth?.user.id);
      const outcome = await container.database.withTransaction(async (connection) => {
        const [rows] = await connection.query<(AppealRow & { infraction_status: string; original_amount: string })[]>(
          "SELECT a.*,i.status infraction_status,i.total_amount original_amount FROM appeals a JOIN infractions i ON i.id=a.infraction_id WHERE a.id=? FOR UPDATE", [id],
        );
        const appeal = rows[0];
        if (!appeal) throw notFound();
        if (appeal.status !== "EN_REVISION") throw invalidTransition();
        if (appeal.created_by_user_id === actorId) throw new HttpError({ code: "APPEAL_SELF_RESOLUTION_FORBIDDEN", message: "La persona que registró la impugnación no puede resolverla.", statusCode: 409 });
        if (appeal.infraction_status !== "VALIDADA") throw new HttpError({ code: "APPEAL_INFRACTION_STATE_INVALID", message: "La infracción ya no admite esta resolución.", statusCode: 409 });
        const status = { CONFIRM: "RESUELTA_CONFIRMADA", MODIFY: "RESUELTA_MODIFICADA", ANNUL: "RESUELTA_ANULADA" }[input.decision];
        let adjustmentId: string | null = null;
        if (input.decision === "MODIFY") {
          const target = decimalToCents(input.resolvedAmount ?? "0");
          const [balanceRows] = await connection.query<(RowDataPacket & { current_balance: string })[]>(
            `SELECT GREATEST(0,i.total_amount + COALESCE(SUM(CASE WHEN a.status IN ('APPROVED','REVERSED') THEN IF(a.direction='DEBIT',a.amount,-a.amount) ELSE 0 END),0)) current_balance
             FROM infractions i LEFT JOIN infraction_adjustments a ON a.infraction_id=i.id WHERE i.id=? GROUP BY i.id`, [appeal.infraction_id],
          );
          const current = decimalToCents(balanceRows[0]?.current_balance ?? appeal.original_amount);
          const difference = target - current;
          if (difference !== 0n) {
            const [result] = await connection.query<ResultSetHeader>(
              `INSERT INTO infraction_adjustments (infraction_id,adjustment_type,direction,amount,reason,legal_basis,authorization_reference,status,source_appeal_id,requested_by_user_id,decided_by_user_id,decision_comment,decided_at)
               VALUES (?,'AMOUNT_CORRECTION',?,?,?,?,?,'APPROVED',?,?,?,?,UTC_TIMESTAMP(3))`,
              [appeal.infraction_id, difference > 0n ? "DEBIT" : "CREDIT", centsToDecimal(difference > 0n ? difference : -difference), `Resolución de impugnación ${appeal.appeal_number}`, input.legalBasis, appeal.appeal_number, id, appeal.created_by_user_id, actorId, input.summary],
            );
            adjustmentId = String(result.insertId);
            await connection.query("INSERT INTO infraction_adjustment_history (adjustment_id,from_status,to_status,action,comment,changed_by_user_id) VALUES (?,NULL,'APPROVED','APPEAL_RESOLUTION',?,?)", [result.insertId, input.summary, actorId]);
          }
        }
        if (input.decision === "ANNUL") {
          await connection.query("UPDATE infractions SET status='ANULADA' WHERE id=?", [appeal.infraction_id]);
          await connection.query("INSERT INTO infraction_status_history (infraction_id,from_status,to_status,action,comment,changed_by_user_id) VALUES (?,'VALIDADA','ANULADA','APPEAL_RESOLUTION_CANCEL',?,?)", [appeal.infraction_id, input.summary, actorId]);
        } else {
          await connection.query("INSERT INTO infraction_status_history (infraction_id,from_status,to_status,action,comment,changed_by_user_id) VALUES (?,'VALIDADA','VALIDADA',?, ?,?)", [appeal.infraction_id, input.decision === "MODIFY" ? "APPEAL_RESOLUTION_MODIFY" : "APPEAL_RESOLUTION_CONFIRM", input.summary, actorId]);
        }
        await connection.query(
          "UPDATE appeals SET status=?,resolution_type=?,resolution_summary=?,resolution_legal_basis=?,resolved_amount=?,resolved_at=UTC_TIMESTAMP(3),resolved_by_user_id=?,municipal_assignee_user_id=COALESCE(municipal_assignee_user_id,?) WHERE id=?",
          [status, input.decision, input.summary, input.legalBasis, input.resolvedAmount ?? null, actorId, actorId, id],
        );
        await connection.query("INSERT INTO appeal_status_history (appeal_id,from_status,to_status,action,comment,changed_by_user_id) VALUES (?,'EN_REVISION',?,'RESOLVE',?,?)", [id, status, input.summary, actorId]);
        return { status, adjustmentId, infractionId: String(appeal.infraction_id) };
      });
      await recordOperation(container, request, { action: "APPEAL_RESOLVED", module: "appeals", entityType: "appeal", entityId: String(id), previousValues: { status: "EN_REVISION" }, newValues: outcome, reason: input.summary });
      const appealRecipients = await container.database.query<(RowDataPacket & { created_by_user_id: string | number })[]>("SELECT created_by_user_id FROM appeals WHERE id=?", [id]);
      await container.notifications.emit({ eventCode: "APPEAL_RESOLVED", recipientUserIds: [appealRecipients[0]?.created_by_user_id ?? ""], deduplicationKey: `appeal-resolved:${id}`, resourceType: "appeal", resourceId: id, securePath: `/admin/impugnaciones/${id}` });
      response.json({ data: outcome, meta: { requestId: getRequestId() } });
    } catch (error) { next(error); }
  });

  router.post("/:id/evidence", authorizeAny(["appeals.create", "appeals.review"], container.auditRepository), express.raw({ type: ["image/jpeg", "image/png", "application/pdf"], limit: container.env.MAX_EVIDENCE_BYTES }), async (request, response, next) => {
    let path: string | null = null;
    try {
      const id = positiveId(request.params["id"]);
      if (!Buffer.isBuffer(request.body)) throw new HttpError({ code: "EVIDENCE_BODY_REQUIRED", message: "Debe adjuntar un archivo binario.", statusCode: 422 });
      const metadata = inspectPrivateEvidence(request.get("x-file-name") ?? undefined, request.get("content-type") ?? undefined, request.body, container.env.MAX_EVIDENCE_BYTES, `appeals/${id}`);
      const appeals = await container.database.query<AppealRow[]>("SELECT * FROM appeals WHERE id=?", [id]);
      if (!appeals[0]) throw notFound();
      path = resolve(container.env.PRIVATE_UPLOAD_DIR, metadata.storageKey);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, request.body, { flag: "wx" });
      const result = await container.database.query<ResultSetHeader>(
        "INSERT INTO appeal_evidence (appeal_id,storage_key,original_name,mime_type,file_extension,size_bytes,checksum_sha256,uploaded_by_user_id) VALUES (?,?,?,?,?,?,?,?)",
        [id, metadata.storageKey, metadata.originalName, metadata.mimeType, metadata.extension, metadata.sizeBytes, metadata.checksum, request.auth?.user.id],
      );
      await recordOperation(container, request, { action: "APPEAL_EVIDENCE_CREATED", module: "appeals", entityType: "appeal_evidence", entityId: String(result.insertId), newValues: { appealId: id, checksum: metadata.checksum, sizeBytes: metadata.sizeBytes } });
      response.status(201).json({ data: { id: String(result.insertId), checksum: metadata.checksum, sizeBytes: metadata.sizeBytes }, meta: { requestId: getRequestId() } });
    } catch (error) {
      if (path) await unlink(path).catch(() => undefined);
      next(error);
    }
  });

  router.get("/:id/evidence/:evidenceId", authorize("appeals.read", container.auditRepository), async (request, response, next) => {
    try {
      const id = positiveId(request.params["id"]);
      const evidenceId = positiveId(request.params["evidenceId"]);
      const rows = await container.database.query<(RowDataPacket & { storage_key: string; original_name: string; mime_type: string })[]>(
        "SELECT storage_key,original_name,mime_type FROM appeal_evidence WHERE id=? AND appeal_id=? AND status='ACTIVE'", [evidenceId, id],
      );
      const row = rows[0];
      if (!row) throw new HttpError({ code: "APPEAL_EVIDENCE_NOT_FOUND", message: "Documento no encontrado.", statusCode: 404 });
      response.setHeader("Content-Type", row.mime_type);
      response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.original_name)}`);
      response.setHeader("Cache-Control", "private, no-store");
      response.send(await readFile(resolve(container.env.PRIVATE_UPLOAD_DIR, row.storage_key)));
    } catch (error) { next(error); }
  });

  router.get("/:id/timeline", authorize("appeals.read", container.auditRepository), async (request, response, next) => {
    try {
      const id = positiveId(request.params["id"]);
      const rows = await container.database.query<RowDataPacket[]>("SELECT h.*,u.username changed_by FROM appeal_status_history h JOIN users u ON u.id=h.changed_by_user_id WHERE h.appeal_id=? ORDER BY h.created_at,h.id", [id]);
      if (!rows.length) throw notFound();
      response.json({ data: rows, meta: { requestId: getRequestId() } });
    } catch (error) { next(error); }
  });

  return router;
}

async function transitionAppeal(container: AppContainer, request: express.Request, id: number, from: string[], to: string, action: string, comment: string | null, assignActor: boolean): Promise<void> {
  const actorId = Number(request.auth?.user.id);
  await container.database.withTransaction(async (connection) => {
    const [rows] = await connection.query<AppealRow[]>("SELECT * FROM appeals WHERE id=? FOR UPDATE", [id]);
    const row = rows[0];
    if (!row) throw notFound();
    if (!from.includes(row.status)) throw invalidTransition();
    await connection.query(`UPDATE appeals SET status=?${assignActor ? ",municipal_assignee_user_id=COALESCE(municipal_assignee_user_id,?)" : ""} WHERE id=?`, assignActor ? [to, actorId, id] : [to, id]);
    await connection.query("INSERT INTO appeal_status_history (appeal_id,from_status,to_status,action,comment,changed_by_user_id) VALUES (?,?,?,?,?,?)", [id, row.status, to, action, comment, actorId]);
  });
  await recordOperation(container, request, { action: `APPEAL_${action}`, module: "appeals", entityType: "appeal", entityId: String(id), previousValues: { status: from }, newValues: { status: to }, ...(comment ? { reason: comment } : {}) });
}

async function nextDocumentNumber(connection: import("mysql2/promise").PoolConnection, siteId: number, documentType: string, year: number): Promise<string> {
  const [rows] = await connection.query<(RowDataPacket & { id: number; prefix: string; next_number: number; padding_length: number })[]>(
    "SELECT id,prefix,next_number,padding_length FROM document_sequences WHERE site_id=? AND document_type=? AND sequence_year=? FOR UPDATE", [siteId, documentType, year],
  );
  const row = rows[0];
  if (!row) throw new HttpError({ code: `${documentType}_SEQUENCE_NOT_CONFIGURED`, message: "El correlativo institucional no está configurado para la sede y el año.", statusCode: 409 });
  await connection.query("UPDATE document_sequences SET next_number=next_number+1 WHERE id=?", [row.id]);
  return `${row.prefix}${String(row.next_number).padStart(row.padding_length, "0")}`;
}

function positiveId(value: unknown): number { return z.coerce.number().int().positive().parse(value); }
function notFound(): HttpError { return new HttpError({ code: "APPEAL_NOT_FOUND", message: "Impugnación no encontrada.", statusCode: 404 }); }
function invalidTransition(): HttpError { return new HttpError({ code: "APPEAL_TRANSITION_INVALID", message: "La transición de la impugnación no está permitida.", statusCode: 409 }); }
