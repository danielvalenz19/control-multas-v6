import type { RowDataPacket } from "mysql2/promise";
import type { MySqlDatabase } from "./MySqlConnection.js";

export type SchemaScope = "auth" | "full";

const authRequiredColumns: Record<string, readonly string[]> = {
  schema_migrations: ["version", "description", "applied_at"],
  sites: ["id", "code", "name", "is_active"],
  departments: ["id", "code", "name", "is_active"],
  positions: ["id", "code", "name", "is_active"],
  users: [
    "id", "username", "email", "password_hash", "first_name", "last_name", "status",
    "failed_login_attempts", "locked_until", "must_change_password", "last_login_at", "session_version",
  ],
  roles: ["id", "code", "name", "is_active"],
  permissions: ["id", "code", "module", "action", "is_active"],
  user_roles: ["user_id", "role_id", "expires_at"],
  role_permissions: ["role_id", "permission_id"],
  user_permission_overrides: ["user_id", "permission_id", "effect", "expires_at"],
  user_sessions: [
    "id", "user_id", "token_hash", "session_version", "ip_address", "user_agent", "last_seen_at",
    "idle_expires_at", "expires_at", "revoked_at", "revoked_by_user_id", "revoke_reason",
  ],
  authentication_events: ["id", "user_id", "identifier_masked", "event_type", "outcome", "failure_code", "created_at"],
  audit_logs: [
    "id", "actor_user_id", "actor_session_id", "action", "module", "entity_type", "entity_id", "outcome",
    "reason", "request_id", "ip_address", "user_agent", "created_at",
  ],
};

