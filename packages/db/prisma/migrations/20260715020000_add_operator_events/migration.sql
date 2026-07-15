CREATE TYPE "OperatorEventStatus" AS ENUM ('pending', 'claimed', 'committed', 'failed', 'unknown');

CREATE TABLE "operator_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "channel" VARCHAR(16) NOT NULL,
    "provider_message_id" VARCHAR(255) NOT NULL,
    "chat_id" VARCHAR(255) NOT NULL,
    "space_id" VARCHAR(255),
    "clerk_user_id" VARCHAR(255) NOT NULL,
    "operator_key" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "status" "OperatorEventStatus" NOT NULL DEFAULT 'pending',
    "claim_token" UUID,
    "claimed_at" TIMESTAMPTZ,
    "processed_at" TIMESTAMPTZ,
    "reply_text" TEXT,
    "reply_delivered_at" TIMESTAMPTZ,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operator_events_claim_state_check" CHECK (
      ("status" = 'pending' AND "claim_token" IS NULL AND "claimed_at" IS NULL AND "processed_at" IS NULL)
      OR ("status" = 'claimed' AND "claim_token" IS NOT NULL AND "claimed_at" IS NOT NULL AND "processed_at" IS NULL)
      OR ("status" IN ('committed', 'failed', 'unknown') AND "claim_token" IS NOT NULL AND "claimed_at" IS NOT NULL AND "processed_at" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "operator_events_channel_provider_message_id_key"
ON "operator_events"("channel", "provider_message_id");

CREATE INDEX "operator_events_organization_id_status_created_at_idx"
ON "operator_events"("organization_id", "status", "created_at");

CREATE INDEX "operator_events_status_updated_at_idx"
ON "operator_events"("status", "updated_at");

ALTER TABLE "operator_events"
ADD CONSTRAINT "operator_events_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
