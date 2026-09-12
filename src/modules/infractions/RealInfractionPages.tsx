import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusChip,
  money,
  readableError,
} from "@/src/components/common";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import { citizensApi } from "@/src/modules/citizens/api/citizensApi";
import { vehiclesApi } from "@/src/modules/vehicles/api/vehiclesApi";
import {
  administrationApi,
  type CatalogRow,
} from "@/src/modules/administration/api/administrationApi";
import { useRemoteData } from "@/src/modules/administration/hooks/useRemoteData";
import {
  infractionsApi,
  type DraftInput,
  type InfractionStatus,
  type InfractionSummary,
} from "./api/infractionsApi";

const localDate = (value: string) =>
  new Intl.DateTimeFormat("es-GT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Guatemala",
  }).format(new Date(value));
const statusOptions: [InfractionStatus, string][] = [
  ["BORRADOR", "Borrador"],
  ["PENDIENTE_VALIDACION", "Pendiente"],
  ["DEVUELTA_CORRECCION", "Devuelta"],
  ["VALIDADA", "Validada"],
  ["RECHAZADA", "Rechazada"],
  ["ANULADA", "Anulada"],
];

function InfractionTable({
  rows,
  total,
  page,
  onPage,
}: {
  rows: InfractionSummary[];
  total: number;
  page: number;
  onPage: (page: number) => void;
}) {
  const navigate = useNavigate();
  if (!rows.length)
    return (
      <EmptyState
        title="No hay infracciones"
        description="No existen boletas que coincidan con los filtros actuales."
      />
    );
  return (
    <Paper variant="outlined" className="data-table-card">
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Boleta / expediente</TableCell>
              <TableCell>Fecha local</TableCell>
              <TableCell>Vehículo</TableCell>
              <TableCell>Agente</TableCell>
              <TableCell>Monto</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell align="right">Acción</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow hover key={row.id}>
                <TableCell>
                  <Typography component="strong">
                    {row.ticket_number}
                  </Typography>
                  <Typography component="small" sx={{ display: "block" }}>
                    {row.case_number}
                  </Typography>
                </TableCell>
                <TableCell>{localDate(row.occurred_at)}</TableCell>
                <TableCell>
                  <Chip variant="outlined" label={row.vehicle_plate_snapshot} />
                  <Typography component="small" sx={{ display: "block" }}>
                    {row.citizen_name_snapshot ??
                      "Conductor ausente/no identificado"}
                  </Typography>
                </TableCell>
                <TableCell>{row.agent_name_snapshot}</TableCell>
                <TableCell>{money(Number(row.total_amount))}</TableCell>
                <TableCell>
                  <StatusChip status={row.status} />
                </TableCell>
                <TableCell align="right">
                  <Button
                    endIcon={<OpenInNewRoundedIcon />}
                    onClick={() => navigate(`/admin/infracciones/${row.id}`)}
                  >
                    Detalle
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={total}
        page={page - 1}
        onPageChange={(_, value) => onPage(value + 1)}
        rowsPerPage={20}
        rowsPerPageOptions={[20]}
        labelDisplayedRows={({ from, to, count }) =>
          `${from}–${to} de ${count}`
        }
      />
    </Paper>
  );
}

