# Freight Customer Portal

Freight Customer Portal SaaS V1 is a multi-tenant customer portal for small and
mid-sized freight forwarders. The original V1 product chain is:

```text
Rate -> Quote -> Booking -> Shipment -> Tracking / Document -> Invoice
```

The current V1.1 pilot baseline intentionally narrows the P0 flow to:

```text
Rate -> Quote -> Booking -> SO -> Basic Shipment
```

Invoice/Billing, BL documents, containers, and detailed tracking remain in the
codebase as historical/backlog capabilities, but they are not part of the V1.1
P0 pilot scope.

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

The demo seed creates tenant `DEMO` and role-specific users for tenant admin,
sales, operation, finance, customer admin, and customer user testing. Internal
users share the local-only `DEMO_ADMIN_PASSWORD`; customer users share the
local-only `DEMO_CUSTOMER_PASSWORD`. Passwords are taken only from the
environment and are never committed to source control. It also creates
deterministic Quote, Booking, Shipment, Tracking/Document-ready, and issued
Invoice records for repeatable local acceptance tests.

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

The repository currently implements the persisted and authorized V1.1 pilot
baseline through Basic Shipment:

- multi-tenant authentication, users, roles, permissions, and audit logging;
- customers and contacts;
- Rate CRUD, Excel import, customer search, and controlled pricing;
- Quote lifecycle, PDF generation, acceptance, and Quote-to-Booking conversion;
- Booking review, SO registration/release, and Basic Shipment creation/status;
- real API-backed customer and internal pages for Rate, Quote, Booking, SO,
  Shipment, Invoice/Billing, Dashboard, Customer, User, and Notification flows.

Notification and Dashboard first passes are implemented. Tenant branding,
complete document/audit/settings hubs, production hardening, and final business
UAT sign-off remain open. See
[development progress](docs/05-project-management/DEVELOPMENT_PROGRESS.md),
[project status](docs/05-project-management/Project_Development_Progress_CN.md),
and [current risks](docs/05-project-management/CURRENT_RISKS.md) for the
authoritative status.

## Browser E2E

Install the pinned Chromium runtime once, then run the current V1.1 golden path
and smoke paths against a local demo environment:

```bash
pnpm test:e2e:install
E2E_ADMIN_PASSWORD='<local-demo-admin-password>' \
E2E_CUSTOMER_PASSWORD='<local-demo-customer-password>' \
pnpm test:e2e
```

Use `pnpm test:e2e:golden`, `pnpm test:e2e:shipment`, or `pnpm test:e2e:invoice` for a narrow suite.
Playwright reuses API/Web servers already listening on ports 4000/3000 by
default. Set `E2E_API_PORT` and `E2E_WEB_PORT` to use isolated local ports. In CI
it starts the built API and Web automatically and runs suites serially to stay
within authentication throttling. Failed runs retain screenshots, video, trace,
and an HTML report; real credentials must never be committed.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

The latest documented full regression baseline is dated 2026-09-04: 32 Prisma
migrations in the repository, API 24 suites / 111 tests, Worker 5 suites / 14
tests, full-workspace lint/typecheck/build passing, and 3 six-role permission
Playwright scenarios passing. The V1.1 golden path was reset to
Rate -> Quote -> Booking -> SO -> Basic Shipment. Database tests require
`DATABASE_URL`; browser tests additionally require the demo credentials shown
above through environment variables.
