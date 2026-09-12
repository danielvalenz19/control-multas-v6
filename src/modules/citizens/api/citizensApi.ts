import { httpRequest } from "@/src/services/httpClient";
import type { Citizen, CitizenInput, CitizenStatus, PageMeta } from "../types/citizen.types";

export const citizensApi = {
  list(params: { search?: string; status?: CitizenStatus; page?: number; pageSize?: number } = {}) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") query.set(key, String(value));
    return httpRequest<{ data: Citizen[]; meta: PageMeta }>(`/citizens?${query.toString()}`);
  },
  get(id: string) { return httpRequest<{ data: Citizen }>(`/citizens/${id}`); },
  create(input: CitizenInput) { return httpRequest<{ data: { id: string } }>("/citizens", { method: "POST", body: input }); },
  update(id: string, input: Partial<CitizenInput>) { return httpRequest<void>(`/citizens/${id}`, { method: "PATCH", body: input }); },
  activate(id: string) { return httpRequest<void>(`/citizens/${id}/activate`, { method: "POST" }); },
  deactivate(id: string) { return httpRequest<void>(`/citizens/${id}/deactivate`, { method: "POST" }); },
};
