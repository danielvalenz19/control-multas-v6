"use client";

import { useState } from "react";
import {
  Alert,
  Box,
  Button,
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
import AddCardRoundedIcon from "@mui/icons-material/AddCardRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  BusyButton,
  ConfirmDialog,
  PageHeader,
  StatCard,
  StatusChip,
  money,
  readableError,
} from "@/src/components/common";
import { useApp } from "@/src/contexts/AppContext";

export function ReceptionPage() {
  const { payments, infractions } = useApp();
  const [query, setQuery] = useState("");
  const todayTotal = payments
    .filter((row) => row.status === "CONFIRMADO")
    .slice(0, 8)
    .reduce((sum, row) => sum + row.amount, 0);
  const filtered = payments.filter((payment) => {
    const item = infractions.find((row) => row.id === payment.infractionId);
    return `${payment.receiptNumber} ${item?.ticket ?? ""} ${item?.plate ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase());
  });
  return (
    <Box className="module-page">
      <PageHeader
        eyebrow="Control de receptoría"
        title="Caja y pagos"
        description="Abre y cierra caja, consulta deudas, registra recibos y concilia cada movimiento del día."
        action={
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button
              variant="outlined"
              component={Link}
              to="/admin/receptoria/caja"
            >
              Control de caja
            </Button>
            <Button
              variant="contained"
              component={Link}
              to="/admin/receptoria/pagos/nuevo"
              startIcon={<AddCardRoundedIcon />}
            >
              Registrar pago
            </Button>
          </Stack>
        }
      />
      <Grid container spacing={2} className="stats-grid">
        <Grid size={{ xs: 12, md: 4 }}>
          <StatCard
            label="Recaudación del día"
            value={money(todayTotal)}
            helper="Pagos confirmados"
            tone="success"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <StatCard
            label="Recibos registrados"
            value={String(payments.length)}
            helper="3 cajas activas"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <StatCard
            label="Diferencias pendientes"
            value="Q 0.00"
            helper="Cierre aún no conciliado"
            tone="warning"
          />
        </Grid>
      </Grid>
      <Paper variant="outlined" className="reception-search">
        <SearchRoundedIcon />
        <Box>
          <Typography variant="h6">Buscar deuda o recibo</Typography>
          <Typography color="text.secondary">
            Boleta, expediente, placa o número de recibo.
          </Typography>
        </Box>
        <TextField
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ej. 2026-001279"
        />
      </Paper>
      <Paper variant="outlined" className="data-table-card">
        <Box className="card-title-row">
          <Box>
            <Typography className="overline">Movimientos recientes</Typography>
            <Typography variant="h6">Pagos registrados</Typography>
          </Box>
          <Button component={Link} to="/admin/receptoria/conciliacion">
            Ir a conciliación
          </Button>
        </Box>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Recibo</TableCell>
                <TableCell>Boleta</TableCell>
                <TableCell>Placa</TableCell>
                <TableCell>Concepto</TableCell>
                <TableCell>Caja</TableCell>
                <TableCell>Monto</TableCell>
                <TableCell>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.slice(0, 8).map((payment) => {
                const infraction = infractions.find(
                  (row) => row.id === payment.infractionId,
                );
                return (
                  <TableRow key={payment.id}>
                    <TableCell>
                      <Button
                        component={Link}
                        to={`/admin/receptoria/pagos/${payment.id}`}
                        size="small"
                      >
                        {payment.receiptNumber}
                      </Button>
                    </TableCell>
                    <TableCell>{infraction?.ticket}</TableCell>
                    <TableCell>{infraction?.plate}</TableCell>
                    <TableCell>
                      {payment.concept === "MULTA"
                        ? "Multa"
                        : "Tarifa solvencia"}
                    </TableCell>
                    <TableCell>{payment.cashDesk}</TableCell>
                    <TableCell>
                      <strong>{money(payment.amount)}</strong>
                    </TableCell>
                    <TableCell>
                      <StatusChip status={payment.status} />
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

export function NewPaymentPage() {
  const { infractions, registerPayment } = useApp();
  const navigate = useNavigate();
  const eligible = infractions.filter((row) => row.legalStatus === "VALIDADA");
  const [infractionId, setInfractionId] = useState("inf-1279");
  const [concept, setConcept] = useState<"MULTA" | "SOLVENCIA">("MULTA");
  const [receipt, setReceipt] = useState("");
  const [cashDesk, setCashDesk] = useState("Caja 01");
  const [method, setMethod] = useState("Efectivo");
  const [amount, setAmount] = useState("350");
  const [observation, setObservation] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const selected = eligible.find((row) => row.id === infractionId);
  const outstanding = selected
    ? concept === "MULTA"
      ? Math.max(0, selected.amount - selected.paidAmount)
      : 50
    : 0;
  function prepare(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!receipt.trim()) return setError("El número de recibo es obligatorio.");
    if (Number(amount) <= 0)
      return setError("El monto debe ser mayor que cero.");
    if (Number(amount) > outstanding)
      return setError("El monto supera el saldo pendiente.");
    setConfirm(true);
  }
  async function apply() {
    setBusy(true);
    setError("");
    try {
      await registerPayment({
        infractionId,
        receiptNumber: receipt,
        concept,
        amount: Number(amount),
        cashDesk,
        method,
      });
      setSuccess(`Pago aplicado. Recibo ${receipt.toUpperCase()}.`);
      setConfirm(false);
    } catch (reason) {
      setError(readableError(reason));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Box className="module-page narrow-module">
      <Button onClick={() => navigate(-1)}>← Volver a receptoría</Button>
      <PageHeader
        eyebrow="Nuevo movimiento"
        title="Registrar pago"
        description="Los pagos de multa y de solvencia se registran como conceptos separados."
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} icon={<TaskAltRoundedIcon />}>
          {success} El saldo y la auditoría fueron actualizados.
        </Alert>
      )}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper variant="outlined" className="form-section">
            <form onSubmit={prepare}>
              <Stack spacing={2.5}>
                <FormControl fullWidth>
                  <InputLabel>Infracción validada</InputLabel>
                  <Select
                    label="Infracción validada"
                    value={infractionId}
                    onChange={(event) => {
                      setInfractionId(event.target.value);
                      setSuccess("");
                    }}
                    disabled={Boolean(success)}
                  >
                    {eligible.map((item) => (
                      <MenuItem value={item.id} key={item.id}>
                        {item.ticket} · {item.plate} · Saldo{" "}
                        {money(Math.max(0, item.amount - item.paidAmount))}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormControl fullWidth>
                      <InputLabel>Concepto</InputLabel>
                      <Select
                        label="Concepto"
                        value={concept}
                        onChange={(event) => {
                          const value = event.target.value as
                            | "MULTA"
                            | "SOLVENCIA";
                          setConcept(value);
                          setAmount(
                            value === "SOLVENCIA"
                              ? "50"
                              : String(
                                  selected
                                    ? selected.amount - selected.paidAmount
                                    : 0,
                                ),
                          );
                        }}
                      >
                        <MenuItem value="MULTA">Pago de multa</MenuItem>
                        <MenuItem value="SOLVENCIA">
                          Tarifa de emisión de solvencia
                        </MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      label="Número de recibo"
                      value={receipt}
                      onChange={(event) =>
                        setReceipt(event.target.value.toUpperCase())
                      }
                      helperText="Único. Prueba REC-2026-04821 para simular duplicado."
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormControl fullWidth>
                      <InputLabel>Caja</InputLabel>
                      <Select
                        label="Caja"
                        value={cashDesk}
                        onChange={(event) => setCashDesk(event.target.value)}
                      >
                        <MenuItem value="Caja 01">Caja 01</MenuItem>
                        <MenuItem value="Caja 02">Caja 02</MenuItem>
                        <MenuItem value="Caja 03">Caja 03</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormControl fullWidth>
                      <InputLabel>Método</InputLabel>
                      <Select
                        label="Método"
                        value={method}
                        onChange={(event) => setMethod(event.target.value)}
                      >
                        <MenuItem value="Efectivo">Efectivo</MenuItem>
                        <MenuItem value="Tarjeta">Tarjeta</MenuItem>
                        <MenuItem value="Transferencia">Transferencia</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      type="number"
                      label="Monto"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      type="datetime-local"
                      label="Fecha y hora"
                      defaultValue="2026-07-14T11:30"
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  </Grid>
                </Grid>
                <TextField
                  multiline
                  minRows={3}
                  label="Observación"
                  value={observation}
                  onChange={(event) => setObservation(event.target.value)}
                />
                <Button variant="outlined" component="label">
                  Adjuntar comprobante opcional
                  <input hidden type="file" accept="image/*,.pdf" />
                </Button>
                <Divider />
                <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
                  <Button onClick={() => navigate(-1)}>Cancelar</Button>
                  <Button
                    variant="contained"
                    type="submit"
                    disabled={Boolean(success) || busy}
                  >
                    Revisar y confirmar
                  </Button>
                </Stack>
              </Stack>
            </form>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper variant="outlined" className="payment-summary-card">
            <Typography className="overline">Resumen</Typography>
            <Typography variant="h6">{selected?.ticket}</Typography>
            <Typography color="text.secondary">
              {selected?.plate} · {selected?.type}
            </Typography>
            <Divider />
            <Typography>
              <span>Monto original</span>
              <strong>{money(selected?.amount ?? 0)}</strong>
            </Typography>
            <Typography>
              <span>Pagado</span>
              <strong>{money(selected?.paidAmount ?? 0)}</strong>
            </Typography>
            <Typography>
              <span>Saldo del concepto</span>
              <strong>{money(outstanding)}</strong>
            </Typography>
            <Alert severity="info">
              El recibo se validará como único antes de aplicar el pago.
            </Alert>
          </Paper>
        </Grid>
      </Grid>
      <ConfirmDialog
        open={confirm}
        title="Aplicar pago"
        description={`Confirma el recibo ${receipt} por ${money(Number(amount) || 0)}. Esta acción modificará el saldo del expediente.`}
        confirmLabel={busy ? "Procesando…" : "Aplicar pago"}
        onCancel={() => setConfirm(false)}
        onConfirm={apply}
      >
        <BusyButton busy={busy} sx={{ display: "none" }}>
          Procesando
        </BusyButton>
      </ConfirmDialog>
    </Box>
  );
}

export function PaymentDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { session, payments, infractions, reversePayment } = useApp();
  const payment = payments.find((row) => row.id === id);
  const item = payment
    ? infractions.find((row) => row.id === payment.infractionId)
    : null;
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  if (!payment || !item)
    return (
      <Box className="module-page">
        <PageHeader
          eyebrow="Receptoría"
          title="Pago no encontrado"
          description="El movimiento solicitado no existe en los datos demostrativos."
        />
        <Button onClick={() => navigate(-1)}>Volver</Button>
      </Box>
    );
  const canReverse =
    session?.role === "ADMIN" || session?.role === "SUPERVISOR";
  const paymentId = payment.id;
  async function reverse() {
    try {
      setError("");
      await reversePayment(paymentId, reason);
      setConfirm(false);
      setMessage(
        "Pago reversado. El movimiento permanece visible y el saldo fue recalculado.",
      );
    } catch (cause) {
      setError(readableError(cause));
    }
  }
  return (
    <Box className="module-page narrow-module">
      <Button onClick={() => navigate(-1)}>← Volver a receptoría</Button>
      <PageHeader
        eyebrow="Detalle de pago"
        title={payment.receiptNumber}
        description="Consulta la aplicación, evidencia y trazabilidad del recibo."
        action={<StatusChip status={payment.status} />}
      />
      {message && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {message}
        </Alert>
      )}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper variant="outlined" className="form-section">
            <Typography variant="h6">Datos del recibo</Typography>
            <Divider sx={{ my: 2 }} />
            <Box className="key-value-grid">
              <Typography>
                <span>Boleta</span>
                <strong>{item.ticket}</strong>
              </Typography>
              <Typography>
                <span>Placa</span>
                <strong>{item.plate}</strong>
              </Typography>
              <Typography>
                <span>Concepto</span>
                <strong>
                  {payment.concept === "MULTA"
                    ? "Pago de multa"
                    : "Tarifa de solvencia"}
                </strong>
              </Typography>
              <Typography>
                <span>Monto aplicado</span>
                <strong>{money(payment.amount)}</strong>
              </Typography>
              <Typography>
                <span>Caja</span>
                <strong>{payment.cashDesk}</strong>
              </Typography>
              <Typography>
                <span>Método</span>
                <strong>{payment.method}</strong>
              </Typography>
              <Typography>
                <span>Fecha y hora</span>
                <strong>
                  {new Date(payment.createdAt).toLocaleString("es-GT")}
                </strong>
              </Typography>
              <Typography>
                <span>Usuario receptor</span>
                <strong>{payment.createdBy}</strong>
              </Typography>
            </Box>
          </Paper>
          <Paper variant="outlined" className="public-timeline">
            <Typography variant="h6">Historial del movimiento</Typography>
            <Box>
              <span className="done" />
              <Typography>
                <strong>Recibo registrado</strong>
                <small>
                  {payment.createdBy} · {payment.cashDesk}
                </small>
              </Typography>
            </Box>
            <Box>
              <span className={payment.status === "REVERSADO" ? "done" : ""} />
              <Typography>
                <strong>Reverso administrativo</strong>
                <small>
                  {payment.status === "REVERSADO"
                    ? "Aplicado con trazabilidad"
                    : "Sin reverso"}
                </small>
              </Typography>
            </Box>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Paper variant="outlined" className="payment-summary-card">
            <Typography className="overline">Aplicación</Typography>
            <Typography variant="h6">{item.type}</Typography>
            <Typography color="text.secondary">{item.caseNumber}</Typography>
            <Divider />
            <Typography>
              <span>Monto original</span>
              <strong>{money(item.amount)}</strong>
            </Typography>
            <Typography>
              <span>Total aplicado</span>
              <strong>{money(item.paidAmount)}</strong>
            </Typography>
            <Typography>
              <span>Saldo actual</span>
              <strong>
                {money(Math.max(0, item.amount - item.paidAmount))}
              </strong>
            </Typography>
            <Button
              fullWidth
              variant="outlined"
              component={Link}
              to={`/admin/infracciones/${item.id}`}
            >
              Abrir expediente
            </Button>
            {canReverse && payment.status !== "REVERSADO" && (
              <Button
                fullWidth
                color="error"
                variant="outlined"
                onClick={() => setConfirm(true)}
                sx={{ mt: 1 }}
              >
                Solicitar reverso
              </Button>
            )}
          </Paper>
        </Grid>
      </Grid>
      <ConfirmDialog
        open={confirm}
        title="Reversar pago"
        description="El recibo no se eliminará. Se recalculará el saldo y se registrará el motivo en auditoría."
        confirmLabel="Confirmar reverso"
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={reverse}
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

export function ReconciliationPage() {
  const { payments } = useApp();
  const [reconciled, setReconciled] = useState(false);
  const rows = payments
    .filter((row) => row.status === "CONFIRMADO")
    .slice(0, 8);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return (
    <Box className="module-page">
      <PageHeader
        eyebrow="Cierre diario"
        title="Conciliación de receptoría"
        description="Compara los recibos registrados antes de confirmar el cierre de caja."
        action={
          <Button
            variant="outlined"
            startIcon={<DownloadRoundedIcon />}
            onClick={() => window.print()}
          >
            Exportar cierre
          </Button>
        }
      />
      <Paper variant="outlined" className="reconciliation-controls">
        <TextField
          type="date"
          label="Fecha"
          defaultValue="2026-07-14"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <FormControl>
          <InputLabel>Caja</InputLabel>
          <Select label="Caja" defaultValue="Caja 01">
            <MenuItem value="Caja 01">Caja 01</MenuItem>
            <MenuItem value="Caja 02">Caja 02</MenuItem>
          </Select>
        </FormControl>
        <Button
          variant="contained"
          disabled={reconciled}
          onClick={() => setReconciled(true)}
        >
          Marcar conciliado
        </Button>
      </Paper>
      {reconciled && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Cierre marcado como conciliado. La acción se agregó a auditoría.
        </Alert>
      )}
      <Grid container spacing={2} className="stats-grid">
        <Grid size={{ xs: 12, md: 4 }}>
          <StatCard
            label="Total registrado"
            value={money(total)}
            helper="Caja 01"
            tone="success"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <StatCard
            label="Cantidad de recibos"
            value={String(rows.length)}
            helper="Movimientos confirmados"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <StatCard
            label="Diferencia"
            value="Q 0.00"
            helper="Sin diferencias"
            tone="success"
          />
        </Grid>
      </Grid>
      <Paper variant="outlined" className="data-table-card">
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Recibo</TableCell>
                <TableCell>Concepto</TableCell>
                <TableCell>Método</TableCell>
                <TableCell>Registró</TableCell>
                <TableCell>Monto</TableCell>
                <TableCell>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Button
                      component={Link}
                      to={`/admin/receptoria/pagos/${row.id}`}
                    >
                      {row.receiptNumber}
                    </Button>
                  </TableCell>
                  <TableCell>{row.concept}</TableCell>
                  <TableCell>{row.method}</TableCell>
                  <TableCell>{row.createdBy}</TableCell>
                  <TableCell>{money(row.amount)}</TableCell>
                  <TableCell>
                    <StatusChip status={reconciled ? "EXITOSO" : "PENDIENTE"} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
