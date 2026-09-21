-- Retire never-shipped `sms` and legacy customer-thread `imessage` enum values,
-- plus `sms_agent`, the pre-2026-09-11 name for `operator`.
-- Operator iMessage uses `operator` threads plus org_member_imessage_bindings;
-- transport names elsewhere are not this enum. Production inventory 2026-09-11:
-- zero thread rows for both values (see audit:legacy-imessage-threads).
--
-- The enum is swapped by building a new type and retyping every column, so
-- every object whose definition embeds the old type has to be dropped first and
-- rebuilt after. A partial index predicate or a CHECK body still carrying
-- `::"ChannelType"` against a column that is now `ChannelType_new` fails the
-- ALTER with 42883 (`operator does not exist: "ChannelType_new" <> "ChannelType"`).
-- The five dependents below are the complete set; re-derive it with:
--   SELECT objid::regclass FROM pg_depend
--   WHERE refobjid = 'public."ChannelType"'::regtype;

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
  'dashboard_agent',
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

-- Rebuilt verbatim from their defining migrations:
-- 20260715000000_independent_email_integrations,
-- 20260715010000_instagram_single_account, 20260807000000_shopify_single_account,
-- 20260915160000_add_durable_agent_requests.
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
  AND (channel <> 'dashboard_agent' OR (source_message_id IS NULL AND source_operator_event_id IS NULL))
  AND ((state = 'accepted' AND task_id IS NULL AND attached_at IS NULL)
    OR (state = 'attached' AND task_id IS NOT NULL AND attached_at IS NOT NULL))
);
