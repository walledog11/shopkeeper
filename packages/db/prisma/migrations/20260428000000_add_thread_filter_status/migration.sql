-- Three-bucket spam triage: genuine / questionable / filtered.
-- Default 'genuine' so existing rows are unaffected.
CREATE TYPE "ThreadFilterStatus" AS ENUM ('genuine', 'questionable', 'filtered');

-- Implicit feedback captured from merchant actions (reply, close, mark-spam, recover).
CREATE TYPE "ThreadFilterFeedback" AS ENUM ('none', 'confirmed_genuine', 'confirmed_spam');

ALTER TABLE "threads"
  ADD COLUMN "filter_status"     "ThreadFilterStatus"   NOT NULL DEFAULT 'genuine',
  ADD COLUMN "filter_reason"     TEXT,
  ADD COLUMN "filter_decided_at" TIMESTAMPTZ,
  ADD COLUMN "filter_feedback"   "ThreadFilterFeedback" NOT NULL DEFAULT 'none';

-- Supports the Filtered-pill listing (org + filter_status = 'filtered', newest decided first)
-- and the questionable-bucket digest aggregator. DESC matches the existing inbox-index pattern
-- on last_message_at so PG can satisfy ORDER BY ... DESC without a sort step.
CREATE INDEX "threads_organization_id_filter_status_filter_decided_at_idx"
  ON "threads"("organization_id", "filter_status", "filter_decided_at" DESC);
