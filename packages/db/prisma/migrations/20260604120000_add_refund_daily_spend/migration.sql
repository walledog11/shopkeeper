CREATE TABLE IF NOT EXISTS "refund_daily_spend" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "day" VARCHAR(10) NOT NULL,
  "spent_cents" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "refund_daily_spend_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "refund_daily_spend_organization_id_day_key"
  ON "refund_daily_spend"("organization_id", "day");

DO $$
BEGIN
  ALTER TABLE "refund_daily_spend"
    ADD CONSTRAINT "refund_daily_spend_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
