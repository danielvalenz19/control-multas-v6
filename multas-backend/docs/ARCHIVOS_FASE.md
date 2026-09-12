# Archivos de TANDAS 3 a 10

## TANDA 10 — backend nuevos

- `database/migrations/011_dashboard_reports_notifications.sql`
- `database/migrations/012_notification_preferences_rbac.sql`
- `src/modules/analytics/application/AnalyticsFilters.ts`
- `src/modules/analytics/application/AnalyticsService.ts`
- `src/modules/analytics/application/ReportService.ts`
- `src/modules/analytics/http/analytics.routes.ts`
- `src/modules/notifications/application/NotificationDeliveryPort.ts`
- `src/modules/notifications/application/NotificationService.ts`
- `src/modules/notifications/http/notification.routes.ts`
- `tests/unit/analytics.test.ts`
- `docs/MODELO_DATOS.md`
- `docs/REPORTE_EXPLAIN_TANDA_10.md`

## TANDA 10 — frontend nuevos

- `src/modules/analytics/api/analyticsApi.ts`
- `src/modules/reports/ReportsPage.tsx`
- `src/modules/notifications/api/notificationsApi.ts`
- `src/modules/notifications/NotificationsPage.tsx`
- `src/modules/management/RealSettingsPage.tsx`

## TANDA 10 — modificados

- `README.md`
- `src/app/App.tsx`
- `src/layouts/AdminLayout.tsx`
- `src/modules/dashboard/DashboardPage.tsx`
- `tests/real-api.test.ts`
- `multas-backend/README.md`
- `multas-backend/scripts/migrate.ts`
- `multas-backend/src/bootstrap/container.ts`
- `multas-backend/src/bootstrap/routes.ts`
- `multas-backend/src/modules/adjustments/http/adjustment.routes.ts`
- `multas-backend/src/modules/appeals/http/appeal.routes.ts`
- `multas-backend/src/modules/infractions/http/infraction.routes.ts`
- `multas-backend/src/modules/payments/http/payment.routes.ts`
- `multas-backend/src/modules/solvencies/http/solvency.routes.ts`
- `multas-backend/src/shared/infrastructure/mysql/SchemaInspector.ts`
- `multas-backend/tests/integration/mysql.integration.test.ts`
- `multas-backend/docs/API_OPENAPI.yaml`
- `multas-backend/docs/ARCHIVOS_FASE.md`
- `multas-backend/docs/ARQUITECTURA.md`
- `multas-backend/docs/DECISIONES_TECNICAS.md`
- `multas-backend/docs/ESTADO_MODULOS.md`
- `multas-backend/docs/MATRIZ_PERMISOS.md`

TANDA 9 permanece aplazada. No se incorporaron aplicación móvil, sincronización offline, migración histórica, despliegue productivo ni proveedores externos.

## TANDAS 7 y 8 — backend nuevos

- `database/migrations/009_cash_payments_reconciliation.sql`
- `database/migrations/010_solvencies.sql`
- `src/modules/payments/application/PaymentService.ts`
- `src/modules/payments/http/payment.routes.ts`
- `src/modules/solvencies/application/SolvencyService.ts`
- `src/modules/solvencies/http/solvency.routes.ts`
- `docs/CONTRATO_PAGOS_CAJA.md`
- `docs/CONTRATO_SOLVENCIAS.md`
- `docs/RESPALDO_PRE_TANDAS_7_8.md`

## TANDAS 7 y 8 — frontend nuevos

- `src/modules/payments/api/paymentsApi.ts`
- `src/modules/solvencies/api/solvenciesApi.ts`
- `src/modules/solvencies/PublicSolvencyPages.tsx`

## TANDAS 7 y 8 — modificados

