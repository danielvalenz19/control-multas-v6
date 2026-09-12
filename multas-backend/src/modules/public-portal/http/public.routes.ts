import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import type { AppContainer } from "../../../bootstrap/container.js";
import { centsToDecimal, decimalToCents } from "../../../shared/domain/Money.js";
import { createBasicPaymentOrderPdf } from "../../../shared/http/basic-pdf.js";
import { HttpError } from "../../../shared/http/HttpError.js";
import { getRequestId } from "../../../shared/http/request-context.js";
import { recordOperation } from "../../../shared/http/operations.js";
import { createPublicSolvencyRouter } from "../../solvencies/http/solvency.routes.js";
import type { MySqlDatabase } from "../../../shared/infrastructure/mysql/MySqlConnection.js";

const lookupInput = z.object({
  ticketNumber: z.string().trim().min(3).max(80),
  plate: z.string().trim().min(2).max(30),
});
const publicReferenceInput = z.string().regex(/^[a-f0-9]{40}$/);
const idempotencyInput = z.string().trim().min(8).max(200);

type InfractionRow = RowDataPacket & {
  id: number;
  ticket_number: string;
  vehicle_plate_snapshot: string;
  status: string;
  occurred_at: Date;
  total_amount: string;
  address: string;
};
type PublicReferenceRow = RowDataPacket & { id: number; infraction_id: number; public_reference: string };
type PaymentOrderRow = RowDataPacket & {
  id: number;
  order_number: string;
  public_reference: string;
  infraction_id: number;
  ticket_number: string;
  vehicle_plate_snapshot: string;
  original_amount_snapshot: string;
  adjustment_total_snapshot: string;
  payment_total_snapshot: string;
  pending_balance_snapshot: string;
  currency: string;
  status: string;
  issued_at: Date;
  expires_at: Date;
};

