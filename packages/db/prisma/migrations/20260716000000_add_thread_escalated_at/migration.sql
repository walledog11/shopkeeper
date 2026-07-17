-- P5-04: escalation becomes an orthogonal flag, not a `pending` lifecycle status.
-- An escalated ticket stays `open` (visible in the inbox, correlates inbound
-- follow-ups); this nullable column records when it was handed to the merchant.
-- Additive only. Backfilling existing `pending` threads to `open` + escalated_at
-- is a separate, audited migration (must first resolve historical open+pending
-- duplicate pairs against the `threads_one_open_per_customer` unique index).
ALTER TABLE "threads" ADD COLUMN "escalated_at" TIMESTAMPTZ;
