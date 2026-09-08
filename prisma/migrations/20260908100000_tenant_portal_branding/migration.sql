ALTER TABLE "Tenant"
ADD COLUMN "portalSlug" VARCHAR(63),
ADD COLUMN "primaryBrandColor" VARCHAR(7),
ADD COLUMN "heroTitle" VARCHAR(200),
ADD COLUMN "heroSubtitle" VARCHAR(500),
ADD COLUMN "phone" VARCHAR(50),
ADD COLUMN "email" VARCHAR(320),
ADD COLUMN "website" VARCHAR(1000),
ADD COLUMN "address" VARCHAR(500),
ADD COLUMN "wechat" VARCHAR(100),
ADD COLUMN "whatsapp" VARCHAR(100),
ADD COLUMN "serviceTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE UNIQUE INDEX "Tenant_portalSlug_key" ON "Tenant"("portalSlug");

ALTER TABLE "Tenant"
ADD CONSTRAINT "Tenant_portalSlug_format_check"
CHECK (
  "portalSlug" IS NULL OR (
    "portalSlug" ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
    AND "portalSlug" NOT IN ('admin', 'api', 'www', 'portal')
  )
),
ADD CONSTRAINT "Tenant_primaryBrandColor_format_check"
CHECK ("primaryBrandColor" IS NULL OR "primaryBrandColor" ~ '^#[0-9A-Fa-f]{6}$');
