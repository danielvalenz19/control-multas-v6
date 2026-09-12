// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { dataService } from "../src/services/mockApi";
import type { User } from "../src/types";

const admin: User = { id: "test-admin", name: "Test Admin", email: "test@example.invalid", role: "ADMIN", roleLabel: "Administrador", dependency: "Pruebas", enabled: true, lastAccess: "Ahora" };

describe("flujos municipales simulados", () => {
  beforeEach(() => {
    window.localStorage.clear();
    dataService.resetDemo();
  });

  it("exige la combinación correcta de boleta y placa en la consulta pública", async () => {
    await expect(dataService.publicLookup("2026-001279", "C456DPR")).resolves.toMatchObject({ id: "inf-1279" });
    await expect(dataService.publicLookup("2026-001279", "P000XXX")).rejects.toMatchObject({ code: "LOOKUP_NOT_FOUND" });
  });

  it("valida y devuelve boletas conservando su estado", async () => {
    await dataService.validateInfraction("inf-1284", admin);
    expect((await dataService.snapshot()).infractions.find((row) => row.id === "inf-1284")?.legalStatus).toBe("VALIDADA");
    await dataService.returnInfraction("inf-1284", "Corregir evidencia", admin);
    expect((await dataService.snapshot()).infractions.find((row) => row.id === "inf-1284")?.legalStatus).toBe("DEVUELTA_CORRECCION");
  });

  it("registra pagos y evita reutilizar recibos", async () => {
    await expect(dataService.registerPayment({ infractionId: "inf-1279", receiptNumber: "REC-2026-04821", concept: "MULTA", amount: 100, cashDesk: "Caja 01", method: "Efectivo" }, admin)).rejects.toMatchObject({ code: "DUPLICATE_RECEIPT" });
    await dataService.registerPayment({ infractionId: "inf-1279", receiptNumber: "REC-TEST-00001", concept: "MULTA", amount: 100, cashDesk: "Caja 01", method: "Efectivo" }, admin);
    const state = await dataService.snapshot();
    expect(state.payments[0]).toMatchObject({ receiptNumber: "REC-TEST-00001", status: "CONFIRMADO" });
    expect(state.infractions.find((row) => row.id === "inf-1279")?.financialStatus).toBe("PAGADA_PARCIAL");
  });

  it("requiere motivo para reversar y conserva el pago reversado", async () => {
    await expect(dataService.reversePayment("pay-1", "", admin)).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await dataService.reversePayment("pay-1", "Recibo digitado incorrectamente", admin);
    expect((await dataService.snapshot()).payments.find((row) => row.id === "pay-1")?.status).toBe("REVERSADO");
  });

  it("bloquea solvencias incompletas y emite cuando se cumplen requisitos", async () => {
    await expect(dataService.issueSolvency("SOL-REQ-00820", admin)).rejects.toMatchObject({ code: "REQUIREMENTS_PENDING" });
    await expect(dataService.issueSolvency("SOL-REQ-00821", admin)).resolves.toMatchObject({ status: "EMITIDA" });
  });

  it("distingue una solvencia válida de una anulada", async () => {
    await expect(dataService.verifySolvency("PMT-VALIDA-418")).resolves.toMatchObject({ status: "EMITIDA" });
    await expect(dataService.verifySolvency("PMT-ANULADA-417")).resolves.toMatchObject({ status: "ANULADA" });
  });
});