const fullOnlyRequiredColumns: Record<string, readonly string[]> = {
  agents: ["id", "user_id", "badge_number", "status"],
  citizens: ["id", "identification_type", "identification_number", "identification_normalized", "nit", "first_names", "last_names", "status", "created_at", "updated_at"],
  vehicles: ["id", "plate_original", "plate_normalized", "registration_card", "vehicle_type", "brand", "vehicle_line", "model_year", "color", "status", "created_at", "updated_at"],
  vehicle_ownerships: ["id", "vehicle_id", "citizen_id", "started_at", "ended_at", "is_current", "source"],
  driver_licenses: ["id", "citizen_id", "license_number", "license_number_normalized", "license_type", "status"],
  infractions: ["id", "ticket_number", "case_number", "agent_id", "device_id", "citizen_id", "vehicle_id", "status", "total_amount", "occurred_at", "created_at", "submitted_at", "validated_at"],
  infraction_items: ["id", "infraction_id", "infraction_type_id", "rate_version_id", "amount_snapshot", "legal_basis_snapshot"],
  infraction_locations: ["id", "infraction_id", "address", "latitude", "longitude"],
  infraction_evidence: ["id", "infraction_id", "storage_key", "mime_type", "size_bytes", "checksum_sha256", "status"],
  infraction_status_history: ["id", "infraction_id", "from_status", "to_status", "action", "changed_by_user_id"],
  validation_reviews: ["id", "infraction_id", "decision", "reason_id", "reviewed_by_user_id"],
  idempotency_records: ["id", "scope", "idempotency_key", "request_hash", "resource_id", "response_status", "expires_at"],
  institutional_rule_versions: ["id", "rule_code", "value_type", "effective_from", "effective_to", "authorization_reference"],
  appeals: ["id", "appeal_number", "infraction_id", "appellant_citizen_id", "filed_at", "status", "deadline_at", "resolution_type", "created_by_user_id"],
  appeal_evidence: ["id", "appeal_id", "storage_key", "mime_type", "size_bytes", "checksum_sha256", "status"],
  appeal_status_history: ["id", "appeal_id", "from_status", "to_status", "action", "changed_by_user_id"],
  infraction_adjustments: ["id", "infraction_id", "adjustment_type", "direction", "amount", "status", "requested_by_user_id", "reverses_adjustment_id"],
  infraction_adjustment_history: ["id", "adjustment_id", "from_status", "to_status", "action", "changed_by_user_id"],
  infraction_public_references: ["id", "infraction_id", "public_reference", "created_at", "last_accessed_at"],
  payment_orders: ["id", "order_number", "public_reference", "infraction_id", "pending_balance_snapshot", "status", "expiry_rule_version_id", "issued_at", "expires_at"],
  payment_order_status_history: ["id", "payment_order_id", "from_status", "to_status", "action", "request_id"],
  public_idempotency_records: ["id", "scope", "key_hash", "request_hash", "resource_id", "response_status", "expires_at"],
  cash_sessions: ["id", "cash_desk_id", "cashier_user_id", "status", "opening_amount", "opened_at", "closed_at", "difference_amount"],
  cash_movements: ["id", "cash_session_id", "movement_type", "direction", "amount", "payment_id", "payment_reversal_id"],
  payments: ["id", "public_reference", "payment_order_id", "cash_session_id", "payment_method_id", "amount", "status", "confirmed_at"],
  payment_allocations: ["id", "payment_id", "infraction_id", "amount"],
  payment_receipts: ["id", "payment_id", "receipt_number", "issued_at", "copy_count"],
  payment_reversals: ["id", "payment_id", "amount", "reason", "authorization_reference", "reversed_at"],
  payment_idempotency_records: ["id", "actor_user_id", "scope", "key_hash", "request_hash", "resource_id", "expires_at"],
  reconciliation_batches: ["id", "public_reference", "payment_method_id", "source_type", "status", "expected_total", "observed_total", "difference_amount"],
  reconciliation_items: ["id", "reconciliation_batch_id", "payment_id", "expected_amount", "observed_amount", "difference_amount", "status"],
  solvency_requests: ["id", "request_number", "vehicle_id", "status", "vehicle_plate_snapshot", "owner_name_snapshot", "financial_balance_snapshot", "requested_at", "reviewed_at"],
  solvency_request_status_history: ["id", "solvency_request_id", "from_status", "to_status", "action", "request_id"],
  solvencies: ["id", "solvency_request_id", "solvency_number", "public_reference", "vehicle_id", "vehicle_snapshot", "owner_snapshot", "financial_snapshot", "status", "issued_at", "expires_at"],
  solvency_status_history: ["id", "solvency_id", "from_status", "to_status", "action", "request_id"],
  notification_templates: ["id", "code", "channel", "subject_template", "body_template", "is_active"],
  user_notification_preferences: ["user_id", "event_code", "internal_enabled", "email_enabled", "sms_enabled", "push_enabled"],
  notifications: ["id", "recipient_user_id", "template_id", "event_code", "title", "body", "severity", "deduplication_key", "read_at", "created_at"],
  notification_outbox: ["id", "notification_id", "channel", "status", "deduplication_key", "attempts", "available_at"],
  migration_batches: ["id", "public_reference", "source_system", "entity_type", "status", "total_rows", "valid_rows", "rejected_rows", "duplicate_rows", "backup_reference"],
  migration_files: ["id", "batch_id", "entity_type", "original_name", "storage_key", "checksum_sha256", "retained_until", "purged_at"],
  migration_staging_rows: ["id", "batch_id", "row_number", "legacy_id", "raw_data", "normalized_data", "validation_status", "row_hash"],
  migration_validation_errors: ["id", "batch_id", "staging_row_id", "error_code", "column_name", "message", "masked_value"],
  migration_conflicts: ["id", "batch_id", "staging_row_id", "conflict_type", "status", "resolution"],
  migration_entity_mappings: ["id", "source_system", "entity_type", "mapping_type", "source_value", "version", "status"],
  migration_execution_logs: ["id", "batch_id", "action", "outcome", "actor_user_id", "request_id", "created_at"],
  legacy_source_references: ["id", "source_system", "entity_type", "legacy_id", "target_table", "target_id", "imported_by_batch_id", "reverted_at"],
};

export const expectedMigrations = [
  { version: "001", description: "Base tecnica, autenticacion propia, RBAC, sesiones y auditoria", scope: "auth" },
  { version: "002", description: "Catalogos administrativos, tarifas versionadas y correlativos", scope: "auth" },
  { version: "003", description: "Semillas institucionales, roles y permisos RBAC", scope: "auth" },
  { version: "004", description: "Ciudadanos, vehiculos, licencias y propietarios", scope: "full" },
  { version: "005", description: "Nucleo de infracciones e idempotencia", scope: "full" },
  { version: "006", description: "Flujo, evidencias privadas e historial de infracciones", scope: "full" },
  { version: "007", description: "Impugnaciones, ajustes economicos y reglas institucionales", scope: "full" },
  { version: "008", description: "Consulta publica segura y ordenes de pago", scope: "full" },
  { version: "009", description: "Caja, pagos, recibos, reversos y conciliacion", scope: "full" },
  { version: "010", description: "Solicitudes, emision y verificacion de solvencias", scope: "full" },
  { version: "011", description: "Dashboard, reportes y notificaciones internas", scope: "full" },
  { version: "012", description: "Preferencias internas para roles con bandeja", scope: "full" },
  { version: "013", description: "Migracion historica controlada desde Access y CSV", scope: "full" },
] as const;

export type SchemaDifference = {
  table: string;
  kind: "MISSING_TABLE" | "MISSING_COLUMN";
  column?: string;
};

