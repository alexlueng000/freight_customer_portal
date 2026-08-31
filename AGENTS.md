# AGENTS.md

## 1. Project mission

Build **Freight Customer Portal SaaS V1**: a multi-tenant customer portal for small and mid-sized freight forwarders.

The V1 business chain is:

**Rate → Quote → Booking → Shipment → Tracking → Document → Invoice**

The product must allow a freight forwarder’s customer to:

- sign in under its company account;
- search available freight rates;
- create/view/accept quotes and download quote PDFs;
- create bookings from quotes;
- view booking and shipment status;
- view shipment tracking milestones;
- upload/download authorized documents;
- view invoices / receivables.

The freight forwarder’s internal users must be able to manage:

- tenants and users;
- customers and customer contacts;
- rates and rate imports;
- quotes;
- bookings;
- shipments and containers;
- tracking events;
- documents;
- invoices;
- notifications;
- permissions and audit logs;
- tenant branding / white-label configuration.

This repository is **not** a full freight-forwarding ERP.

---

## 2. Mandatory source-of-truth documents

Before implementing or materially changing a module, read the relevant project documents.

Expected documents:

1. `docs/01-product/Freight_Customer_Portal_PRD_V1.0_CN.docx`
2. `docs/02-architecture/Freight_Customer_Portal_Technical_Design_V1.0_CN.docx`
3. `docs/02-architecture/Freight_Customer_Portal_Database_ERD_Prisma_Design_V1.0_CN.docx`

If Markdown/PDF exports of these documents exist, prefer the most readable local version, but treat the latest approved V1 content as authoritative.

### Priority when requirements conflict

Use this order:

1. explicit instruction in the current task;
2. approved PRD;
3. approved technical design;
4. approved database/ERD design;
5. this `AGENTS.md`;
6. existing implementation conventions.

If two approved documents materially conflict, **do not silently choose one**. Record the conflict in the task summary and use the smallest reversible implementation until clarified.

Do not invent major product behavior that is absent from the approved documents.

---

## 3. V1 scope guardrails

### In scope

- multi-tenant SaaS;
- authentication and RBAC;
- freight-forwarder users and customer users;
- customer companies / contacts;
- freight rates;
- Excel rate import;
- basic customer markup rules;
- quotes and PDF quote generation;
- booking workflow;
- shipment workflow;
- containers;
- milestone-based tracking;
- document management;
- customer-visible document controls;
- invoice / receivable display;
- email notifications;
- audit log;
- white-label branding;
- custom-domain-ready tenant model;
- basic dashboards;
- API documentation;
- automated testing;
- production-ready deployment baseline.

### Explicitly out of scope for V1

Do **not** add any of the following unless a later explicit requirement changes scope:

- shipping-line booking EDI;
- shipping-line rate APIs;
- automatic SO retrieval;
- customs declaration;
- AMS / ISF / ENS / AFR;
- China manifest integrations;
- full accounting / general ledger;
- AP / supplier settlement;
- automatic bank reconciliation;
- Kingdee / Yonyou deep accounting integration;
- AIS tracking;
- global real-time container tracking;
- OCR;
- AI document processing;
- AI quoting;
- AI customer service;
- Kafka;
- Kubernetes;
- microservices;
- GraphQL;
- Elasticsearch;
- event sourcing;
- full CQRS architecture.

Do not “future-proof” V1 by implementing speculative systems that are not required.

---

## 4. Required technical direction

Unless the repository already contains an approved equivalent implementation, use:

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Table
- React Hook Form
- Zod

### Backend

- NestJS
- TypeScript
- REST
- OpenAPI / Swagger

### Data

- PostgreSQL
- Prisma ORM
- Redis

### Background jobs

- BullMQ
- Redis-backed workers

### Files

- S3-compatible object storage

### Tooling / infrastructure

