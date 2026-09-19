-- Additive Package 2 schema. Reviewed datamodel diff; no legacy indexes dropped.
-- NO ACTION thread/task ownership permits whole-organization cascades while
-- preventing ordinary deletion of a thread containing durable work.
-- CreateEnum
CREATE TYPE "AgentActorKind" AS ENUM ('member', 'customer', 'system');

-- CreateEnum
CREATE TYPE "AgentRequestState" AS ENUM ('accepted', 'attached');

-- CreateEnum
CREATE TYPE "AgentTaskStatus" AS ENUM ('queued', 'running', 'waiting_input', 'waiting_approval', 'reconciling', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "AgentProposalStatus" AS ENUM ('ready', 'waiting_approval', 'approved', 'rejected', 'superseded', 'completed');

-- CreateEnum
CREATE TYPE "AgentCommunicationMode" AS ENUM ('exact_draft', 'intent');

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "agent_request_id" UUID,
ADD COLUMN     "agent_task_id" UUID;

-- AlterTable
ALTER TABLE "operator_events" ADD COLUMN     "agent_request_id" UUID,
ADD COLUMN     "reply_message_id" UUID;

-- AlterTable
ALTER TABLE "agent_actions" ADD COLUMN     "proposal_id" UUID,
ADD COLUMN     "task_id" UUID;

-- AlterTable
ALTER TABLE "plan_executions" ADD COLUMN     "proposal_id" UUID,
ADD COLUMN     "task_id" UUID;

-- CreateTable
CREATE TABLE "agent_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_kind" "AgentActorKind" NOT NULL,
    "actor_key" VARCHAR(255) NOT NULL,
    "channel" "ChannelType" NOT NULL,
    "thread_id" UUID NOT NULL,
    "dedupe_key" VARCHAR(255) NOT NULL,
    "payload_version" INTEGER NOT NULL,
    "payload_hash" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "normalized_instruction" TEXT NOT NULL,
    "source_message_id" UUID,
    "source_operator_event_id" UUID,
    "state" "AgentRequestState" NOT NULL DEFAULT 'accepted',
    "task_id" UUID,
    "accepted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attached_at" TIMESTAMPTZ,

    CONSTRAINT "agent_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_tasks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "initiating_actor_kind" "AgentActorKind" NOT NULL,
    "initiating_actor_key" VARCHAR(255) NOT NULL,
    "objective" VARCHAR(4000) NOT NULL,
    "runtime_version" INTEGER NOT NULL,
    "status" "AgentTaskStatus" NOT NULL DEFAULT 'queued',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "active_proposal_id" UUID,
    "pending_question_id" UUID,
    "pending_question" VARCHAR(2000),
    "pending_answerer_kind" "AgentActorKind",
    "pending_answerer_key" VARCHAR(255),
    "checkpoint_version" INTEGER NOT NULL,
    "checkpoint" JSONB NOT NULL,
    "claim_token" UUID,
    "lease_expires_at" TIMESTAMPTZ,
    "model_calls_used" INTEGER NOT NULL DEFAULT 0,
    "input_tokens_used" INTEGER NOT NULL DEFAULT 0,
    "output_tokens_used" INTEGER NOT NULL DEFAULT 0,
    "active_time_ms_used" INTEGER NOT NULL DEFAULT 0,
    "spent_nano_usd" BIGINT NOT NULL DEFAULT 0,
    "model_call_limit" INTEGER NOT NULL,
    "active_time_ms_limit" INTEGER NOT NULL,
    "spend_nano_usd_limit" BIGINT NOT NULL,
    "last_progress_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "failure_code" VARCHAR(64),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_proposals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "task_revision" INTEGER NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "status" "AgentProposalStatus" NOT NULL DEFAULT 'ready',
    "canonical_actions" JSONB NOT NULL,
    "dependencies" JSONB NOT NULL,
    "proposal_hash" VARCHAR(64) NOT NULL,
    "source_request_ids" JSONB NOT NULL,
    "communication_mode" "AgentCommunicationMode",
    "communication_destination" JSONB,
    "approved_draft" TEXT,
    "allowed_result_bindings" JSONB,
    "approver_key" VARCHAR(255),
    "approved_at" TIMESTAMPTZ,
    "approved_hash" VARCHAR(64),
    "decided_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_requests_state_accepted_at_idx" ON "agent_requests"("state", "accepted_at");

-- CreateIndex
CREATE INDEX "agent_requests_organization_id_thread_id_accepted_at_idx" ON "agent_requests"("organization_id", "thread_id", "accepted_at" DESC);

-- CreateIndex
CREATE INDEX "agent_requests_organization_id_task_id_idx" ON "agent_requests"("organization_id", "task_id");

-- CreateIndex
CREATE INDEX "agent_requests_source_message_id_idx" ON "agent_requests"("source_message_id");

-- CreateIndex
CREATE INDEX "agent_requests_source_operator_event_id_idx" ON "agent_requests"("source_operator_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_requests_dedupe_key" ON "agent_requests"("organization_id", "actor_kind", "actor_key", "channel", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "agent_requests_organization_id_id_key" ON "agent_requests"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_tasks_active_proposal_id_key" ON "agent_tasks"("active_proposal_id");

-- CreateIndex
CREATE INDEX "agent_tasks_status_lease_expires_at_idx" ON "agent_tasks"("status", "lease_expires_at");

-- CreateIndex
CREATE INDEX "agent_tasks_organization_id_thread_id_status_updated_at_idx" ON "agent_tasks"("organization_id", "thread_id", "status", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "agent_tasks_organization_id_last_progress_at_idx" ON "agent_tasks"("organization_id", "last_progress_at");

-- CreateIndex
CREATE UNIQUE INDEX "agent_tasks_organization_id_id_key" ON "agent_tasks"("organization_id", "id");

-- CreateIndex
CREATE INDEX "agent_proposals_organization_id_task_id_task_revision_idx" ON "agent_proposals"("organization_id", "task_id", "task_revision" DESC);

-- CreateIndex
CREATE INDEX "agent_proposals_status_created_at_idx" ON "agent_proposals"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "agent_proposals_organization_id_id_key" ON "agent_proposals"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_proposals_organization_task_id_key" ON "agent_proposals"("organization_id", "task_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_proposals_snapshot_key" ON "agent_proposals"("organization_id", "task_id", "task_revision", "proposal_hash");

-- CreateIndex
CREATE INDEX "messages_organization_id_agent_task_id_sent_at_idx" ON "messages"("organization_id", "agent_task_id", "sent_at");

-- CreateIndex
CREATE INDEX "operator_events_agent_request_id_idx" ON "operator_events"("agent_request_id");

-- CreateIndex
CREATE INDEX "operator_events_reply_message_id_idx" ON "operator_events"("reply_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "operator_events_organization_id_id_key" ON "operator_events"("organization_id", "id");

-- CreateIndex
CREATE INDEX "agent_actions_task_id_proposal_id_idx" ON "agent_actions"("task_id", "proposal_id");

-- CreateIndex
CREATE INDEX "plan_executions_task_id_proposal_id_idx" ON "plan_executions"("task_id", "proposal_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_executions_organization_id_proposal_id_key" ON "plan_executions"("organization_id", "proposal_id");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_agent_request_id_fkey" FOREIGN KEY ("agent_request_id") REFERENCES "agent_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_agent_task_id_fkey" FOREIGN KEY ("agent_task_id") REFERENCES "agent_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_events" ADD CONSTRAINT "operator_events_agent_request_id_fkey" FOREIGN KEY ("agent_request_id") REFERENCES "agent_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_events" ADD CONSTRAINT "operator_events_reply_message_id_fkey" FOREIGN KEY ("reply_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "agent_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_executions" ADD CONSTRAINT "plan_executions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_executions" ADD CONSTRAINT "plan_executions_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "agent_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_tasks"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_source_operator_event_id_fkey" FOREIGN KEY ("source_operator_event_id") REFERENCES "operator_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_active_proposal_id_fkey" FOREIGN KEY ("active_proposal_id") REFERENCES "agent_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_tenant_thread_id_fkey"
FOREIGN KEY ("organization_id", "thread_id") REFERENCES "threads"("organization_id", "id")
ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_tenant_thread_id_fkey"
FOREIGN KEY ("organization_id", "thread_id") REFERENCES "threads"("organization_id", "id")
ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_tenant_task_id_fkey"
FOREIGN KEY ("organization_id", "task_id") REFERENCES "agent_tasks"("organization_id", "id")
ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_tenant_source_message_id_fkey"
FOREIGN KEY ("organization_id", "source_message_id") REFERENCES "messages"("organization_id", "id")
ON DELETE SET NULL ("source_message_id") ON UPDATE NO ACTION;

ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_tenant_source_operator_event_id_fkey"
FOREIGN KEY ("organization_id", "source_operator_event_id") REFERENCES "operator_events"("organization_id", "id")
ON DELETE SET NULL ("source_operator_event_id") ON UPDATE NO ACTION;

ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_tenant_task_id_fkey"
FOREIGN KEY ("organization_id", "task_id") REFERENCES "agent_tasks"("organization_id", "id")
ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_agent_request_id_fkey"
FOREIGN KEY ("organization_id", "agent_request_id") REFERENCES "agent_requests"("organization_id", "id")
ON DELETE SET NULL ("agent_request_id") ON UPDATE NO ACTION;

ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_agent_task_id_fkey"
FOREIGN KEY ("organization_id", "agent_task_id") REFERENCES "agent_tasks"("organization_id", "id")
ON DELETE SET NULL ("agent_task_id") ON UPDATE NO ACTION;

ALTER TABLE "operator_events" ADD CONSTRAINT "operator_events_tenant_agent_request_id_fkey"
FOREIGN KEY ("organization_id", "agent_request_id") REFERENCES "agent_requests"("organization_id", "id")
ON DELETE SET NULL ("agent_request_id") ON UPDATE NO ACTION;

ALTER TABLE "operator_events" ADD CONSTRAINT "operator_events_tenant_reply_message_id_fkey"
FOREIGN KEY ("organization_id", "reply_message_id") REFERENCES "messages"("organization_id", "id")
ON DELETE SET NULL ("reply_message_id") ON UPDATE NO ACTION;

ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_tenant_task_id_fkey"
FOREIGN KEY ("organization_id", "task_id") REFERENCES "agent_tasks"("organization_id", "id")
ON DELETE SET NULL ("task_id") ON UPDATE NO ACTION;

ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_tenant_proposal_id_fkey"
FOREIGN KEY ("organization_id", "proposal_id") REFERENCES "agent_proposals"("organization_id", "id")
ON DELETE SET NULL ("proposal_id") ON UPDATE NO ACTION;

ALTER TABLE "plan_executions" ADD CONSTRAINT "plan_executions_tenant_task_id_fkey"
FOREIGN KEY ("organization_id", "task_id") REFERENCES "agent_tasks"("organization_id", "id")
ON DELETE SET NULL ("task_id") ON UPDATE NO ACTION;

ALTER TABLE "plan_executions" ADD CONSTRAINT "plan_executions_tenant_proposal_id_fkey"
FOREIGN KEY ("organization_id", "proposal_id") REFERENCES "agent_proposals"("organization_id", "id")
ON DELETE SET NULL ("proposal_id") ON UPDATE NO ACTION;

ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_exact_active_proposal_fkey"
FOREIGN KEY ("organization_id", "id", "active_proposal_id")
REFERENCES "agent_proposals"("organization_id", "task_id", "id")
ON DELETE SET NULL ("active_proposal_id");
ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_source_thread_fkey"
FOREIGN KEY ("organization_id", "source_message_id", "thread_id")
REFERENCES "messages"("organization_id", "id", "thread_id")
ON DELETE SET NULL ("source_message_id");

ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_exact_proposal_task_fkey"
FOREIGN KEY ("organization_id", "task_id", "proposal_id")
REFERENCES "agent_proposals"("organization_id", "task_id", "id")
ON DELETE SET NULL ("proposal_id");
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_proposal_requires_task_check"
CHECK ("proposal_id" IS NULL OR "task_id" IS NOT NULL);

ALTER TABLE "plan_executions" ADD CONSTRAINT "plan_executions_exact_proposal_task_fkey"
FOREIGN KEY ("organization_id", "task_id", "proposal_id")
REFERENCES "agent_proposals"("organization_id", "task_id", "id")
ON DELETE SET NULL ("proposal_id");
ALTER TABLE "plan_executions" ADD CONSTRAINT "plan_executions_proposal_requires_task_check"
CHECK ("proposal_id" IS NULL OR "task_id" IS NOT NULL);

ALTER TABLE "plan_executions" ADD CONSTRAINT "plan_executions_proposal_identity_check"
CHECK ("proposal_id" IS NULL OR "plan_id" = "proposal_id");
ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_shape_check" CHECK (
  payload_version > 0 AND payload_hash ~ '^[a-f0-9]{64}$'
  AND length(normalized_instruction) BETWEEN 1 AND 16000
  AND octet_length(payload::text) <= 65536
  AND (source_message_id IS NULL OR source_operator_event_id IS NULL)
  AND (channel <> 'dashboard_agent' OR (source_message_id IS NULL AND source_operator_event_id IS NULL))
  AND ((state = 'accepted' AND task_id IS NULL AND attached_at IS NULL)
    OR (state = 'attached' AND task_id IS NOT NULL AND attached_at IS NOT NULL))
);
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_shape_check" CHECK (
  runtime_version > 0 AND revision >= 0 AND checkpoint_version > 0
  AND octet_length(checkpoint::text) <= 32768
  AND model_calls_used >= 0 AND input_tokens_used >= 0 AND output_tokens_used >= 0
  AND active_time_ms_used >= 0 AND spent_nano_usd >= 0
  AND model_call_limit > 0 AND active_time_ms_limit > 0 AND spend_nano_usd_limit > 0
  AND ((status = 'running' AND claim_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'running' AND claim_token IS NULL AND lease_expires_at IS NULL))
  AND (num_nonnulls(pending_question_id, pending_question, pending_answerer_kind, pending_answerer_key) IN (0,4))
);
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_shape_check" CHECK (
  task_revision >= 0 AND schema_version > 0 AND proposal_hash ~ '^[a-f0-9]{64}$'
  AND jsonb_typeof(canonical_actions) = 'array' AND jsonb_typeof(dependencies) = 'array'
  AND jsonb_typeof(source_request_ids) = 'array'
  AND (num_nonnulls(approver_key, approved_at, approved_hash) IN (0,3))
  AND (approved_hash IS NULL OR approved_hash = proposal_hash)
  AND (status <> 'approved' OR approved_hash IS NOT NULL)
  AND (communication_mode IS DISTINCT FROM 'exact_draft'
    OR (communication_destination IS NOT NULL AND communication_destination <> 'null'::jsonb AND approved_draft IS NOT NULL))
);
-- Explicit field lists let source references be nulled by erasure while the
-- accepted payload and executable proposal remain immutable in ordinary use.
CREATE FUNCTION guard_agent_request_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id, NEW.organization_id, NEW.actor_kind, NEW.actor_key, NEW.channel,
    NEW.thread_id, NEW.dedupe_key, NEW.payload_version, NEW.payload_hash, NEW.payload,
    NEW.normalized_instruction, NEW.accepted_at)
    IS DISTINCT FROM ROW(OLD.id, OLD.organization_id, OLD.actor_kind, OLD.actor_key, OLD.channel,
    OLD.thread_id, OLD.dedupe_key, OLD.payload_version, OLD.payload_hash, OLD.payload,
    OLD.normalized_instruction, OLD.accepted_at)
    OR (OLD.state = 'attached' AND ROW(NEW.state, NEW.task_id, NEW.attached_at)
      IS DISTINCT FROM ROW(OLD.state, OLD.task_id, OLD.attached_at))
  THEN RAISE EXCEPTION 'Agent request identity is immutable' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agent_request_immutable BEFORE UPDATE ON agent_requests
FOR EACH ROW EXECUTE FUNCTION guard_agent_request_update();

CREATE FUNCTION guard_agent_proposal_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['status','approver_key','approved_at','approved_hash','decided_at','updated_at'])
    IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','approver_key','approved_at','approved_hash','decided_at','updated_at'])
  THEN RAISE EXCEPTION 'Agent proposal snapshot is immutable' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agent_proposal_immutable BEFORE UPDATE ON agent_proposals
FOR EACH ROW EXECUTE FUNCTION guard_agent_proposal_update();

CREATE FUNCTION guard_agent_task_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id, NEW.organization_id, NEW.thread_id, NEW.initiating_actor_kind,
    NEW.initiating_actor_key, NEW.runtime_version, NEW.model_call_limit,
    NEW.active_time_ms_limit, NEW.spend_nano_usd_limit)
    IS DISTINCT FROM ROW(OLD.id, OLD.organization_id, OLD.thread_id, OLD.initiating_actor_kind,
    OLD.initiating_actor_key, OLD.runtime_version, OLD.model_call_limit,
    OLD.active_time_ms_limit, OLD.spend_nano_usd_limit)
    OR NEW.revision < OLD.revision OR NEW.model_calls_used < OLD.model_calls_used
    OR NEW.input_tokens_used < OLD.input_tokens_used OR NEW.output_tokens_used < OLD.output_tokens_used
    OR NEW.active_time_ms_used < OLD.active_time_ms_used OR NEW.spent_nano_usd < OLD.spent_nano_usd
  THEN RAISE EXCEPTION 'Agent task identity/budget cannot be rewritten' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agent_task_monotonic BEFORE UPDATE ON agent_tasks
FOR EACH ROW EXECUTE FUNCTION guard_agent_task_update();
