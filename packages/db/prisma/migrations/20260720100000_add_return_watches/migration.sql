-- CreateEnum
CREATE TYPE "ReturnWatchStatus" AS ENUM ('open', 'plan_pushed', 'skipped');

-- CreateTable
CREATE TABLE "return_watches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "thread_id" UUID,
    "source_agent_action_id" UUID,
    "order_id" VARCHAR(32) NOT NULL,
    "shopify_return_id" VARCHAR(128) NOT NULL,
    "return_name" VARCHAR(64),
    "tool" VARCHAR(32) NOT NULL,
    "status" "ReturnWatchStatus" NOT NULL DEFAULT 'open',
    "arrived_at" TIMESTAMPTZ,
    "plan_pushed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_watches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "return_watches_organization_id_shopify_return_id_key" ON "return_watches"("organization_id", "shopify_return_id");

-- CreateIndex
CREATE INDEX "return_watches_organization_id_status_idx" ON "return_watches"("organization_id", "status");

-- CreateIndex
CREATE INDEX "return_watches_organization_id_order_id_idx" ON "return_watches"("organization_id", "order_id");

-- AddForeignKey
ALTER TABLE "return_watches" ADD CONSTRAINT "return_watches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_watches" ADD CONSTRAINT "return_watches_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_watches" ADD CONSTRAINT "return_watches_source_agent_action_id_fkey" FOREIGN KEY ("source_agent_action_id") REFERENCES "agent_actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
