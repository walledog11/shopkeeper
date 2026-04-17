-- Add channels, use_count, last_used_at to canned_responses
ALTER TABLE "canned_responses"
  ADD COLUMN "channels"     TEXT[]       NOT NULL DEFAULT '{}',
  ADD COLUMN "use_count"    INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN "last_used_at" TIMESTAMPTZ;
