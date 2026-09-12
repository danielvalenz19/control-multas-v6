import { useCallback, useEffect, useState } from "react";
import { citizensApi } from "../api/citizensApi";
import type { Citizen, CitizenStatus, PageMeta } from "../types/citizen.types";

export function useCitizens(search: string, status?: CitizenStatus) {
  const [rows, setRows] = useState<Citizen[]>([]);
  const [meta, setMeta] = useState<PageMeta>({ page: 1, pageSize: 20, total: 0, requestId: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try { const result = await citizensApi.list({ search, status, pageSize: 50 }); setRows(result.data); setMeta(result.meta); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudieron consultar ciudadanos."); }
    finally { setLoading(false); }
  }, [search, status]);
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 250); return () => window.clearTimeout(timer); }, [refresh]);
  return { rows, meta, loading, error, refresh };
}
