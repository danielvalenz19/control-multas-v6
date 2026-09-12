import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import type { AppContainer } from "../../../bootstrap/container.js";
import { createBasicPaymentOrderPdf } from "../../../shared/http/basic-pdf.js";
import { authenticate } from "../../../shared/http/authenticate.js";
import { authorize } from "../../../shared/http/authorize.js";
import { getRequestId } from "../../../shared/http/request-context.js";
import { isDuplicateKey, recordOperation } from "../../../shared/http/operations.js";
import { HttpError } from "../../../shared/http/HttpError.js";
import { PaymentService } from "../application/PaymentService.js";

const id = z.coerce.number().int().positive();
const money = z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/).max(18);
const key = z.string().trim().min(8).max(200);
const cashRegister = z.object({ siteId: id, code: z.string().trim().min(2).max(30), name: z.string().trim().min(2).max(100), description: z.string().trim().max(300).nullable().optional(), isActive: z.boolean().default(true) });
const paymentMethod = z.object({ code: z.string().trim().min(2).max(30), name: z.string().trim().min(2).max(100), requiresReference: z.boolean().default(false), requiresEvidence: z.boolean().default(false), isCash: z.boolean().default(false), isActive: z.boolean().default(true) });
const openSession = z.object({ cashDeskId: id, openingAmount: money });
const closeSession = z.object({ declaredAmount: money, note: z.string().trim().min(3).max(1000).optional() });
const movement = z.object({ direction: z.enum(["IN", "OUT"]), amount: money, reason: z.string().trim().min(3).max(1000), authorizationReference: z.string().trim().min(3).max(200) });
const createPayment = z.object({ paymentOrderId: id, paymentMethodId: id, amount: money, externalReference: z.string().trim().min(1).max(200).optional() });
const reversePayment = z.object({ reason: z.string().trim().min(5).max(1000), authorizationReference: z.string().trim().min(3).max(200) });
const listPayments = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25), status: z.enum(["REGISTERED", "CONFIRMED"]).optional(), search: z.string().trim().max(100).optional() });
const reconciliation = z.object({
  paymentMethodId: id,
  sourceType: z.enum(["MANUAL", "IMPORTED"]),
  sourceReference: z.string().trim().min(3).max(200),
  sourceFileName: z.string().trim().max(255).optional(),
  sourceChecksumSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  items: z.array(z.object({ paymentId: id, observedAmount: money, externalReference: z.string().trim().max(200).optional(), note: z.string().trim().max(1000).optional() })).min(1).max(1000),
});

