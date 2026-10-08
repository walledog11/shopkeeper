-- Damage claims need a photo before compensation.
-- Records that the agent asked the customer for one and since when, so the next
-- reply without a photo escalates instead of asking again.
--
-- HAND-WRITTEN, like every migration against this schema (see the comment on the
-- Thread model). Purely additive: both columns are nullable and nothing reads
-- them on a thread where the agent never asked.

CREATE TYPE "CustomerWait" AS ENUM ('damage_photo');

ALTER TABLE "threads"
  ADD COLUMN "awaiting_customer" "CustomerWait",
  ADD COLUMN "awaiting_customer_since" TIMESTAMPTZ;
