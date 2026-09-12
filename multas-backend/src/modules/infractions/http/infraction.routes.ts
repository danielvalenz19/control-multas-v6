import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import express, { Router, type Request } from "express";
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { z } from "zod";
import type { AppContainer } from "../../../bootstrap/container.js";
import { authenticate } from "../../../shared/http/authenticate.js";
import { authorize } from "../../../shared/http/authorize.js";
import { HttpError } from "../../../shared/http/HttpError.js";
import {
  isDuplicateKey,
  recordOperation,
} from "../../../shared/http/operations.js";
import { getRequestId } from "../../../shared/http/request-context.js";

const statuses = [
  "BORRADOR",
  "PENDIENTE_VALIDACION",
  "DEVUELTA_CORRECCION",
  "VALIDADA",
  "RECHAZADA",
  "ANULADA",
] as const;
const statusSchema = z.enum(statuses);
const locationSchema = z.object({
  frequentLocationId: z.coerce.number().int().positive().nullable().optional(),
  placeName: z.string().trim().min(2).max(250),
  address: z.string().trim().min(3).max(500),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
});
const draftSchema = z.object({
  siteId: z.coerce.number().int().positive(),
  agentId: z.coerce.number().int().positive(),
  deviceId: z.coerce.number().int().positive(),
  citizenId: z.coerce.number().int().positive().nullable().optional(),
  vehicleId: z.coerce.number().int().positive(),
  occurredAt: z.iso.datetime({ offset: true }),
  driverAbsent: z.boolean().default(false),
  driverRefusedSignature: z.boolean().default(false),
  observations: z.string().trim().max(4000).nullable().optional(),
  items: z
    .array(z.object({ infractionTypeId: z.coerce.number().int().positive() }))
    .min(1)
    .max(25),
  location: locationSchema,
});
const updateSchema = draftSchema
  .omit({ siteId: true, agentId: true, deviceId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0);
const listSchema = z.object({
  search: z.string().trim().max(100).default(""),
  status: statusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const reviewSchema = z.object({
  reasonId: z.coerce.number().int().positive(),
  comment: z.string().trim().min(3).max(1000),
  indicatedFields: z
    .array(z.string().trim().min(1).max(100))
    .max(50)
    .default([]),
});
type Draft = z.infer<typeof draftSchema>;
type Review = z.infer<typeof reviewSchema>;
type InfractionRow = RowDataPacket & {
  id: number;
  status: (typeof statuses)[number];
  agent_id: number;
  created_by_user_id: number;
  agent_user_id: number;
  occurred_at: Date;
};
type RateRow = RowDataPacket & {
  infraction_type_id: number;
  rate_version_id: number;
  code: string;
  name: string;
  legal_basis: string;
  amount: string;
  requires_evidence: number;
};

function actorId(request: Request) {
  const id = request.auth?.user.id;
  if (!id)
    throw new HttpError({
      code: "AUTH_REQUIRED",
      message: "Se requiere una sesión válida.",
      statusCode: 401,
    });
  return Number(id);
}
function privileged(request: Request) {
  return (
    request.auth?.user.roles.some((role) =>
      ["ADMIN", "PMT_OPERATOR", "SUPERVISOR"].includes(role),
    ) ?? false
  );
}
function keyFrom(request: Request) {
  const key = request.get("idempotency-key")?.trim();
  if (!key || key.length > 191)
    throw new HttpError({
      code: "IDEMPOTENCY_KEY_REQUIRED",
      message: "Se requiere Idempotency-Key.",
      statusCode: 422,
    });
  return key;
}
function hashOf(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hasExpectedFileSignature(mime: string, content: Buffer): boolean {
  if (mime === "image/png") {
    return content.length >= 8 && content.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }
  if (mime === "image/jpeg") {
    return content.length >= 3
      && content[0] === 0xff
      && content[1] === 0xd8
      && content[2] === 0xff;
  }
  if (mime === "application/pdf") {
    return content.length >= 5 && content.subarray(0, 5).toString("ascii") === "%PDF-";
  }
  return false;
}
async function nextNumber(
  connection: PoolConnection,
  siteId: number,
  type: "INFRACTION" | "CASE_FILE",
  year: number,
) {
  const [rows] = await connection.query<
    (RowDataPacket & {
      id: number;
      prefix: string;
      next_number: number;
      padding_length: number;
    })[]
  >(
    "SELECT id,prefix,next_number,padding_length FROM document_sequences WHERE site_id=? AND document_type=? AND sequence_year=? FOR UPDATE",
    [siteId, type, year],
  );
  const row = rows[0];
  if (!row)
    throw new HttpError({
      code: "DOCUMENT_SEQUENCE_MISSING",
      message: `Falta el correlativo ${type} para la sede y año.`,
      statusCode: 409,
    });
  await connection.query(
    "UPDATE document_sequences SET next_number=next_number+1 WHERE id=?",
    [row.id],
  );
  return `${row.prefix}${String(row.next_number).padStart(row.padding_length, "0")}`;
}
async function findOne(connection: PoolConnection, id: number, lock = false) {
  const [rows] = await connection.query<InfractionRow[]>(
    `SELECT i.*,a.user_id agent_user_id FROM infractions i JOIN agents a ON a.id=i.agent_id WHERE i.id=?${lock ? " FOR UPDATE" : ""}`,
    [id],
  );
  if (!rows[0])
    throw new HttpError({
      code: "INFRACTION_NOT_FOUND",
      message: "Infracción no encontrada.",
      statusCode: 404,
    });
  return rows[0];
}
function visible(row: InfractionRow, request: Request) {
  if (!privileged(request) && row.agent_user_id !== actorId(request))
    throw new HttpError({
      code: "AUTH_FORBIDDEN",
      message: "No tiene acceso a esta boleta.",
      statusCode: 403,
    });
}
async function loadParties(connection: PoolConnection, input: Draft) {
  const [agents] = await connection.query<
    (RowDataPacket & {
      agent_user_id: number;
      badge_number: string;
      first_name: string;
      last_name: string;
      agent_status: string;
      device_status: string;
      assigned_user_id: number | null;
    })[]
  >(
    `SELECT a.user_id agent_user_id,a.badge_number,u.first_name,u.last_name,a.status agent_status,d.status device_status,da.user_id assigned_user_id FROM agents a JOIN users u ON u.id=a.user_id JOIN devices d ON d.id=? LEFT JOIN device_assignments da ON da.device_id=d.id AND da.released_at IS NULL WHERE a.id=? FOR UPDATE`,
    [input.deviceId, input.agentId],
  );
  const agent = agents[0];
  if (!agent)
    throw new HttpError({
      code: "AGENT_OR_DEVICE_NOT_FOUND",
      message: "Agente o dispositivo no encontrado.",
      statusCode: 404,
    });
  if (agent.agent_status !== "ACTIVE")
    throw new HttpError({
      code: "AGENT_INACTIVE",
      message: "Un agente inactivo no puede emitir boletas.",
      statusCode: 409,
    });
  if (
    agent.device_status !== "ACTIVE" ||
    agent.assigned_user_id !== agent.agent_user_id
  )
    throw new HttpError({
      code: "DEVICE_NOT_ASSIGNED",
      message: "El dispositivo debe estar activo y asignado al agente.",
      statusCode: 409,
    });
  const [vehicles] = await connection.query<
    (RowDataPacket & {
      plate_original: string;
      registration_card: string;
      vehicle_type: string;
      brand: string;
      vehicle_line: string;
      color: string;
    })[]
  >(
    "SELECT plate_original,registration_card,vehicle_type,brand,vehicle_line,color FROM vehicles WHERE id=? AND status='ACTIVE'",
    [input.vehicleId],
  );
  if (!vehicles[0])
    throw new HttpError({
      code: "VEHICLE_NOT_FOUND",
      message: "Vehículo activo no encontrado.",
      statusCode: 404,
    });
  let citizen: RowDataPacket | null = null;
  if (input.citizenId) {
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT identification_type,identification_number,first_names,last_names,nit,address FROM citizens WHERE id=? AND status='ACTIVE'",
      [input.citizenId],
    );
    citizen = rows[0] ?? null;
    if (!citizen)
      throw new HttpError({
        code: "CITIZEN_NOT_FOUND",
        message: "Ciudadano activo no encontrado.",
        statusCode: 404,
      });
  }
  return { agent, vehicle: vehicles[0], citizen };
}
async function loadRates(
  connection: PoolConnection,
  ids: number[],
  occurredAt: string,
) {
  if (new Set(ids).size !== ids.length)
    throw new HttpError({
      code: "INFRACTION_ITEM_DUPLICATE",
      message: "No se puede repetir un artículo.",
      statusCode: 409,
    });
  const rates: RateRow[] = [];
  for (const id of ids) {
    const [rows] = await connection.query<RateRow[]>(
      `SELECT it.id infraction_type_id,rv.id rate_version_id,it.code,it.name,it.legal_basis,rv.amount,it.requires_evidence FROM infraction_types it JOIN infraction_rate_versions rv ON rv.infraction_type_id=it.id WHERE it.id=? AND it.is_active=1 AND rv.effective_from<=DATE(?) AND (rv.effective_to IS NULL OR rv.effective_to>=DATE(?)) ORDER BY rv.effective_from DESC,rv.id DESC LIMIT 1`,
      [id, occurredAt, occurredAt],
    );
    if (!rows[0])
      throw new HttpError({
        code: "RATE_NOT_EFFECTIVE",
        message: "No existe tarifa vigente para un artículo.",
        statusCode: 409,
      });
    rates.push(rows[0]);
  }
  return rates;
}
async function replaceItems(
  connection: PoolConnection,
  id: number,
  rates: RateRow[],
) {
  await connection.query("DELETE FROM infraction_items WHERE infraction_id=?", [
    id,
  ]);
  let total = 0;
  for (const rate of rates) {
    await connection.query(
      "INSERT INTO infraction_items (infraction_id,infraction_type_id,rate_version_id,type_code_snapshot,type_name_snapshot,legal_basis_snapshot,amount_snapshot) VALUES (?,?,?,?,?,?,?)",
      [
        id,
        rate.infraction_type_id,
        rate.rate_version_id,
        rate.code,
        rate.name,
        rate.legal_basis,
        rate.amount,
      ],
    );
    total += Number(rate.amount);
  }
  await connection.query("UPDATE infractions SET total_amount=? WHERE id=?", [
    total.toFixed(2),
    id,
  ]);
  return total;
}
async function history(
  connection: PoolConnection,
  id: number,
  from: string | null,
  to: string,
  action: string,
  userId: number,
  review?: Review,
) {
  await connection.query(
    "INSERT INTO infraction_status_history (infraction_id,from_status,to_status,action,reason_id,comment,indicated_fields,changed_by_user_id) VALUES (?,?,?,?,?,?,?,?)",
    [
      id,
      from,
      to,
      action,
      review?.reasonId ?? null,
      review?.comment ?? null,
      review ? JSON.stringify(review.indicatedFields) : null,
      userId,
    ],
  );
}

export function createInfractionRouter(container: AppContainer): Router {
  const router = Router();
  router.use(authenticate(container.authRepository, container.env));
  router.post(
    "/",
    authorize("infractions.create", container.auditRepository),
    async (request, response, next) => {
      try {
        const input = draftSchema.parse(request.body);
        const key = keyFrom(request);
        const requestHash = hashOf(input);
        const prior = await container.database.query<
          (RowDataPacket & {
            request_hash: string;
            response_status: number | null;
            response_body: string | object | null;
          })[]
        >(
          "SELECT request_hash,response_status,response_body FROM idempotency_records WHERE scope='INFRACTION_CREATE' AND idempotency_key=? AND expires_at>UTC_TIMESTAMP(3)",
          [key],
        );
        if (prior[0]) {
          if (prior[0].request_hash !== requestHash)
            throw new HttpError({
              code: "IDEMPOTENCY_CONFLICT",
              message: "La clave fue usada con otros datos.",
              statusCode: 409,
            });
          const body: unknown =
            typeof prior[0].response_body === "string"
              ? (JSON.parse(prior[0].response_body) as unknown)
              : prior[0].response_body;
          return response.status(prior[0].response_status ?? 200).json(body);
        }
        const body = await container.database.withTransaction(
          async (connection) => {
            const parties = await loadParties(connection, input);
            if (
              !privileged(request) &&
              parties.agent.agent_user_id !== actorId(request)
            )
              throw new HttpError({
                code: "AUTH_FORBIDDEN",
                message: "El agente solo puede crear sus propias boletas.",
                statusCode: 403,
              });
            const rates = await loadRates(
              connection,
              input.items.map((item) => item.infractionTypeId),
              input.occurredAt,
            );
            const year = new Date(input.occurredAt).getUTCFullYear();
            const ticket = await nextNumber(
              connection,
              input.siteId,
              "INFRACTION",
              year,
            );
            const caseNumber = await nextNumber(
              connection,
              input.siteId,
              "CASE_FILE",
              year,
            );
            const c = parties.citizen;
            const v = parties.vehicle;
            const [result] = await connection.query<ResultSetHeader>(
              `INSERT INTO infractions (ticket_number,case_number,site_id,agent_id,device_id,citizen_id,vehicle_id,occurred_at,driver_absent,driver_refused_signature,observations,agent_badge_snapshot,agent_name_snapshot,citizen_identification_snapshot,citizen_name_snapshot,citizen_nit_snapshot,citizen_address_snapshot,vehicle_plate_snapshot,vehicle_registration_card_snapshot,vehicle_type_snapshot,vehicle_brand_snapshot,vehicle_line_snapshot,vehicle_color_snapshot,location_snapshot,created_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [
                ticket,
                caseNumber,
                input.siteId,
                input.agentId,
                input.deviceId,
                input.citizenId ?? null,
                input.vehicleId,
                new Date(input.occurredAt),
                input.driverAbsent ? 1 : 0,
                input.driverRefusedSignature ? 1 : 0,
                input.observations ?? null,
                parties.agent.badge_number,
                `${parties.agent.first_name} ${parties.agent.last_name}`,
                c
                  ? `${String(c["identification_type"])}:${String(c["identification_number"])}`
                  : null,
                c
                  ? `${String(c["first_names"])} ${String(c["last_names"])}`
                  : null,
                c?.["nit"] ?? null,
                c?.["address"] ?? null,
                v.plate_original,
                v.registration_card,
                v.vehicle_type,
                v.brand,
                v.vehicle_line,
                v.color,
                input.location.address,
                actorId(request),
              ],
            );
            const id = result.insertId;
            await connection.query(
              "INSERT INTO infraction_locations (infraction_id,frequent_location_id,place_name,address,latitude,longitude) VALUES (?,?,?,?,?,?)",
              [
                id,
                input.location.frequentLocationId ?? null,
                input.location.placeName,
                input.location.address,
                input.location.latitude ?? null,
                input.location.longitude ?? null,
              ],
            );
            const total = await replaceItems(connection, id, rates);
            await history(
              connection,
              id,
              null,
              "BORRADOR",
              "CREATE",
              actorId(request),
            );
            const responseBody = {
              data: {
                id: String(id),
                ticketNumber: ticket,
                caseNumber,
                totalAmount: total.toFixed(2),
                status: "BORRADOR",
              },
              meta: { requestId: getRequestId() },
            };
            await connection.query(
              "INSERT INTO idempotency_records (scope,idempotency_key,request_hash,resource_type,resource_id,response_status,response_body,created_by_user_id,expires_at) VALUES ('INFRACTION_CREATE',?,?,?,?,201,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 24 HOUR))",
              [
                key,
                requestHash,
                "infraction",
                id,
                JSON.stringify(responseBody),
                actorId(request),
              ],
            );
            return responseBody;
          },
        );
        await recordOperation(container, request, {
          action: "INFRACTION_CREATED",
          module: "infractions",
          entityType: "infraction",
          entityId: body.data.id,
          newValues: body.data,
        });
        response.status(201).json(body);
      } catch (error) {
        if (isDuplicateKey(error))
          return next(
            new HttpError({
              code: "INFRACTION_DUPLICATE",
              message: "La boleta, expediente o clave idempotente ya existe.",
              statusCode: 409,
            }),
          );
        next(error);
      }
    },
  );
  router.get(
    "/",
    authorize("infractions.read", container.auditRepository),
    async (request, response, next) => {
      try {
        const q = listSchema.parse(request.query);
        const clauses: string[] = [];
        const values: unknown[] = [];
        if (q.status) {
          clauses.push("i.status=?");
          values.push(q.status);
        }
        if (q.search) {
          clauses.push(
            "(i.ticket_number LIKE ? OR i.case_number LIKE ? OR i.vehicle_plate_snapshot LIKE ? OR i.citizen_name_snapshot LIKE ?)",
          );
          const like = `%${q.search}%`;
          values.push(like, like, like, like);
        }
        if (!privileged(request)) {
          clauses.push("a.user_id=?");
          values.push(actorId(request));
        }
        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
        const counts = await container.database.query<
          (RowDataPacket & { total: number })[]
        >(
          `SELECT COUNT(*) total FROM infractions i JOIN agents a ON a.id=i.agent_id ${where}`,
          values,
        );
        const rows = await container.database.query<RowDataPacket[]>(
          `SELECT i.id,i.ticket_number,i.case_number,i.status,i.occurred_at,i.total_amount,i.vehicle_plate_snapshot,i.citizen_name_snapshot,i.agent_name_snapshot,i.created_at FROM infractions i JOIN agents a ON a.id=i.agent_id ${where} ORDER BY i.created_at DESC LIMIT ? OFFSET ?`,
          [...values, q.pageSize, (q.page - 1) * q.pageSize],
        );
        response.json({
          data: rows,
          meta: {
            page: q.page,
            pageSize: q.pageSize,
            total: counts[0]?.total ?? 0,
            requestId: getRequestId(),
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    "/:id",
    authorize("infractions.read", container.auditRepository),
    async (request, response, next) => {
      try {
        const id = z.coerce
          .number()
          .int()
          .positive()
          .parse(request.params["id"]);
        const row = await container.database.withTransaction((connection) =>
          findOne(connection, id),
        );
        visible(row, request);
        const [items, locations, evidence, reviews] = await Promise.all([
          container.database.query<RowDataPacket[]>(
            "SELECT * FROM infraction_items WHERE infraction_id=? ORDER BY id",
            [id],
          ),
          container.database.query<RowDataPacket[]>(
            "SELECT * FROM infraction_locations WHERE infraction_id=?",
            [id],
          ),
          container.database.query<RowDataPacket[]>(
            "SELECT id,evidence_type,original_name,mime_type,size_bytes,checksum_sha256,status,created_at FROM infraction_evidence WHERE infraction_id=? ORDER BY created_at",
            [id],
          ),
          container.database.query<RowDataPacket[]>(
            "SELECT * FROM validation_reviews WHERE infraction_id=? ORDER BY created_at",
            [id],
          ),
        ]);
        response.json({
          data: {
            ...row,
            items,
            location: locations[0] ?? null,
            evidence,
            reviews,
          },
          meta: { requestId: getRequestId() },
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.patch(
    "/:id",
    authorize("infractions.update_own", container.auditRepository),
    async (request, response, next) => {
      try {
        const id = z.coerce
          .number()
          .int()
          .positive()
          .parse(request.params["id"]);
        const input = updateSchema.parse(request.body);
        const before = await container.database.withTransaction(
          async (connection) => {
            const row = await findOne(connection, id, true);
            visible(row, request);
            if (!["BORRADOR", "DEVUELTA_CORRECCION"].includes(row.status))
              throw new HttpError({
                code: "INFRACTION_IMMUTABLE",
                message: "Solo se edita un borrador o una boleta devuelta.",
                statusCode: 409,
              });
            const columns: string[] = [];
            const values: unknown[] = [];
            for (const [key, column] of [
              ["citizenId", "citizen_id"],
              ["vehicleId", "vehicle_id"],
              ["occurredAt", "occurred_at"],
              ["driverAbsent", "driver_absent"],
              ["driverRefusedSignature", "driver_refused_signature"],
              ["observations", "observations"],
            ] as const)
              if (input[key] !== undefined) {
                columns.push(`${column}=?`);
                values.push(
                  typeof input[key] === "boolean"
                    ? input[key]
                      ? 1
                      : 0
                    : input[key],
                );
              }
            if (columns.length)
              await connection.query(
                `UPDATE infractions SET ${columns.join(",")} WHERE id=?`,
                [...values, id],
              );
            if (input.vehicleId !== undefined) {
              const [vehicles] = await connection.query<
                (RowDataPacket & {
                  plate_original: string;
                  registration_card: string;
                  vehicle_type: string;
                  brand: string;
                  vehicle_line: string;
                  color: string;
                })[]
              >(
                "SELECT plate_original,registration_card,vehicle_type,brand,vehicle_line,color FROM vehicles WHERE id=? AND status='ACTIVE'",
                [input.vehicleId],
              );
              const vehicle = vehicles[0];
              if (!vehicle)
                throw new HttpError({
                  code: "VEHICLE_NOT_FOUND",
                  message: "Vehículo activo no encontrado.",
                  statusCode: 404,
                });
              await connection.query(
                "UPDATE infractions SET vehicle_plate_snapshot=?,vehicle_registration_card_snapshot=?,vehicle_type_snapshot=?,vehicle_brand_snapshot=?,vehicle_line_snapshot=?,vehicle_color_snapshot=? WHERE id=?",
                [
                  vehicle.plate_original,
                  vehicle.registration_card,
                  vehicle.vehicle_type,
                  vehicle.brand,
                  vehicle.vehicle_line,
                  vehicle.color,
                  id,
                ],
              );
            }
            if (input.citizenId !== undefined) {
              if (input.citizenId === null) {
                await connection.query(
                  "UPDATE infractions SET citizen_identification_snapshot=NULL,citizen_name_snapshot=NULL,citizen_nit_snapshot=NULL,citizen_address_snapshot=NULL WHERE id=?",
                  [id],
                );
              } else {
                const [citizens] = await connection.query<
                  (RowDataPacket & {
                    identification_type: string;
                    identification_number: string;
                    first_names: string;
                    last_names: string;
                    nit: string | null;
                    address: string | null;
                  })[]
                >(
                  "SELECT identification_type,identification_number,first_names,last_names,nit,address FROM citizens WHERE id=? AND status='ACTIVE'",
                  [input.citizenId],
                );
                const citizen = citizens[0];
                if (!citizen)
                  throw new HttpError({
                    code: "CITIZEN_NOT_FOUND",
                    message: "Ciudadano activo no encontrado.",
                    statusCode: 404,
                  });
                await connection.query(
                  "UPDATE infractions SET citizen_identification_snapshot=?,citizen_name_snapshot=?,citizen_nit_snapshot=?,citizen_address_snapshot=? WHERE id=?",
                  [
                    `${citizen.identification_type}:${citizen.identification_number}`,
                    `${citizen.first_names} ${citizen.last_names}`,
                    citizen.nit,
                    citizen.address,
                    id,
                  ],
                );
              }
            }
            if (input.location) {
              await connection.query(
                "UPDATE infraction_locations SET frequent_location_id=?,place_name=?,address=?,latitude=?,longitude=? WHERE infraction_id=?",
                [
                  input.location.frequentLocationId ?? null,
                  input.location.placeName,
                  input.location.address,
                  input.location.latitude ?? null,
                  input.location.longitude ?? null,
                  id,
                ],
              );
              await connection.query(
                "UPDATE infractions SET location_snapshot=? WHERE id=?",
                [input.location.address, id],
              );
            }
            if (input.items) {
              const rates = await loadRates(
                connection,
                input.items.map((item) => item.infractionTypeId),
                input.occurredAt ?? row.occurred_at.toISOString(),
              );
              await replaceItems(connection, id, rates);
            }
            return row;
          },
        );
        await recordOperation(container, request, {
          action: "INFRACTION_UPDATED",
          module: "infractions",
          entityType: "infraction",
          entityId: String(id),
          previousValues: { status: before.status },
          newValues: input,
        });
        response.sendStatus(204);
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/:id/submit",
    authorize("infractions.submit", container.auditRepository),
    async (request, response, next) => {
      try {
        const id = z.coerce
          .number()
          .int()
          .positive()
          .parse(request.params["id"]);
        const key = keyFrom(request);
        const requestHash = hashOf({ id, action: "submit" });
        const prior = await container.database.query<RowDataPacket[]>(
          "SELECT request_hash FROM idempotency_records WHERE scope='INFRACTION_SUBMIT' AND idempotency_key=? AND expires_at>UTC_TIMESTAMP(3)",
          [key],
        );
        if (prior[0]) {
          if (prior[0]["request_hash"] !== requestHash)
            throw new HttpError({
              code: "IDEMPOTENCY_CONFLICT",
              message: "La clave fue usada en otra operación.",
              statusCode: 409,
            });
          return response.sendStatus(204);
        }
        await container.database.withTransaction(async (connection) => {
          const row = await findOne(connection, id, true);
          visible(row, request);
          if (!["BORRADOR", "DEVUELTA_CORRECCION"].includes(row.status))
            throw new HttpError({
              code: "INVALID_TRANSITION",
              message: "No se puede enviar desde el estado actual.",
              statusCode: 409,
            });
          const [counts] = await connection.query<
            (RowDataPacket & {
              items: number;
              evidence_required: number;
              evidence: number;
            })[]
          >(
            `SELECT COUNT(DISTINCT ii.id) items,COALESCE(MAX(it.requires_evidence),0) evidence_required,(SELECT COUNT(*) FROM infraction_evidence ie WHERE ie.infraction_id=i.id AND ie.status='ACTIVE') evidence FROM infractions i LEFT JOIN infraction_items ii ON ii.infraction_id=i.id LEFT JOIN infraction_types it ON it.id=ii.infraction_type_id WHERE i.id=? GROUP BY i.id`,
            [id],
          );
          if (!counts[0]?.items)
            throw new HttpError({
              code: "INFRACTION_ITEMS_REQUIRED",
              message: "La boleta requiere artículos.",
              statusCode: 409,
            });
          if (counts[0].evidence_required && counts[0].evidence === 0)
            throw new HttpError({
              code: "INFRACTION_EVIDENCE_REQUIRED",
              message: "La boleta requiere evidencia.",
              statusCode: 409,
            });
          await connection.query(
            "UPDATE infractions SET status='PENDIENTE_VALIDACION',submitted_at=UTC_TIMESTAMP(3) WHERE id=?",
            [id],
          );
          await history(
            connection,
            id,
            row.status,
            "PENDIENTE_VALIDACION",
            "SUBMIT",
            actorId(request),
          );
          await connection.query(
            "INSERT INTO idempotency_records (scope,idempotency_key,request_hash,resource_type,resource_id,response_status,response_body,created_by_user_id,expires_at) VALUES ('INFRACTION_SUBMIT',?,?,?,?,204,NULL,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 24 HOUR))",
            [key, requestHash, "infraction", id, actorId(request)],
          );
        });
        await recordOperation(container, request, {
          action: "INFRACTION_SUBMITTED",
          module: "infractions",
          entityType: "infraction",
          entityId: String(id),
          newValues: { status: "PENDIENTE_VALIDACION" },
        });
        response.sendStatus(204);
      } catch (error) {
        if (isDuplicateKey(error))
          return next(
            new HttpError({
              code: "IDEMPOTENCY_CONFLICT",
              message: "La operación ya está registrada.",
              statusCode: 409,
            }),
          );
        next(error);
      }
    },
  );
  const transitions = [
    {
      path: "validate",
      permission: "infractions.validate",
      from: ["PENDIENTE_VALIDACION"],
      to: "VALIDADA",
      action: "VALIDATE",
      category: null,
    },
    {
      path: "return",
      permission: "infractions.return",
      from: ["PENDIENTE_VALIDACION"],
      to: "DEVUELTA_CORRECCION",
      action: "RETURN",
      category: "INFRACTION_RETURN",
    },
    {
      path: "reject",
      permission: "infractions.reject",
      from: ["PENDIENTE_VALIDACION"],
      to: "RECHAZADA",
      action: "REJECT",
      category: "INFRACTION_REJECT",
    },
    {
      path: "cancel",
      permission: "infractions.cancel",
      from: [
        "BORRADOR",
        "PENDIENTE_VALIDACION",
        "DEVUELTA_CORRECCION",
        "VALIDADA",
        "RECHAZADA",
      ],
      to: "ANULADA",
      action: "CANCEL",
      category: "INFRACTION_CANCEL",
    },
  ] as const;
  for (const transition of transitions)
    router.post(
      `/:id/${transition.path}`,
      authorize(transition.permission, container.auditRepository),
      async (request, response, next) => {
        try {
          const id = z.coerce
            .number()
            .int()
            .positive()
            .parse(request.params["id"]);
          const review = transition.category
            ? reviewSchema.parse(request.body)
            : null;
          const transitionContext = await container.database.withTransaction(
            async (connection) => {
              const row = await findOne(connection, id, true);
              if (!(transition.from as readonly string[]).includes(row.status))
                throw new HttpError({
                  code: "INVALID_TRANSITION",
                  message: "Transición no permitida.",
                  statusCode: 409,
                });
              if (
                transition.action === "VALIDATE" &&
                row.agent_user_id === actorId(request)
              )
                throw new HttpError({
                  code: "SELF_VALIDATION_FORBIDDEN",
                  message: "El agente no puede validar su propia boleta.",
                  statusCode: 409,
                });
              if (review) {
                const [reasons] = await connection.query<RowDataPacket[]>(
                  "SELECT id FROM action_reasons WHERE id=? AND category=? AND is_active=1",
                  [review.reasonId, transition.category],
                );
                if (!reasons[0])
                  throw new HttpError({
                    code: "ACTION_REASON_INVALID",
                    message: "El motivo no corresponde a la acción.",
                    statusCode: 422,
                  });
              }
              const sql = `UPDATE infractions SET status=?${transition.action === "VALIDATE" ? ",validated_at=UTC_TIMESTAMP(3),validated_by_user_id=?" : ""} WHERE id=?`;
              await connection.query(
                sql,
                transition.action === "VALIDATE"
                  ? [transition.to, actorId(request), id]
                  : [transition.to, id],
              );
              await history(
                connection,
                id,
                row.status,
                transition.to,
                transition.action,
                actorId(request),
                review ?? undefined,
              );
              await connection.query(
                "INSERT INTO validation_reviews (infraction_id,decision,reason_id,comment,indicated_fields,reviewed_by_user_id) VALUES (?,?,?,?,?,?)",
                [
                  id,
                  transition.action,
                  review?.reasonId ?? null,
                  review?.comment ?? null,
                  review ? JSON.stringify(review.indicatedFields) : null,
                  actorId(request),
                ],
              );
              return { previousStatus: row.status, agentUserId: row.agent_user_id };
            },
          );
          await recordOperation(container, request, {
            action: `INFRACTION_${transition.action}`,
            module: "infractions",
            entityType: "infraction",
            entityId: String(id),
            ...(review ? { reason: review.comment } : {}),
            previousValues: { status: transitionContext.previousStatus },
            newValues: { status: transition.to },
          });
          if (transition.action === "RETURN") await container.notifications.emit({ eventCode: "INFRACTION_RETURNED", recipientUserIds: [transitionContext.agentUserId], deduplicationKey: `infraction-returned:${id}:${getRequestId()}`, resourceType: "infraction", resourceId: id, securePath: `/admin/infracciones/${id}` });
          if (transition.action === "VALIDATE" || transition.action === "REJECT") await container.notifications.emit({ eventCode: "INFRACTION_RESOLVED", recipientUserIds: [transitionContext.agentUserId], deduplicationKey: `infraction-${transition.action.toLowerCase()}:${id}`, resourceType: "infraction", resourceId: id, securePath: `/admin/infracciones/${id}` });
          response.sendStatus(204);
        } catch (error) {
          next(error);
        }
      },
    );
  const raw = express.raw({
    type: ["image/jpeg", "image/png", "application/pdf"],
    limit: container.env.MAX_EVIDENCE_BYTES,
  });
  router.post(
    "/:id/evidence",
    authorize("evidence.upload", container.auditRepository),
    raw,
    async (request, response, next) => {
      let path = "";
      try {
        const id = z.coerce
          .number()
          .int()
          .positive()
          .parse(request.params["id"]);
        const row = await container.database.withTransaction((connection) =>
          findOne(connection, id),
        );
        visible(row, request);
        if (["VALIDADA", "ANULADA"].includes(row.status))
          throw new HttpError({
            code: "EVIDENCE_IMMUTABLE",
            message: "La evidencia de una boleta cerrada es inmutable.",
            statusCode: 409,
          });
        const mime = request.get("content-type")?.split(";")[0] ?? "";
        const extensions: Record<string, string> = {
          "image/jpeg": ".jpg",
          "image/png": ".png",
          "application/pdf": ".pdf",
        };
        const extension = extensions[mime];
        if (
          !extension ||
          !Buffer.isBuffer(request.body) ||
          request.body.length === 0 ||
          !hasExpectedFileSignature(mime, request.body)
        )
          throw new HttpError({
            code: "EVIDENCE_INVALID",
            message: "Use un JPEG, PNG o PDF válido.",
            statusCode: 415,
          });
        const original = (
          request.get("x-file-name") ?? `evidence${extension}`
        ).slice(0, 255);
        if (extname(original).toLowerCase() !== extension)
          throw new HttpError({
            code: "EVIDENCE_EXTENSION_MISMATCH",
            message: "La extensión no coincide con el MIME.",
            statusCode: 422,
          });
        const kind = z
          .enum(["PHOTO", "DOCUMENT", "SIGNATURE"])
          .default("PHOTO")
          .parse(request.get("x-evidence-type") ?? "PHOTO");
        const storageKey = `infractions/${id}/${randomUUID()}${extension}`;
        path = resolve(container.env.PRIVATE_UPLOAD_DIR, storageKey);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, request.body, { flag: "wx" });
        const checksum = createHash("sha256")
          .update(request.body)
          .digest("hex");
        const result = await container.database.query<ResultSetHeader>(
          "INSERT INTO infraction_evidence (infraction_id,evidence_type,storage_key,original_name,mime_type,file_extension,size_bytes,checksum_sha256,uploaded_by_user_id,device_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [
            id,
            kind,
            storageKey,
            original,
            mime,
            extension.slice(1),
            request.body.length,
            checksum,
            actorId(request),
            request.get("x-device-id") ?? null,
          ],
        );
        await recordOperation(container, request, {
          action: "EVIDENCE_UPLOADED",
          module: "evidence",
          entityType: "infraction_evidence",
          entityId: String(result.insertId),
          newValues: {
            infractionId: id,
            kind,
            mime,
            sizeBytes: request.body.length,
            checksum,
          },
        });
        response.status(201).json({
          data: {
            id: String(result.insertId),
            checksum,
            sizeBytes: request.body.length,
          },
          meta: { requestId: getRequestId() },
        });
      } catch (error) {
        if (path) await unlink(path).catch(() => undefined);
        next(error);
      }
    },
  );
  router.get(
    "/:id/evidence/:evidenceId",
    authorize("evidence.read", container.auditRepository),
    async (request, response, next) => {
      try {
        const id = z.coerce
          .number()
          .int()
          .positive()
          .parse(request.params["id"]);
        const evidenceId = z.coerce
          .number()
          .int()
          .positive()
          .parse(request.params["evidenceId"]);
        const row = await container.database.withTransaction((connection) =>
          findOne(connection, id),
        );
        visible(row, request);
        const evidence = await container.database.query<
          (RowDataPacket & {
            storage_key: string;
            original_name: string;
            mime_type: string;
            status: string;
          })[]
        >(
          "SELECT storage_key,original_name,mime_type,status FROM infraction_evidence WHERE id=? AND infraction_id=?",
          [evidenceId, id],
        );
        if (evidence[0]?.status !== "ACTIVE")
          throw new HttpError({
            code: "EVIDENCE_NOT_FOUND",
            message: "Evidencia no encontrada.",
            statusCode: 404,
          });
        const content = await readFile(
          resolve(container.env.PRIVATE_UPLOAD_DIR, evidence[0].storage_key),
        );
        response.setHeader("Content-Type", evidence[0].mime_type);
        response.setHeader(
          "Content-Disposition",
          `inline; filename*=UTF-8''${encodeURIComponent(evidence[0].original_name)}`,
        );
        response.setHeader("Cache-Control", "private, no-store");
        response.send(content);
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    "/:id/timeline",
    authorize("infractions.read", container.auditRepository),
    async (request, response, next) => {
      try {
        const id = z.coerce
          .number()
          .int()
          .positive()
          .parse(request.params["id"]);
        const row = await container.database.withTransaction((connection) =>
          findOne(connection, id),
        );
        visible(row, request);
        const rows = await container.database.query<RowDataPacket[]>(
          `SELECT h.id,h.from_status,h.to_status,h.action,h.comment,h.indicated_fields,h.created_at,r.code reason_code,r.name reason_name,u.username changed_by FROM infraction_status_history h LEFT JOIN action_reasons r ON r.id=h.reason_id JOIN users u ON u.id=h.changed_by_user_id WHERE h.infraction_id=? ORDER BY h.created_at,h.id`,
          [id],
        );
        response.json({ data: rows, meta: { requestId: getRequestId() } });
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
