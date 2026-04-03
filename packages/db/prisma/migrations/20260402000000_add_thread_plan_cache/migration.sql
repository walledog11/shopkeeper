ALTER TABLE "threads"
  ADD COLUMN "cached_plan_message_id" UUID,
  ADD COLUMN "cached_plan" JSONB;
