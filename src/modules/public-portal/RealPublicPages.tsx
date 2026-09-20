import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Container, Divider, Grid, LinearProgress, Paper, Stack, TextField, Typography } from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import ArticleRoundedIcon from "@mui/icons-material/ArticleRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import DirectionsCarRoundedIcon from "@mui/icons-material/DirectionsCarRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import GppGoodRoundedIcon from "@mui/icons-material/GppGoodRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BusyButton, EmptyState, ErrorState, LoadingState, StatusChip, readableError } from "@/src/components/common";
import { publicApi, type OnlinePaymentIntent, type PublicInfraction, type PublicPaymentOrder } from "./api/publicApi";

const LOOKUP_REFERENCE = "pmt-public-infraction-reference";
const ORDER_REFERENCE = "pmt-public-payment-order-reference";
const orderKey = (reference: string) => `pmt-order-idempotency-${reference}`;
const money = (value: string) => new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(Number(value));
const date = (value: string) => new Intl.DateTimeFormat("es-GT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function PublicHome() {
  return <>
    <Box component="section" className="citizen-hero"><Container maxWidth="xl"><Grid container spacing={6} sx={{ alignItems: "center" }}><Grid size={{ xs: 12, md: 7 }}><Typography className="overline">Portal ciudadano oficial</Typography><Typography variant="h1">Consulta y paga tu multa con seguridad.</Typography><Typography className="hero-lead">Usa el número completo de boleta y la placa. Revisa el saldo exacto, paga con un checkout alojado o genera una orden para receptoría sin exponer tus datos.</Typography><Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}><Button component={Link} to="/consulta" variant="contained" size="large" startIcon={<SearchRoundedIcon />}>Consultar una multa</Button><Button component={Link} to="/pagos" variant="outlined" size="large" startIcon={<PaymentsOutlinedIcon />}>Ver opciones de pago</Button></Stack><Stack className="trust-row" direction={{ xs: "column", sm: "row" }}>{["Checkout alojado", "Referencias públicas opacas", "Datos personales protegidos"].map((text) => <Typography key={text}><CheckCircleRoundedIcon />{text}</Typography>)}</Stack></Grid><Grid size={{ xs: 12, md: 5 }}><Paper variant="outlined" className="hero-service-card"><Typography className="overline">Antes de comenzar</Typography><Typography variant="h4">Ten tu boleta a mano</Typography><Typography color="text.secondary">La consulta exige la combinación exacta de boleta y placa. Por seguridad no se admiten búsquedas únicamente por placa.</Typography><Button component={Link} to="/consulta" fullWidth variant="contained" endIcon={<ArrowForwardRoundedIcon />}>Iniciar consulta segura</Button><Typography className="privacy-caption"><LockOutlinedIcon /> Nunca mostramos nombres, identificación, agente ni evidencia privada.</Typography></Paper></Grid></Grid></Container></Box>
    <Container maxWidth="xl" component="section" className="public-process"><Box className="section-heading"><Typography className="overline">Flujo disponible</Typography><Typography variant="h3">Consulta y orden, con una separación clara.</Typography></Box><Grid container spacing={2}>{[["01", "Identifica", "Ingresa boleta y placa."], ["02", "Revisa", "Consulta estado y saldo exacto."], ["03", "Genera", "Emite una orden vigente."], ["04", "Presenta", "Lleva la orden a receptoría; no es un recibo."]].map(([number, title, text]) => <Grid size={{ xs: 12, sm: 6, md: 3 }} key={number}><Paper variant="outlined" className="process-card"><Typography>{number}</Typography><Typography variant="h6">{title}</Typography><Typography color="text.secondary">{text}</Typography></Paper></Grid>)}</Grid></Container>
  </>;
}

