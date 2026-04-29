-- Drops the orphan FTS index and rating column that were applied directly to the DB
-- via abandoned migrations (20260417000000_messages_fts_index, 20260418000000_add_message_rating)
-- whose folders never made it into version control. Neither object is referenced by
-- application code (verified via grep: no to_tsvector / to_tsquery / Message.rating reads).
DROP INDEX IF EXISTS "messages_content_text_fts_idx";
ALTER TABLE "messages" DROP COLUMN IF EXISTS "rating";
