-- Storefront chat (M1, guest-only): the `shopify_chat` channel and the browser
-- session table behind it.
--
-- Purely additive. No existing row can carry the new enum value, and nothing
-- reads storefront_chat_sessions until the feature ships behind
-- STOREFRONT_CHAT_ENABLED, so this is safe to deploy ahead of the routes.

-- AlterEnum
-- Prisma runs each migration file in one transaction, and a newly added enum
-- value is not usable inside the transaction that added it. Nothing below may
-- reference 'shopify_chat' as a value; a later migration must do any backfill.
ALTER TYPE "ChannelType" ADD VALUE 'shopify_chat';

CREATE TABLE "storefront_chat_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "integration_id" UUID NOT NULL,
  "customer_id" UUID,
  "thread_id" UUID,
  "storefront_host" VARCHAR(255) NOT NULL,
  "resume_secret_hash" VARCHAR(64) NOT NULL,
  "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "expires_at" TIMESTAMPTZ NOT NULL,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "storefront_chat_sessions_pkey" PRIMARY KEY ("id")
);

-- Supporting compound identity so future child tables can prove tenant
-- ownership at the database level (P5-03 convention).
CREATE UNIQUE INDEX "storefront_chat_sessions_organization_id_id_key"
  ON "storefront_chat_sessions"("organization_id", "id");

-- Uninstall/disconnect revocation sweeps by integration.
CREATE INDEX "storefront_chat_sessions_integration_id_revoked_at_idx"
  ON "storefront_chat_sessions"("integration_id", "revoked_at");
CREATE INDEX "storefront_chat_sessions_organization_id_last_seen_at_idx"
  ON "storefront_chat_sessions"("organization_id", "last_seen_at" DESC);
CREATE INDEX "storefront_chat_sessions_expires_at_idx"
  ON "storefront_chat_sessions"("expires_at");

-- Supporting lookup paths for parent deletion of the nullable references.
CREATE INDEX "storefront_chat_sessions_customer_id_organization_id_idx"
  ON "storefront_chat_sessions"("customer_id", "organization_id");
CREATE INDEX "storefront_chat_sessions_thread_id_organization_id_idx"
  ON "storefront_chat_sessions"("thread_id", "organization_id");

ALTER TABLE "storefront_chat_sessions"
  ADD CONSTRAINT "storefront_chat_sessions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "storefront_chat_sessions"
  ADD CONSTRAINT "storefront_chat_sessions_integration_id_fkey"
  FOREIGN KEY ("integration_id") REFERENCES "integrations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "storefront_chat_sessions"
  ADD CONSTRAINT "storefront_chat_sessions_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "storefront_chat_sessions"
  ADD CONSTRAINT "storefront_chat_sessions_thread_id_fkey"
  FOREIGN KEY ("thread_id") REFERENCES "threads"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Tenant-consistency foreign keys (P5-03). The table is empty, so unlike the
-- original P5-03 migration these are created VALID immediately — there are no
-- historical rows to validate and no lock-duration concern.
ALTER TABLE "storefront_chat_sessions"
  ADD CONSTRAINT "storefront_chat_sessions_tenant_integration_fkey"
  FOREIGN KEY ("organization_id", "integration_id")
  REFERENCES "integrations"("organization_id", "id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "storefront_chat_sessions"
  ADD CONSTRAINT "storefront_chat_sessions_tenant_customer_fkey"
  FOREIGN KEY ("organization_id", "customer_id")
  REFERENCES "customers"("organization_id", "id")
  ON DELETE SET NULL ("customer_id") ON UPDATE NO ACTION;

ALTER TABLE "storefront_chat_sessions"
  ADD CONSTRAINT "storefront_chat_sessions_tenant_thread_fkey"
  FOREIGN KEY ("organization_id", "thread_id")
  REFERENCES "threads"("organization_id", "id")
  ON DELETE SET NULL ("thread_id") ON UPDATE NO ACTION;
