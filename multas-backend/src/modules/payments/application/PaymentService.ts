import { createHash, randomBytes } from "node:crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { centsToDecimal, decimalToCents, normalizeMoney } from "../../../shared/domain/Money.js";
import { HttpError } from "../../../shared/http/HttpError.js";
import type { MySqlDatabase } from "../../../shared/infrastructure/mysql/MySqlConnection.js";
import type { Env } from "../../../config/env.js";

type PaymentRow = RowDataPacket & {
  id: number;
  public_reference: string;
  payment_order_id: number;
  order_number: string;
  infraction_id: number;
  ticket_number: string;
  cash_session_id: number | null;
  cash_desk_name: string | null;
  payment_method_id: number;
  payment_method_name: string;
  is_cash: number;
  amount: string;
  currency: string;
  external_reference: string | null;
  status: "REGISTERED" | "CONFIRMED";
  created_at: Date;
  confirmed_at: Date | null;
  receipt_number: string | null;
  receipt_issued_at: Date | null;
  copy_count: number | null;
  reversal_id: number | null;
  reversal_reference: string | null;
  reversal_reason: string | null;
  reversed_at: Date | null;
};
type ReconciliationRow = RowDataPacket & {
  id: number;
  public_reference: string;
  status: string;
  expected_total: string;
  observed_total: string;
  difference_amount: string;
  payment_method_code: string;
  payment_method_name: string;
};

export type PaymentActor = { userId: number; requestId: string };
export type PaymentView = {
  id: string; reference: string; paymentOrderId: string; orderNumber: string; infractionId: string; ticketNumber: string;
  cashSessionId: string | null; cashDesk: string | null; paymentMethodId: string; paymentMethod: string; amount: string; currency: string;
  externalReference: string | null; status: "REGISTERED" | "CONFIRMED"; createdAt: Date; confirmedAt: Date | null;
  receipt: { number: string; issuedAt: Date | null; copyCount: number } | null;
  reversal: { id: string; reference: string | null; reason: string | null; reversedAt: Date | null } | null;
};

export type OnlinePaymentIntentView = {
  id: string;
  reference: string;
  orderNumber: string;
  paymentOrderReference: string;
  paymentMethod: "CARD" | "VISA_LINK";
  providerCode: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "EXPIRED" | "CANCELLED";
  amount: string;
  currency: string;
  checkoutUrl: string;
  providerPaymentId: string | null;
  paymentId: string | null;
  receiptNumber: string | null;
  expiresAt: Date;
  createdAt: Date;
  completedAt: Date | null;
  testMode: boolean;
};

export type OnlinePaymentConfig = Pick<Env, "PAYMENT_GATEWAY_MODE" | "PAYMENT_GATEWAY_BASE_URL" | "PUBLIC_APP_URL">;

export class PaymentService {
  public constructor(private readonly database: MySqlDatabase) {}

  public async listCashRegisters(): Promise<RowDataPacket[]> {
    return this.database.query<RowDataPacket[]>(
      `SELECT cd.id,cd.code,cd.name,cd.description,cd.is_active,cd.site_id,s.code site_code,s.name site_name,
              cs.id current_session_id,cs.cashier_user_id,cs.opened_at
       FROM cash_desks cd JOIN sites s ON s.id=cd.site_id
       LEFT JOIN cash_sessions cs ON cs.cash_desk_id=cd.id AND cs.status='OPEN'
       ORDER BY s.name,cd.name`,
    );
  }

  public async listPaymentMethods(): Promise<RowDataPacket[]> {
    return this.database.query<RowDataPacket[]>(
      "SELECT id,code,name,requires_reference,requires_evidence,is_cash,is_active FROM payment_methods ORDER BY name",
    );
  }

  public async listPayableOrders(): Promise<RowDataPacket[]> {
    return this.database.query<RowDataPacket[]>(
      `SELECT po.id,po.order_number,po.public_reference,po.pending_balance_snapshot,po.expires_at,
              i.ticket_number,i.vehicle_plate_snapshot
       FROM payment_orders po JOIN infractions i ON i.id=po.infraction_id
       LEFT JOIN payments p ON p.payment_order_id=po.id
       LEFT JOIN payment_intents pi ON pi.payment_order_id=po.id AND pi.status='PENDING' AND pi.expires_at>UTC_TIMESTAMP(3)
       WHERE po.status='ISSUED' AND po.expires_at>UTC_TIMESTAMP(3) AND p.id IS NULL AND pi.id IS NULL
       ORDER BY po.issued_at DESC LIMIT 200`,
    );
  }

