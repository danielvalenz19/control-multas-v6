import type { AuditEvent, Infraction, Payment, SolvencyRequest } from "@/src/types";

const baseInfractions: Infraction[] = [
  {
    id: "inf-1284", ticket: "2026-001284", caseNumber: "EXP-2026-001284", occurredAt: "2026-07-14T09:42:00-06:00", plate: "P123ABC", vehicle: "Toyota Corolla · gris", citizen: "Carlos Méndez", citizenId: "**** **** 2145", type: "Estacionar en lugar prohibido", legalBasis: "Artículo demostrativo 183", agent: "Luis Hernández", amount: 500, paidAmount: 0, solvencyFeePaid: false, legalStatus: "PENDIENTE_VALIDACION", financialStatus: "SIN_ORDEN", solvencyStatus: "NO_SOLICITADA", zone: "Zona 1", address: "6a avenida, frente al parque central", syncStatus: "SINCRONIZADA", possibleDuplicate: true, observations: "Posible coincidencia de placa. Verificar evidencia antes de validar.", evidence: [{ id: "ev-1", type: "PHOTO", label: "Vista frontal del vehículo", capturedAt: "14 jul · 09:42" }, { id: "ev-2", type: "PHOTO", label: "Señalización del lugar", capturedAt: "14 jul · 09:43" }],
  },
  {
    id: "inf-1279", ticket: "2026-001279", caseNumber: "EXP-2026-001279", occurredAt: "2026-07-14T08:18:00-06:00", plate: "C456DPR", vehicle: "Honda Civic · blanco", citizen: "Andrea Gómez", citizenId: "**** **** 8741", type: "No portar licencia", legalBasis: "Artículo demostrativo 196", agent: "María López", amount: 350, paidAmount: 0, solvencyFeePaid: false, legalStatus: "VALIDADA", financialStatus: "PENDIENTE_PAGO", solvencyStatus: "NO_SOLICITADA", zone: "Ruta CA-2", address: "Kilómetro 144", syncStatus: "SINCRONIZADA", possibleDuplicate: false, observations: "Datos y evidencia validados por PMT.", evidence: [{ id: "ev-3", type: "PHOTO", label: "Boleta digital", capturedAt: "14 jul · 08:18" }],
  },
  {
    id: "inf-1271", ticket: "2026-001271", caseNumber: "EXP-2026-001271", occurredAt: "2026-07-13T15:22:00-06:00", plate: "M902HJK", vehicle: "Suzuki GN · negro", citizen: "Mario Díaz", citizenId: "**** **** 5512", type: "Exceso de velocidad", legalBasis: "Artículo demostrativo 191", agent: "Carlos Pérez", amount: 600, paidAmount: 600, solvencyFeePaid: true, legalStatus: "VALIDADA", financialStatus: "PAGADA", solvencyStatus: "LISTA_PARA_EMITIR", zone: "Zona 2", address: "Calzada principal", syncStatus: "SINCRONIZADA", possibleDuplicate: false, observations: "Requisitos completos para emisión.", evidence: [{ id: "ev-4", type: "PHOTO", label: "Evidencia de radar", capturedAt: "13 jul · 15:22" }],
  },
  {
    id: "inf-1258", ticket: "2026-001258", caseNumber: "EXP-2026-001258", occurredAt: "2026-07-12T11:08:00-06:00", plate: "C112BNS", vehicle: "Mazda 3 · rojo", citizen: "Roberto León", citizenId: "**** **** 1029", type: "Obstruir la vía pública", legalBasis: "Artículo demostrativo 186", agent: "Ana Morales", amount: 800, paidAmount: 400, solvencyFeePaid: false, legalStatus: "VALIDADA", financialStatus: "PAGADA_PARCIAL", solvencyStatus: "PENDIENTE_REQUISITOS", zone: "Mercado municipal", address: "Ingreso norte del mercado", syncStatus: "SINCRONIZADA", possibleDuplicate: false, observations: "Pago parcial registrado. La solvencia permanece bloqueada.", evidence: [{ id: "ev-5", type: "PHOTO", label: "Ubicación del vehículo", capturedAt: "12 jul · 11:08" }],
  },
  {
    id: "inf-1252", ticket: "2026-001252", caseNumber: "EXP-2026-001252", occurredAt: "2026-07-11T16:35:00-06:00", plate: "P822FDR", vehicle: "Kia Rio · azul", citizen: "Elena Castro", citizenId: "**** **** 4420", type: "Giro no permitido", legalBasis: "Artículo demostrativo 188", agent: "Luis Hernández", amount: 500, paidAmount: 500, solvencyFeePaid: false, legalStatus: "VALIDADA", financialStatus: "PAGADA", solvencyStatus: "PENDIENTE_PAGO_EMISION", zone: "Zona 1", address: "1a calle y 3a avenida", syncStatus: "SINCRONIZADA", possibleDuplicate: false, observations: "Multa pagada; falta tarifa de solvencia.", evidence: [{ id: "ev-6", type: "PHOTO", label: "Intersección", capturedAt: "11 jul · 16:35" }],
  },
  {
    id: "inf-1243", ticket: "2026-001243", caseNumber: "EXP-2026-001243", occurredAt: "2026-07-10T10:12:00-06:00", plate: "C622GRT", vehicle: "Hyundai Accent · plata", citizen: "Pedro Juárez", citizenId: "**** **** 0082", type: "Circular en área restringida", legalBasis: "Artículo demostrativo 177", agent: "María López", amount: 300, paidAmount: 300, solvencyFeePaid: true, legalStatus: "VALIDADA", financialStatus: "PAGADA", solvencyStatus: "EMITIDA", zone: "Zona 1", address: "Área peatonal central", syncStatus: "SINCRONIZADA", possibleDuplicate: false, observations: "Solvencia emitida correctamente.", evidence: [{ id: "ev-7", type: "PHOTO", label: "Acceso restringido", capturedAt: "10 jul · 10:12" }],
  },
  {
    id: "inf-1236", ticket: "2026-001236", caseNumber: "EXP-2026-001236", occurredAt: "2026-07-09T14:45:00-06:00", plate: "M105FKL", vehicle: "Yamaha FZ · negro", citizen: "Sofía Ruiz", citizenId: "**** **** 9930", type: "No portar tarjeta de circulación", legalBasis: "Artículo demostrativo 184", agent: "José Ramírez", amount: 200, paidAmount: 200, solvencyFeePaid: true, legalStatus: "VALIDADA", financialStatus: "PAGADA", solvencyStatus: "ANULADA", zone: "Zona 2", address: "Salida hacia Santo Domingo", syncStatus: "SINCRONIZADA", possibleDuplicate: false, observations: "Solvencia anulada por corrección documental.", evidence: [{ id: "ev-8", type: "PHOTO", label: "Boleta digital", capturedAt: "09 jul · 14:45" }],
  },
];

