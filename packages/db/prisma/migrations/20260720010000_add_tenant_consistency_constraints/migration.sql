-- P5-03: make the audited tenant relationships database-enforced.
--
-- These foreign keys are installed NOT VALID so deployment only takes the
-- brief metadata locks needed to begin protecting new writes. Historical rows
-- are validated in a later, independently deployable migration after this
-- migration has been exercised against a production copy.
--
-- PostgreSQL 17's column-targeted SET NULL keeps organization_id intact when a
-- nullable parent is deleted.

-- Referenced compound identities. `id` is already globally unique, so these
-- builds cannot discover a duplicate. Prisma applies migration files inside a
-- transaction, so these use ordinary index builds; production table sizes and
-- lock timing must be reviewed before deployment.
CREATE UNIQUE INDEX "integrations_organization_id_id_key"
  ON "integrations"("organization_id", "id");
CREATE UNIQUE INDEX "customers_organization_id_id_key"
  ON "customers"("organization_id", "id");
CREATE UNIQUE INDEX "threads_organization_id_id_key"
  ON "threads"("organization_id", "id");
CREATE UNIQUE INDEX "messages_organization_id_id_key"
  ON "messages"("organization_id", "id");
CREATE UNIQUE INDEX "messages_organization_id_id_thread_id_key"
  ON "messages"("organization_id", "id", "thread_id");
CREATE UNIQUE INDEX "plan_executions_organization_id_id_key"
  ON "plan_executions"("organization_id", "id");
CREATE UNIQUE INDEX "knowledge_bases_organization_id_id_key"
  ON "knowledge_bases"("organization_id", "id");
CREATE UNIQUE INDEX "kb_articles_organization_id_id_key"
  ON "kb_articles"("organization_id", "id");

-- Supporting indexes for nullable references which previously had no useful
-- lookup path during parent deletion or reconciliation.
CREATE INDEX "threads_reply_integration_id_organization_id_idx"
  ON "threads"("reply_integration_id", "organization_id");
CREATE INDEX "threads_cached_plan_message_id_organization_id_idx"
  ON "threads"("cached_plan_message_id", "organization_id");
CREATE INDEX "agent_actions_organization_id_customer_id_idx"
  ON "agent_actions"("organization_id", "customer_id");
CREATE INDEX "kb_citations_thread_id_organization_id_idx"
  ON "kb_citations"("thread_id", "organization_id");

ALTER TABLE "threads"
  ADD CONSTRAINT "threads_tenant_customer_fkey"
  FOREIGN KEY ("organization_id", "customer_id")
  REFERENCES "customers"("organization_id", "id")
  ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID;

ALTER TABLE "threads"
  ADD CONSTRAINT "threads_tenant_reply_integration_fkey"
  FOREIGN KEY ("organization_id", "reply_integration_id")
  REFERENCES "integrations"("organization_id", "id")
  ON DELETE SET NULL ("reply_integration_id") ON UPDATE NO ACTION NOT VALID;

-- Besides tenant ownership, a cached plan source must belong to this thread.
ALTER TABLE "threads"
  ADD CONSTRAINT "threads_tenant_cached_plan_message_fkey"
  FOREIGN KEY ("organization_id", "cached_plan_message_id", "id")
  REFERENCES "messages"("organization_id", "id", "thread_id")
  ON DELETE SET NULL ("cached_plan_message_id") ON UPDATE NO ACTION NOT VALID;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_tenant_thread_fkey"
  FOREIGN KEY ("organization_id", "thread_id")
  REFERENCES "threads"("organization_id", "id")
  ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_tenant_integration_fkey"
  FOREIGN KEY ("organization_id", "integration_id")
  REFERENCES "integrations"("organization_id", "id")
  ON DELETE SET NULL ("integration_id") ON UPDATE NO ACTION NOT VALID;

ALTER TABLE "agent_actions"
  ADD CONSTRAINT "agent_actions_tenant_thread_fkey"
  FOREIGN KEY ("organization_id", "thread_id")
  REFERENCES "threads"("organization_id", "id")
  ON DELETE SET NULL ("thread_id") ON UPDATE NO ACTION NOT VALID;

ALTER TABLE "agent_actions"
  ADD CONSTRAINT "agent_actions_tenant_customer_fkey"
  FOREIGN KEY ("organization_id", "customer_id")
  REFERENCES "customers"("organization_id", "id")
  ON DELETE SET NULL ("customer_id") ON UPDATE NO ACTION NOT VALID;

ALTER TABLE "agent_actions"
  ADD CONSTRAINT "agent_actions_tenant_execution_fkey"
  FOREIGN KEY ("organization_id", "execution_id")
  REFERENCES "plan_executions"("organization_id", "id")
  ON DELETE SET NULL ("execution_id") ON UPDATE NO ACTION NOT VALID;

ALTER TABLE "plan_executions"
  ADD CONSTRAINT "plan_executions_tenant_thread_fkey"
  FOREIGN KEY ("organization_id", "thread_id")
  REFERENCES "threads"("organization_id", "id")
  ON DELETE SET NULL ("thread_id") ON UPDATE NO ACTION NOT VALID;

ALTER TABLE "plan_executions"
  ADD CONSTRAINT "plan_executions_tenant_source_message_fkey"
  FOREIGN KEY ("organization_id", "source_message_id")
  REFERENCES "messages"("organization_id", "id")
  ON DELETE SET NULL ("source_message_id") ON UPDATE NO ACTION NOT VALID;

-- When thread_id is present, the source message must belong to that exact
-- thread as well as the same tenant. MATCH SIMPLE intentionally permits the
-- existing thread-less execution shape.
ALTER TABLE "plan_executions"
  ADD CONSTRAINT "plan_executions_tenant_source_message_thread_fkey"
  FOREIGN KEY ("organization_id", "source_message_id", "thread_id")
  REFERENCES "messages"("organization_id", "id", "thread_id")
  ON DELETE SET NULL ("source_message_id") ON UPDATE NO ACTION NOT VALID;

ALTER TABLE "kb_articles"
  ADD CONSTRAINT "kb_articles_tenant_knowledge_base_fkey"
  FOREIGN KEY ("organization_id", "knowledge_base_id")
  REFERENCES "knowledge_bases"("organization_id", "id")
  ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID;

ALTER TABLE "kb_citations"
  ADD CONSTRAINT "kb_citations_tenant_article_fkey"
  FOREIGN KEY ("organization_id", "kb_article_id")
  REFERENCES "kb_articles"("organization_id", "id")
  ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID;

ALTER TABLE "kb_citations"
  ADD CONSTRAINT "kb_citations_tenant_thread_fkey"
  FOREIGN KEY ("organization_id", "thread_id")
  REFERENCES "threads"("organization_id", "id")
  ON DELETE SET NULL ("thread_id") ON UPDATE NO ACTION NOT VALID;