export type MigrationHistoryItem = {
  version: string;
  expectedDescription: string | null;
  actualDescription: string | null;
  appliedAt: Date | null;
  state: "APPLIED" | "PENDING" | "DESCRIPTION_MISMATCH" | "UNRECOGNIZED";
};

export type SchemaReport = {
  database: string;
  scope: SchemaScope;
  checkedAt: string;
  totalTables: number;
  differences: SchemaDifference[];
  migrationHistory: MigrationHistoryItem[];
  pendingMigrations: string[];
  baselineVersions: string[];
  checksumValidation: {
    supported: false;
    reason: string;
  };
  matches: boolean;
};

type MigrationRow = RowDataPacket & {
  version: string;
  description: string;
  applied_at: Date;
};

export class SchemaInspector {
  public constructor(private readonly database: MySqlDatabase, private readonly databaseName: string) {}

  public async inspect(scope: SchemaScope = "auth"): Promise<SchemaReport> {
    const tables = await this.database.query<(RowDataPacket & { tableName: string })[]>(
      `SELECT TABLE_NAME AS tableName FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
      [this.databaseName],
    );
    const columns = await this.database.query<(RowDataPacket & { tableName: string; columnName: string })[]>(
      `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?`,
      [this.databaseName],
    );
    const tableNames = new Set(tables.map((row) => row.tableName));
    const actualColumns = new Map<string, Set<string>>();
    for (const row of columns) {
      const set = actualColumns.get(row.tableName) ?? new Set<string>();
      set.add(row.columnName);
      actualColumns.set(row.tableName, set);
    }

    const contract = scope === "auth" ? authRequiredColumns : { ...authRequiredColumns, ...fullOnlyRequiredColumns };
    const differences = compareContract(contract, tableNames, actualColumns);
    const migrationRows = tableNames.has("schema_migrations")
      ? await this.database.query<MigrationRow[]>(
        "SELECT version, description, applied_at FROM schema_migrations ORDER BY version",
      )
      : [];
    const migrationHistory = validateMigrationHistory(migrationRows);
    const expectedForScope = new Set(expectedMigrations.filter((item) => scope === "full" || item.scope === "auth").map((item) => item.version));
    const pendingMigrations = migrationHistory
      .filter((item) => item.state === "PENDING" && expectedForScope.has(item.version as (typeof expectedMigrations)[number]["version"]))
      .map((item) => item.version);
    const invalidHistory = migrationHistory.some((item) => item.state === "DESCRIPTION_MISMATCH" || item.state === "UNRECOGNIZED");

    return {
      database: this.databaseName,
      scope,
      checkedAt: new Date().toISOString(),
      totalTables: tables.length,
      differences,
      migrationHistory,
      pendingMigrations,
      baselineVersions: migrationRows.map((row) => row.version),
      checksumValidation: {
        supported: false,
        reason: "schema_migrations no tiene una columna checksum; la Fase 1 valida versión, descripción y fecha sin mutarlas.",
      },
      matches: differences.length === 0 && pendingMigrations.length === 0 && !invalidHistory,
    };
  }
}

function compareContract(
  contract: Record<string, readonly string[]>,
  tableNames: Set<string>,
  actualColumns: Map<string, Set<string>>,
): SchemaDifference[] {
  const differences: SchemaDifference[] = [];
  for (const [table, expectedColumns] of Object.entries(contract)) {
    if (!tableNames.has(table)) {
      differences.push({ table, kind: "MISSING_TABLE" });
      continue;
    }
    const tableColumns = actualColumns.get(table) ?? new Set<string>();
    for (const column of expectedColumns) {
      if (!tableColumns.has(column)) differences.push({ table, kind: "MISSING_COLUMN", column });
    }
  }
  return differences;
}

function validateMigrationHistory(rows: MigrationRow[]): MigrationHistoryItem[] {
  const actualByVersion = new Map(rows.map((row) => [row.version, row]));
  const history: MigrationHistoryItem[] = expectedMigrations.map((expected) => {
    const actual = actualByVersion.get(expected.version);
    return {
      version: expected.version,
      expectedDescription: expected.description,
      actualDescription: actual?.description ?? null,
      appliedAt: actual?.applied_at ?? null,
      state: !actual ? "PENDING" : actual.description === expected.description ? "APPLIED" : "DESCRIPTION_MISMATCH",
    };
  });
  const expectedVersions = new Set(expectedMigrations.map((migration) => migration.version));
  for (const row of rows) {
    if (!expectedVersions.has(row.version as (typeof expectedMigrations)[number]["version"])) {
      history.push({
        version: row.version,
        expectedDescription: null,
        actualDescription: row.description,
        appliedAt: row.applied_at,
        state: "UNRECOGNIZED",
      });
    }
  }
  return history;
}