export function PublicLookup() {
  const navigate = useNavigate();
  const [ticketNumber, setTicketNumber] = useState("");
  const [plate, setPlate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await publicApi.search(ticketNumber, plate);
      window.sessionStorage.setItem(LOOKUP_REFERENCE, result.data.reference);
      navigate("/consulta/resultado");
    } catch (reason) { setError(readableError(reason)); }
    finally { setBusy(false); }
  }
  return <Box className="lookup-page"><Container maxWidth="lg"><Paper elevation={0} className="lookup-shell"><Box className="lookup-context"><Box className="lookup-context-copy"><Typography className="overline">Consulta segura</Typography><Typography variant="h2">Encuentra tu multa sin exponer tus datos.</Typography><Typography>La combinación de boleta y placa protege tu información y permite mostrar únicamente el expediente correcto.</Typography></Box><Box className="lookup-steps"><Box><span>01</span><ArticleRoundedIcon /><Box><Typography component="strong">Ten tu boleta a mano</Typography><Typography component="small">Ingresa el número completo, incluyendo el año.</Typography></Box></Box><Box><span>02</span><DirectionsCarRoundedIcon /><Box><Typography component="strong">Confirma la placa</Typography><Typography component="small">Escríbela tal como aparece en el vehículo.</Typography></Box></Box></Box><Box className="lookup-security-note"><GppGoodRoundedIcon /><Box><Typography component="strong">Tus datos permanecen protegidos</Typography><Typography component="small">No mostramos nombres, identificación, agente ni evidencia privada.</Typography></Box></Box></Box><Box className="lookup-form-panel"><Box className="lookup-form-heading"><Box className="lookup-form-icon"><SearchRoundedIcon /></Box><Box><Typography className="overline">Paso único</Typography><Typography variant="h4">Consulta una multa</Typography></Box></Box><Typography color="text.secondary">Ambos datos deben coincidir exactamente. Si no hay coincidencia, recibirás una respuesta genérica.</Typography>{busy && <LinearProgress className="lookup-progress" />}<form onSubmit={submit}><Stack spacing={2.25}><TextField label="Número completo de boleta" placeholder="Ej. 2026-001279" value={ticketNumber} onChange={(event) => setTicketNumber(event.target.value.trimStart().toUpperCase())} required fullWidth autoComplete="off" helperText="Incluye el año y todos los dígitos de la boleta." /><TextField label="Placa del vehículo" placeholder="Ej. P123ABC" value={plate} onChange={(event) => setPlate(event.target.value.toUpperCase())} required fullWidth autoComplete="off" helperText="No se permiten búsquedas únicamente por placa." />{error && <Alert severity="error">{error}</Alert>}<BusyButton busy={busy} type="submit" variant="contained" size="large" startIcon={<SearchRoundedIcon />} disabled={ticketNumber.trim().length < 3 || plate.trim().length < 2}>Consultar multa</BusyButton></Stack></form><Box className="lookup-privacy"><LockOutlinedIcon /><Typography>Consulta limitada y auditada sin conservar los datos ingresados.</Typography></Box></Box></Paper></Container></Box>;
}

