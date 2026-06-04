-- CreateTable: one row per Telegram chat bound to an org member.
-- Migrates existing telegram_chat_id data from org_members before dropping the column.

CREATE TABLE "org_member_telegram_chats" (
    "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
    "org_member_id" UUID        NOT NULL,
    "chat_id"       VARCHAR(64) NOT NULL,
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "org_member_telegram_chats_pkey" PRIMARY KEY ("id")
);

-- Migrate existing bindings before dropping the column
INSERT INTO "org_member_telegram_chats" ("org_member_id", "chat_id")
SELECT "id", "telegram_chat_id"
FROM "org_members"
WHERE "telegram_chat_id" IS NOT NULL;

-- Indexes & constraints
CREATE UNIQUE INDEX "org_member_telegram_chats_chat_id_key" ON "org_member_telegram_chats"("chat_id");
CREATE INDEX "org_member_telegram_chats_org_member_id_idx" ON "org_member_telegram_chats"("org_member_id");

-- FK
ALTER TABLE "org_member_telegram_chats"
    ADD CONSTRAINT "org_member_telegram_chats_org_member_id_fkey"
    FOREIGN KEY ("org_member_id") REFERENCES "org_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop old column
ALTER TABLE "org_members" DROP COLUMN "telegram_chat_id";
