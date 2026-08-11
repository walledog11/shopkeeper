CREATE TYPE "LifecycleOperationStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE "OrganizationLifecycleStatus" AS ENUM ('active', 'deleting', 'deletion_failed');
CREATE TYPE "IntegrationLifecycleStatus" AS ENUM ('active', 'disconnecting', 'cleanup_failed');

ALTER TABLE "organizations"
ADD COLUMN "lifecycle_status" "OrganizationLifecycleStatus" NOT NULL DEFAULT 'active';

ALTER TABLE "integrations"
ADD COLUMN "lifecycle_status" "IntegrationLifecycleStatus" NOT NULL DEFAULT 'active';

CREATE TABLE "workspace_deletions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "clerk_org_id" VARCHAR(255) NOT NULL,
    "stripe_subscription_id" VARCHAR(255),
    "status" "LifecycleOperationStatus" NOT NULL DEFAULT 'pending',
    "claim_token" UUID,
    "claimed_at" TIMESTAMPTZ,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "integrations_cleaned_at" TIMESTAMPTZ,
    "stripe_canceled_at" TIMESTAMPTZ,
    "clerk_deleted_at" TIMESTAMPTZ,
    "local_data_deleted_at" TIMESTAMPTZ,
    "last_error" TEXT,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_deletions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "integration_disconnects" (
    "id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "platform" "ChannelType" NOT NULL,
    "external_account_id" VARCHAR(255) NOT NULL,
    "status" "LifecycleOperationStatus" NOT NULL DEFAULT 'pending',
    "claim_token" UUID,
    "claimed_at" TIMESTAMPTZ,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "provider_cleaned_at" TIMESTAMPTZ,
    "local_data_deleted_at" TIMESTAMPTZ,
    "last_error" TEXT,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_disconnects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_deletions_organization_id_key"
ON "workspace_deletions"("organization_id");

CREATE INDEX "workspace_deletions_status_claimed_at_idx"
ON "workspace_deletions"("status", "claimed_at");

CREATE UNIQUE INDEX "integration_disconnects_integration_id_key"
ON "integration_disconnects"("integration_id");

CREATE INDEX "integration_disconnects_organization_id_created_at_idx"
ON "integration_disconnects"("organization_id", "created_at");

CREATE INDEX "integration_disconnects_status_claimed_at_idx"
ON "integration_disconnects"("status", "claimed_at");

CREATE INDEX "organizations_lifecycle_status_idx"
ON "organizations"("lifecycle_status");

CREATE INDEX "integrations_organization_id_lifecycle_status_idx"
ON "integrations"("organization_id", "lifecycle_status");
