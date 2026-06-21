-- Store Telegram chat/user metadata for operator device labels in the dashboard.

ALTER TABLE "org_member_telegram_chats"
    ADD COLUMN "telegram_user_id" VARCHAR(64),
    ADD COLUMN "display_name" VARCHAR(255),
    ADD COLUMN "username" VARCHAR(255);
