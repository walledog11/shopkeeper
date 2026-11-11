-- Additive: apply before deploying the code that reads it.

-- A Shopify install's grant before any workspace claims the store.
CREATE TABLE "shopify_pending_installs" (
  "shop" VARCHAR(255) NOT NULL,
  "grant_id" UUID NOT NULL,
  "access_token" TEXT NOT NULL,
  "refresh_token" TEXT,
  "token_expires_at" TIMESTAMPTZ,
  "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "shop_name" VARCHAR(255),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "shopify_pending_installs_pkey" PRIMARY KEY ("shop")
);

-- The store's Shopify managed-pricing subscription, as last synced.
ALTER TABLE "organizations"
  ADD COLUMN "shopify_billing_status" VARCHAR(20),
  ADD COLUMN "shopify_plan_name" VARCHAR(255),
  ADD COLUMN "shopify_subscription_id" VARCHAR(255),
  ADD COLUMN "shopify_trial_ends_at" TIMESTAMPTZ,
  ADD COLUMN "shopify_billing_test" BOOLEAN,
  ADD COLUMN "shopify_billing_synced_at" TIMESTAMPTZ;