export function PublicResultPage() {
  const navigate = useNavigate();
  const reference = typeof window === "undefined" ? "" : window.sessionStorage.getItem(LOOKUP_REFERENCE) ?? "";
  const [item, setItem] = useState<PublicInfraction | null>(null);
  const [loading, setLoading] = useState(Boolean(reference));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!reference) return;
    setLoading(true); setError("");
    try { setItem((await publicApi.getInfraction(reference)).data); }
    catch (reason) { setError(readableError(reason)); }
    finally { setLoading(false); }
  }, [reference]);
  useEffect(() => { void load(); }, [load]);
  async function createOrder() {
    if (!item) return;
    setBusy(true); setError("");
    try {
      let key = window.sessionStorage.getItem(orderKey(item.reference));
      if (!key) { key = crypto.randomUUID(); window.sessionStorage.setItem(orderKey(item.reference), key); }
      const result = await publicApi.createOrder(item.reference, key);
      window.sessionStorage.setItem(ORDER_REFERENCE, result.data.reference);
      navigate(`/orden-pago/${result.data.reference}`);
    } catch (reason) { setError(readableError(reason)); }
    finally { setBusy(false); }
  }
  if (!reference) return <Container maxWidth="md" className="public-page"><EmptyState title="No hay una consulta activa" description="Vuelve a ingresar la boleta y la placa para crear una referencia segura." /><Button component={Link} to="/consulta" sx={{ mt: 2 }}>Ir a consulta</Button></Container>;
  if (loading) return <Container maxWidth="lg" className="public-page"><LoadingState rows={7} /></Container>;
  if (!item) return <Container maxWidth="md" className="public-page"><ErrorState message={error} onRetry={() => void load()} /></Container>;
  return <Container maxWidth="lg" className="public-page"><Box className="result-header"><Box><Typography className="overline">Resultado seguro</Typography><Typography variant="h3">Boleta {item.ticketNumber}</Typography><Typography color="text.secondary">Placa {item.plate}</Typography></Box><StatusChip status={item.status} size="medium" /></Box>{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}<Grid container spacing={2}><Grid size={{ xs: 12, lg: 7 }}><Paper variant="outlined" className="result-detail"><Typography variant="h6">Detalle público</Typography><Divider /><Box className="public-detail-grid"><Typography><span>Fecha y hora</span><strong>{date(item.occurredAt)}</strong></Typography><Typography><span>Ubicación</span><strong>{item.location}</strong></Typography><Typography><span>Monto original</span><strong>{money(item.balance.originalAmount)}</strong></Typography><Typography><span>Ajustes netos</span><strong>{money(item.balance.adjustmentTotal)}</strong></Typography><Typography><span>Pagos aplicados</span><strong>{money(item.balance.paymentTotal)}</strong></Typography><Typography><span>Saldo pendiente</span><strong>{money(item.balance.pendingBalance)}</strong></Typography></Box><Divider sx={{ my: 2 }} /><Typography variant="subtitle1" gutterBottom>Conceptos</Typography>{item.violations.map((violation) => <Box key={violation.code} sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.75 }}><Typography>{violation.code} · {violation.name}</Typography><Typography><strong>{money(violation.amount)}</strong></Typography></Box>)}</Paper></Grid><Grid size={{ xs: 12, lg: 5 }}><Paper variant="outlined" className="public-actions"><Typography variant="h6">Acción disponible</Typography>{item.status === "ANULADA" ? <Alert severity="success">La infracción figura anulada y no admite orden de pago.</Alert> : item.paymentOrderEligible ? <><Alert severity="info">La orden no realiza el pago ni funciona como recibo.</Alert><BusyButton fullWidth busy={busy} variant="contained" onClick={() => void createOrder()}>Generar orden de pago</BusyButton></> : <Alert severity="info">No existe saldo pendiente para emitir una orden.</Alert>}<Button component={Link} to="/consulta" fullWidth variant="outlined">Realizar otra consulta</Button></Paper></Grid></Grid></Container>;
}

export function PaymentOrderAccessPage() {
  const navigate = useNavigate();
  const [reference, setReference] = useState(() => typeof window === "undefined" ? "" : window.sessionStorage.getItem(ORDER_REFERENCE) ?? "");
  const [error, setError] = useState("");
  async function open() {
    setError("");
    try { await publicApi.getOrder(reference); window.sessionStorage.setItem(ORDER_REFERENCE, reference); navigate(`/orden-pago/${reference}`); }
    catch (reason) { setError(readableError(reason)); }
  }
  return <Container maxWidth="sm" className="public-page"><Box className="section-heading centered"><Typography className="overline">Documento público</Typography><Typography variant="h2">Abrir orden de pago</Typography><Typography color="text.secondary">Ingresa la referencia pública entregada al generar la orden.</Typography></Box><Paper variant="outlined" className="public-form-card"><Stack spacing={2}><TextField label="Referencia pública de la orden" value={reference} onChange={(event) => setReference(event.target.value.trim().toLowerCase())} autoComplete="off" />{error && <Alert severity="error">{error}</Alert>}<Button variant="contained" disabled={!/^[a-f0-9]{40}$/.test(reference)} onClick={() => void open()}>Abrir orden</Button><Button component={Link} to="/consulta">Generar desde una consulta</Button></Stack></Paper></Container>;
}