export function createPaymentRouter(container: AppContainer): Router {
  const router = Router();
  const service = new PaymentService(container.database);
  router.use(authenticate(container.authRepository, container.env));

  router.get("/cash-registers", authorize("cash.manage", container.auditRepository), async (_request, response, next) => {
    try { response.json({ data: await service.listCashRegisters(), meta: { requestId: getRequestId() } }); } catch (error) { next(error); }
  });
  router.post("/cash-registers", authorize("catalogs.manage", container.auditRepository), async (request, response, next) => {
    try {
      const input = cashRegister.parse(request.body);
      const result = await container.database.query<ResultSetHeader>("INSERT INTO cash_desks (site_id,code,name,description,is_active) VALUES (?,?,?,?,?)", [input.siteId, input.code.toUpperCase(), input.name, input.description ?? null, input.isActive ? 1 : 0]);
      await recordOperation(container, request, { action: "CASH_REGISTER_CREATED", module: "cash", entityType: "cash_register", entityId: String(result.insertId) });
      response.status(201).json({ data: { id: String(result.insertId) }, meta: { requestId: getRequestId() } });
    } catch (error) { if (isDuplicateKey(error)) return next(new HttpError({ code: "CASH_REGISTER_DUPLICATE", message: "La caja ya existe en la sede.", statusCode: 409 })); next(error); }
  });
  router.patch("/cash-registers/:id", authorize("catalogs.manage", container.auditRepository), async (request, response, next) => {
    try {
      const registerId = id.parse(request.params["id"]);
      const input = cashRegister.partial().refine((value) => Object.keys(value).length > 0).parse(request.body);
      const mapping = { siteId: "site_id", code: "code", name: "name", description: "description", isActive: "is_active" } as const;
      const columns: string[] = []; const values: unknown[] = [];
      for (const [property, column] of Object.entries(mapping) as [keyof typeof mapping, string][]) if (input[property] !== undefined) { columns.push(`${column}=?`); const value = input[property]; values.push(typeof value === "boolean" ? (value ? 1 : 0) : property === "code" && typeof value === "string" ? value.toUpperCase() : value); }
      const result = await container.database.query<ResultSetHeader>(`UPDATE cash_desks SET ${columns.join(",")} WHERE id=?`, [...values, registerId]);
      if (!result.affectedRows) throw new HttpError({ code: "CASH_REGISTER_NOT_FOUND", message: "Caja no encontrada.", statusCode: 404 });
      await recordOperation(container, request, { action: "CASH_REGISTER_UPDATED", module: "cash", entityType: "cash_register", entityId: String(registerId) });
      response.sendStatus(204);
    } catch (error) { next(error); }
  });

  router.get("/payment-methods", authorize("payments.read", container.auditRepository), async (_request, response, next) => {
    try { response.json({ data: await service.listPaymentMethods(), meta: { requestId: getRequestId() } }); } catch (error) { next(error); }
  });
  router.post("/payment-methods", authorize("catalogs.manage", container.auditRepository), async (request, response, next) => {
    try {
      const input = paymentMethod.parse(request.body);
      const result = await container.database.query<ResultSetHeader>(
        "INSERT INTO payment_methods (code,name,requires_reference,requires_evidence,is_cash,is_active) VALUES (?,?,?,?,?,?)",
        [input.code.toUpperCase(), input.name, input.requiresReference ? 1 : 0, input.requiresEvidence ? 1 : 0, input.isCash ? 1 : 0, input.isActive ? 1 : 0],
      );
      await recordOperation(container, request, { action: "PAYMENT_METHOD_CREATED", module: "payments", entityType: "payment_method", entityId: String(result.insertId) });
      response.status(201).json({ data: { id: String(result.insertId) }, meta: { requestId: getRequestId() } });
    } catch (error) { if (isDuplicateKey(error)) return next(new HttpError({ code: "PAYMENT_METHOD_DUPLICATE", message: "El método de pago ya existe.", statusCode: 409 })); next(error); }
  });
  router.patch("/payment-methods/:id", authorize("catalogs.manage", container.auditRepository), async (request, response, next) => {
    try {
      const methodId = id.parse(request.params["id"]);
      const input = paymentMethod.partial().refine((value) => Object.keys(value).length > 0).parse(request.body);
      const mapping = { code: "code", name: "name", requiresReference: "requires_reference", requiresEvidence: "requires_evidence", isCash: "is_cash", isActive: "is_active" } as const;
      const columns: string[] = []; const values: unknown[] = [];
      for (const [property, column] of Object.entries(mapping) as [keyof typeof mapping, string][]) if (input[property] !== undefined) { columns.push(`${column}=?`); const value = input[property]; values.push(typeof value === "boolean" ? (value ? 1 : 0) : property === "code" && typeof value === "string" ? value.toUpperCase() : value); }
      const result = await container.database.query<ResultSetHeader>(`UPDATE payment_methods SET ${columns.join(",")} WHERE id=?`, [...values, methodId]);
      if (!result.affectedRows) throw new HttpError({ code: "PAYMENT_METHOD_NOT_FOUND", message: "Método de pago no encontrado.", statusCode: 404 });
      await recordOperation(container, request, { action: "PAYMENT_METHOD_UPDATED", module: "payments", entityType: "payment_method", entityId: String(methodId) });
      response.sendStatus(204);
    } catch (error) { next(error); }
  });

  router.post("/cash-sessions/open", authorize("cash.manage", container.auditRepository), async (request, response, next) => {
    try {
      const data = await service.openCashSession(openSession.parse(request.body), actor(request));
      await recordOperation(container, request, { action: "CASH_SESSION_OPENED", module: "cash", entityType: "cash_session", entityId: String(data["id"]) });
      response.status(201).json({ data, meta: { requestId: getRequestId() } });
    } catch (error) { next(error); }
  });
  router.get("/cash-sessions/current", authorize("cash.manage", container.auditRepository), async (request, response, next) => {
    try { response.json({ data: await service.currentCashSession(Number(request.auth?.user.id)), meta: { requestId: getRequestId() } }); } catch (error) { next(error); }
  });
  router.get("/cash-sessions/:id/summary", authorize("cash.manage", container.auditRepository), async (request, response, next) => {
    try { response.json({ data: await service.cashSessionSummary(container.database, id.parse(request.params["id"])), meta: { requestId: getRequestId() } }); } catch (error) { next(error); }
  });
  router.post("/cash-sessions/:id/movements", authorize("cash.manage", container.auditRepository), async (request, response, next) => {
    try {
      const sessionId = id.parse(request.params["id"]); const input = movement.parse(request.body);
      const data = await service.addManualMovement({ sessionId, ...input }, actor(request));
      await recordOperation(container, request, { action: input.direction === "IN" ? "CASH_MANUAL_INCOME" : "CASH_MANUAL_EXPENSE", module: "cash", entityType: "cash_movement", entityId: data.id, reason: input.reason, newValues: { amount: data.amount, direction: data.direction, authorizationReference: input.authorizationReference } });
      response.status(201).json({ data, meta: { requestId: getRequestId() } });
    } catch (error) { next(error); }
  });
  router.post("/cash-sessions/:id/close", authorize("cash.manage", container.auditRepository), async (request, response, next) => {
    try {
      const sessionId = id.parse(request.params["id"]); const input = closeSession.parse(request.body);
      const data = await service.closeCashSession({ sessionId, ...input }, actor(request));
      await recordOperation(container, request, { action: "CASH_SESSION_CLOSED", module: "cash", entityType: "cash_session", entityId: String(sessionId) });
      if ((data.difference_amount ?? "0.00") !== "0.00") await container.notifications.emit({ eventCode: "CASH_DIFFERENCE", recipientUserIds: await container.notifications.recipientsForPermissions(["reconciliations.manage"]), deduplicationKey: `cash-difference:${sessionId}`, resourceType: "cash_session", resourceId: sessionId, securePath: `/admin/receptoria/caja/${sessionId}` });
      response.json({ data, meta: { requestId: getRequestId() } });
    } catch (error) { next(error); }
  });

  router.get("/payments/options", authorize("payments.create", container.auditRepository), async (_request, response, next) => {
    try { const [orders, methods] = await Promise.all([service.listPayableOrders(), service.listPaymentMethods()]); response.json({ data: { orders, methods: methods.filter((row) => row["is_active"] === 1) }, meta: { requestId: getRequestId() } }); } catch (error) { next(error); }
  });
  router.post("/payments", authorize("payments.create", container.auditRepository), async (request, response, next) => {
    try {
      const result = await service.createPayment(createPayment.parse(request.body), actor(request), key.parse(request.get("idempotency-key")));
      await recordOperation(container, request, { action: result.replay ? "PAYMENT_CREATE_REPLAYED" : "PAYMENT_REGISTERED", module: "payments", entityType: "payment", entityId: result.payment.id, newValues: result.replay ? undefined : { amount: result.payment.amount, orderNumber: result.payment.orderNumber, paymentMethod: result.payment.paymentMethod } });
      response.status(result.replay ? 200 : 201).json({ data: result.payment, meta: { requestId: getRequestId(), idempotentReplay: result.replay } });
    } catch (error) { next(error); }
  });
  router.get("/payments", authorize("payments.read", container.auditRepository), async (request, response, next) => {
    try { const input = listPayments.parse(request.query); const result = await service.listPayments(input); response.json({ data: result.items, meta: { page: input.page, pageSize: input.pageSize, total: result.total, requestId: getRequestId() } }); } catch (error) { next(error); }
  });
  router.get("/payments/:id", authorize("payments.read", container.auditRepository), async (request, response, next) => {
    try { response.json({ data: await service.getPayment(id.parse(request.params["id"])), meta: { requestId: getRequestId() } }); } catch (error) { next(error); }
  });
  router.post("/payments/:id/confirm", authorize("payments.confirm", container.auditRepository), async (request, response, next) => {
    try {
      const result = await service.confirmPayment(id.parse(request.params["id"]), actor(request), key.parse(request.get("idempotency-key")));
      await recordOperation(container, request, { action: result.replay ? "PAYMENT_CONFIRM_REPLAYED" : "PAYMENT_CONFIRMED", module: "payments", entityType: "payment", entityId: result.payment.id, newValues: result.replay ? undefined : { amount: result.payment.amount, receiptNumber: result.payment.receipt?.number } });
      if (!result.replay) await container.notifications.emit({ eventCode: "PAYMENT_CONFIRMED", recipientUserIds: [request.auth?.user.id ?? ""], deduplicationKey: `payment-confirmed:${result.payment.id}`, resourceType: "payment", resourceId: result.payment.id, securePath: `/admin/receptoria/pagos/${result.payment.id}` });
      response.json({ data: result.payment, meta: { requestId: getRequestId(), idempotentReplay: result.replay } });
    } catch (error) { next(error); }
  });
  router.post("/payments/:id/reverse", authorize("payments.reverse", container.auditRepository), async (request, response, next) => {
    try {
      const input = reversePayment.parse(request.body); const result = await service.reversePayment(id.parse(request.params["id"]), input, actor(request), key.parse(request.get("idempotency-key")));
      await recordOperation(container, request, { action: result.replay ? "PAYMENT_REVERSE_REPLAYED" : "PAYMENT_REVERSED", module: "payments", entityType: "payment", entityId: result.payment.id, reason: input.reason, newValues: result.replay ? undefined : { reversalReference: result.payment.reversal?.reference, authorizationReference: input.authorizationReference } });
      if (!result.replay) { const recipients=await container.database.query<(RowDataPacket&{created_by_user_id:string|number})[]>("SELECT created_by_user_id FROM payments WHERE id=?",[result.payment.id]); await container.notifications.emit({ eventCode:"PAYMENT_REVERSED",recipientUserIds:[request.auth?.user.id??"",recipients[0]?.created_by_user_id??""],deduplicationKey:`payment-reversed:${result.payment.reversal?.reference??result.payment.id}`,resourceType:"payment",resourceId:result.payment.id,securePath:`/admin/receptoria/pagos/${result.payment.id}` }); }
      response.json({ data: result.payment, meta: { requestId: getRequestId(), idempotentReplay: result.replay } });
    } catch (error) { next(error); }
  });
  router.get("/payments/:id/receipt", authorize("payments.receipt", container.auditRepository), async (request, response, next) => {
    try {
      const copy = z.enum(["true", "false"]).default("false").transform((value) => value === "true").parse(request.query["copy"]); const result = await service.receipt(id.parse(request.params["id"]), copy, actor(request)); const payment = result.payment;
      const pdf = createBasicPaymentOrderPdf(["MUNICIPALIDAD - SISTEMA PMT", result.copy ? "COPIA DE RECIBO" : "RECIBO OFICIAL", `Recibo: ${payment.receipt?.number ?? ""}`, `Boleta: ${payment.ticketNumber}`, `Orden: ${payment.orderNumber}`, `Monto: ${payment.currency} ${payment.amount}`, `Método: ${payment.paymentMethod}`, `Confirmado: ${payment.confirmedAt ? new Date(payment.confirmedAt).toISOString() : ""}`, payment.reversal ? "PAGO REVERSADO - DOCUMENTO HISTÓRICO" : "PAGO CONFIRMADO"]);
      await recordOperation(container, request, { action: result.copy ? "PAYMENT_RECEIPT_REPRINTED" : "PAYMENT_RECEIPT_DOWNLOADED", module: "payments", entityType: "payment_receipt", entityId: payment.receipt?.number ?? null });
      response.setHeader("Content-Type", "application/pdf"); response.setHeader("Content-Disposition", `inline; filename="recibo-${payment.receipt?.number ?? payment.id}${result.copy ? "-copia" : ""}.pdf"`); response.setHeader("Cache-Control", "private, no-store"); response.send(pdf);
    } catch (error) { next(error); }
  });

  router.post("/reconciliations", authorize("reconciliations.manage", container.auditRepository), async (request, response, next) => {
    try { const data = await service.createReconciliation(reconciliation.parse(request.body), actor(request)); await recordOperation(container, request, { action: "RECONCILIATION_CREATED", module: "reconciliations", entityType: "reconciliation", entityId: String(data.id) }); response.status(201).json({ data, meta: { requestId: getRequestId() } }); } catch (error) { next(error); }
  });
  router.get("/reconciliations", authorize("reconciliations.manage", container.auditRepository), async (_request, response, next) => {
    try { response.json({ data: await service.listReconciliations(), meta: { requestId: getRequestId() } }); } catch (error) { next(error); }
  });
  router.get("/reconciliations/:id", authorize("reconciliations.manage", container.auditRepository), async (request, response, next) => {
    try { response.json({ data: await service.getReconciliation(id.parse(request.params["id"])), meta: { requestId: getRequestId() } }); } catch (error) { next(error); }
  });
  router.post("/reconciliations/:id/close", authorize("reconciliations.manage", container.auditRepository), async (request, response, next) => {
    try { const reconciliationId = id.parse(request.params["id"]); const note = z.object({ note: z.string().trim().min(3).max(1000).optional() }).parse(request.body).note; const data = await service.closeReconciliation(reconciliationId, note, actor(request)); await recordOperation(container, request, { action: "RECONCILIATION_CLOSED", module: "reconciliations", entityType: "reconciliation", entityId: String(reconciliationId), ...(note === undefined ? {} : { reason: note }) }); if(data.difference_amount!=="0.00") await container.notifications.emit({eventCode:"RECONCILIATION_DIFFERENCE",recipientUserIds:await container.notifications.recipientsForPermissions(["reconciliations.manage"]),deduplicationKey:`reconciliation-difference:${reconciliationId}`,resourceType:"reconciliation",resourceId:reconciliationId,securePath:`/admin/receptoria/conciliacion/${reconciliationId}`}); response.json({ data, meta: { requestId: getRequestId() } }); } catch (error) { next(error); }
  });

  return router;
}

function actor(request: Parameters<typeof recordOperation>[1]) { return { userId: Number(request.auth?.user.id), requestId: getRequestId() }; }