- `README.md`
- `package.json`
- `package-lock.json`
- `src/app/App.tsx`
- `src/layouts/AdminLayout.tsx`
- `src/modules/payments/PaymentPages.tsx`
- `src/modules/solvencies/SolvenciesPage.tsx`
- `tests/real-api.test.ts`
- `multas-backend/.gitignore`
- `multas-backend/README.md`
- `multas-backend/package.json`
- `multas-backend/package-lock.json`
- `multas-backend/scripts/migrate.ts`
- `multas-backend/src/bootstrap/routes.ts`
- `multas-backend/src/modules/finance/application/BalanceService.ts`
- `multas-backend/src/modules/public-portal/http/public.routes.ts`
- `multas-backend/src/modules/settings/http/institutional-rule.routes.ts`
- `multas-backend/src/shared/infrastructure/mysql/SchemaInspector.ts`
- `multas-backend/src/bootstrap/shutdown.ts`
- `multas-backend/tests/integration/mysql.integration.test.ts`
- `multas-backend/docs/API_OPENAPI.yaml`
- `multas-backend/docs/CONTRATO_CONSULTA_PUBLICA.md`
- `multas-backend/docs/CONTRATO_ORDEN_PAGO.md`
- `multas-backend/docs/ARCHIVOS_FASE.md`
- `multas-backend/docs/ARQUITECTURA.md`
- `multas-backend/docs/DECISIONES_TECNICAS.md`
- `multas-backend/docs/ESTADO_MODULOS.md`
- `multas-backend/docs/MATRIZ_DATOS_SENSIBLES.md`
- `multas-backend/docs/MATRIZ_ESTADOS_TRANSICIONES.md`
- `multas-backend/docs/MATRIZ_PERMISOS.md`
- `multas-backend/docs/MODELO_DATOS_OPERATIVO.md`
- `multas-backend/docs/REGLAS_ECONOMICAS_PENDIENTES.md`

## TANDAS 5 y 6 — backend nuevos

- `database/migrations/007_appeals_adjustments.sql`
- `database/migrations/008_public_lookup_payment_orders.sql`
- `src/shared/domain/Money.ts`
- `src/shared/http/private-evidence.ts`
- `src/shared/http/basic-pdf.ts`
- `src/modules/finance/application/BalanceService.ts`
- `src/modules/appeals/http/appeal.routes.ts`
- `src/modules/adjustments/http/adjustment.routes.ts`
- `src/modules/settings/http/institutional-rule.routes.ts`
- `src/modules/public-portal/http/public.routes.ts`
- `docs/CONTRATO_CONSULTA_PUBLICA.md`
- `docs/CONTRATO_ORDEN_PAGO.md`
- `docs/REGLAS_ECONOMICAS_PENDIENTES.md`

## TANDAS 5 y 6 — frontend nuevos

- `src/modules/appeals/api/appealsApi.ts`
- `src/modules/appeals/pages/AppealPages.tsx`
- `src/modules/public-portal/api/publicApi.ts`
- `src/modules/public-portal/RealPublicPages.tsx`

## TANDAS 5 y 6 — modificados

- `src/app/App.tsx`
- `src/layouts/PublicLayout.tsx`
- `src/modules/operations/OperationalPages.tsx`
- `tests/real-api.test.ts`
- `multas-backend/.env.example`
- `multas-backend/scripts/migrate.ts`
- `multas-backend/src/bootstrap/routes.ts`
- `multas-backend/src/config/env.ts`
- `multas-backend/src/shared/http/authorize.ts`
- `multas-backend/src/shared/infrastructure/mysql/SchemaInspector.ts`
- `multas-backend/tests/integration/mysql.integration.test.ts`
- documentación listada en la solicitud.

## Backend nuevos

- `.env.docker.example`
- `docker-compose.yml`
- `database/migrations/005_infractions_core.sql`
- `database/migrations/006_infraction_workflow_evidence.sql`
- `src/shared/http/operations.ts`
- `src/modules/administration/http/administration.routes.ts`
- `src/modules/agents/http/agent.routes.ts`
- `src/modules/devices/http/device.routes.ts`
- `src/modules/catalogs/http/catalog.routes.ts`
- `src/modules/infractions/http/infraction.routes.ts`
- `docs/MATRIZ_PERMISOS.md`

## Backend modificados

