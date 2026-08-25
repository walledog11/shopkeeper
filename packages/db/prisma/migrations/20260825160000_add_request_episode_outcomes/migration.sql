-- Hand-written: Milestone 3 immutable outcome attribution. Additive only;
-- safe to apply before the code that writes rows ships.

CREATE TYPE "RequestEpisodeTerminalResolution" AS ENUM (
  'unresolved',
  'auto_resolved',
  'merchant_approved',
  'merchant_input',
  'escalated',
  'failed',
  'invalid_plan',
  'superseded',
  'dismissed'
);

CREATE TYPE "RequestEpisodeReplyProvenance" AS ENUM (
  'agent_automatic',
  'agent_approved',
  'manual'
);

CREATE TABLE "request_episode_outcomes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "thread_id" UUID,
    "customer_id" UUID,
    "source_message_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "channel_type" "ChannelType" NOT NULL,

    "classifier_version" INTEGER,
    "request_tag" VARCHAR(64),
    "request_disposition" "ThreadRequestDisposition",
    "request_ask" VARCHAR(32),
    "classifier_intents" JSONB,

    "plan_verdict" VARCHAR(32) NOT NULL,
    "plan_hash" VARCHAR(64) NOT NULL,
    "instruction_hash" VARCHAR(64) NOT NULL,
    "namespace_miss" BOOLEAN NOT NULL DEFAULT false,

    "plan_execution_id" UUID,
    "execution_status" "PlanExecutionStatus",

    "approval_requested_at" TIMESTAMPTZ,
    "approval_granted_at" TIMESTAMPTZ,
    "merchant_input_requested_at" TIMESTAMPTZ,
    "merchant_input_answered_at" TIMESTAMPTZ,
    "escalated_at" TIMESTAMPTZ,
    "reply_provenance" "RequestEpisodeReplyProvenance",
    "merchant_touched" BOOLEAN NOT NULL DEFAULT false,

    "terminal_resolution" "RequestEpisodeTerminalResolution" NOT NULL DEFAULT 'unresolved',
    "terminal_at" TIMESTAMPTZ,
    "superseded_by_plan_id" UUID,

    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_episode_outcomes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "request_episode_outcomes_organization_id_plan_id_key"
ON "request_episode_outcomes"("organization_id", "plan_id");

CREATE INDEX "request_episode_outcomes_organization_id_source_message_id_idx"
ON "request_episode_outcomes"("organization_id", "source_message_id");

CREATE INDEX "request_episode_outcomes_organization_id_thread_id_created_at_idx"
ON "request_episode_outcomes"("organization_id", "thread_id", "created_at" DESC);

CREATE INDEX "request_episode_outcomes_organization_id_terminal_resolution_created_at_idx"
ON "request_episode_outcomes"("organization_id", "terminal_resolution", "created_at" DESC);

CREATE INDEX "request_episode_outcomes_organization_id_request_tag_created_at_idx"
ON "request_episode_outcomes"("organization_id", "request_tag", "created_at" DESC);

ALTER TABLE "request_episode_outcomes"
ADD CONSTRAINT "request_episode_outcomes_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "request_episode_outcomes"
ADD CONSTRAINT "request_episode_outcomes_thread_id_fkey"
FOREIGN KEY ("thread_id") REFERENCES "threads"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "request_episode_outcomes"
ADD CONSTRAINT "request_episode_outcomes_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "request_episode_outcomes"
ADD CONSTRAINT "request_episode_outcomes_source_message_id_fkey"
FOREIGN KEY ("source_message_id") REFERENCES "messages"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "request_episode_outcomes"
ADD CONSTRAINT "request_episode_outcomes_plan_execution_id_fkey"
FOREIGN KEY ("plan_execution_id") REFERENCES "plan_executions"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
