ALTER TABLE "organizations"
  ADD COLUMN "voice_proposal" JSONB;

CREATE TABLE "voice_edits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "thread_id" UUID,
  "ai_draft" TEXT NOT NULL,
  "final_text" TEXT NOT NULL,
  "tag" VARCHAR(255),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "consumed_at" TIMESTAMPTZ,
  CONSTRAINT "voice_edits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "voice_edits_organization_id_consumed_at_created_at_idx"
  ON "voice_edits"("organization_id", "consumed_at", "created_at");

ALTER TABLE "voice_edits"
  ADD CONSTRAINT "voice_edits_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
