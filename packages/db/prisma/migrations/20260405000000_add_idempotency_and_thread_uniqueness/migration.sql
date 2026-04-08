-- Partial unique index: only one open thread per customer per channel per org.
-- This is a hard DB-level backstop for the race condition in the worker's
-- findFirst → create pattern. Closed/pending threads are unaffected.
CREATE UNIQUE INDEX threads_one_open_per_customer
  ON threads (organization_id, customer_id, channel_type)
  WHERE status = 'open';

-- Partial unique index: external message IDs must be globally unique when present.
-- Agent notes and outbound messages have no external ID (NULL) so they are
-- excluded from the index — NULLs are never considered equal in a unique index.
CREATE UNIQUE INDEX messages_external_id_unique
  ON messages (external_message_id)
  WHERE external_message_id IS NOT NULL;
