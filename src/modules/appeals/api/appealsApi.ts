import { API_BASE_URL, httpRequest } from "@/src/services/httpClient";

export type AppealSummary = {
  id: number;
  appeal_number: string;
  infraction_id: number;
  ticket_number: string;
  appellant_name_snapshot: string;
  filed_at: string;
  reason: string;
  status: string;
  deadline_at: string | null;
  deadline_configuration_status: "CONFIGURED" | "PENDING_CONFIRMATION";
  assignee_name: string | null;
};

export type AppealEvidence = {
  id: number;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  checksum_sha256: string;
  created_at: string;
};

export type AppealHistory = {
  id: number;
  from_status: string | null;
  to_status: string;
  action: string;
  comment: string | null;
  changed_by: string;
  created_at: string;
};

export type AppealDetail = AppealSummary & {
  case_number: string;
  infraction_status: string;
  original_amount: string;
  description: string;
  appellant_identification_snapshot: string | null;
  resolution_type: string | null;
  resolution_summary: string | null;
  resolution_legal_basis: string | null;
  resolved_amount: string | null;
  resolved_at: string | null;
  resolved_by_name: string | null;
  evidence: AppealEvidence[];
  history: AppealHistory[];
};

export type Adjustment = {
  id: number;
  adjustment_type: string;
  direction: "CREDIT" | "DEBIT";
  amount: string;
  status: string;
  reason: string;
  legal_basis: string | null;
  authorization_reference: string;
  requested_by: string;
  decided_by: string | null;
  requested_at: string;
};

type Envelope<T> = { data: T; meta: { requestId: string; total?: number } };

export const appealsApi = {
  list: (search = "") => httpRequest<Envelope<AppealSummary[]>>(`/appeals${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  get: (id: string) => httpRequest<Envelope<AppealDetail>>(`/appeals/${id}`),
  create: (body: { infractionId: number; appellantName: string; reason: string; description: string }) =>
    httpRequest<Envelope<{ id: string; appealNumber: string }>>("/appeals", { method: "POST", body }),
  update: (id: string, body: { reason?: string; description?: string }) => httpRequest<void>(`/appeals/${id}`, { method: "PATCH", body }),
  submit: (id: string) => httpRequest<void>(`/appeals/${id}/submit`, { method: "POST" }),
  requestInformation: (id: string, comment: string) => httpRequest<void>(`/appeals/${id}/request-information`, { method: "POST", body: { comment } }),
  withdraw: (id: string, comment: string) => httpRequest<void>(`/appeals/${id}/withdraw`, { method: "POST", body: { comment } }),
  resolve: (id: string, body: { decision: "CONFIRM" | "MODIFY" | "ANNUL"; summary: string; legalBasis: string; resolvedAmount?: string }) =>
    httpRequest<Envelope<{ status: string }>>(`/appeals/${id}/resolve`, { method: "POST", body }),
  uploadEvidence: (id: string, file: File) => httpRequest<Envelope<{ id: string }>>(`/appeals/${id}/evidence`, {
    method: "POST",
    body: file,
    headers: { "content-type": file.type, "x-file-name": file.name },
  }),
  downloadEvidence: async (appealId: string, evidence: AppealEvidence) => {
    const response = await fetch(`${API_BASE_URL}/appeals/${appealId}/evidence/${evidence.id}`, { credentials: "include" });
    if (!response.ok) throw new Error("No fue posible abrir el documento privado.");
    const url = URL.createObjectURL(await response.blob());
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
  adjustments: (infractionId: number) => httpRequest<Envelope<{ balance: { originalAmount: string; adjustmentsTotal: string; paymentsTotal: string; pendingBalance: string }; adjustments: Adjustment[] }>>(`/infractions/${infractionId}/adjustments`),
  createAdjustment: (infractionId: number, body: { type: string; direction?: string; amount: string; reason: string; legalBasis?: string; authorizationReference: string }) =>
    httpRequest<Envelope<{ id: string }>>(`/infractions/${infractionId}/adjustments`, { method: "POST", body }),
  decideAdjustment: (infractionId: number, adjustmentId: number, action: "approve" | "reject" | "reverse", comment: string) =>
    httpRequest<Envelope<unknown>>(`/infractions/${infractionId}/adjustments/${adjustmentId}/${action}`, { method: "POST", body: { comment } }),
};
