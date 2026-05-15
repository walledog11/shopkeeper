-- Generalize sms_contexts → operator_contexts and add OrgMember.telegram_chat_id.
-- sms_contexts is left in place; it will be dropped in the §2c Twilio-removal migration.

CREATE TABLE "operator_contexts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "chat_id" VARCHAR(64) NOT NULL,
    "last_order_number" VARCHAR(50),
    "last_thread_id" UUID,
    "history" JSONB NOT NULL DEFAULT '[]',
    "pending_plan" JSONB,
    "pending_digest" JSONB,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_contexts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operator_contexts_organization_id_channel_chat_id_key"
    ON "operator_contexts"("organization_id", "channel", "chat_id");
CREATE INDEX "operator_contexts_organization_id_idx"
    ON "operator_contexts"("organization_id");

ALTER TABLE "operator_contexts" ADD CONSTRAINT "operator_contexts_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "operator_contexts" (
    "id", "organization_id", "channel", "chat_id",
    "last_order_number", "last_thread_id", "history",
    "pending_plan", "pending_digest", "updated_at"
)
SELECT
    gen_random_uuid(), "organization_id", 'whatsapp', "phone_number",
    "last_order_number", "last_thread_id", "history",
    "pending_plan", "pending_digest", "updated_at"
FROM "sms_contexts"
ON CONFLICT ("organization_id", "channel", "chat_id") DO NOTHING;

ALTER TABLE "org_members" ADD COLUMN "telegram_chat_id" VARCHAR(64);
CREATE UNIQUE INDEX "org_members_telegram_chat_id_key" ON "org_members"("telegram_chat_id");
