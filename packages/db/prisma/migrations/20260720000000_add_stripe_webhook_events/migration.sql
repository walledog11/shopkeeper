CREATE TYPE "StripeWebhookEventStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

ALTER TABLE "organizations"
ADD COLUMN "stripe_state_event_created_at" TIMESTAMPTZ,
ADD COLUMN "stripe_state_event_id" VARCHAR(255);

-- Establish an additive rollout watermark for organizations that already have
-- Stripe billing state. Stripe can retry events for several days; without a
-- watermark, the first historical retry after this migration could regress an
-- existing subscription before a newer event arrives. Events created after the
-- migration advance normally, while pre-migration duplicates are completed as
-- stale by the durable processor.
UPDATE "organizations"
SET
    "stripe_state_event_created_at" = CURRENT_TIMESTAMP,
    "stripe_state_event_id" = 'migration:20260720000000'
WHERE "stripe_customer_id" IS NOT NULL
   OR "stripe_subscription_id" IS NOT NULL
   OR "stripe_status" IS NOT NULL;

CREATE TABLE "stripe_webhook_events" (
    "id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(255) NOT NULL,
    "stripe_created_at" TIMESTAMPTZ NOT NULL,
    "customer_id" VARCHAR(255),
    "subscription_id" VARCHAR(255),
    "organization_id" UUID,
    "status" "StripeWebhookEventStatus" NOT NULL DEFAULT 'pending',
    "claim_token" UUID,
    "claimed_at" TIMESTAMPTZ,
    "processed_at" TIMESTAMPTZ,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stripe_webhook_events_claim_state_check" CHECK (
      ("status" = 'pending' AND "claim_token" IS NULL AND "claimed_at" IS NULL AND "processed_at" IS NULL)
      OR ("status" = 'processing' AND "claim_token" IS NOT NULL AND "claimed_at" IS NOT NULL AND "processed_at" IS NULL)
      OR ("status" IN ('completed', 'failed') AND "claim_token" IS NOT NULL AND "claimed_at" IS NOT NULL AND "processed_at" IS NOT NULL)
    )
);

CREATE INDEX "stripe_webhook_events_status_claimed_at_idx"
ON "stripe_webhook_events"("status", "claimed_at");

CREATE INDEX "stripe_webhook_events_organization_id_stripe_created_at_idx"
ON "stripe_webhook_events"("organization_id", "stripe_created_at");

CREATE INDEX "stripe_webhook_events_customer_id_stripe_created_at_idx"
ON "stripe_webhook_events"("customer_id", "stripe_created_at");

ALTER TABLE "stripe_webhook_events"
ADD CONSTRAINT "stripe_webhook_events_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
