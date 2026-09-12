import { useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControl, Grid, InputLabel, MenuItem, Paper, Select, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import AttachFileRoundedIcon from "@mui/icons-material/AttachFileRounded";
import GavelRoundedIcon from "@mui/icons-material/GavelRounded";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BusyButton, ConfirmDialog, EmptyState, ErrorState, LoadingState, PageHeader, StatCard, StatusChip, readableError } from "@/src/components/common";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import { appealsApi, type Adjustment, type AppealDetail, type AppealSummary } from "../api/appealsApi";

const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("es-GT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Pendiente de confirmar";
const formatMoney = (value: string) => new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(Number(value));

export function AppealsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<AppealSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ infractionId: "", appellantName: "", reason: "", description: "" });

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setRows((await appealsApi.list(search)).data); }
    catch (reason) { setError(readableError(reason)); }
    finally { setLoading(false); }
  }, [search]);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    setSaving(true); setError("");
    try {
      const result = await appealsApi.create({ ...form, infractionId: Number(form.infractionId) });
      setOpen(false); navigate(`/admin/impugnaciones/${result.data.id}`);
    } catch (reason) { setError(readableError(reason)); }
    finally { setSaving(false); }
  }

  const openCount = rows.filter((row) => !row.status.startsWith("RESUELTA") && row.status !== "DESISTIDA").length;
  return <Box className="module-page">
    <PageHeader eyebrow="Debido proceso" title="Impugnaciones" description="Expedientes reales, evidencia privada, plazos y resoluciones auditables." action={auth.hasPermission("appeals.create") ? <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setOpen(true)}>Registrar impugnación</Button> : undefined} />
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    <Grid container spacing={2} className="stats-grid">
      <Grid size={{ xs: 12, md: 4 }}><StatCard label="Abiertas" value={String(openCount)} helper="Requieren seguimiento" tone="warning" /></Grid>
      <Grid size={{ xs: 12, md: 4 }}><StatCard label="Resueltas" value={String(rows.length - openCount)} helper="Con trazabilidad legal" tone="success" /></Grid>
      <Grid size={{ xs: 12, md: 4 }}><StatCard label="Total" value={String(rows.length)} helper="Expedientes encontrados" /></Grid>
    </Grid>
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}><Stack direction={{ xs: "column", sm: "row" }} spacing={1}><TextField fullWidth size="small" label="Buscar por recurso, boleta o interesado" value={search} onChange={(event) => setSearch(event.target.value)} /><Button variant="outlined" onClick={() => void load()}>Buscar</Button></Stack></Paper>
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : rows.length === 0 ? <EmptyState title="No hay impugnaciones" description="Registre una únicamente cuando la infracción ya esté validada." /> :
    <Paper variant="outlined" className="data-table-card"><TableContainer><Table><TableHead><TableRow><TableCell>Recurso</TableCell><TableCell>Boleta</TableCell><TableCell>Interesado</TableCell><TableCell>Plazo</TableCell><TableCell>Estado</TableCell><TableCell align="right">Acción</TableCell></TableRow></TableHead><TableBody>{rows.map((row) => <TableRow hover key={row.id}><TableCell><strong>{row.appeal_number}</strong><Typography component="small" sx={{ display: "block" }} color="text.secondary">{formatDate(row.filed_at)}</Typography></TableCell><TableCell>{row.ticket_number}</TableCell><TableCell>{row.appellant_name_snapshot}</TableCell><TableCell>{formatDate(row.deadline_at)}</TableCell><TableCell><StatusChip status={row.status} /></TableCell><TableCell align="right"><Button component={Link} to={`/admin/impugnaciones/${row.id}`}>Abrir expediente</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer></Paper>}
    <Dialog open={open} onClose={() => !saving && setOpen(false)} fullWidth maxWidth="sm"><DialogTitle>Registrar impugnación</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><Alert severity="info">El plazo institucional se calcula únicamente si existe una regla vigente configurada.</Alert><TextField label="ID interno de la infracción validada" type="number" required value={form.infractionId} onChange={(event) => setForm({ ...form, infractionId: event.target.value })} /><TextField label="Nombre del interesado" required value={form.appellantName} onChange={(event) => setForm({ ...form, appellantName: event.target.value })} /><TextField label="Motivo" required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /><TextField label="Descripción detallada" multiline minRows={4} required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Stack></DialogContent><DialogActions><Button onClick={() => setOpen(false)}>Cancelar</Button><BusyButton busy={saving} variant="contained" disabled={!form.infractionId || form.appellantName.length < 2 || form.reason.length < 3 || form.description.length < 10} onClick={() => void create()}>Registrar</BusyButton></DialogActions></Dialog>
  </Box>;
}

