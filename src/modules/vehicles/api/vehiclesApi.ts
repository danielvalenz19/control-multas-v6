import { httpRequest } from "@/src/services/httpClient";
import type { PageMeta } from "@/src/modules/citizens/types/citizen.types";
import type { Ownership, Vehicle, VehicleInput, VehicleStatus } from "../types/vehicle.types";

export const vehiclesApi = {
  list(params: { search?: string; status?: VehicleStatus; page?: number; pageSize?: number } = {}) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") query.set(key, String(value));
    return httpRequest<{ data: Vehicle[]; meta: PageMeta }>(`/vehicles?${query.toString()}`);
  },
  create(input: VehicleInput) { return httpRequest<{ data: { id: string } }>("/vehicles", { method: "POST", body: input }); },
  update(id: string, input: Partial<VehicleInput>) { return httpRequest<void>(`/vehicles/${id}`, { method: "PATCH", body: input }); },
  activate(id: string) { return httpRequest<void>(`/vehicles/${id}/activate`, { method: "POST" }); },
  deactivate(id: string) { return httpRequest<void>(`/vehicles/${id}/deactivate`, { method: "POST" }); },
  ownerships(id: string) { return httpRequest<{ data: Ownership[] }>(`/vehicles/${id}/ownerships`); },
  assignOwner(id: string, citizenId: string) { return httpRequest<{ data: { id: string } }>(`/vehicles/${id}/ownerships`, { method: "POST", body: { citizenId, source: "REGISTRATION" } }); },
  endOwner(vehicleId: string, ownershipId: string) { return httpRequest<void>(`/vehicles/${vehicleId}/ownerships/${ownershipId}/end`, { method: "POST", body: {} }); },
};
