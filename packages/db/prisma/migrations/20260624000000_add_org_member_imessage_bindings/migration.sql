-- iMessage operator-channel bindings: one merchant sender handle bound to an
-- org member per Spectrum line, mirroring org_member_telegram_chats.
CREATE TABLE "org_member_imessage_bindings" (
    "id" UUID NOT NULL,
    "org_member_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "sender_id" VARCHAR(255) NOT NULL,
    "space_id" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_member_imessage_bindings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "org_member_imessage_bindings_integration_id_sender_id_key" ON "org_member_imessage_bindings"("integration_id", "sender_id");

CREATE INDEX "org_member_imessage_bindings_org_member_id_idx" ON "org_member_imessage_bindings"("org_member_id");

ALTER TABLE "org_member_imessage_bindings" ADD CONSTRAINT "org_member_imessage_bindings_org_member_id_fkey" FOREIGN KEY ("org_member_id") REFERENCES "org_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "org_member_imessage_bindings" ADD CONSTRAINT "org_member_imessage_bindings_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
