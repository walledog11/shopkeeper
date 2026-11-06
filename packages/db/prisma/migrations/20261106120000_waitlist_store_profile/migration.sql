ALTER TABLE "waitlist_entries"
  ADD COLUMN "store_url" VARCHAR(255),
  ADD COLUMN "customer_channels" VARCHAR(20)[] DEFAULT ARRAY[]::VARCHAR(20)[],
  ADD COLUMN "weekly_messages" VARCHAR(20),
  ADD COLUMN "profile_submitted_at" TIMESTAMPTZ;