- `.env.example`
- `.gitignore`
- `package-lock.json`
- `scripts/migrate.ts`
- `src/app.ts`
- `src/bootstrap/routes.ts`
- `src/config/env.ts`
- `src/modules/audit/application/AuditRepository.ts`
- `src/modules/audit/infrastructure/MySqlAuditRepository.ts`
- `src/shared/infrastructure/mysql/SchemaInspector.ts`
- `tests/integration/mysql.integration.test.ts`
- `docs/API_OPENAPI.yaml`
- `docs/MODELO_DATOS_OPERATIVO.md`
- `docs/DICCIONARIO_BOLETA_REAL.md`
- `docs/MATRIZ_ESTADOS_TRANSICIONES.md`
- `docs/ESTADO_MODULOS.md`
- `docs/DECISIONES_TECNICAS.md`
- `docs/ARQUITECTURA.md`
- `docs/ARCHIVOS_FASE.md`
- `README.md`

## Frontend nuevos

- `src/modules/administration/api/administrationApi.ts`
- `src/modules/administration/hooks/useRemoteData.ts`
- `src/modules/administration/pages/AdministrationPages.tsx`
- `src/modules/infractions/api/infractionsApi.ts`
- `src/modules/infractions/RealInfractionPages.tsx`
- `tests/real-api.test.ts`

## Frontend modificados

- `.gitignore`
- `src/app/App.tsx`
- `src/layouts/AdminLayout.tsx`
- `src/services/httpClient.ts`
- `app/globals.css`
- `package-lock.json`
- `README.md`

## Ajustes de cierre y pruebas

- Validación de firma binaria para JPEG, PNG y PDF en evidencias.
- Búsqueda y paginación real para tarifas y correlativos.
- Cobertura de contrato HTTP real del frontend y normalización de errores vacíos.
- Correlativos ejercitados con cinco solicitudes concurrentes en la integración MySQL.
- Validación visual autenticada en desktop, tablet y móvil.

No se modificó ninguna migración 001–008. Las migraciones 009 y 010 se agregaron y aplicaron una vez, después del respaldo documentado.

## TANDA 11 — nuevos

- `database/migrations/013_historical_migrations.sql`
- `database/templates/historical/*.csv` (10 plantillas)
- `scripts/historical-migration.ts`
- `scripts/export-access-to-csv.ps1`
- `src/modules/historical-migrations/application/HistoricalCsv.ts`
- `src/modules/historical-migrations/application/HistoricalMigrationService.ts`
- `src/modules/historical-migrations/application/OperationalHistoricalImporter.ts`
- `src/modules/historical-migrations/http/historical-migration.routes.ts`
- `tests/unit/historical-csv.test.ts`
- `tests/integration/historical-migration.mysql.test.ts`
- `docs/MIGRACION_HISTORICA.md`, `DICCIONARIO_MIGRACION_ACCESS_MYSQL.md`, `PLANTILLAS_CSV.md`, `PROCEDIMIENTO_EXPORTACION_ACCESS.md`, `PROCEDIMIENTO_IMPORTACION.md`, `PROCEDIMIENTO_REVERSION_MIGRACION.md`, `PROTECCION_DATOS_MIGRACION.md`
- `docs/HASHES_MIGRACIONES_TANDA_11.md`
- Frontend: `src/modules/historical-migrations/HistoricalMigrationsPage.tsx` y `api/historicalMigrationsApi.ts`.

## TANDA 11 — modificados

- Raíz: `README.md`, `src/app/App.tsx`, `src/layouts/AdminLayout.tsx`.
- Backend: `.env.example`, `README.md`, `package.json`, `scripts/migrate.ts`, `src/app.ts`, `src/bootstrap/container.ts`, `src/bootstrap/routes.ts`, `src/config/env.ts`, `src/shared/infrastructure/mysql/SchemaInspector.ts` y la documentación contractual.

No se modificaron migraciones 001–012 ni se agregaron datos institucionales. TANDA 9, móvil, despliegue y proveedores siguen fuera de alcance.