function InfractionsIndex({
  fixedStatus,
  title = "Infracciones",
  description = "Boletas reales persistidas en MySQL, con expediente, estado y monto histórico.",
}: {
  fixedStatus?: InfractionStatus;
  title?: string;
  description?: string;
}) {
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InfractionStatus | "">(
    fixedStatus ?? "",
  );
  const [page, setPage] = useState(1);
  const remote = useRemoteData(
    () =>
      infractionsApi.list({
        search,
        status: status || undefined,
        page,
        pageSize: 20,
      }),
    [search, status, page],
  );
  return (
    <Box className="module-page">
      <PageHeader
        eyebrow="Operación PMT"
        title={title}
        description={description}
        action={
          hasPermission("infractions.create") ? (
            <Button
              variant="contained"
              component={Link}
              to="/admin/infracciones/nueva"
              startIcon={<AddRoundedIcon />}
            >
              Nueva boleta
            </Button>
          ) : undefined
        }
      />
      <Paper variant="outlined" className="filter-bar">
        <TextField
          className="filter-search"
          label="Buscar"
          placeholder="Boleta, expediente, placa o ciudadano"
          value={search}
          onChange={(event) => {
            setPage(1);
            setSearch(event.target.value);
          }}
        />
        {!fixedStatus && (
          <TextField
            select
            label="Estado legal"
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as InfractionStatus | "");
            }}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">Todos</MenuItem>
            {statusOptions.map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Paper>
      {remote.loading ? (
        <LoadingState rows={7} />
      ) : remote.error ? (
        <ErrorState
          message={remote.error}
          onRetry={() => void remote.refresh()}
        />
      ) : (
        <InfractionTable
          rows={remote.data?.data ?? []}
          total={remote.data?.meta.total ?? 0}
          page={page}
          onPage={setPage}
        />
      )}
    </Box>
  );
}

export function InfractionsListPage() {
  return <InfractionsIndex />;
}
export function PendingInfractionsPage() {
  return (
    <InfractionsIndex
      fixedStatus="PENDIENTE_VALIDACION"
      title="Validación pendiente"
      description="Bandeja real de boletas enviadas para revisión institucional."
    />
  );
}

