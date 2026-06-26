-- iMessage moves from a per-org Spectrum project to a single platform-owned line.
-- The binding no longer scopes by integration; the sender handle alone resolves
-- the member (and thus the org), so senderId becomes globally unique — matching
-- org_member_telegram_chats.chat_id.

-- DropForeignKey
ALTER TABLE "org_member_imessage_bindings" DROP CONSTRAINT "org_member_imessage_bindings_integration_id_fkey";

-- DropIndex
DROP INDEX "org_member_imessage_bindings_integration_id_sender_id_key";

-- AlterTable
ALTER TABLE "org_member_imessage_bindings" DROP COLUMN "integration_id";

-- CreateIndex
CREATE UNIQUE INDEX "org_member_imessage_bindings_sender_id_key" ON "org_member_imessage_bindings"("sender_id");
