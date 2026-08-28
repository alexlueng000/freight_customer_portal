-- PL/pgSQL records expose different fields for each trigger table. Keep field
-- access inside table-specific branches so PostgreSQL never resolves a field
-- that is absent from the current NEW record.
CREATE OR REPLACE FUNCTION "enforce_foundation_tenant_consistency"()
RETURNS TRIGGER AS $$
DECLARE
  related_tenant_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'User' THEN
    IF NEW."customerCompanyId" IS NULL THEN
      RETURN NEW;
    END IF;
    SELECT "tenantId" INTO related_tenant_id
    FROM "CustomerCompany" WHERE "id" = NEW."customerCompanyId";
  ELSIF TG_TABLE_NAME = 'CustomerCompany' THEN
    IF NEW."salesOwnerId" IS NULL THEN
      RETURN NEW;
    END IF;
    SELECT "tenantId" INTO related_tenant_id
    FROM "User" WHERE "id" = NEW."salesOwnerId";
  ELSIF TG_TABLE_NAME = 'CustomerContact' THEN
    SELECT "tenantId" INTO related_tenant_id
    FROM "CustomerCompany" WHERE "id" = NEW."customerCompanyId";
  ELSIF TG_TABLE_NAME = 'AuditLog' THEN
    IF NEW."actorUserId" IS NULL THEN
      RETURN NEW;
    END IF;
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
