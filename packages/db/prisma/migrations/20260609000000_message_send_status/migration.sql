-- Phase 1.5: async outbound email send status on messages.
ALTER TABLE "messages" ADD COLUMN "send_status" TEXT;
ALTER TABLE "messages" ADD COLUMN "provider_message_id" TEXT;
ALTER TABLE "messages" ADD COLUMN "send_error" TEXT;