export function NewInfractionPage() {
  const navigate = useNavigate();
  const agents = useRemoteData(() => administrationApi.agents.list(), []);
  const devices = useRemoteData(() => administrationApi.devices.list(), []);
  const citizens = useRemoteData(
    () => citizensApi.list({ status: "ACTIVE", pageSize: 100 }),
    [],
  );
  const vehicles = useRemoteData(
    () => vehiclesApi.list({ status: "ACTIVE", pageSize: 100 }),
    [],
  );
  const types = useRemoteData(
    () => administrationApi.catalogs.list("infraction-types"),
    [],
  );
  const lookups = useRemoteData(() => administrationApi.catalogs.lookups(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [form, setForm] = useState({
    siteId: "",
    agentId: "",
    deviceId: "",
    citizenId: "",
    vehicleId: "",
    occurredAt: new Date().toISOString().slice(0, 16),
    placeName: "",
    address: "",
    latitude: "",
    longitude: "",
    observations: "",
    driverAbsent: false,
    driverRefusedSignature: false,
  });
  const activeTypes = (types.data?.data ?? []).filter(
    (row) => row.is_active !== 0,
  );
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const input: DraftInput = {
        siteId: form.siteId,
        agentId: form.agentId,
        deviceId: form.deviceId,
        citizenId: form.citizenId || null,
        vehicleId: form.vehicleId,
        occurredAt: new Date(form.occurredAt).toISOString(),
        driverAbsent: form.driverAbsent,
        driverRefusedSignature: form.driverRefusedSignature,
        observations: form.observations || null,
        items: selectedTypes.map((infractionTypeId) => ({ infractionTypeId })),
        location: {
          placeName: form.placeName,
          address: form.address,
          latitude: form.latitude ? Number(form.latitude) : null,
          longitude: form.longitude ? Number(form.longitude) : null,
        },
      };
      const response = await infractionsApi.create(input);
      navigate(`/admin/infracciones/${response.data.id}`);
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setBusy(false);
    }
  };
  const loading = [agents, devices, citizens, vehicles, types, lookups].some(
    (remote) => remote.loading,
  );
  return (
    <Box className="module-page">
      <PageHeader
        eyebrow="Captura de boleta"
        title="Nueva infracción"
        description="El monto se calcula en el servidor con la tarifa vigente para la fecha indicada."
      />
      {error && <Alert severity="error">{error}</Alert>}
      {loading ? (
        <LoadingState rows={8} />
      ) : (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, lg: 8 }}>
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Typography variant="h6">Datos operativos</Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      select
                      fullWidth
                      required
                      label="Sede"
                      value={form.siteId}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          siteId: e.target.value,
                        }))
                      }
                    >
                      {(lookups.data?.data.sites ?? []).map((row) => (
                        <MenuItem key={String(row.id)} value={String(row.id)}>
                          {String(row.name)}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      type="datetime-local"
                      fullWidth
                      required
                      label="Fecha y hora local"
                      value={form.occurredAt}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          occurredAt: e.target.value,
                        }))
                      }
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      select
                      fullWidth
                      required
                      label="Agente activo"
                      value={form.agentId}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          agentId: e.target.value,
                        }))
                      }
                    >
                      {(agents.data?.data ?? [])
                        .filter((row) => row.status === "ACTIVE")
                        .map((row) => (
                          <MenuItem key={row.id} value={String(row.id)}>
                            {row.badge_number} · {row.first_name}{" "}
                            {row.last_name}
                          </MenuItem>
                        ))}
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      select
                      fullWidth
                      required
                      label="Dispositivo asignado"
                      value={form.deviceId}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          deviceId: e.target.value,
                        }))
                      }
                    >
                      {(devices.data?.data ?? [])
                        .filter((row) => row.status === "ACTIVE")
                        .map((row) => (
                          <MenuItem key={row.id} value={String(row.id)}>
                            {row.institutional_code} ·{" "}
                            {row.username ?? "Sin asignar"}
                          </MenuItem>
                        ))}
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      select
                      fullWidth
                      required
                      label="Vehículo"
                      value={form.vehicleId}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          vehicleId: e.target.value,
                        }))
                      }
                    >
                      {(vehicles.data?.data ?? []).map((row) => (
                        <MenuItem key={row.id} value={row.id}>
                          {row.plate} · {row.brand} {row.line}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      select
                      fullWidth
                      label="Ciudadano/infractor (opcional)"
                      value={form.citizenId}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          citizenId: e.target.value,
                        }))
                      }
                    >
                      <MenuItem value="">Sin identificar</MenuItem>
                      {(citizens.data?.data ?? []).map((row) => (
                        <MenuItem key={row.id} value={row.id}>
                          {row.identificationNumber} · {row.firstNames}{" "}
                          {row.lastNames}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                </Grid>
                <Typography variant="h6">Lugar y circunstancias</Typography>
                <TextField
                  required
                  label="Lugar"
                  value={form.placeName}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      placeName: e.target.value,
                    }))
                  }
                />
                <TextField
                  required
                  label="Dirección"
                  value={form.address}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      address: e.target.value,
                    }))
                  }
                />
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      type="number"
                      label="Latitud"
                      value={form.latitude}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          latitude: e.target.value,
                        }))
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      type="number"
                      label="Longitud"
                      value={form.longitude}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          longitude: e.target.value,
                        }))
                      }
                    />
                  </Grid>
                </Grid>
                <TextField
                  multiline
                  minRows={3}
                  label="Observaciones"
                  value={form.observations}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      observations: e.target.value,
                    }))
                  }
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.driverAbsent}
                      onChange={(_, checked) =>
                        setForm((current) => ({
                          ...current,
                          driverAbsent: checked,
                        }))
                      }
                    />
                  }
                  label="Conductor ausente"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.driverRefusedSignature}
                      onChange={(_, checked) =>
                        setForm((current) => ({
                          ...current,
                          driverRefusedSignature: checked,
                        }))
                      }
                    />
                  }
                  label="Conductor se negó a firmar"
                />
              </Stack>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, lg: 4 }}>
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Typography variant="h6">Artículos infringidos</Typography>
                {activeTypes.length ? (
                  activeTypes.map((row) => (
                    <FormControlLabel
                      key={String(row.id)}
                      control={
                        <Checkbox
                          checked={selectedTypes.includes(String(row.id))}
                          onChange={(_, checked) =>
                            setSelectedTypes((current) =>
                              checked
                                ? [...current, String(row.id)]
                                : current.filter((id) => id !== String(row.id)),
                            )
                          }
                        />
                      }
                      label={`${String(row.code)} · ${String(row.name)}`}
                    />
                  ))
                ) : (
                  <Alert severity="warning">
                    No hay tipos con tarifa configurada. Administre el catálogo
                    antes de crear una boleta.
                  </Alert>
                )}
                <Alert severity="info">
                  La boleta queda en BORRADOR. Después podrá adjuntar evidencias
                  y enviarla.
                </Alert>
                <Button
                  variant="contained"
                  disabled={
                    busy ||
                    !selectedTypes.length ||
                    !form.siteId ||
                    !form.agentId ||
                    !form.deviceId ||
                    !form.vehicleId ||
                    !form.placeName ||
                    !form.address
                  }
                  onClick={() => void save()}
                >
                  {busy ? "Guardando…" : "Crear borrador"}
                </Button>
                <Button component={Link} to="/admin/infracciones">
                  Cancelar
                </Button>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}

