-- A Shopify store belongs to one workspace. Without this, two workspaces can
-- hold an integration for the same myshopify domain, and resolveOrganizationId
-- routes that store's webhooks to whichever row is newest — so a second
-- workspace completing OAuth silently drains the first workspace's order feed
-- and writes the store's buyer records into the wrong inbox.
--
-- The application already rejects this at connect time (shopify_store_in_use in
-- the OAuth callback). That check is check-then-act; this index is what makes
-- it race-safe against two callbacks landing at once, mirroring
-- integrations_instagram_account_unique.
--
-- Deliberately NOT constraining (organization_id) WHERE platform = 'shopify':
-- Instagram is one-account-per-workspace by product decision, but nothing here
-- says a workspace may not connect two stores. Only the store -> workspace
-- direction is a tenancy boundary.
--
-- Abort with the offending domains instead of failing on index creation, so a
-- deploy that hits legacy duplicates says what to clean up. Resolve with
-- `npm run cleanup:duplicate-integrations` and retry.
DO $$
DECLARE
  duplicate_shops TEXT;
BEGIN
  SELECT string_agg(duplicate."external_account_id", ', ' ORDER BY duplicate."external_account_id")
  INTO duplicate_shops
  FROM (
    SELECT "external_account_id"
    FROM "integrations"
    WHERE "platform" = 'shopify'
    GROUP BY "external_account_id"
    HAVING COUNT(*) > 1
  ) AS duplicate;

  IF duplicate_shops IS NOT NULL THEN
    RAISE EXCEPTION 'Shopify stores are connected to multiple organizations: %', duplicate_shops
      USING HINT = 'Run npm run cleanup:duplicate-integrations to audit and collapse the stale rows before retrying this migration.';
  END IF;
END $$;

CREATE UNIQUE INDEX "integrations_shopify_account_unique"
ON "integrations"("external_account_id")
WHERE "platform" = 'shopify';