const extraTypes = ["Estacionar en lugar prohibido", "Conducir sin licencia", "Obstruir la vía pública", "Exceso de velocidad", "No portar tarjeta de circulación"];
const extraAgents = ["Luis Hernández", "María López", "Carlos Pérez", "Ana Morales", "José Ramírez"];
const legalCycle: Infraction["legalStatus"][] = ["PENDIENTE_VALIDACION", "VALIDADA", "DEVUELTA_CORRECCION", "VALIDADA"];

export const infractions: Infraction[] = [
  ...baseInfractions,
  ...Array.from({ length: 20 }, (_, index): Infraction => {
    const number = 1235 - index;
    const legalStatus = legalCycle[index % legalCycle.length];
    const validated = legalStatus === "VALIDADA";
    const amount = 200 + (index % 5) * 100;
    return {
      id: `inf-${number}`,
      ticket: `2026-00${number}`,
      caseNumber: `EXP-2026-00${number}`,
      occurredAt: `2026-07-${String(9 - (index % 7)).padStart(2, "0")}T${String(8 + (index % 8)).padStart(2, "0")}:20:00-06:00`,
      plate: `${index % 2 ? "P" : "C"}${String(310 + index * 23)}${["ABC", "KLM", "RTS", "GNP"][index % 4]}`,
      vehicle: ["Toyota Yaris · gris", "Honda Fit · blanco", "Kia Picanto · azul"][index % 3],
      citizen: ["Persona demostración A", "Persona demostración B", "Persona demostración C"][index % 3],
      citizenId: "**** **** 0000",
      type: extraTypes[index % extraTypes.length],
      legalBasis: `Artículo demostrativo ${170 + index}`,
      agent: extraAgents[index % extraAgents.length],
      amount,
      paidAmount: validated && index % 3 === 0 ? amount : 0,
      solvencyFeePaid: false,
      legalStatus,
      financialStatus: validated ? (index % 3 === 0 ? "PAGADA" : "PENDIENTE_PAGO") : "SIN_ORDEN",
      solvencyStatus: "NO_SOLICITADA",
      zone: ["Zona 1", "Zona 2", "Ruta CA-2", "Mercado municipal"][index % 4],
      address: "Ubicación de demostración",
      syncStatus: index % 8 === 0 ? "PENDIENTE" : "SINCRONIZADA",
      possibleDuplicate: index % 9 === 0,
      observations: "Registro de demostración sin validez legal.",
      evidence: [{ id: `ev-extra-${index}`, type: "PHOTO", label: "Evidencia demostrativa", capturedAt: "Registro histórico" }],
    };
  }),
];

