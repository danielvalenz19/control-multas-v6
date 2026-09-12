import { API_BASE_URL, HttpClientError, httpRequest } from "@/src/services/httpClient";

type Envelope<T> = { data: T; meta: { requestId: string } };
export type SolvencyVehicle = { id: number; plate_original: string; registration_card: string; brand: string; vehicle_line: string; color: string; owner_name: string };
export type SolvencyDocument = { id: string; requestId: string; solvencyNumber: string; publicReference: string; vehicleId: string; vehicleSnapshot: { plate: string; registration: string; description: string }; ownerSnapshot: { citizenId: string; name: string; identification: string }; financialSnapshot: { balance: string; debtCount: number; openAppeals: number; pendingPayments: number; currency: string }; status: "VALID" | "REVOKED" | "OBSERVED" | "EXPIRED"; issuedAt: string; expiresAt: string; revokedAt: string | null; revocationReason: string | null; observedAt: string | null; observationReason: string | null };
export type SolvencyRequest = { id: number; request_number: string; vehicle_id: number; status: "PENDING_REVIEW" | "APPROVED" | "REJECTED"; vehicle_plate_snapshot: string; vehicle_registration_snapshot: string; vehicle_description_snapshot: string; owner_name_snapshot: string; owner_identification_snapshot: string; financial_balance_snapshot: string; open_infractions_snapshot: number; open_appeals_snapshot: number; pending_payments_snapshot: number; requested_at: string; reviewed_at: string | null; rejection_reason: string | null; solvency?: SolvencyDocument | null };
export type PublicSolvency = { solvencyNumber: string; publicReference: string; status: "VALID" | "REVOKED" | "OBSERVED" | "EXPIRED"; valid: boolean; issuedAt: string; expiresAt: string; notice: string };

export const solvenciesApi = {
  options: () => httpRequest<Envelope<SolvencyVehicle[]>>("/solvencies/options"),
  requests: () => httpRequest<Envelope<SolvencyRequest[]>>("/solvencies/requests"),
  request: (id: string) => httpRequest<Envelope<SolvencyRequest>>(`/solvencies/requests/${id}`),
  createRequest: (vehicleId: number) => httpRequest<Envelope<SolvencyRequest>>("/solvencies/requests", { method: "POST", body: { vehicleId } }),
  approve: (id: string) => httpRequest<Envelope<SolvencyDocument>>(`/solvencies/requests/${id}/approve`, { method: "POST", body: {} }),
  reject: (id: string, reason: string) => httpRequest<Envelope<SolvencyRequest>>(`/solvencies/requests/${id}/reject`, { method: "POST", body: { reason } }),
  revoke: (id: string, reason: string) => httpRequest<Envelope<SolvencyDocument>>(`/solvencies/${id}/revoke`, { method: "POST", body: { reason } }),
  verify: (publicReference: string) => httpRequest<Envelope<PublicSolvency>>(`/public/solvencies/${encodeURIComponent(publicReference)}/verify`, { handleUnauthorized: false }),
};

export async function openSolvencyDocument(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/solvencies/${id}/document`, { credentials: "include" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string }; meta?: { requestId?: string } };
    throw new HttpClientError(payload.error?.code ?? `HTTP_${response.status}`, payload.error?.message ?? "No se pudo descargar la solvencia.", response.status, payload.meta?.requestId ?? null);
  }
  const url = URL.createObjectURL(await response.blob()); window.open(url, "_blank", "noopener,noreferrer"); window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
