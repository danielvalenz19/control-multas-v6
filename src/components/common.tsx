"use client";

import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Skeleton, Stack, Typography } from "@mui/material";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import HourglassTopRoundedIcon from "@mui/icons-material/HourglassTopRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import type { FinancialStatus, LegalStatus, SolvencyStatus } from "@/src/types";

type StatusValue = LegalStatus | FinancialStatus | SolvencyStatus | string;

const statusLabels: Record<string, string> = {
  BORRADOR: "Borrador", PENDIENTE_SINCRONIZACION: "Pendiente de sincronización", PENDIENTE_VALIDACION: "Pendiente de validación", DEVUELTA_CORRECCION: "Devuelta para corrección", VALIDADA: "Validada", RECHAZADA: "Rechazada", ANULADA: "Anulada",
  SIN_ORDEN: "Sin orden", PENDIENTE_PAGO: "Pendiente de pago", PAGO_EN_VALIDACION: "Pago en validación", PAGADA_PARCIAL: "Pagada parcialmente", PAGADA: "Pagada", REVERSADA: "Reversada",
  NO_SOLICITADA: "No solicitada", PENDIENTE_REQUISITOS: "Requisitos pendientes", PENDIENTE_PAGO_EMISION: "Falta tarifa de emisión", LISTA_PARA_EMITIR: "Lista para emitir", EMITIDA: "Emitida",
  SINCRONIZADA: "Sincronizada", PENDIENTE: "Pendiente", ERROR: "Error", ACTIVO: "Activo", INACTIVO: "Inactivo", EXITOSO: "Exitoso", ALERTA: "Alerta", CONFIRMADO: "Confirmado", REVERSADO: "Reversado",
  REGISTRADO: "Registrado", EN_REVISION: "En revisión", APROBADO: "Aprobado", RECHAZADO: "Rechazado",
};

function statusTone(status: string) {
  if (["VALIDADA", "PAGADA", "EMITIDA", "SINCRONIZADA", "ACTIVO", "EXITOSO", "CONFIRMADO", "APROBADO"].includes(status)) return { color: "#315D43", bg: "#E9F3EC", icon: <CheckCircleRoundedIcon /> };
  if (["PENDIENTE_PAGO", "PAGO_EN_VALIDACION", "PAGADA_PARCIAL", "PENDIENTE_REQUISITOS", "PENDIENTE_PAGO_EMISION", "LISTA_PARA_EMITIR", "PENDIENTE"].includes(status)) return { color: "#8A5B12", bg: "#FFF2D7", icon: <HourglassTopRoundedIcon /> };
  if (["RECHAZADA", "RECHAZADO", "ANULADA", "REVERSADA", "REVERSADO", "ERROR", "INACTIVO"].includes(status)) return { color: "#99433B", bg: "#F9E8E5", icon: <ErrorOutlineRoundedIcon /> };
  return { color: "#38657B", bg: "#E8F1F5", icon: <InfoOutlinedIcon /> };
}

export function StatusChip({ status, size = "small" }: { status: StatusValue; size?: "small" | "medium" }) {
  const tone = statusTone(status);
  return <Chip size={size} icon={tone.icon} label={statusLabels[status] ?? status.replaceAll("_", " ")} sx={{ color: tone.color, bgcolor: tone.bg, "& .MuiChip-icon": { color: tone.color, fontSize: 16 } }} />;
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <Box className="page-header"><Box><Typography className="eyebrow-label">{eyebrow}</Typography><Typography variant="h4" component="h1">{title}</Typography><Typography color="text.secondary">{description}</Typography></Box>{action && <Box>{action}</Box>}</Box>;
}

export function StatCard({ label, value, helper, tone }: { label: string; value: string; helper: string; tone?: "primary" | "warning" | "success" }) {
  return <Paper variant="outlined" className={`stat-card ${tone ? `stat-${tone}` : ""}`}><Typography className="stat-label">{label}</Typography><Typography className="stat-value">{value}</Typography><Typography className="stat-helper">{helper}</Typography></Paper>;
}

export function LoadingState({ rows = 5 }: { rows?: number }) {
  return <Paper variant="outlined" sx={{ p: 2.5 }}><Stack spacing={1.5}>{Array.from({ length: rows }, (_, index) => <Skeleton key={index} height={42} variant="rounded" />)}</Stack></Paper>;
}

export function EmptyState({ title = "No hay resultados", description = "Prueba modificando los filtros utilizados." }: { title?: string; description?: string }) {
  return <Paper variant="outlined" className="feedback-state"><InfoOutlinedIcon /><Typography variant="h6">{title}</Typography><Typography color="text.secondary">{description}</Typography></Paper>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <Paper variant="outlined" className="feedback-state error"><ErrorOutlineRoundedIcon /><Typography variant="h6">No pudimos completar la operación</Typography><Typography color="text.secondary">{message}</Typography>{onRetry && <Button variant="outlined" onClick={onRetry}>Intentar nuevamente</Button>}</Paper>;
}

export function BusyButton({ busy, children, ...props }: { busy: boolean; children: React.ReactNode } & React.ComponentProps<typeof Button>) {
  return <Button {...props} disabled={busy || props.disabled}>{busy ? <><CircularProgress size={18} color="inherit" /> Procesando…</> : children}</Button>;
}

export function ConfirmDialog({ open, title, description, confirmLabel, danger = false, onCancel, onConfirm, children }: { open: boolean; title: string; description: string; confirmLabel: string; danger?: boolean; onCancel: () => void; onConfirm: () => void; children?: React.ReactNode }) {
  return <Dialog open={open} onClose={onCancel} fullWidth maxWidth="xs"><DialogTitle>{title}</DialogTitle><DialogContent><Stack spacing={2}><Typography color="text.secondary">{description}</Typography>{danger && <Alert severity="warning">Esta acción no elimina el registro y quedará guardada en auditoría.</Alert>}{children}</Stack></DialogContent><DialogActions><Button onClick={onCancel}>Cancelar</Button><Button variant="contained" color={danger ? "error" : "primary"} onClick={onConfirm}>{confirmLabel}</Button></DialogActions></Dialog>;
}

export function maskTicket(ticket: string) { return `${ticket.slice(0, 7)}***`; }
export function maskPlate(plate: string) { return plate.length > 3 ? `${plate.slice(0, 2)}***${plate.slice(-2)}` : "***"; }
export function money(value: number) { return new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(value); }
export function readableError(error: unknown) { return typeof error === "object" && error && "message" in error ? String(error.message) : "Ocurrió un error inesperado."; }
