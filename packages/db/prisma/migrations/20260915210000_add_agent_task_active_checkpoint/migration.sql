ALTER TABLE "agent_tasks"
ADD COLUMN "active_checkpoint_at" TIMESTAMPTZ;

-- A deployment may briefly contain work claimed by the previous runtime.
-- Anchor that work at its last durable progress time before tightening the
-- running-task shape invariant.
UPDATE "agent_tasks"
SET "active_checkpoint_at" = COALESCE("last_progress_at", CURRENT_TIMESTAMP)
WHERE "status" = 'running';

ALTER TABLE "agent_tasks" DROP CONSTRAINT "agent_tasks_shape_check";
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_shape_check" CHECK (
  runtime_version > 0 AND revision >= 0 AND checkpoint_version > 0
  AND octet_length(checkpoint::text) <= 32768
  AND model_calls_used >= 0 AND input_tokens_used >= 0 AND output_tokens_used >= 0
  AND active_time_ms_used >= 0 AND spent_nano_usd >= 0
  AND model_call_limit > 0 AND active_time_ms_limit > 0 AND spend_nano_usd_limit > 0
  AND ((status = 'running' AND claim_token IS NOT NULL AND lease_expires_at IS NOT NULL
        AND active_checkpoint_at IS NOT NULL)
    OR (status <> 'running' AND claim_token IS NULL AND lease_expires_at IS NULL
        AND active_checkpoint_at IS NULL))
  AND (num_nonnulls(pending_question_id, pending_question, pending_answerer_kind, pending_answerer_key) IN (0,4))
);
