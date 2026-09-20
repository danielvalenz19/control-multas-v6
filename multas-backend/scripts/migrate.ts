import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expectedMigrations } from "../src/shared/infrastructure/mysql/SchemaInspector.js";
import { withContainer } from "./runtime.js";

const files: Record<string, string> = {
  "004": "database/migrations/004_citizens_vehicles.sql",
  "005": "database/migrations/005_infractions_core.sql",
  "006": "database/migrations/006_infraction_workflow_evidence.sql",
  "007": "database/migrations/007_appeals_adjustments.sql",
  "008": "database/migrations/008_public_lookup_payment_orders.sql",
  "009": "database/migrations/009_cash_payments_reconciliation.sql",
  "010": "database/migrations/010_solvencies.sql",
  "011": "database/migrations/011_dashboard_reports_notifications.sql",
  "012": "database/migrations/012_notification_preferences_rbac.sql",
  "013": "database/migrations/013_historical_migrations.sql",
  "014": "database/migrations/014_online_payment_intents.sql",
  "015": "database/migrations/015_payment_order_paid_snapshot.sql",
};
const tablesByMigration: Record<string, Set<string>> = {
  "004": new Set(["citizens", "vehicles", "vehicle_ownerships", "driver_licenses"]),
  "005": new Set(["infractions", "infraction_items", "infraction_locations", "idempotency_records"]),
  "006": new Set(["infraction_evidence", "infraction_status_history", "validation_reviews"]),
  "007": new Set(["institutional_rule_versions", "appeals", "appeal_evidence", "appeal_status_history", "infraction_adjustments", "infraction_adjustment_history"]),
  "008": new Set(["infraction_public_references", "payment_orders", "payment_order_status_history", "public_idempotency_records"]),
  "009": new Set(["cash_sessions", "cash_movements", "payments", "payment_allocations", "payment_receipts", "payment_reversals", "payment_idempotency_records", "reconciliation_batches", "reconciliation_items"]),
  "010": new Set(["solvency_requests", "solvency_request_status_history", "solvencies", "solvency_status_history"]),
  "011": new Set(["notification_templates", "user_notification_preferences", "notifications", "notification_outbox"]),
  "012": new Set(),
  "013": new Set(["migration_batches", "migration_files", "migration_staging_rows", "migration_validation_errors", "migration_conflicts", "migration_entity_mappings", "migration_execution_logs", "legacy_source_references"]),
  "014": new Set(["payment_intents", "payment_webhook_events"]),
  "015": new Set(),
};

await withContainer(async ({ schema, database, logger }) => {
  const auth = await schema.inspect("auth");
  const invalidHistory = auth.migrationHistory.filter((item) => item.state === "DESCRIPTION_MISMATCH" || item.state === "UNRECOGNIZED");
  if (auth.differences.length > 0 || invalidHistory.length > 0) {
    throw new Error(`El contrato auth o su historial inmutable no coincide: ${JSON.stringify({ differences: auth.differences, invalidHistory })}`);
  }

  const before = await schema.inspect("full");
  const pending = before.migrationHistory.filter((item) => item.state === "PENDING" && files[item.version]);
  if (pending.length === 0) {
    process.stdout.write(`${JSON.stringify({ migrationAction: "NONE", skippedExisting: before.baselineVersions, executed: [] }, null, 2)}\n`);
    return;
  }

  const executed: string[] = [];
  for (const migration of pending) {
    const relativeFile = files[migration.version];
    if (!relativeFile) throw new Error(`No existe archivo versionado para ${migration.version}.`);
    const sql = await readFile(resolve(process.cwd(), relativeFile), "utf8");
    for (const statement of splitStatements(sql)) await database.query(statement);

    const afterDdl = await schema.inspect("full");
    const migrationTables = tablesByMigration[migration.version] ?? new Set<string>();
    const incomplete = afterDdl.differences.filter((difference) => migrationTables.has(difference.table));
    if (incomplete.length > 0) {
      throw new Error(`La migración ${migration.version} ejecutó DDL incompleto y no será registrada: ${JSON.stringify(incomplete)}`);
    }
    const definition = expectedMigrations.find((item) => item.version === migration.version);
    if (!definition) throw new Error(`La versión ${migration.version} no pertenece al contrato.`);
    await database.query(
      "INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, UTC_TIMESTAMP(3))",
      [definition.version, definition.description],
    );
    executed.push(migration.version);
  }

  const report = await schema.inspect("full");
  process.stdout.write(`${JSON.stringify({ ...report, migrationAction: "APPLIED", executed }, null, 2)}\n`);
  logger.info({ executed }, "Versioned migrations applied and registered after schema verification");
});

function splitStatements(source: string): string[] {
  return source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}
