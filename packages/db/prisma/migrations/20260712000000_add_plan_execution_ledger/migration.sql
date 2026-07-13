CREATE TYPE "PlanExecutionStatus" AS ENUM ('pending', 'claimed', 'committed', 'failed', 'unknown');

CREATE TABLE "plan_executions" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "thread_id" UUID,
    "source_message_id" UUID,
    "plan_hash" VARCHAR(64) NOT NULL,
    "instruction_hash" VARCHAR(64) NOT NULL,
    "status" "PlanExecutionStatus" NOT NULL DEFAULT 'pending',
    "claim_token" UUID,
    "claimed_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "approver_id" VARCHAR(255),
    "approved_at" TIMESTAMPTZ,
    "mode" VARCHAR(32),
    "last_error" TEXT,
    "observation_count" INTEGER NOT NULL DEFAULT 0,
    "last_observed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_executions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plan_executions_claim_state_check" CHECK (
      ("status" = 'pending' AND "claim_token" IS NULL AND "claimed_at" IS NULL AND "completed_at" IS NULL)
      OR ("status" = 'claimed' AND "claim_token" IS NOT NULL AND "claimed_at" IS NOT NULL AND "completed_at" IS NULL)
      OR ("status" IN ('committed', 'failed', 'unknown') AND "claim_token" IS NOT NULL AND "claimed_at" IS NOT NULL AND "completed_at" IS NOT NULL)
    )
);

ALTER TABLE "agent_actions" ADD COLUMN "execution_id" UUID;

CREATE UNIQUE INDEX "plan_executions_organization_id_plan_id_key"
ON "plan_executions"("organization_id", "plan_id");

CREATE INDEX "plan_executions_organization_id_status_created_at_idx"
ON "plan_executions"("organization_id", "status", "created_at");

CREATE INDEX "plan_executions_organization_id_thread_id_created_at_idx"
ON "plan_executions"("organization_id", "thread_id", "created_at");

CREATE INDEX "plan_executions_source_message_id_idx"
ON "plan_executions"("source_message_id");

CREATE INDEX "agent_actions_execution_id_idx" ON "agent_actions"("execution_id");

ALTER TABLE "plan_executions"
ADD CONSTRAINT "plan_executions_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "plan_executions"
ADD CONSTRAINT "plan_executions_thread_id_fkey"
FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "plan_executions"
ADD CONSTRAINT "plan_executions_source_message_id_fkey"
FOREIGN KEY ("source_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agent_actions"
ADD CONSTRAINT "agent_actions_execution_id_fkey"
FOREIGN KEY ("execution_id") REFERENCES "plan_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
