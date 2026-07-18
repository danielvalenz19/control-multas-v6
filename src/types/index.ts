export type RoleName = "ADMIN" | "SUPERVISOR" | "PMT" | "RECEPTORIA" | "SOLVENCIAS";

export type LegalStatus =
  | "BORRADOR"
  | "PENDIENTE_SINCRONIZACION"
  | "PENDIENTE_VALIDACION"
  | "DEVUELTA_CORRECCION"
  | "VALIDADA"
  | "RECHAZADA"
  | "ANULADA";

export type FinancialStatus =
  | "SIN_ORDEN"
  | "PENDIENTE_PAGO"
  | "PAGO_EN_VALIDACION"
  | "PAGADA_PARCIAL"
  | "PAGADA"
  | "REVERSADA";

export type SolvencyStatus =
  | "NO_SOLICITADA"
  | "PENDIENTE_REQUISITOS"
  | "PENDIENTE_PAGO_EMISION"
  | "LISTA_PARA_EMITIR"
  | "EMITIDA"
  | "ANULADA";

export interface User {
  id: string;
  name: string;
  email: string;
  role: RoleName;
  roleLabel: string;
  dependency: string;
  enabled: boolean;
  lastAccess: string;
}

export interface Evidence {
  id: string;
  type: "PHOTO" | "DOCUMENT";
  label: string;
  capturedAt: string;
}

export interface Infraction {
  id: string;
  ticket: string;
  caseNumber: string;
  occurredAt: string;
  plate: string;
  vehicle: string;
  citizen: string;
  citizenId: string;
  type: string;
  legalBasis: string;
  agent: string;
  amount: number;
  paidAmount: number;
  solvencyFeePaid: boolean;
  legalStatus: LegalStatus;
  financialStatus: FinancialStatus;
  solvencyStatus: SolvencyStatus;
  zone: string;
  address: string;
  syncStatus: "SINCRONIZADA" | "PENDIENTE" | "ERROR";
  possibleDuplicate: boolean;
  assignedTo?: string;
  observations: string;
  evidence: Evidence[];
}

export interface Payment {
  id: string;
  receiptNumber: string;
  infractionId: string;
  concept: "MULTA" | "SOLVENCIA";
  amount: number;
  cashDesk: string;
  method: string;
  createdAt: string;
  createdBy: string;
  status: "CONFIRMADO" | "REVERSADO";
}

export interface SolvencyRequest {
  id: string;
  infractionId: string;
  requestedAt: string;
  responsible: string;
  status: SolvencyStatus;
  solvencyNumber?: string;
  verificationCode?: string;
  issuedAt?: string;
}

export interface AuditEvent {
  id: string;
  date: string;
  user: string;
  role: string;
  action: string;
  module: string;
  record: string;
  result: "EXITOSO" | "ALERTA" | "ERROR";
  ip: string;
  device: string;
  previousValue?: string;
  newValue?: string;
  reason?: string;
}

export interface LookupResult {
  infraction: Infraction;
}

export interface ApiError {
  code: string;
  message: string;
  field?: string;
}
