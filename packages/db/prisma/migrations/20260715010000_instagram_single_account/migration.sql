-- V1 supports one Instagram account per workspace, and an Instagram account
-- can be connected to only one workspace. Abort with actionable identifiers
-- instead of choosing or deleting duplicate legacy rows during deployment.
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

DO $$
DECLARE
  duplicate_organizations TEXT;
  duplicate_accounts TEXT;
BEGIN
  SELECT string_agg(duplicate."organization_id"::text, ', ' ORDER BY duplicate."organization_id"::text)
  INTO duplicate_organizations
  FROM (
    SELECT "organization_id"
    FROM "integrations"
    WHERE "platform" = 'ig_dm'
    GROUP BY "organization_id"
    HAVING COUNT(*) > 1
  ) AS duplicate;

  IF duplicate_organizations IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate Instagram integrations exist for organizations: %', duplicate_organizations
      USING HINT = 'Audit and remove legacy ig_dm rows before retrying this migration.';
  END IF;

  SELECT string_agg(duplicate."external_account_id", ', ' ORDER BY duplicate."external_account_id")
  INTO duplicate_accounts
  FROM (
    SELECT "external_account_id"
    FROM "integrations"
    WHERE "platform" = 'ig_dm'
    GROUP BY "external_account_id"
    HAVING COUNT(*) > 1
  ) AS duplicate;

  IF duplicate_accounts IS NOT NULL THEN
    RAISE EXCEPTION 'Instagram accounts are connected to multiple organizations: %', duplicate_accounts
      USING HINT = 'Audit ownership and remove legacy ig_dm rows before retrying this migration.';
  END IF;
END $$;

CREATE UNIQUE INDEX "integrations_instagram_organization_unique"
ON "integrations"("organization_id")
WHERE "platform" = 'ig_dm';

CREATE UNIQUE INDEX "integrations_instagram_account_unique"
ON "integrations"("external_account_id")
WHERE "platform" = 'ig_dm';
