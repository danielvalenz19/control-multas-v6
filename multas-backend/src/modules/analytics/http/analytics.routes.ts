import { Router } from "express";
import { z } from "zod";
import type { AppContainer } from "../../../bootstrap/container.js";
import { authenticate } from "../../../shared/http/authenticate.js";
import { authorize } from "../../../shared/http/authorize.js";
import { createBasicPaymentOrderPdf } from "../../../shared/http/basic-pdf.js";
import { getRequestId } from "../../../shared/http/request-context.js";
import { recordOperation } from "../../../shared/http/operations.js";
import { HttpError } from "../../../shared/http/HttpError.js";
import { AnalyticsService } from "../application/AnalyticsService.js";
import { analyticsFilterSchema } from "../application/AnalyticsFilters.js";
import { csvCell, ReportService, reportTypes } from "../application/ReportService.js";

const reportQuery = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25), status: z.string().trim().max(40).optional(), search: z.string().trim().max(100).optional() });

export function createAnalyticsRouter(container: AppContainer): Router {
  const router = Router();
  const analytics = new AnalyticsService(container.database);
  const reports = new ReportService(container.database);
  router.use(authenticate(container.authRepository, container.env));

  router.get("/dashboard", authorize("dashboard.read", container.auditRepository), async (request, response, next) => {
    try { response.json({ data: await analytics.dashboard(analyticsFilterSchema.parse(request.query)), meta: { requestId: getRequestId() } }); } catch (error) { next(error); }
  });

  router.get("/reports/dashboard-summary.pdf", authorize("reports.export", container.auditRepository), async (request, response, next) => {
    try {
      const filter = analyticsFilterSchema.parse(request.query); const data = await analytics.dashboard(filter);
      const lines = ["MUNICIPALIDAD - SISTEMA PMT", "RESUMEN ADMINISTRATIVO", `Rango: ${filter.from} / ${filter.to}`, `Generado: ${new Date().toISOString()}`, `Usuario: ${request.auth?.user.username ?? ""}`, "", ...data.kpis.infractions.map((row) => `Infracciones ${valueAt(row,"label")}: ${valueAt(row,"count")} | GTQ ${valueAt(row,"amount")}`), `Recaudación neta: GTQ ${valueAt(data.kpis.payments,"amount")}`, `Reversos: GTQ ${valueAt(data.kpis.reversals,"amount")}`];
      await recordOperation(container, request, { action: "REPORT_EXPORTED_PDF", module: "reports", entityType: "report", entityId: "dashboard-summary" });
      response.setHeader("Content-Type", "application/pdf"); response.setHeader("Content-Disposition", `attachment; filename="resumen-${filter.from}-${filter.to}.pdf"`); response.setHeader("Cache-Control", "private, no-store"); response.send(createBasicPaymentOrderPdf(lines));
    } catch (error) { next(error); }
  });

  router.get("/reports/:type", authorize("reports.read", container.auditRepository), async (request, response, next) => {
    try {
      const type = z.enum(reportTypes).parse(request.params["type"]); const page = reportQuery.parse(request.query); const filter = analyticsFilterSchema.parse(request.query);
      requireAuditPermission(request.auth?.user.permissions ?? [], type, "audit.read");
      const result = await reports.list(type, filter, page.page, page.pageSize, page.status, page.search);
      response.json({ data: result.rows, meta: { page: page.page, pageSize: page.pageSize, total: result.total, columns: result.columns, filter: { from: filter.from, to: filter.to, departmentId: filter.departmentId ?? null }, requestId: getRequestId() } });
    } catch (error) { next(error); }
  });

  router.get("/reports/:type/export.csv", authorize("reports.export", container.auditRepository), async (request, response, next) => {
    try {
      const type = z.enum(reportTypes).parse(request.params["type"]); const page = reportQuery.parse(request.query); const filter = analyticsFilterSchema.parse(request.query);
      requireAuditPermission(request.auth?.user.permissions ?? [], type, "audit.export");
      await recordOperation(container, request, { action: "REPORT_EXPORTED_CSV", module: "reports", entityType: "report", entityId: type, newValues: { from: filter.from, to: filter.to, departmentId: filter.departmentId ?? null } });
      response.setHeader("Content-Type", "text/csv; charset=utf-8"); response.setHeader("Content-Disposition", `attachment; filename="${type}-${filter.from}-${filter.to}.csv"`); response.setHeader("Cache-Control", "private, no-store");
      response.write("\uFEFF"); response.write(`${csvCell("Reporte")},${csvCell(type)}\r\n${csvCell("Generado")},${csvCell(new Date())}\r\n${csvCell("Usuario")},${csvCell(request.auth?.user.username)}\r\n${csvCell("Rango")},${csvCell(`${filter.from} / ${filter.to}`)}\r\n\r\n`);
      let exported = 0; let current = 1; const batchSize = 500; const maximum = 10_000; let headersWritten = false;
      while (exported < maximum) {
        const result = await reports.list(type, filter, current, batchSize, page.status, page.search);
        if (!headersWritten) { response.write(`${result.columns.map(csvCell).join(",")}\r\n`); headersWritten = true; }
        for (const row of result.rows) { response.write(`${result.columns.map((column) => csvCell(row[column])).join(",")}\r\n`); exported += 1; if (exported >= maximum) break; }
        if (result.rows.length < batchSize) break; current += 1;
      }
      response.end();
    } catch (error) { next(error); }
  });

  return router;
}

function valueAt(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return value === null || value === undefined ? "" : typeof value === "string" || typeof value === "number" || typeof value === "bigint" ? `${value}` : "";
}

function requireAuditPermission(permissions: readonly string[], type: string, permission: string): void {
  if (type === "audit" && !permissions.includes(permission)) throw new HttpError({ code: "AUTH_FORBIDDEN", message: "No tiene permiso para consultar auditoría.", statusCode: 403 });
}
