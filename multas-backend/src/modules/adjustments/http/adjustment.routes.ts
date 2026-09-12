import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import type { AppContainer } from "../../../bootstrap/container.js";
import { decimalToCents, normalizeMoney } from "../../../shared/domain/Money.js";
import { HttpError } from "../../../shared/http/HttpError.js";
import { authorize, authorizeAny } from "../../../shared/http/authorize.js";
import { getRequestId } from "../../../shared/http/request-context.js";
import { recordOperation } from "../../../shared/http/operations.js";
import { BalanceService, MySqlPaymentsLedger } from "../../finance/application/BalanceService.js";

const moneyInput = z.string().regex(/^\d+(?:\.\d{1,2})?$/).refine((value) => decimalToCents(value) > 0n, "El monto debe ser mayor que cero.");
const adjustmentInput = z.object({
  type: z.enum(["DISCOUNT", "PARTIAL_EXEMPTION", "TOTAL_EXEMPTION", "SURCHARGE", "AMOUNT_CORRECTION"]),
  direction: z.enum(["CREDIT", "DEBIT"]).optional(),
  amount: moneyInput,
  reason: z.string().trim().min(5).max(500),
  legalBasis: z.string().trim().max(500).nullable().optional(),
  authorizationReference: z.string().trim().min(3).max(200),
}).superRefine((value, context) => {
  const expected = ["DISCOUNT", "PARTIAL_EXEMPTION", "TOTAL_EXEMPTION"].includes(value.type) ? "CREDIT" : value.type === "SURCHARGE" ? "DEBIT" : null;
  if (expected && value.direction && value.direction !== expected) context.addIssue({ code: "custom", path: ["direction"], message: "La dirección no corresponde al tipo de ajuste." });
  if (value.type === "AMOUNT_CORRECTION" && !value.direction) context.addIssue({ code: "custom", path: ["direction"], message: "La corrección debe indicar crédito o débito." });
});
const decisionInput = z.object({ comment: z.string().trim().min(5).max(1000) });

type AdjustmentRow = RowDataPacket & {
  id: number;
  infraction_id: number;
  adjustment_type: string;
  direction: "CREDIT" | "DEBIT";
  amount: string;
  reason: string;
  legal_basis: string | null;
  authorization_reference: string;
  status: string;
  requested_by_user_id: number;
};

