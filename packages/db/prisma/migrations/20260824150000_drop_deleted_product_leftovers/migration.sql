-- HAND-WRITTEN. `prisma migrate dev` must never be run against this schema: six
-- partial unique indexes live in raw SQL that Prisma cannot express, and the
-- generator diffs them as absent and drops them. See the comment on the Thread
-- model.
--
-- Drops schema left behind after deleting post-resolution follow-up nudges and
-- review thumbs-up. Also strips the matching unused keys from stored org
-- settings JSON and remaps retired autonomy tiers so live blobs match the
-- product. The settings parser still ignores those keys and remaps broad/full
-- on read, so orgs that have not migrated yet keep loading.

DROP TABLE IF EXISTS "follow_up_watches";
DROP TYPE IF EXISTS "FollowUpWatchKind";
DROP TYPE IF EXISTS "FollowUpWatchStatus";

ALTER TABLE "agent_actions" DROP COLUMN IF EXISTS "feedback";

UPDATE "organizations"
SET "settings" = ("settings"
  - 'sampleReplies'
  - 'replyLanguage'
  - 'postResolutionFollowUpEnabled'
  - 'postResolutionFollowUpDays')
WHERE "settings" IS NOT NULL
  AND jsonb_typeof("settings") = 'object';

UPDATE "organizations"
SET "settings" = jsonb_set("settings", '{autonomyTier}', '"trusted"', false)
WHERE jsonb_typeof("settings") = 'object'
  AND "settings" ->> 'autonomyTier' IN ('broad', 'full');
