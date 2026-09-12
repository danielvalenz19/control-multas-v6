import { API_BASE_URL, httpRequest } from "@/src/services/httpClient";

export type Metric = { label: string; count: number; amount?: string; direction?: string; resolved?: number; issued?: number; paid?: number };
export type DashboardData = {
  filter: { from: string; to: string; departmentId: number | null };
  departments: { id: number; code: string; name: string }[];
  kpis: { infractions: Metric[]; adjustments: Metric[]; payments: Metric; reversals: Metric; orders: Metric[]; cash: Metric[]; appeals: Metric[]; solvencies: Metric[] };
  charts: { byType: Metric[]; byAgent: Metric[]; byLocation: Metric[]; collectionDaily: Metric[]; collectionMonthly: Metric[]; byMethod: Metric[]; aging: Metric[]; appealTrend: Metric[]; issuedVsPaid: Metric[] };
};
export type ReportResponse = { data: Record<string, unknown>[]; meta: { page: number; pageSize: number; total: number; columns: string[]; requestId: string } };

export const analyticsApi = {
  dashboard: (params: URLSearchParams) => httpRequest<{ data: DashboardData }>(`/dashboard?${params.toString()}`),
  report: (type: string, params: URLSearchParams) => httpRequest<ReportResponse>(`/reports/${type}?${params.toString()}`),
  async download(path: string, filename: string) {
    const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });
    if (!response.ok) throw new Error("No se pudo generar la exportación.");
    const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
  },
};
