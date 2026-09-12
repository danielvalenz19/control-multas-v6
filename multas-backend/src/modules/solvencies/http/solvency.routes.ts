import { Router } from "express";
import { z } from "zod";
import type { AppContainer } from "../../../bootstrap/container.js";
import { authenticate } from "../../../shared/http/authenticate.js";
import { authorize } from "../../../shared/http/authorize.js";
import { createBasicPaymentOrderPdf } from "../../../shared/http/basic-pdf.js";
import { getRequestId } from "../../../shared/http/request-context.js";
import { recordOperation } from "../../../shared/http/operations.js";
import { SolvencyService } from "../application/SolvencyService.js";

const id = z.coerce.number().int().positive();
const publicReference = z.string().regex(/^[a-f0-9]{40}$/);
const reason = z.object({ reason: z.string().trim().min(5).max(1000) });

export function createSolvencyRouter(container: AppContainer): Router {
  const router = Router(); const service = new SolvencyService(container.database);
  router.use(authenticate(container.authRepository, container.env));
  router.get("/options", authorize("solvencies.request", container.auditRepository), async (_request, response, next) => { try { response.json({ data: await service.options(), meta: { requestId: getRequestId() } }); } catch (error) { next(error); } });
  router.post("/requests", authorize("solvencies.request", container.auditRepository), async (request, response, next) => { try { const data = await service.createRequest(id.parse((request.body as { vehicleId?: unknown } | undefined)?.vehicleId), actor(request)); await recordOperation(container, request, { action: "SOLVENCY_REQUEST_CREATED", module: "solvencies", entityType: "solvency_request", entityId: String(data.id) }); response.status(201).json({ data, meta: { requestId: getRequestId() } }); } catch (error) { next(error); } });
  router.get("/requests", authorize("solvencies.read", container.auditRepository), async (request, response, next) => { try { const status = z.enum(["PENDING_REVIEW", "APPROVED", "REJECTED"]).optional().parse(request.query["status"]); response.json({ data: await service.listRequests({ status }), meta: { requestId: getRequestId() } }); } catch (error) { next(error); } });
  router.get("/requests/:id", authorize("solvencies.read", container.auditRepository), async (request, response, next) => { try { response.json({ data: await service.getRequest(id.parse(request.params["id"])), meta: { requestId: getRequestId() } }); } catch (error) { next(error); } });
  router.post("/requests/:id/approve", authorize("solvencies.review", container.auditRepository), async (request, response, next) => { try { const requestId = id.parse(request.params["id"]); const data = await service.approveRequest(requestId, actor(request)); await recordOperation(container, request, { action: "SOLVENCY_ISSUED", module: "solvencies", entityType: "solvency", entityId: data.id }); await container.notifications.emit({eventCode:"SOLVENCY_STATUS",recipientUserIds:[request.auth?.user.id??""],deduplicationKey:`solvency-issued:${data.id}`,resourceType:"solvency",resourceId:data.id,securePath:`/admin/solvencias/${data.id}`}); response.status(201).json({ data, meta: { requestId: getRequestId() } }); } catch (error) { next(error); } });
  router.post("/requests/:id/reject", authorize("solvencies.review", container.auditRepository), async (request, response, next) => { try { const requestId = id.parse(request.params["id"]); const input = reason.parse(request.body); const data = await service.rejectRequest(requestId, input.reason, actor(request)); await recordOperation(container, request, { action: "SOLVENCY_REQUEST_REJECTED", module: "solvencies", entityType: "solvency_request", entityId: String(requestId), reason: input.reason }); response.json({ data, meta: { requestId: getRequestId() } }); } catch (error) { next(error); } });
  router.get("/:id", authorize("solvencies.read", container.auditRepository), async (request, response, next) => { try { response.json({ data: await service.getSolvency(id.parse(request.params["id"])), meta: { requestId: getRequestId() } }); } catch (error) { next(error); } });
  router.get("/:id/document", authorize("solvencies.read", container.auditRepository), async (request, response, next) => { try { const data = await service.getSolvency(id.parse(request.params["id"])); const vehicle = data.vehicleSnapshot as { plate?: string; registration?: string; description?: string }; const financial = data.financialSnapshot as { balance?: string; currency?: string }; const pdf = createBasicPaymentOrderPdf(["MUNICIPALIDAD - SISTEMA PMT", "SOLVENCIA MUNICIPAL", `Número: ${data.solvencyNumber}`, `Placa: ${vehicle.plate ?? ""}`, `Tarjeta: ${vehicle.registration ?? ""}`, `Vehículo: ${vehicle.description ?? ""}`, `Saldo al emitir: ${financial.currency ?? "GTQ"} ${financial.balance ?? "0.00"}`, `Emisión: ${new Date(data.issuedAt).toISOString()}`, `Vencimiento: ${new Date(data.expiresAt).toISOString()}`, `Código de verificación: ${data.publicReference}`, `Estado: ${data.status}`]); await recordOperation(container, request, { action: "SOLVENCY_DOCUMENT_DOWNLOADED", module: "solvencies", entityType: "solvency", entityId: data.id }); response.setHeader("Content-Type", "application/pdf"); response.setHeader("Content-Disposition", `inline; filename="solvencia-${data.solvencyNumber}.pdf"`); response.setHeader("Cache-Control", "private, no-store"); response.send(pdf); } catch (error) { next(error); } });
  router.post("/:id/revoke", authorize("solvencies.revoke", container.auditRepository), async (request, response, next) => { try { const solvencyId = id.parse(request.params["id"]); const input = reason.parse(request.body); const data = await service.revokeSolvency(solvencyId, input.reason, actor(request)); await recordOperation(container, request, { action: "SOLVENCY_REVOKED", module: "solvencies", entityType: "solvency", entityId: data.id, reason: input.reason }); await container.notifications.emit({eventCode:"SOLVENCY_STATUS",recipientUserIds:[request.auth?.user.id??""],deduplicationKey:`solvency-revoked:${data.id}`,resourceType:"solvency",resourceId:data.id,securePath:`/admin/solvencias/${data.id}`}); response.json({ data, meta: { requestId: getRequestId() } }); } catch (error) { next(error); } });
  return router;
}

export function createPublicSolvencyRouter(container: AppContainer): Router {
  const router = Router(); const service = new SolvencyService(container.database);
  router.get("/:publicReference/verify", async (request, response, next) => { try { const data = await service.verify(publicReference.parse(request.params.publicReference)); await recordOperation(container, request, { action: "PUBLIC_SOLVENCY_VERIFIED", module: "public_portal", entityType: "solvency", entityId: data.publicReference }); response.json({ data, meta: { requestId: getRequestId() } }); } catch (error) { next(error); } });
  return router;
}

function actor(request: Parameters<typeof recordOperation>[1]) { return { userId: Number(request.auth?.user.id), requestId: getRequestId() }; }
