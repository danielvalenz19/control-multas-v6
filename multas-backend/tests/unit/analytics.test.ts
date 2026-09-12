import type { QueryResult } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { analyticsFilterSchema } from "../../src/modules/analytics/application/AnalyticsFilters.js";
import { csvCell } from "../../src/modules/analytics/application/ReportService.js";
import { NotificationService } from "../../src/modules/notifications/application/NotificationService.js";
import type { MySqlDatabase } from "../../src/shared/infrastructure/mysql/MySqlConnection.js";

describe("analítica y notificaciones", () => {
  it("limita los reportes a 366 días", () => {
    expect(() => analyticsFilterSchema.parse({ from: "2025-01-01", to: "2026-01-02" })).toThrow(expect.objectContaining({ code: "ANALYTICS_DATE_RANGE_INVALID" }));
    expect(analyticsFilterSchema.parse({ from: "2026-01-01", to: "2026-12-31" })).toMatchObject({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("rechaza fechas de calendario inexistentes", () => {
    expect(() => analyticsFilterSchema.parse({ from: "2026-02-30", to: "2026-03-01" })).toThrow();
  });

  it("escapa CSV UTF-8 sin permitir que una celda rompa columnas", () => {
    expect(csvCell('Boleta, "especial"')).toBe('"Boleta, ""especial"""');
    expect(csvCell(null)).toBe('""');
  });

  it("deduplica reintentos de un evento importante", async () => {
    const keys = new Set<string>();
    const database = { query<T extends QueryResult>(sql: string, values: readonly unknown[] = []) {
      if (sql.includes("FROM notification_templates")) return Promise.resolve([{ id: 1, event_code: "PAYMENT_CONFIRMED", title_template: "Pago", body_template: "Confirmado" }] as unknown as T);
      const key = String(values[9]); const inserted = keys.has(key) ? 0 : 1; keys.add(key); return Promise.resolve({ affectedRows: inserted } as T);
    }, withTransaction<T>(): Promise<T> { return Promise.reject(new Error("No utilizada")); } } as MySqlDatabase;
    const service = new NotificationService(database);
    const event = { eventCode: "PAYMENT_CONFIRMED", recipientUserIds: [7], deduplicationKey: "payment-confirmed:42" };
    await expect(service.emit(event)).resolves.toBe(1);
    await expect(service.emit(event)).resolves.toBe(0);
    expect(keys.size).toBe(1);
  });
});
