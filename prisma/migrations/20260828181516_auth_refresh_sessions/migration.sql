-- CreateTable
CREATE TABLE "RefreshSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" VARCHAR(50) NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedReason" VARCHAR(100),
    "replacedById" TEXT,
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(3),

    CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_tokenHash_key" ON "RefreshSession"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshSession_tenantId_userId_expiresAt_idx" ON "RefreshSession"("tenantId", "userId", "expiresAt");

-- CreateIndex
CREATE INDEX "RefreshSession_tenantId_familyId_idx" ON "RefreshSession"("tenantId", "familyId");

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "RefreshSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RefreshSession"
  ADD CONSTRAINT "RefreshSession_expiry_check"
  CHECK ("expiresAt" > "createdAt"),
  ADD CONSTRAINT "RefreshSession_revocation_consistency_check"
  CHECK (
    ("revokedAt" IS NULL AND "revokedReason" IS NULL AND "replacedById" IS NULL)
    OR ("revokedAt" IS NOT NULL)
  );

CREATE FUNCTION "enforce_refresh_session_tenant_consistency"()
RETURNS TRIGGER AS $$
DECLARE
  user_tenant_id TEXT;
BEGIN
  SELECT "tenantId" INTO user_tenant_id FROM "User" WHERE "id" = NEW."userId";
  IF user_tenant_id IS DISTINCT FROM NEW."tenantId" THEN
    RAISE EXCEPTION 'Cross-tenant refresh session rejected'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RefreshSession_tenant_consistency"
BEFORE INSERT OR UPDATE ON "RefreshSession"
FOR EACH ROW EXECUTE FUNCTION "enforce_refresh_session_tenant_consistency"();
