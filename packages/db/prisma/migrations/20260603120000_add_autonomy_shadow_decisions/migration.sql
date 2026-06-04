-- Shadow/canary record for the autonomy raise. One row per plan ("turn") that
-- the classifier would have auto-executed at the org's tier while autoExecuteMode
-- is "shadow": the action still routes to human approval, and we record what the
-- agent would have auto-done so it can be compared against what the human did.

-- CreateTable
CREATE TABLE "autonomy_shadow_decisions" (
    "id" UUID NOT NULL,
    "turn_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "thread_id" UUID,
    "tier" VARCHAR(16) NOT NULL,
    "proposed_mutations_hash" VARCHAR(64) NOT NULL,
    "proposed_tools" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "would_auto_execute" BOOLEAN NOT NULL,
    "human_decision" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "agreement" BOOLEAN,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,

    CONSTRAINT "autonomy_shadow_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "autonomy_shadow_decisions_turn_id_key"
    ON "autonomy_shadow_decisions"("turn_id");

-- CreateIndex
CREATE INDEX "autonomy_shadow_decisions_organization_id_created_at_idx"
    ON "autonomy_shadow_decisions"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "autonomy_shadow_decisions_organization_id_human_decision_idx"
    ON "autonomy_shadow_decisions"("organization_id", "human_decision");

-- CreateIndex
CREATE INDEX "autonomy_shadow_decisions_organization_id_thread_id_human_de_idx"
    ON "autonomy_shadow_decisions"("organization_id", "thread_id", "human_decision");

-- AddForeignKey
ALTER TABLE "autonomy_shadow_decisions" ADD CONSTRAINT "autonomy_shadow_decisions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "autonomy_shadow_decisions" ADD CONSTRAINT "autonomy_shadow_decisions_thread_id_fkey"
    FOREIGN KEY ("thread_id") REFERENCES "threads"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
