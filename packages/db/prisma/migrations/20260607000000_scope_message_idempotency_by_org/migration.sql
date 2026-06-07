-- Scope inbound message idempotency per organization instead of globally.
ALTER TABLE "messages" ADD COLUMN "organization_id" UUID;

UPDATE "messages" m
SET "organization_id" = t."organization_id"
FROM "threads" t
WHERE m."thread_id" = t."id";

ALTER TABLE "messages" ALTER COLUMN "organization_id" SET NOT NULL;

ALTER TABLE "messages" ADD CONSTRAINT "messages_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "messages_organization_id_idx" ON "messages"("organization_id");

DROP INDEX IF EXISTS "messages_external_id_unique";

CREATE UNIQUE INDEX "messages_org_external_id_unique"
  ON "messages" ("organization_id", "external_message_id")
  WHERE "external_message_id" IS NOT NULL;