- Docker
- Nginx
- GitHub Actions
- Jest
- Supertest
- Playwright
- Sentry or an equivalent approved error-monitoring integration
- structured application logging

### Architecture

Use a **modular monolith**.

Do not split business modules into independent deployable microservices during V1.

---

## 5. Preferred repository structure

If the repository is new, prefer:

```text
.
├─ apps/
│  ├─ web/                 # Next.js customer portal + admin UI
│  ├─ api/                 # NestJS API
│  └─ worker/              # BullMQ workers
├─ packages/
│  ├─ ui/
│  ├─ types/
│  ├─ validation/
│  └─ config/
├─ prisma/
│  ├─ schema.prisma
│  └─ migrations/
├─ docs/
├─ docker/
├─ .github/
│  └─ workflows/
├─ .env.example
└─ AGENTS.md
```

Use a pnpm workspace / monorepo approach if not already established.

Do not reorganize a working repository purely for aesthetics.

---

## 6. Backend module boundaries

Prefer modules aligned to business domains:

```text
auth
tenants
users
roles-permissions
customers
rates
quotes
bookings
shipments
containers
tracking
documents
invoices
notifications
audit
branding
health
```

Future integrations belong under a clear integration boundary, for example:

```text
integrations/
  tracking/
  shipping-lines/
  accounting/
```

Do not let controller code contain core business rules.

Business logic belongs in services/domain-layer code.

---

## 7. Multi-tenancy is a hard security boundary

Tenant isolation is one of the highest-priority requirements in this system.

### Mandatory rules

- Every tenant-owned core business record must have a `tenant_id` unless the data model explicitly identifies it as platform-global.
- Never rely on frontend filtering for tenant isolation.
- Every backend query that accesses tenant-owned data must be tenant-scoped.
- IDs supplied by clients are never sufficient authorization.
- A valid object ID from Tenant A must never allow access from Tenant B.
- Background jobs must carry and validate tenant context.
- File access must validate tenant ownership before issuing a signed URL or streaming a file.
- Audit records must capture tenant context.

### Testing requirement

At least one automated integration/E2E test must prove cross-tenant access fails for each sensitive domain class:

- customer;
- rate;
- quote;
- booking;
- shipment;
- document;
- invoice.

If PostgreSQL Row-Level Security is implemented, it is defense in depth, not a replacement for application-layer tenant scoping. Do not introduce RLS without a correct and testable database-session strategy.

---

## 8. Authorization and roles

V1 roles include, at minimum:

- `SUPER_ADMIN`
- `TENANT_ADMIN`
- `SALES`
- `OPERATION`
- `FINANCE`
- `CUSTOMER_ADMIN`
- `CUSTOMER_USER`

Authorization must be enforced on the server.

Hiding a UI button is not authorization.

Prefer explicit permission checks for sensitive operations, especially:

- rate edits;
- sales-price changes;
- booking approval/rejection;
- shipment status updates;
- document visibility;
- invoice changes;
- user/role management;
- tenant configuration.

Do not allow a customer user to access another customer company inside the same tenant unless the data model explicitly grants it.

---

## 9. Core domain model

Keep these concepts distinct:

- Tenant
- User
- CustomerCompany
- CustomerContact
- Rate
- Quote
- Booking
- Shipment
- Container
- TrackingEvent
- Document
- Invoice
- Notification
- AuditLog

Do not collapse `Booking`, `Shipment`, `Container`, `BL`, and `Invoice` into a generic `Order`.

Important relationships include:

- Tenant 1:N Users
- Tenant 1:N CustomerCompanies
- CustomerCompany 1:N CustomerContacts
- CustomerCompany 1:N Quotes
- Quote 1:N Bookings, subject to approved business rules
- Booking 1:1/N Shipments, subject to approved business rules
- Shipment 1:N Containers
- Shipment 1:N TrackingEvents
- Shipment 1:N Documents
- Shipment 1:N Invoices

Follow the approved ERD if it is more specific.

