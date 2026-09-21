-- A durable proposal must carry every value needed to verify and execute its
-- snapshot. The proposal hash already included the instruction, but the row did
-- not retain it, which forced execution to read the mutable thread plan cache.
ALTER TABLE "agent_proposals" ADD COLUMN "instruction" VARCHAR(4000);

-- Development databases may already contain proposals from the additive
-- rollout. Their task objective is the only durable instruction available for
-- that historical snapshot; production had not deployed these tables when the
-- rollout inventory was taken.
ALTER TABLE "agent_proposals" DISABLE TRIGGER agent_proposal_immutable;
UPDATE "agent_proposals" AS proposal
SET "instruction" = task."objective"
FROM "agent_tasks" AS task
WHERE task."id" = proposal."task_id"
  AND task."organization_id" = proposal."organization_id";
ALTER TABLE "agent_proposals" ENABLE TRIGGER agent_proposal_immutable;

ALTER TABLE "agent_proposals" ALTER COLUMN "instruction" SET NOT NULL;
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_instruction_check"
CHECK (length("instruction") BETWEEN 1 AND 4000);
