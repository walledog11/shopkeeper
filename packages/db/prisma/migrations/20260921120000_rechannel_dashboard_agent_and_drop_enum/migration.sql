-- Re-channel historical Concierge threads to `operator`, then drop `dashboard_agent`
-- from ChannelType. Nothing has written this value since 2026-08-06; production
-- inventory 2026-09-11: 20 active thread rows.

UPDATE "threads" SET "channel_type" = 'operator' WHERE "channel_type" = 'dashboard_agent';
UPDATE "request_episode_outcomes" SET "channel_type" = 'operator' WHERE "channel_type" = 'dashboard_agent';
UPDATE "agent_requests" SET "channel" = 'operator' WHERE "channel" = 'dashboard_agent';

DROP INDEX "integrations_non_email_account_unique";
DROP INDEX "integrations_instagram_organization_unique";
DROP INDEX "integrations_instagram_account_unique";
DROP INDEX "integrations_shopify_account_unique";
ALTER TABLE "agent_requests" DROP CONSTRAINT "agent_requests_shape_check";

CREATE TYPE "ChannelType_new" AS ENUM (
  'ig_dm',
  'email',
  'tiktok',
  'shopify',
  'operator',
  'shopify_chat'
);

ALTER TABLE "integrations"
  ALTER COLUMN "platform" TYPE "ChannelType_new"
  USING ("platform"::text::"ChannelType_new");

ALTER TABLE "integration_disconnects"
  ALTER COLUMN "platform" TYPE "ChannelType_new"
  USING ("platform"::text::"ChannelType_new");

ALTER TABLE "threads"
  ALTER COLUMN "channel_type" TYPE "ChannelType_new"
  USING ("channel_type"::text::"ChannelType_new");

ALTER TABLE "request_episode_outcomes"
  ALTER COLUMN "channel_type" TYPE "ChannelType_new"
  USING ("channel_type"::text::"ChannelType_new");

ALTER TABLE "agent_requests"
  ALTER COLUMN "channel" TYPE "ChannelType_new"
  USING ("channel"::text::"ChannelType_new");

ALTER TYPE "ChannelType" RENAME TO "ChannelType_old";
ALTER TYPE "ChannelType_new" RENAME TO "ChannelType";
DROP TYPE "ChannelType_old";

CREATE UNIQUE INDEX "integrations_non_email_account_unique"
ON "integrations"("organization_id", "platform", "external_account_id")
WHERE "platform" <> 'email';

CREATE UNIQUE INDEX "integrations_instagram_organization_unique"
ON "integrations"("organization_id")
WHERE "platform" = 'ig_dm';

CREATE UNIQUE INDEX "integrations_instagram_account_unique"
ON "integrations"("external_account_id")
WHERE "platform" = 'ig_dm';

CREATE UNIQUE INDEX "integrations_shopify_account_unique"
ON "integrations"("external_account_id")
WHERE "platform" = 'shopify';

ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_shape_check" CHECK (
  payload_version > 0 AND payload_hash ~ '^[a-f0-9]{64}$'
  AND length(normalized_instruction) BETWEEN 1 AND 16000
  AND octet_length(payload::text) <= 65536
  AND (source_message_id IS NULL OR source_operator_event_id IS NULL)
  AND ((state = 'accepted' AND task_id IS NULL AND attached_at IS NULL)
    OR (state = 'attached' AND task_id IS NOT NULL AND attached_at IS NOT NULL))
);
