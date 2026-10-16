ALTER TABLE "waitlist_entries"
  ADD COLUMN "newsletter_opt_in" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "newsletter_consent_at" TIMESTAMPTZ,
  ADD COLUMN "stage" VARCHAR(20) NOT NULL DEFAULT 'waiting',
  ADD COLUMN "invited_at" TIMESTAMPTZ,
  ADD COLUMN "signed_up_at" TIMESTAMPTZ,
  ADD COLUMN "email_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN "launch_subscribed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "updates_subscribed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "loops_contact_id" VARCHAR(128),
  ADD COLUMN "loops_submitted_at" TIMESTAMPTZ,
  ADD COLUMN "loops_synced_at" TIMESTAMPTZ,
  ADD COLUMN "sync_after" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "sync_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sync_revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "sync_lease_token" UUID,
  ADD COLUMN "sync_lease_until" TIMESTAMPTZ,
  ADD COLUMN "last_sync_error" VARCHAR(80);
CREATE INDEX "waitlist_entries_sync_after_idx" ON "waitlist_entries"("sync_after");
CREATE TABLE "waitlist_webhook_receipts" (
  "id" VARCHAR(255) PRIMARY KEY,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "waitlist_webhook_receipts_created_at_idx" ON "waitlist_webhook_receipts"("created_at");
