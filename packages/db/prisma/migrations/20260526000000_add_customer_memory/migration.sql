ALTER TABLE "customers"
  ADD COLUMN "memory" JSONB DEFAULT '{}',
  ADD COLUMN "memory_updated_at" TIMESTAMPTZ;

CREATE INDEX "customers_organization_id_memory_updated_at_idx"
  ON "customers"("organization_id", "memory_updated_at");
