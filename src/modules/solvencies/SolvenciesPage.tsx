"use client";

import { useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import PrintRoundedIcon from "@mui/icons-material/PrintRounded";
import VerifiedRoundedIcon from "@mui/icons-material/VerifiedRounded";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ConfirmDialog,
  PageHeader,
  StatusChip,
  maskPlate,
  money,
  readableError,
} from "@/src/components/common";
import { useApp } from "@/src/contexts/AppContext";

export default function SolvenciesPage() {
  const { solvencies, infractions } = useApp();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const filtered = solvencies.filter((row) => {
    const item = infractions.find(
      (infraction) => infraction.id === row.infractionId,
    );
    return (
      (!query ||
        `${row.id} ${item?.ticket ?? ""} ${item?.plate ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!status || row.status === status)
    );
  });
  return (
    <Box className="module-page">
      <PageHeader
        eyebrow="Constancias municipales"
        title="Solvencias"
        description="Verifica requisitos, emite documentos y conserva el historial de reimpresiones."
        action={
          <Button variant="outlined" component={Link} to="/verificar-solvencia">
            Verificar código
          </Button>
        }
      />
      <Paper variant="outlined" className="solvency-readiness">
        <Box>
          <Typography className="overline">Listas para emitir</Typography>
          <Typography variant="h3">
            {
              solvencies.filter((row) => row.status === "LISTA_PARA_EMITIR")
                .length
            }
          </Typography>
          <Typography color="text.secondary">
            Solicitudes cumplen los requisitos automáticos.
          </Typography>
        </Box>
        <Stack direction={{ xs: "column", sm: "row" }}>
          {["Infracción validada", "Multa pagada", "Tarifa cubierta"].map(
            (text) => (
              <Typography key={text}>
                <VerifiedRoundedIcon />
                {text}
              </Typography>
            ),
          )}
        </Stack>
      </Paper>
      <Paper variant="outlined" className="filter-bar">
        <TextField
          className="filter-search"
          placeholder="Solicitud, boleta o placa"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <FormControl>
          <InputLabel>Estado</InputLabel>
          <Select
            label="Estado"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="LISTA_PARA_EMITIR">Lista para emitir</MenuItem>
            <MenuItem value="EMITIDA">Emitida</MenuItem>
            <MenuItem value="PENDIENTE_REQUISITOS">
              Requisitos pendientes
            </MenuItem>
            <MenuItem value="PENDIENTE_PAGO_EMISION">Tarifa pendiente</MenuItem>
            <MenuItem value="ANULADA">Anulada</MenuItem>
          </Select>
        </FormControl>
        <Button
          onClick={() => {
            setQuery("");
            setStatus("");
          }}
        >
          Limpiar
        </Button>
      </Paper>
      <Paper variant="outlined" className="data-table-card">
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Solicitud</TableCell>
                <TableCell>Boleta</TableCell>
                <TableCell>Placa</TableCell>
                <TableCell>Fecha</TableCell>
                <TableCell>Pago multa</TableCell>
                <TableCell>Tarifa</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Responsable</TableCell>
                <TableCell align="right">Acción</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((row) => {
                const item = infractions.find(
                  (inf) => inf.id === row.infractionId,
                );
                return (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <strong>{row.id}</strong>
                    </TableCell>
                    <TableCell>{item?.ticket}</TableCell>
                    <TableCell>{item?.plate}</TableCell>
                    <TableCell>
                      {new Date(row.requestedAt).toLocaleDateString("es-GT")}
                    </TableCell>
                    <TableCell>
                      <StatusChip
                        status={item?.financialStatus ?? "SIN_ORDEN"}
                      />
                    </TableCell>
                    <TableCell>
                      <StatusChip
                        status={
                          item?.solvencyFeePaid ? "PAGADA" : "PENDIENTE_PAGO"
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <StatusChip status={row.status} />
                    </TableCell>
                    <TableCell>{row.responsible}</TableCell>
                    <TableCell align="right">
                      <Button
                        component={Link}
                        to={`/admin/solvencias/${row.id}`}
                      >
                        Revisar
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}

export function SolvencyDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { solvencies, infractions, issueSolvency, cancelSolvency } = useApp();
  const request = solvencies.find((row) => row.id === id);
  const infraction = request
    ? infractions.find((row) => row.id === request.infractionId)
    : null;
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reason, setReason] = useState("");
  if (!request || !infraction)
    return (
      <Box className="module-page">
        <PageHeader
          eyebrow="Solvencias"
          title="Solicitud no encontrada"
          description="El registro solicitado no existe en los datos demostrativos."
        />
        <Button onClick={() => navigate(-1)}>Volver</Button>
      </Box>
    );
  const checks = [
    { label: "Infracción validada", ok: infraction.legalStatus === "VALIDADA" },
    {
      label: "Saldo de multa en cero",
      ok: infraction.financialStatus === "PAGADA",
    },
    { label: "Tarifa de solvencia pagada", ok: infraction.solvencyFeePaid },
    { label: "Datos completos", ok: true },
    { label: "Sin bloqueo", ok: request.status !== "ANULADA" },
  ];
  const requestId = request.id;
  async function issue() {
    try {
      setError("");
      const result = await issueSolvency(requestId);
      setMessage(
        `Solvencia ${result.solvencyNumber} emitida con código ${result.verificationCode}.`,
      );
      setConfirmIssue(false);
    } catch (cause) {
      setError(readableError(cause));
      setConfirmIssue(false);
    }
  }
  async function cancel() {
    try {
      setError("");
      await cancelSolvency(requestId, reason);
      setMessage("Solvencia anulada. El número y el historial se conservaron.");
      setConfirmCancel(false);
    } catch (cause) {
      setError(readableError(cause));
    }
  }
  return (
    <Box className="module-page narrow-module">
      <Button onClick={() => navigate(-1)}>← Volver a solvencias</Button>
      <PageHeader
        eyebrow="Detalle de solicitud"
        title={request.id}
        description="Checklist automático y acciones documentales de la solvencia."
        action={<StatusChip status={request.status} />}
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {message && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {message}
        </Alert>
      )}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper variant="outlined" className="form-section">
            <Box className="solvency-dialog-head">
              <Box>
                <Typography variant="h6">{infraction.ticket}</Typography>
                <Typography color="text.secondary">
                  {maskPlate(infraction.plate)} · {infraction.type}
                </Typography>
              </Box>
              <StatusChip status={request.status} />
            </Box>
            <Divider sx={{ my: 2 }} />
            <Typography className="overline">Lista de requisitos</Typography>
            <Stack spacing={1.2} sx={{ mt: 1.5 }}>
              {checks.map((check) => (
                <Box
                  className={`requirement-row ${check.ok ? "ok" : "blocked"}`}
                  key={check.label}
                >
                  <VerifiedRoundedIcon />
                  <Typography>{check.label}</Typography>
                  <Typography>{check.ok ? "Cumplido" : "Pendiente"}</Typography>
                </Box>
              ))}
            </Stack>
          </Paper>
          <Paper variant="outlined" className="public-timeline">
            <Typography variant="h6">Historial documental</Typography>
            <Box>
              <span className="done" />
              <Typography>
                <strong>Solicitud registrada</strong>
                <small>
                  {new Date(request.requestedAt).toLocaleString("es-GT")}
                </small>
              </Typography>
            </Box>
            <Box>
              <span
                className={
                  request.status === "EMITIDA" || request.status === "ANULADA"
                    ? "done"
                    : ""
                }
              />
              <Typography>
                <strong>Documento emitido</strong>
                <small>
                  {request.issuedAt
                    ? new Date(request.issuedAt).toLocaleString("es-GT")
                    : "Pendiente"}
                </small>
              </Typography>
            </Box>
            <Box>
              <span className={request.status === "ANULADA" ? "done" : ""} />
              <Typography>
                <strong>Anulación</strong>
                <small>
                  {request.status === "ANULADA"
                    ? "Documento marcado como inválido"
                    : "Sin anulación"}
                </small>
              </Typography>
            </Box>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Paper variant="outlined" className="payment-summary-card">
            <Typography className="overline">Resumen financiero</Typography>
            <Typography>
              <span>Multa</span>
              <strong>{money(infraction.amount)}</strong>
            </Typography>
            <Typography>
              <span>Saldo</span>
              <strong>
                {money(Math.max(0, infraction.amount - infraction.paidAmount))}
              </strong>
            </Typography>
            <Typography>
              <span>Tarifa</span>
              <strong>
                {infraction.solvencyFeePaid ? "Pagada" : "Pendiente"}
              </strong>
            </Typography>
            <Divider />
            {request.solvencyNumber && (
              <>
                <Typography>
                  <span>Número</span>
                  <strong>{request.solvencyNumber}</strong>
                </Typography>
                <Typography>
                  <span>Verificación</span>
                  <strong>{request.verificationCode}</strong>
                </Typography>
              </>
            )}
            <Stack spacing={1.1} sx={{ mt: 2 }}>
              {request.status !== "EMITIDA" && request.status !== "ANULADA" && (
                <Button
                  variant="contained"
                  disabled={!checks.every((row) => row.ok)}
                  onClick={() => setConfirmIssue(true)}
                >
                  Emitir solvencia
                </Button>
              )}
              {request.status === "EMITIDA" && (
                <>
                  <Button
                    variant="contained"
                    startIcon={<DownloadRoundedIcon />}
                    onClick={() => window.print()}
                  >
                    Descargar
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<PrintRoundedIcon />}
                    onClick={() => window.print()}
                  >
                    Reimprimir
                  </Button>
                  <Button
                    component={Link}
                    to={`/solvencia/${request.verificationCode}`}
                  >
                    Abrir documento público
                  </Button>
                  <Button color="error" onClick={() => setConfirmCancel(true)}>
                    Anular con motivo
                  </Button>
                </>
              )}
            </Stack>
          </Paper>
        </Grid>
      </Grid>
      <Dialog open={confirmIssue} onClose={() => setConfirmIssue(false)}>
        <DialogTitle>Confirmar emisión</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            Se generará un número único y un código de verificación. Una
            reimpresión posterior conservará ambos valores.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmIssue(false)}>Cancelar</Button>
          <Button variant="contained" onClick={issue}>
            Emitir documento
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog
        open={confirmCancel}
        title="Anular solvencia"
        description="El documento seguirá en el historial, pero su verificación pública lo mostrará como anulado."
        confirmLabel="Confirmar anulación"
        danger
        onCancel={() => setConfirmCancel(false)}
        onConfirm={cancel}
      >
        <TextField
          label="Motivo obligatorio"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          multiline
          minRows={3}
          error={Boolean(error)}
          helperText={error}
        />
      </ConfirmDialog>
    </Box>
  );
}
