-- AlterTable: add the pending-plan queue column (additive; nullable = empty queue).
ALTER TABLE "operator_contexts" ADD COLUMN "pending_plans" JSONB;

-- Backfill: fold any existing single-slot pending_plan into a one-element queue so
-- an in-flight plan parked before this deploy stays approvable by text.
UPDATE "operator_contexts"
SET "pending_plans" = jsonb_build_array("pending_plan")
WHERE "pending_plan" IS NOT NULL AND "pending_plans" IS NULL;
