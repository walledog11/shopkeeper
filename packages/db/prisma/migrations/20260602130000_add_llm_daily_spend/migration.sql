CREATE TABLE "llm_daily_spend" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "day" VARCHAR(10) NOT NULL,
  "spent_nano_usd" BIGINT NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "llm_daily_spend_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "llm_daily_spend_organization_id_day_key"
  ON "llm_daily_spend"("organization_id", "day");

ALTER TABLE "llm_daily_spend"
  ADD CONSTRAINT "llm_daily_spend_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