---

## 10. State machines are server-side domain rules

Do not implement workflow transitions as arbitrary string updates.

Examples:

### Quote

Typical states:

```text
DRAFT
SENT
VIEWED
ACCEPTED
BOOKED
EXPIRED
REJECTED
CANCELLED
```

### Booking

Typical states:

```text
DRAFT
SUBMITTED
UNDER_REVIEW
CONFIRMED
SO_RELEASED
REJECTED
CANCELLED
```

### Invoice

Typical states:

```text
DRAFT
ISSUED
CUSTOMER_CONFIRMED
PAID
```

Exact enums must follow the approved design documents.

### Rules

- State transitions must be validated in backend domain/service code.
- Illegal transitions must return a clear domain error.
- Transition code should be unit tested.
- Sensitive transitions should write an audit record.
- Do not expose generic “set status” endpoints unless explicitly justified.

Prefer action endpoints/commands when semantics matter, for example:

```text
POST /bookings/:id/submit
POST /bookings/:id/confirm
POST /bookings/:id/cancel
```

rather than blindly accepting any status value.

---

## 11. Money, currency, dates, and identifiers

### Money

Never use JavaScript floating-point numbers for authoritative monetary calculations.

Use PostgreSQL `NUMERIC/DECIMAL` and Prisma `Decimal` for:

- freight rates;
- surcharges;
- quote amounts;
- invoice amounts;
- markups.

### Currency

Use ISO-style three-letter currency codes where possible, for example:

- USD
- CNY
- EUR

Do not silently convert currencies.

### Dates and time

- Persist actual timestamps in UTC.
- Preserve business dates such as rate effective/expiry dates explicitly.
- Do not assume server local time.
- Clearly distinguish ETD/ETA planned times from ATD/ATA actual times.

### Business identifiers

Use immutable database primary keys separately from human-readable business numbers.

Examples:

```text
QT202609000123
BKG202609000123
SHP202609000123
INV202609000123
```

Human-readable numbers need tenant-aware uniqueness and concurrency-safe generation.

Do not generate authoritative sequence numbers with unsafe `MAX(...) + 1`.

---

## 12. Rate and pricing rules

V1 pricing must remain intentionally simple.

Support only approved V1 rules such as:

- base rate;
- fixed customer markup;
- controlled sales manual override.

When a sales user manually changes a sell price, preserve:

- original price;
- changed price;
- operator;
- timestamp;
- reason when required by the PRD.

Do not build a general-purpose pricing rules engine in V1.

Rate imports must:

- validate required columns;
- validate currency and numeric values;
- validate validity dates;
- return useful row-level errors;
- avoid partially corrupting production data;
- run asynchronously when file size justifies it;
- produce an import summary.

---

## 13. Documents and object storage

Do not store uploaded business documents as long-term local-disk files.

Use S3-compatible storage.

The database should store metadata such as:

- tenant;
- shipment / booking relation;
- document type;
- object key;
- original filename;
- MIME type;
- size;
- version;
- uploaded by;
- created at;
- customer visibility.

`customer_visible` (or the approved equivalent) is a security-sensitive field.

Internal documents must not become customer-visible by default.

Prefer signed URLs with short expiry or an authenticated backend download path.

Never expose raw storage credentials.

---

## 14. Notifications and background work

Do not perform expensive or failure-prone side effects synchronously inside critical HTTP requests when they can be queued safely.

Use BullMQ for appropriate jobs such as:

- email delivery;
- quote PDF generation;
- Excel imports;
- notification fan-out;
- future tracking syncs.

Prefer an event-oriented internal flow:

```text
Business transaction
→ domain/application event
→ queue
→ worker
→ email / PDF / external side effect
```

V1 notification transport is primarily email unless the requirements explicitly add another channel.

Jobs must be:

- retry-safe;
- idempotent where duplicate execution is possible;
- observable;
- associated with tenant context.

---

