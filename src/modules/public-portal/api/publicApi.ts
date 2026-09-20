import { API_BASE_URL, HttpClientError, httpRequest } from "@/src/services/httpClient";

export type PublicInfraction = {
  reference: string;
  ticketNumber: string;
  plate: string;
  occurredAt: string;
  location: string;
  status: string;
  violations: { code: string; name: string; amount: string }[];
  balance: { originalAmount: string; adjustmentTotal: string; paymentTotal: string; pendingBalance: string; currency: "GTQ" };
  payment: { status: string; receiptNumber: string | null; confirmedAt: string | null } | null;
  paymentOrderEligible: boolean;
};

export type PublicPaymentOrder = {
  reference: string;
  orderNumber: string;
  ticketNumber: string;
  plate: string;
  originalAmount: string;
  adjustmentTotal: string;
  paymentTotal: string;
  pendingBalance: string;
  currency: "GTQ";
  status: "ISSUED" | "EXPIRED" | "USED" | "CANCELLED";
  issuedAt: string;
  expiresAt: string;
  paymentStatus: string | null;
  paymentReference: string | null;
  receiptNumber: string | null;
  notice: string;
};

export type OnlinePaymentIntent = {
  id: string;
  reference: string;
  orderNumber: string;
  paymentOrderReference: string;
  paymentMethod: "CARD" | "VISA_LINK";
  providerCode: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "EXPIRED" | "CANCELLED";
  amount: string;
  currency: "GTQ";
  checkoutUrl: string;
  providerPaymentId: string | null;
  paymentId: string | null;
  receiptNumber: string | null;
  expiresAt: string;
  createdAt: string;
  completedAt: string | null;
  testMode: boolean;
  notice: string;
};

type Envelope<T> = { data: T; meta: { requestId: string; idempotentReplay?: boolean } };

export const publicApi = {
  search: (ticketNumber: string, plate: string) => httpRequest<Envelope<PublicInfraction>>("/public/infractions/search", { method: "POST", body: { ticketNumber, plate }, handleUnauthorized: false }),
  getInfraction: (reference: string) => httpRequest<Envelope<PublicInfraction>>(`/public/infractions/${reference}`, { handleUnauthorized: false }),
  createOrder: (publicReference: string, idempotencyKey: string) => httpRequest<Envelope<PublicPaymentOrder>>("/public/payment-orders", { method: "POST", headers: { "idempotency-key": idempotencyKey }, body: { publicReference }, handleUnauthorized: false }),
  getOrder: (reference: string) => httpRequest<Envelope<PublicPaymentOrder>>(`/public/payment-orders/${reference}`, { handleUnauthorized: false }),
  createPaymentIntent: (paymentOrderReference: string, paymentMethod: OnlinePaymentIntent["paymentMethod"], idempotencyKey: string) => httpRequest<Envelope<OnlinePaymentIntent>>("/public/payment-intents", { method: "POST", headers: { "idempotency-key": idempotencyKey }, body: { paymentOrderReference, paymentMethod }, handleUnauthorized: false }),
  getPaymentIntent: (reference: string) => httpRequest<Envelope<OnlinePaymentIntent>>(`/public/payment-intents/${reference}`, { handleUnauthorized: false }),
  testConfirmPaymentIntent: (reference: string) => httpRequest<Envelope<{ id: string; status: string; receipt?: { number?: string } | null }>>(`/public/payment-intents/${reference}/test-confirm`, { method: "POST", body: {}, handleUnauthorized: false }),
  openOrderDocument: async (reference: string) => {
    const response = await fetch(`${API_BASE_URL}/public/payment-orders/${reference}/document`);
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string }; meta?: { requestId?: string } } | null;
      throw new HttpClientError(payload?.error?.code ?? `HTTP_${response.status}`, payload?.error?.message ?? "No se pudo obtener el documento.", response.status, payload?.meta?.requestId ?? null);
    }
    const url = URL.createObjectURL(await response.blob());
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
};