export const payments: Payment[] = Array.from({ length: 15 }, (_, index) => ({
  id: `pay-${index + 1}`,
  receiptNumber: `REC-2026-${String(4821 - index).padStart(5, "0")}`,
  infractionId: infractions[(index + 2) % infractions.length].id,
  concept: index % 5 === 0 ? "SOLVENCIA" : "MULTA",
  amount: index % 5 === 0 ? 50 : 200 + (index % 5) * 100,
  cashDesk: `Caja 0${(index % 3) + 1}`,
  method: index % 3 === 0 ? "Tarjeta" : "Efectivo",
  createdAt: `2026-07-${String(14 - (index % 5)).padStart(2, "0")}T10:24:00-06:00`,
  createdBy: "José Castillo",
  status: index === 7 ? "REVERSADO" : "CONFIRMADO",
}));

export const solvencyRequests: SolvencyRequest[] = [
  { id: "SOL-REQ-00821", infractionId: "inf-1271", requestedAt: "2026-07-14T10:34:00-06:00", responsible: "Ana Morales", status: "LISTA_PARA_EMITIR" },
  { id: "SOL-REQ-00820", infractionId: "inf-1252", requestedAt: "2026-07-14T09:16:00-06:00", responsible: "Sin asignar", status: "PENDIENTE_PAGO_EMISION" },
  { id: "SOL-REQ-00819", infractionId: "inf-1258", requestedAt: "2026-07-13T15:10:00-06:00", responsible: "Sin asignar", status: "PENDIENTE_REQUISITOS" },
  { id: "SOL-REQ-00818", infractionId: "inf-1243", requestedAt: "2026-07-12T11:48:00-06:00", responsible: "Ana Morales", status: "EMITIDA", solvencyNumber: "SOL-2026-00418", verificationCode: "PMT-VALIDA-418", issuedAt: "2026-07-12T12:05:00-06:00" },
  { id: "SOL-REQ-00817", infractionId: "inf-1236", requestedAt: "2026-07-11T08:40:00-06:00", responsible: "Ana Morales", status: "ANULADA", solvencyNumber: "SOL-2026-00417", verificationCode: "PMT-ANULADA-417", issuedAt: "2026-07-11T09:02:00-06:00" },
  { id: "SOL-REQ-00816", infractionId: "inf-1234", requestedAt: "2026-07-10T16:20:00-06:00", responsible: "Ana Morales", status: "PENDIENTE_REQUISITOS" },
  { id: "SOL-REQ-00815", infractionId: "inf-1233", requestedAt: "2026-07-10T13:15:00-06:00", responsible: "Sin asignar", status: "PENDIENTE_PAGO_EMISION" },
  { id: "SOL-REQ-00814", infractionId: "inf-1232", requestedAt: "2026-07-09T14:22:00-06:00", responsible: "Ana Morales", status: "LISTA_PARA_EMITIR" },
];

export const auditEvents: AuditEvent[] = [
  { id: "aud-1", date: "2026-07-14T10:42:18-06:00", user: "Daniel Valenzuela", role: "Administrador", action: "PAYMENT_CREATE", module: "Pagos", record: "REC-2026-04821", result: "EXITOSO", ip: "172.16.0.24", device: "Chrome · Municipalidad", newValue: "Pago confirmado" },
  { id: "aud-2", date: "2026-07-14T10:38:04-06:00", user: "Laura Méndez", role: "Operador PMT", action: "INFRACTION_VALIDATE", module: "Infracciones", record: "2026-001279", result: "EXITOSO", ip: "172.16.0.18", device: "Chrome · PMT", previousValue: "PENDIENTE_VALIDACION", newValue: "VALIDADA" },
  { id: "aud-3", date: "2026-07-14T10:31:52-06:00", user: "José Castillo", role: "Receptoría", action: "PAYMENT_REVERSE_REQUEST", module: "Pagos", record: "REC-2026-04817", result: "ALERTA", ip: "172.16.0.31", device: "Edge · Caja 01", reason: "Recibo digitado incorrectamente" },
  { id: "aud-4", date: "2026-07-14T10:14:46-06:00", user: "Sistema", role: "Sistema", action: "LOGIN_FAILED", module: "Autenticación", record: "identificador oculto", result: "ALERTA", ip: "190.148.2.41", device: "Dispositivo no reconocido" },
];

export const catalogData = {
  infractions: extraTypes.map((name, index) => ({ id: `INF-${String(index + 1).padStart(3, "0")}`, name, reference: `Base demostrativa ${170 + index}`, value: 200 + index * 100, active: true })),
  fees: [{ id: "TAR-001", name: "Emisión de solvencia", reference: "Vigente desde 01/01/2026", value: 50, active: true }, { id: "TAR-002", name: "Reimpresión", reference: "Vigente desde 01/01/2026", value: 15, active: true }],
  zones: ["Zona 1", "Zona 2", "Ruta CA-2", "Mercado municipal"].map((name, index) => ({ id: `ZON-${index + 1}`, name, reference: "San Antonio Suchitepéquez", value: 0, active: true })),
};
