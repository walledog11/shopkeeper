-- Denormalize the sender of each thread's most recent conversation message
-- so the inbox can filter to "needs my reply" — threads where the last
-- non-note message is from the customer — without a per-thread subquery.
ALTER TABLE "threads"
  ADD COLUMN "last_message_sender_type" "SenderType";

-- Backfill from each thread's most recent non-deleted non-note message.
-- DISTINCT ON (thread_id) ordered by sent_at DESC picks the latest one.
UPDATE "threads" t
SET "last_message_sender_type" = m."sender_type"
FROM (
  SELECT DISTINCT ON ("thread_id") "thread_id", "sender_type"
  FROM "messages"
  WHERE "deleted_at" IS NULL AND "sender_type" <> 'note'
  ORDER BY "thread_id", "sent_at" DESC
) m
WHERE m."thread_id" = t."id";

-- Inbox "needs my reply" filter: scoped by org + status, then sender.
CREATE INDEX "threads_organization_id_status_last_message_sender_type_idx"
  ON "threads"("organization_id", "status", "last_message_sender_type");
