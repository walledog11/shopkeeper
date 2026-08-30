-- `source_message_id` shipped NOT NULL while its foreign key is
-- ON DELETE SET NULL, so deleting a referenced message raised 23502 rather than
-- nulling the column. That aborted any transaction reaching a message delete,
-- including the customers/redact fulfillment in shopify-compliance.ts, which
-- cascades customer -> threads -> messages.
--
-- The sibling links on this table (`thread_id`, `customer_id`) and
-- `plan_executions.source_message_id` are all nullable behind the same SET NULL.
-- This makes the column agree with the constraint that was already on it; no
-- data changes, and no row is currently null.
ALTER TABLE "request_episode_outcomes"
ALTER COLUMN "source_message_id" DROP NOT NULL;
