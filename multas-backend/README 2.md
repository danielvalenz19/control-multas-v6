# Backend del Sistema Municipal de Multas

API REST local en Express, TypeScript estricto y MySQL para autenticación propia, sesiones opacas, RBAC y auditoría.

## Preparación

```bash
cp .env.example .env
```

Complete en `.env` `DB_USER` y `DB_PASSWORD`. La aplicación solo acepta `DB_NAME=pmt_multas`.

Antes de escribir cualquier baseline:

```bash
npm run migration:status
npm run migrate
```

`migration:status` solo inspecciona. `migrate` vuelve a comparar `information_schema` y registra las versiones 001-003 únicamente si el contrato coincide; no crea, elimina ni modifica tablas.

## Ejecución

```bash
npm install
npm run dev
```

En otra terminal:

```bash
curl http://localhost:3000/api/v1/system/health
curl http://localhost:3000/api/v1/system/readiness
```

## Primer administrador

```bash
npm run admin:create
```

El comando exige una terminal interactiva, oculta la contraseña y la guarda como Argon2id. Requiere que el esquema y la semilla institucional RBAC ya coincidan.

## Autenticación

```bash
curl -i -c cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"usuario","password":"contraseña"}' \
  http://localhost:3000/api/v1/auth/login

curl -b cookies.txt http://localhost:3000/api/v1/auth/me
curl -i -b cookies.txt -X POST http://localhost:3000/api/v1/auth/logout
```

La cookie es `HttpOnly`, usa `SameSite` configurable y se marca `Secure` en producción. MySQL recibe únicamente SHA-256 del token opaco de sesión.
