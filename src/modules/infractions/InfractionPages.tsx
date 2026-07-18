"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import AssignmentIndRoundedIcon from "@mui/icons-material/AssignmentIndRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import FilterAltOffRoundedIcon from "@mui/icons-material/FilterAltOffRounded";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ConfirmDialog,
  EmptyState,
  LoadingState,
  PageHeader,
  StatusChip,
  money,
  readableError,
} from "@/src/components/common";
import { useApp } from "@/src/contexts/AppContext";
import type { Infraction } from "@/src/types";

function FilterBar({ compact = false }: { compact?: boolean }) {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const legal = params.get("legal") ?? "";
  const zone = params.get("zone") ?? "";
  const agent = params.get("agent") ?? "";
  const type = params.get("type") ?? "";
  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }
  return (
    <Paper variant="outlined" className="filter-bar">
      <TextField
        className="filter-search"
        placeholder="Boleta, placa, propietario, agente o tipo"
        value={query}
        onChange={(event) => update("q", event.target.value)}
        slotProps={{ input: { startAdornment: <SearchRoundedIcon /> } }}
      />
      <FormControl size="small">
        <InputLabel>Estado legal</InputLabel>
        <Select
          value={legal}
          label="Estado legal"
          onChange={(event) => update("legal", event.target.value)}
        >
          <MenuItem value="">Todos</MenuItem>
          <MenuItem value="PENDIENTE_VALIDACION">Pendiente</MenuItem>
          <MenuItem value="VALIDADA">Validada</MenuItem>
          <MenuItem value="DEVUELTA_CORRECCION">Devuelta</MenuItem>
          <MenuItem value="RECHAZADA">Rechazada</MenuItem>
          <MenuItem value="ANULADA">Anulada</MenuItem>
        </Select>
      </FormControl>
      {!compact && (
        <>
          <FormControl size="small">
            <InputLabel>Agente</InputLabel>
            <Select
              value={agent}
              label="Agente"
              onChange={(event) => update("agent", event.target.value)}
            >
              <MenuItem value="">Todos</MenuItem>
              {[
                "Luis Hernández",
                "María López",
                "Carlos Pérez",
                "Ana Morales",
                "José Ramírez",
              ].map((value) => (
                <MenuItem value={value} key={value}>
                  {value}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel>Tipo</InputLabel>
            <Select
              value={type}
              label="Tipo"
              onChange={(event) => update("type", event.target.value)}
            >
              <MenuItem value="">Todos</MenuItem>
              {[
                "Estacionar en lugar prohibido",
                "Conducir sin licencia",
                "Obstruir la vía pública",
                "Exceso de velocidad",
                "No portar tarjeta de circulación",
              ].map((value) => (
                <MenuItem value={value} key={value}>
                  {value}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel>Zona</InputLabel>
            <Select
              value={zone}
              label="Zona"
              onChange={(event) => update("zone", event.target.value)}
            >
              <MenuItem value="">Todas</MenuItem>
              <MenuItem value="Zona 1">Zona 1</MenuItem>
              <MenuItem value="Zona 2">Zona 2</MenuItem>
              <MenuItem value="Ruta CA-2">Ruta CA-2</MenuItem>
            </Select>
          </FormControl>
          <TextField
            type="date"
            label="Desde"
            defaultValue="2026-07-01"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            type="date"
            label="Hasta"
            defaultValue="2026-07-14"
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </>
      )}
      <Button
        startIcon={<FilterAltOffRoundedIcon />}
        onClick={() => setParams({})}
      >
        Limpiar
      </Button>
    </Paper>
  );
}

function InfractionTable({
  rows,
  loading,
}: {
  rows: Infraction[];
  loading: boolean;
}) {
  const [page, setPage] = useState(0);
  const navigate = useNavigate();
  if (loading) return <LoadingState rows={7} />;
  if (!rows.length)
    return <EmptyState title="No hay infracciones con estos filtros" />;
  return (
    <Paper variant="outlined" className="data-table-card">
      <TableContainer>
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Boleta / expediente</TableCell>
              <TableCell>Fecha y hora</TableCell>
              <TableCell>Placa</TableCell>
              <TableCell>Infracción</TableCell>
              <TableCell>Agente</TableCell>
              <TableCell>Monto</TableCell>
              <TableCell>Estado legal</TableCell>
              <TableCell>Financiero</TableCell>
              <TableCell>Sincronización</TableCell>
              <TableCell align="right">Acción</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.slice(page * 8, page * 8 + 8).map((row) => (
              <TableRow hover key={row.id}>
                <TableCell>
                  <Typography component="strong">{row.ticket}</Typography>
                  <Typography component="small">{row.caseNumber}</Typography>
                </TableCell>
                <TableCell>
                  {new Date(row.occurredAt).toLocaleString("es-GT", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </TableCell>
                <TableCell>
                  <Chip variant="outlined" label={row.plate} />
                </TableCell>
                <TableCell>{row.type}</TableCell>
                <TableCell>{row.agent}</TableCell>
                <TableCell>
                  <strong>{money(row.amount)}</strong>
                </TableCell>
                <TableCell>
                  <StatusChip status={row.legalStatus} />
                </TableCell>
                <TableCell>
                  <StatusChip status={row.financialStatus} />
                </TableCell>
                <TableCell>
                  <StatusChip status={row.syncStatus} />
                </TableCell>
                <TableCell align="right">
                  <Button
                    size="small"
                    endIcon={<OpenInNewRoundedIcon />}
                    onClick={() => navigate(`/admin/infracciones/${row.id}`)}
                  >
                    Ver detalle
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={rows.length}
        page={page}
        onPageChange={(_, value) => setPage(value)}
        rowsPerPage={8}
        rowsPerPageOptions={[8]}
        labelDisplayedRows={({ from, to, count }) =>
          `${from}–${to} de ${count}`
        }
      />
    </Paper>
  );
}

export function InfractionsListPage() {
  const { infractions } = useApp();
  const [params, setParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"data" | "error">("data");
  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 420);
    return () => window.clearTimeout(timer);
  }, [params]);
  const view = params.get("view") ?? "";
  const rows = useMemo(() => {
    const query = (params.get("q") ?? "").toLowerCase();
    const legal = params.get("legal") ?? "";
    const zone = params.get("zone") ?? "";
    const agent = params.get("agent") ?? "";
    const type = params.get("type") ?? "";
    return infractions.filter(
      (row) =>
        (!query ||
          `${row.ticket} ${row.caseNumber} ${row.plate} ${row.citizen} ${row.agent} ${row.type}`
            .toLowerCase()
            .includes(query)) &&
        (!legal || row.legalStatus === legal) &&
        (!zone || row.zone === zone) &&
        (!agent || row.agent === agent) &&
        (!type || row.type === type) &&
        (!view ||
          (view === "PAGADA"
            ? row.financialStatus === "PAGADA"
            : row.legalStatus === view)),
    );
  }, [infractions, params, view]);
  function changeView(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set("view", value);
    else next.delete("view");
    setParams(next);
  }
  return (
    <Box className="module-page">
      <PageHeader
        eyebrow="Operación PMT"
        title="Infracciones"
        description="Consulta por boleta, placa, propietario, agente, fecha, ubicación y estado."
        action={
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<DownloadRoundedIcon />}
              onClick={() => window.print()}
            >
              Exportar
            </Button>
            <Button variant="contained" component={Link} to="/admin/bandeja">
              Bandeja de trabajo
            </Button>
          </Stack>
        }
      />
      <Paper variant="outlined" className="infractions-view-tabs">
        <Tabs
          value={view}
          onChange={(_, value) => changeView(value)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab value="" label="Todas" />
          <Tab value="PENDIENTE_VALIDACION" label="Pendientes" />
          <Tab value="VALIDADA" label="Validadas" />
          <Tab value="DEVUELTA_CORRECCION" label="Devueltas" />
          <Tab value="RECHAZADA" label="Rechazadas" />
          <Tab value="ANULADA" label="Anuladas" />
          <Tab value="PAGADA" label="Pagadas" />
        </Tabs>
      </Paper>
      <FilterBar />
      {mode === "error" ? (
        <Alert
          severity="error"
          action={<Button onClick={() => setMode("data")}>Reintentar</Button>}
        >
          No fue posible cargar la tabla simulada.
        </Alert>
      ) : (
        <InfractionTable rows={rows} loading={loading} />
      )}
      <Button
        sx={{ mt: 2 }}
        size="small"
        onClick={() =>
          setMode((current) => (current === "data" ? "error" : "data"))
        }
      >
        Simular {mode === "data" ? "error" : "resultado correcto"}
      </Button>
    </Box>
  );
}

export function PendingInfractionsPage() {
  const { infractions } = useApp();
  const rows = infractions
    .filter((row) => row.legalStatus === "PENDIENTE_VALIDACION")
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return (
    <Box className="module-page">
      <PageHeader
        eyebrow="Prioridad operativa"
        title="Bandeja pendiente"
        description="Las boletas más antiguas aparecen primero para reducir el tiempo de validación."
        action={
          <Button
            variant="contained"
            startIcon={<AssignmentIndRoundedIcon />}
            component={Link}
            to={`/admin/infracciones/${rows[0]?.id ?? "inf-1284"}`}
          >
            Tomar siguiente revisión
          </Button>
        }
      />
      <Alert severity="warning" sx={{ mb: 2 }}>
        Hay {rows.filter((row) => row.possibleDuplicate).length} registros con
        posible duplicidad. Compara datos y evidencia antes de validar.
      </Alert>
      <FilterBar compact />
      <InfractionTable rows={rows} loading={false} />
    </Box>
  );
}

const tabs = [
  "Resumen",
  "Vehículo e infractor",
  "Evidencias",
  "Ubicación",
  "Pagos",
  "Solvencia",
  "Historial",
];

export function InfractionDetailPage() {
  const { id = "" } = useParams();
  const {
    session,
    infractions,
    payments,
    solvencies,
    validateInfraction,
    returnInfraction,
  } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [action, setAction] = useState<"validate" | "return" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const item = infractions.find((row) => row.id === id);
  if (!item)
    return (
      <EmptyState
        title="Expediente no encontrado"
        description="El registro solicitado no existe en los datos de demostración."
      />
    );
  const relatedPayments = payments.filter(
    (row) => row.infractionId === item.id,
  );
  const solvency = solvencies.find((row) => row.infractionId === item.id);
  const canReview = session?.role === "ADMIN" || session?.role === "PMT";
  const itemId = item.id;
  async function confirmAction() {
    try {
      setError("");
      if (action === "validate") await validateInfraction(itemId);
      if (action === "return") await returnInfraction(itemId, reason);
      setAction(null);
      setReason("");
    } catch (cause) {
      setError(readableError(cause));
    }
  }
  return (
    <Box className="module-page">
      <Button onClick={() => navigate(-1)}>← Volver a infracciones</Button>
      <Box className="detail-page-header">
        <Box>
          <Typography className="overline">{item.caseNumber}</Typography>
          <Typography variant="h4">Boleta {item.ticket}</Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            <StatusChip status={item.legalStatus} />
            <StatusChip status={item.financialStatus} />
            <StatusChip status={item.solvencyStatus} />
          </Stack>
        </Box>
        <Box className="detail-amount">
          <Typography>Saldo pendiente</Typography>
          <Typography variant="h4">
            {money(Math.max(0, item.amount - item.paidAmount))}
          </Typography>
          {canReview && item.legalStatus === "PENDIENTE_VALIDACION" && (
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                color="warning"
                onClick={() => setAction("return")}
              >
                Devolver
              </Button>
              <Button variant="contained" onClick={() => setAction("validate")}>
                Validar
              </Button>
            </Stack>
          )}
        </Box>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Paper variant="outlined" className="detail-tabs-card">
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {tabs.map((label) => (
            <Tab key={label} label={label} />
          ))}
        </Tabs>
        <Divider />
        <Box className="tab-content">
          {tab === 0 && (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 8 }}>
                <Typography variant="h6">
                  Información de la infracción
                </Typography>
                <Box className="key-value-grid">
                  <Typography>
                    <span>Tipo</span>
                    <strong>{item.type}</strong>
                  </Typography>
                  <Typography>
                    <span>Base legal</span>
                    <strong>{item.legalBasis}</strong>
                  </Typography>
                  <Typography>
                    <span>Fecha y hora</span>
                    <strong>
                      {new Date(item.occurredAt).toLocaleString("es-GT")}
                    </strong>
                  </Typography>
                  <Typography>
                    <span>Agente</span>
                    <strong>{item.agent}</strong>
                  </Typography>
                  <Typography>
                    <span>Zona</span>
                    <strong>{item.zone}</strong>
                  </Typography>
                  <Typography>
                    <span>Sincronización</span>
                    <StatusChip status={item.syncStatus} />
                  </Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Alert
                  severity={item.possibleDuplicate ? "warning" : "success"}
                >
                  {item.possibleDuplicate
                    ? "Posible duplicado detectado. Revisa placa y evidencia."
                    : "No se detectaron alertas automáticas."}
                </Alert>
                <Paper variant="outlined" className="internal-note">
                  <Typography>Observación interna</Typography>
                  <Typography color="text.secondary">
                    {item.observations}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
          )}
          {tab === 1 && (
            <Box className="key-value-grid">
              <Typography>
                <span>Vehículo</span>
                <strong>{item.vehicle}</strong>
              </Typography>
              <Typography>
                <span>Placa</span>
                <strong>{item.plate}</strong>
              </Typography>
              <Typography>
                <span>Ciudadano</span>
                <strong>{item.citizen}</strong>
              </Typography>
              <Typography>
                <span>Identificación restringida</span>
                <strong>{item.citizenId}</strong>
              </Typography>
            </Box>
          )}
          {tab === 2 && (
            <Grid container spacing={2}>
              {item.evidence.map((evidence) => (
                <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={evidence.id}>
                  <Paper variant="outlined" className="evidence-card">
                    <Box>PMT</Box>
                    <Typography>{evidence.label}</Typography>
                    <Typography component="small">
                      {evidence.capturedAt}
                    </Typography>
                    <Button>Ampliar evidencia</Button>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          )}
          {tab === 3 && (
            <Paper variant="outlined" className="map-simulation">
              <LocationOnRoundedIcon />
              <Typography variant="h6">{item.address}</Typography>
              <Typography color="text.secondary">
                {item.zone} · Marcador geográfico simulado
              </Typography>
            </Paper>
          )}
          {tab === 4 && (
            <Stack spacing={1.5}>
              {relatedPayments.length ? (
                relatedPayments.map((payment) => (
                  <Paper
                    variant="outlined"
                    className="payment-history-row"
                    key={payment.id}
                  >
                    <Box>
                      <Typography>{payment.receiptNumber}</Typography>
                      <Typography component="small">
                        {payment.concept} · {payment.cashDesk}
                      </Typography>
                    </Box>
                    <Typography variant="h6">
                      {money(payment.amount)}
                    </Typography>
                    <StatusChip status={payment.status} />
                  </Paper>
                ))
              ) : (
                <EmptyState title="No hay pagos registrados" />
              )}
            </Stack>
          )}
          {tab === 5 &&
            (solvency ? (
              <Paper variant="outlined" className="solvency-summary">
                <Typography variant="h6">{solvency.id}</Typography>
                <StatusChip status={solvency.status} />
                <Typography color="text.secondary">
                  Responsable: {solvency.responsible}
                </Typography>
              </Paper>
            ) : (
              <EmptyState title="No existe solicitud de solvencia" />
            ))}
          {tab === 6 && (
            <Box className="admin-timeline">
              <Box>
                <span />
                <Typography>
                  <strong>Infracción registrada</strong>
                  <small>
                    {new Date(item.occurredAt).toLocaleString("es-GT")}
                  </small>
                </Typography>
              </Box>
              <Box>
                <span />
                <Typography>
                  <strong>Sincronización completada</strong>
                  <small>Registro recibido sin duplicación técnica</small>
                </Typography>
              </Box>
              <Box>
                <span
                  className={item.legalStatus === "VALIDADA" ? "done" : ""}
                />
                <Typography>
                  <strong>Validación PMT</strong>
                  <small>
                    {item.legalStatus === "VALIDADA"
                      ? "Boleta validada"
                      : "Pendiente"}
                  </small>
                </Typography>
              </Box>
            </Box>
          )}
        </Box>
      </Paper>
      <ConfirmDialog
        open={Boolean(action)}
        title={
          action === "validate" ? "Validar boleta" : "Devolver para corrección"
        }
        description={
          action === "validate"
            ? "Confirma que comparaste los datos con la evidencia disponible."
            : "La boleta volverá al agente y conservará todo su historial."
        }
        confirmLabel={
          action === "validate" ? "Confirmar validación" : "Devolver boleta"
        }
        danger={action === "return"}
        onCancel={() => setAction(null)}
        onConfirm={confirmAction}
      >
        {action === "return" && (
          <TextField
            label="Motivo obligatorio"
            multiline
            minRows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            error={Boolean(error)}
            helperText={error}
          />
        )}
      </ConfirmDialog>
    </Box>
  );
}
