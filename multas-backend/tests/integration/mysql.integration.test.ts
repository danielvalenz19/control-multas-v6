import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { QueryValues } from "mysql2";
import type {
  PoolConnection,
  QueryResult,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { describe, expect, it } from "vitest";
import pino from "pino";
import request from "supertest";
import { createApp } from "../../src/app.js";
import type { AppContainer } from "../../src/bootstrap/container.js";
import { createDatabasePool } from "../../src/config/database.js";
import { loadEnv } from "../../src/config/env.js";
import { MySqlAuditRepository } from "../../src/modules/audit/infrastructure/MySqlAuditRepository.js";
import { CreateAdminUseCase } from "../../src/modules/auth/application/CreateAdminUseCase.js";
import { LoginUseCase } from "../../src/modules/auth/application/LoginUseCase.js";
import {
  LogoutAllUseCase,
  LogoutUseCase,
} from "../../src/modules/auth/application/LogoutUseCase.js";
import { ChangePasswordUseCase } from "../../src/modules/auth/application/PasswordUseCases.js";
import {
  ListSessionsUseCase,
  RevokeSessionUseCase,
} from "../../src/modules/auth/application/SessionUseCases.js";
import { AuthController } from "../../src/modules/auth/http/auth.controller.js";
import { Argon2PasswordHasher } from "../../src/modules/auth/infrastructure/Argon2PasswordHasher.js";
import { MySqlAuthRepository } from "../../src/modules/auth/infrastructure/MySqlAuthRepository.js";
import type { MySqlDatabase } from "../../src/shared/infrastructure/mysql/MySqlConnection.js";
import { RbacInspector } from "../../src/shared/infrastructure/mysql/RbacInspector.js";
import { SchemaInspector } from "../../src/shared/infrastructure/mysql/SchemaInspector.js";
import { NotificationService } from "../../src/modules/notifications/application/NotificationService.js";

const enabled = process.env["RUN_MYSQL_INTEGRATION"] === "true";

describe.skipIf(!enabled)("MySQL real sin residuos", () => {
  it("ejecuta los flujos reales contra MySQL y revierte todos los fixtures", async () => {
    const env = loadEnv();
    const privateUploadDirectory = await mkdtemp(
      join(tmpdir(), "pmt-evidence-test-"),
    );
    env.PRIVATE_UPLOAD_DIR = privateUploadDirectory;
    const pool = createDatabasePool(env);
    const connection = await pool.getConnection();
    const marker = `test-${randomUUID()}`;
    await connection.beginTransaction();
    try {
      const database = transactionDatabase(connection);
      const schema = new SchemaInspector(database, env.DB_NAME);
      const authReport = await schema.inspect("auth");
      const fullReport = await schema.inspect("full");
      expect(authReport.matches).toBe(true);
      expect(authReport.differences).toEqual([]);
      expect(authReport.pendingMigrations).toEqual([]);
      expect(fullReport.matches).toBe(true);
      expect(
        fullReport.differences.map((difference) => difference.table),
      ).toEqual([]);

      const rbac = await new RbacInspector(database).inspect();
      expect(rbac.matches).toBe(true);
      expect(rbac.orphanAssignments).toEqual({
        userRoles: 0,
        rolePermissions: 0,
        userPermissionOverrides: 0,
      });

      const authRepository = new MySqlAuthRepository(database);
      const auditRepository = new MySqlAuditRepository(database);
      const passwordHasher = new Argon2PasswordHasher();
      const password = `T3st!Aa-${randomUUID()}`;
      const admin = await new CreateAdminUseCase(
        authRepository,
        auditRepository,
        passwordHasher,
      ).execute({
        username: marker.slice(0, 50),
        email: `${marker}@example.test`,
        firstName: "Integration",
        lastName: "Test",
        password,
      });
      const stored = await database.query<
        (RowDataPacket & { passwordHash: string; roleCode: string })[]
      >(
        `SELECT u.password_hash AS passwordHash, r.code AS roleCode
         FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
         WHERE u.id = ?`,
        [admin.id],
      );
      expect(stored[0]?.passwordHash).toMatch(/^\$argon2id\$/);
      expect(stored[0]?.roleCode).toBe("ADMIN");
      expect(admin.permissions).toHaveLength(rbac.activePermissions);

      const authController = new AuthController(
        new LoginUseCase(authRepository, auditRepository, passwordHasher, env),
        new LogoutUseCase(authRepository, auditRepository),
        new LogoutAllUseCase(authRepository, auditRepository),
        new ListSessionsUseCase(authRepository),
        new RevokeSessionUseCase(authRepository, auditRepository),
        new ChangePasswordUseCase(
          authRepository,
          auditRepository,
          passwordHasher,
        ),
        env,
      );
      const container = {
        env: { ...env, RATE_LIMIT_MAX: 10_000, PUBLIC_RATE_LIMIT_MAX: 10_000 },
        logger: pino({ level: "silent" }),
        database,
        schema,
        rbac: new RbacInspector(database),
        authRepository,
        auditRepository,
        passwordHasher,
        authController,
        notifications: new NotificationService(database),
      } as unknown as AppContainer;
      const app = createApp(container);
      const httpLogin = await request(app)
        .post("/api/v1/auth/login")
        .send({ identifier: admin.username, password });
      expect(httpLogin.status).toBe(200);
      const cookie = httpLogin.headers["set-cookie"]?.[0]?.split(";")[0] ?? "";

      const roleRows = await database.query<
        (RowDataPacket & { id: number; code: string })[]
      >("SELECT id, code FROM roles WHERE code IN ('ADMIN','AGENT','PMT_OPERATOR')");
      const agentRoleId = roleRows.find((role) => role.code === "AGENT")?.id;
      const operatorRoleId = roleRows.find((role) => role.code === "PMT_OPERATOR")?.id;
      expect(agentRoleId).toBeDefined();
      expect(operatorRoleId).toBeDefined();

      await database.query(
        `UPDATE users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
         SET u.status='DISABLED' WHERE r.code='ADMIN' AND u.id<>?`,
        [admin.id],
      );
      const lastAdmin = await request(app)
        .post(`/api/v1/users/${admin.id}/deactivate`)
        .set("Cookie", cookie);
      expect(lastAdmin.status).toBe(409);
      expect((lastAdmin.body as { error: { code: string } }).error.code).toBe(
        "LAST_ADMIN_REQUIRED",
      );

      const managedUsername = `${marker}-managed`.slice(0, 50);
      const managedUser = await request(app)
        .post("/api/v1/users")
        .set("Cookie", cookie)
        .send({
          username: managedUsername,
          email: `${marker}-managed@example.test`,
          password,
          firstName: "Managed",
          lastName: "Agent",
          roleIds: [],
        });
      expect(managedUser.status).toBe(201);
      const managedUserId = (managedUser.body as { data: { id: string } }).data
        .id;
      expect(
        (
          await request(app)
            .put(`/api/v1/users/${managedUserId}/roles`)
            .set("Cookie", cookie)
            .send({ roleIds: [agentRoleId, operatorRoleId] })
        ).status,
      ).toBe(204);
      const department = await database.query<ResultSetHeader>("INSERT INTO departments (code,name,is_active) VALUES (?,?,1)", [`D${marker.replaceAll("-","").slice(0,20)}`, `Dependencia ${marker}`]);
      const departmentId = department.insertId;
      await database.query("UPDATE users SET department_id=? WHERE id IN (?,?)", [departmentId, admin.id, managedUserId]);

      const badgeNumber = `PMT-${marker.replaceAll("-", "").slice(0, 16)}`;
      const createdAgent = await request(app)
        .post("/api/v1/agents")
        .set("Cookie", cookie)
        .send({
          userId: managedUserId,
          badgeNumber,
        });
      expect(createdAgent.status).toBe(201);
      const agentId = (createdAgent.body as { data: { id: string } }).data.id;
      const duplicateAgent = await request(app)
        .post("/api/v1/agents")
        .set("Cookie", cookie)
        .send({
          userId: managedUserId,
          badgeNumber,
        });
      expect(duplicateAgent.status).toBe(409);
      expect(
        (
          await request(app)
            .post(`/api/v1/agents/${agentId}/deactivate`)
            .set("Cookie", cookie)
        ).status,
      ).toBe(204);
      expect(
        (
          await request(app)
            .post(`/api/v1/users/${managedUserId}/deactivate`)
            .set("Cookie", cookie)
        ).status,
      ).toBe(204);

      const deviceUuid = marker.slice(5);
      const createdDevice = await request(app)
        .post("/api/v1/devices")
        .set("Cookie", cookie)
        .send({
          deviceUuid,
          institutionalCode: `DEV-${marker.replaceAll("-", "").slice(0, 16)}`,
          deviceType: "MOBILE",
          platform: "Android",
          model: "Integration fixture",
        });
      expect(createdDevice.status).toBe(201);
      const deviceId = (createdDevice.body as { data: { id: string } }).data.id;
      expect(
        (
          await request(app)
            .post(`/api/v1/devices/${deviceId}/assign`)
            .set("Cookie", cookie)
            .send({ userId: admin.id })
        ).status,
      ).toBe(201);
      expect(
        (
          await request(app)
            .post(`/api/v1/devices/${deviceId}/block`)
            .set("Cookie", cookie)
        ).status,
      ).toBe(204);
      expect(
        await count(
          database,
          "SELECT COUNT(*) AS total FROM device_assignments WHERE device_id=? AND released_at IS NULL",
          [deviceId],
        ),
      ).toBe(1);

      const typeCode = `T${marker.replaceAll("-", "").slice(0, 20)}`;
      const createdType = await request(app)
        .post("/api/v1/catalogs/infraction-types")
        .set("Cookie", cookie)
        .send({
          code: typeCode,
          name: "Fixture transaccional",
          legalBasis: "Fixture transaccional sin valor legal",
          requiresEvidence: true,
        });
      expect(createdType.status).toBe(201);
      const typeId = (createdType.body as { data: { id: string } }).data.id;
      const firstRate = await request(app)
        .post("/api/v1/catalogs/infraction-rate-versions")
        .set("Cookie", cookie)
        .send({
          infractionTypeId: typeId,
          amount: 100.25,
          effectiveFrom: "2198-01-01",
          changeReason: "Fixture transaccional inicial",
        });
      expect(firstRate.status).toBe(201);
      const firstRateId = (firstRate.body as { data: { id: string } }).data.id;
      expect(
        (
          await request(app)
            .post("/api/v1/catalogs/infraction-rate-versions")
            .set("Cookie", cookie)
            .send({
              infractionTypeId: typeId,
              amount: 150.75,
              effectiveFrom: "2199-01-01",
              changeReason: "Fixture transaccional versionada",
            })
        ).status,
      ).toBe(201);
      const preservedRate = await database.query<
        (RowDataPacket & { amount: string; effective_to: Date | null })[]
      >("SELECT amount,effective_to FROM infraction_rate_versions WHERE id=?", [
        firstRateId,
      ]);
      expect(Number(preservedRate[0]?.amount)).toBe(100.25);
      expect(preservedRate[0]?.effective_to?.toISOString().slice(0, 10)).toBe(
        "2198-12-31",
      );

      const sites = await database.query<(RowDataPacket & { id: number })[]>(
        "SELECT id FROM sites ORDER BY id LIMIT 1",
      );
      expect(sites[0]?.id).toBeDefined();
      const sequence = await request(app)
        .post("/api/v1/catalogs/document-sequences")
        .set("Cookie", cookie)
        .send({
          siteId: sites[0]?.id,
          documentType: "INFRACTION",
          sequenceYear: 2199,
          prefix: "IT-",
          nextNumber: 1,
          paddingLength: 4,
        });
      expect(sequence.status).toBe(201);
      const sequenceId = (sequence.body as { data: { id: string } }).data.id;
      expect(
        (
          await request(app)
            .post("/api/v1/catalogs/document-sequences")
            .set("Cookie", cookie)
            .send({
              siteId: sites[0]?.id,
              documentType: "CASE_FILE",
              sequenceYear: 2199,
              prefix: "EXP-IT-",
              nextNumber: 1,
              paddingLength: 4,
            })
        ).status,
      ).toBe(201);
      const concurrentResponses = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app)
            .post(`/api/v1/catalogs/document-sequences/${sequenceId}/next`)
            .set("Cookie", cookie),
        ),
      );
      const numbers = concurrentResponses.map((nextNumber) => {
        expect(nextNumber.status).toBe(200);
        return (nextNumber.body as { data: { number: string } }).data.number;
      });
      expect(new Set(numbers).size).toBe(numbers.length);

      expect(
        await count(
          database,
          "SELECT COUNT(*) AS total FROM audit_logs WHERE actor_user_id=? AND module IN ('users','agents','devices','catalogs')",
          [admin.id],
        ),
      ).toBeGreaterThanOrEqual(10);

      const citizenHttp = await request(app)
        .post("/api/v1/citizens")
        .set("Cookie", cookie)
        .send({
          identificationType: "DPI",
          identificationNumber: marker,
          firstNames: "HTTP",
          lastNames: "Citizen",
        });
      expect(citizenHttp.status).toBe(201);
      const citizenId = (citizenHttp.body as { data: { id: string } }).data.id;
      const duplicateCitizen = await request(app)
        .post("/api/v1/citizens")
        .set("Cookie", cookie)
        .send({
          identificationType: "DPI",
          identificationNumber: marker,
          firstNames: "Duplicate",
          lastNames: "Citizen",
        });
      expect(duplicateCitizen.status).toBe(409);

      const plate = marker.replaceAll("-", "").slice(0, 20).toUpperCase();
      const vehicleHttp = await request(app)
        .post("/api/v1/vehicles")
        .set("Cookie", cookie)
        .send({
          plate,
          registrationCard: marker,
          vehicleType: "AUTOMOVIL",
          brand: "TEST",
          line: "HTTP",
          color: "BLANCO",
        });
      expect(vehicleHttp.status).toBe(201);
      const vehicleId = (vehicleHttp.body as { data: { id: string } }).data.id;
      expect(
        (
          await request(app)
            .patch(`/api/v1/vehicles/${vehicleId}`)
            .set("Cookie", cookie)
            .send({ color: "AZUL" })
        ).status,
      ).toBe(204);
      const ownershipHttp = await request(app)
        .post(`/api/v1/vehicles/${vehicleId}/ownerships`)
        .set("Cookie", cookie)
        .send({ citizenId, source: "INTEGRATION_TEST" });
      expect(ownershipHttp.status).toBe(201);
      const vehicleRead = await request(app)
        .get(`/api/v1/vehicles/${vehicleId}`)
        .set("Cookie", cookie);
      expect(vehicleRead.status).toBe(200);
      expect(
        (vehicleRead.body as { data: { currentOwner: { id: string } } }).data
          .currentOwner.id,
      ).toBe(citizenId);

      expect(
        (
          await request(app)
            .post(`/api/v1/users/${managedUserId}/activate`)
            .set("Cookie", cookie)
        ).status,
      ).toBe(204);
      expect(
        (
          await request(app)
            .post(`/api/v1/agents/${agentId}/activate`)
            .set("Cookie", cookie)
        ).status,
      ).toBe(204);
      expect(
        (
          await request(app)
            .post(`/api/v1/devices/${deviceId}/unassign`)
            .set("Cookie", cookie)
            .send({ reason: "Preparación fixture TANDA 4" })
        ).status,
      ).toBe(204);
      expect(
        (
          await request(app)
            .post(`/api/v1/devices/${deviceId}/unblock`)
            .set("Cookie", cookie)
        ).status,
      ).toBe(204);
      expect(
        (
          await request(app)
            .post(`/api/v1/devices/${deviceId}/assign`)
            .set("Cookie", cookie)
            .send({ userId: managedUserId })
        ).status,
      ).toBe(201);
      await database.query(
        `INSERT INTO role_permissions (role_id,permission_id)
         SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code='infractions.validate'
         WHERE r.code='AGENT' AND NOT EXISTS (
           SELECT 1 FROM role_permissions rp WHERE rp.role_id=r.id AND rp.permission_id=p.id
         )`,
      );
      const managedLogin = await request(app)
        .post("/api/v1/auth/login")
        .send({ identifier: managedUsername, password });
      expect(managedLogin.status).toBe(200);
      const managedCookie =
        managedLogin.headers["set-cookie"]?.[0]?.split(";")[0] ?? "";

      const secondType = await request(app)
        .post("/api/v1/catalogs/infraction-types")
        .set("Cookie", cookie)
        .send({
          code: `S${typeCode}`.slice(0, 30),
          name: "Segundo fixture transaccional",
          legalBasis: "Fixture sin valor legal",
          requiresEvidence: true,
        });
      expect(secondType.status).toBe(201);
      const secondTypeId = (secondType.body as { data: { id: string } }).data
        .id;
      expect(
        (
          await request(app)
            .post("/api/v1/catalogs/infraction-rate-versions")
            .set("Cookie", cookie)
            .send({
              infractionTypeId: secondTypeId,
              amount: 50.25,
              effectiveFrom: "2199-01-01",
              changeReason: "Fixture transaccional TANDA 4",
            })
        ).status,
      ).toBe(201);
      const returnReason = await request(app)
        .post("/api/v1/catalogs/action-reasons")
        .set("Cookie", cookie)
        .send({
          category: "INFRACTION_RETURN",
          code: `R${typeCode}`.slice(0, 40),
          name: "Corrección fixture",
          requiresComment: true,
        });
      expect(returnReason.status).toBe(201);
      const returnReasonId = (returnReason.body as { data: { id: string } })
        .data.id;

      const draftInput = {
        siteId: sites[0]?.id,
        agentId,
        deviceId,
        citizenId,
        vehicleId,
        occurredAt: "2199-06-15T16:30:00.000Z",
        driverAbsent: false,
        driverRefusedSignature: true,
        observations: "Fixture transaccional de infracción",
        items: [
          { infractionTypeId: typeId },
          { infractionTypeId: secondTypeId },
        ],
        location: {
          placeName: "Ubicación fixture",
          address: "Dirección fixture",
          latitude: 14.6349,
          longitude: -90.5069,
        },
      };
      const createKey = randomUUID();
      const draft = await request(app)
        .post("/api/v1/infractions")
        .set("Cookie", managedCookie)
        .set("Idempotency-Key", createKey)
        .send(draftInput);
      expect(draft.status).toBe(201);
      const infractionId = (
        draft.body as { data: { id: string; totalAmount: string } }
      ).data.id;
      expect(
        (draft.body as { data: { totalAmount: string } }).data.totalAmount,
      ).toBe("201.00");
      const repeatedDraft = await request(app)
        .post("/api/v1/infractions")
        .set("Cookie", managedCookie)
        .set("Idempotency-Key", createKey)
        .send(draftInput);
      expect(repeatedDraft.status).toBe(201);
      expect((repeatedDraft.body as { data: { id: string } }).data.id).toBe(
        infractionId,
      );
      expect(
        (
          await request(app)
            .post("/api/v1/infractions")
            .set("Cookie", managedCookie)
            .set("Idempotency-Key", createKey)
            .send({ ...draftInput, observations: "Otro contenido" })
        ).status,
      ).toBe(409);

      const validEvidence = await request(app)
        .post(`/api/v1/infractions/${infractionId}/evidence`)
        .set("Cookie", managedCookie)
        .set("Content-Type", "image/png")
        .set("X-File-Name", "fixture.png")
        .set("X-Evidence-Type", "PHOTO")
        .set("X-Device-Id", deviceId)
        .send(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(validEvidence.status).toBe(201);
      expect(
        (validEvidence.body as { data: { checksum: string } }).data.checksum,
      ).toMatch(/^[a-f0-9]{64}$/);
      expect(
        (
          await request(app)
            .post(`/api/v1/infractions/${infractionId}/evidence`)
            .set("Cookie", managedCookie)
            .set("Content-Type", "text/plain")
            .set("X-File-Name", "invalid.txt")
            .send("invalid")
        ).status,
      ).toBe(415);
      expect(
        (
          await request(app)
            .post(`/api/v1/infractions/${infractionId}/evidence`)
            .set("Cookie", managedCookie)
            .set("Content-Type", "image/png")
            .set("X-File-Name", "spoofed.png")
            .send(Buffer.from("not-a-real-png"))
        ).status,
      ).toBe(415);

      expect(
        (
          await request(app)
            .post(`/api/v1/infractions/${infractionId}/submit`)
            .set("Cookie", managedCookie)
            .set("Idempotency-Key", randomUUID())
            .send({})
        ).status,
      ).toBe(204);
      const selfValidation = await request(app)
        .post(`/api/v1/infractions/${infractionId}/validate`)
        .set("Cookie", managedCookie)
        .send({});
      expect(selfValidation.status).toBe(409);
      expect(
        (selfValidation.body as { error: { code: string } }).error.code,
      ).toBe("SELF_VALIDATION_FORBIDDEN");
      expect(
        (
          await request(app)
            .post(`/api/v1/infractions/${infractionId}/return`)
            .set("Cookie", cookie)
            .send({
              reasonId: returnReasonId,
              comment: "Corregir observaciones",
              indicatedFields: ["observations"],
            })
        ).status,
      ).toBe(204);
      expect(
        (
          await request(app)
            .patch(`/api/v1/infractions/${infractionId}`)
            .set("Cookie", managedCookie)
            .send({ observations: "Observaciones corregidas" })
        ).status,
      ).toBe(204);
      expect(
        (
          await request(app)
            .post(`/api/v1/infractions/${infractionId}/submit`)
            .set("Cookie", managedCookie)
            .set("Idempotency-Key", randomUUID())
            .send({})
        ).status,
      ).toBe(204);
      expect(
        (
          await request(app)
            .post(`/api/v1/infractions/${infractionId}/validate`)
            .set("Cookie", cookie)
            .send({})
        ).status,
      ).toBe(204);
      expect(
        (
          await request(app)
            .post(`/api/v1/infractions/${infractionId}/validate`)
            .set("Cookie", cookie)
            .send({})
        ).status,
      ).toBe(409);

      await database.query("UPDATE vehicles SET color='ROJO' WHERE id=?", [
        vehicleId,
      ]);
      await database.query(
        "UPDATE citizens SET first_names='CAMBIADO' WHERE id=?",
        [citizenId],
      );
      await database.query(
        "UPDATE infraction_types SET name='CAMBIADO' WHERE id=?",
        [typeId],
      );
      const finalInfraction = await request(app)
        .get(`/api/v1/infractions/${infractionId}`)
        .set("Cookie", cookie);
      expect(finalInfraction.status).toBe(200);
      const finalData = (
        finalInfraction.body as {
          data: {
            status: string;
            total_amount: string;
            vehicle_color_snapshot: string;
            citizen_name_snapshot: string;
            items: { type_name_snapshot: string }[];
          };
        }
      ).data;
      expect(finalData.status).toBe("VALIDADA");
      expect(Number(finalData.total_amount)).toBe(201);
      expect(finalData.vehicle_color_snapshot).toBe("AZUL");
      expect(finalData.citizen_name_snapshot).toBe("HTTP Citizen");
      expect(
        finalData.items.some(
          (item) => item.type_name_snapshot === "Fixture transaccional",
        ),
      ).toBe(true);
      const timeline = await request(app)
        .get(`/api/v1/infractions/${infractionId}/timeline`)
        .set("Cookie", cookie);
      expect(timeline.status).toBe(200);
      expect((timeline.body as { data: unknown[] }).data).toHaveLength(5);
      expect(
        await count(
          database,
          "SELECT COUNT(*) AS total FROM audit_logs WHERE entity_type IN ('infraction','infraction_evidence') AND entity_id IN (?,?)",
          [
            infractionId,
            (validEvidence.body as { data: { id: string } }).data.id,
          ],
        ),
      ).toBeGreaterThanOrEqual(6);

      const appealSequence = await request(app)
        .post("/api/v1/catalogs/document-sequences")
        .set("Cookie", cookie)
        .send({
          siteId: sites[0]?.id,
          documentType: "APPEAL",
          sequenceYear: 2199,
          prefix: "APL-IT-",
          nextNumber: 1,
          paddingLength: 4,
        });
      expect(appealSequence.status).toBe(201);
      expect(
        (
          await request(app)
            .post("/api/v1/institutional-rules")
            .set("Cookie", cookie)
            .send({
              ruleCode: "APPEAL_DEADLINE_DAYS",
              valueType: "INTEGER",
              valueInteger: 7,
              effectiveFrom: "2199-01-01T00:00:00.000Z",
              authorizationReference: "Fixture transaccional sin valor legal",
            })
        ).status,
      ).toBe(201);

      const createAppeal = async (suffix: string) => {
        const result = await request(app)
          .post("/api/v1/appeals")
          .set("Cookie", managedCookie)
          .send({
            infractionId,
            appellantCitizenId: citizenId,
            filedAt: "2199-06-16T12:00:00.000Z",
            reason: `${marker}-${suffix}`,
            description: `Descripción transaccional completa ${suffix}`,
          });
        expect(result.status).toBe(201);
        expect(
          (result.body as { data: { deadlineConfigurationStatus: string } })
            .data.deadlineConfigurationStatus,
        ).toBe("CONFIGURED");
        return (result.body as { data: { id: string } }).data.id;
      };

      const appealId = await createAppeal("modify");
      expect(
        (
          await request(app)
            .post(`/api/v1/appeals/${appealId}/submit`)
            .set("Cookie", managedCookie)
            .send({})
        ).status,
      ).toBe(204);
      expect(
        (
          await request(app)
            .post(`/api/v1/appeals/${appealId}/request-information`)
            .set("Cookie", cookie)
            .send({ comment: "Adjuntar información complementaria" })
        ).status,
      ).toBe(204);
      expect(
        (
          await request(app)
            .post(`/api/v1/appeals/${appealId}/resolve`)
            .set("Cookie", cookie)
            .send({ decision: "CONFIRM", summary: "Resolución todavía improcedente", legalBasis: "Fixture" })
        ).status,
      ).toBe(409);
      expect(
        (
          await request(app)
            .patch(`/api/v1/appeals/${appealId}`)
            .set("Cookie", managedCookie)
            .send({ description: "Descripción corregida con la información requerida" })
        ).status,
      ).toBe(204);
      expect(
        (
          await request(app)
            .post(`/api/v1/appeals/${appealId}/submit`)
            .set("Cookie", managedCookie)
            .send({})
        ).status,
      ).toBe(204);
      const appealEvidence = await request(app)
        .post(`/api/v1/appeals/${appealId}/evidence`)
        .set("Cookie", managedCookie)
        .set("Content-Type", "image/png")
        .set("X-File-Name", "appeal-fixture.png")
        .send(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(appealEvidence.status).toBe(201);
      const appealEvidenceId = (appealEvidence.body as { data: { id: string } }).data.id;
      const privateEvidence = await request(app)
        .get(`/api/v1/appeals/${appealId}/evidence/${appealEvidenceId}`)
        .set("Cookie", cookie);
      expect(privateEvidence.status).toBe(200);
      expect(privateEvidence.headers["cache-control"]).toBe("private, no-store");
      const modifiedAppeal = await request(app)
        .post(`/api/v1/appeals/${appealId}/resolve`)
        .set("Cookie", cookie)
        .send({
          decision: "MODIFY",
          summary: "Se modifica el monto mediante ajuste trazable",
          legalBasis: "Autorización municipal de fixture",
          resolvedAmount: "150.00",
        });
      expect(modifiedAppeal.status).toBe(200);
      const afterResolution = await request(app)
        .get(`/api/v1/infractions/${infractionId}/adjustments`)
        .set("Cookie", cookie);
      expect(afterResolution.status).toBe(200);
      expect(
        (afterResolution.body as { data: { balance: { originalAmount: string; pendingBalance: string } } }).data.balance,
      ).toMatchObject({ originalAmount: "201.00", pendingBalance: "150.00" });

      const adjustment = await request(app)
        .post(`/api/v1/infractions/${infractionId}/adjustments`)
        .set("Cookie", managedCookie)
        .send({
          type: "DISCOUNT",
          amount: "25.00",
          reason: "Descuento transaccional documentado",
          authorizationReference: "AUT-TEST-1",
        });
      expect(adjustment.status).toBe(201);
      const adjustmentId = (adjustment.body as { data: { id: string } }).data.id;
      expect(
        (
          await request(app)
            .post(`/api/v1/infractions/${infractionId}/adjustments/${adjustmentId}/approve`)
            .set("Cookie", managedCookie)
            .send({ comment: "Intento sin permiso suficiente" })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .post(`/api/v1/infractions/${infractionId}/adjustments/${adjustmentId}/approve`)
            .set("Cookie", cookie)
            .send({ comment: "Ajuste revisado por segundo usuario" })
        ).status,
      ).toBe(200);
      const reversed = await request(app)
        .post(`/api/v1/infractions/${infractionId}/adjustments/${adjustmentId}/reverse`)
        .set("Cookie", cookie)
        .send({ comment: "Reversión transaccional conservando historial" });
      expect(reversed.status).toBe(200);
      expect(
        (reversed.body as { data: { balance: { pendingBalance: string } } }).data.balance.pendingBalance,
      ).toBe("150.00");

      const selfAdjustment = await request(app)
        .post(`/api/v1/infractions/${infractionId}/adjustments`)
        .set("Cookie", cookie)
        .send({ type: "DISCOUNT", amount: "1.00", reason: "Prueba de segregación obligatoria", authorizationReference: "AUT-SELF" });
      expect(selfAdjustment.status).toBe(201);
      expect(
        (
          await request(app)
            .post(`/api/v1/infractions/${infractionId}/adjustments/${(selfAdjustment.body as { data: { id: string } }).data.id}/approve`)
            .set("Cookie", cookie)
            .send({ comment: "No debe aprobar el propio ajuste" })
        ).status,
      ).toBe(409);

      const totalExemption = await request(app)
        .post(`/api/v1/infractions/${infractionId}/adjustments`)
        .set("Cookie", managedCookie)
        .send({ type: "TOTAL_EXEMPTION", amount: "150.00", reason: "Exoneración total transaccional", authorizationReference: "AUT-TEST-TOTAL" });
      expect(totalExemption.status).toBe(201);
      const totalExemptionId = (totalExemption.body as { data: { id: string } }).data.id;
      const approvedExemption = await request(app)
        .post(`/api/v1/infractions/${infractionId}/adjustments/${totalExemptionId}/approve`)
        .set("Cookie", cookie)
        .send({ comment: "Exoneración revisada por segundo usuario" });
      expect(approvedExemption.status).toBe(200);
      expect(
        (approvedExemption.body as { data: { balance: { pendingBalance: string } } }).data.balance.pendingBalance,
      ).toBe("0.00");
      expect(
        await count(database, "SELECT COUNT(*) total FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='payments'", []),
      ).toBe(1);
      expect(
        (
          await request(app)
            .post(`/api/v1/infractions/${infractionId}/adjustments/${totalExemptionId}/reverse`)
            .set("Cookie", cookie)
            .send({ comment: "Reversión de exoneración para continuar pruebas" })
        ).status,
      ).toBe(200);

      const confirmedAppealId = await createAppeal("confirm");
      await request(app).post(`/api/v1/appeals/${confirmedAppealId}/submit`).set("Cookie", managedCookie).send({});
      expect(
        (
          await request(app)
            .post(`/api/v1/appeals/${confirmedAppealId}/resolve`)
            .set("Cookie", cookie)
            .send({ decision: "CONFIRM", summary: "Se confirma íntegramente la infracción validada", legalBasis: "Autorización municipal de fixture" })
        ).status,
      ).toBe(200);

      const currentYear = new Date().getUTCFullYear();
      const existingPaymentSequence = await count(
        database,
        "SELECT COUNT(*) total FROM document_sequences WHERE site_id=? AND document_type='PAYMENT_ORDER' AND sequence_year=?",
        [sites[0]?.id, currentYear],
      );
      if (existingPaymentSequence === 0) {
        expect(
          (
            await request(app)
              .post("/api/v1/catalogs/document-sequences")
              .set("Cookie", cookie)
              .send({
                siteId: sites[0]?.id,
                documentType: "PAYMENT_ORDER",
                sequenceYear: currentYear,
                prefix: "OP-IT-",
                nextNumber: 1,
                paddingLength: 5,
              })
          ).status,
        ).toBe(201);
      }
      expect(
        (
          await request(app)
            .post("/api/v1/institutional-rules")
            .set("Cookie", cookie)
            .send({
              ruleCode: "PAYMENT_ORDER_EXPIRY_DAYS",
              valueType: "INTEGER",
              valueInteger: 3,
              effectiveFrom: new Date(Date.now() - 60_000).toISOString(),
              authorizationReference: "Fixture transaccional TANDA 6",
            })
        ).status,
      ).toBe(201);
      const ticketRows = await database.query<(RowDataPacket & { ticket_number: string })[]>(
        "SELECT ticket_number FROM infractions WHERE id=?",
        [infractionId],
      );
      const ticketNumber = ticketRows[0]?.ticket_number ?? "";
      const wrongLookup = await request(app)
        .post("/api/v1/public/infractions/search")
        .send({ ticketNumber, plate: "PLACA-INCORRECTA" });
      expect(wrongLookup.status).toBe(404);
      expect((wrongLookup.body as { error: { code: string } }).error.code).toBe("PUBLIC_INFRACTION_NOT_FOUND");
      const publicLookup = await request(app)
        .post("/api/v1/public/infractions/search")
        .send({ ticketNumber, plate });
      expect(publicLookup.status).toBe(200);
      const publicInfraction = (publicLookup.body as { data: { reference: string; balance: { pendingBalance: string }; paymentOrderEligible: boolean } }).data;
      expect(publicInfraction.reference).toMatch(/^[a-f0-9]{40}$/);
      expect(publicInfraction.balance.pendingBalance).toBe("150.00");
      expect(publicInfraction.paymentOrderEligible).toBe(true);
      const publicPayload = JSON.stringify(publicLookup.body);
      expect(publicPayload).not.toContain("HTTP Citizen");
      expect(publicPayload).not.toContain(marker);
      expect(publicPayload).not.toContain("citizen_");
      expect(publicPayload).not.toContain("agent_");
      expect(publicPayload).not.toContain("infractionId");
      expect(
        (await request(app).get(`/api/v1/public/infractions/${publicInfraction.reference}`)).status,
      ).toBe(200);
      expect(
        (
          await request(app)
            .post("/api/v1/public/payment-orders")
            .send({ publicReference: publicInfraction.reference })
        ).status,
      ).toBe(400);

      const publicOrderKey = randomUUID();
      const publicOrder = await request(app)
        .post("/api/v1/public/payment-orders")
        .set("Idempotency-Key", publicOrderKey)
        .send({ publicReference: publicInfraction.reference });
      expect(publicOrder.status).toBe(201);
      const orderData = (publicOrder.body as { data: { reference: string; pendingBalance: string; status: string; notice: string } }).data;
      expect(orderData.reference).toMatch(/^[a-f0-9]{40}$/);
      expect(orderData.pendingBalance).toBe("150.00");
      expect(orderData.status).toBe("ISSUED");
      expect(orderData.notice).toContain("no es recibo");
      const orderReplay = await request(app)
        .post("/api/v1/public/payment-orders")
        .set("Idempotency-Key", publicOrderKey)
        .send({ publicReference: publicInfraction.reference });
      expect(orderReplay.status).toBe(200);
      expect((orderReplay.body as { data: { reference: string } }).data.reference).toBe(orderData.reference);
      const orderDocument = await request(app).get(`/api/v1/public/payment-orders/${orderData.reference}/document`);
      expect(orderDocument.status).toBe(200);
      expect(orderDocument.headers["content-type"]).toContain("application/pdf");
      expect(Buffer.from(orderDocument.body as Uint8Array).toString("utf8")).toContain("NO ES RECIBO PAGADO");
      await database.query(
        "UPDATE payment_orders SET issued_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 2 DAY),expires_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 DAY) WHERE public_reference=?",
        [orderData.reference],
      );
      const expiredOrder = await request(app).get(`/api/v1/public/payment-orders/${orderData.reference}`);
      expect((expiredOrder.body as { data: { status: string } }).data.status).toBe("EXPIRED");
      const concurrentOrders = await Promise.all([
        request(app).post("/api/v1/public/payment-orders").set("Idempotency-Key", randomUUID()).send({ publicReference: publicInfraction.reference }),
        request(app).post("/api/v1/public/payment-orders").set("Idempotency-Key", randomUUID()).send({ publicReference: publicInfraction.reference }),
      ]);
      expect(concurrentOrders.every((result) => [200, 201].includes(result.status))).toBe(true);
      expect(new Set(concurrentOrders.map((result) => (result.body as { data: { reference: string } }).data.reference)).size).toBe(1);
      const activeOrderReference = (concurrentOrders[0].body as { data: { reference: string } }).data.reference;
      const activeOrderRows = await database.query<(RowDataPacket & { id: number })[]>("SELECT id FROM payment_orders WHERE public_reference=?", [activeOrderReference]);
      const activeOrderId = activeOrderRows[0]?.id;
      expect(activeOrderId).toBeDefined();

      const cashCode = `C${marker.replaceAll("-", "").slice(0, 20)}`;
      const methodCode = `M${marker.replaceAll("-", "").slice(0, 20)}`;
      const cashRegister = await request(app).post("/api/v1/cash-registers").set("Cookie", cookie).send({ siteId: sites[0]?.id, code: cashCode, name: `Caja ${marker}` });
      expect(cashRegister.status).toBe(201);
      const cashRegisterId = (cashRegister.body as { data: { id: string } }).data.id;
      const paymentMethod = await request(app).post("/api/v1/payment-methods").set("Cookie", cookie).send({ code: methodCode, name: `Efectivo ${marker}`, isCash: true });
      expect(paymentMethod.status).toBe(201);
      const paymentMethodId = (paymentMethod.body as { data: { id: string } }).data.id;
      expect(
        (
          await request(app).post("/api/v1/catalogs/document-sequences").set("Cookie", cookie).send({
            siteId: sites[0]?.id,
            documentType: "PAYMENT_RECEIPT",
            sequenceYear: currentYear,
            prefix: "RC-IT-",
            nextNumber: 1,
            paddingLength: 5,
          })
        ).status,
      ).toBe(201);
      expect((await request(app).post("/api/v1/cash-sessions/open").set("Cookie", managedCookie).send({ cashDeskId: cashRegisterId, openingAmount: "100.00" })).status).toBe(403);
      const openedCash = await request(app).post("/api/v1/cash-sessions/open").set("Cookie", cookie).send({ cashDeskId: cashRegisterId, openingAmount: "100.00" });
      expect(openedCash.status).toBe(201);
      const cashSessionId = (openedCash.body as { data: { id: number } }).data.id;
      expect((await request(app).post("/api/v1/cash-sessions/open").set("Cookie", cookie).send({ cashDeskId: cashRegisterId, openingAmount: "100.00" })).status).toBe(409);
      expect((await request(app).post(`/api/v1/payments/${activeOrderId}/confirm`).set("Cookie", cookie).set("Idempotency-Key", randomUUID()).send({})).status).toBe(404);

      const expiredOrderRows = await database.query<(RowDataPacket & { id: number })[]>("SELECT id FROM payment_orders WHERE public_reference=?", [orderData.reference]);
      const rejectedExpired = await request(app).post("/api/v1/payments").set("Cookie", cookie).set("Idempotency-Key", randomUUID()).send({ paymentOrderId: expiredOrderRows[0]?.id, paymentMethodId, amount: "150.00" });
      expect(rejectedExpired.status).toBe(409);
      expect((await request(app).post("/api/v1/solvencies/requests").set("Cookie", managedCookie).send({ vehicleId })).status).toBe(403);
      const debtSolvency = await request(app).post("/api/v1/solvencies/requests").set("Cookie", cookie).send({ vehicleId });
      expect(debtSolvency.status).toBe(409);
      expect((debtSolvency.body as { error: { code: string } }).error.code).toBe("SOLVENCY_OUTSTANDING_BALANCE");

      const paymentKey = randomUUID();
      const concurrentPayments = await Promise.all([
        request(app).post("/api/v1/payments").set("Cookie", cookie).set("Idempotency-Key", paymentKey).send({ paymentOrderId: activeOrderId, paymentMethodId, amount: "150.00" }),
        request(app).post("/api/v1/payments").set("Cookie", cookie).set("Idempotency-Key", paymentKey).send({ paymentOrderId: activeOrderId, paymentMethodId, amount: "150.00" }),
      ]);
      expect(concurrentPayments.every((result) => [200, 201].includes(result.status))).toBe(true);
      const paymentIds = concurrentPayments.map((result) => (result.body as { data: { id: string } }).data.id);
      expect(new Set(paymentIds).size).toBe(1);
      const paymentId = paymentIds[0] ?? "";
      expect((await request(app).post("/api/v1/payments").set("Cookie", cookie).set("Idempotency-Key", randomUUID()).send({ paymentOrderId: activeOrderId, paymentMethodId, amount: "150.00" })).status).toBe(409);
      expect((await request(app).get(`/api/v1/payments/${paymentId}/receipt`).set("Cookie", cookie)).status).toBe(409);
      const confirmedPayment = await request(app).post(`/api/v1/payments/${paymentId}/confirm`).set("Cookie", cookie).set("Idempotency-Key", randomUUID()).send({});
      expect(confirmedPayment.status).toBe(200);
      expect((confirmedPayment.body as { data: { receipt: { number: string } } }).data.receipt.number).toMatch(/^RC-IT-/);
      const receipt = await request(app).get(`/api/v1/payments/${paymentId}/receipt`).set("Cookie", cookie);
      expect(receipt.status).toBe(200);
      expect(receipt.headers["content-type"]).toContain("application/pdf");
      expect(Buffer.from(receipt.body as Uint8Array).toString("utf8")).toContain("RECIBO OFICIAL");
      const receiptCopy = await request(app).get(`/api/v1/payments/${paymentId}/receipt?copy=true`).set("Cookie", cookie);
      expect(Buffer.from(receiptCopy.body as Uint8Array).toString("utf8")).toContain("COPIA DE RECIBO");
      const paidPublic = await request(app).get(`/api/v1/public/infractions/${publicInfraction.reference}`);
      expect((paidPublic.body as { data: { balance: { paymentTotal: string; pendingBalance: string } } }).data.balance).toMatchObject({ paymentTotal: "150.00", pendingBalance: "0.00" });
      const paidInternal = await request(app).get(`/api/v1/infractions/${infractionId}/adjustments`).set("Cookie", cookie);
      expect((paidInternal.body as { data: { balance: { appliedPayments: string; pendingBalance: string } } }).data.balance).toMatchObject({ appliedPayments: "150.00", pendingBalance: "0.00" });

      for (const sequence of [
        { documentType: "SOLVENCY_REQUEST", prefix: "SR-IT-" },
        { documentType: "SOLVENCY", prefix: "SV-IT-" },
      ]) {
        expect((await request(app).post("/api/v1/catalogs/document-sequences").set("Cookie", cookie).send({ siteId: sites[0]?.id, documentType: sequence.documentType, sequenceYear: currentYear, prefix: sequence.prefix, nextNumber: 1, paddingLength: 5 })).status).toBe(201);
      }
      expect((await request(app).post("/api/v1/institutional-rules").set("Cookie", cookie).send({ ruleCode: "SOLVENCY_VALIDITY_DAYS", valueType: "INTEGER", valueInteger: 30, effectiveFrom: new Date(Date.now() - 30_000).toISOString(), authorizationReference: "Fixture transaccional TANDA 8" })).status).toBe(201);
      const solvencyRequest = await request(app).post("/api/v1/solvencies/requests").set("Cookie", cookie).send({ vehicleId });
      expect(solvencyRequest.status).toBe(201);
      const solvencyRequestId = (solvencyRequest.body as { data: { id: number } }).data.id;
      const concurrentApprovals = await Promise.all([
        request(app).post(`/api/v1/solvencies/requests/${solvencyRequestId}/approve`).set("Cookie", cookie).send({}),
        request(app).post(`/api/v1/solvencies/requests/${solvencyRequestId}/approve`).set("Cookie", cookie).send({}),
      ]);
      expect(concurrentApprovals.map((result) => result.status).sort()).toEqual([201, 409]);
      const issuedResult = concurrentApprovals.find((result) => result.status === 201);
      const issuedSolvency = (issuedResult?.body as { data: { id: string; publicReference: string; status: string; solvencyNumber: string } }).data;
      expect(issuedSolvency.status).toBe("VALID");
      expect(issuedSolvency.publicReference).toMatch(/^[a-f0-9]{40}$/);
      const solvencyDocument = await request(app).get(`/api/v1/solvencies/${issuedSolvency.id}/document`).set("Cookie", cookie);
      expect(solvencyDocument.status).toBe(200);
      expect(Buffer.from(solvencyDocument.body as Uint8Array).toString("utf8")).toContain("SOLVENCIA MUNICIPAL");
      const validVerification = await request(app).get(`/api/v1/public/solvencies/${issuedSolvency.publicReference}/verify`);
      expect((validVerification.body as { data: { valid: boolean; status: string } }).data).toMatchObject({ valid: true, status: "VALID" });
      const verificationPayload = JSON.stringify(validVerification.body);
      expect(verificationPayload).not.toContain("HTTP Citizen");
      expect(verificationPayload).not.toContain(marker);
      expect(verificationPayload).not.toContain(plate);
      expect((await request(app).post(`/api/v1/solvencies/${issuedSolvency.id}/revoke`).set("Cookie", cookie).send({ reason: "Revocación transaccional autorizada" })).status).toBe(200);
      const revokedVerification = await request(app).get(`/api/v1/public/solvencies/${issuedSolvency.publicReference}/verify`);
      expect((revokedVerification.body as { data: { valid: boolean; status: string } }).data).toMatchObject({ valid: false, status: "REVOKED" });

      const secondRequest = await request(app).post("/api/v1/solvencies/requests").set("Cookie", cookie).send({ vehicleId });
      expect(secondRequest.status).toBe(201);
      const secondIssued = await request(app).post(`/api/v1/solvencies/requests/${(secondRequest.body as { data: { id: number } }).data.id}/approve`).set("Cookie", cookie).send({});
      expect(secondIssued.status).toBe(201);
      const secondSolvency = (secondIssued.body as { data: { id: string; publicReference: string } }).data;

      const reconciliation = await request(app).post("/api/v1/reconciliations").set("Cookie", cookie).send({ paymentMethodId, sourceType: "MANUAL", sourceReference: marker, items: [{ paymentId, observedAmount: "149.50" }] });
      expect(reconciliation.status).toBe(201);
      expect((reconciliation.body as { data: { difference_amount: string } }).data.difference_amount).toBe("-0.50");
      const reconciliationId = (reconciliation.body as { data: { id: number } }).data.id;
      expect((await request(app).post(`/api/v1/reconciliations/${reconciliationId}/close`).set("Cookie", cookie).send({ note: "Diferencia documentada" })).status).toBe(200);
      expect((await request(app).post(`/api/v1/cash-sessions/${cashSessionId}/movements`).set("Cookie", cookie).send({ direction: "IN", amount: "10.00", reason: "Ingreso autorizado de prueba", authorizationReference: marker })).status).toBe(201);

      const reversedPayment = await request(app).post(`/api/v1/payments/${paymentId}/reverse`).set("Cookie", cookie).set("Idempotency-Key", randomUUID()).send({ reason: "Reverso transaccional de prueba", authorizationReference: marker });
      expect(reversedPayment.status).toBe(200);
      expect((reversedPayment.body as { data: { status: string; reversal: { reference: string } } }).data).toMatchObject({ status: "CONFIRMED" });
      expect((await request(app).post(`/api/v1/payments/${paymentId}/reverse`).set("Cookie", cookie).set("Idempotency-Key", randomUUID()).send({ reason: "Segundo reverso prohibido", authorizationReference: marker })).status).toBe(409);
      const restoredPublic = await request(app).get(`/api/v1/public/infractions/${publicInfraction.reference}`);
      expect((restoredPublic.body as { data: { balance: { paymentTotal: string; pendingBalance: string } } }).data.balance).toMatchObject({ paymentTotal: "0.00", pendingBalance: "150.00" });
      const restoredInternal = await request(app).get(`/api/v1/infractions/${infractionId}/adjustments`).set("Cookie", cookie);
      expect((restoredInternal.body as { data: { balance: { appliedPayments: string; pendingBalance: string } } }).data.balance).toMatchObject({ appliedPayments: "0.00", pendingBalance: "150.00" });
      const observedVerification = await request(app).get(`/api/v1/public/solvencies/${secondSolvency.publicReference}/verify`);
      expect((observedVerification.body as { data: { valid: boolean; status: string } }).data).toMatchObject({ valid: false, status: "OBSERVED" });
      const closedCash = await request(app).post(`/api/v1/cash-sessions/${cashSessionId}/close`).set("Cookie", cookie).send({ declaredAmount: "109.00", note: "Cierre con diferencia controlada" });
      expect(closedCash.status).toBe(200);
      expect((closedCash.body as { data: { expected_closing_amount: string; difference_amount: string } }).data).toMatchObject({ expected_closing_amount: "110.00", difference_amount: "-1.00" });
      const rangeFrom = new Date(Date.now()-86_400_000).toISOString().slice(0,10); const rangeTo = new Date(Date.now()+86_400_000).toISOString().slice(0,10);
      expect((await request(app).get(`/api/v1/dashboard?from=${rangeFrom}&to=${rangeTo}&departmentId=${departmentId}`).set("Cookie", managedCookie)).status).toBe(403);
      const dashboard = await request(app).get(`/api/v1/dashboard?from=${rangeFrom}&to=${rangeTo}&departmentId=${departmentId}`).set("Cookie", cookie);
      expect(dashboard.status).toBe(200);
      type DashboardMetric = { label: string; count: number; amount?: string; direction?: string };
      const dashboardKpis = (dashboard.body as { data: { kpis: { infractions: DashboardMetric[]; adjustments: DashboardMetric[]; payments: DashboardMetric; reversals: DashboardMetric; orders: DashboardMetric[]; cash: DashboardMetric[]; appeals: DashboardMetric[]; solvencies: DashboardMetric[] } } }).data.kpis;
      const rangeStart = `${rangeFrom} 00:00:00`;
      const rangeEnd = new Date(`${rangeTo}T00:00:00.000Z`); rangeEnd.setUTCDate(rangeEnd.getUTCDate()+1);
      const exactKpiRows = async (sql:string) => database.query<(RowDataPacket & DashboardMetric)[]>(sql,[rangeStart,rangeEnd,departmentId]);
      expect(dashboardKpis.infractions).toEqual(await exactKpiRows("SELECT i.status label,COUNT(*) count,COALESCE(SUM(i.total_amount),0) amount FROM infractions i JOIN users u ON u.id=i.created_by_user_id WHERE i.occurred_at>=? AND i.occurred_at<? AND u.department_id=? GROUP BY i.status ORDER BY i.status"));
      expect(dashboardKpis.adjustments).toEqual(await exactKpiRows("SELECT ia.adjustment_type label,ia.direction,COUNT(*) count,COALESCE(SUM(ia.amount),0) amount FROM infraction_adjustments ia JOIN users u ON u.id=ia.requested_by_user_id WHERE ia.requested_at>=? AND ia.requested_at<? AND ia.status='APPROVED' AND u.department_id=? GROUP BY ia.adjustment_type,ia.direction ORDER BY ia.adjustment_type"));
      expect(dashboardKpis.orders).toEqual(await exactKpiRows("SELECT po.status label,COUNT(*) count,COALESCE(SUM(po.pending_balance_snapshot),0) amount FROM payment_orders po JOIN infractions i ON i.id=po.infraction_id JOIN users u ON u.id=i.created_by_user_id WHERE po.issued_at>=? AND po.issued_at<? AND u.department_id=? GROUP BY po.status ORDER BY po.status"));
      expect(dashboardKpis.cash).toEqual(await exactKpiRows("SELECT cs.status label,COUNT(*) count,COALESCE(SUM(cs.difference_amount),0) amount FROM cash_sessions cs JOIN users u ON u.id=cs.cashier_user_id WHERE cs.opened_at>=? AND cs.opened_at<? AND u.department_id=? GROUP BY cs.status ORDER BY cs.status"));
      expect(dashboardKpis.appeals).toEqual(await exactKpiRows("SELECT a.status label,COUNT(*) count FROM appeals a JOIN users u ON u.id=a.created_by_user_id WHERE a.filed_at>=? AND a.filed_at<? AND u.department_id=? GROUP BY a.status ORDER BY a.status"));
      expect(dashboardKpis.solvencies).toEqual(await exactKpiRows("SELECT s.status label,COUNT(*) count FROM solvencies s JOIN users u ON u.id=s.issued_by_user_id WHERE s.issued_at>=? AND s.issued_at<? AND u.department_id=? GROUP BY s.status ORDER BY s.status"));
      expect(dashboardKpis.payments.amount).toBe("0.00");
      expect(dashboardKpis.reversals.amount).toBe("150.00");
      expect(dashboardKpis.cash.some((item)=>item.amount==="-1.00")).toBe(true);
      expect(dashboardKpis.solvencies).toEqual(expect.arrayContaining([expect.objectContaining({label:"OBSERVED",count:1}),expect.objectContaining({label:"REVOKED",count:1})]));
      const reportResponse = await request(app).get(`/api/v1/reports/payments-reversals?from=${rangeFrom}&to=${rangeTo}&departmentId=${departmentId}&page=1&pageSize=1`).set("Cookie",cookie);
      expect(reportResponse.status).toBe(200); expect((reportResponse.body as {data:unknown[];meta:{page:number;pageSize:number;total:number}}).meta).toMatchObject({page:1,pageSize:1,total:1});
      for (const reportType of ["infractions","collection","cash","reconciliation","aging","adjustments-exemptions","appeals","solvencies","agent-activity","audit"]) expect((await request(app).get(`/api/v1/reports/${reportType}?from=${rangeFrom}&to=${rangeTo}&departmentId=${departmentId}&page=1&pageSize=2`).set("Cookie",cookie)).status).toBe(200);
      const csv = await request(app).get(`/api/v1/reports/payments-reversals/export.csv?from=${rangeFrom}&to=${rangeTo}&departmentId=${departmentId}`).set("Cookie",cookie);
      expect(csv.status).toBe(200); expect(csv.headers["content-type"]).toContain("text/csv"); expect(csv.text).toContain("monto_reversado");
      await container.notifications.emit({eventCode:"PAYMENT_CONFIRMED",recipientUserIds:[admin.id],deduplicationKey:marker});
      await container.notifications.emit({eventCode:"PAYMENT_CONFIRMED",recipientUserIds:[admin.id],deduplicationKey:marker});
      expect(await count(database,"SELECT COUNT(*) total FROM notifications WHERE recipient_user_id=? AND deduplication_key=?",[admin.id,marker])).toBe(1);
      const inbox = await request(app).get("/api/v1/notifications?status=unread").set("Cookie",cookie); expect(inbox.status).toBe(200); const firstNotification=(inbox.body as {data:{id:number}[]}).data[0]; expect(firstNotification).toBeDefined();
      expect((await request(app).patch(`/api/v1/notifications/${firstNotification?.id}/read`).set("Cookie",cookie)).status).toBe(204);
      expect((await request(app).post("/api/v1/notifications/read-all").set("Cookie",cookie)).status).toBe(200);
      expect((await request(app).get("/api/v1/notifications/templates").set("Cookie",managedCookie)).status).toBe(403);
      expect(await count(database, "SELECT COUNT(*) total FROM payments WHERE id=?", [paymentId])).toBe(1);
      expect(await count(database, "SELECT COUNT(*) total FROM payment_reversals WHERE payment_id=?", [paymentId])).toBe(1);
      expect(await count(database, "SELECT COUNT(*) total FROM audit_logs WHERE module IN ('cash','payments','reconciliations') AND actor_user_id=?", [admin.id])).toBeGreaterThanOrEqual(10);
      expect(await count(database, "SELECT COUNT(*) total FROM audit_logs WHERE module='solvencies' AND actor_user_id=?", [admin.id])).toBeGreaterThanOrEqual(6);
      expect(
        await count(database, "SELECT COUNT(*) total FROM audit_logs WHERE module='public_portal' AND actor_user_id IS NULL", []),
      ).toBeGreaterThanOrEqual(5);
      const rateTestApp = createApp({
        ...container,
        env: { ...env, RATE_LIMIT_MAX: 10_000, PUBLIC_RATE_LIMIT_MAX: 2 },
      });
      const abuseResponses = await Promise.all(
        Array.from({ length: 3 }, () =>
          request(rateTestApp)
            .post("/api/v1/public/infractions/search")
            .send({ ticketNumber: "NO-EXISTE", plate: "NOEXISTE" }),
        ),
      );
      expect(abuseResponses.some((result) => result.status === 429)).toBe(true);
      const limited = abuseResponses.find((result) => result.status === 429);
      expect((limited?.body as { error: { code: string } }).error.code).toBe("PUBLIC_RATE_LIMIT_EXCEEDED");

      const annulledAppealId = await createAppeal("annul");
      await request(app).post(`/api/v1/appeals/${annulledAppealId}/submit`).set("Cookie", managedCookie).send({});
      expect(
        (
          await request(app)
            .post(`/api/v1/appeals/${annulledAppealId}/resolve`)
            .set("Cookie", cookie)
            .send({ decision: "ANNUL", summary: "Se anula la infracción mediante resolución fundada", legalBasis: "Autorización municipal de fixture" })
        ).status,
      ).toBe(200);
      const appealTimeline = await request(app).get(`/api/v1/appeals/${appealId}/timeline`).set("Cookie", cookie);
      expect(appealTimeline.status).toBe(200);
      expect((appealTimeline.body as { data: unknown[] }).data).toHaveLength(5);
      expect(
        await count(database, "SELECT COUNT(*) total FROM audit_logs WHERE actor_user_id=? AND module IN ('appeals','adjustments')", [admin.id]),
      ).toBeGreaterThanOrEqual(7);

      expect(
        (
          await request(app)
            .post(`/api/v1/agents/${agentId}/deactivate`)
            .set("Cookie", cookie)
        ).status,
      ).toBe(204);
      const inactiveAgentDraft = await request(app)
        .post("/api/v1/infractions")
        .set("Cookie", managedCookie)
        .set("Idempotency-Key", randomUUID())
        .send(draftInput);
      expect(inactiveAgentDraft.status).toBe(409);
      expect(
        (inactiveAgentDraft.body as { error: { code: string } }).error.code,
      ).toBe("AGENT_INACTIVE");

      expect(
        (
          await request(app)
            .post(`/api/v1/citizens/${citizenId}/deactivate`)
            .set("Cookie", cookie)
        ).status,
      ).toBe(204);
      expect(
        (await request(app).post("/api/v1/auth/logout").set("Cookie", cookie))
          .status,
      ).toBe(204);

      expect(
        await count(
          database,
          "SELECT COUNT(*) AS total FROM vehicle_ownerships WHERE vehicle_id = ? AND citizen_id = ?",
          [vehicleId, citizenId],
        ),
      ).toBe(1);

      const loginUseCase = new LoginUseCase(
        authRepository,
        auditRepository,
        passwordHasher,
        env,
      );
      const login = await loginUseCase.execute({
        identifier: admin.username,
        password,
        ipAddress: "127.0.0.1",
        userAgent: "vitest-mysql-transaction",
        requestId: randomUUID(),
      });
      const authenticationEvents = await count(
        database,
        "SELECT COUNT(*) AS total FROM authentication_events WHERE user_id = ?",
        [admin.id],
      );
      const audits = await count(
        database,
        "SELECT COUNT(*) AS total FROM audit_logs WHERE actor_user_id = ?",
        [admin.id],
      );
      expect(authenticationEvents).toBeGreaterThan(0);
      expect(audits).toBeGreaterThan(0);
      const sensitiveAudit = await count(
        database,
        `SELECT COUNT(*) AS total FROM audit_logs
         WHERE actor_user_id = ? AND (reason LIKE ? OR previous_values LIKE ? OR new_values LIKE ?)`,
        [admin.id, `%${password}%`, `%${password}%`, `%${password}%`],
      );
      expect(sensitiveAudit).toBe(0);

      await new LogoutUseCase(authRepository, auditRepository).execute({
        sessionToken: login.sessionToken,
        requestId: randomUUID(),
        ipAddress: "127.0.0.1",
        userAgent: "vitest-mysql-transaction",
      });
      const revoked = await count(
        database,
        "SELECT COUNT(*) AS total FROM user_sessions WHERE id = ? AND revoked_at IS NOT NULL",
        [login.sessionId],
      );
      expect(revoked).toBe(1);

      const secondLogin = await loginUseCase.execute({
        identifier: admin.username,
        password,
        ipAddress: "127.0.0.1",
        userAgent: "vitest-mysql-transaction",
        requestId: randomUUID(),
      });
      await new LogoutAllUseCase(authRepository, auditRepository).execute({
        sessionId: secondLogin.sessionId,
        userId: admin.id,
        requestId: randomUUID(),
        ipAddress: "127.0.0.1",
        userAgent: "vitest-mysql-transaction",
      });
      const activeSessions = await count(
        database,
        "SELECT COUNT(*) AS total FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL",
        [admin.id],
      );
      expect(activeSessions).toBe(0);
    } finally {
      await connection.rollback();
      const [remaining] = await connection.query<
        (RowDataPacket & { total: number })[]
      >("SELECT COUNT(*) AS total FROM users WHERE username = ?", [
        marker.slice(0, 50),
      ]);
      const [operationalRemaining] = await connection.query<
        (RowDataPacket & { total: number })[]
      >(
        "SELECT COUNT(*) AS total FROM citizens WHERE identification_number = ?",
        [marker],
      );
      const [tandaThreeRemaining] = await connection.query<
        (RowDataPacket & { total: number })[]
      >("SELECT COUNT(*) AS total FROM devices WHERE device_uuid = ?", [
        marker.slice(5),
      ]);
      const [appealsRemaining] = await connection.query<
        (RowDataPacket & { total: number })[]
      >("SELECT COUNT(*) AS total FROM appeals WHERE reason LIKE ?", [
        `%${marker}%`,
      ]);
      const [adjustmentsRemaining] = await connection.query<
        (RowDataPacket & { total: number })[]
      >(
        "SELECT COUNT(*) AS total FROM infraction_adjustments WHERE authorization_reference LIKE 'AUT-TEST%' OR authorization_reference='AUT-SELF'",
      );
      const [rulesRemaining] = await connection.query<
        (RowDataPacket & { total: number })[]
      >(
        "SELECT COUNT(*) AS total FROM institutional_rule_versions WHERE authorization_reference IN ('Fixture transaccional sin valor legal','Fixture transaccional TANDA 6')",
      );
      const [publicRemaining] = await connection.query<
        (RowDataPacket & { total: number })[]
      >("SELECT COUNT(*) AS total FROM infraction_public_references pr JOIN infractions i ON i.id=pr.infraction_id WHERE i.observations LIKE 'Fixture transaccional%'");
      const [ordersRemaining] = await connection.query<
        (RowDataPacket & { total: number })[]
      >("SELECT COUNT(*) AS total FROM payment_orders WHERE order_number LIKE 'OP-IT-%'");
      const [publicIdempotencyRemaining] = await connection.query<
        (RowDataPacket & { total: number })[]
      >("SELECT COUNT(*) AS total FROM public_idempotency_records pir JOIN payment_orders po ON po.id=pir.resource_id WHERE po.order_number LIKE 'OP-IT-%'");
      const [paymentRemaining] = await connection.query<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) total FROM payments p JOIN payment_orders po ON po.id=p.payment_order_id WHERE po.order_number LIKE 'OP-IT-%'");
      const [cashRemaining] = await connection.query<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) total FROM cash_desks WHERE code LIKE 'Ctest%' OR name LIKE 'Caja test-%'");
      const [methodRemaining] = await connection.query<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) total FROM payment_methods WHERE code LIKE 'Mtest%' OR name LIKE 'Efectivo test-%'");
      const [reconciliationRemaining] = await connection.query<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) total FROM reconciliation_batches WHERE source_reference LIKE 'test-%'");
      const [solvencyRemaining] = await connection.query<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) total FROM solvencies WHERE solvency_number LIKE 'SV-IT-%'");
      const [solvencyRequestRemaining] = await connection.query<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) total FROM solvency_requests WHERE request_number LIKE 'SR-IT-%'");
      const [notificationRemaining] = await connection.query<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) total FROM notifications WHERE deduplication_key=?",[marker]);
      connection.release();
      await pool.end();
      await rm(privateUploadDirectory, { recursive: true, force: true });
      expect(remaining[0]?.total).toBe(0);
      expect(operationalRemaining[0]?.total).toBe(0);
      expect(tandaThreeRemaining[0]?.total).toBe(0);
      expect(appealsRemaining[0]?.total).toBe(0);
      expect(adjustmentsRemaining[0]?.total).toBe(0);
      expect(rulesRemaining[0]?.total).toBe(0);
      expect(publicRemaining[0]?.total).toBe(0);
      expect(ordersRemaining[0]?.total).toBe(0);
      expect(publicIdempotencyRemaining[0]?.total).toBe(0);
      expect(paymentRemaining[0]?.total).toBe(0);
      expect(cashRemaining[0]?.total).toBe(0);
      expect(methodRemaining[0]?.total).toBe(0);
      expect(reconciliationRemaining[0]?.total).toBe(0);
      expect(solvencyRemaining[0]?.total).toBe(0);
      expect(solvencyRequestRemaining[0]?.total).toBe(0);
      expect(notificationRemaining[0]?.total).toBe(0);
    }
  }, 60_000);
});

function transactionDatabase(connection: PoolConnection): MySqlDatabase {
  let transactionQueue: Promise<unknown> = Promise.resolve();
  return {
    async query<T extends QueryResult>(
      sql: string,
      values: QueryValues = [],
    ): Promise<T> {
      const [result] = await connection.query<T>(sql, values);
      return result;
    },
    async withTransaction<T>(
      work: (transaction: PoolConnection) => Promise<T>,
    ): Promise<T> {
      const current = transactionQueue.then(() => work(connection));
      transactionQueue = current.then(
        () => undefined,
        () => undefined,
      );
      return current;
    },
  };
}

async function count(
  database: MySqlDatabase,
  sql: string,
  values: QueryValues,
): Promise<number> {
  const rows = await database.query<(RowDataPacket & { total: number })[]>(
    sql,
    values,
  );
  return rows[0]?.total ?? 0;
}