  public async createOnlinePaymentIntent(
    input: { paymentOrderReference: string; paymentMethod: "CARD" | "VISA_LINK"; idempotencyKey: string; requestId: string },
    config: OnlinePaymentConfig,
  ): Promise<{ intent: OnlinePaymentIntentView; replay: boolean }> {
    const providerCode = input.paymentMethod === "CARD" ? "CARD_ONLINE" : "VISA_LINK";
    const idempotencyKeyHash = sha256(input.idempotencyKey);
    return this.database.withTransaction(async (connection) => {
      const [orders] = await connection.query<(RowDataPacket & { id: number; public_reference: string; order_number: string; infraction_id: number; pending_balance_snapshot: string; status: string; expires_at: Date })[]>(
        "SELECT id,public_reference,order_number,infraction_id,pending_balance_snapshot,status,expires_at FROM payment_orders WHERE public_reference=? FOR UPDATE",
        [input.paymentOrderReference],
      );
      const order = orders[0];
      if (!order) throw new HttpError({ code: "PUBLIC_PAYMENT_ORDER_NOT_FOUND", message: "No se encontró la orden de pago solicitada.", statusCode: 404 });
      const [methodRows] = await connection.query<(RowDataPacket & { id: number; code: string; is_active: number })[]>(
        "SELECT id,code,is_active FROM payment_methods WHERE code=? FOR UPDATE", [providerCode],
      );
      const method = methodRows[0];
      if (!method) throw new HttpError({ code: "ONLINE_PAYMENT_METHOD_NOT_CONFIGURED", message: "El método de pago en línea todavía no está configurado.", statusCode: 503 });
      const [existing] = await connection.query<(RowDataPacket & { id: number })[]>(
        `SELECT id FROM payment_intents WHERE payment_order_id=? AND payment_method_id=? AND idempotency_key_hash=? LIMIT 1 FOR UPDATE`,
        [order.id, method.id, idempotencyKeyHash],
      );
      if (existing[0]) return { intent: await this.loadOnlineIntent(connection, existing[0].id, config.PAYMENT_GATEWAY_MODE === "test"), replay: true };
      if (order.status !== "ISSUED") throw new HttpError({ code: "PAYMENT_ORDER_NOT_PAYABLE", message: "La orden ya no está disponible para iniciar un pago.", statusCode: 409 });
      if (!method.is_active) throw new HttpError({ code: "ONLINE_PAYMENT_METHOD_NOT_CONFIGURED", message: "El método de pago en línea todavía no está configurado.", statusCode: 503 });
      if (new Date(order.expires_at).getTime() <= Date.now()) throw new HttpError({ code: "PAYMENT_ORDER_EXPIRED", message: "La orden de pago está vencida.", statusCode: 409 });
      const [active] = await connection.query<(RowDataPacket & { id: number })[]>(
        `SELECT id FROM payment_intents WHERE payment_order_id=? AND status='PENDING' AND expires_at>UTC_TIMESTAMP(3) ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [order.id],
      );
      if (active[0]) return { intent: await this.loadOnlineIntent(connection, active[0].id, config.PAYMENT_GATEWAY_MODE === "test"), replay: true };
      if (config.PAYMENT_GATEWAY_MODE === "disabled") throw new HttpError({ code: "ONLINE_PAYMENT_UNAVAILABLE", message: "El pago en línea aún no está habilitado para esta municipalidad.", statusCode: 503 });
      const balance = await calculateBalance(connection, order.infraction_id);
      if (balance.pendingBalance === "0.00" || balance.pendingBalance !== normalizeMoney(order.pending_balance_snapshot)) throw new HttpError({ code: "PAYMENT_BALANCE_CHANGED", message: "El saldo de la orden cambió; genera una orden nueva.", statusCode: 409 });
      const expiresAt = new Date(Math.min(new Date(order.expires_at).getTime(), Date.now() + 30 * 60 * 1000));
      const publicReference = randomReference();
      const checkoutUrl = buildCheckoutUrl(config, publicReference, balance.pendingBalance, expiresAt);
      const [created] = await connection.query<ResultSetHeader>(
        `INSERT INTO payment_intents (public_reference,payment_order_id,payment_method_id,provider_code,status,amount,checkout_url,idempotency_key_hash,expires_at,created_request_id)
         VALUES (?,?,?,?, 'PENDING',?,?,?,?,?)`,
        [publicReference, order.id, method.id, providerCode, balance.pendingBalance, checkoutUrl, idempotencyKeyHash, expiresAt, input.requestId],
      );
      return { intent: await this.loadOnlineIntent(connection, created.insertId, config.PAYMENT_GATEWAY_MODE === "test"), replay: false };
    });
  }

  public async getOnlinePaymentIntent(reference: string, config: OnlinePaymentConfig): Promise<OnlinePaymentIntentView> {
    return this.loadOnlineIntent(this.database, reference, config.PAYMENT_GATEWAY_MODE === "test", true);
  }

  public async listOnlinePaymentIntents(): Promise<RowDataPacket[]> {
    return this.database.query<RowDataPacket[]>(
      `SELECT pi.id,pi.public_reference,pi.provider_code,pi.status,pi.amount,pi.currency,pi.provider_payment_id,pi.expires_at,pi.created_at,pi.completed_at,
              po.order_number,po.public_reference payment_order_reference,pr.receipt_number
       FROM payment_intents pi JOIN payment_orders po ON po.id=pi.payment_order_id
       LEFT JOIN payment_receipts pr ON pr.payment_id=pi.payment_id
       ORDER BY pi.created_at DESC LIMIT 200`,
    );
  }

  public async completeOnlinePaymentIntent(reference: string, providerPaymentId: string, actor: PaymentActor): Promise<PaymentView> {
    return this.database.withTransaction(async (connection) => {
      const [intentRows] = await connection.query<(RowDataPacket & { id: number; payment_id: number | null; payment_order_id: number; payment_method_id: number; amount: string; status: string; expires_at: Date; provider_payment_id: string | null })[]>(
        "SELECT id,payment_id,payment_order_id,payment_method_id,amount,status,expires_at,provider_payment_id FROM payment_intents WHERE public_reference=? FOR UPDATE", [reference],
      );
      const intent = intentRows[0];
      if (!intent) throw new HttpError({ code: "ONLINE_PAYMENT_INTENT_NOT_FOUND", message: "El enlace de pago no existe o ya no está disponible.", statusCode: 404 });
      if (intent.status === "SUCCEEDED" && intent.payment_id) return paymentDto(await this.loadPayment(connection, intent.payment_id));
      if (intent.status !== "PENDING") throw new HttpError({ code: "ONLINE_PAYMENT_INTENT_NOT_PENDING", message: "El intento de pago ya fue resuelto y no admite otra confirmación.", statusCode: 409 });
      if (new Date(intent.expires_at).getTime() <= Date.now()) {
        await connection.query("UPDATE payment_intents SET status='EXPIRED',last_error='El enlace de pago venció' WHERE id=?", [intent.id]);
        throw new HttpError({ code: "ONLINE_PAYMENT_INTENT_EXPIRED", message: "El enlace de pago venció; genera uno nuevo.", statusCode: 409 });
      }
      const [orders] = await connection.query<(RowDataPacket & { status: string; expires_at: Date; infraction_id: number; site_id: number })[]>(
        `SELECT po.status,po.expires_at,po.infraction_id,i.site_id FROM payment_orders po JOIN infractions i ON i.id=po.infraction_id WHERE po.id=? FOR UPDATE`, [intent.payment_order_id],
      );
      const order = orders[0];
      if (order?.status !== "ISSUED") throw new HttpError({ code: "PAYMENT_ORDER_NOT_PAYABLE", message: "La orden ya no está disponible para pago.", statusCode: 409 });
      if (new Date(order.expires_at).getTime() <= Date.now()) throw new HttpError({ code: "PAYMENT_ORDER_EXPIRED", message: "La orden de pago está vencida.", statusCode: 409 });
      await connection.query("SELECT id FROM infractions WHERE id=? FOR UPDATE", [order.infraction_id]);
      const balance = await calculateBalance(connection, order.infraction_id);
      if (normalizeMoney(intent.amount) !== balance.pendingBalance) throw new HttpError({ code: "PAYMENT_BALANCE_CHANGED", message: "El saldo cambió; el pago en línea no puede confirmarse con este enlace.", statusCode: 409 });
      const [created] = await connection.query<ResultSetHeader>(
        `INSERT INTO payments (public_reference,payment_order_id,cash_session_id,payment_method_id,amount,external_reference,status,created_by_user_id,created_request_id,confirmed_by_user_id,confirmation_request_id,confirmed_at)
         VALUES (?,?,NULL,?,?,?,'CONFIRMED',?,?,?,?,UTC_TIMESTAMP(3))`,
        [randomReference(), intent.payment_order_id, intent.payment_method_id, intent.amount, providerPaymentId, actor.userId, actor.requestId, actor.userId, actor.requestId],
      );
      await connection.query("INSERT INTO payment_allocations (payment_id,infraction_id,amount) VALUES (?,?,?)", [created.insertId, order.infraction_id, intent.amount]);
      const receiptNumber = await nextDocumentNumber(connection, order.site_id, "PAYMENT_RECEIPT", new Date().getUTCFullYear());
      await connection.query("INSERT INTO payment_receipts (payment_id,receipt_number,issued_by_user_id,original_request_id) VALUES (?,?,?,?)", [created.insertId, receiptNumber, actor.userId, actor.requestId]);
      await connection.query("UPDATE payment_orders SET status='USED',used_at=UTC_TIMESTAMP(3),payment_total_snapshot=?,pending_balance_snapshot='0.00' WHERE id=? AND status='ISSUED'", [centsToDecimal(decimalToCents(balance.paymentTotal) + decimalToCents(intent.amount)), intent.payment_order_id]);
      await connection.query("INSERT INTO payment_order_status_history (payment_order_id,from_status,to_status,action,request_id) VALUES (?,'ISSUED','USED','ONLINE_PAYMENT_CONFIRMED',?)", [intent.payment_order_id, actor.requestId]);
      await connection.query("UPDATE payment_intents SET status='SUCCEEDED',provider_payment_id=?,payment_id=?,completed_at=UTC_TIMESTAMP(3),last_error=NULL WHERE id=?", [providerPaymentId, created.insertId, intent.id]);
      return paymentDto(await this.loadPayment(connection, created.insertId));
    });
  }

  public async failOnlinePaymentIntent(reference: string, reason: string): Promise<OnlinePaymentIntentView> {
    return this.database.withTransaction(async (connection) => {
      const [rows] = await connection.query<(RowDataPacket & { id: number; status: string })[]>("SELECT id,status FROM payment_intents WHERE public_reference=? FOR UPDATE", [reference]);
      if (!rows[0]) throw new HttpError({ code: "ONLINE_PAYMENT_INTENT_NOT_FOUND", message: "El enlace de pago no existe.", statusCode: 404 });
      if (rows[0].status === "PENDING") await connection.query("UPDATE payment_intents SET status='FAILED',last_error=? WHERE id=?", [reason, rows[0].id]);
      return this.loadOnlineIntent(connection, rows[0].id, false);
    });
  }

  public async resolveSystemActor(): Promise<number> {
    const rows = await this.database.query<(RowDataPacket & { id: number })[]>(
      `SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.status='ACTIVE' AND r.code='ADMIN' ORDER BY u.id LIMIT 1`,
    );
    if (!rows[0]) throw new HttpError({ code: "ONLINE_PAYMENT_SYSTEM_ACTOR_UNAVAILABLE", message: "No hay un usuario institucional disponible para confirmar el pago.", statusCode: 503 });
    return rows[0].id;
  }

  public async openCashSession(input: { cashDeskId: number; openingAmount: string }, actor: PaymentActor) {
    const openingAmount = normalizeMoney(input.openingAmount);
    if (decimalToCents(openingAmount) < 0n) throw moneyError("El fondo inicial no puede ser negativo.");
    return this.database.withTransaction(async (connection) => {
      const [desks] = await connection.query<RowDataPacket[]>(
        `SELECT cd.id FROM cash_desks cd JOIN sites s ON s.id=cd.site_id
         WHERE cd.id=? AND cd.is_active=1 AND s.is_active=1 FOR UPDATE`,
        [input.cashDeskId],
      );
      if (!desks[0]) throw new HttpError({ code: "CASH_REGISTER_NOT_AVAILABLE", message: "La caja no existe o no está activa.", statusCode: 409 });
      const [users] = await connection.query<RowDataPacket[]>("SELECT id FROM users WHERE id=? AND status='ACTIVE' FOR UPDATE", [actor.userId]);
      if (!users[0]) throw new HttpError({ code: "CASHIER_NOT_ACTIVE", message: "El cajero no está activo.", statusCode: 409 });
      try {
        const [created] = await connection.query<ResultSetHeader>(
          "INSERT INTO cash_sessions (cash_desk_id,cashier_user_id,opened_by_user_id,opening_amount) VALUES (?,?,?,?)",
          [input.cashDeskId, actor.userId, actor.userId, openingAmount],
        );
        await connection.query(
          `INSERT INTO cash_movements (cash_session_id,movement_type,direction,amount,reason,created_by_user_id,request_id)
           VALUES (?,'OPENING','IN',?,'Fondo inicial declarado',?,?)`,
          [created.insertId, openingAmount, actor.userId, actor.requestId],
        );
        return await this.loadCashSession(connection, created.insertId);
      } catch (error) {
        if (isDuplicateKey(error)) throw new HttpError({ code: "CASH_SESSION_ALREADY_OPEN", message: "El cajero o la caja ya tiene un turno abierto.", statusCode: 409 });
        throw error;
      }
    });
  }

  public async currentCashSession(userId: number) {
    const rows = await this.database.query<(RowDataPacket & { id: number })[]>(
      "SELECT id FROM cash_sessions WHERE cashier_user_id=? AND status='OPEN' ORDER BY opened_at DESC LIMIT 1",
      [userId],
    );
    return rows[0] ? this.cashSessionSummary(this.database, rows[0].id) : null;
  }

  public async cashSessionSummary(database: Queryable, id: number) {
    const session = await this.loadCashSession(database, id);
    const movements = await queryRows<(RowDataPacket & { movement_type: string; direction: string; amount: string; is_cash: number | null })[]>(database,
      `SELECT cm.movement_type,cm.direction,cm.amount,
              CASE WHEN cm.payment_id IS NOT NULL THEN pm.is_cash
                   WHEN cm.payment_reversal_id IS NOT NULL THEN rpm.is_cash ELSE 1 END is_cash
       FROM cash_movements cm
       LEFT JOIN payments p ON p.id=cm.payment_id
       LEFT JOIN payment_methods pm ON pm.id=p.payment_method_id
       LEFT JOIN payment_reversals pr ON pr.id=cm.payment_reversal_id
       LEFT JOIN payments rp ON rp.id=pr.payment_id
       LEFT JOIN payment_methods rpm ON rpm.id=rp.payment_method_id
       WHERE cm.cash_session_id=? ORDER BY cm.created_at,cm.id`, [id]);
    let expected = 0n;
    let totalIn = 0n;
    let totalOut = 0n;
    for (const movement of movements) {
      const cents = decimalToCents(movement.amount);
      if (movement.direction === "IN") totalIn += cents; else totalOut += cents;
      if (movement.is_cash === 1) expected += movement.direction === "IN" ? cents : -cents;
    }
    const declared = session["closing_declared_amount"] === null ? null : normalizeMoney(String(session["closing_declared_amount"]));
    return {
      ...session,
      opening_amount: normalizeMoney(String(session["opening_amount"])),
      closing_declared_amount: declared,
      expected_closing_amount: centsToDecimal(expected),
      difference_amount: declared === null ? null : centsToDecimal(decimalToCents(declared) - expected),
      movement_totals: { in: centsToDecimal(totalIn), out: centsToDecimal(totalOut) },
      movements,
    };
  }

  public async addManualMovement(input: { sessionId: number; direction: "IN" | "OUT"; amount: string; reason: string; authorizationReference: string }, actor: PaymentActor) {
    const amount = positiveMoney(input.amount);
    return this.database.withTransaction(async (connection) => {
      const [sessions] = await connection.query<RowDataPacket[]>("SELECT id FROM cash_sessions WHERE id=? AND status='OPEN' FOR UPDATE", [input.sessionId]);
      if (!sessions[0]) throw new HttpError({ code: "CASH_SESSION_NOT_OPEN", message: "El turno de caja no está abierto.", statusCode: 409 });
      const [created] = await connection.query<ResultSetHeader>(
        `INSERT INTO cash_movements (cash_session_id,movement_type,direction,amount,reason,authorization_reference,created_by_user_id,request_id)
         VALUES (?,?,?,?,?,?,?,?)`,
        [input.sessionId, input.direction === "IN" ? "MANUAL_INCOME" : "MANUAL_EXPENSE", input.direction, amount, input.reason, input.authorizationReference, actor.userId, actor.requestId],
      );
      return { id: String(created.insertId), amount, direction: input.direction };
    });
  }

  public async closeCashSession(input: { sessionId: number; declaredAmount: string; note?: string | undefined }, actor: PaymentActor) {
    const declared = normalizeMoney(input.declaredAmount);
    if (decimalToCents(declared) < 0n) throw moneyError("El efectivo declarado no puede ser negativo.");
    return this.database.withTransaction(async (connection) => {
      const [rows] = await connection.query<RowDataPacket[]>("SELECT id,status FROM cash_sessions WHERE id=? FOR UPDATE", [input.sessionId]);
      if (!rows[0]) throw new HttpError({ code: "CASH_SESSION_NOT_FOUND", message: "Turno de caja no encontrado.", statusCode: 404 });
      if (rows[0]["status"] !== "OPEN") throw new HttpError({ code: "CASH_SESSION_ALREADY_CLOSED", message: "El turno de caja ya fue cerrado.", statusCode: 409 });
      const summary = await this.cashSessionSummary(connection, input.sessionId);
      const expected = summary.expected_closing_amount;
      const difference = centsToDecimal(decimalToCents(declared) - decimalToCents(expected));
      await connection.query(
        `UPDATE cash_sessions SET status='CLOSED',closing_declared_amount=?,expected_closing_amount=?,difference_amount=?,closing_note=?,closed_at=UTC_TIMESTAMP(3),closed_by_user_id=? WHERE id=?`,
        [declared, expected, difference, input.note ?? null, actor.userId, input.sessionId],
      );
      return this.cashSessionSummary(connection, input.sessionId);
    });
  }

  public async createPayment(input: { paymentOrderId: number; paymentMethodId: number; amount: string; externalReference?: string | undefined }, actor: PaymentActor, idempotencyKey: string): Promise<{ payment: PaymentView; replay: boolean }> {
    const amount = positiveMoney(input.amount);
    const requestHash = sha256(JSON.stringify({ ...input, amount }));
    return this.database.withTransaction(async (connection) => {
      const replay = await this.loadIdempotent(connection, actor.userId, "PAYMENT_CREATE", idempotencyKey, requestHash);
      if (replay) return { payment: paymentDto(await this.loadPayment(connection, replay)), replay: true };
      const [sessions] = await connection.query<(RowDataPacket & { id: number })[]>(
        "SELECT id FROM cash_sessions WHERE cashier_user_id=? AND status='OPEN' FOR UPDATE", [actor.userId]);
      const session = sessions[0];
      if (!session) throw new HttpError({ code: "CASH_SESSION_REQUIRED", message: "Debe abrir un turno de caja antes de registrar pagos.", statusCode: 409 });
      const [methods] = await connection.query<(RowDataPacket & { requires_reference: number })[]>(
        "SELECT requires_reference FROM payment_methods WHERE id=? AND is_active=1 FOR UPDATE", [input.paymentMethodId]);
      const method = methods[0];
      if (!method) throw new HttpError({ code: "PAYMENT_METHOD_NOT_AVAILABLE", message: "El método de pago no existe o no está activo.", statusCode: 409 });
      if (method.requires_reference === 1 && !input.externalReference) throw new HttpError({ code: "PAYMENT_REFERENCE_REQUIRED", message: "El método de pago requiere número de autorización o referencia.", statusCode: 422 });
      const [orders] = await connection.query<(RowDataPacket & { id: number; infraction_id: number; pending_balance_snapshot: string; status: string; expires_at: Date })[]>(
        "SELECT id,infraction_id,pending_balance_snapshot,status,expires_at FROM payment_orders WHERE id=? FOR UPDATE", [input.paymentOrderId]);
      const order = orders[0];
      if (!order) throw new HttpError({ code: "PAYMENT_ORDER_NOT_FOUND", message: "Orden de pago no encontrada.", statusCode: 404 });
      if (order.status !== "ISSUED") throw new HttpError({ code: "PAYMENT_ORDER_NOT_PAYABLE", message: "La orden está cancelada, vencida o ya fue utilizada.", statusCode: 409 });
      if (order.expires_at.getTime() <= Date.now()) throw new HttpError({ code: "PAYMENT_ORDER_EXPIRED", message: "La orden de pago está vencida.", statusCode: 409 });
      await connection.query("SELECT id FROM infractions WHERE id=? FOR UPDATE", [order.infraction_id]);
      const balance = await calculateBalance(connection, order.infraction_id);
      if (decimalToCents(amount) > decimalToCents(balance.pendingBalance)) throw new HttpError({ code: "PAYMENT_EXCEEDS_BALANCE", message: "El monto no puede superar el saldo vigente.", statusCode: 409 });
      if (amount !== balance.pendingBalance || amount !== normalizeMoney(order.pending_balance_snapshot)) throw new HttpError({ code: "PAYMENT_AMOUNT_MUST_EQUAL_ORDER_BALANCE", message: "La orden debe pagarse por su saldo exacto vigente.", statusCode: 409 });
      try {
        const [created] = await connection.query<ResultSetHeader>(
          `INSERT INTO payments (public_reference,payment_order_id,cash_session_id,payment_method_id,amount,external_reference,created_by_user_id,created_request_id)
           VALUES (?,?,?,?,?,?,?,?)`,
          [randomReference(), order.id, session.id, input.paymentMethodId, amount, input.externalReference ?? null, actor.userId, actor.requestId],
        );
        await connection.query("INSERT INTO payment_allocations (payment_id,infraction_id,amount) VALUES (?,?,?)", [created.insertId, order.infraction_id, amount]);
        await this.saveIdempotent(connection, actor.userId, "PAYMENT_CREATE", idempotencyKey, requestHash, created.insertId, 201);
        return { payment: paymentDto(await this.loadPayment(connection, created.insertId)), replay: false };
      } catch (error) {
        if (isDuplicateKey(error)) throw new HttpError({ code: "PAYMENT_ORDER_ALREADY_HAS_PAYMENT", message: "La orden ya tiene un pago registrado.", statusCode: 409 });
        throw error;
      }
    });
  }

  public async confirmPayment(paymentId: number, actor: PaymentActor, idempotencyKey: string): Promise<{ payment: PaymentView; replay: boolean }> {
    const requestHash = sha256(String(paymentId));
    return this.database.withTransaction(async (connection) => {
      const replay = await this.loadIdempotent(connection, actor.userId, "PAYMENT_CONFIRM", idempotencyKey, requestHash);
      if (replay) return { payment: paymentDto(await this.loadPayment(connection, replay)), replay: true };
      const payment = await this.loadPayment(connection, paymentId, true);
      if (payment.status === "CONFIRMED") return { payment: paymentDto(payment), replay: true };
      if (payment.cash_session_id === null) throw new HttpError({ code: "ONLINE_PAYMENT_CONFIRMATION_REQUIRED", message: "Los pagos en línea se confirman exclusivamente mediante el proveedor autorizado.", statusCode: 409 });
      const [sessions] = await connection.query<RowDataPacket[]>("SELECT id,status FROM cash_sessions WHERE id=? FOR UPDATE", [payment.cash_session_id]);
      if (sessions[0]?.["status"] !== "OPEN") throw new HttpError({ code: "CASH_SESSION_NOT_OPEN", message: "El turno asociado al pago ya no está abierto.", statusCode: 409 });
      const [orders] = await connection.query<(RowDataPacket & { status: string; expires_at: Date; infraction_id: number; site_id: number })[]>(
        `SELECT po.status,po.expires_at,po.infraction_id,i.site_id FROM payment_orders po JOIN infractions i ON i.id=po.infraction_id WHERE po.id=? FOR UPDATE`,
        [payment.payment_order_id],
      );
      const order = orders[0];
      if (order?.status !== "ISSUED") throw new HttpError({ code: "PAYMENT_ORDER_NOT_PAYABLE", message: "La orden ya no está disponible para pago.", statusCode: 409 });
      if (order.expires_at.getTime() <= Date.now()) throw new HttpError({ code: "PAYMENT_ORDER_EXPIRED", message: "La orden de pago está vencida.", statusCode: 409 });
      await connection.query("SELECT id FROM infractions WHERE id=? FOR UPDATE", [order.infraction_id]);
      const balance = await calculateBalance(connection, order.infraction_id);
      if (normalizeMoney(payment.amount) !== balance.pendingBalance) throw new HttpError({ code: "PAYMENT_BALANCE_CHANGED", message: "El saldo cambió; el pago no puede confirmarse con esta orden.", statusCode: 409 });
      const receiptNumber = await nextDocumentNumber(connection, order.site_id, "PAYMENT_RECEIPT", new Date().getUTCFullYear());
      await connection.query(
        "UPDATE payments SET status='CONFIRMED',confirmed_by_user_id=?,confirmation_request_id=?,confirmed_at=UTC_TIMESTAMP(3) WHERE id=? AND status='REGISTERED'",
        [actor.userId, actor.requestId, paymentId],
      );
      await connection.query(
        "INSERT INTO payment_receipts (payment_id,receipt_number,issued_by_user_id,original_request_id) VALUES (?,?,?,?)",
        [paymentId, receiptNumber, actor.userId, actor.requestId],
      );
      await connection.query(
        `INSERT INTO cash_movements (cash_session_id,movement_type,direction,amount,payment_id,reason,created_by_user_id,request_id)
         VALUES (?,'PAYMENT','IN',?,?,'Pago confirmado contra orden vigente',?,?)`,
        [payment.cash_session_id, payment.amount, paymentId, actor.userId, actor.requestId],
      );
      await connection.query("UPDATE payment_orders SET status='USED',used_at=UTC_TIMESTAMP(3),payment_total_snapshot=?,pending_balance_snapshot='0.00' WHERE id=? AND status='ISSUED'", [centsToDecimal(decimalToCents(balance.paymentTotal) + decimalToCents(payment.amount)), payment.payment_order_id]);
      await connection.query(
        "INSERT INTO payment_order_status_history (payment_order_id,from_status,to_status,action,request_id) VALUES (?,'ISSUED','USED','PAYMENT_CONFIRMED',?)",
        [payment.payment_order_id, actor.requestId],
      );
      await this.saveIdempotent(connection, actor.userId, "PAYMENT_CONFIRM", idempotencyKey, requestHash, paymentId, 200);
      return { payment: paymentDto(await this.loadPayment(connection, paymentId)), replay: false };
    });
  }

  public async reversePayment(paymentId: number, input: { reason: string; authorizationReference: string }, actor: PaymentActor, idempotencyKey: string): Promise<{ payment: PaymentView; replay: boolean }> {
    const requestHash = sha256(JSON.stringify({ paymentId, ...input }));
    return this.database.withTransaction(async (connection) => {
      const replay = await this.loadIdempotent(connection, actor.userId, "PAYMENT_REVERSE", idempotencyKey, requestHash);
      if (replay) return { payment: paymentDto(await this.loadPayment(connection, replay)), replay: true };
      const payment = await this.loadPayment(connection, paymentId, true);
      if (payment.status !== "CONFIRMED") throw new HttpError({ code: "PAYMENT_NOT_CONFIRMED", message: "Solo se puede reversar un pago confirmado.", statusCode: 409 });
      if (payment.reversal_id !== null) throw new HttpError({ code: "PAYMENT_ALREADY_REVERSED", message: "El pago ya tiene una contrapartida de reverso.", statusCode: 409 });
      if (payment.cash_session_id === null) throw new HttpError({ code: "ONLINE_PAYMENT_REVERSAL_REQUIRES_GATEWAY", message: "Un pago en línea debe reversarse en la pasarela autorizada antes de reflejar el cambio en el sistema.", statusCode: 409 });
      const [sessions] = await connection.query<(RowDataPacket & { id: number })[]>(
        "SELECT id FROM cash_sessions WHERE cashier_user_id=? AND status='OPEN' FOR UPDATE", [actor.userId]);
      if (!sessions[0]) throw new HttpError({ code: "CASH_SESSION_REQUIRED", message: "Debe existir un turno abierto para registrar la contrapartida.", statusCode: 409 });
      const [created] = await connection.query<ResultSetHeader>(
        `INSERT INTO payment_reversals (payment_id,reversal_reference,amount,reason,authorization_reference,cash_session_id,reversed_by_user_id,request_id)
         VALUES (?,?,?,?,?,?,?,?)`,
        [paymentId, randomReference(), payment.amount, input.reason, input.authorizationReference, sessions[0].id, actor.userId, actor.requestId],
      );
      await connection.query(
        `INSERT INTO cash_movements (cash_session_id,movement_type,direction,amount,payment_reversal_id,reason,authorization_reference,created_by_user_id,request_id)
         VALUES (?,'PAYMENT_REVERSAL','OUT',?,?,?,?,?,?)`,
        [sessions[0].id, payment.amount, created.insertId, input.reason, input.authorizationReference, actor.userId, actor.requestId],
      );
      const [affectedSolvencies] = await connection.query<(RowDataPacket & { id: number })[]>(
        `SELECT s.id FROM solvencies s JOIN infractions i ON i.vehicle_id=s.vehicle_id
         WHERE i.id=? AND s.status='VALID' FOR UPDATE`, [payment.infraction_id],
      );
      for (const solvency of affectedSolvencies) {
        const observationReason = "Pago reversado después de la emisión; el saldo debe revisarse.";
        await connection.query("UPDATE solvencies SET status='OBSERVED',observed_at=UTC_TIMESTAMP(3),observation_reason=? WHERE id=?", [observationReason, solvency.id]);
        await connection.query(
          "INSERT INTO solvency_status_history (solvency_id,from_status,to_status,action,reason,changed_by_user_id,request_id) VALUES (?,'VALID','OBSERVED','PAYMENT_REVERSED',?,?,?)",
          [solvency.id, observationReason, actor.userId, actor.requestId],
        );
      }
      const reversedBalance = await calculateBalance(connection, payment.infraction_id);
      await connection.query("UPDATE payment_orders SET payment_total_snapshot=?,pending_balance_snapshot=? WHERE id=?", [reversedBalance.paymentTotal, reversedBalance.pendingBalance, payment.payment_order_id]);
      await this.saveIdempotent(connection, actor.userId, "PAYMENT_REVERSE", idempotencyKey, requestHash, paymentId, 200);
      return { payment: paymentDto(await this.loadPayment(connection, paymentId)), replay: false };
    });
  }

  public async listPayments(input: { page: number; pageSize: number; status?: string | undefined; search?: string | undefined }) {
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (input.status) { clauses.push("p.status=?"); values.push(input.status); }
    if (input.search) { clauses.push("(p.public_reference LIKE ? OR po.order_number LIKE ? OR i.ticket_number LIKE ? OR pr.receipt_number LIKE ?)"); for (let index = 0; index < 4; index += 1) values.push(`%${input.search}%`); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const totalRows = await this.database.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM payments p JOIN payment_orders po ON po.id=p.payment_order_id JOIN infractions i ON i.id=po.infraction_id LEFT JOIN payment_receipts pr ON pr.payment_id=p.id ${where}`,
      values,
    );
    const rows = await this.database.query<PaymentRow[]>(`${paymentSelect()} ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`, [...values, input.pageSize, (input.page - 1) * input.pageSize]);
    return { items: rows.map(paymentDto), total: totalRows[0]?.total ?? 0 };
  }

  public async getPayment(id: number): Promise<PaymentView> { return paymentDto(await this.loadPayment(this.database, id)); }

  public async receipt(id: number, copy: boolean, actor: PaymentActor) {
    return this.database.withTransaction(async (connection) => {
      const payment = await this.loadPayment(connection, id, true);
      if (payment.status !== "CONFIRMED" || payment.receipt_number === null) throw new HttpError({ code: "PAYMENT_RECEIPT_NOT_AVAILABLE", message: "El recibo solo existe después de confirmar el pago.", statusCode: 409 });
      if (copy) await connection.query("UPDATE payment_receipts SET copy_count=copy_count+1,last_copied_at=UTC_TIMESTAMP(3),last_copied_by_user_id=? WHERE payment_id=?", [actor.userId, id]);
      return { payment: paymentDto(payment), copy };
    });
  }

  public async createReconciliation(input: { paymentMethodId: number; sourceType: "MANUAL" | "IMPORTED"; sourceReference: string; sourceFileName?: string | undefined; sourceChecksumSha256?: string | undefined; items: { paymentId: number; observedAmount: string; externalReference?: string | undefined; note?: string | undefined }[] }, actor: PaymentActor) {
    return this.database.withTransaction(async (connection) => {
      const [method] = await connection.query<RowDataPacket[]>("SELECT id FROM payment_methods WHERE id=? AND is_active=1 FOR UPDATE", [input.paymentMethodId]);
      if (!method[0]) throw new HttpError({ code: "PAYMENT_METHOD_NOT_AVAILABLE", message: "Método de pago no disponible.", statusCode: 409 });
      let expectedTotal = 0n;
      let observedTotal = 0n;
      const normalizedItems: { paymentId: number; expected: string; observed: string; difference: string; status: string; externalReference?: string | undefined; note?: string | undefined }[] = [];
      for (const item of input.items) {
        const [payments] = await connection.query<(RowDataPacket & { amount: string })[]>(
          `SELECT p.amount FROM payments p LEFT JOIN payment_reversals pr ON pr.payment_id=p.id
           WHERE p.id=? AND p.payment_method_id=? AND p.status='CONFIRMED' AND pr.id IS NULL FOR UPDATE`,
          [item.paymentId, input.paymentMethodId],
        );
        if (!payments[0]) throw new HttpError({ code: "RECONCILIATION_PAYMENT_INVALID", message: "Un pago no está confirmado, fue reversado o usa otro método.", statusCode: 409 });
        const expected = normalizeMoney(payments[0].amount);
        const observed = normalizeMoney(item.observedAmount);
        if (decimalToCents(observed) < 0n) throw moneyError("El monto observado no puede ser negativo.");
        const difference = centsToDecimal(decimalToCents(observed) - decimalToCents(expected));
        expectedTotal += decimalToCents(expected);
        observedTotal += decimalToCents(observed);
        normalizedItems.push({ ...item, expected, observed, difference, status: difference === "0.00" ? "MATCHED" : "DIFFERENCE" });
      }
      try {
        const [created] = await connection.query<ResultSetHeader>(
          `INSERT INTO reconciliation_batches (public_reference,payment_method_id,source_type,source_reference,source_file_name,source_checksum_sha256,status,expected_total,observed_total,difference_amount,created_by_user_id)
           VALUES (?,?,?,?,?,?,'OPEN',?,?,?,?)`,
          [randomReference(), input.paymentMethodId, input.sourceType, input.sourceReference, input.sourceFileName ?? null, input.sourceChecksumSha256 ?? null, centsToDecimal(expectedTotal), centsToDecimal(observedTotal), centsToDecimal(observedTotal - expectedTotal), actor.userId],
        );
        for (const item of normalizedItems) await connection.query(
          `INSERT INTO reconciliation_items (reconciliation_batch_id,payment_id,expected_amount,observed_amount,difference_amount,external_reference,status,note)
           VALUES (?,?,?,?,?,?,?,?)`,
          [created.insertId, item.paymentId, item.expected, item.observed, item.difference, item.externalReference ?? null, item.status, item.note ?? null],
        );
        return await this.getReconciliation(created.insertId, connection);
      } catch (error) {
        if (isDuplicateKey(error)) throw new HttpError({ code: "RECONCILIATION_DUPLICATE", message: "La fuente de conciliación ya fue registrada.", statusCode: 409 });
        throw error;
      }
    });
  }

  public async listReconciliations() {
    return this.database.query<RowDataPacket[]>(
      `SELECT rb.*,pm.code payment_method_code,pm.name payment_method_name,
              SUM(ri.status='MATCHED') matched_items,SUM(ri.status='DIFFERENCE') difference_items,COUNT(ri.id) item_count
       FROM reconciliation_batches rb JOIN payment_methods pm ON pm.id=rb.payment_method_id
       LEFT JOIN reconciliation_items ri ON ri.reconciliation_batch_id=rb.id
       GROUP BY rb.id ORDER BY rb.created_at DESC`,
    );
  }

  public async getReconciliation(id: number, database: Queryable = this.database) {
    const rows = await queryRows<ReconciliationRow[]>(database,
      `SELECT rb.*,pm.code payment_method_code,pm.name payment_method_name
       FROM reconciliation_batches rb JOIN payment_methods pm ON pm.id=rb.payment_method_id WHERE rb.id=?`, [id]);
    if (!rows[0]) throw new HttpError({ code: "RECONCILIATION_NOT_FOUND", message: "Conciliación no encontrada.", statusCode: 404 });
    const items = await queryRows<RowDataPacket[]>(database,
      `SELECT ri.*,p.public_reference payment_reference,pr.receipt_number
       FROM reconciliation_items ri JOIN payments p ON p.id=ri.payment_id LEFT JOIN payment_receipts pr ON pr.payment_id=p.id
       WHERE ri.reconciliation_batch_id=? ORDER BY ri.id`, [id]);
    return { ...rows[0], items };
  }

  public async closeReconciliation(id: number, note: string | undefined, actor: PaymentActor) {
    return this.database.withTransaction(async (connection) => {
      const [rows] = await connection.query<RowDataPacket[]>("SELECT id,status FROM reconciliation_batches WHERE id=? FOR UPDATE", [id]);
      if (!rows[0]) throw new HttpError({ code: "RECONCILIATION_NOT_FOUND", message: "Conciliación no encontrada.", statusCode: 404 });
      if (rows[0]["status"] !== "OPEN") throw new HttpError({ code: "RECONCILIATION_ALREADY_CLOSED", message: "La conciliación ya fue cerrada.", statusCode: 409 });
      await connection.query("UPDATE reconciliation_batches SET status='CLOSED',closed_by_user_id=?,closed_at=UTC_TIMESTAMP(3),closing_note=? WHERE id=?", [actor.userId, note ?? null, id]);
      return this.getReconciliation(id, connection);
    });
  }

  private async loadCashSession(database: Queryable, id: number) {
    const rows = await queryRows<RowDataPacket[]>(database,
      `SELECT cs.*,cd.code cash_desk_code,cd.name cash_desk_name,s.code site_code,s.name site_name,
              CONCAT(u.first_name,' ',u.last_name) cashier_name
       FROM cash_sessions cs JOIN cash_desks cd ON cd.id=cs.cash_desk_id JOIN sites s ON s.id=cd.site_id
       JOIN users u ON u.id=cs.cashier_user_id WHERE cs.id=?`, [id]);
    if (!rows[0]) throw new HttpError({ code: "CASH_SESSION_NOT_FOUND", message: "Turno de caja no encontrado.", statusCode: 404 });
    return rows[0];
  }

  private async loadPayment(database: Queryable, id: number, lock = false): Promise<PaymentRow> {
    const rows = await queryRows<PaymentRow[]>(database, `${paymentSelect()} WHERE p.id=?${lock ? " FOR UPDATE" : ""}`, [id]);
    if (!rows[0]) throw new HttpError({ code: "PAYMENT_NOT_FOUND", message: "Pago no encontrado.", statusCode: 404 });
    return rows[0];
  }

  private async loadIdempotent(connection: PoolConnection, userId: number, scope: string, key: string, requestHash: string): Promise<number | null> {
    const keyHash = sha256(key);
    await connection.query("DELETE FROM payment_idempotency_records WHERE actor_user_id=? AND scope=? AND key_hash=? AND expires_at<=UTC_TIMESTAMP(3)", [userId, scope, keyHash]);
    const [rows] = await connection.query<(RowDataPacket & { request_hash: string; resource_id: number })[]>(
      "SELECT request_hash,resource_id FROM payment_idempotency_records WHERE actor_user_id=? AND scope=? AND key_hash=? FOR UPDATE",
      [userId, scope, keyHash],
    );
    if (!rows[0]) return null;
    if (rows[0].request_hash !== requestHash) throw new HttpError({ code: "IDEMPOTENCY_KEY_REUSED", message: "La clave de idempotencia ya fue usada con otros datos.", statusCode: 409 });
    return rows[0].resource_id;
  }

  private async saveIdempotent(connection: PoolConnection, userId: number, scope: string, key: string, requestHash: string, resourceId: number, status: number): Promise<void> {
    await connection.query(
      `INSERT INTO payment_idempotency_records (actor_user_id,scope,key_hash,request_hash,resource_id,response_status,expires_at)
       VALUES (?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 24 HOUR))`,
      [userId, scope, sha256(key), requestHash, resourceId, status],
    );
  }

  private async loadOnlineIntent(database: Queryable, value: number | string, testMode: boolean, byReference = false): Promise<OnlinePaymentIntentView> {
    const rows = await queryRows<(RowDataPacket & { id: number; public_reference: string; order_number: string; payment_order_reference: string; provider_code: string; status: OnlinePaymentIntentView["status"]; amount: string; currency: string; checkout_url: string; provider_payment_id: string | null; payment_id: number | null; receipt_number: string | null; expires_at: Date; created_at: Date; completed_at: Date | null })[]>(database,
      `SELECT pi.id,pi.public_reference,po.order_number,po.public_reference payment_order_reference,pi.provider_code,pi.status,pi.amount,pi.currency,pi.checkout_url,pi.provider_payment_id,pi.payment_id,pr.receipt_number,pi.expires_at,pi.created_at,pi.completed_at
       FROM payment_intents pi JOIN payment_orders po ON po.id=pi.payment_order_id LEFT JOIN payment_receipts pr ON pr.payment_id=pi.payment_id
       WHERE ${byReference ? "pi.public_reference=?" : "pi.id=?"}`,
      [value],
    );
    const row = rows[0];
    if (!row) throw new HttpError({ code: "ONLINE_PAYMENT_INTENT_NOT_FOUND", message: "El enlace de pago no existe o ya no está disponible.", statusCode: 404 });
    if (row.status === "PENDING" && new Date(row.expires_at).getTime() <= Date.now()) {
      await queryRows(database, "UPDATE payment_intents SET status='EXPIRED',last_error='El enlace de pago venció' WHERE id=? AND status='PENDING'", [row.id]);
      row.status = "EXPIRED";
    }
    return { id: String(row.id), reference: row.public_reference, orderNumber: row.order_number, paymentOrderReference: row.payment_order_reference, paymentMethod: row.provider_code === "VISA_LINK" ? "VISA_LINK" : "CARD", providerCode: row.provider_code, status: row.status, amount: normalizeMoney(row.amount), currency: row.currency, checkoutUrl: row.checkout_url, providerPaymentId: row.provider_payment_id, paymentId: row.payment_id === null ? null : String(row.payment_id), receiptNumber: row.receipt_number, expiresAt: row.expires_at, createdAt: row.created_at, completedAt: row.completed_at, testMode };
  }
}

type Queryable = MySqlDatabase | PoolConnection;

async function queryRows<T extends RowDataPacket[]>(database: Queryable, sql: string, values: unknown[]): Promise<T> {
  if ("withTransaction" in database) return database.query<T>(sql, values);
  const [rows] = await database.query<T>(sql, values);
  return rows;
}

export async function calculateBalance(database: Queryable, infractionId: number) {
  const rows = await queryRows<(RowDataPacket & { total_amount: string; adjustment_total: string; payment_total: string })[]>(database,
    `SELECT i.total_amount,
            COALESCE((SELECT SUM(IF(a.direction='DEBIT',a.amount,-a.amount)) FROM infraction_adjustments a WHERE a.infraction_id=i.id AND a.status IN ('APPROVED','REVERSED')),0) adjustment_total,
            COALESCE((SELECT SUM(pa.amount) FROM payment_allocations pa JOIN payments p ON p.id=pa.payment_id AND p.status='CONFIRMED' LEFT JOIN payment_reversals pr ON pr.payment_id=p.id WHERE pa.infraction_id=i.id AND pr.id IS NULL),0) payment_total
     FROM infractions i WHERE i.id=?`, [infractionId]);
  const row = rows[0];
  if (!row) throw new HttpError({ code: "INFRACTION_NOT_FOUND", message: "Infracción no encontrada.", statusCode: 404 });
  const original = decimalToCents(row.total_amount);
  const adjustments = decimalToCents(row.adjustment_total);
  const payments = decimalToCents(row.payment_total);
  const pending = original + adjustments - payments;
  return {
    originalAmount: centsToDecimal(original),
    adjustmentTotal: centsToDecimal(adjustments),
    paymentTotal: centsToDecimal(payments),
    pendingBalance: centsToDecimal(pending > 0n ? pending : 0n),
  };
}

async function nextDocumentNumber(connection: PoolConnection, siteId: number, documentType: string, year: number): Promise<string> {
  const [rows] = await connection.query<(RowDataPacket & { id: number; prefix: string; next_number: number; padding_length: number })[]>(
    "SELECT id,prefix,next_number,padding_length FROM document_sequences WHERE site_id=? AND document_type=? AND sequence_year=? FOR UPDATE",
    [siteId, documentType, year],
  );
  const row = rows[0];
  if (!row) throw new HttpError({ code: "DOCUMENT_SEQUENCE_NOT_CONFIGURED", message: `El correlativo ${documentType} no está configurado para la sede y año.`, statusCode: 409 });
  await connection.query("UPDATE document_sequences SET next_number=next_number+1 WHERE id=?", [row.id]);
  return `${row.prefix}${String(row.next_number).padStart(row.padding_length, "0")}`;
}

function paymentSelect(): string {
  return `SELECT p.*,po.order_number,po.infraction_id,i.ticket_number,cd.name cash_desk_name,
                 pm.name payment_method_name,pm.is_cash,pr.receipt_number,pr.issued_at receipt_issued_at,pr.copy_count,
                 rv.id reversal_id,rv.reversal_reference,rv.reason reversal_reason,rv.reversed_at
          FROM payments p JOIN payment_orders po ON po.id=p.payment_order_id JOIN infractions i ON i.id=po.infraction_id
                 LEFT JOIN cash_sessions cs ON cs.id=p.cash_session_id LEFT JOIN cash_desks cd ON cd.id=cs.cash_desk_id
                 JOIN payment_methods pm ON pm.id=p.payment_method_id
                 LEFT JOIN payment_receipts pr ON pr.payment_id=p.id LEFT JOIN payment_reversals rv ON rv.payment_id=p.id`;
}

function paymentDto(row: PaymentRow): PaymentView {
  return {
    id: String(row.id), reference: row.public_reference, paymentOrderId: String(row.payment_order_id), orderNumber: row.order_number,
    infractionId: String(row.infraction_id), ticketNumber: row.ticket_number, cashSessionId: row.cash_session_id === null ? null : String(row.cash_session_id), cashDesk: row.cash_desk_name,
    paymentMethodId: String(row.payment_method_id), paymentMethod: row.payment_method_name, amount: normalizeMoney(row.amount), currency: row.currency,
    externalReference: row.external_reference, status: row.status, createdAt: row.created_at, confirmedAt: row.confirmed_at,
    receipt: row.receipt_number ? { number: row.receipt_number, issuedAt: row.receipt_issued_at, copyCount: row.copy_count ?? 0 } : null,
    reversal: row.reversal_id === null ? null : { id: String(row.reversal_id), reference: row.reversal_reference, reason: row.reversal_reason, reversedAt: row.reversed_at },
  };
}

function positiveMoney(value: string): string {
  const normalized = normalizeMoney(value);
  if (decimalToCents(normalized) <= 0n) throw moneyError("El monto debe ser mayor que cero.");
  return normalized;
}
function moneyError(message: string) { return new HttpError({ code: "MONEY_INVALID", message, statusCode: 422 }); }
function randomReference(): string { return randomBytes(20).toString("hex"); }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function isDuplicateKey(error: unknown): boolean { return typeof error === "object" && error !== null && "errno" in error && error.errno === 1062; }

function buildCheckoutUrl(config: OnlinePaymentConfig, reference: string, amount: string, expiresAt: Date): string {
  if (config.PAYMENT_GATEWAY_MODE === "test") return `${config.PUBLIC_APP_URL.replace(/\/$/, "")}/#/pago/checkout/${reference}`;
  if (!config.PAYMENT_GATEWAY_BASE_URL) throw new HttpError({ code: "ONLINE_PAYMENT_GATEWAY_NOT_CONFIGURED", message: "El proveedor de pagos no está configurado.", statusCode: 503 });
  const url = new URL(config.PAYMENT_GATEWAY_BASE_URL);
  url.searchParams.set("intent", reference);
  url.searchParams.set("amount", amount);
  url.searchParams.set("currency", "GTQ");
  url.searchParams.set("expiresAt", expiresAt.toISOString());
  return url.toString();
}
