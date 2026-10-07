CREATE INDEX "messages_org_thread_chronology_idx"
ON "messages" ("organization_id", "thread_id", "sent_at" DESC, "id" DESC);
