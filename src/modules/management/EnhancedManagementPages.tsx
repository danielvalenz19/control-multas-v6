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
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AssignmentIndRoundedIcon from "@mui/icons-material/AssignmentIndRounded";
import CloudDoneRoundedIcon from "@mui/icons-material/CloudDoneRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import LaptopMacRoundedIcon from "@mui/icons-material/LaptopMacRounded";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";
import PrintRoundedIcon from "@mui/icons-material/PrintRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import SmartphoneRoundedIcon from "@mui/icons-material/SmartphoneRounded";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  PageHeader,
  StatCard,
  StatusChip,
  money,
} from "@/src/components/common";
import { useApp } from "@/src/contexts/AppContext";

function downloadCsv(filename: string, rows: string[][]) {
  const content = rows
    .map((row) =>
      row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","),
    )
    .join("\n");
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const reportTypes = [
  "Multas por fecha",
  "Multas por tipo",
  "Multas por agente",
  "Multas por zona",
  "Pagadas y pendientes",
  "Recaudación por día",
  "Recaudación por cajero",
  "Recaudación por sede",
  "Solvencias emitidas",
  "Anulaciones y rechazos",
  "Productividad de agentes",
  "Cierres de caja",
];

export function ReportsCompletePage() {
  const { infractions, payments, solvencies } = useApp();
  const [reportType, setReportType] = useState(reportTypes[0]);
  const [agent, setAgent] = useState("");
  const [zone, setZone] = useState("");
  const [site, setSite] = useState("todas");
  const [notice, setNotice] = useState("");
  const filtered = useMemo(
    () =>
      infractions.filter(
        (row) =>
          (!agent || row.agent === agent) && (!zone || row.zone === zone),
      ),
    [infractions, agent, zone],
  );
  const report = [
    { month: "Feb", boletas: 148, pagos: 96 },
    { month: "Mar", boletas: 172, pagos: 118 },
    { month: "Abr", boletas: 165, pagos: 124 },
    { month: "May", boletas: 208, pagos: 151 },
    { month: "Jun", boletas: 224, pagos: 169 },
    { month: "Jul", boletas: 184, pagos: 142 },
  ];
  const revenue = payments
    .filter((row) => row.status === "CONFIRMADO")
    .reduce((sum, row) => sum + row.amount, 0);
  const summary = Object.entries(
    filtered.reduce<Record<string, number>>((acc, item) => {
      const key =
        reportType.includes("agente") || reportType.includes("Productividad")
          ? item.agent
          : reportType.includes("zona")
            ? item.zone
            : reportType.includes("tipo")
              ? item.type
              : item.financialStatus === "PAGADA"
                ? "Pagadas"
                : "Pendientes";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  function exportExcel() {
    downloadCsv("reporte-municipal.csv", [
      ["Reporte", reportType],
      ["Desde", "2026-07-01"],
      ["Hasta", "2026-07-15"],
      [],
      ["Agrupación", "Cantidad"],
      ...summary.map(([name, count]) => [name, String(count)]),
    ]);
    setNotice("Archivo compatible con Excel generado.");
  }
  return (
    <Box className="module-page">
      <PageHeader
        eyebrow="Análisis y control"
        title="Reportes"
        description="Doce reportes operativos con filtros por periodo, agente, zona y sede."
        action={
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button
              variant="outlined"
              startIcon={<PrintRoundedIcon />}
              onClick={() => window.print()}
            >
              Exportar PDF
            </Button>
            <Button
              variant="contained"
              startIcon={<DownloadRoundedIcon />}
              onClick={exportExcel}
            >
              Exportar Excel
            </Button>
          </Stack>
        }
      />
      <Paper variant="outlined" className="report-controls">
        <FormControl>
          <InputLabel>Reporte</InputLabel>
          <Select
            label="Reporte"
            value={reportType}
            onChange={(event) => setReportType(event.target.value)}
          >
            {reportTypes.map((value) => (
              <MenuItem value={value} key={value}>
                {value}
              </MenuItem>
            ))}
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
          defaultValue="2026-07-15"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <FormControl>
          <InputLabel>Agente</InputLabel>
          <Select
            label="Agente"
            value={agent}
            onChange={(event) => setAgent(event.target.value)}
          >
            <MenuItem value="">Todos</MenuItem>
            {[...new Set(infractions.map((row) => row.agent))].map((value) => (
              <MenuItem value={value} key={value}>
                {value}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl>
          <InputLabel>Zona</InputLabel>
          <Select
            label="Zona"
            value={zone}
            onChange={(event) => setZone(event.target.value)}
          >
            <MenuItem value="">Todas</MenuItem>
            {[...new Set(infractions.map((row) => row.zone))].map((value) => (
              <MenuItem value={value} key={value}>
                {value}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl>
          <InputLabel>Sede</InputLabel>
          <Select
            label="Sede"
            value={site}
            onChange={(event) => setSite(event.target.value)}
          >
            <MenuItem value="todas">Todas</MenuItem>
            <MenuItem value="central">Sede central</MenuItem>
            <MenuItem value="mercado">Sede mercado</MenuItem>
          </Select>
        </FormControl>
      </Paper>
      <Alert severity="info" sx={{ mb: 2 }}>
        Vista activa: <strong>{reportType}</strong> ·{" "}
        {site === "todas" ? "Todas las sedes" : site}
      </Alert>
      <Grid container spacing={2} className="stats-grid">
        <Grid size={{ xs: 12, md: 3 }}>
          <StatCard
            label="Boletas"
            value={String(filtered.length)}
            helper="En el periodo"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <StatCard
            label="Recaudación"
            value={money(revenue)}
            helper="Pagos confirmados"
            tone="success"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <StatCard
            label="Tasa de pago"
            value={`${Math.round((filtered.filter((row) => row.financialStatus === "PAGADA").length / Math.max(1, filtered.length)) * 100)}%`}
            helper="Expedientes cubiertos"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <StatCard
            label="Solvencias"
            value={String(
              solvencies.filter((row) => row.status === "EMITIDA").length,
            )}
            helper="Documentos emitidos"
          />
        </Grid>
      </Grid>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper variant="outlined" className="chart-card">
            <Box className="card-title-row">
              <Box>
                <Typography className="overline">Tendencia mensual</Typography>
                <Typography variant="h6">Boletas y pagos</Typography>
              </Box>
              <StatusChip status="ACTIVO" />
            </Box>
            <ResponsiveContainer width="100%" height={310}>
              <BarChart data={report}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#E3E8DF"
                />
                <XAxis dataKey="month" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="boletas"
                  name="Boletas"
                  fill="#5A6A3D"
                  radius={[10, 10, 0, 0]}
                />
                <Bar
                  dataKey="pagos"
                  name="Pagos"
                  fill="#A3B18A"
                  radius={[10, 10, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper variant="outlined" className="report-ranking">
            <Typography className="overline">Resultado agrupado</Typography>
            <Typography variant="h6">{reportType}</Typography>
            {summary.slice(0, 6).map(([name, count], index) => (
              <Box key={name}>
                <Typography>
                  <strong>{index + 1}</strong>
                  {name}
                </Typography>
                <Typography>{count}</Typography>
              </Box>
            ))}
          </Paper>
        </Grid>
      </Grid>
      <Snackbar
        open={Boolean(notice)}
        message={notice}
        autoHideDuration={2600}
        onClose={() => setNotice("")}
      />
    </Box>
  );
}

type Device = {
  name: string;
  owner: string;
  kind: string;
  sync: string;
  version: string;
  pending: number;
  errors: number;
  active: boolean;
  location: string;
  history: string[];
};
const initialDevices: Device[] = [
  {
    name: "PMT-ANDROID-018",
    owner: "Luis Hernández",
    kind: "Android operativo",
    sync: "Hace 2 min",
    version: "PMT Mobile 2.4.1",
    pending: 0,
    errors: 0,
    active: true,
    location: "Zona 1",
    history: [
      "Asignado a Luis Hernández · 01 jul",
      "Actualizado a 2.4.1 · 12 jul",
    ],
  },
  {
    name: "CAJA-01-PC",
    owner: "José Castillo",
    kind: "Estación de receptoría",
    sync: "En línea",
    version: "Portal web 5.0",
    pending: 0,
    errors: 0,
    active: true,
    location: "Sede central",
    history: ["Vinculado a Caja 01 · 05 ene", "Revisión de seguridad · 10 jul"],
  },
  {
    name: "PMT-ANDROID-011",
    owner: "Edgar Alvarado",
    kind: "Android operativo",
    sync: "12 jul 2026",
    version: "PMT Mobile 2.3.8",
    pending: 3,
    errors: 2,
    active: false,
    location: "Zona 2",
    history: [
      "Error de sincronización · 12 jul",
      "Bloqueado por administrador · 13 jul",
    ],
  },
];

export function DevicesSyncPage() {
  const [devices, setDevices] = useState(initialDevices);
  const [selected, setSelected] = useState<Device | null>(null);
  const [notice, setNotice] = useState("");
  function retry(name: string) {
    setDevices((current) =>
      current.map((device) =>
        device.name === name
          ? {
              ...device,
              sync: "Sincronizado ahora",
              pending: 0,
              errors: 0,
              active: true,
              history: [`Reintento exitoso · 15 jul`, ...device.history],
            }
          : device,
      ),
    );
    setNotice("Sincronización reintentada y boletas pendientes enviadas.");
  }
  function toggle(name: string) {
    setDevices((current) =>
      current.map((device) =>
        device.name === name
          ? {
              ...device,
              active: !device.active,
              history: [
                `Dispositivo ${device.active ? "bloqueado" : "habilitado"} · 15 jul`,
                ...device.history,
              ],
            }
          : device,
      ),
    );
    setNotice("Estado del dispositivo actualizado con trazabilidad.");
  }
  return (
    <Box className="module-page">
      <PageHeader
        eyebrow="Equipos y conectividad"
        title="Dispositivos y sincronización"
        description="Supervisa asignaciones, versiones, boletas pendientes y errores de cada equipo."
        action={
          <Button
            variant="contained"
            startIcon={<AssignmentIndRoundedIcon />}
            onClick={() =>
              setNotice("Código de vinculación generado: PMT-7F4A.")
            }
          >
            Vincular dispositivo
          </Button>
        }
      />
      <Grid container spacing={2} className="stats-grid">
        <Grid size={{ xs: 12, md: 4 }}>
          <StatCard
            label="Equipos vinculados"
            value={String(devices.length)}
            helper="Teléfonos y estaciones"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <StatCard
            label="Boletas pendientes"
            value={String(devices.reduce((sum, row) => sum + row.pending, 0))}
            helper="Sin enviar al servidor"
            tone="warning"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <StatCard
            label="Errores activos"
            value={String(devices.reduce((sum, row) => sum + row.errors, 0))}
            helper="Requieren reintento"
            tone="warning"
          />
        </Grid>
      </Grid>
      <Grid container spacing={2}>
        {devices.map((device) => (
          <Grid size={{ xs: 12, md: 6, lg: 4 }} key={device.name}>
            <Paper variant="outlined" className="device-card">
              <Box className="device-icon">
                {device.kind.includes("Android") ? (
                  <SmartphoneRoundedIcon />
                ) : (
                  <LaptopMacRoundedIcon />
                )}
              </Box>
              <Box className="device-card-head">
                <Box>
                  <Typography variant="h6">{device.name}</Typography>
                  <Typography color="text.secondary">{device.kind}</Typography>
                </Box>
                <StatusChip
                  status={
                    device.errors
                      ? "ERROR"
                      : device.active
                        ? "ACTIVO"
                        : "INACTIVO"
                  }
                />
              </Box>
              <Divider />
              <Typography>
                <LocationOnRoundedIcon /> {device.location}
              </Typography>
              <Typography>
                <CloudDoneRoundedIcon /> Última conexión: {device.sync}
              </Typography>
              <Typography>
                Versión: <strong>{device.version}</strong>
              </Typography>
              <Typography>
                Responsable: <strong>{device.owner}</strong>
              </Typography>
              <Box className="device-sync-metrics">
                <Box>
                  <Typography>Boletas pendientes</Typography>
                  <strong>{device.pending}</strong>
                </Box>
                <Box>
                  <Typography>Errores</Typography>
                  <strong>{device.errors}</strong>
                </Box>
              </Box>
              {device.errors > 0 && (
                <Alert severity="warning" icon={<ErrorOutlineRoundedIcon />}>
                  Requiere un reintento controlado.
                </Alert>
              )}
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                <Button
                  startIcon={<HistoryRoundedIcon />}
                  onClick={() => setSelected(device)}
                >
                  Historial
                </Button>
                {device.pending > 0 && (
                  <Button
                    variant="contained"
                    startIcon={<ReplayRoundedIcon />}
                    onClick={() => retry(device.name)}
                  >
                    Reintentar
                  </Button>
                )}
                <Button
                  color={device.active ? "error" : "primary"}
                  onClick={() => toggle(device.name)}
                >
                  {device.active ? "Bloquear" : "Habilitar"}
                </Button>
              </Stack>
            </Paper>
          </Grid>
        ))}
      </Grid>
      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Historial de asignaciones</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            {selected?.history.map((entry, index) => (
              <Box className="device-history-row" key={entry}>
                <Box>{index + 1}</Box>
                <Typography>{entry}</Typography>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={Boolean(notice)}
        message={notice}
        autoHideDuration={2800}
        onClose={() => setNotice("")}
      />
    </Box>
  );
}
