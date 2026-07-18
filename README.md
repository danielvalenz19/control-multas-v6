# Sistema Municipal de Multas

Frontend web demostrativo para la PMT de San Antonio Suchitepéquez. Reúne el portal ciudadano y el área municipal protegida en una sola aplicación, con navegación real, permisos por rol y datos simulados centralizados.

## Ejecución

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
```

El proyecto usa Vinext como runtime del alojamiento de Sites, React 19, React Router, Material UI y Recharts. La navegación de la aplicación usa rutas hash para conservar todas las vistas dentro de un único despliegue web.

## Cuentas de demostración

La contraseña común es `Demo123*`.

| Rol | Correo | Inicio |
| --- | --- | --- |
| Administrador | `admin@pmt.demo` | Dashboard |
| Supervisor | `supervisor@pmt.demo` | Dashboard |
| Operador PMT | `operador@pmt.demo` | Pendientes |
| Receptoría | `receptoria@pmt.demo` | Receptoría |
| Solvencias | `solvencias@pmt.demo` | Solvencias |

## Escenarios rápidos

- Consulta pública: boleta `2026-001279`, placa `C456DPR`.
- Solvencia auténtica: `PMT-VALIDA-418`.
- Solvencia anulada: `PMT-ANULADA-417`.
- Recibo duplicado: `REC-2026-04821`.
- Boleta pendiente para validar: `2026-001284`.

## Rutas

El portal incluye inicio, consulta y resultado, orden de pago, solicitud y documento de solvencia, verificación, requisitos, ayuda y preguntas frecuentes. El área municipal incluye dashboard, infracciones, bandeja pendiente, receptoría, registro y detalle de pago, conciliación, bandeja y detalle de solvencia, reportes, usuarios, roles, catálogos, dispositivos, auditoría, configuración y perfil.

## Arquitectura

- `src/mocks`: datos de demostración y escenarios completos.
- `src/services`: reglas simuladas y contrato preparado para Express.
- `src/contexts`: sesión y estado operativo compartido.
- `src/layouts`: portal público y área administrativa responsive.
- `src/modules`: páginas agrupadas por dominio.
- `src/components`: estados, indicadores y confirmaciones reutilizables.
- `src/types`: tipos del dominio.
- `tests`: pruebas de los flujos críticos.

Para conectar Express, copia `.env.example`, define `NEXT_PUBLIC_API_URL` y sustituye la implementación de `mockApi` por el adaptador HTTP de `httpClient`. Las páginas no requieren cambios.

Todos los montos, artículos, personas, códigos e información institucional del prototipo son demostrativos y no tienen validez legal.