## 15. API conventions

Use REST under a versioned prefix such as:

```text
/api/v1
```

Examples:

```text
GET    /api/v1/rates
POST   /api/v1/quotes
GET    /api/v1/quotes/:id
POST   /api/v1/bookings
GET    /api/v1/bookings/:id
GET    /api/v1/shipments
GET    /api/v1/shipments/:id
POST   /api/v1/shipments/:id/tracking-events
POST   /api/v1/shipments/:id/documents
```

Requirements:

- Swagger/OpenAPI coverage for public/internal REST endpoints;
- DTO validation;
- stable error shape;
- pagination for collection endpoints;
- server-side filtering and sorting for large business tables;
- explicit authorization;
- no leaking internal stack traces to clients.

Do not add GraphQL in V1.

---

## 16. Validation

Validate at multiple layers:

1. request DTO/schema validation;
2. authorization;
3. domain/business rules;
4. database constraints.

Frontend validation improves UX but is not authoritative.

Do not assume values from the browser are trustworthy.

Use Zod on the frontend where appropriate and NestJS validation on the backend.

---

## 17. Database rules

Use:

- foreign keys;
- unique constraints;
- indexes;
- check constraints where practical;
- transactions for multi-write business operations.

Index common filters such as:

- `tenant_id`;
- `customer_company_id`;
- business number;
- status;
- ETD/ETA;
- validity dates;
- created timestamp.

Prefer composite indexes beginning with `tenant_id` for tenant-scoped access patterns when justified.

Do not add indexes blindly; explain important indexes in migration or design notes.

### Migrations

- Prisma migrations are source controlled.
- Never edit production data manually as part of normal feature delivery.
- Never modify an already-applied shared migration.
- Add a new migration.
- Destructive migrations require an explicit migration plan.
- Seed/demo data must be clearly separated from production data.

---

## 18. Audit logging

Audit sensitive operations including, at minimum:

- user and role changes;
- customer changes;
- rate changes;
- quote price changes;
- booking state transitions;
- shipment state changes;
- document visibility changes;
- invoice changes;
- tenant settings changes.

Capture enough information to answer:

- who;
- when;
- tenant;
- object;
- action;
- before/after for sensitive mutations where appropriate.

Avoid placing passwords, secrets, tokens, or unnecessary sensitive document contents in audit logs.

---

## 19. Security baseline

Mandatory:

- HTTPS in production;
- secure password hashing;
- authenticated API;
- RBAC / permission checks;
- tenant isolation;
- login attempt throttling;
- request rate limiting where appropriate;
- secure cookie/session/JWT handling;
- CSRF protection when required by the chosen auth approach;
- input validation;
- file type/size validation;
- authorization before file access;
- no secrets in source control;
- environment-based configuration;
- audit logging;
- secure error handling;
- dependency vulnerability awareness.

Do not log:

- passwords;
- raw access tokens;
- refresh tokens;
- storage secrets;
- database passwords.

Provide/update `.env.example` for required variables without real secret values.

---

## 20. Frontend rules

The customer portal and internal admin may live in the same Next.js application unless the approved architecture changes.

Prefer clear route separation, for example:

```text
/app
  /(auth)
  /portal
    /dashboard
    /rates
    /quotes
    /bookings
    /shipments
    /documents
    /billing
  /admin
    /dashboard
    /customers
    /rates
    /quotes
    /bookings
    /shipments
    /billing
    /users
    /settings
```

Requirements:

- responsive enough for normal laptop/tablet/mobile browser use;
- accessible forms and tables;
- loading, empty, error, and permission-denied states;
- server-driven authorization;
- no duplicated business-rule implementations that can drift from backend logic;
- reuse shared components where appropriate;
- large tables must support pagination/filtering instead of loading unbounded data.

Do not spend V1 effort on decorative animations.

---

## 21. Error handling and observability

Use structured logs.

