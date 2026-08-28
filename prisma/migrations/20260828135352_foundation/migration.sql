-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'LOCKED', 'DISABLED');

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('INTERNAL', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('SUPER_ADMIN', 'TENANT_ADMIN', 'SALES', 'OPERATION', 'FINANCE', 'CUSTOMER_ADMIN', 'CUSTOMER_USER');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "MarkupType" AS ENUM ('NONE', 'FIXED', 'PERCENT');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL',
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'Asia/Shanghai',
    "defaultCurrency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "brandName" VARCHAR(200),
    "logoUrl" VARCHAR(1000),
    "customDomain" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerCompanyId" TEXT,
    "email" VARCHAR(320) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "displayName" VARCHAR(150) NOT NULL,
    "userType" "UserType" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" "RoleCode" NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "CustomerCompany" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "shortName" VARCHAR(100),
    "countryCode" VARCHAR(2),
    "taxId" VARCHAR(100),
    "creditLimit" DECIMAL(18,4),
    "paymentTermDays" INTEGER,
    "defaultMarkupType" "MarkupType" NOT NULL DEFAULT 'NONE',
    "defaultMarkupValue" DECIMAL(18,4),
    "salesOwnerId" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerCompanyId" TEXT NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(50),
    "roleTitle" VARCHAR(100),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isBookingContact" BOOLEAN NOT NULL DEFAULT false,
    "isDocumentContact" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "entityType" VARCHAR(100) NOT NULL,
    "entityId" VARCHAR(100) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "beforeData" JSONB,
    "afterData" JSONB,
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessNumberCounter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "yearMonth" VARCHAR(6) NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BusinessNumberCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_code_key" ON "Tenant"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_customDomain_key" ON "Tenant"("customDomain");

-- CreateIndex
CREATE INDEX "User_tenantId_status_idx" ON "User"("tenantId", "status");

-- CreateIndex
CREATE INDEX "User_tenantId_customerCompanyId_idx" ON "User"("tenantId", "customerCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Role_tenantId_name_idx" ON "Role"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_code_key" ON "Role"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE INDEX "CustomerCompany_tenantId_name_idx" ON "CustomerCompany"("tenantId", "name");

-- CreateIndex
CREATE INDEX "CustomerCompany_tenantId_salesOwnerId_idx" ON "CustomerCompany"("tenantId", "salesOwnerId");

-- CreateIndex
CREATE INDEX "CustomerCompany_tenantId_status_idx" ON "CustomerCompany"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCompany_tenantId_code_key" ON "CustomerCompany"("tenantId", "code");

-- CreateIndex
CREATE INDEX "CustomerContact_tenantId_customerCompanyId_idx" ON "CustomerContact"("tenantId", "customerCompanyId");

-- CreateIndex
CREATE INDEX "CustomerContact_tenantId_email_idx" ON "CustomerContact"("tenantId", "email");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entityType_entityId_createdAt_idx" ON "AuditLog"("tenantId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_actorUserId_createdAt_idx" ON "AuditLog"("tenantId", "actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessNumberCounter_tenantId_type_idx" ON "BusinessNumberCounter"("tenantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessNumberCounter_tenantId_type_yearMonth_key" ON "BusinessNumberCounter"("tenantId", "type", "yearMonth");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_customerCompanyId_fkey" FOREIGN KEY ("customerCompanyId") REFERENCES "CustomerCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCompany" ADD CONSTRAINT "CustomerCompany_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCompany" ADD CONSTRAINT "CustomerCompany_salesOwnerId_fkey" FOREIGN KEY ("salesOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_customerCompanyId_fkey" FOREIGN KEY ("customerCompanyId") REFERENCES "CustomerCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessNumberCounter" ADD CONSTRAINT "BusinessNumberCounter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Business invariants that Prisma cannot express directly.
ALTER TABLE "Tenant"
  ADD CONSTRAINT "Tenant_defaultCurrency_format_check"
  CHECK ("defaultCurrency" ~ '^[A-Z]{3}$');

ALTER TABLE "User"
  ADD CONSTRAINT "User_customer_scope_check"
  CHECK (
    ("userType" = 'CUSTOMER' AND "customerCompanyId" IS NOT NULL)
    OR ("userType" = 'INTERNAL' AND "customerCompanyId" IS NULL)
  );

ALTER TABLE "CustomerCompany"
  ADD CONSTRAINT "CustomerCompany_countryCode_format_check"
  CHECK ("countryCode" IS NULL OR "countryCode" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "CustomerCompany_creditLimit_check"
  CHECK ("creditLimit" IS NULL OR "creditLimit" >= 0),
  ADD CONSTRAINT "CustomerCompany_paymentTermDays_check"
  CHECK ("paymentTermDays" IS NULL OR "paymentTermDays" >= 0),
  ADD CONSTRAINT "CustomerCompany_defaultMarkupValue_check"
  CHECK ("defaultMarkupValue" IS NULL OR "defaultMarkupValue" >= 0),
  ADD CONSTRAINT "CustomerCompany_markup_consistency_check"
  CHECK (
    ("defaultMarkupType" = 'NONE' AND "defaultMarkupValue" IS NULL)
    OR ("defaultMarkupType" <> 'NONE' AND "defaultMarkupValue" IS NOT NULL)
  );

ALTER TABLE "BusinessNumberCounter"
  ADD CONSTRAINT "BusinessNumberCounter_yearMonth_format_check"
  CHECK ("yearMonth" ~ '^[0-9]{6}$'),
  ADD CONSTRAINT "BusinessNumberCounter_value_check"
  CHECK ("value" >= 0);

-- Email comparison is case-insensitive within a tenant while preserving the
-- original spelling for display.
CREATE UNIQUE INDEX "User_tenantId_email_ci_key"
  ON "User" ("tenantId", LOWER("email"));

-- These triggers are database-level defense in depth. Application services
-- must still apply tenant scope to every query and mutation.
CREATE FUNCTION "enforce_foundation_tenant_consistency"()
RETURNS TRIGGER AS $$
DECLARE
  related_tenant_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'User' AND NEW."customerCompanyId" IS NOT NULL THEN
    SELECT "tenantId" INTO related_tenant_id
    FROM "CustomerCompany" WHERE "id" = NEW."customerCompanyId";
  ELSIF TG_TABLE_NAME = 'CustomerCompany' AND NEW."salesOwnerId" IS NOT NULL THEN
    SELECT "tenantId" INTO related_tenant_id
    FROM "User" WHERE "id" = NEW."salesOwnerId";
  ELSIF TG_TABLE_NAME = 'CustomerContact' THEN
    SELECT "tenantId" INTO related_tenant_id
    FROM "CustomerCompany" WHERE "id" = NEW."customerCompanyId";
  ELSIF TG_TABLE_NAME = 'AuditLog' AND NEW."actorUserId" IS NOT NULL THEN
    SELECT "tenantId" INTO related_tenant_id
    FROM "User" WHERE "id" = NEW."actorUserId";
  ELSE
    RETURN NEW;
  END IF;

  IF related_tenant_id IS DISTINCT FROM NEW."tenantId" THEN
    RAISE EXCEPTION 'Cross-tenant reference rejected for %', TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "User_tenant_consistency"
BEFORE INSERT OR UPDATE ON "User"
FOR EACH ROW EXECUTE FUNCTION "enforce_foundation_tenant_consistency"();

CREATE TRIGGER "CustomerCompany_tenant_consistency"
BEFORE INSERT OR UPDATE ON "CustomerCompany"
FOR EACH ROW EXECUTE FUNCTION "enforce_foundation_tenant_consistency"();

CREATE TRIGGER "CustomerContact_tenant_consistency"
BEFORE INSERT OR UPDATE ON "CustomerContact"
FOR EACH ROW EXECUTE FUNCTION "enforce_foundation_tenant_consistency"();

CREATE TRIGGER "AuditLog_tenant_consistency"
BEFORE INSERT OR UPDATE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION "enforce_foundation_tenant_consistency"();

CREATE FUNCTION "enforce_user_role_tenant_consistency"()
RETURNS TRIGGER AS $$
DECLARE
  user_tenant_id TEXT;
  role_tenant_id TEXT;
  assigner_tenant_id TEXT;
BEGIN
  SELECT "tenantId" INTO user_tenant_id FROM "User" WHERE "id" = NEW."userId";
  SELECT "tenantId" INTO role_tenant_id FROM "Role" WHERE "id" = NEW."roleId";

  IF user_tenant_id IS DISTINCT FROM role_tenant_id THEN
    RAISE EXCEPTION 'Cross-tenant role assignment rejected'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."assignedById" IS NOT NULL THEN
    SELECT "tenantId" INTO assigner_tenant_id
    FROM "User" WHERE "id" = NEW."assignedById";
    IF assigner_tenant_id IS DISTINCT FROM user_tenant_id THEN
      RAISE EXCEPTION 'Cross-tenant role assigner rejected'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UserRole_tenant_consistency"
BEFORE INSERT OR UPDATE ON "UserRole"
FOR EACH ROW EXECUTE FUNCTION "enforce_user_role_tenant_consistency"();
