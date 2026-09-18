-- A parked proposal records who may approve it, the way a parked question
-- already records who may answer it.
--
-- `authorizeAgentProposal` used to re-derive the answer — "the member who
-- initiated the task, on their own operator thread" — which is right for a
-- member's own Concierge work and wrong for support, where the customer
-- initiates and any bound member approves. With the scope unrecorded, an
-- approval of a support plan was refused outright.
--
-- Additive: the columns are added nullable, backfilled from the owning task's
-- initiator (which is exactly what the old derivation computed, so existing
-- rows keep their current meaning), then made NOT NULL.

ALTER TABLE "agent_proposals" ADD COLUMN "approver_scope_kind" "AgentActorKind";
ALTER TABLE "agent_proposals" ADD COLUMN "approver_scope_key" VARCHAR(255);

UPDATE "agent_proposals" AS p
SET "approver_scope_kind" = t."initiating_actor_kind",
    "approver_scope_key" = t."initiating_actor_key"
FROM "agent_tasks" AS t
WHERE t."id" = p."task_id"
  AND p."approver_scope_kind" IS NULL;

ALTER TABLE "agent_proposals" ALTER COLUMN "approver_scope_kind" SET NOT NULL;
ALTER TABLE "agent_proposals" ALTER COLUMN "approver_scope_key" SET NOT NULL;
