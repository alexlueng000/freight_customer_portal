CREATE TYPE "RateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'INACTIVE');
CREATE TYPE "ChargeBasis" AS ENUM ('PER_CONTAINER', 'PER_BL', 'PER_SHIPMENT');

CREATE TABLE "Rate" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "rateNo" VARCHAR(50) NOT NULL,
  "polCode" VARCHAR(10) NOT NULL, "polName" VARCHAR(150) NOT NULL,
  "podCode" VARCHAR(10) NOT NULL, "podName" VARCHAR(150) NOT NULL,
  "carrierCode" VARCHAR(20) NOT NULL, "serviceName" VARCHAR(150),
  "effectiveDate" DATE NOT NULL, "expiryDate" DATE NOT NULL, "etd" TIMESTAMPTZ(3),
  "transitDays" INTEGER, "supplierName" VARCHAR(200), "contractNo" VARCHAR(100),
  "currency" VARCHAR(3) NOT NULL, "status" "RateStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT, "updatedById" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Rate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Rate_validity_check" CHECK ("effectiveDate" <= "expiryDate"),
  CONSTRAINT "Rate_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "Rate_transitDays_check" CHECK ("transitDays" IS NULL OR "transitDays" >= 0)
);

CREATE TABLE "RatePrice" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "rateId" TEXT NOT NULL,
  "containerType" VARCHAR(20) NOT NULL, "costAmount" DECIMAL(18,4) NOT NULL,
  "sellAmount" DECIMAL(18,4), "currency" VARCHAR(3) NOT NULL, "remark" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "RatePrice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RatePrice_amount_check" CHECK ("costAmount" >= 0 AND ("sellAmount" IS NULL OR "sellAmount" >= 0)),
  CONSTRAINT "RatePrice_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "RateCharge" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "rateId" TEXT NOT NULL,
  "chargeCode" VARCHAR(30) NOT NULL, "chargeName" VARCHAR(150) NOT NULL,
  "chargeBasis" "ChargeBasis" NOT NULL, "containerType" VARCHAR(20),
  "amount" DECIMAL(18,4) NOT NULL, "currency" VARCHAR(3) NOT NULL,
  "isIncluded" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "RateCharge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RateCharge_amount_check" CHECK ("amount" >= 0),
  CONSTRAINT "RateCharge_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "RateCharge_basis_container_check" CHECK (("chargeBasis" = 'PER_CONTAINER' AND "containerType" IS NOT NULL) OR ("chargeBasis" <> 'PER_CONTAINER' AND "containerType" IS NULL))
);

CREATE UNIQUE INDEX "Rate_tenantId_rateNo_key" ON "Rate"("tenantId", "rateNo");
CREATE INDEX "Rate_tenantId_polCode_podCode_status_idx" ON "Rate"("tenantId", "polCode", "podCode", "status");
CREATE INDEX "Rate_tenantId_carrierCode_effectiveDate_expiryDate_idx" ON "Rate"("tenantId", "carrierCode", "effectiveDate", "expiryDate");
CREATE INDEX "Rate_tenantId_expiryDate_idx" ON "Rate"("tenantId", "expiryDate");
CREATE UNIQUE INDEX "RatePrice_rateId_containerType_key" ON "RatePrice"("rateId", "containerType");
CREATE INDEX "RatePrice_tenantId_rateId_idx" ON "RatePrice"("tenantId", "rateId");
CREATE INDEX "RateCharge_tenantId_rateId_idx" ON "RateCharge"("tenantId", "rateId");
CREATE INDEX "RateCharge_tenantId_chargeCode_idx" ON "RateCharge"("tenantId", "chargeCode");

ALTER TABLE "Rate" ADD CONSTRAINT "Rate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RatePrice" ADD CONSTRAINT "RatePrice_rateId_fkey" FOREIGN KEY ("rateId") REFERENCES "Rate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RateCharge" ADD CONSTRAINT "RateCharge_rateId_fkey" FOREIGN KEY ("rateId") REFERENCES "Rate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION "enforce_rate_tenant_consistency"() RETURNS TRIGGER AS $$
DECLARE related_tenant_id TEXT;
BEGIN
  SELECT "tenantId" INTO related_tenant_id FROM "Rate" WHERE "id" = NEW."rateId";
  IF related_tenant_id IS NULL OR related_tenant_id <> NEW."tenantId" THEN
    RAISE EXCEPTION 'rate child tenant mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RatePrice_tenant_consistency" BEFORE INSERT OR UPDATE ON "RatePrice" FOR EACH ROW EXECUTE FUNCTION "enforce_rate_tenant_consistency"();
CREATE TRIGGER "RateCharge_tenant_consistency" BEFORE INSERT OR UPDATE ON "RateCharge" FOR EACH ROW EXECUTE FUNCTION "enforce_rate_tenant_consistency"();
