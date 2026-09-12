# Sistema Municipal de Multas

Aplicación local compuesta por el frontend React/Vite de esta raíz y el backend Express/MySQL de `multas-backend`. La integración usa `/api/v1`, cookies HttpOnly y el proxy de Vite; no usa Firebase, ChatGPT Auth, Next.js, Vinext, D1, Drizzle ni tokens en `localStorage`.

## Iniciar

Terminal 1:

```bash
cd multas-backend
cp .env.example .env # solo la primera vez; configure credenciales locales
npm install
npm run migration:status:auth
npm run migrate # aplica únicamente migraciones versionadas pendientes
npm run admin:create # solo cuando todavía no existe un administrador
npm run dev
```

El entorno comprobado usa el MySQL local existente mediante `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD` en `multas-backend/.env`. Para levantar solamente el motor MySQL mediante Docker:

```bash
cd multas-backend
cp .env.docker.example .env.docker
# Cambie ambas contraseñas.
docker compose --env-file .env.docker up -d mysql
```

Las versiones 001–003 representan un baseline inmutable del esquema municipal preexistente. Por ello, un volumen Docker completamente nuevo requiere importar primero ese baseline institucional aprobado; `npm run migrate` no intenta reconstruirlo ni inventar catálogos legales.

Terminal 2:

```bash
cp .env.example .env # solo la primera vez
npm install
npm run dev
```

Comandos posteriores, cuando la base ya está migrada:

```bash
cd multas-backend
npm run dev
```

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:3000/api/v1`
- Swagger: `http://127.0.0.1:3000/api/v1/docs`

Copie `.env.example` para el frontend. El backend conserva sus credenciales solo en `multas-backend/.env`; su `.env.example` no contiene secretos. El administrador se crea manualmente con `cd multas-backend && npm run admin:create`.

## Estado

- TANDA 0: **TERMINADA**. Administrador real, Argon2id, ADMIN/RBAC, login, sesión, logout, logout-all, eventos y auditoría comprobados físicamente.
- TANDA 1: **TERMINADA**. Frontend React + Vite, autenticación conectada a Express y portal público disponible.
- TANDA 2: **TERMINADA**. Ciudadanos, vehículos, licencias e historial de propietarios con migración 004, API, permisos, auditoría y UI.
- TANDA 3: **TERMINADA**. Usuarios, roles, agentes, dispositivos, asignaciones, catálogos, tarifas versionadas y correlativos reales.
- TANDA 4: **TERMINADA**. Infracciones con migraciones 005–006, artículos variables, snapshots, flujo legal, idempotencia, evidencia privada e interfaz conectada.
- TANDA 5: **TERMINADA**. Impugnaciones, documentos privados, resoluciones y ajustes económicos con migración 007, permisos, segregación e interfaz real.
- TANDA 6: **TERMINADA**. Consulta pública boleta+placa, saldo exacto y órdenes idempotentes/expirables con migración 008 y PDF no-recibo.
- TANDA 7: **TERMINADA**. Caja, turnos, pagos, recibos, reversos por contrapartida y conciliación real con migración 009.
- TANDA 8: **TERMINADA**. Solicitud, revisión, emisión, PDF, revocación y verificación pública sin PII con migración 010.
- TANDA 9: **APLAZADA**. No se implementaron aplicación móvil ni sincronización offline.
- TANDA 10: **TERMINADA**. Dashboard y gráficas MySQL, 11 reportes paginados, exportación CSV/resumen PDF y notificaciones internas con migraciones 011–012.
- TANDA 11: **TERMINADA**. Exportación documentada desde Access, diez plantillas CSV, staging/validación/mapeos, importación transaccional, conciliación, reversión segura, API/CLI y panel administrativo con migración 013. No se importaron datos institucionales reales.

Las rutas activas de consulta, resultado, orden, pagos, impugnaciones, solvencias, dashboard, reportes y notificaciones usan API real. `src/services/mockApi.ts` permanece únicamente para pruebas heredadas de pantallas anteriores; no participa en esos módulos.

Los módulos conectados incluyen `/admin/dashboard`, `/admin/reportes`, `/admin/auditoria`, `/admin/notificaciones`, `/admin/receptoria`, `/admin/receptoria/caja`, `/admin/receptoria/conciliacion`, `/admin/solvencias`, `/verificar-solvencia`, consulta, órdenes e impugnaciones, además de los módulos administrativos e infracciones existentes.

La preparación histórica se opera en `/admin/migraciones-historicas`. Consulte `multas-backend/docs/PROCEDIMIENTO_EXPORTACION_ACCESS.md` y `multas-backend/docs/PROCEDIMIENTO_IMPORTACION.md`; nunca cargue MDB/ACCDB al backend.

## Calidad

```bash
npm run lint
npm test
npm run build
npm audit

cd multas-backend
npm run lint
npm test
npm run test:integration
npm run build
npm audit
```
