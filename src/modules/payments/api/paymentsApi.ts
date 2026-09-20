import { API_BASE_URL, HttpClientError, httpRequest } from "@/src/services/httpClient";

type Envelope<T> = { data: T; meta: { requestId: string; total?: number; idempotentReplay?: boolean } };

export type CashRegister = { id: number; code: string; name: string; site_name: string; is_active: number; current_session_id: number | null };
export type CashMovement = { movement_type: string; direction: "IN" | "OUT"; amount: string; is_cash: number };
export type CashSession = { id: number; cash_desk_id: number; cash_desk_name: string; status: "OPEN" | "CLOSED"; opening_amount: string; opened_at: string; closing_declared_amount: string | null; expected_closing_amount: string; difference_amount: string | null; movements: CashMovement[] };
export type PaymentMethod = { id: number; code: string; name: string; requires_reference: number; is_cash: number; is_active: number };
export type PayableOrder = { id: number; order_number: string; public_reference: string; pending_balance_snapshot: string; expires_at: string; ticket_number: string; vehicle_plate_snapshot: string };
export type Payment = { id: string; reference: string; paymentOrderId: string; orderNumber: string; infractionId: string; ticketNumber: string; cashSessionId: string | null; cashDesk: string | null; paymentMethodId: string; paymentMethod: string; amount: string; currency: string; externalReference: string | null; status: "REGISTERED" | "CONFIRMED"; createdAt: string; confirmedAt: string | null; receipt: { number: string; issuedAt: string; copyCount: number } | null; reversal: { id: string; reference: string; reason: string; reversedAt: string } | null };
export type OnlinePaymentIntent = { id: number; public_reference: string; provider_code: string; status: "PENDING" | "SUCCEEDED" | "FAILED" | "EXPIRED" | "CANCELLED"; amount: string; currency: string; provider_payment_id: string | null; expires_at: string; created_at: string; completed_at: string | null; order_number: string; payment_order_reference: string; receipt_number: string | null };
export type Reconciliation = { id: number; public_reference: string; payment_method_id: number; payment_method_name: string; source_type: string; source_reference: string; status: "OPEN" | "CLOSED"; expected_total: string; observed_total: string; difference_amount: string; item_count?: number; matched_items?: number; difference_items?: number; items?: Array<{ id: number; payment_id: number; receipt_number: string; expected_amount: string; observed_amount: string; difference_amount: string; status: string }> };

function idempotencyHeaders() { return { "Idempotency-Key": crypto.randomUUID() }; }

export const paymentsApi = {
  registers: () => httpRequest<Envelope<CashRegister[]>>("/cash-registers"),
  currentSession: () => httpRequest<Envelope<CashSession | null>>("/cash-sessions/current"),
  openSession: (input: { cashDeskId: number; openingAmount: string }) => httpRequest<Envelope<CashSession>>("/cash-sessions/open", { method: "POST", body: input }),
  closeSession: (id: number, input: { declaredAmount: string; note?: string }) => httpRequest<Envelope<CashSession>>(`/cash-sessions/${id}/close`, { method: "POST", body: input }),
  addMovement: (id: number, input: { direction: "IN" | "OUT"; amount: string; reason: string; authorizationReference: string }) => httpRequest<Envelope<{ id: string }>>(`/cash-sessions/${id}/movements`, { method: "POST", body: input }),
  options: () => httpRequest<Envelope<{ orders: PayableOrder[]; methods: PaymentMethod[] }>>("/payments/options"),
  list: () => httpRequest<Envelope<Payment[]>>("/payments?pageSize=100"),
  onlineIntents: () => httpRequest<Envelope<OnlinePaymentIntent[]>>("/payments/online-intents"),
  get: (id: string) => httpRequest<Envelope<Payment>>(`/payments/${id}`),
  create: (input: { paymentOrderId: number; paymentMethodId: number; amount: string; externalReference?: string }) => httpRequest<Envelope<Payment>>("/payments", { method: "POST", headers: idempotencyHeaders(), body: input }),
  confirm: (id: string) => httpRequest<Envelope<Payment>>(`/payments/${id}/confirm`, { method: "POST", headers: idempotencyHeaders(), body: {} }),
  reverse: (id: string, input: { reason: string; authorizationReference: string }) => httpRequest<Envelope<Payment>>(`/payments/${id}/reverse`, { method: "POST", headers: idempotencyHeaders(), body: input }),
  reconciliations: () => httpRequest<Envelope<Reconciliation[]>>("/reconciliations"),
  reconciliation: (id: number) => httpRequest<Envelope<Reconciliation>>(`/reconciliations/${id}`),
  createReconciliation: (input: { paymentMethodId: number; sourceType: "MANUAL" | "IMPORTED"; sourceReference: string; items: Array<{ paymentId: number; observedAmount: string }> }) => httpRequest<Envelope<Reconciliation>>("/reconciliations", { method: "POST", body: input }),
  closeReconciliation: (id: number, note: string) => httpRequest<Envelope<Reconciliation>>(`/reconciliations/${id}/close`, { method: "POST", body: { note } }),
};

export async function openReceipt(paymentId: string, copy = false): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/payments/${paymentId}/receipt?copy=${copy}`, { credentials: "include" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string }; meta?: { requestId?: string } };
    throw new HttpClientError(payload.error?.code ?? `HTTP_${response.status}`, payload.error?.message ?? "No se pudo descargar el recibo.", response.status, payload.meta?.requestId ?? null);
  }
  const url = URL.createObjectURL(await response.blob());
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
