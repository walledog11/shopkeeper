-- Hand-written: per-turn agent usage. Additive only; safe to apply before the
-- code that writes rows ships, and the writer swallows its own failures so the
-- reverse order cannot take a turn down either.

CREATE TABLE "agent_turn_usage" (
    "id" UUID NOT NULL,
    "turn_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "thread_id" UUID,
    "purpose" VARCHAR(32) NOT NULL,
    "channel_type" VARCHAR(32),
    "outcome" VARCHAR(32) NOT NULL,
    "model_calls" INTEGER NOT NULL,
    "budget_tokens" INTEGER NOT NULL,
    "first_call_budget_tokens" INTEGER NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "cache_creation_input_tokens" INTEGER NOT NULL,
    "cache_creation_1h_input_tokens" INTEGER NOT NULL,
    "cache_read_input_tokens" INTEGER NOT NULL,
    "total_tokens" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_turn_usage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_turn_usage_turn_id_key" ON "agent_turn_usage"("turn_id");
CREATE INDEX "agent_turn_usage_organization_id_created_at_idx" ON "agent_turn_usage"("organization_id", "created_at" DESC);
CREATE INDEX "agent_turn_usage_organization_id_outcome_created_at_idx" ON "agent_turn_usage"("organization_id", "outcome", "created_at" DESC);
CREATE INDEX "agent_turn_usage_thread_id_idx" ON "agent_turn_usage"("thread_id");

ALTER TABLE "agent_turn_usage"
  ADD CONSTRAINT "agent_turn_usage_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_turn_usage"
  ADD CONSTRAINT "agent_turn_usage_thread_id_fkey"
  FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
