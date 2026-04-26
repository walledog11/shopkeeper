-- CreateTable: kb_citations (logs each KB article surfaced by search_kb)
CREATE TABLE "kb_citations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kb_article_id" UUID NOT NULL,
    "thread_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kb_citations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kb_citations_organization_id_created_at_idx" ON "kb_citations"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "kb_citations_kb_article_id_created_at_idx" ON "kb_citations"("kb_article_id", "created_at");

-- AddForeignKey
ALTER TABLE "kb_citations" ADD CONSTRAINT "kb_citations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_citations" ADD CONSTRAINT "kb_citations_kb_article_id_fkey" FOREIGN KEY ("kb_article_id") REFERENCES "kb_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_citations" ADD CONSTRAINT "kb_citations_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
