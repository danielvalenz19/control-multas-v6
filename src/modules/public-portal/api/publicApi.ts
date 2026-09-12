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
  notice: string;
};

type Envelope<T> = { data: T; meta: { requestId: string; idempotentReplay?: boolean } };

export const publicApi = {
  search: (ticketNumber: string, plate: string) => httpRequest<Envelope<PublicInfraction>>("/public/infractions/search", { method: "POST", body: { ticketNumber, plate }, handleUnauthorized: false }),
  getInfraction: (reference: string) => httpRequest<Envelope<PublicInfraction>>(`/public/infractions/${reference}`, { handleUnauthorized: false }),
  createOrder: (publicReference: string, idempotencyKey: string) => httpRequest<Envelope<PublicPaymentOrder>>("/public/payment-orders", { method: "POST", headers: { "idempotency-key": idempotencyKey }, body: { publicReference }, handleUnauthorized: false }),
  getOrder: (reference: string) => httpRequest<Envelope<PublicPaymentOrder>>(`/public/payment-orders/${reference}`, { handleUnauthorized: false }),
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
