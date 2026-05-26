-- Add turn-level fields to agent_actions so the read path can reconstruct
-- ActionLogEntry shape (1-per-turn with grouped tool calls) without parsing
-- legacy __clerk_agent__ note rows.
--   turn_id      — shared UUID across every row written in one recordAgentActionsBatch
--   instruction  — turn-level instruction text (denormalized per row for cheap reads)
--   summary      — agent's final summary for the turn (denormalized per row)

-- AlterTable
ALTER TABLE "agent_actions"
    ADD COLUMN "turn_id" UUID,
    ADD COLUMN "instruction" TEXT,
    ADD COLUMN "summary" TEXT;

-- Backfill any pre-existing rows with a synthetic turn_id (one per row).
UPDATE "agent_actions" SET "turn_id" = gen_random_uuid() WHERE "turn_id" IS NULL;

-- Lock it down — every future row must carry a turn_id.
ALTER TABLE "agent_actions" ALTER COLUMN "turn_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "agent_actions_turn_id_idx" ON "agent_actions"("turn_id");
