import { httpRequest } from "@/src/services/httpClient";

export type Page<T> = {
  data: T[];
  meta: { page: number; pageSize: number; total: number; requestId: string };
};
export type ListParams = { search?: string; status?: string; page?: number; pageSize?: number };
export type AdminUser = {
  id: string; username: string; email: string | null; firstName: string; lastName: string;
  phone: string | null; employeeCode: string | null; departmentId: string | null;
  departmentName: string | null; status: "ACTIVE" | "DISABLED" | "LOCKED";
  roles: { code: string; name: string }[];
};
export type Role = {
  id: number; code: string; name: string; description: string | null; is_system: number;
  is_active: number; permission_count: number; user_count: number; permission_ids: string | null;
};
export type Permission = {
  id: number; code: string; module: string; action: string; description: string | null; is_active: number;
};
export type Agent = {
  id: number; user_id: number; badge_number: string; status: "ACTIVE" | "SUSPENDED" | "INACTIVE";
  hired_at: string | null; username: string; first_name: string; last_name: string; user_status: string;
};
export type Device = {
  id: number; device_uuid: string; institutional_code: string; device_type: string; platform: string;
  model: string | null; operating_system: string | null; app_version: string | null;
  status: "PENDING" | "ACTIVE" | "BLOCKED" | "RETIRED"; last_seen_at: string | null;
  assignment_id: number | null; user_id: number | null; username: string | null;
  first_name: string | null; last_name: string | null;
};
export type CatalogRow = Record<string, unknown> & { id: number };

function query(params: Record<string, string | number | undefined>) {
  const output = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") output.set(key, String(value));
  }
  return output.toString();
}

function pageQuery(params: ListParams = {}) {
  return query({ search: params.search, status: params.status, page: params.page ?? 1, pageSize: params.pageSize ?? 10 });
}

export const administrationApi = {
  users: {
    list: (params?: ListParams) => httpRequest<Page<AdminUser>>(`/users?${pageQuery(params)}`),
    create: (body: unknown) => httpRequest<{ data: { id: string } }>("/users", { method: "POST", body }),
    update: (id: string, body: unknown) => httpRequest<void>(`/users/${id}`, { method: "PATCH", body }),
    status: (id: string, active: boolean) => httpRequest<void>(`/users/${id}/${active ? "activate" : "deactivate"}`, { method: "POST" }),
    roles: (id: string, roleIds: number[]) => httpRequest<void>(`/users/${id}/roles`, { method: "PUT", body: { roleIds } }),
    revoke: (id: string) => httpRequest<void>(`/users/${id}/revoke-sessions`, { method: "POST" }),
  },
  roles: {
    list: () => httpRequest<{ data: { roles: Role[]; permissions: Permission[] } }>("/roles"),
    create: (body: unknown) => httpRequest<{ data: { id: string } }>("/roles", { method: "POST", body }),
    update: (id: number, body: unknown) => httpRequest<void>(`/roles/${id}`, { method: "PATCH", body }),
    permissions: (id: number, permissionIds: number[]) => httpRequest<void>(`/roles/${id}/permissions`, { method: "PUT", body: { permissionIds } }),
  },
  agents: {
    list: (params?: ListParams) => httpRequest<Page<Agent>>(`/agents?${pageQuery(params)}`),
    create: (body: unknown) => httpRequest<{ data: { id: string } }>("/agents", { method: "POST", body }),
    update: (id: number, body: unknown) => httpRequest<void>(`/agents/${id}`, { method: "PATCH", body }),
    status: (id: number, active: boolean) => httpRequest<void>(`/agents/${id}/${active ? "activate" : "deactivate"}`, { method: "POST" }),
  },
  devices: {
    list: (params?: ListParams) => httpRequest<Page<Device>>(`/devices?${pageQuery(params)}`),
    create: (body: unknown) => httpRequest<{ data: { id: string } }>("/devices", { method: "POST", body }),
    update: (id: number, body: unknown) => httpRequest<void>(`/devices/${id}`, { method: "PATCH", body }),
    assign: (id: number, userId: string) => httpRequest<{ data: { id: string } }>(`/devices/${id}/assign`, { method: "POST", body: { userId } }),
    unassign: (id: number, reason: string) => httpRequest<void>(`/devices/${id}/unassign`, { method: "POST", body: { reason } }),
    block: (id: number, blocked: boolean) => httpRequest<void>(`/devices/${id}/${blocked ? "block" : "unblock"}`, { method: "POST" }),
  },
  catalogs: {
    list: (name: string, params?: ListParams) => httpRequest<Page<CatalogRow>>(`/catalogs/${name}?${pageQuery(params)}`),
    create: (name: string, body: unknown) => httpRequest<{ data: { id: string } }>(`/catalogs/${name}`, { method: "POST", body }),
    update: (name: string, id: number, body: unknown) => httpRequest<void>(`/catalogs/${name}/${id}`, { method: "PATCH", body }),
    rates: (params?: ListParams) => httpRequest<Page<CatalogRow>>(`/catalogs/infraction-rate-versions?${pageQuery(params)}`),
    createRate: (body: unknown) => httpRequest<{ data: { id: string } }>("/catalogs/infraction-rate-versions", { method: "POST", body }),
    sequences: (params?: ListParams) => httpRequest<Page<CatalogRow>>(`/catalogs/document-sequences?${pageQuery(params)}`),
    createSequence: (body: unknown) => httpRequest<{ data: { id: string } }>("/catalogs/document-sequences", { method: "POST", body }),
    updateSequence: (id: number, body: unknown) => httpRequest<void>(`/catalogs/document-sequences/${id}`, { method: "PATCH", body }),
    next: (id: number) => httpRequest<{ data: { number: string } }>(`/catalogs/document-sequences/${id}/next`, { method: "POST" }),
    lookups: () => httpRequest<{ data: { sites: CatalogRow[]; zones: CatalogRow[]; departments: CatalogRow[] } }>("/catalogs/lookups"),
  },
};
