# Matriz de verificación de TANDAS 0–2

| Requisito | Estado | Prueba |
| --- | --- | --- |
| Health y readiness | Cumplido | Ambos 200 con backend en 3000 y MySQL disponible. |
| Contrato auth | Cumplido | `differences: []`, `matches: true`. |
| Administrador real | Cumplido | Un usuario activo, Argon2id y una asignación ADMIN activa. |
| Login/me/sessions | Cumplido | `auth:verify`: 200 en los tres endpoints. |
| Logout/logout-all | Cumplido | Ambos 204; `/auth/me` posterior devolvió 401 en cada comprobación. |
| Sesiones físicas | Cumplido | 2 totales, 2 revocadas y 0 activas. |
| Eventos y auditoría | Cumplido | 4 eventos de autenticación y 5 auditorías; acciones de alta, login y cierre confirmadas. |
| Ausencia de secretos | Cumplido | `secretsPrinted: false`; consultas finales no leyeron ni mostraron hash o token. |
| Frontend Vite | Cumplido | Lint, 6 pruebas, build y revisión local sin errores. |
| Cookie HttpOnly, sin token local | Cumplido | Cliente usa `credentials: include`; auth no toca almacenamiento web. |
| Portal sin administrador | Cumplido | Inicio y login cargan; `/auth/me` anónimo devuelve 401 controlado. |
| Migración 004 | Cumplido | Aplicada una vez; 001–003 preservadas. |
| Ciudadanos CRUD/estado | Cumplido | Rutas protegidas, Zod, paginación, 409, auditoría y UI. |
| Vehículos CRUD/estado | Cumplido | Placa normalizada única, rutas protegidas, auditoría y UI. |
| Propietarios | Cumplido | Asignación/finalización transaccional e historial completo. |
| MySQL sin residuos de prueba | Cumplido | Integración inserta ciudadano, vehículo y propiedad y revierte; conteo final cero. |
| Tablas futuras no creadas | Cumplido | `full` reporta exactamente infractions/payments/solvencies. |
| Lint/test/build/audit backend | Cumplido | 20 pruebas + 1 integración; audit 0. |
| Lint/test/build/audit frontend | Cumplido | 6 pruebas; audit 0. |

**TANDA 0: TERMINADA.** TANDA 1 y TANDA 2 también permanecen terminadas.
