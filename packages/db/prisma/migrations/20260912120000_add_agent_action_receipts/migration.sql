ALTER TABLE "agent_actions"
  ADD COLUMN "receipt_version" INTEGER,
  ADD COLUMN "receipt" JSONB;

ALTER TABLE "agent_actions"
  ADD CONSTRAINT "agent_actions_receipt_pair_check"
  CHECK (("receipt_version" IS NULL) = ("receipt" IS NULL)),
  ADD CONSTRAINT "agent_actions_receipt_version_check"
  CHECK ("receipt_version" IS NULL OR "receipt_version" = 1);
