import { auditEvents as auditSeed, infractions as infractionSeed, payments as paymentSeed, solvencyRequests as solvencySeed } from "@/src/mocks/seed";
import type { ApiError, AuditEvent, Infraction, Payment, SolvencyRequest, User } from "@/src/types";

const STORAGE_KEY = "pmt-demo-state-v3";
const LATENCY = 380;
export const operationalMocksEnabled = import.meta.env.MODE === "test" || import.meta.env.VITE_USE_MOCKS === "true";

interface PersistedState {
  infractions: Infraction[];
  payments: Payment[];
  solvencies: SolvencyRequest[];
  audit: AuditEvent[];
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const wait = (ms = LATENCY) => new Promise((resolve) => setTimeout(resolve, ms));

function initialState(): PersistedState {
  if (!operationalMocksEnabled) return { infractions: [], payments: [], solvencies: [], audit: [] };
  return { infractions: clone(infractionSeed), payments: clone(paymentSeed), solvencies: clone(solvencySeed), audit: clone(auditSeed) };
}

function readState(): PersistedState {
  if (!operationalMocksEnabled) return initialState();
  if (typeof window === "undefined") return initialState();
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return initialState();
  try { return JSON.parse(stored) as PersistedState; } catch { return initialState(); }
}

function writeState(state: PersistedState) {
  if (operationalMocksEnabled && typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function fail(code: string, message: string, field?: string): never {
  throw { code, message, field } satisfies ApiError;
}

function addAudit(state: PersistedState, event: Omit<AuditEvent, "id" | "date" | "ip" | "device">) {
  state.audit.unshift({ ...event, id: `aud-${Date.now()}`, date: new Date().toISOString(), ip: "172.16.0.24", device: "Navegador web · Demo" });
}

export const dataService = {
  async snapshot() { await wait(); return clone(readState()); },
  async publicLookup(ticket: string, plate: string): Promise<Infraction> {
    await wait(650);
    const normalizedTicket = ticket.trim().toUpperCase();
    const normalizedPlate = plate.replace(/\s+/g, "").toUpperCase();
    const item = readState().infractions.find((row) => row.ticket === normalizedTicket && row.plate === normalizedPlate && !["BORRADOR", "PENDIENTE_SINCRONIZACION", "PENDIENTE_VALIDACION"].includes(row.legalStatus));
    if (!item) fail("LOOKUP_NOT_FOUND", "No encontramos una multa con esa combinación. Verifica ambos datos.");
    return clone(item);
  },
  async verifySolvency(code: string): Promise<SolvencyRequest> {
    await wait(550);
    const item = readState().solvencies.find((row) => row.verificationCode?.toUpperCase() === code.trim().toUpperCase());
    if (!item) fail("SOLVENCY_NOT_FOUND", "El código no corresponde a una solvencia registrada.");
    return clone(item);
  },
  async validateInfraction(id: string, user: User): Promise<void> {
    await wait(); const state = readState(); const item = state.infractions.find((row) => row.id === id); if (!item) fail("NOT_FOUND", "La infracción no existe.");
    const previous = item.legalStatus; item.legalStatus = "VALIDADA"; item.financialStatus = "PENDIENTE_PAGO";
    addAudit(state, { user: user.name, role: user.roleLabel, action: "INFRACTION_VALIDATE", module: "Infracciones", record: item.ticket, result: "EXITOSO", previousValue: previous, newValue: "VALIDADA" }); writeState(state);
  },
  async returnInfraction(id: string, reason: string, user: User): Promise<void> {
    await wait(); if (!reason.trim()) fail("REASON_REQUIRED", "Debes indicar el motivo de devolución.", "reason"); const state = readState(); const item = state.infractions.find((row) => row.id === id); if (!item) fail("NOT_FOUND", "La infracción no existe.");
    const previous = item.legalStatus; item.legalStatus = "DEVUELTA_CORRECCION"; item.observations = reason;
    addAudit(state, { user: user.name, role: user.roleLabel, action: "INFRACTION_RETURN", module: "Infracciones", record: item.ticket, result: "EXITOSO", previousValue: previous, newValue: "DEVUELTA_CORRECCION", reason }); writeState(state);
  },
  async registerPayment(input: { infractionId: string; receiptNumber: string; concept: "MULTA" | "SOLVENCIA"; amount: number; cashDesk: string; method: string }, user: User): Promise<void> {
    await wait(620); const state = readState(); const infraction = state.infractions.find((row) => row.id === input.infractionId); if (!infraction) fail("NOT_FOUND", "La infracción no existe.");
    if (infraction.legalStatus !== "VALIDADA") fail("NOT_VALIDATED", "La infracción debe estar validada antes de registrar pagos.");
    if (!input.receiptNumber.trim()) fail("RECEIPT_REQUIRED", "El número de recibo es obligatorio.", "receiptNumber");
    if (state.payments.some((row) => row.receiptNumber.toUpperCase() === input.receiptNumber.trim().toUpperCase())) fail("DUPLICATE_RECEIPT", "Ese número de recibo ya fue utilizado.", "receiptNumber");
    if (input.amount <= 0) fail("INVALID_AMOUNT", "El monto debe ser mayor que cero.", "amount");
    const outstanding = input.concept === "MULTA" ? infraction.amount - infraction.paidAmount : 50;
    if (input.amount > outstanding) fail("AMOUNT_EXCEEDS_BALANCE", "El monto supera el saldo pendiente.", "amount");
    const payment: Payment = { id: `pay-${Date.now()}`, receiptNumber: input.receiptNumber.trim().toUpperCase(), infractionId: input.infractionId, concept: input.concept, amount: input.amount, cashDesk: input.cashDesk, method: input.method, createdAt: new Date().toISOString(), createdBy: user.name, status: "CONFIRMADO" };
    state.payments.unshift(payment);
    if (input.concept === "MULTA") { infraction.paidAmount += input.amount; infraction.financialStatus = infraction.paidAmount >= infraction.amount ? "PAGADA" : "PAGADA_PARCIAL"; if (infraction.financialStatus === "PAGADA") infraction.solvencyStatus = infraction.solvencyFeePaid ? "LISTA_PARA_EMITIR" : "PENDIENTE_PAGO_EMISION"; }
    else { infraction.solvencyFeePaid = true; infraction.solvencyStatus = infraction.financialStatus === "PAGADA" ? "LISTA_PARA_EMITIR" : "PENDIENTE_REQUISITOS"; }
    const request = state.solvencies.find((row) => row.infractionId === infraction.id); if (request) request.status = infraction.solvencyStatus;
    addAudit(state, { user: user.name, role: user.roleLabel, action: "PAYMENT_CREATE", module: "Pagos", record: payment.receiptNumber, result: "EXITOSO", newValue: `${input.concept} Q${input.amount.toFixed(2)}` }); writeState(state);
  },
  async reversePayment(paymentId: string, reason: string, user: User): Promise<void> {
    await wait(620); if (!reason.trim()) fail("REASON_REQUIRED", "Debes indicar el motivo del reverso.", "reason"); const state = readState(); const payment = state.payments.find((row) => row.id === paymentId); if (!payment) fail("NOT_FOUND", "El pago no existe."); if (payment.status === "REVERSADO") fail("ALREADY_REVERSED", "Este pago ya fue reversado."); const infraction = state.infractions.find((row) => row.id === payment.infractionId); if (!infraction) fail("NOT_FOUND", "La infracción relacionada no existe.");
    payment.status = "REVERSADO";
    if (payment.concept === "MULTA") { infraction.paidAmount = Math.max(0, infraction.paidAmount - payment.amount); infraction.financialStatus = infraction.paidAmount === 0 ? "PENDIENTE_PAGO" : "PAGADA_PARCIAL"; }
    else { infraction.solvencyFeePaid = false; }
    infraction.solvencyStatus = infraction.financialStatus === "PAGADA" ? "PENDIENTE_PAGO_EMISION" : "PENDIENTE_REQUISITOS";
    const request = state.solvencies.find((row) => row.infractionId === infraction.id); if (request && request.status !== "ANULADA") request.status = infraction.solvencyStatus;
    addAudit(state, { user: user.name, role: user.roleLabel, action: "PAYMENT_REVERSE", module: "Pagos", record: payment.receiptNumber, result: "ALERTA", previousValue: "CONFIRMADO", newValue: "REVERSADO", reason }); writeState(state);
  },
  async issueSolvency(requestId: string, user: User): Promise<SolvencyRequest> {
    await wait(680); const state = readState(); const request = state.solvencies.find((row) => row.id === requestId); if (!request) fail("NOT_FOUND", "La solicitud no existe."); const infraction = state.infractions.find((row) => row.id === request.infractionId); if (!infraction) fail("NOT_FOUND", "La infracción no existe.");
    if (infraction.legalStatus !== "VALIDADA" || infraction.financialStatus !== "PAGADA" || !infraction.solvencyFeePaid) fail("REQUIREMENTS_PENDING", "No se puede emitir: existen requisitos pendientes.");
    const suffix = String(Date.now()).slice(-5); request.status = "EMITIDA"; request.solvencyNumber = `SOL-2026-${suffix}`; request.verificationCode = `PMT-VALIDA-${suffix}`; request.issuedAt = new Date().toISOString(); request.responsible = user.name; infraction.solvencyStatus = "EMITIDA";
    addAudit(state, { user: user.name, role: user.roleLabel, action: "SOLVENCY_ISSUE", module: "Solvencias", record: request.solvencyNumber, result: "EXITOSO", newValue: request.verificationCode }); writeState(state); return clone(request);
  },
  async cancelSolvency(requestId: string, reason: string, user: User): Promise<void> {
    await wait(620); if (!reason.trim()) fail("REASON_REQUIRED", "Debes indicar el motivo de anulación.", "reason"); const state = readState(); const request = state.solvencies.find((row) => row.id === requestId); if (!request) fail("NOT_FOUND", "La solicitud no existe."); const infraction = state.infractions.find((row) => row.id === request.infractionId); const previous = request.status; request.status = "ANULADA"; if (infraction) infraction.solvencyStatus = "ANULADA";
    addAudit(state, { user: user.name, role: user.roleLabel, action: "SOLVENCY_CANCEL", module: "Solvencias", record: request.solvencyNumber ?? request.id, result: "ALERTA", previousValue: previous, newValue: "ANULADA", reason }); writeState(state);
  },
  resetDemo() { if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY); },
};
