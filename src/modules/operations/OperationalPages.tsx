"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AssignmentTurnedInRoundedIcon from "@mui/icons-material/AssignmentTurnedInRounded";
import DirectionsCarRoundedIcon from "@mui/icons-material/DirectionsCarRounded";
import GavelRoundedIcon from "@mui/icons-material/GavelRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import PersonSearchRoundedIcon from "@mui/icons-material/PersonSearchRounded";
import PointOfSaleRoundedIcon from "@mui/icons-material/PointOfSaleRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import SyncProblemRoundedIcon from "@mui/icons-material/SyncProblemRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { Link } from "react-router-dom";
import {
  EmptyState,
  PageHeader,
  StatCard,
  StatusChip,
  money,
} from "@/src/components/common";
import { useApp } from "@/src/contexts/AppContext";
import type { Infraction, RoleName } from "@/src/types";

type WorkTask = {
  id: string;
  type: "INFRACCION" | "PAGO" | "SOLVENCIA" | "ANULACION" | "SINCRONIZACION";
  title: string;
  description: string;
  priority: "ALTA" | "MEDIA" | "NORMAL";
  deadline: string;
  target: string;
  roles: RoleName[];
};

export function WorkQueuePage() {
  const { session, infractions, payments, solvencies } = useApp();
  const [type, setType] = useState("TODAS");
  const [priority, setPriority] = useState("TODAS");
  const [query, setQuery] = useState("");
  const [completed, setCompleted] = useState<string[]>([]);

  const tasks = useMemo<WorkTask[]>(() => {
    const pendingInfractions = infractions
      .filter((row) =>
        ["PENDIENTE_VALIDACION", "DEVUELTA_CORRECCION"].includes(
          row.legalStatus,
        ),
      )
      .slice(0, 6)
      .map(
        (row, index): WorkTask => ({
          id: `task-inf-${row.id}`,
          type: "INFRACCION",
          title:
            row.legalStatus === "DEVUELTA_CORRECCION"
              ? "Corregir infracción devuelta"
              : "Validar infracción",
          description: `${row.ticket} · ${row.plate} · ${row.agent}`,
          priority: row.possibleDuplicate
            ? "ALTA"
            : index < 2
              ? "MEDIA"
              : "NORMAL",
          deadline: index < 2 ? "Vence hoy" : "Mañana, 12:00",
          target: `/admin/infracciones/${row.id}`,
          roles: ["ADMIN", "SUPERVISOR", "PMT"],
        }),
      );
    const pendingSolvencies = solvencies
      .filter((row) =>
        [
          "LISTA_PARA_EMITIR",
          "PENDIENTE_REQUISITOS",
          "PENDIENTE_PAGO_EMISION",
        ].includes(row.status),
      )
      .slice(0, 4)
      .map(
        (row): WorkTask => ({
          id: `task-sol-${row.id}`,
          type: "SOLVENCIA",
          title:
            row.status === "LISTA_PARA_EMITIR"
              ? "Emitir solvencia"
              : "Revisar solicitud de solvencia",
          description: `${row.id} · Responsable: ${row.responsible}`,
          priority: row.status === "LISTA_PARA_EMITIR" ? "ALTA" : "MEDIA",
          deadline: "Hoy, 15:30",
          target: `/admin/solvencias/${row.id}`,
          roles: ["ADMIN", "SUPERVISOR", "SOLVENCIAS"],
        }),
      );
    const paymentReview: WorkTask[] = payments
      .filter((row) => row.status === "REVERSADO")
      .slice(0, 1)
      .map((row) => ({
        id: `task-pay-${row.id}`,
        type: "PAGO",
        title: "Revisar reverso de pago",
        description: `${row.receiptNumber} · ${money(row.amount)} · ${row.cashDesk}`,
        priority: "ALTA",
        deadline: "Vencida hace 22 min",
        target: `/admin/receptoria/pagos/${row.id}`,
        roles: ["ADMIN", "SUPERVISOR", "RECEPTORIA"],
      }));
    const systemTasks: WorkTask[] = [
      {
        id: "task-cancel-01",
        type: "ANULACION",
        title: "Autorizar anulación",
        description: "Boleta 2026-001198 · Motivo documentado",
        priority: "ALTA",
        deadline: "Hoy, 14:00",
        target: "/admin/impugnaciones",
        roles: ["ADMIN", "SUPERVISOR"],
      },
      {
        id: "task-sync-01",
        type: "SINCRONIZACION",
        title: "Resolver sincronización",
        description: "PMT-ANDROID-011 · 3 boletas pendientes",
        priority: "MEDIA",
        deadline: "Hoy, 16:00",
        target: "/admin/dispositivos",
        roles: ["ADMIN", "SUPERVISOR", "PMT"],
      },
    ];
    return [
      ...pendingInfractions,
      ...pendingSolvencies,
      ...paymentReview,
      ...systemTasks,
    ];
  }, [infractions, payments, solvencies]);

  const visible = tasks.filter(
    (task) =>
      !completed.includes(task.id) &&
      (!session || task.roles.includes(session.role)) &&
      (type === "TODAS" || task.type === type) &&
      (priority === "TODAS" || task.priority === priority) &&
      (!query ||
        `${task.title} ${task.description}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );

  return (
    <Box className="module-page">
      <PageHeader
        eyebrow="Trabajo por rol"
        title="Bandeja de trabajo"
        description="Reúne validaciones, pagos, solvencias, autorizaciones y problemas técnicos que requieren atención."
        action={
          <Button
            variant="outlined"
            startIcon={<TaskAltRoundedIcon />}
            onClick={() => setCompleted([])}
          >
            Restablecer demostración
          </Button>
        }
      />
      <Grid container spacing={2} className="stats-grid">
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <StatCard
            label="Tareas visibles"
            value={String(visible.length)}
            helper={`Rol: ${session?.roleLabel ?? "—"}`}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <StatCard
            label="Prioridad alta"
            value={String(
              visible.filter((row) => row.priority === "ALTA").length,
            )}
            helper="Atención inmediata"
            tone="warning"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <StatCard
            label="Vencidas"
            value={String(
              visible.filter((row) => row.deadline.includes("Vencida")).length,
            )}
            helper="Fuera del tiempo objetivo"
            tone="warning"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <StatCard
            label="Atendidas"
            value={String(completed.length)}
            helper="Durante esta sesión"
            tone="success"
          />
        </Grid>
      </Grid>
      <Paper variant="outlined" className="filter-bar">
        <TextField
          className="filter-search"
          placeholder="Buscar tarea, boleta o recibo"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <FormControl>
          <InputLabel>Tipo</InputLabel>
          <Select
            label="Tipo"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            {[
              "TODAS",
              "INFRACCION",
              "PAGO",
              "SOLVENCIA",
              "ANULACION",
              "SINCRONIZACION",
            ].map((value) => (
              <MenuItem value={value} key={value}>
                {value === "TODAS"
                  ? "Todas las tareas"
                  : value.replaceAll("_", " ")}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl>
          <InputLabel>Prioridad</InputLabel>
          <Select
            label="Prioridad"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          >
            <MenuItem value="TODAS">Todas</MenuItem>
            <MenuItem value="ALTA">Alta</MenuItem>
            <MenuItem value="MEDIA">Media</MenuItem>
            <MenuItem value="NORMAL">Normal</MenuItem>
          </Select>
        </FormControl>
      </Paper>
      <Stack spacing={1.4}>
        {visible.length ? (
          visible.map((task) => (
            <Paper
              variant="outlined"
              className={`work-task-card priority-${task.priority.toLowerCase()}`}
              key={task.id}
            >
              <Box className="work-task-icon">
                {task.type === "INFRACCION" ? (
                  <ReceiptLongRoundedIcon />
                ) : task.type === "PAGO" ? (
                  <PointOfSaleRoundedIcon />
                ) : task.type === "SOLVENCIA" ? (
                  <AssignmentTurnedInRoundedIcon />
                ) : task.type === "ANULACION" ? (
                  <GavelRoundedIcon />
                ) : (
                  <SyncProblemRoundedIcon />
                )}
              </Box>
              <Box className="work-task-copy">
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                  <StatusChip
                    status={task.priority === "ALTA" ? "ALERTA" : "PENDIENTE"}
                  />
                  <Typography component="small">
                    {task.type.replaceAll("_", " ")}
                  </Typography>
                </Stack>
                <Typography variant="h6">{task.title}</Typography>
                <Typography color="text.secondary">
                  {task.description}
                </Typography>
              </Box>
              <Box className="work-task-deadline">
                <Typography>{task.deadline}</Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <Button component={Link} to={task.target} variant="outlined">
                    Abrir tarea
                  </Button>
                  <Button
                    variant="contained"
                    onClick={() =>
                      setCompleted((current) => [...current, task.id])
                    }
                  >
                    Marcar atendida
                  </Button>
                </Stack>
              </Box>
            </Paper>
          ))
        ) : (
          <EmptyState
            title="Bandeja al día"
            description="No quedan tareas con los filtros seleccionados."
          />
        )}
      </Stack>
    </Box>
  );
}

type CitizenRecord = {
  key: string;
  citizen: string;
  citizenId: string;
  plates: string[];
  vehicles: string[];
  infractions: Infraction[];
};

export function CitizensVehiclesPage() {
  const { infractions, solvencies } = useApp();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CitizenRecord | null>(null);
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const records = useMemo(() => {
    const map = new Map<string, CitizenRecord>();
    infractions.forEach((item) => {
      const current = map.get(item.citizen) ?? {
        key: item.citizen,
        citizen: item.citizen,
        citizenId: item.citizenId,
        plates: [],
        vehicles: [],
        infractions: [],
      };
      if (!current.plates.includes(item.plate)) current.plates.push(item.plate);
      if (!current.vehicles.includes(item.vehicle))
        current.vehicles.push(item.vehicle);
      current.infractions.push(item);
      map.set(item.citizen, current);
    });
    return [...map.values()];
  }, [infractions]);
  const filtered = records.filter((record) => {
    const text =
      `${record.citizen} ${record.citizenId} ${record.plates.join(" ")} ${record.infractions.map((item) => item.ticket).join(" ")}`.toLowerCase();
    const duplicate =
      record.infractions.some((item) => item.possibleDuplicate) ||
      record.plates.length > 1;
    return (
      (!query || text.includes(query.toLowerCase())) &&
      (!duplicatesOnly || duplicate)
    );
  });
  return (
    <Box className="module-page">
      <PageHeader
        eyebrow="Registro interno"
        title="Ciudadanos y vehículos"
        description="Consulta relaciones generadas por las operaciones del sistema sin convertirlas en un padrón municipal completo."
      />
      <Alert severity="info" sx={{ mb: 2 }}>
        La identificación y los datos sensibles se muestran de forma
        restringida. El acceso completo depende de permisos institucionales.
      </Alert>
      <Grid container spacing={2} className="stats-grid">
        <Grid size={{ xs: 12, md: 4 }}>
          <StatCard
            label="Registros internos"
            value={String(records.length)}
            helper="Ciudadanos con operaciones"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <StatCard
            label="Vehículos relacionados"
            value={String(new Set(infractions.map((row) => row.plate)).size)}
            helper="Placas únicas"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <StatCard
            label="Posibles duplicados"
            value={String(
              infractions.filter((row) => row.possibleDuplicate).length,
            )}
            helper="Requieren comparación"
            tone="warning"
          />
        </Grid>
      </Grid>
      <Paper variant="outlined" className="filter-bar">
        <TextField
          className="filter-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Placa, boleta, ciudadano o identificación"
        />
        <Button
          variant={duplicatesOnly ? "contained" : "outlined"}
          startIcon={<WarningAmberRoundedIcon />}
          onClick={() => setDuplicatesOnly((current) => !current)}
        >
          Solo duplicados
        </Button>
      </Paper>
      <Paper variant="outlined" className="data-table-card">
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Ciudadano</TableCell>
                <TableCell>Vehículos</TableCell>
                <TableCell>Infracciones</TableCell>
                <TableCell>Pendientes</TableCell>
                <TableCell>Pagadas</TableCell>
                <TableCell>Solvencias</TableCell>
                <TableCell align="right">Detalle</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((record) => (
                <TableRow key={record.key} hover>
                  <TableCell>
                    <Typography>
                      <strong>{record.citizen}</strong>
                    </Typography>
                    <Typography component="small">
                      {record.citizenId}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
                      {record.plates.map((plate) => (
                        <StatusChip key={plate} status={plate} />
                      ))}
                    </Stack>
                  </TableCell>
                  <TableCell>{record.infractions.length}</TableCell>
                  <TableCell>
                    {
                      record.infractions.filter(
                        (row) => row.financialStatus !== "PAGADA",
                      ).length
                    }
                  </TableCell>
                  <TableCell>
                    {
                      record.infractions.filter(
                        (row) => row.financialStatus === "PAGADA",
                      ).length
                    }
                  </TableCell>
                  <TableCell>
                    {
                      record.infractions.filter((row) =>
                        solvencies.some(
                          (solvency) =>
                            solvency.infractionId === row.id &&
                            solvency.status === "EMITIDA",
                        ),
                      ).length
                    }
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      startIcon={<PersonSearchRoundedIcon />}
                      onClick={() => setSelected(record)}
                    >
                      Ver historial
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Historial interno del ciudadano</DialogTitle>
        <DialogContent>
          {selected && (
            <Stack spacing={2}>
              <Alert severity="info">
                Información sensible parcialmente protegida según permisos.
              </Alert>
              <Box className="citizen-admin-summary">
                <Box className="work-task-icon">
                  <DirectionsCarRoundedIcon />
                </Box>
                <Box>
                  <Typography variant="h6">{selected.citizen}</Typography>
                  <Typography color="text.secondary">
                    {selected.citizenId} · {selected.plates.join(", ")}
                  </Typography>
                </Box>
              </Box>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Boleta</TableCell>
                      <TableCell>Vehículo</TableCell>
                      <TableCell>Infracción</TableCell>
                      <TableCell>Estado</TableCell>
                      <TableCell>Saldo</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selected.infractions.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Button
                            component={Link}
                            to={`/admin/infracciones/${item.id}`}
                            onClick={() => setSelected(null)}
                          >
                            {item.ticket}
                          </Button>
                        </TableCell>
                        <TableCell>{item.vehicle}</TableCell>
                        <TableCell>{item.type}</TableCell>
                        <TableCell>
                          <StatusChip status={item.financialStatus} />
                        </TableCell>
                        <TableCell>
                          {money(Math.max(0, item.amount - item.paidAmount))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

type Appeal = {
  id: string;
  ticket: string;
  citizen: string;
  reason: string;
  filedAt: string;
  deadline: string;
  assigned: string;
  status: "REGISTRADO" | "EN_REVISION" | "APROBADO" | "RECHAZADO";
  resolution?: string;
};
const initialAppeals: Appeal[] = [
  {
    id: "REC-2026-031",
    ticket: "2026-001284",
    citizen: "Carlos Méndez",
    reason: "La señalización no era visible",
    filedAt: "14 jul 2026",
    deadline: "19 jul 2026",
    assigned: "Marta Ramírez",
    status: "EN_REVISION",
  },
  {
    id: "REC-2026-030",
    ticket: "2026-001258",
    citizen: "Roberto León",
    reason: "Solicitud de revisión de evidencia",
    filedAt: "13 jul 2026",
    deadline: "18 jul 2026",
    assigned: "Sin asignar",
    status: "REGISTRADO",
  },
  {
    id: "REC-2026-027",
    ticket: "2026-001236",
    citizen: "Sofía Ruiz",
    reason: "Error material en la boleta",
    filedAt: "09 jul 2026",
    deadline: "14 jul 2026",
    assigned: "Marta Ramírez",
    status: "APROBADO",
    resolution:
      "Se aprueba la corrección documental y se mantiene la trazabilidad.",
  },
];

export function AppealsPage() {
  const [rows, setRows] = useState(initialAppeals);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Appeal | null>(null);
  const [decision, setDecision] = useState<"APROBADO" | "RECHAZADO">(
    "APROBADO",
  );
  const [resolution, setResolution] = useState("");
  const [message, setMessage] = useState("");
  function resolve() {
    if (!selected || !resolution.trim()) return;
    setRows((current) =>
      current.map((row) =>
        row.id === selected.id ? { ...row, status: decision, resolution } : row,
      ),
    );
    setSelected(null);
    setResolution("");
    setMessage(
      `Resolución ${decision.toLowerCase()} registrada con historial.`,
    );
  }
  return (
    <Box className="module-page">
      <PageHeader
        eyebrow="Debido proceso"
        title="Recursos e impugnaciones"
        description="Registra reclamos, controla fechas límite y conserva cada decisión vinculada con la multa."
        action={
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={() => setCreating(true)}
          >
            Registrar recurso
          </Button>
        }
      />
      {message && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage("")}>
          {message}
        </Alert>
      )}
      <Grid container spacing={2} className="stats-grid">
        <Grid size={{ xs: 12, md: 4 }}>
          <StatCard
            label="Abiertos"
            value={String(
              rows.filter((row) =>
                ["REGISTRADO", "EN_REVISION"].includes(row.status),
              ).length,
            )}
            helper="Pendientes de resolución"
            tone="warning"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <StatCard
            label="Por vencer"
            value="1"
            helper="Dentro de las próximas 24 horas"
            tone="warning"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <StatCard
            label="Resueltos"
            value={String(
              rows.filter((row) =>
                ["APROBADO", "RECHAZADO"].includes(row.status),
              ).length,
            )}
            helper="Con documento de resolución"
            tone="success"
          />
        </Grid>
      </Grid>
      <Paper variant="outlined" className="data-table-card">
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Recurso</TableCell>
                <TableCell>Boleta</TableCell>
                <TableCell>Ciudadano</TableCell>
                <TableCell>Motivo</TableCell>
                <TableCell>Fecha límite</TableCell>
                <TableCell>Responsable</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>
                    <strong>{row.id}</strong>
                    <Typography component="small">{row.filedAt}</Typography>
                  </TableCell>
                  <TableCell>{row.ticket}</TableCell>
                  <TableCell>{row.citizen}</TableCell>
                  <TableCell>{row.reason}</TableCell>
                  <TableCell>{row.deadline}</TableCell>
                  <TableCell>{row.assigned}</TableCell>
                  <TableCell>
                    <StatusChip status={row.status} />
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      component={Link}
                      to={`/admin/infracciones/${row.ticket === "2026-001284" ? "inf-1284" : "inf-1258"}`}
                    >
                      Expediente
                    </Button>
                    {["REGISTRADO", "EN_REVISION"].includes(row.status) && (
                      <Button
                        startIcon={<GavelRoundedIcon />}
                        onClick={() => setSelected(row)}
                      >
                        Resolver
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Registrar recurso</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Número de boleta" defaultValue="2026-001279" />
            <TextField
              label="Identificación del solicitante"
              defaultValue="**** **** 8741"
            />
            <TextField label="Motivo del reclamo" multiline minRows={3} />
            <Button variant="outlined" component="label">
              Adjuntar documentación
              <input hidden type="file" accept="image/*,.pdf" />
            </Button>
            <TextField
              type="date"
              label="Fecha límite para resolver"
              defaultValue="2026-07-22"
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreating(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={() => {
              setRows((current) => [
                {
                  id: `REC-2026-${String(current.length + 32).padStart(3, "0")}`,
                  ticket: "2026-001279",
                  citizen: "Andrea Gómez",
                  reason: "Documentación adjunta para revisión",
                  filedAt: "15 jul 2026",
                  deadline: "22 jul 2026",
                  assigned: "Sin asignar",
                  status: "REGISTRADO",
                },
                ...current,
              ]);
              setCreating(false);
              setMessage(
                "Recurso registrado y agregado a la bandeja de trabajo.",
              );
            }}
          >
            Registrar
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Resolver recurso {selected?.id}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="warning">
              La resolución cambiará de forma controlada el estado asociado y
              quedará en auditoría.
            </Alert>
            <FormControl>
              <InputLabel>Decisión</InputLabel>
              <Select
                label="Decisión"
                value={decision}
                onChange={(event) =>
                  setDecision(event.target.value as "APROBADO" | "RECHAZADO")
                }
              >
                <MenuItem value="APROBADO">Aprobar recurso</MenuItem>
                <MenuItem value="RECHAZADO">Rechazar recurso</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Fundamento y resolución obligatoria"
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
              multiline
              minRows={4}
            />
            <Button variant="outlined" startIcon={<HistoryRoundedIcon />}>
              Vista previa del documento
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!resolution.trim()}
            onClick={resolve}
          >
            Firmar resolución
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export function CashControlPage() {
  const { payments, session } = useApp();
  const [tab, setTab] = useState(0);
  const [open, setOpen] = useState(true);
  const [declared, setDeclared] = useState("");
  const [closed, setClosed] = useState(false);
  const [message, setMessage] = useState("");
  const confirmed = payments.filter((row) => row.status === "CONFIRMADO");
  const total = confirmed.reduce((sum, row) => sum + row.amount, 0);
  const cash = confirmed
    .filter((row) => row.method === "Efectivo")
    .reduce((sum, row) => sum + row.amount, 0);
  const card = confirmed
    .filter((row) => row.method === "Tarjeta")
    .reduce((sum, row) => sum + row.amount, 0);
  const difference = (Number(declared) || 0) - total;
  function closeCash() {
    setClosed(true);
    setOpen(false);
    setMessage(`Caja cerrada. Diferencia registrada: ${money(difference)}.`);
  }
  return (
    <Box className="module-page">
      <PageHeader
        eyebrow="Control financiero"
        title="Apertura, corte y cierre de caja"
        description="Controla fondos iniciales, movimientos por método, diferencias y autorización del cierre diario."
        action={<StatusChip status={open ? "ACTIVO" : "INACTIVO"} />}
      />
      {message && (
        <Alert
          severity={Math.abs(difference) < 0.01 ? "success" : "warning"}
          sx={{ mb: 2 }}
        >
          {message} El corte quedó disponible para auditoría.
        </Alert>
      )}
      <Grid container spacing={2} className="stats-grid">
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <StatCard
            label="Fondo inicial"
            value={money(500)}
            helper="Apertura 07:52"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <StatCard
            label="Total del sistema"
            value={money(total)}
            helper={`${confirmed.length} movimientos`}
            tone="success"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <StatCard
            label="Efectivo"
            value={money(cash)}
            helper="Por método de pago"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <StatCard
            label="Tarjeta"
            value={money(card)}
            helper="Por método de pago"
          />
        </Grid>
      </Grid>
      <Paper variant="outlined" className="data-table-card">
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          variant="scrollable"
        >
          <Tab label="Caja actual" />
          <Tab label="Corte por método" />
          <Tab label="Historial de cierres" />
        </Tabs>
        <Divider />
        {tab === 0 && (
          <Box className="cash-control-panel">
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 7 }}>
                <Stack spacing={2}>
                  <Box className="cash-status-card">
                    <Box className="work-task-icon">
                      <AccountBalanceWalletRoundedIcon />
                    </Box>
                    <Box>
                      <Typography variant="h6">
                        Caja 01 · Sede central
                      </Typography>
                      <Typography color="text.secondary">
                        Cajero: {session?.name} · Apertura 15 jul 2026, 07:52
                      </Typography>
                    </Box>
                    <StatusChip status={open ? "ACTIVO" : "INACTIVO"} />
                  </Box>
                  <Box className="key-value-grid">
                    <Typography>
                      <span>Fondo autorizado</span>
                      <strong>{money(500)}</strong>
                    </Typography>
                    <Typography>
                      <span>Último recibo</span>
                      <strong>{confirmed[0]?.receiptNumber ?? "—"}</strong>
                    </Typography>
                    <Typography>
                      <span>Movimientos reversados</span>
                      <strong>
                        {
                          payments.filter((row) => row.status === "REVERSADO")
                            .length
                        }
                      </strong>
                    </Typography>
                    <Typography>
                      <span>Responsable de supervisión</span>
                      <strong>Marta Ramírez</strong>
                    </Typography>
                  </Box>
                </Stack>
              </Grid>
              <Grid size={{ xs: 12, md: 5 }}>
                <Paper variant="outlined" className="cash-close-card">
                  <Typography className="overline">Arqueo</Typography>
                  <Typography variant="h6">
                    Declarar efectivo y cerrar
                  </Typography>
                  <Typography color="text.secondary">
                    Ingresa el total físico contado, incluyendo únicamente los
                    movimientos del sistema.
                  </Typography>
                  <TextField
                    fullWidth
                    type="number"
                    label="Total físico declarado"
                    value={declared}
                    onChange={(event) => setDeclared(event.target.value)}
                    disabled={closed}
                  />
                  <Box className="cash-difference">
                    <Typography>Diferencia</Typography>
                    <Typography variant="h5">{money(difference)}</Typography>
                  </Box>
                  <Button
                    fullWidth
                    variant="contained"
                    disabled={!open || !declared || closed}
                    onClick={closeCash}
                  >
                    Confirmar cierre de caja
                  </Button>
                  {!open && (
                    <Button
                      fullWidth
                      variant="outlined"
                      onClick={() => {
                        setOpen(true);
                        setClosed(false);
                        setDeclared("");
                        setMessage(
                          "Caja abierta con fondo inicial autorizado.",
                        );
                      }}
                    >
                      Abrir nueva caja
                    </Button>
                  )}
                </Paper>
              </Grid>
            </Grid>
          </Box>
        )}
        {tab === 1 && (
          <Box className="cash-control-panel">
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Método</TableCell>
                    <TableCell>Movimientos</TableCell>
                    <TableCell>Total</TableCell>
                    <TableCell>Estado</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {[
                    ["Efectivo", cash],
                    ["Tarjeta", card],
                    [
                      "Transferencia",
                      confirmed
                        .filter((row) => row.method === "Transferencia")
                        .reduce((sum, row) => sum + row.amount, 0),
                    ],
                  ].map(([method, value]) => (
                    <TableRow key={String(method)}>
                      <TableCell>
                        <strong>{String(method)}</strong>
                      </TableCell>
                      <TableCell>
                        {
                          confirmed.filter((row) => row.method === method)
                            .length
                        }
                      </TableCell>
                      <TableCell>{money(Number(value))}</TableCell>
                      <TableCell>
                        <StatusChip status="CONFIRMADO" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
        {tab === 2 && (
          <Box className="cash-control-panel">
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Fecha</TableCell>
                    <TableCell>Caja</TableCell>
                    <TableCell>Cajero</TableCell>
                    <TableCell>Total</TableCell>
                    <TableCell>Diferencia</TableCell>
                    <TableCell>Estado</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {[
                    ["14 jul 2026", "Caja 01", "José Castillo", 2840, 0],
                    ["13 jul 2026", "Caja 02", "María Santos", 1960, -20],
                    ["12 jul 2026", "Caja 01", "José Castillo", 3210, 0],
                  ].map((row) => (
                    <TableRow key={String(row[0])}>
                      <TableCell>{row[0]}</TableCell>
                      <TableCell>{row[1]}</TableCell>
                      <TableCell>{row[2]}</TableCell>
                      <TableCell>{money(Number(row[3]))}</TableCell>
                      <TableCell>{money(Number(row[4]))}</TableCell>
                      <TableCell>
                        <StatusChip
                          status={Number(row[4]) === 0 ? "EXITOSO" : "ALERTA"}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