export function createAdjustmentRouter(container: AppContainer): Router {
  const router = Router();
  const balances = new BalanceService(container.database, new MySqlPaymentsLedger(container.database));

  router.get("/:id/adjustments", authorizeAny(["adjustments.create", "adjustments.approve", "adjustments.reverse", "infractions.read"], container.auditRepository), async (request, response, next) => {
    try {
      const infractionId = positiveId(request.params["id"]);
      const rows = await container.database.query<RowDataPacket[]>(
        `SELECT a.*,requester.username requested_by,decider.username decided_by
         FROM infraction_adjustments a JOIN users requester ON requester.id=a.requested_by_user_id
         LEFT JOIN users decider ON decider.id=a.decided_by_user_id
         WHERE a.infraction_id=? ORDER BY a.requested_at,a.id`, [infractionId],
      );
      const history = await container.database.query<RowDataPacket[]>(
        `SELECT h.*,u.username changed_by FROM infraction_adjustment_history h
         JOIN infraction_adjustments a ON a.id=h.adjustment_id JOIN users u ON u.id=h.changed_by_user_id
         WHERE a.infraction_id=? ORDER BY h.created_at,h.id`, [infractionId],
      );
      response.json({ data: { balance: await balances.calculate(infractionId), adjustments: rows, history }, meta: { requestId: getRequestId() } });
    } catch (error) { next(error); }
  });

  router.post("/:id/adjustments", authorize("adjustments.create", container.auditRepository), async (request, response, next) => {
    try {
      const infractionId = positiveId(request.params["id"]);
      const input = adjustmentInput.parse(request.body);
      const direction = input.direction ?? (["DISCOUNT", "PARTIAL_EXEMPTION", "TOTAL_EXEMPTION"].includes(input.type) ? "CREDIT" : "DEBIT");
      const balance = await balances.calculate(infractionId);
      const pendingCents = decimalToCents(balance.pendingBalance);
      const amountCents = decimalToCents(input.amount);
      const states = await container.database.query<(RowDataPacket & { status: string })[]>("SELECT status FROM infractions WHERE id=?", [infractionId]);
      if (states[0]?.status !== "VALIDADA") throw new HttpError({ code: "ADJUSTMENT_INFRACTION_STATE_INVALID", message: "Solo una infracción validada admite ajustes económicos.", statusCode: 409 });
      if (direction === "CREDIT" && amountCents > pendingCents) throw new HttpError({ code: "ADJUSTMENT_EXCEEDS_BALANCE", message: "El crédito no puede superar el saldo pendiente.", statusCode: 409 });
      if (input.type === "TOTAL_EXEMPTION" && amountCents !== pendingCents) throw new HttpError({ code: "TOTAL_EXEMPTION_AMOUNT_INVALID", message: "La exoneración total debe coincidir exactamente con el saldo actual.", statusCode: 409 });
      const result = await container.database.withTransaction(async (connection) => {
        const [created] = await connection.query<ResultSetHeader>(
          `INSERT INTO infraction_adjustments (infraction_id,adjustment_type,direction,amount,reason,legal_basis,authorization_reference,requested_by_user_id)
           VALUES (?,?,?,?,?,?,?,?)`,
          [infractionId, input.type, direction, normalizeMoney(input.amount), input.reason, input.legalBasis ?? null, input.authorizationReference, request.auth?.user.id],
        );
        await connection.query("INSERT INTO infraction_adjustment_history (adjustment_id,from_status,to_status,action,comment,changed_by_user_id) VALUES (?,NULL,'PENDING_APPROVAL','CREATE',?,?)", [created.insertId, input.reason, request.auth?.user.id]);
        return String(created.insertId);
      });
      await recordOperation(container, request, { action: "ADJUSTMENT_CREATED", module: "adjustments", entityType: "infraction_adjustment", entityId: result, newValues: { infractionId, type: input.type, direction, amount: normalizeMoney(input.amount) }, reason: input.reason });
      await container.notifications.emit({ eventCode: "ADJUSTMENT_PENDING", recipientUserIds: await container.notifications.recipientsForPermissions(["adjustments.approve"]), deduplicationKey: `adjustment-pending:${result}`, resourceType: "infraction_adjustment", resourceId: result, securePath: `/admin/infracciones/${infractionId}` });
      response.status(201).json({ data: { id: result, status: "PENDING_APPROVAL" }, meta: { requestId: getRequestId() } });
    } catch (error) { next(error); }
  });

  for (const [action, status] of [["approve", "APPROVED"], ["reject", "REJECTED"]] as const) {
    router.post(`/:id/adjustments/:adjustmentId/${action}`, authorize("adjustments.approve", container.auditRepository), async (request, response, next) => {
      try {
        const infractionId = positiveId(request.params["id"]);
        const adjustmentId = positiveId(request.params["adjustmentId"]);
        const input = decisionInput.parse(request.body);
        const actorId = Number(request.auth?.user.id);
        const decided = await container.database.withTransaction(async (connection) => {
          const [rows] = await connection.query<AdjustmentRow[]>("SELECT * FROM infraction_adjustments WHERE id=? AND infraction_id=? FOR UPDATE", [adjustmentId, infractionId]);
          const row = rows[0];
          if (!row) throw notFound();
          if (row.status !== "PENDING_APPROVAL") throw invalidTransition();
          if (row.requested_by_user_id === actorId) throw new HttpError({ code: "ADJUSTMENT_SELF_APPROVAL_FORBIDDEN", message: "La persona solicitante no puede decidir su propio ajuste.", statusCode: 409 });
          if (status === "APPROVED" && row.direction === "CREDIT") {
            const current = await balanceInConnection(connection, infractionId);
            const amount = decimalToCents(row.amount);
            if (amount > current || (row.adjustment_type === "TOTAL_EXEMPTION" && amount !== current)) throw new HttpError({ code: "ADJUSTMENT_BALANCE_CHANGED", message: "El saldo cambió; revise el ajuste antes de aprobarlo.", statusCode: 409 });
          }
          await connection.query("UPDATE infraction_adjustments SET status=?,decided_by_user_id=?,decision_comment=?,decided_at=UTC_TIMESTAMP(3) WHERE id=?", [status, actorId, input.comment, adjustmentId]);
          await connection.query("INSERT INTO infraction_adjustment_history (adjustment_id,from_status,to_status,action,comment,changed_by_user_id) VALUES (?,'PENDING_APPROVAL',?,?,?,?)", [adjustmentId, status, action.toUpperCase(), input.comment, actorId]);
          return row;
        });
        await recordOperation(container, request, { action: `ADJUSTMENT_${action.toUpperCase()}`, module: "adjustments", entityType: "infraction_adjustment", entityId: String(adjustmentId), previousValues: { status: "PENDING_APPROVAL" }, newValues: { status }, reason: input.comment });
        response.json({ data: { id: String(decided.id), status, balance: await balances.calculate(infractionId) }, meta: { requestId: getRequestId() } });
      } catch (error) { next(error); }
    });
  }

  router.post("/:id/adjustments/:adjustmentId/reverse", authorize("adjustments.reverse", container.auditRepository), async (request, response, next) => {
    try {
      const infractionId = positiveId(request.params["id"]);
      const adjustmentId = positiveId(request.params["adjustmentId"]);
      const input = decisionInput.parse(request.body);
      const actorId = Number(request.auth?.user.id);
      const reversalId = await container.database.withTransaction(async (connection) => {
        const [rows] = await connection.query<AdjustmentRow[]>("SELECT * FROM infraction_adjustments WHERE id=? AND infraction_id=? FOR UPDATE", [adjustmentId, infractionId]);
        const row = rows[0];
        if (!row) throw notFound();
        if (row.status !== "APPROVED" || row.adjustment_type === "REVERSAL") throw invalidTransition();
        if (row.requested_by_user_id === actorId) throw new HttpError({ code: "ADJUSTMENT_SELF_REVERSAL_FORBIDDEN", message: "La persona solicitante no puede revertir su propio ajuste.", statusCode: 409 });
        const [created] = await connection.query<ResultSetHeader>(
          `INSERT INTO infraction_adjustments (infraction_id,adjustment_type,direction,amount,reason,legal_basis,authorization_reference,status,reverses_adjustment_id,requested_by_user_id,decided_by_user_id,decision_comment,decided_at)
           VALUES (?,'REVERSAL',?,?,?,?,?,'APPROVED',?,?,?,?,UTC_TIMESTAMP(3))`,
          [infractionId, row.direction === "CREDIT" ? "DEBIT" : "CREDIT", row.amount, input.comment, row.legal_basis, row.authorization_reference, adjustmentId, actorId, actorId, input.comment],
        );
        await connection.query("UPDATE infraction_adjustments SET status='REVERSED',reversed_at=UTC_TIMESTAMP(3) WHERE id=?", [adjustmentId]);
        await connection.query("INSERT INTO infraction_adjustment_history (adjustment_id,from_status,to_status,action,comment,changed_by_user_id) VALUES (?,'APPROVED','REVERSED','REVERSE',?,?)", [adjustmentId, input.comment, actorId]);
        await connection.query("INSERT INTO infraction_adjustment_history (adjustment_id,from_status,to_status,action,comment,changed_by_user_id) VALUES (?,NULL,'APPROVED','REVERSAL_ENTRY',?,?)", [created.insertId, input.comment, actorId]);
        return String(created.insertId);
      });
      await recordOperation(container, request, { action: "ADJUSTMENT_REVERSED", module: "adjustments", entityType: "infraction_adjustment", entityId: String(adjustmentId), previousValues: { status: "APPROVED" }, newValues: { status: "REVERSED", reversalId }, reason: input.comment });
      response.json({ data: { id: String(adjustmentId), status: "REVERSED", reversalId, balance: await balances.calculate(infractionId) }, meta: { requestId: getRequestId() } });
    } catch (error) { next(error); }
  });

  return router;
}

