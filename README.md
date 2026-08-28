# Freight Customer Portal

Freight Customer Portal SaaS V1 is a multi-tenant customer portal for small and
mid-sized freight forwarders. The V1 product chain is:

```text
Rate -> Quote -> Booking -> Shipment -> Tracking / Document -> Invoice
```

## Stack

- Web: Next.js, React, TypeScript, Tailwind CSS
- API: NestJS, REST, OpenAPI-ready structure
- Worker: BullMQ over Redis
- Data: PostgreSQL, Prisma
- Files: S3-compatible object storage

## Workspace

```text
apps/web       Next.js customer portal and admin UI
apps/api       NestJS API modular monolith
apps/worker    BullMQ workers
packages/*     Shared config, types, validation, UI
prisma          Prisma schema and migrations
docker          Container build files
```

## Local Development

1. Copy `.env.example` to `.env` and adjust secrets.
2. Start infrastructure:

```bash
docker compose up -d postgres redis minio
```

If port `5432` is already in use, set `POSTGRES_PORT` and use the same port in
`DATABASE_URL` before starting Docker Compose.

3. Install dependencies and generate Prisma client:

```bash
pnpm install
pnpm prisma:generate
pnpm prisma:migrate:dev
```

The seed is safe to run repeatedly. It always synchronizes global permission
definitions; local demo tenant and role data are created only when explicitly
enabled:

```bash
SEED_DEMO_DATA=true \
PASSWORD_HASH_PEPPER='replace-with-a-local-secret-of-at-least-32-characters' \
DEMO_ADMIN_PASSWORD='replace-with-a-local-demo-password' \
DEMO_CUSTOMER_PASSWORD='replace-with-a-different-local-demo-password' \
pnpm prisma:seed
```

The demo seed creates tenant `DEMO`, an internal tenant administrator at
`admin@demo.freight.local`, and a customer administrator at
`customer@demo.freight.local`. Passwords are taken only from the environment
variables above and are never committed to source control.

4. Run the apps:

```bash
pnpm dev
```

The web app listens on `http://localhost:3000`, and the API listens on
`http://localhost:4000/api/v1`.

Authentication endpoints are available at `/api/v1/auth/login`,
`/api/v1/auth/refresh`, `/api/v1/auth/logout`, and `/api/v1/auth/me`. Login uses
tenant code, email, and password. The short-lived access token is returned in
the response; the rotating refresh token is stored in an HttpOnly cookie.

## Current Scope

The repository contains the deployable foundation plus the first M1 security
slice: tenant/user/role persistence, tenant integrity constraints, audit
foundation, login, rotating refresh sessions, logout, and a global
database-backed authentication guard. Customer and permission-management APIs
remain subsequent M1 work.