type CriticalAction = "submit" | "validate" | "return" | "reject" | "cancel";
export function InfractionDetailPage() {
  const { id = "" } = useParams();
  const { hasPermission } = useAuth();
  const detail = useRemoteData(() => infractionsApi.get(id), [id]);
  const timeline = useRemoteData(() => infractionsApi.timeline(id), [id]);
  const reasons = useRemoteData(
    () => administrationApi.catalogs.list("action-reasons"),
    [],
  );
  const types = useRemoteData(
    () => administrationApi.catalogs.list("infraction-types"),
    [],
  );
  const [action, setAction] = useState<CriticalAction | null>(null);
  const [reasonId, setReasonId] = useState("");
  const [comment, setComment] = useState("");
  const [indicated, setIndicated] = useState("");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editObservations, setEditObservations] = useState("");
  const [editTypeIds, setEditTypeIds] = useState<string[]>([]);
  const row = detail.data?.data;
  const execute = async () => {
    if (!action) return;
    try {
      if (action === "submit") await infractionsApi.submit(id);
      else
        await infractionsApi.transition(
          id,
          action,
          action === "validate"
            ? {}
            : {
                reasonId,
                comment,
                indicatedFields: indicated
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              },
        );
      setAction(null);
      setReasonId("");
      setComment("");
      setIndicated("");
      setMessage("Acción registrada correctamente.");
      await Promise.all([detail.refresh(), timeline.refresh()]);
    } catch (cause) {
      setMessage(`Error: ${readableError(cause)}`);
    }
  };
  const upload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      await infractionsApi.upload(
        id,
        file,
        file.type === "application/pdf" ? "DOCUMENT" : "PHOTO",
      );
      setMessage("Evidencia almacenada con checksum.");
      await detail.refresh();
    } catch (cause) {
      setMessage(`Error: ${readableError(cause)}`);
    } finally {
      setUploading(false);
    }
  };
  const saveCorrection = async () => {
    try {
      await infractionsApi.update(id, {
        observations: editObservations || null,
        items: editTypeIds.map((infractionTypeId) => ({ infractionTypeId })),
      });
      setEditing(false);
      setMessage(
        "Corrección guardada. El monto fue recalculado por el servidor.",
      );
      await detail.refresh();
    } catch (cause) {
      setMessage(`Error: ${readableError(cause)}`);
    }
  };
  if (detail.loading) return <LoadingState rows={9} />;
  if (detail.error || !row)
    return (
      <ErrorState
        message={detail.error || "No existe el expediente."}
        onRetry={() => void detail.refresh()}
      />
    );
  const reasonRows = (reasons.data?.data ?? []) as CatalogRow[];
  const category =
    action === "return"
      ? "INFRACTION_RETURN"
      : action === "reject"
        ? "INFRACTION_REJECT"
        : action === "cancel"
          ? "INFRACTION_CANCEL"
          : "";
  return (
    <Box className="module-page">
      <PageHeader
        eyebrow="Expediente de infracción"
        title={row.ticket_number}
        description={`${row.case_number} · Todos los horarios se muestran en America/Guatemala.`}
        action={<StatusChip status={row.status} size="medium" />}
      />
      {message && (
        <Alert
          severity={message.startsWith("Error") ? "error" : "success"}
          onClose={() => setMessage("")}
        >
          {message}
        </Alert>
      )}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper variant="outlined" sx={{ p: 3, mb: 2 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography color="text.secondary">Fecha y hora</Typography>
                <Typography>{localDate(row.occurred_at)}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography color="text.secondary">Agente</Typography>
                <Typography>{row.agent_name_snapshot}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography color="text.secondary">Vehículo</Typography>
                <Typography>
                  {row.vehicle_plate_snapshot} · {row.vehicle_brand_snapshot}{" "}
                  {row.vehicle_line_snapshot} · {row.vehicle_color_snapshot}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography color="text.secondary">Infractor</Typography>
                <Typography>
                  {row.citizen_name_snapshot ?? "No identificado"}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Typography color="text.secondary">Lugar</Typography>
                <Typography>{row.location_snapshot}</Typography>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Typography color="text.secondary">Observaciones</Typography>
                <Typography>
                  {row.observations ?? "Sin observaciones"}
                </Typography>
              </Grid>
            </Grid>
          </Paper>
          <Paper variant="outlined" className="data-table-card" sx={{ mb: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Artículo</TableCell>
                  <TableCell>Base legal histórica</TableCell>
                  <TableCell align="right">Monto histórico</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {row.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {item.type_code_snapshot} · {item.type_name_snapshot}
                    </TableCell>
                    <TableCell>{item.legal_basis_snapshot}</TableCell>
                    <TableCell align="right">
                      {money(Number(item.amount_snapshot))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Línea de tiempo
            </Typography>
            {timeline.loading ? (
              <LoadingState rows={4} />
            ) : (
              <Stack spacing={2}>
                {(timeline.data?.data ?? []).map((entry) => (
                  <Box
                    key={entry.id}
                    sx={{ borderLeft: "3px solid #315D43", pl: 2 }}
                  >
                    <StatusChip status={entry.to_status} />
                    <Typography>
                      {entry.action} · {entry.changed_by}
                    </Typography>
                    <Typography color="text.secondary">
                      {localDate(entry.created_at)}
                      {entry.reason_name ? ` · ${entry.reason_name}` : ""}
                    </Typography>
                    {entry.comment && <Typography>{entry.comment}</Typography>}
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper variant="outlined" sx={{ p: 3, mb: 2 }}>
            <Stack spacing={1}>
              <Typography variant="h6">Acciones</Typography>
              {hasPermission("infractions.update_own") &&
                ["BORRADOR", "DEVUELTA_CORRECCION"].includes(row.status) && (
                  <Button
                    variant="outlined"
                    onClick={() => {
                      setEditObservations(row.observations ?? "");
                      setEditTypeIds(
                        row.items.map((item) =>
                          String(item.infraction_type_id),
                        ),
                      );
                      setEditing(true);
                    }}
                  >
                    Editar/corregir borrador
                  </Button>
                )}
              {hasPermission("infractions.submit") &&
                ["BORRADOR", "DEVUELTA_CORRECCION"].includes(row.status) && (
                  <Button
                    variant="contained"
                    startIcon={<SendRoundedIcon />}
                    onClick={() => setAction("submit")}
                  >
                    Enviar a validación
                  </Button>
                )}
              {hasPermission("infractions.validate") &&
                row.status === "PENDIENTE_VALIDACION" && (
                  <Button
                    variant="contained"
                    color="success"
                    onClick={() => setAction("validate")}
                  >
                    Validar
                  </Button>
                )}
              {hasPermission("infractions.return") &&
                row.status === "PENDIENTE_VALIDACION" && (
                  <Button onClick={() => setAction("return")}>Devolver</Button>
                )}
              {hasPermission("infractions.reject") &&
                row.status === "PENDIENTE_VALIDACION" && (
                  <Button color="error" onClick={() => setAction("reject")}>
                    Rechazar
                  </Button>
                )}
              {hasPermission("infractions.cancel") &&
                row.status !== "ANULADA" && (
                  <Button color="error" onClick={() => setAction("cancel")}>
                    Anular
                  </Button>
                )}
            </Stack>
          </Paper>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Stack spacing={2}>
              <Typography variant="h6">Evidencias privadas</Typography>
              {row.evidence.length ? (
                row.evidence.map((item) => (
                  <Button
                    key={item.id}
                    component="a"
                    href={infractionsApi.evidenceUrl(id, item.id)}
                    target="_blank"
                  >
                    {item.original_name} · {(item.size_bytes / 1024).toFixed(1)}{" "}
                    KB
                  </Button>
                ))
              ) : (
                <Typography color="text.secondary">Sin evidencias.</Typography>
              )}
              {hasPermission("evidence.upload") &&
                !["VALIDADA", "ANULADA"].includes(row.status) && (
                  <Button
                    component="label"
                    variant="outlined"
                    startIcon={<CloudUploadRoundedIcon />}
                    disabled={uploading}
                  >
                    {uploading ? "Subiendo…" : "Adjuntar JPEG, PNG o PDF"}
                    <input
                      hidden
                      type="file"
                      accept="image/jpeg,image/png,application/pdf"
                      onChange={(event) =>
                        void upload(event.target.files?.[0] ?? null)
                      }
                    />
                  </Button>
                )}
            </Stack>
          </Paper>
        </Grid>
      </Grid>
      <ConfirmDialog
        open={Boolean(action)}
        title={
          {
            submit: "Enviar a validación",
            validate: "Validar boleta",
            return: "Devolver para corrección",
            reject: "Rechazar boleta",
            cancel: "Anular boleta",
          }[action ?? "submit"]
        }
        description="La transición quedará registrada en historial y auditoría."
        confirmLabel="Confirmar acción"
        danger={["reject", "cancel"].includes(action ?? "")}
        onCancel={() => setAction(null)}
        onConfirm={() => void execute()}
      >
        {action && ["return", "reject", "cancel"].includes(action) && (
          <Stack spacing={2}>
            <TextField
              select
              required
              label="Motivo institucional"
              value={reasonId}
              onChange={(event) => setReasonId(event.target.value)}
            >
              {reasonRows
                .filter(
                  (item) => item.category === category && item.is_active !== 0,
                )
                .map((item) => (
                  <MenuItem key={String(item.id)} value={String(item.id)}>
                    {String(item.name)}
                  </MenuItem>
                ))}
            </TextField>
            <TextField
              required
              multiline
              minRows={3}
              label="Comentario"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
            {action === "return" && (
              <TextField
                label="Campos señalados, separados por coma"
                value={indicated}
                onChange={(event) => setIndicated(event.target.value)}
              />
            )}
          </Stack>
        )}
      </ConfirmDialog>
      <Dialog
        open={editing}
        onClose={() => setEditing(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Corregir boleta</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              multiline
              minRows={3}
              label="Observaciones"
              value={editObservations}
              onChange={(event) => setEditObservations(event.target.value)}
            />
            <Typography sx={{ fontWeight: 700 }}>Artículos</Typography>
            {(types.data?.data ?? [])
              .filter((item) => item.is_active !== 0)
              .map((item) => (
                <FormControlLabel
                  key={String(item.id)}
                  control={
                    <Checkbox
                      checked={editTypeIds.includes(String(item.id))}
                      onChange={(_, checked) =>
                        setEditTypeIds((current) =>
                          checked
                            ? [...current, String(item.id)]
                            : current.filter(
                                (value) => value !== String(item.id),
                              ),
                        )
                      }
                    />
                  }
                  label={`${String(item.code)} · ${String(item.name)}`}
                />
              ))}
            <Alert severity="info">
              Las tarifas se vuelven a resolver según la fecha de la boleta; el
              cliente no envía montos.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!editTypeIds.length}
            onClick={() => void saveCorrection()}
          >
            Guardar corrección
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