export function createPublicRouter(container: AppContainer): Router {
  const router = Router();
  router.use(rateLimit({
    windowMs: container.env.PUBLIC_RATE_LIMIT_WINDOW_MS,
    limit: container.env.PUBLIC_RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler(_request, _response, next) {
      next(new HttpError({ code: "PUBLIC_RATE_LIMIT_EXCEEDED", message: "No fue posible procesar más consultas en este momento.", statusCode: 429 }));
    },
  }));
  router.use("/solvencies", createPublicSolvencyRouter(container));

  router.post("/infractions/search", async (request, response, next) => {
    try {
      const input = lookupInput.parse(request.body);
      const found = await container.database.withTransaction(async (connection) => {
        const [rows] = await connection.query<InfractionRow[]>(
          `SELECT i.id,i.ticket_number,i.vehicle_plate_snapshot,i.status,i.occurred_at,i.total_amount,l.address
           FROM infractions i JOIN infraction_locations l ON l.infraction_id=i.id
           WHERE i.ticket_number=? AND REPLACE(REPLACE(UPPER(i.vehicle_plate_snapshot),'-',''),' ','')=?
             AND i.status IN ('VALIDADA','ANULADA') LIMIT 1 FOR UPDATE`,
          [input.ticketNumber.toUpperCase(), normalizePlate(input.plate)],
        );
        const infraction = rows[0];
        if (!infraction) return null;
        const reference = await ensurePublicReference(connection, infraction.id);
        await connection.query("UPDATE infraction_public_references SET last_accessed_at=UTC_TIMESTAMP(3) WHERE id=?", [reference.id]);
        return publicInfraction(connection, infraction, reference.public_reference);
      });
      if (!found) {
        await recordOperation(container, request, { action: "PUBLIC_INFRACTION_LOOKUP_NOT_FOUND", module: "public_portal", entityType: "public_infraction", entityId: null });
        throw publicNotFound();
      }
      await recordOperation(container, request, { action: "PUBLIC_INFRACTION_LOOKUP", module: "public_portal", entityType: "public_infraction", entityId: found.reference });
      response.json({ data: found, meta: { requestId: getRequestId() } });
    } catch (error) { next(error); }
  });

  router.get("/infractions/:reference", async (request, response, next) => {
    try {
      const referenceValue = publicReferenceInput.parse(request.params.reference);
      const references = await container.database.query<PublicReferenceRow[]>("SELECT id,infraction_id,public_reference FROM infraction_public_references WHERE public_reference=?", [referenceValue]);
      const reference = references[0];
      if (!reference) throw publicNotFound();
      const rows = await container.database.query<InfractionRow[]>(
        `SELECT i.id,i.ticket_number,i.vehicle_plate_snapshot,i.status,i.occurred_at,i.total_amount,l.address
         FROM infractions i JOIN infraction_locations l ON l.infraction_id=i.id WHERE i.id=? AND i.status IN ('VALIDADA','ANULADA')`, [reference.infraction_id],
      );
      if (!rows[0]) throw publicNotFound();
      const result = await publicInfraction(container.database, rows[0], reference.public_reference);
      await container.database.query("UPDATE infraction_public_references SET last_accessed_at=UTC_TIMESTAMP(3) WHERE id=?", [reference.id]);
      await recordOperation(container, request, { action: "PUBLIC_INFRACTION_READ", module: "public_portal", entityType: "public_infraction", entityId: reference.public_reference });
      response.json({ data: result, meta: { requestId: getRequestId() } });
    } catch (error) { next(error); }
  });

  router.post("/payment-orders", async (request, response, next) => {
    try {
      const publicReference = publicReferenceInput.parse((request.body as { publicReference?: unknown } | undefined)?.publicReference);
      const idempotencyKey = idempotencyInput.parse(request.get("idempotency-key"));
      const keyHash = sha256(idempotencyKey);
      const requestHash = sha256(publicReference);
      const outcome = await container.database.withTransaction(async (connection) => {
        const [references] = await connection.query<PublicReferenceRow[]>(
          `SELECT pr.id,pr.infraction_id,pr.public_reference FROM infraction_public_references pr
           JOIN infractions i ON i.id=pr.infraction_id WHERE pr.public_reference=? AND i.status='VALIDADA' FOR UPDATE`, [publicReference],
        );
        const reference = references[0];
        if (!reference) throw publicNotFound();
        await connection.query("DELETE FROM public_idempotency_records WHERE scope='PAYMENT_ORDER_CREATE' AND key_hash=? AND expires_at<=UTC_TIMESTAMP(3)", [keyHash]);
        const [replays] = await connection.query<(RowDataPacket & { request_hash: string; resource_id: number })[]>("SELECT request_hash,resource_id FROM public_idempotency_records WHERE scope='PAYMENT_ORDER_CREATE' AND key_hash=? FOR UPDATE", [keyHash]);
        const replay = replays[0];
        if (replay) {
          if (replay.request_hash !== requestHash) throw new HttpError({ code: "IDEMPOTENCY_KEY_REUSED", message: "La clave de idempotencia ya fue utilizada para otra solicitud.", statusCode: 409 });
          return { order: await loadOrder(connection, replay.resource_id), replay: true };
        }
        await expireOrders(connection, reference.infraction_id);
        const [active] = await connection.query<(RowDataPacket & { id: number })[]>("SELECT id FROM payment_orders WHERE infraction_id=? AND status='ISSUED' AND expires_at>UTC_TIMESTAMP(3) ORDER BY issued_at DESC LIMIT 1 FOR UPDATE", [reference.infraction_id]);
        if (active[0]) {
          const order = await loadOrder(connection, active[0].id);
          await saveIdempotency(connection, keyHash, requestHash, order.id, order.expires_at);
          return { order, replay: true };
        }
        const [rules] = await connection.query<(RowDataPacket & { id: number; value_integer: number })[]>(
          `SELECT id,value_integer FROM institutional_rule_versions WHERE rule_code='PAYMENT_ORDER_EXPIRY_DAYS' AND value_type='INTEGER' AND value_integer>0
           AND effective_from<=UTC_TIMESTAMP(3) AND (effective_to IS NULL OR effective_to>UTC_TIMESTAMP(3)) ORDER BY effective_from DESC,id DESC LIMIT 1`,
        );
        const rule = rules[0];
        if (!rule) throw new HttpError({ code: "PAYMENT_ORDER_EXPIRY_NOT_CONFIGURED", message: "La vigencia de la orden de pago aún no está configurada institucionalmente.", statusCode: 409 });
        const balance = await balanceSnapshot(connection, reference.infraction_id);
        if (balance.pendingBalance === "0.00") throw new HttpError({ code: "PAYMENT_ORDER_NO_BALANCE", message: "La infracción no tiene saldo pendiente para emitir una orden.", statusCode: 409 });
        const issuedAt = new Date();
        const expiresAt = new Date(issuedAt.getTime() + rule.value_integer * 86_400_000);
        const [infractions] = await connection.query<(RowDataPacket & { site_id: number })[]>("SELECT site_id FROM infractions WHERE id=?", [reference.infraction_id]);
        const orderNumber = await nextOrderNumber(connection, infractions[0]?.site_id ?? 0, issuedAt.getUTCFullYear());
        const orderReference = randomReference();
        const [created] = await connection.query<ResultSetHeader>(
          `INSERT INTO payment_orders (order_number,public_reference,infraction_id,infraction_public_reference_id,original_amount_snapshot,adjustment_total_snapshot,payment_total_snapshot,pending_balance_snapshot,expiry_rule_version_id,issued_at,expires_at,created_request_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [orderNumber, orderReference, reference.infraction_id, reference.id, balance.originalAmount, balance.adjustmentTotal, balance.paymentTotal, balance.pendingBalance, rule.id, issuedAt, expiresAt, getRequestId()],
        );
        await connection.query("INSERT INTO payment_order_status_history (payment_order_id,from_status,to_status,action,request_id) VALUES (?,NULL,'ISSUED','CREATE',?)", [created.insertId, getRequestId()]);
        await saveIdempotency(connection, keyHash, requestHash, created.insertId, expiresAt);
        return { order: await loadOrder(connection, created.insertId), replay: false };
      });
      await recordOperation(container, request, { action: outcome.replay ? "PUBLIC_PAYMENT_ORDER_REPLAYED" : "PUBLIC_PAYMENT_ORDER_CREATED", module: "public_portal", entityType: "payment_order", entityId: outcome.order.public_reference });
      response.status(outcome.replay ? 200 : 201).json({ data: orderDto(outcome.order), meta: { requestId: getRequestId(), idempotentReplay: outcome.replay } });
    } catch (error) { next(error); }
  });

  router.get("/payment-orders/:reference", async (request, response, next) => {
    try {
      const reference = publicReferenceInput.parse(request.params.reference);
      const order = await container.database.withTransaction(async (connection) => {
        const [rows] = await connection.query<PaymentOrderRow[]>(orderSelect("po.public_reference=?") + " FOR UPDATE", [reference]);
        if (!rows[0]) throw publicOrderNotFound();
        if (rows[0].status === "ISSUED" && rows[0].expires_at.getTime() <= Date.now()) {
          await connection.query("UPDATE payment_orders SET status='EXPIRED' WHERE id=?", [rows[0].id]);
          await connection.query("INSERT INTO payment_order_status_history (payment_order_id,from_status,to_status,action,request_id) VALUES (?,'ISSUED','EXPIRED','AUTO_EXPIRE',?)", [rows[0].id, getRequestId()]);
          rows[0].status = "EXPIRED";
        }
        return rows[0];
      });
      await recordOperation(container, request, { action: "PUBLIC_PAYMENT_ORDER_READ", module: "public_portal", entityType: "payment_order", entityId: order.public_reference });
      response.json({ data: orderDto(order), meta: { requestId: getRequestId() } });
    } catch (error) { next(error); }
  });

  router.get("/payment-orders/:reference/document", async (request, response, next) => {
    try {
      const reference = publicReferenceInput.parse(request.params.reference);
      const order = await container.database.withTransaction(async (connection) => {
        const [rows] = await connection.query<PaymentOrderRow[]>(orderSelect("po.public_reference=?") + " FOR UPDATE", [reference]);
        if (!rows[0]) throw publicOrderNotFound();
        if (rows[0].status === "ISSUED" && rows[0].expires_at.getTime() <= Date.now()) {
          await connection.query("UPDATE payment_orders SET status='EXPIRED' WHERE id=?", [rows[0].id]);
          await connection.query("INSERT INTO payment_order_status_history (payment_order_id,from_status,to_status,action,request_id) VALUES (?,'ISSUED','EXPIRED','AUTO_EXPIRE',?)", [rows[0].id, getRequestId()]);
          rows[0].status = "EXPIRED";
        }
        return rows[0];
      });
      const pdf = createBasicPaymentOrderPdf([
        "MUNICIPALIDAD - SISTEMA PMT",
        "ORDEN DE PAGO",
        `Orden: ${order.order_number}`,
        `Boleta: ${order.ticket_number}`,
        `Placa: ${order.vehicle_plate_snapshot}`,
        `Saldo indicado: GTQ ${order.pending_balance_snapshot}`,
        `Vigente hasta: ${order.expires_at.toISOString()}`,
        `Estado: ${order.status}`,
        "NO ES RECIBO PAGADO NI CONSTANCIA DE PAGO",
      ]);
      await recordOperation(container, request, { action: "PUBLIC_PAYMENT_ORDER_DOCUMENT", module: "public_portal", entityType: "payment_order", entityId: order.public_reference });
      response.setHeader("Content-Type", "application/pdf");
      response.setHeader("Content-Disposition", `inline; filename="orden-${order.order_number}.pdf"`);
      response.setHeader("Cache-Control", "private, no-store");
      response.send(pdf);
    } catch (error) { next(error); }
  });

  return router;
}

type Queryable = MySqlDatabase | PoolConnection;

async function ensurePublicReference(connection: PoolConnection, infractionId: number): Promise<PublicReferenceRow> {
  const [existing] = await connection.query<PublicReferenceRow[]>("SELECT id,infraction_id,public_reference FROM infraction_public_references WHERE infraction_id=? FOR UPDATE", [infractionId]);
  if (existing[0]) return existing[0];
  const publicReference = randomReference();
  const [created] = await connection.query<ResultSetHeader>("INSERT INTO infraction_public_references (infraction_id,public_reference) VALUES (?,?)", [infractionId, publicReference]);
  return { id: created.insertId, infraction_id: infractionId, public_reference: publicReference } as PublicReferenceRow;
}

async function publicInfraction(connection: Queryable, infraction: InfractionRow, reference: string) {
  const items = await queryRows<(RowDataPacket & { code: string; name: string; amount_snapshot: string })[]>(connection,
    `SELECT it.code,it.name,ii.amount_snapshot FROM infraction_items ii JOIN infraction_types it ON it.id=ii.infraction_type_id WHERE ii.infraction_id=? ORDER BY ii.id`, [infraction.id],
  );
  const balance = infraction.status === "ANULADA" ? { originalAmount: infraction.total_amount, adjustmentTotal: "0.00", paymentTotal: "0.00", pendingBalance: "0.00" } : await balanceSnapshot(connection, infraction.id);
  return {
    reference,
    ticketNumber: infraction.ticket_number,
    plate: infraction.vehicle_plate_snapshot,
    occurredAt: infraction.occurred_at,
    location: infraction.address,
    status: infraction.status,
    violations: items.map((item) => ({ code: item.code, name: item.name, amount: item.amount_snapshot })),
    balance: { ...balance, currency: "GTQ" },
    paymentOrderEligible: infraction.status === "VALIDADA" && balance.pendingBalance !== "0.00",
  };
}

async function balanceSnapshot(connection: Queryable, infractionId: number) {
  const rows = await queryRows<(RowDataPacket & { total_amount: string; adjustment_total: string })[]>(connection,
    `SELECT i.total_amount,COALESCE(SUM(CASE WHEN a.status IN ('APPROVED','REVERSED') THEN IF(a.direction='DEBIT',a.amount,-a.amount) ELSE 0 END),0) adjustment_total
     FROM infractions i LEFT JOIN infraction_adjustments a ON a.infraction_id=i.id WHERE i.id=? GROUP BY i.id`, [infractionId],
  );
  const row = rows[0];
  if (!row) throw publicNotFound();
  const original = decimalToCents(row.total_amount);
  const adjustments = decimalToCents(row.adjustment_total);
  const paymentRows = await queryRows<(RowDataPacket & { applied_amount: string })[]>(connection,
    `SELECT COALESCE(SUM(pa.amount),0) applied_amount
     FROM payment_allocations pa
     JOIN payments p ON p.id=pa.payment_id AND p.status='CONFIRMED'
     LEFT JOIN payment_reversals pr ON pr.payment_id=p.id
     WHERE pa.infraction_id=? AND pr.id IS NULL`, [infractionId],
  );
  const payments = decimalToCents(paymentRows[0]?.applied_amount ?? "0.00");
  const pending = original + adjustments - payments;
  return { originalAmount: centsToDecimal(original), adjustmentTotal: centsToDecimal(adjustments), paymentTotal: centsToDecimal(payments), pendingBalance: centsToDecimal(pending > 0n ? pending : 0n) };
}

async function expireOrders(connection: PoolConnection, infractionId: number): Promise<void> {
  const [expired] = await connection.query<(RowDataPacket & { id: number })[]>("SELECT id FROM payment_orders WHERE infraction_id=? AND status='ISSUED' AND expires_at<=UTC_TIMESTAMP(3) FOR UPDATE", [infractionId]);
  for (const row of expired) {
    await connection.query("UPDATE payment_orders SET status='EXPIRED' WHERE id=?", [row.id]);
    await connection.query("INSERT INTO payment_order_status_history (payment_order_id,from_status,to_status,action,request_id) VALUES (?,'ISSUED','EXPIRED','AUTO_EXPIRE',?)", [row.id, getRequestId()]);
  }
}

async function saveIdempotency(connection: PoolConnection, keyHash: string, requestHash: string, resourceId: number, expiresAt: Date): Promise<void> {
  await connection.query("INSERT INTO public_idempotency_records (scope,key_hash,request_hash,resource_id,response_status,expires_at) VALUES ('PAYMENT_ORDER_CREATE',?,?,?,?,?)", [keyHash, requestHash, resourceId, 201, expiresAt]);
}

async function loadOrder(connection: Queryable, id: number): Promise<PaymentOrderRow> {
  const rows = await queryRows<PaymentOrderRow[]>(connection, orderSelect("po.id=?"), [id]);
  if (!rows[0]) throw publicOrderNotFound();
  return rows[0];
}

function orderSelect(where: string): string {
  return `SELECT po.*,i.ticket_number,i.vehicle_plate_snapshot FROM payment_orders po JOIN infractions i ON i.id=po.infraction_id WHERE ${where}`;
}

function orderDto(order: PaymentOrderRow) {
  return {
    reference: order.public_reference,
    orderNumber: order.order_number,
    ticketNumber: order.ticket_number,
    plate: order.vehicle_plate_snapshot,
    originalAmount: order.original_amount_snapshot,
    adjustmentTotal: order.adjustment_total_snapshot,
    paymentTotal: order.payment_total_snapshot,
    pendingBalance: order.pending_balance_snapshot,
    currency: order.currency,
    status: order.status,
    issuedAt: order.issued_at,
    expiresAt: order.expires_at,
    notice: "Esta orden facilita el pago, pero no es recibo ni acredita que la obligación haya sido pagada.",
  };
}

async function nextOrderNumber(connection: PoolConnection, siteId: number, year: number): Promise<string> {
  const [rows] = await connection.query<(RowDataPacket & { id: number; prefix: string; next_number: number; padding_length: number })[]>("SELECT id,prefix,next_number,padding_length FROM document_sequences WHERE site_id=? AND document_type='PAYMENT_ORDER' AND sequence_year=? FOR UPDATE", [siteId, year]);
  const row = rows[0];
  if (!row) throw new HttpError({ code: "PAYMENT_ORDER_SEQUENCE_NOT_CONFIGURED", message: "El correlativo institucional de órdenes no está configurado.", statusCode: 409 });
  await connection.query("UPDATE document_sequences SET next_number=next_number+1 WHERE id=?", [row.id]);
  return `${row.prefix}${String(row.next_number).padStart(row.padding_length, "0")}`;
}

function normalizePlate(value: string): string { return value.normalize("NFKD").replace(/[^a-zA-Z0-9]/g, "").toUpperCase(); }
async function queryRows<T extends RowDataPacket[]>(connection: Queryable, sql: string, values: unknown[]): Promise<T> {
  if ("withTransaction" in connection) return connection.query<T>(sql, values);
  const [rows] = await connection.query<T>(sql, values);
  return rows;
}
function randomReference(): string { return randomBytes(20).toString("hex"); }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function publicNotFound(): HttpError { return new HttpError({ code: "PUBLIC_INFRACTION_NOT_FOUND", message: "No se encontró una infracción con los datos proporcionados.", statusCode: 404 }); }
function publicOrderNotFound(): HttpError { return new HttpError({ code: "PUBLIC_PAYMENT_ORDER_NOT_FOUND", message: "No se encontró la orden de pago solicitada.", statusCode: 404 }); }
