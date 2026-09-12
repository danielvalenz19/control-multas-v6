import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import type { AppContainer } from "../../../bootstrap/container.js";
import { authenticate } from "../../../shared/http/authenticate.js";
import { authorize } from "../../../shared/http/authorize.js";
import { HttpError } from "../../../shared/http/HttpError.js";
import { getRequestId } from "../../../shared/http/request-context.js";
import { recordOperation } from "../../../shared/http/operations.js";

const list = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), status: z.enum(["all","read","unread"]).default("all") });
const id = z.coerce.number().int().positive();
const preferences = z.object({ preferences: z.array(z.object({ eventCode: z.string().trim().min(2).max(80), internalEnabled: z.boolean() })).max(100) });
const templateUpdate = z.object({ titleTemplate: z.string().trim().min(2).max(180).optional(), bodyTemplate: z.string().trim().min(2).max(1000).optional(), isActive: z.boolean().optional() }).refine((value) => Object.keys(value).length > 0);

export function createNotificationRouter(container: AppContainer): Router {
  const router = Router();
  router.use(authenticate(container.authRepository, container.env));
  router.get("/", authorize("notifications.read", container.auditRepository), async (request, response, next) => {
    try {
      const query = list.parse(request.query); const userId = request.auth?.user.id; const predicate = query.status === "read" ? "AND read_at IS NOT NULL" : query.status === "unread" ? "AND read_at IS NULL" : "";
      const counts = await container.database.query<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) total FROM notifications WHERE recipient_user_id=? ${predicate}`, [userId]);
      const rows = await container.database.query<RowDataPacket[]>(`SELECT id,event_code,title,body,severity,resource_type,resource_id,secure_path,read_at,created_at FROM notifications WHERE recipient_user_id=? ${predicate} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [userId, query.pageSize, (query.page - 1) * query.pageSize]);
      response.json({ data: rows, meta: { page: query.page, pageSize: query.pageSize, total: counts[0]?.total ?? 0, requestId: getRequestId() } });
    } catch (error) { next(error); }
  });
  router.get("/unread-count", authorize("notifications.read", container.auditRepository), async (request, response, next) => {
    try { const rows = await container.database.query<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) total FROM notifications WHERE recipient_user_id=? AND read_at IS NULL", [request.auth?.user.id]); response.json({ data: { count: rows[0]?.total ?? 0 }, meta: { requestId: getRequestId() } }); } catch (error) { next(error); }
  });
  router.patch("/:id/read", authorize("notifications.read", container.auditRepository), async (request, response, next) => {
    try { const notificationId = id.parse(request.params["id"]); const result = await container.database.query<ResultSetHeader>("UPDATE notifications SET read_at=COALESCE(read_at,UTC_TIMESTAMP(3)) WHERE id=? AND recipient_user_id=?", [notificationId, request.auth?.user.id]); if (!result.affectedRows) throw new HttpError({ code: "NOTIFICATION_NOT_FOUND", message: "Notificación no encontrada.", statusCode: 404 }); await recordOperation(container, request, { action: "NOTIFICATION_READ", module: "notifications", entityType: "notification", entityId: String(notificationId) }); response.sendStatus(204); } catch (error) { next(error); }
  });
  router.post("/read-all", authorize("notifications.read", container.auditRepository), async (request, response, next) => {
    try { const result = await container.database.query<ResultSetHeader>("UPDATE notifications SET read_at=UTC_TIMESTAMP(3) WHERE recipient_user_id=? AND read_at IS NULL", [request.auth?.user.id]); await recordOperation(container, request, { action: "NOTIFICATIONS_READ_ALL", module: "notifications", entityType: "notification", entityId: null, newValues: { count: result.affectedRows } }); response.json({ data: { updated: result.affectedRows }, meta: { requestId: getRequestId() } }); } catch (error) { next(error); }
  });
  router.get("/preferences", authorize("notifications.preferences", container.auditRepository), async (request, response, next) => {
    try { const rows = await container.database.query<RowDataPacket[]>(`SELECT nt.code event_code,nt.subject_template title_template,COALESCE(unp.internal_enabled,1) internal_enabled,COALESCE(unp.email_enabled,0) email_enabled,COALESCE(unp.sms_enabled,0) sms_enabled,COALESCE(unp.push_enabled,0) push_enabled FROM notification_templates nt LEFT JOIN user_notification_preferences unp ON unp.event_code=nt.code AND unp.user_id=? WHERE nt.channel='IN_APP' AND nt.is_active=1 ORDER BY nt.code`, [request.auth?.user.id]); response.json({ data: rows, meta: { externalChannelsEnabled: false, requestId: getRequestId() } }); } catch (error) { next(error); }
  });
  router.put("/preferences", authorize("notifications.preferences", container.auditRepository), async (request, response, next) => {
    try { const input = preferences.parse(request.body); for (const item of input.preferences) { const templates=await container.database.query<RowDataPacket[]>("SELECT id FROM notification_templates WHERE code=? AND channel='IN_APP'",[item.eventCode]); if(!templates[0]) throw new HttpError({code:"NOTIFICATION_TEMPLATE_NOT_FOUND",message:"La preferencia solicitada no existe.",statusCode:422}); await container.database.query("INSERT INTO user_notification_preferences (user_id,event_code,internal_enabled,email_enabled,sms_enabled,push_enabled) VALUES (?,?,?,0,0,0) ON DUPLICATE KEY UPDATE internal_enabled=VALUES(internal_enabled),email_enabled=0,sms_enabled=0,push_enabled=0", [request.auth?.user.id, item.eventCode, item.internalEnabled ? 1 : 0]); } await recordOperation(container, request, { action: "NOTIFICATION_PREFERENCES_UPDATED", module: "notifications", entityType: "user", entityId: request.auth?.user.id ?? null }); response.sendStatus(204); } catch (error) { next(error); }
  });
  router.get("/templates", authorize("notifications.templates", container.auditRepository), async (_request, response, next) => {
    try { response.json({ data: await container.database.query<RowDataPacket[]>("SELECT id,code event_code,subject_template title_template,body_template,is_active,updated_at FROM notification_templates WHERE channel='IN_APP' ORDER BY code"), meta: { requestId: getRequestId() } }); } catch (error) { next(error); }
  });
  router.patch("/templates/:eventCode", authorize("notifications.templates", container.auditRepository), async (request, response, next) => {
    try { const eventCode = z.string().regex(/^[A-Z0-9_]{2,50}$/).parse(request.params["eventCode"]); const input = templateUpdate.parse(request.body); const fields: string[]=[]; const values: unknown[]=[]; const map={titleTemplate:"subject_template",bodyTemplate:"body_template",isActive:"is_active"} as const; for(const [key,column] of Object.entries(map) as [keyof typeof map,string][]) if(input[key]!==undefined){fields.push(`${column}=?`); const value=input[key]; values.push(typeof value==="boolean"?(value?1:0):value);} const result=await container.database.query<ResultSetHeader>(`UPDATE notification_templates SET ${fields.join(",")} WHERE code=? AND channel='IN_APP'`,[...values,eventCode]); if(!result.affectedRows) throw new HttpError({code:"NOTIFICATION_TEMPLATE_NOT_FOUND",message:"Plantilla no encontrada.",statusCode:404}); await recordOperation(container,request,{action:"NOTIFICATION_TEMPLATE_UPDATED",module:"notifications",entityType:"notification_template",entityId:eventCode}); response.sendStatus(204); } catch(error){next(error);}
  });
  return router;
}
