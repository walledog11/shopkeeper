-- Hand-written, per the note on the Thread model: `prisma migrate dev` diffs the
-- partial unique index threads_one_open_per_customer as absent and emits a DROP
-- INDEX for it. Nothing here touches that index.
--
-- Both changes are additive and nullable, so the migration is safe to apply
-- before the code that writes them ships. That ordering is deliberate:
-- storefront-chat migrations have twice shipped *behind* their code, and the
-- second took the channel down on silent P2022 500s.

ALTER TABLE "storefront_chat_sessions"
ADD COLUMN "verified_email_hash" VARCHAR(64);

CREATE TABLE "conversation_attributions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "thread_id" UUID,
    "customer_id" UUID,
    "order_id" VARCHAR(64) NOT NULL,
    "order_name" VARCHAR(64) NOT NULL,
    "order_total_cents" INTEGER NOT NULL,
    "currency" VARCHAR(8) NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "match_basis" VARCHAR(32) NOT NULL,
    "matched_product_ids" JSONB,
    "last_conversation_at" TIMESTAMPTZ,
    "ordered_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_attributions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversation_attributions_kind_check"
      CHECK ("kind" IN ('direct', 'chat_assisted', 'product_assisted')),
    CONSTRAINT "conversation_attributions_match_basis_check"
      CHECK ("match_basis" IN ('none', 'verified_email', 'customer_platform_id', 'shopify_customer')),
    -- An attributed row must name the conversation it is attributed to, and a
    -- direct row must not. Without this the table can express "chat-assisted by
    -- nothing in particular", which is a number a merchant would act on.
    CONSTRAINT "conversation_attributions_thread_matches_kind_check"
      CHECK (
        ("kind" = 'direct' AND "thread_id" IS NULL AND "match_basis" = 'none')
        OR ("kind" <> 'direct' AND "thread_id" IS NOT NULL AND "match_basis" <> 'none')
      )
);

-- Order webhooks retry, and orders/create can arrive more than once. This is
-- what keeps one order from being counted as revenue twice.
CREATE UNIQUE INDEX "conversation_attributions_organization_id_order_id_key"
ON "conversation_attributions"("organization_id", "order_id");

CREATE INDEX "conversation_attributions_organization_id_ordered_at_idx"
ON "conversation_attributions"("organization_id", "ordered_at" DESC);

CREATE INDEX "conversation_attributions_organization_id_kind_ordered_at_idx"
ON "conversation_attributions"("organization_id", "kind", "ordered_at" DESC);

CREATE INDEX "conversation_attributions_thread_id_idx"
ON "conversation_attributions"("thread_id");

ALTER TABLE "conversation_attributions"
ADD CONSTRAINT "conversation_attributions_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull on both: deleting a thread or redacting a customer must not erase the
-- revenue row, or the merchant's totals change retroactively.
ALTER TABLE "conversation_attributions"
ADD CONSTRAINT "conversation_attributions_thread_id_fkey"
FOREIGN KEY ("thread_id") REFERENCES "threads"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "conversation_attributions"
ADD CONSTRAINT "conversation_attributions_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
