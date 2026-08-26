-- Hand-written: Milestone 5 merchant preference memory. Additive only.

CREATE TYPE "MerchantPreferenceCategory" AS ENUM (
  'compensation',
  'returns',
  'shipping',
  'policy',
  'general'
);

CREATE TYPE "MerchantPreferenceSource" AS ENUM (
  'explicit',
  'observed'
);

CREATE TYPE "MerchantPreferenceStatus" AS ENUM (
  'active',
  'proposed',
  'archived',
  'rejected'
);

CREATE TABLE "merchant_preferences" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "category" "MerchantPreferenceCategory" NOT NULL,
    "guidance" TEXT NOT NULL,
    "source" "MerchantPreferenceSource" NOT NULL,
    "status" "MerchantPreferenceStatus" NOT NULL DEFAULT 'active',
    "confirmed_at" TIMESTAMPTZ,
    "confirmed_by_clerk_user_id" VARCHAR(255),
    "proposed_rationale" TEXT,
    "observed_at" TIMESTAMPTZ,
    "last_used_at" TIMESTAMPTZ,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_preferences_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "merchant_preferences_organization_id_status_idx"
ON "merchant_preferences"("organization_id", "status");

CREATE INDEX "merchant_preferences_organization_id_status_category_idx"
ON "merchant_preferences"("organization_id", "status", "category");

ALTER TABLE "merchant_preferences"
ADD CONSTRAINT "merchant_preferences_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