Every server error should be traceable using a request/correlation ID where practical.

Monitor:

- API failures;
- worker failures;
- queue retries;
- unhandled exceptions;
- database connectivity;
- object-storage failures.

Health endpoints should cover at least application liveness and critical dependency readiness.

Do not silently swallow failed jobs or external-service errors.

---

## 22. Testing requirements

No feature is complete merely because it works manually.

### Unit tests

Prioritize:

- state transition rules;
- pricing/markup calculations;
- permission checks;
- number generation helpers;
- validators.

### Integration tests

Prioritize:

- authentication;
- tenant isolation;
- Prisma/database behavior;
- transactions;
- rate import;
- file metadata authorization;
- queue enqueue behavior.

### E2E tests

Maintain a golden-path test covering the core business flow:

```text
login
→ search rate
→ create quote
→ accept quote
→ create booking
→ internal booking confirmation
→ upload SO
→ create shipment
→ add container
→ add tracking event
→ customer views tracking
→ upload BL
→ customer downloads BL
→ create invoice
→ customer views invoice
```

Also test critical negative paths:

- unauthorized role;
- cross-tenant access;
- illegal state transition;
- expired quote;
- hidden document;
- invalid rate import;
- customer accessing another customer company.

---

## 23. Definition of Done

A task is done only when all applicable items are true:

- implementation matches approved V1 scope;
- TypeScript compiles;
- lint passes;
- relevant unit/integration/E2E tests pass;
- new API endpoints are documented;
- database migration is included when required;
- tenant isolation is preserved;
- authorization is enforced server-side;
- error/loading/empty states are handled;
- audit logging is added for sensitive changes;
- no secrets are committed;
- no unrelated refactors are mixed into the task;
- documentation is updated when behavior or setup changes.

Do not declare completion if tests are failing.

If a test cannot run because the environment lacks a dependency, state that precisely.

---

## 24. Codex task execution protocol

For each non-trivial development task:

### Step 1 — inspect

Before editing:

- inspect the relevant source files;
- inspect Prisma schema/migrations when data is involved;
- inspect existing tests;
- inspect the relevant project documentation.

Do not assume file names or architecture from memory.

### Step 2 — define the change

State internally or in the working notes:

- required behavior;
- affected modules;
- data changes;
- authorization impact;
- tenant-isolation impact;
- tests required.

### Step 3 — implement the smallest coherent change

Prefer minimal, focused edits.

Do not refactor unrelated code while implementing a feature unless the existing code blocks correctness.

### Step 4 — test

Run the narrowest useful checks first, then broader checks as appropriate.