async function balanceInConnection(connection: import("mysql2/promise").PoolConnection, infractionId: number): Promise<bigint> {
  const [infractions] = await connection.query<(RowDataPacket & { total_amount: string })[]>(
    "SELECT total_amount FROM infractions WHERE id=? FOR UPDATE",
    [infractionId],
  );
  const infraction = infractions[0];
  if (!infraction) throw new HttpError({ code: "INFRACTION_NOT_FOUND", message: "Infracción no encontrada.", statusCode: 404 });
  const [rows] = await connection.query<(RowDataPacket & { adjustment_total: string })[]>(
    `SELECT COALESCE(SUM(CASE WHEN status IN ('APPROVED','REVERSED') THEN IF(direction='DEBIT',amount,-amount) ELSE 0 END),0) adjustment_total
     FROM infraction_adjustments WHERE infraction_id=?`,
    [infractionId],
  );
  const total = decimalToCents(infraction.total_amount) + decimalToCents(rows[0]?.adjustment_total ?? "0.00");
  return total > 0n ? total : 0n;
}

function positiveId(value: unknown): number { return z.coerce.number().int().positive().parse(value); }
function notFound(): HttpError { return new HttpError({ code: "ADJUSTMENT_NOT_FOUND", message: "Ajuste económico no encontrado.", statusCode: 404 }); }
function invalidTransition(): HttpError { return new HttpError({ code: "ADJUSTMENT_TRANSITION_INVALID", message: "El ajuste no admite esta transición.", statusCode: 409 }); }
