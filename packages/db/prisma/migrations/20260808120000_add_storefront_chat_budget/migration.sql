-- Storefront chat budget (M1): the per-session and per-shop-per-day message
-- counters that keep an anonymous shopper from spending the org's daily LLM cap.
--
-- Purely additive. The new column defaults to 0 on existing sessions, which is
-- the correct starting point — those sessions predate the budget and have no
-- accounted history, and starting them at 0 grants at most one session's
-- allowance each across a single dev store.

ALTER TABLE "storefront_chat_sessions"
  ADD COLUMN "message_count" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "storefront_chat_daily_usage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "integration_id" UUID NOT NULL,
  "day" VARCHAR(10) NOT NULL,
  "message_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "storefront_chat_daily_usage_pkey" PRIMARY KEY ("id")
);

-- The budget's claim key: one row per shop per UTC day, upserted under
-- contention by concurrent shoppers.
CREATE UNIQUE INDEX "storefront_chat_daily_usage_integration_id_day_key"
  ON "storefront_chat_daily_usage"("integration_id", "day");
CREATE INDEX "storefront_chat_daily_usage_organization_id_day_idx"
  ON "storefront_chat_daily_usage"("organization_id", "day");

ALTER TABLE "storefront_chat_daily_usage"
  ADD CONSTRAINT "storefront_chat_daily_usage_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "storefront_chat_daily_usage"
  ADD CONSTRAINT "storefront_chat_daily_usage_integration_id_fkey"
  FOREIGN KEY ("integration_id") REFERENCES "integrations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant-consistency foreign key (P5-03). Created VALID immediately: the table
-- is new and empty, so there are no historical rows to validate.
ALTER TABLE "storefront_chat_daily_usage"
  ADD CONSTRAINT "storefront_chat_daily_usage_tenant_integration_fkey"
  FOREIGN KEY ("organization_id", "integration_id")
  REFERENCES "integrations"("organization_id", "id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
