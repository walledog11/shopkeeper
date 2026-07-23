-- CreateEnum
CREATE TYPE "FollowUpWatchKind" AS ENUM ('refund', 'exchange');

-- CreateEnum
CREATE TYPE "FollowUpWatchStatus" AS ENUM ('open', 'notified', 'skipped');

-- CreateTable
CREATE TABLE "follow_up_watches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "thread_id" UUID,
    "order_id" VARCHAR(32) NOT NULL,
    "kind" "FollowUpWatchKind" NOT NULL,
    "status" "FollowUpWatchStatus" NOT NULL DEFAULT 'open',
    "notified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_up_watches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "follow_up_watches_organization_id_order_id_key" ON "follow_up_watches"("organization_id", "order_id");

-- CreateIndex
CREATE INDEX "follow_up_watches_organization_id_status_idx" ON "follow_up_watches"("organization_id", "status");

-- AddForeignKey
ALTER TABLE "follow_up_watches" ADD CONSTRAINT "follow_up_watches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_watches" ADD CONSTRAINT "follow_up_watches_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
