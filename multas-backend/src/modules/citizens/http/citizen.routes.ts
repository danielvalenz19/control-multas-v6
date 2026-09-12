import { Router, type Request } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { z } from "zod";
import type { AppContainer } from "../../../bootstrap/container.js";
import { authenticate } from "../../../shared/http/authenticate.js";
import { authorize } from "../../../shared/http/authorize.js";
import { HttpError } from "../../../shared/http/HttpError.js";
import { getRequestId } from "../../../shared/http/request-context.js";

type CitizenRow = RowDataPacket & {
  id: string | number;
  identification_type: string;
  identification_number: string;
  identification_normalized: string;
  nit: string | null;
  first_names: string;
  last_names: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  status: "ACTIVE" | "INACTIVE";
  deactivated_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const citizenInput = z.object({
  identificationType: z.string().trim().min(1).max(30),
  identificationNumber: z.string().trim().min(2).max(100),
  nit: z.string().trim().max(30).nullable().optional(),
  firstNames: z.string().trim().min(1).max(150),
  lastNames: z.string().trim().min(1).max(150),
  address: z.string().trim().max(500).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.email().max(191).nullable().optional(),
});

const citizenUpdate = citizenInput.partial().refine((value) => Object.keys(value).length > 0, "Debe enviar al menos un campo.");
const listQuery = z.object({
  search: z.string().trim().max(150).default(""),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

function normalized(value: string): string {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function view(row: CitizenRow, sensitive: boolean) {
  return {
    id: String(row.id),
    identificationType: row.identification_type,
    identificationNumber: row.identification_number,
    firstNames: row.first_names,
    lastNames: row.last_names,
    status: row.status,
    deactivatedAt: row.deactivated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(sensitive ? { nit: row.nit, address: row.address, phone: row.phone, email: row.email } : {}),
  };
}

function isDuplicate(error: unknown): boolean {
  return typeof error === "object" && error !== null && "errno" in error && error.errno === 1062;
}

async function audit(container: AppContainer, request: Request, action: string, entityId: string): Promise<void> {
  await container.auditRepository.record({
    actorUserId: request.auth?.user.id ?? null,
    actorSessionId: request.auth?.id ?? null,
    action,
    module: "citizens",
    entityType: "citizen",
    entityId,
    outcome: "SUCCESS",
    requestId: getRequestId(),
    ipAddress: request.ip ?? null,
    userAgent: request.get("user-agent")?.slice(0, 500) ?? null,
  });
}

export function createCitizenRouter(container: AppContainer): Router {
  const router = Router();
  const requireSession = authenticate(container.authRepository, container.env);
  router.use(requireSession);

  router.get("/", authorize("citizens.read_restricted", container.auditRepository), async (request, response, next) => {
    try {
      const query = listQuery.parse(request.query);
      const clauses: string[] = [];
      const values: (string | number)[] = [];
      if (query.status) { clauses.push("status = ?"); values.push(query.status); }
      if (query.search) {
        clauses.push("(identification_normalized LIKE ? OR first_names LIKE ? OR last_names LIKE ? OR nit_normalized LIKE ?)");
        const like = `%${query.search}%`;
        values.push(`%${normalized(query.search)}%`, like, like, `%${normalized(query.search)}%`);
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const countRows = await container.database.query<(RowDataPacket & { total: number })[]>(
        `SELECT COUNT(*) AS total FROM citizens ${where}`,
        values,
      );
      const rows = await container.database.query<CitizenRow[]>(
        `SELECT * FROM citizens ${where} ORDER BY last_names, first_names, id LIMIT ? OFFSET ?`,
        [...values, query.pageSize, (query.page - 1) * query.pageSize],
      );
      const sensitive = request.auth?.user.permissions.includes("citizens.read_sensitive") ?? false;
      response.json({ data: rows.map((row) => view(row, sensitive)), meta: { page: query.page, pageSize: query.pageSize, total: countRows[0]?.total ?? 0, requestId: getRequestId() } });
    } catch (error) { next(error); }
  });

  router.get("/:id", authorize("citizens.read_restricted", container.auditRepository), async (request, response, next) => {
    try {
      const id = z.coerce.number().int().positive().parse(request.params["id"]);
      const rows = await container.database.query<CitizenRow[]>("SELECT * FROM citizens WHERE id = ?", [id]);
      if (!rows[0]) throw new HttpError({ code: "CITIZEN_NOT_FOUND", message: "Ciudadano no encontrado.", statusCode: 404 });
      response.json({ data: view(rows[0], request.auth?.user.permissions.includes("citizens.read_sensitive") ?? false), meta: { requestId: getRequestId() } });
    } catch (error) { next(error); }
  });

  router.post("/", authorize("citizens.create", container.auditRepository), async (request, response, next) => {
    try {
      const input = citizenInput.parse(request.body);
      const result = await container.database.query<ResultSetHeader>(
        `INSERT INTO citizens (identification_type, identification_number, identification_normalized, nit, nit_normalized, first_names, last_names, address, phone, email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [input.identificationType, input.identificationNumber, normalized(input.identificationNumber), input.nit ?? null, input.nit ? normalized(input.nit) : null, input.firstNames, input.lastNames, input.address ?? null, input.phone ?? null, input.email ?? null],
      );
      await audit(container, request, "CITIZEN_CREATED", String(result.insertId));
      response.status(201).json({ data: { id: String(result.insertId) }, meta: { requestId: getRequestId() } });
    } catch (error) {
      if (isDuplicate(error)) return next(new HttpError({ code: "CITIZEN_DUPLICATE", message: "La identificación del ciudadano ya existe.", statusCode: 409 }));
      next(error);
    }
  });

  router.patch("/:id", authorize("citizens.update", container.auditRepository), async (request, response, next) => {
    try {
      const id = z.coerce.number().int().positive().parse(request.params["id"]);
      const input = citizenUpdate.parse(request.body);
      const columns: string[] = [];
      const values: (string | null | number)[] = [];
      const add = (column: string, value: string | null | number) => { columns.push(`${column} = ?`); values.push(value); };
      if (input.identificationType !== undefined) add("identification_type", input.identificationType);
      if (input.identificationNumber !== undefined) { add("identification_number", input.identificationNumber); add("identification_normalized", normalized(input.identificationNumber)); }
      if (input.nit !== undefined) { add("nit", input.nit); add("nit_normalized", input.nit ? normalized(input.nit) : null); }
      if (input.firstNames !== undefined) add("first_names", input.firstNames);
      if (input.lastNames !== undefined) add("last_names", input.lastNames);
      if (input.address !== undefined) add("address", input.address);
      if (input.phone !== undefined) add("phone", input.phone);
      if (input.email !== undefined) add("email", input.email);
      const result = await container.database.query<ResultSetHeader>(`UPDATE citizens SET ${columns.join(", ")} WHERE id = ?`, [...values, id]);
      if (!result.affectedRows) throw new HttpError({ code: "CITIZEN_NOT_FOUND", message: "Ciudadano no encontrado.", statusCode: 404 });
      await audit(container, request, "CITIZEN_UPDATED", String(id));
      response.sendStatus(204);
    } catch (error) {
      if (isDuplicate(error)) return next(new HttpError({ code: "CITIZEN_DUPLICATE", message: "La identificación del ciudadano ya existe.", statusCode: 409 }));
      next(error);
    }
  });

  for (const [path, status, action] of [["deactivate", "INACTIVE", "CITIZEN_DEACTIVATED"], ["activate", "ACTIVE", "CITIZEN_ACTIVATED"]] as const) {
    router.post(`/:id/${path}`, authorize("citizens.deactivate", container.auditRepository), async (request, response, next) => {
      try {
        const id = z.coerce.number().int().positive().parse(request.params["id"]);
        const result = await container.database.query<ResultSetHeader>("UPDATE citizens SET status = ?, deactivated_at = IF(? = 'INACTIVE', CURRENT_TIMESTAMP(3), NULL) WHERE id = ?", [status, status, id]);
        if (!result.affectedRows) throw new HttpError({ code: "CITIZEN_NOT_FOUND", message: "Ciudadano no encontrado.", statusCode: 404 });
        await audit(container, request, action, String(id));
        response.sendStatus(204);
      } catch (error) { next(error); }
    });
  }
  return router;
}