export function AppealDetailPage() {
  const { id = "" } = useParams();
  const auth = useAuth();
  const [appeal, setAppeal] = useState<AppealDetail | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [balance, setBalance] = useState<{ originalAmount: string; adjustmentsTotal: string; pendingBalance: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dialog, setDialog] = useState<"info" | "withdraw" | "resolve" | "adjustment" | null>(null);
  const [comment, setComment] = useState("");
  const [resolution, setResolution] = useState({ decision: "CONFIRM" as "CONFIRM" | "MODIFY" | "ANNUL", summary: "", legalBasis: "", resolvedAmount: "" });
  const [adjustment, setAdjustment] = useState({ type: "DISCOUNT", direction: "CREDIT", amount: "", reason: "", legalBasis: "", authorizationReference: "" });
  const [decisionTarget, setDecisionTarget] = useState<{ item: Adjustment; action: "approve" | "reject" | "reverse" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const detail = (await appealsApi.get(id)).data;
      setAppeal(detail);
      const ledger = (await appealsApi.adjustments(detail.infraction_id)).data;
      setAdjustments(ledger.adjustments); setBalance(ledger.balance);
    } catch (reason) { setError(readableError(reason)); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function act(operation: () => Promise<unknown>, success: string) {
    setBusy(true); setError("");
    try { await operation(); setMessage(success); setDialog(null); setComment(""); await load(); }
    catch (reason) { setError(readableError(reason)); }
    finally { setBusy(false); }
  }
  if (loading) return <Box className="module-page"><LoadingState rows={8} /></Box>;
  if (!appeal) return <Box className="module-page"><ErrorState message={error || "El expediente no existe."} onRetry={() => void load()} /></Box>;

  return <Box className="module-page">
    <Button component={Link} to="/admin/impugnaciones" startIcon={<ArrowBackRoundedIcon />} sx={{ mb: 2 }}>Volver a impugnaciones</Button>
    <PageHeader eyebrow="Expediente de impugnación" title={appeal.appeal_number} description={`Boleta ${appeal.ticket_number} · Caso ${appeal.case_number}`} action={<StatusChip status={appeal.status} size="medium" />} />
    {message && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage("")}>{message}</Alert>}
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {appeal.deadline_configuration_status === "PENDING_CONFIRMATION" && <Alert severity="warning" sx={{ mb: 2 }}>El plazo queda pendiente: aún no existe una versión institucional vigente para calcularlo.</Alert>}
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, lg: 7 }}><Paper variant="outlined" sx={{ p: 2.5 }}><Stack spacing={2}><Typography variant="h6">Solicitud y revisión</Typography><Divider /><Typography><strong>Interesado:</strong> {appeal.appellant_name_snapshot}</Typography><Typography><strong>Motivo:</strong> {appeal.reason}</Typography><Typography color="text.secondary">{appeal.description}</Typography><Typography><strong>Fecha límite:</strong> {formatDate(appeal.deadline_at)}</Typography><Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ flexWrap: "wrap" }}>
        {["PRESENTADA", "REQUIERE_INFORMACION"].includes(appeal.status) && (auth.hasPermission("appeals.create") || auth.hasPermission("appeals.review")) && <BusyButton busy={busy} variant="contained" onClick={() => void act(() => appealsApi.submit(id), "Expediente enviado a revisión.")}>Enviar a revisión</BusyButton>}
        {appeal.status === "EN_REVISION" && auth.hasPermission("appeals.review") && <Button variant="outlined" onClick={() => setDialog("info")}>Solicitar información</Button>}
        {appeal.status === "EN_REVISION" && auth.hasPermission("appeals.resolve") && <Button variant="contained" startIcon={<GavelRoundedIcon />} onClick={() => setDialog("resolve")}>Resolver</Button>}
        {["PRESENTADA", "EN_REVISION", "REQUIERE_INFORMACION"].includes(appeal.status) && <Button color="warning" onClick={() => setDialog("withdraw")}>Registrar desistimiento</Button>}
      </Stack></Stack></Paper></Grid>
      <Grid size={{ xs: 12, lg: 5 }}><Paper variant="outlined" sx={{ p: 2.5 }}><Stack spacing={1.5}><Typography variant="h6">Evidencia privada</Typography>{appeal.evidence.length === 0 && <Typography color="text.secondary">Sin documentos adjuntos.</Typography>}{appeal.evidence.map((item) => <Button key={item.id} variant="text" startIcon={<AttachFileRoundedIcon />} onClick={() => void appealsApi.downloadEvidence(id, item)}>{item.original_name} · {Math.ceil(item.size_bytes / 1024)} KB</Button>)}{(auth.hasPermission("appeals.create") || auth.hasPermission("appeals.review")) && <Button component="label" variant="outlined">Adjuntar JPEG, PNG o PDF<input hidden type="file" accept="image/jpeg,image/png,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void act(() => appealsApi.uploadEvidence(id, file), "Evidencia privada agregada."); }} /></Button>}</Stack></Paper></Grid>
      <Grid size={12}><Paper variant="outlined" sx={{ p: 2.5 }}><Stack spacing={2}><Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", gap: 1 }}><Box><Typography variant="h6">Cuenta económica</Typography><Typography color="text.secondary">El monto original nunca se sobrescribe; cada cambio queda en el libro de ajustes.</Typography></Box>{auth.hasPermission("adjustments.create") && <Button variant="contained" onClick={() => setDialog("adjustment")}>Solicitar ajuste</Button>}</Stack>{balance && <Grid container spacing={2}><Grid size={{ xs: 12, sm: 4 }}><StatCard label="Monto original" value={formatMoney(balance.originalAmount)} helper="Valor inmutable" /></Grid><Grid size={{ xs: 12, sm: 4 }}><StatCard label="Ajustes netos" value={formatMoney(balance.adjustmentsTotal)} helper="Débitos menos créditos" /></Grid><Grid size={{ xs: 12, sm: 4 }}><StatCard label="Saldo" value={formatMoney(balance.pendingBalance)} helper="Pagos aún no implementados" tone="warning" /></Grid></Grid>}{adjustments.length === 0 ? <EmptyState title="Sin ajustes" description="No hay movimientos económicos para esta infracción." /> : <TableContainer><Table size="small"><TableHead><TableRow><TableCell>Tipo</TableCell><TableCell>Monto</TableCell><TableCell>Autorización</TableCell><TableCell>Estado</TableCell><TableCell align="right">Control</TableCell></TableRow></TableHead><TableBody>{adjustments.map((item) => <TableRow key={item.id}><TableCell>{item.adjustment_type}<Typography component="small" sx={{ display: "block" }} color="text.secondary">{item.reason}</Typography></TableCell><TableCell>{item.direction === "CREDIT" ? "−" : "+"}{formatMoney(item.amount)}</TableCell><TableCell>{item.authorization_reference}</TableCell><TableCell><StatusChip status={item.status} /></TableCell><TableCell align="right">{item.status === "PENDING_APPROVAL" && auth.hasPermission("adjustments.approve") && <><Button onClick={() => setDecisionTarget({ item, action: "approve" })}>Aprobar</Button><Button color="error" onClick={() => setDecisionTarget({ item, action: "reject" })}>Rechazar</Button></>}{item.status === "APPROVED" && auth.hasPermission("adjustments.reverse") && <Button color="warning" onClick={() => setDecisionTarget({ item, action: "reverse" })}>Reversar</Button>}</TableCell></TableRow>)}</TableBody></Table></TableContainer>}</Stack></Paper></Grid>
      <Grid size={12}><Paper variant="outlined" sx={{ p: 2.5 }}><Typography variant="h6" gutterBottom>Historial íntegro</Typography><Stack spacing={1.5}>{appeal.history.map((item) => <Box key={item.id} sx={{ borderLeft: "3px solid", borderColor: "primary.light", pl: 2 }}><Typography><strong>{item.action}</strong> · <StatusChip status={item.to_status} /></Typography><Typography color="text.secondary">{formatDate(item.created_at)} · {item.changed_by}{item.comment ? ` · ${item.comment}` : ""}</Typography></Box>)}</Stack></Paper></Grid>
    </Grid>
    <Dialog open={dialog === "info" || dialog === "withdraw"} onClose={() => setDialog(null)} fullWidth maxWidth="sm"><DialogTitle>{dialog === "info" ? "Solicitar información adicional" : "Registrar desistimiento"}</DialogTitle><DialogContent><TextField sx={{ mt: 1 }} fullWidth multiline minRows={3} label="Comentario obligatorio" value={comment} onChange={(event) => setComment(event.target.value)} /></DialogContent><DialogActions><Button onClick={() => setDialog(null)}>Cancelar</Button><BusyButton busy={busy} variant="contained" disabled={comment.length < 5} onClick={() => void act(() => dialog === "info" ? appealsApi.requestInformation(id, comment) : appealsApi.withdraw(id, comment), dialog === "info" ? "Información adicional solicitada." : "Desistimiento registrado.")}>Confirmar</BusyButton></DialogActions></Dialog>
    <Dialog open={dialog === "resolve"} onClose={() => setDialog(null)} fullWidth maxWidth="sm"><DialogTitle>Resolver impugnación</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><Alert severity="warning">Esta decisión cambia el expediente y queda registrada en auditoría. La persona creadora no puede resolverlo.</Alert><FormControl><InputLabel>Decisión</InputLabel><Select label="Decisión" value={resolution.decision} onChange={(event) => setResolution({ ...resolution, decision: event.target.value as typeof resolution.decision })}><MenuItem value="CONFIRM">Confirmar infracción</MenuItem><MenuItem value="MODIFY">Modificar monto</MenuItem><MenuItem value="ANNUL">Anular infracción</MenuItem></Select></FormControl>{resolution.decision === "MODIFY" && <TextField label="Monto resuelto exacto" value={resolution.resolvedAmount} onChange={(event) => setResolution({ ...resolution, resolvedAmount: event.target.value })} placeholder="150.00" />}<TextField label="Fundamento legal" value={resolution.legalBasis} onChange={(event) => setResolution({ ...resolution, legalBasis: event.target.value })} /><TextField label="Resumen de resolución" multiline minRows={4} value={resolution.summary} onChange={(event) => setResolution({ ...resolution, summary: event.target.value })} /></Stack></DialogContent><DialogActions><Button onClick={() => setDialog(null)}>Cancelar</Button><BusyButton busy={busy} variant="contained" disabled={resolution.summary.length < 10 || resolution.legalBasis.length < 3 || (resolution.decision === "MODIFY" && !resolution.resolvedAmount)} onClick={() => void act(() => appealsApi.resolve(id, { ...resolution, ...(resolution.decision !== "MODIFY" ? { resolvedAmount: undefined } : {}) }), "Resolución registrada con trazabilidad.")}>Registrar resolución</BusyButton></DialogActions></Dialog>
    <Dialog open={dialog === "adjustment"} onClose={() => setDialog(null)} fullWidth maxWidth="sm"><DialogTitle>Solicitar ajuste económico</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><Alert severity="info">El ajuste queda pendiente de aprobación por una persona distinta.</Alert><FormControl><InputLabel>Tipo</InputLabel><Select label="Tipo" value={adjustment.type} onChange={(event) => { const type = event.target.value; setAdjustment({ ...adjustment, type, direction: ["DISCOUNT", "PARTIAL_EXEMPTION", "TOTAL_EXEMPTION"].includes(type) ? "CREDIT" : "DEBIT" }); }}><MenuItem value="DISCOUNT">Descuento</MenuItem><MenuItem value="PARTIAL_EXEMPTION">Exoneración parcial</MenuItem><MenuItem value="TOTAL_EXEMPTION">Exoneración total</MenuItem><MenuItem value="SURCHARGE">Recargo</MenuItem><MenuItem value="AMOUNT_CORRECTION">Corrección de monto</MenuItem></Select></FormControl>{adjustment.type === "AMOUNT_CORRECTION" && <FormControl><InputLabel>Dirección</InputLabel><Select label="Dirección" value={adjustment.direction} onChange={(event) => setAdjustment({ ...adjustment, direction: event.target.value })}><MenuItem value="CREDIT">Crédito</MenuItem><MenuItem value="DEBIT">Débito</MenuItem></Select></FormControl>}<TextField label="Monto exacto" value={adjustment.amount} onChange={(event) => setAdjustment({ ...adjustment, amount: event.target.value })} /><TextField label="Referencia de autorización" value={adjustment.authorizationReference} onChange={(event) => setAdjustment({ ...adjustment, authorizationReference: event.target.value })} /><TextField label="Base legal (si aplica)" value={adjustment.legalBasis} onChange={(event) => setAdjustment({ ...adjustment, legalBasis: event.target.value })} /><TextField label="Justificación" multiline minRows={3} value={adjustment.reason} onChange={(event) => setAdjustment({ ...adjustment, reason: event.target.value })} /></Stack></DialogContent><DialogActions><Button onClick={() => setDialog(null)}>Cancelar</Button><BusyButton busy={busy} variant="contained" disabled={!adjustment.amount || adjustment.reason.length < 5 || adjustment.authorizationReference.length < 3} onClick={() => void act(() => appealsApi.createAdjustment(appeal.infraction_id, adjustment), "Ajuste enviado a aprobación.")}>Solicitar</BusyButton></DialogActions></Dialog>
    <ConfirmDialog open={Boolean(decisionTarget)} title={`${decisionTarget?.action === "approve" ? "Aprobar" : decisionTarget?.action === "reject" ? "Rechazar" : "Reversar"} ajuste`} description="La decisión afectará el saldo y quedará conservada en historial y auditoría. No puede decidir su propia solicitud." confirmLabel="Confirmar decisión" danger={decisionTarget?.action !== "approve"} onCancel={() => setDecisionTarget(null)} onConfirm={() => { if (!decisionTarget) return; const { item, action } = decisionTarget; setDecisionTarget(null); const commentByAction = { approve: "Aprobado desde expediente municipal", reject: "Rechazado desde expediente municipal", reverse: "Reversión autorizada desde expediente municipal" } as const; void act(() => appealsApi.decideAdjustment(appeal.infraction_id, item.id, action, commentByAction[action]), action === "approve" ? "Ajuste aprobado." : action === "reject" ? "Ajuste rechazado." : "Ajuste reversado mediante contrapartida."); }} />
  </Box>;
}
