ALTER TABLE "messages"
ADD COLUMN "send_claim_token" UUID,
ADD COLUMN "send_claimed_at" TIMESTAMPTZ,
ADD COLUMN "send_attempted_at" TIMESTAMPTZ;

CREATE INDEX "messages_send_status_send_claimed_at_idx"
ON "messages"("send_status", "send_claimed_at");
