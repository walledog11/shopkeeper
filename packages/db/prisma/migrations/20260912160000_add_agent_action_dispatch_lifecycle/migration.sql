CREATE TYPE "AgentActionDispatchState" AS ENUM (
  'prepared',
  'dispatch_authorized',
  'submitted',
  'settled',
  'unknown'
);

ALTER TABLE "agent_actions"
  ADD COLUMN "operation_id" UUID,
  ADD COLUMN "action_index" INTEGER,
  ADD COLUMN "dispatch_state" "AgentActionDispatchState",
  ADD COLUMN "submitted_at" TIMESTAMPTZ,
  ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "executed_at" DROP NOT NULL,
  ALTER COLUMN "executed_at" DROP DEFAULT,
  ALTER COLUMN "duration_ms" DROP NOT NULL;

ALTER TABLE "agent_actions"
  ADD CONSTRAINT "agent_actions_action_index_nonnegative_check"
    CHECK ("action_index" IS NULL OR "action_index" >= 0),
  ADD CONSTRAINT "agent_actions_dispatch_lifecycle_check"
    CHECK (
      "dispatch_state" IS NULL
      OR ("operation_id" IS NOT NULL AND "action_index" IS NOT NULL)
    ),
  ADD CONSTRAINT "agent_actions_settlement_fields_check"
    CHECK (
      "dispatch_state" IS NULL
      OR "dispatch_state" IN ('prepared', 'dispatch_authorized', 'unknown')
      OR "submitted_at" IS NOT NULL
    ),
  ADD CONSTRAINT "agent_actions_completion_fields_check"
    CHECK (
      "dispatch_state" IS NULL
      OR "dispatch_state" NOT IN ('settled', 'unknown')
      OR ("executed_at" IS NOT NULL AND "duration_ms" IS NOT NULL)
    );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "agent_actions"
    WHERE "provider_operation_key" IS NOT NULL
    GROUP BY "organization_id", "provider_operation_key"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate organization/provider operation keys prevent dispatch lifecycle migration';
  END IF;
END $$;

CREATE UNIQUE INDEX "agent_actions_organization_id_operation_id_key"
  ON "agent_actions"("organization_id", "operation_id");
CREATE UNIQUE INDEX "agent_actions_organization_id_provider_operation_key_key"
  ON "agent_actions"("organization_id", "provider_operation_key");
CREATE INDEX "agent_actions_dispatch_state_submitted_at_idx"
  ON "agent_actions"("dispatch_state", "submitted_at");
