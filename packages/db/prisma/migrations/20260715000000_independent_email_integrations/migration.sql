CREATE TYPE "EmailProvider" AS ENUM ('gmail', 'postmark');

-- reply_integration_id / integration_id are created in the earlier instagram migration.
-- Keep these guards so a standalone deploy of this migration still succeeds.
ALTER TABLE "threads"
ADD COLUMN IF NOT EXISTS "reply_integration_id" UUID,
ADD COLUMN IF NOT EXISTS "reply_integration_updated_at" TIMESTAMPTZ;

ALTER TABLE "messages"
ADD COLUMN IF NOT EXISTS "integration_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'threads_reply_integration_id_fkey'
  ) THEN
    ALTER TABLE "threads"
    ADD CONSTRAINT "threads_reply_integration_id_fkey"
    FOREIGN KEY ("reply_integration_id") REFERENCES "integrations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_integration_id_fkey'
  ) THEN
    ALTER TABLE "messages"
    ADD CONSTRAINT "messages_integration_id_fkey"
    FOREIGN KEY ("integration_id") REFERENCES "integrations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "messages_integration_id_idx" ON "messages"("integration_id");

ALTER TABLE "integrations"
ADD COLUMN "email_provider" "EmailProvider";

UPDATE "integrations"
SET "email_provider" = CASE
  WHEN "metadata"->>'provider' = 'gmail' THEN 'gmail'::"EmailProvider"
  ELSE 'postmark'::"EmailProvider"
END
WHERE "platform" = 'email';

DROP INDEX "integrations_organization_id_platform_external_account_id_key";

CREATE UNIQUE INDEX "integrations_non_email_account_unique"
ON "integrations"("organization_id", "platform", "external_account_id")
WHERE "platform" <> 'email';

CREATE UNIQUE INDEX "integrations_organization_id_email_provider_key"
ON "integrations"("organization_id", "email_provider");

ALTER TABLE "organizations"
ADD COLUMN "default_email_integration_id" UUID;

ALTER TABLE "organizations"
ADD CONSTRAINT "organizations_default_email_integration_id_fkey"
FOREIGN KEY ("default_email_integration_id") REFERENCES "integrations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

WITH single_email_integration AS (
  SELECT "organization_id", MIN("id"::text)::uuid AS "integration_id"
  FROM "integrations"
  WHERE "platform" = 'email' AND "email_provider" IS NOT NULL
  GROUP BY "organization_id"
  HAVING COUNT(*) = 1
)
UPDATE "organizations" AS organization
SET "default_email_integration_id" = single_email_integration."integration_id"
FROM single_email_integration
WHERE organization."id" = single_email_integration."organization_id";

WITH single_email_integration AS (
  SELECT "organization_id", MIN("id"::text)::uuid AS "integration_id"
  FROM "integrations"
  WHERE "platform" = 'email' AND "email_provider" IS NOT NULL
  GROUP BY "organization_id"
  HAVING COUNT(*) = 1
), latest_inbound AS (
  SELECT
    thread."id" AS "thread_id",
    MAX(message."sent_at") AS "received_at"
  FROM "threads" AS thread
  JOIN "messages" AS message
    ON message."thread_id" = thread."id"
   AND message."sender_type" = 'customer'
  WHERE thread."channel_type" = 'email'
  GROUP BY thread."id"
)
UPDATE "threads" AS thread
SET
  "reply_integration_id" = single_email_integration."integration_id",
  "reply_integration_updated_at" = latest_inbound."received_at"
FROM single_email_integration, latest_inbound
WHERE thread."organization_id" = single_email_integration."organization_id"
  AND thread."id" = latest_inbound."thread_id"
  AND thread."channel_type" = 'email';

WITH single_email_integration AS (
  SELECT "organization_id", MIN("id"::text)::uuid AS "integration_id"
  FROM "integrations"
  WHERE "platform" = 'email' AND "email_provider" IS NOT NULL
  GROUP BY "organization_id"
  HAVING COUNT(*) = 1
)
UPDATE "messages" AS message
SET "integration_id" = single_email_integration."integration_id"
FROM "threads" AS thread, single_email_integration
WHERE message."thread_id" = thread."id"
  AND thread."organization_id" = single_email_integration."organization_id"
  AND thread."channel_type" = 'email';
