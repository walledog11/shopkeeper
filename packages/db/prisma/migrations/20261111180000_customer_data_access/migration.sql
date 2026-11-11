-- Who read protected customer data, as Shopify's protected customer data
-- requirements ask (the CustomerDataAccess model). Hand-written and additive: a
-- new table nothing reads until the code that writes it ships, and every write
-- is best-effort, so code that runs ahead of this migration loses access
-- records and nothing else.

CREATE TABLE "customer_data_access" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_type" VARCHAR(16) NOT NULL,
    "actor_id" VARCHAR(255) NOT NULL,
    "resource" VARCHAR(32) NOT NULL,
    "resource_id" VARCHAR(64) NOT NULL DEFAULT '',
    "accessed_hour" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_data_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_data_access_once_per_hour_key"
  ON "customer_data_access"("organization_id", "actor_id", "resource", "resource_id", "accessed_hour");
CREATE INDEX "customer_data_access_accessed_hour_idx" ON "customer_data_access"("accessed_hour");

ALTER TABLE "customer_data_access"
  ADD CONSTRAINT "customer_data_access_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
