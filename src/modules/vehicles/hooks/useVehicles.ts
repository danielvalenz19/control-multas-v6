import { useCallback, useEffect, useState } from "react";
import { vehiclesApi } from "../api/vehiclesApi";
import type { Vehicle, VehicleStatus } from "../types/vehicle.types";
import type { PageMeta } from "@/src/modules/citizens/types/citizen.types";

export function useVehicles(search: string, status?: VehicleStatus) {
  const [rows, setRows] = useState<Vehicle[]>([]);
  const [meta, setMeta] = useState<PageMeta>({ page: 1, pageSize: 20, total: 0, requestId: "" });
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const refresh = useCallback(async () => { setLoading(true); setError(""); try { const result = await vehiclesApi.list({ search, status, pageSize: 50 }); setRows(result.data); setMeta(result.meta); } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudieron consultar vehículos."); } finally { setLoading(false); } }, [search, status]);
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 250); return () => window.clearTimeout(timer); }, [refresh]);
  return { rows, meta, loading, error, refresh };
}