export function PaymentOrderPage() {
  const { reference = "" } = useParams();
  const [order, setOrder] = useState<PublicPaymentOrder | null>(null);
  const [intent, setIntent] = useState<OnlinePaymentIntent | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const result = await publicApi.getOrder(reference); setOrder(result.data); window.sessionStorage.setItem(ORDER_REFERENCE, result.data.reference); }
    catch (reason) { setError(readableError(reason)); }
    finally { setLoading(false); }
  }, [reference]);
  async function startOnlinePayment(paymentMethod: OnlinePaymentIntent["paymentMethod"]) {
    setBusy(true); setError("");
    try {
      const keyName = `pmt-online-intent-${reference}-${paymentMethod}`;
      let key = window.sessionStorage.getItem(keyName);
      if (!key) { key = crypto.randomUUID(); window.sessionStorage.setItem(keyName, key); }
      setIntent((await publicApi.createPaymentIntent(reference, paymentMethod, key)).data);
    } catch (reason) { setError(readableError(reason)); }
    finally { setBusy(false); }
  }
  async function loadIntent(value: string, silent = false) {
    try { setIntent((await publicApi.getPaymentIntent(value)).data); } catch (reason) { if (!silent) setError(readableError(reason)); }
  }
  useEffect(() => {
    if (!intent || intent.status !== "PENDING") return undefined;
    const timer = window.setInterval(() => { void loadIntent(intent.reference, true); }, 5_000);
    return () => window.clearInterval(timer);
  }, [intent]);
  useEffect(() => {
    if (intent?.status === "SUCCEEDED") void load();
  }, [intent?.status, load]);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <Container maxWidth="md" className="public-page"><LoadingState rows={6} /></Container>;
  if (!order) return <Container maxWidth="md" className="public-page"><ErrorState message={error} onRetry={() => void load()} /></Container>;
  // @ts-expect-error MUI Typography v6 does not expose the display shorthand in its type map.
  return <Container maxWidth="md" className="public-page"><Paper variant="outlined" className="document-card"><Box className="document-heading"><Box><Typography className="overline">Orden de pago</Typography><Typography variant="h3">{order.orderNumber}</Typography></Box><StatusChip status={order.status} /></Box>{order.paymentStatus === "CONFIRMED" ? <Alert severity="success"><strong>Pago confirmado.</strong> Recibo {order.receiptNumber ?? "emitido por receptoría o la pasarela autorizada"}. La multa ya puede reflejar saldo cero.</Alert> : <Alert severity={order.status === "ISSUED" ? "warning" : "error"}><strong>Esta orden no es recibo pagado ni constancia de pago.</strong> {order.status === "ISSUED" ? "Elige un pago seguro en línea o preséntala en receptoría antes del vencimiento." : "La orden ya no está vigente."}</Alert>}<Box className="document-summary"><Typography><span>Boleta</span><strong>{order.ticketNumber}</strong></Typography><Typography><span>Placa</span><strong>{order.plate}</strong></Typography><Typography><span>Emisión</span><strong>{date(order.issuedAt)}</strong></Typography><Typography><span>Vencimiento</span><strong>{date(order.expiresAt)}</strong></Typography></Box><Box className="concept-list"><Typography><span>Monto original</span><strong>{money(order.originalAmount)}</strong></Typography><Typography><span>Ajustes netos</span><strong>{money(order.adjustmentTotal)}</strong></Typography><Typography><span>Pagos aplicados</span><strong>{money(order.paymentTotal)}</strong></Typography><Divider /><Typography className="total"><span>Saldo indicado</span><strong>{money(order.pendingBalance)}</strong></Typography></Box>{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}{order.status === "ISSUED" && order.paymentStatus !== "CONFIRMED" && <Paper variant="outlined" sx={{ p: 2.5, mb: 2, bgcolor: "rgba(74, 99, 49, 0.04)" }}><Typography className="overline">Elige cómo pagar</Typography><Typography variant="h5" sx={{ mb: 1 }}>Pago seguro, sin compartir tu tarjeta con la municipalidad</Typography><Typography color="text.secondary" sx={{ mb: 2 }}>La tarjeta se captura únicamente en la página alojada del proveedor. También puedes generar un enlace Visa para enviarlo o abrirlo desde otro dispositivo.</Typography><Stack direction={{ xs: "column", sm: "row" }} spacing={1}><Button variant="contained" disabled={busy} onClick={() => void startOnlinePayment("CARD")}>Pagar con tarjeta</Button><Button variant="outlined" disabled={busy} onClick={() => void startOnlinePayment("VISA_LINK")}>Generar enlace Visa</Button></Stack>{intent && <Box sx={{ mt: 2 }}><Alert severity={intent.status === "SUCCEEDED" ? "success" : "info"}>{intent.status === "SUCCEEDED" ? `Pago confirmado. Recibo ${intent.receiptNumber ?? "disponible en receptoría"}.` : `Enlace ${intent.paymentMethod === "VISA_LINK" ? "Visa" : "de tarjeta"} creado por ${money(intent.amount)}. Estado: ${intent.status}.`}</Alert><Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1 }}><Button component="a" href={intent.checkoutUrl} target="_blank" rel="noopener noreferrer" variant="contained">Abrir enlace seguro</Button><Button variant="outlined" onClick={() => void loadIntent(intent.reference)}>Actualizar estado</Button></Stack><Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>{intent.notice}</Typography></Box>}</Paper>}<Typography color="text.secondary">{order.notice}</Typography><Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}><Button variant="contained" startIcon={<DownloadRoundedIcon />} onClick={() => void publicApi.openOrderDocument(order.reference)}>Abrir PDF</Button><Button variant="outlined" component={Link} to="/consulta/resultado">Volver al resultado</Button><Button variant="text" component={Link} to="/verificar-solvencia">Verificar solvencia</Button></Stack></Paper></Container>;
}

