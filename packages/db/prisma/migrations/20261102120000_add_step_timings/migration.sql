-- How long each step between a customer's message and the reply took (the
-- StepTiming model). Hand-written and additive: a new table nothing reads until
-- the code that writes it ships, and every write is best-effort, so code that
-- runs ahead of this migration loses timings and nothing else.

CREATE TABLE "step_timings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "thread_id" UUID,
    "step" VARCHAR(48) NOT NULL,
    "detail" VARCHAR(120),
    "started_at" TIMESTAMPTZ NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "step_timings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "step_timings_thread_id_started_at_idx" ON "step_timings"("thread_id", "started_at");
CREATE INDEX "step_timings_organization_id_started_at_idx" ON "step_timings"("organization_id", "started_at");

ALTER TABLE "step_timings"
  ADD CONSTRAINT "step_timings_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "step_timings"
  ADD CONSTRAINT "step_timings_thread_id_fkey"
  FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
