-- Direct-message order verification (Instagram, TikTok). A sender shows they
-- know an order's email or shipping zip; gateway code compares their own
-- message with Shopify and records the result here. The model only records
-- that it asked.
--
-- HAND-WRITTEN, like every migration against this schema (see the comment on the
-- Thread model). Purely additive: new tables nothing reads until the code that
-- writes them ships. The agent's read fails closed to "not verified", so a
-- deploy that ran ahead of this migration plans every DM as unverified.

CREATE TYPE "OrderVerificationMethod" AS ENUM ('email', 'zip');
CREATE TYPE "OrderVerificationOutcome" AS ENUM ('matched', 'mismatch', 'no_candidate', 'unchecked');

CREATE TABLE "order_verifications" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "shop_domain" VARCHAR(255) NOT NULL,
  "thread_id" UUID,
  "order_name" VARCHAR(64),
  "order_id" VARCHAR(64),
  "method" "OrderVerificationMethod",
  "requested_at" TIMESTAMPTZ NOT NULL,
  "asks" INTEGER NOT NULL DEFAULT 1,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "answered_message_id" UUID,
  "verified_at" TIMESTAMPTZ,
  "request_facts" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "order_verifications_pkey" PRIMARY KEY ("id"),
  -- A verified row names the order Shopify resolved and how it was shown.
  CONSTRAINT "order_verifications_verified_check" CHECK (
    "verified_at" IS NULL OR ("order_name" IS NOT NULL AND "order_id" IS NOT NULL AND "method" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "order_verifications_sender_shop_order_key"
  ON "order_verifications"("organization_id", "customer_id", "shop_domain", "order_name");
-- One open "which order?" ask per sender and store. Prisma cannot express a
-- partial index; never let `prisma migrate dev` drop it.
CREATE UNIQUE INDEX "order_verifications_unnamed_ask_key"
  ON "order_verifications"("organization_id", "customer_id", "shop_domain")
  WHERE "order_name" IS NULL;
CREATE INDEX "order_verifications_organization_id_thread_id_idx"
  ON "order_verifications"("organization_id", "thread_id");
-- Supporting lookup paths for parent deletion and redaction by order.
CREATE INDEX "order_verifications_customer_id_organization_id_idx"
  ON "order_verifications"("customer_id", "organization_id");
CREATE INDEX "order_verifications_thread_id_organization_id_idx"
  ON "order_verifications"("thread_id", "organization_id");
CREATE INDEX "order_verifications_org_shop_order_id_idx"
  ON "order_verifications"("organization_id", "shop_domain", "order_id");

ALTER TABLE "order_verifications"
  ADD CONSTRAINT "order_verifications_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_verifications"
  ADD CONSTRAINT "order_verifications_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_verifications"
  ADD CONSTRAINT "order_verifications_thread_id_fkey"
  FOREIGN KEY ("thread_id") REFERENCES "threads"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Tenant-consistency foreign keys. The tables are new, so these are VALID at once.
ALTER TABLE "order_verifications"
  ADD CONSTRAINT "order_verifications_tenant_customer_fkey"
  FOREIGN KEY ("organization_id", "customer_id")
  REFERENCES "customers"("organization_id", "id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "order_verifications"
  ADD CONSTRAINT "order_verifications_tenant_thread_fkey"
  FOREIGN KEY ("organization_id", "thread_id")
  REFERENCES "threads"("organization_id", "id")
  ON DELETE SET NULL ("thread_id") ON UPDATE NO ACTION;

-- Each customer message compared once, against one order.
CREATE TABLE "order_verification_answers" (
  "message_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "order_verification_id" UUID NOT NULL,
  "outcome" "OrderVerificationOutcome" NOT NULL,
  "charged" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "order_verification_answers_pkey" PRIMARY KEY ("message_id")
);

CREATE INDEX "order_verification_answers_order_verification_id_idx"
  ON "order_verification_answers"("order_verification_id");
CREATE INDEX "order_verification_answers_organization_id_idx"
  ON "order_verification_answers"("organization_id");

ALTER TABLE "order_verification_answers"
  ADD CONSTRAINT "order_verification_answers_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_verification_answers"
  ADD CONSTRAINT "order_verification_answers_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "messages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_verification_answers"
  ADD CONSTRAINT "order_verification_answers_order_verification_id_fkey"
  FOREIGN KEY ("order_verification_id") REFERENCES "order_verifications"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_verification_answers"
  ADD CONSTRAINT "order_verification_answers_tenant_message_fkey"
  FOREIGN KEY ("organization_id", "message_id")
  REFERENCES "messages"("organization_id", "id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