Examples:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```

Use repository scripts rather than inventing parallel commands when scripts already exist.

### Step 5 — inspect diff

Before finishing:

- inspect the git diff;
- remove debug code;
- remove temporary files;
- confirm no secret was added;
- confirm no unrelated file changed accidentally.

### Step 6 — report

Final task summary should include:

- what changed;
- important design decisions;
- migrations created;
- tests run and results;
- remaining risks/TODOs;
- any requirement ambiguity encountered.

Do not claim code was tested if the tests were not run.

---

## 25. Development sequence

Unless the repository has already progressed further, implement in this order.

### Phase 0 — project foundation

- workspace;
- app skeletons;
- environment configuration;
- Docker baseline;
- PostgreSQL;
- Prisma;
- Redis;
- object-storage abstraction;
- CI;
- test baseline.

### Phase 1 — SaaS/security foundation

- Tenant;
- User;
- Auth;
- RBAC;
- tenant context;
- CustomerCompany;
- CustomerContact;
- AuditLog;
- file-storage metadata foundation.

### Phase 2 — Rate + Quote

- Rate schema;
- rate CRUD;
- Excel import;
- rate search;
- simple markup;
- Quote;
- quote workflow;
- PDF generation.

### Phase 3 — Booking

- booking creation from quote;
- booking form;
- submission;
- internal review;
- confirmation/rejection/cancellation;
- SO upload.

### Phase 4 — Shipment + Container + Tracking + Documents

- shipment;
- container;
- tracking events;
- timeline;
- document versions;
- visibility controls.

### Phase 5 — Invoice + Notifications + Branding

- invoice display;
- customer confirmation;
- email notifications;
- tenant logo/branding;
- white-label-ready configuration.

### Phase 6 — pilot hardening

Only after real pilot feedback:

- bugs;
- missing validation;
- permission gaps;
- workflow gaps;
- data-quality fixes;
- UX blockers;
- performance issues.

Do not use pilot phase as justification for expanding into full ERP scope.

---

## 26. First production vertical slice

Before attempting broad feature completeness, prove this end-to-end flow with real persistence and authorization:

```text
create tenant
→ create tenant admin
→ create customer company
→ create customer user
→ import/create a rate
→ customer searches rate
→ create quote
→ customer accepts quote
→ create booking
→ operator confirms booking
→ upload SO
→ create shipment
→ add container
→ add tracking event
→ customer views tracking
→ upload customer-visible BL
→ customer downloads BL
→ create invoice
→ customer views invoice
```

This is the primary V1 value chain.

A feature that does not support or secure this chain is lower priority unless the PRD explicitly says otherwise.

---

## 27. Data and API backward compatibility

During pre-pilot development, breaking changes are acceptable only when they simplify the approved model and all call sites/migrations/tests are updated together.

After pilot customers use production data:

- avoid destructive API changes;
- avoid renaming persisted fields without a migration plan;
- avoid deleting enum values used by historical records;
- add compatibility/migration steps.

Treat customer production data as durable.

---

## 28. Performance expectations

V1 is not designed for hyperscale, but inefficient unbounded behavior is unacceptable.

Targets from the approved design should be respected, typically:

- normal interactive pages: around 1 second when practical;
- complex searches: within a few seconds;
- large imports: asynchronous;
- lists: paginated;
- files: streamed/signed, not loaded fully into API memory unnecessarily.

Do not add distributed-systems complexity to solve hypothetical scale.

---

## 29. No speculative abstraction

Avoid generic “platform engines” unless current requirements need them.

Examples of things **not** to build in V1 without explicit need:

- generic workflow engine;
- generic rules engine;
- generic CMS;
- generic form builder;
- generic low-code module;
- universal integration bus;
- universal accounting engine.

Prefer clear domain code that can be refactored after real usage proves the abstraction.

---

## 30. Change discipline

Do not:

- rewrite large working modules because another style is preferred;
- upgrade major framework versions without a task requiring it;
- replace PostgreSQL/Prisma/NestJS/Next.js because of personal preference;
- introduce new infrastructure without a measurable requirement;
- commit generated build outputs unless the repository expects them;
- commit `.env` files with secrets;
- disable failing tests to get green CI.

If the existing implementation deviates from this file but is already approved and working, follow the existing architecture unless the task is specifically to change it.

---

## 31. Naming and code quality

Use domain terminology consistently:

- `rate`
- `quote`
- `booking`
- `shipment`
- `container`
- `trackingEvent`
- `document`
- `invoice`

Avoid vague names such as:

- `orderData`
- `bizInfo`
- `commonRecord`
- `miscService`

Prefer explicit types over `any`.

Avoid large god services/controllers.

Keep business rules discoverable and testable.

Comments should explain **why**, not restate obvious code.

---

## 32. Definition of project success

V1 is successful when real freight forwarders can use the system with real customers to complete the core flow without developer database intervention:

**Rate → Quote → Booking → Shipment → Tracking → Document → Invoice**

Technical elegance is secondary to:

1. correct business behavior;
2. tenant security;
3. data integrity;
4. maintainability;
5. testability;
6. predictable delivery.

When forced to choose, prefer the simplest design that satisfies those six goals and the approved V1 requirements.