export function PaymentCheckoutPage() {
  const { reference = "" } = useParams();
  const [intent, setIntent] = useState<OnlinePaymentIntent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setError(""); try { setIntent((await publicApi.getPaymentIntent(reference)).data); } catch (reason) { setError(readableError(reason)); } }, [reference]);
  useEffect(() => { void load(); }, [load]);
  async function confirmQa() { setBusy(true); setError(""); try { await publicApi.testConfirmPaymentIntent(reference); await load(); } catch (reason) { setError(readableError(reason)); } finally { setBusy(false); } }
  if (!intent && !error) return <Container maxWidth="sm" className="public-page"><LoadingState rows={5} /></Container>;
  if (!intent) return <Container maxWidth="sm" className="public-page"><ErrorState message={error} onRetry={() => void load()} /></Container>;
  return <Container maxWidth="sm" className="public-page"><Paper variant="outlined" className="public-form-card"><Stack spacing={2}><Typography className="overline">Checkout seguro</Typography><Typography variant="h3">{intent.paymentMethod === "VISA_LINK" ? "Enlace Visa" : "Pago con tarjeta"}</Typography><Typography color="text.secondary">Orden {intent.orderNumber} · {money(intent.amount)}</Typography><Alert severity={intent.status === "SUCCEEDED" ? "success" : intent.status === "PENDING" ? "info" : "warning"}>{intent.status === "SUCCEEDED" ? `Pago confirmado. Recibo ${intent.receiptNumber ?? "emitido"}.` : intent.status === "PENDING" ? "Este checkout alojado no solicita datos a la municipalidad. Completa el pago con el proveedor autorizado." : `El intento terminó con estado ${intent.status}.`}</Alert>{intent.status === "PENDING" && intent.testMode ? <Button variant="contained" disabled={busy} onClick={() => void confirmQa()}>Completar pago de prueba QA</Button> : intent.status === "PENDING" ? <Button component="a" href={intent.checkoutUrl} target="_blank" rel="noopener noreferrer" variant="contained">Continuar con el proveedor</Button> : null}<Button component={Link} to={`/orden-pago/${intent.paymentOrderReference}`} variant="outlined">Volver a la orden</Button>{error && <Alert severity="error">{error}</Alert>}</Stack></Paper></Container>;
}

export function PublicPaymentsPage() {
  return <Container maxWidth="md" className="public-page"><Paper variant="outlined" className="public-form-card"><Stack spacing={2}><Typography className="overline">Pagos y recibos</Typography><Typography variant="h2">Paga de forma segura</Typography><Typography color="text.secondary">Consulta primero tu multa y genera una orden. Después puedes pagar con tarjeta mediante un checkout alojado, generar un enlace Visa o presentar la orden en receptoría.</Typography><Alert severity="info">La municipalidad nunca solicita números de tarjeta, CVV ni contraseñas en este portal. El proveedor de pagos recibe esos datos directamente y notifica el resultado de forma firmada.</Alert><Stack direction={{ xs: "column", sm: "row" }} spacing={1}><Button component={Link} to="/consulta" variant="contained">Consultar multa</Button><Button component={Link} to="/orden-pago" variant="outlined">Abrir orden existente</Button></Stack></Stack></Paper></Container>;
}

export function FutureModulePage({ title }: { title: string }) {
  return <Container maxWidth="md" className="public-page"><Paper variant="outlined" className="public-form-card"><Stack spacing={2} sx={{ alignItems: "flex-start" }}><Typography className="overline">Próxima fase</Typography><Typography variant="h2">{title}</Typography><Alert severity="info">Este servicio todavía no está implementado. No se muestran datos simulados ni se aceptan operaciones.</Alert><Button component={Link} to="/consulta" variant="contained">Ir a consulta de multas</Button></Stack></Paper></Container>;
}
