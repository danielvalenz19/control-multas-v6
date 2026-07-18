/**
 * Contrato preparado para reemplazar `mockApi` por un backend Express.
 * Las páginas consumen servicios de dominio, por lo que el cambio no exige
 * reescribir componentes ni reglas visuales.
 */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export const apiEndpoints = {
  session: `${API_BASE_URL}/auth/session`,
  me: `${API_BASE_URL}/auth/me`,
  infractions: `${API_BASE_URL}/infractions`,
  paymentOrders: `${API_BASE_URL}/payment-orders`,
  payments: `${API_BASE_URL}/payments`,
  reconciliation: `${API_BASE_URL}/payments/reconciliation`,
  solvencies: `${API_BASE_URL}/solvencies`,
  publicLookup: `${API_BASE_URL}/public/infractions/lookup`,
  publicVerify: `${API_BASE_URL}/public/solvencies/verify`,
  dashboard: `${API_BASE_URL}/dashboard/summary`,
  reports: `${API_BASE_URL}/reports`,
  audit: `${API_BASE_URL}/audit-logs`,
} as const;

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, credentials: "include" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw payload;
  return payload as T;
}
