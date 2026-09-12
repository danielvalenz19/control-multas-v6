import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import type { AppContainer } from "../../../bootstrap/container.js";
import { authorize } from "../../../shared/http/authorize.js";
import { getRequestId } from "../../../shared/http/request-context.js";
import { recordOperation, isDuplicateKey } from "../../../shared/http/operations.js";
import { HttpError } from "../../../shared/http/HttpError.js";

const ruleCodes = z.enum(["APPEAL_DEADLINE_DAYS", "PAYMENT_ORDER_EXPIRY_DAYS", "ADJUSTMENT_DUAL_CONTROL_REQUIRED", "SOLVENCY_VALIDITY_DAYS"]);
const ruleInput = z.object({
  ruleCode: ruleCodes,
  valueType: z.enum(["INTEGER", "BOOLEAN"]),
  valueInteger: z.coerce.number().int().positive().optional(),
  valueBoolean: z.boolean().optional(),
  effectiveFrom: z.iso.datetime({ offset: true }),
  legalBasis: z.string().trim().max(500).nullable().optional(),
  authorizationReference: z.string().trim().min(3).max(200),
}).superRefine((value, context) => {
  const expectedType = value.ruleCode === "ADJUSTMENT_DUAL_CONTROL_REQUIRED" ? "BOOLEAN" : "INTEGER";
  if (value.valueType !== expectedType) context.addIssue({ code: "custom", path: ["valueType"], message: "El tipo no corresponde a la regla." });
  if (value.valueType === "INTEGER" && value.valueInteger === undefined) context.addIssue({ code: "custom", path: ["valueInteger"], message: "Debe indicar un número entero positivo." });
  if (value.valueType === "BOOLEAN" && value.valueBoolean === undefined) context.addIssue({ code: "custom", path: ["valueBoolean"], message: "Debe indicar el control institucional." });
});

export function createInstitutionalRuleRouter(container: AppContainer): Router {
  const router = Router();
  router.get("/", authorize("settings.read", container.auditRepository), async (request, response, next) => {
    try {
      const code = request.query["ruleCode"] ? ruleCodes.parse(request.query["ruleCode"]) : null;
      const rows = await container.database.query<RowDataPacket[]>(
        `SELECT r.id,r.rule_code,r.value_type,r.value_integer,r.value_boolean,r.effective_from,r.effective_to,r.legal_basis,r.authorization_reference,r.created_at,u.username created_by
         FROM institutional_rule_versions r JOIN users u ON u.id=r.created_by_user_id
         ${code ? "WHERE r.rule_code=?" : ""} ORDER BY r.rule_code,r.effective_from DESC`, code ? [code] : [],
      );
      response.json({ data: rows, meta: { requestId: getRequestId() } });
    } catch (error) { next(error); }
  });

  router.post("/", authorize("settings.manage", container.auditRepository), async (request, response, next) => {
    try {
      const input = ruleInput.parse(request.body);
      const effectiveFrom = new Date(input.effectiveFrom);
      const id = await container.database.withTransaction(async (connection) => {
        await connection.query(
          "UPDATE institutional_rule_versions SET effective_to=? WHERE rule_code=? AND effective_to IS NULL AND effective_from<?",
          [effectiveFrom, input.ruleCode, effectiveFrom],
        );
        const [result] = await connection.query<ResultSetHeader>(
          `INSERT INTO institutional_rule_versions (rule_code,value_type,value_integer,value_boolean,effective_from,legal_basis,authorization_reference,created_by_user_id)
           VALUES (?,?,?,?,?,?,?,?)`,
          [input.ruleCode, input.valueType, input.valueType === "INTEGER" ? input.valueInteger : null, input.valueType === "BOOLEAN" ? input.valueBoolean : null, effectiveFrom, input.legalBasis ?? null, input.authorizationReference, request.auth?.user.id],
        );
        return String(result.insertId);
      });
      await recordOperation(container, request, { action: "INSTITUTIONAL_RULE_VERSION_CREATED", module: "settings", entityType: "institutional_rule_version", entityId: id, newValues: { ruleCode: input.ruleCode, valueType: input.valueType, effectiveFrom: input.effectiveFrom, authorizationReference: input.authorizationReference } });
      response.status(201).json({ data: { id }, meta: { requestId: getRequestId() } });
    } catch (error) {
      if (isDuplicateKey(error)) return next(new HttpError({ code: "RULE_VERSION_DUPLICATE", message: "Ya existe una versión de la regla con esa vigencia.", statusCode: 409 }));
      next(error);
    }
  });
  return router;
}
