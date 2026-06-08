DROP INDEX IF EXISTS "customers_organization_id_memory_updated_at_idx";

ALTER TABLE "customers"
  DROP COLUMN IF EXISTS "memory",
  DROP COLUMN IF EXISTS "memory_updated_at";
