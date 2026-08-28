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

3. Install dependencies and generate Prisma client:

```bash
pnpm install
pnpm prisma:generate
```

4. Run the apps:

```bash
pnpm dev
```

The web app listens on `http://localhost:3000`, and the API listens on
`http://localhost:4000/api/v1`.

## M0 Scope

This foundation intentionally contains only the deployable skeleton, health
checks, Prisma baseline, Docker baseline, and test/tooling setup. Tenant,
authentication, RBAC, customer, and audit behavior start in M1.
