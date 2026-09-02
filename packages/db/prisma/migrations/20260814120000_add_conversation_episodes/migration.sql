-- Conversation episodes, migration 1 of 2 (see
-- apps/gateway/src/message-handlers/resolve-inbound-episode.ts): the state a
-- rollover has to record, plus the storefront's episode history.
--
-- HAND-WRITTEN. `prisma migrate dev` must never be run against this schema: six
-- partial unique indexes live in raw SQL that Prisma cannot express, and the
-- generator diffs them as absent and drops them. See the migration hazard in the
-- plan, and the comment on the Thread model.
--
-- Purely additive. The request_* columns ship inert — nothing reads them until
-- P2 — because they record facts at the moment they occur and cannot be
-- reconstructed later.

CREATE TYPE "ThreadClosedReason" AS ENUM (
  'merchant',
  'resolved',
  'episode_rollover',
  'inactivity',
  'superseded'
);

CREATE TYPE "ThreadRequestDisposition" AS ENUM (
  'none',
  'acknowledgement',
  'informational',
  'merchant_action',
  'unclear'
);

-- `status` remains the lifecycle authority; closed_reason only says why. It is
-- deliberately nullable: every thread closed before this migration has no
-- recorded reason, and guessing one would be worse than admitting it is unknown.
--
-- episode_rollover and inactivity are distinct on purpose. P1 writes
-- episode_rollover when a conversation boundary elapses and a new episode opens;
-- the retention sweep writes inactivity when a quiet thread leaves the inbox for
-- good. Collapsing them would make the briefing unable to tell "they moved on to
-- a new question" from "nobody ever came back".
ALTER TABLE "threads"
  ADD COLUMN "closed_reason" "ThreadClosedReason",
  ADD COLUMN "request_summary" TEXT,
  ADD COLUMN "request_source_message_id" UUID,
  ADD COLUMN "request_disposition" "ThreadRequestDisposition";

-- Which threads a browser session has held, in order. Two jobs:
--   1. the widget's collapsed "Previous conversation" history (P4);
--   2. the join that resolves storefront verification independently of the
--      session's current thread pointer, so a rollover neither silently grants
--      verified-order scope to a new episode nor silently revokes it from the
--      expired one.
CREATE TABLE "storefront_chat_session_episodes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "thread_id" UUID NOT NULL,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "ended_at" TIMESTAMPTZ,

  CONSTRAINT "storefront_chat_session_episodes_pkey" PRIMARY KEY ("id")
);

-- One row per (session, thread). Re-binding a session to a thread it already
-- holds must be idempotent, or a retried inbound would append a duplicate
-- episode and the widget would render the same conversation twice.
CREATE UNIQUE INDEX "storefront_chat_session_episodes_session_id_thread_id_key"
  ON "storefront_chat_session_episodes"("session_id", "thread_id");
-- Verification resolution reads episode -> session, keyed by the thread in hand.
CREATE INDEX "storefront_chat_session_episodes_thread_id_idx"
  ON "storefront_chat_session_episodes"("thread_id");
-- Bootstrap lists a session's episodes newest-first.
CREATE INDEX "storefront_chat_session_episodes_session_id_started_at_idx"
  ON "storefront_chat_session_episodes"("session_id", "started_at" DESC);

ALTER TABLE "storefront_chat_session_episodes"
  ADD CONSTRAINT "storefront_chat_session_episodes_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "storefront_chat_session_episodes"
  ADD CONSTRAINT "storefront_chat_session_episodes_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "storefront_chat_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "storefront_chat_session_episodes"
  ADD CONSTRAINT "storefront_chat_session_episodes_thread_id_fkey"
  FOREIGN KEY ("thread_id") REFERENCES "threads"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant-consistency foreign keys (P5-03). Created VALID immediately: the table
-- is new and empty at this point, so there are no historical rows to validate.
ALTER TABLE "storefront_chat_session_episodes"
  ADD CONSTRAINT "storefront_chat_session_episodes_tenant_session_fkey"
  FOREIGN KEY ("organization_id", "session_id")
  REFERENCES "storefront_chat_sessions"("organization_id", "id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "storefront_chat_session_episodes"
  ADD CONSTRAINT "storefront_chat_session_episodes_tenant_thread_fkey"
  FOREIGN KEY ("organization_id", "thread_id")
  REFERENCES "threads"("organization_id", "id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

-- Backfill one episode per session that already points at a thread. Every live
-- session is mid-episode right now, and once verification resolves through this
-- table an unbackfilled session would read as unverified — silently demoting
-- every shopper who has already proved control of an order.
INSERT INTO "storefront_chat_session_episodes" (
  "organization_id", "session_id", "thread_id", "started_at"
)
SELECT s."organization_id", s."id", s."thread_id", s."created_at"
FROM "storefront_chat_sessions" s
WHERE s."thread_id" IS NOT NULL
ON CONFLICT ("session_id", "thread_id") DO NOTHING;
