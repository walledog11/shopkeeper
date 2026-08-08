-- Preserve the exact identity supplied to a provider mutation so a later
-- reconciliation probe derives the same idempotency key, tag, or code.
ALTER TABLE "agent_actions"
ADD COLUMN "provider_operation_key" VARCHAR(255);

CREATE INDEX "agent_actions_provider_operation_key_idx"
ON "agent_actions"("provider_operation_key");
