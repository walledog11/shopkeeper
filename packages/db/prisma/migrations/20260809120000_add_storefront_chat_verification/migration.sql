-- Storefront chat identity verification (M1.5): the emailed-code challenge that
-- lets a shopper prove they hold the inbox already on an order, so the widget can
-- answer their own order questions instead of handing every one to the merchant.
--
-- Purely additive. The new column defaults to 0 on existing sessions, which is
-- the correct starting point: those sessions predate the budget and have sent no
-- verification mail.

ALTER TABLE "storefront_chat_sessions"
  ADD COLUMN "verification_sends" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "storefront_chat_verifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "order_name" VARCHAR(64) NOT NULL,
  "order_id" VARCHAR(64) NOT NULL,
  -- SHA-256 of the code. The code itself is never stored and never enters the
  -- chat transcript; it travels only to the address already on the order.
  "code_hash" VARCHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "verified_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "storefront_chat_verifications_pkey" PRIMARY KEY ("id")
);

-- One outstanding challenge per (session, order): re-requesting a code replaces
-- the previous one rather than leaving several valid at once.
CREATE UNIQUE INDEX "storefront_chat_verifications_session_id_order_name_key"
  ON "storefront_chat_verifications"("session_id", "order_name");
CREATE INDEX "storefront_chat_verifications_organization_id_created_at_idx"
  ON "storefront_chat_verifications"("organization_id", "created_at");
-- Expiry sweep.
CREATE INDEX "storefront_chat_verifications_expires_at_idx"
  ON "storefront_chat_verifications"("expires_at");

ALTER TABLE "storefront_chat_verifications"
  ADD CONSTRAINT "storefront_chat_verifications_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "storefront_chat_verifications"
  ADD CONSTRAINT "storefront_chat_verifications_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "storefront_chat_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant-consistency foreign key (P5-03). Created VALID immediately: the table
-- is new and empty, so there are no historical rows to validate.
ALTER TABLE "storefront_chat_verifications"
  ADD CONSTRAINT "storefront_chat_verifications_tenant_session_fkey"
  FOREIGN KEY ("organization_id", "session_id")
  REFERENCES "storefront_chat_sessions"("organization_id", "id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
