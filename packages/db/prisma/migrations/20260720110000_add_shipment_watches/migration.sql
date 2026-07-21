-- CreateEnum
CREATE TYPE "ShipmentWatchIssueType" AS ENUM ('exception', 'stalled');

-- CreateEnum
CREATE TYPE "ShipmentWatchStatus" AS ENUM ('open', 'plan_pushed', 'skipped');

-- CreateTable
CREATE TABLE "shipment_watches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "thread_id" UUID,
    "order_id" VARCHAR(32) NOT NULL,
    "tracking_number" VARCHAR(64) NOT NULL,
    "tracking_company" VARCHAR(64),
    "issue_type" "ShipmentWatchIssueType" NOT NULL,
    "issue_summary" VARCHAR(255),
    "status" "ShipmentWatchStatus" NOT NULL DEFAULT 'open',
    "detected_at" TIMESTAMPTZ,
    "plan_pushed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_watches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipment_watches_organization_id_tracking_number_key" ON "shipment_watches"("organization_id", "tracking_number");

-- CreateIndex
CREATE INDEX "shipment_watches_organization_id_status_idx" ON "shipment_watches"("organization_id", "status");

-- CreateIndex
CREATE INDEX "shipment_watches_organization_id_order_id_idx" ON "shipment_watches"("organization_id", "order_id");

-- AddForeignKey
ALTER TABLE "shipment_watches" ADD CONSTRAINT "shipment_watches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_watches" ADD CONSTRAINT "shipment_watches_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
