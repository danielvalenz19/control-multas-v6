import { API_BASE_URL, httpRequest } from "@/src/services/httpClient";

export type InfractionStatus =
  | "BORRADOR"
  | "PENDIENTE_VALIDACION"
  | "DEVUELTA_CORRECCION"
  | "VALIDADA"
  | "RECHAZADA"
  | "ANULADA";
export type InfractionSummary = {
  id: number;
  ticket_number: string;
  case_number: string;
  status: InfractionStatus;
  occurred_at: string;
  total_amount: string;
  vehicle_plate_snapshot: string;
  citizen_name_snapshot: string | null;
  agent_name_snapshot: string;
  created_at: string;
};
export type InfractionItem = {
  id: number;
  infraction_type_id: number;
  type_code_snapshot: string;
  type_name_snapshot: string;
  legal_basis_snapshot: string;
  amount_snapshot: string;
};
export type Evidence = {
  id: number;
  evidence_type: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  checksum_sha256: string;
  status: string;
  created_at: string;
};
export type InfractionDetail = InfractionSummary & {
  observations: string | null;
  driver_absent: number;
  driver_refused_signature: number;
  vehicle_registration_card_snapshot: string;
  vehicle_type_snapshot: string;
  vehicle_brand_snapshot: string;
  vehicle_line_snapshot: string;
  vehicle_color_snapshot: string;
  citizen_identification_snapshot: string | null;
  citizen_nit_snapshot: string | null;
  citizen_address_snapshot: string | null;
  location_snapshot: string;
  submitted_at: string | null;
  validated_at: string | null;
  items: InfractionItem[];
  location: Record<string, unknown> | null;
  evidence: Evidence[];
  reviews: Record<string, unknown>[];
};
export type TimelineEntry = {
  id: number;
  from_status: InfractionStatus | null;
  to_status: InfractionStatus;
  action: string;
  comment: string | null;
  indicated_fields: string[] | null;
  created_at: string;
  reason_code: string | null;
  reason_name: string | null;
  changed_by: string;
};
export type DraftInput = {
  siteId: string;
  agentId: string;
  deviceId: string;
  citizenId: string | null;
  vehicleId: string;
  occurredAt: string;
  driverAbsent: boolean;
  driverRefusedSignature: boolean;
  observations: string | null;
  items: { infractionTypeId: string }[];
  location: {
    frequentLocationId?: string | null;
    placeName: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
  };
};
const query = (params: Record<string, string | number | undefined>) => {
  const output = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== "") output.set(key, String(value));
  return output.toString();
};
export const infractionsApi = {
  list: (
    params: {
      search?: string;
      status?: InfractionStatus;
      page?: number;
      pageSize?: number;
    } = {},
  ) =>
    httpRequest<{
      data: InfractionSummary[];
      meta: {
        page: number;
        pageSize: number;
        total: number;
        requestId: string;
      };
    }>(`/infractions?${query(params)}`),
  get: (id: string) =>
    httpRequest<{ data: InfractionDetail }>(`/infractions/${id}`),
  create: (input: DraftInput, key = crypto.randomUUID()) =>
    httpRequest<{
      data: {
        id: string;
        ticketNumber: string;
        caseNumber: string;
        totalAmount: string;
        status: InfractionStatus;
      };
    }>("/infractions", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: input,
    }),
  update: (id: string, input: Partial<DraftInput>) =>
    httpRequest<void>(`/infractions/${id}`, { method: "PATCH", body: input }),
  submit: (id: string) =>
    httpRequest<void>(`/infractions/${id}/submit`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: {},
    }),
  transition: (
    id: string,
    action: "validate" | "return" | "reject" | "cancel",
    body: unknown = {},
  ) =>
    httpRequest<void>(`/infractions/${id}/${action}`, { method: "POST", body }),
  timeline: (id: string) =>
    httpRequest<{ data: TimelineEntry[] }>(`/infractions/${id}/timeline`),
  upload: (
    id: string,
    file: File,
    type: "PHOTO" | "DOCUMENT" | "SIGNATURE",
    deviceId?: string,
  ) =>
    httpRequest<{ data: { id: string; checksum: string; sizeBytes: number } }>(
      `/infractions/${id}/evidence`,
      {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "X-File-Name": file.name,
          "X-Evidence-Type": type,
          ...(deviceId ? { "X-Device-Id": deviceId } : {}),
        },
        body: file,
      },
    ),
  evidenceUrl: (id: string, evidenceId: number) =>
    `${API_BASE_URL}/infractions/${id}/evidence/${evidenceId}`,
};
