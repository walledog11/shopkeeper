-- The single-slot pending_plan column was backfilled into pending_plans in
-- 20260723000000 and the dual-read fallback was retired once audit showed zero
-- live rows (2026-07-30). New writes have gone only to pending_plans since.
ALTER TABLE "operator_contexts" DROP COLUMN "pending_plan";
