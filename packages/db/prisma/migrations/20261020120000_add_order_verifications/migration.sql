-- Direct-message order verification (Instagram, TikTok). A sender shows they
-- know an order's email or shipping zip; gateway code compares their own
-- message with Shopify and records the result here. The model only records
-- that it asked.
--
-- HAND-WRITTEN, like every migration against this schema (see the comment on the
-- Thread model). Purely additive: a new table nothing reads until the code that
-- writes it ships. The agent's read of it fails closed to "not verified", so a
-- deploy that ran ahead of this migration plans every DM as unverified.

CREATE TYPE "OrderVerificationMethod" AS ENUM ('email', 'zip');

CREATE TABLE "order_verifications" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "integration_id" UUID NOT NULL,
  "thread_id" UUID,
  "order_name" VARCHAR(64) NOT NULL,
  "order_id" VARCHAR(64),
  "method" "OrderVerificationMethod",
  "requested_at" TIMESTAMPTZ NOT NULL,
  "asks" INTEGER NOT NULL DEFAULT 1,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "evaluated_through" TIMESTAMPTZ,
  "evaluated_through_message_id" UUID,
  "answered_message_id" UUID,
  "verified_at" TIMESTAMPTZ,
  "request_facts" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "order_verifications_pkey" PRIMARY KEY ("id"),
  -- A verified row names the order Shopify resolved and how it was shown.
  CONSTRAINT "order_verifications_verified_check" CHECK (
    "verified_at" IS NULL OR ("order_id" IS NOT NULL AND "method" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "order_verifications_organization_id_customer_id_order_name_key"
  ON "order_verifications"("organization_id", "customer_id", "order_name");
CREATE INDEX "order_verifications_organization_id_thread_id_idx"
  ON "order_verifications"("organization_id", "thread_id");
-- Supporting lookup paths for parent deletion.
CREATE INDEX "order_verifications_customer_id_organization_id_idx"
  ON "order_verifications"("customer_id", "organization_id");
CREATE INDEX "order_verifications_thread_id_organization_id_idx"
  ON "order_verifications"("thread_id", "organization_id");
CREATE INDEX "order_verifications_integration_id_organization_id_idx"
  ON "order_verifications"("integration_id", "organization_id");

ALTER TABLE "order_verifications"
  ADD CONSTRAINT "order_verifications_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_verifications"
  ADD CONSTRAINT "order_verifications_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_verifications"
  ADD CONSTRAINT "order_verifications_integration_id_fkey"
  FOREIGN KEY ("integration_id") REFERENCES "integrations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_verifications"
  ADD CONSTRAINT "order_verifications_thread_id_fkey"
  FOREIGN KEY ("thread_id") REFERENCES "threads"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Tenant-consistency foreign keys. The table is new, so these are VALID at once.
ALTER TABLE "order_verifications"
  ADD CONSTRAINT "order_verifications_tenant_customer_fkey"
  FOREIGN KEY ("organization_id", "customer_id")
  REFERENCES "customers"("organization_id", "id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "order_verifications"
  ADD CONSTRAINT "order_verifications_tenant_integration_fkey"
  FOREIGN KEY ("organization_id", "integration_id")
  REFERENCES "integrations"("organization_id", "id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "order_verifications"
  ADD CONSTRAINT "order_verifications_tenant_thread_fkey"
  FOREIGN KEY ("organization_id", "thread_id")
  REFERENCES "threads"("organization_id", "id")
  ON DELETE SET NULL ("thread_id") ON UPDATE NO ACTION;
