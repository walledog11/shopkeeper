-- Split the daily LLM spend counter by model so cost can be attributed
-- Haiku vs Sonnet, and track the number of billable model calls per bucket.
-- Existing rows predate the split and are backfilled as 'aggregate'.

ALTER TABLE "llm_daily_spend"
  ADD COLUMN "model" VARCHAR(64) NOT NULL DEFAULT 'aggregate';

ALTER TABLE "llm_daily_spend"
  ALTER COLUMN "model" DROP DEFAULT;

ALTER TABLE "llm_daily_spend"
  ADD COLUMN "calls" INTEGER NOT NULL DEFAULT 0;

DROP INDEX "llm_daily_spend_organization_id_day_key";

CREATE UNIQUE INDEX "llm_daily_spend_organization_id_day_model_key"
  ON "llm_daily_spend"("organization_id", "day", "model");
