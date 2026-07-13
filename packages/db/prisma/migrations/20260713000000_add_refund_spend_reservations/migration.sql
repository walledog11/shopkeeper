CREATE TYPE "RefundSpendReservationStatus" AS ENUM ('reserved', 'committed', 'released', 'unknown');

CREATE TABLE "refund_spend_reservations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "operation_key" VARCHAR(255) NOT NULL,
    "tool" VARCHAR(64) NOT NULL,
    "input" JSONB NOT NULL,
    "reserved_cents" INTEGER NOT NULL,
    "committed_cents" INTEGER,
    "status" "RefundSpendReservationStatus" NOT NULL DEFAULT 'reserved',
    "last_error" TEXT,
    "resolved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_spend_reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "refund_spend_reservations_amount_check" CHECK (
      "reserved_cents" > 0 AND ("committed_cents" IS NULL OR "committed_cents" > 0)
    ),
    CONSTRAINT "refund_spend_reservations_state_check" CHECK (
      ("status" IN ('reserved', 'unknown') AND "committed_cents" IS NULL AND "resolved_at" IS NULL)
      OR ("status" = 'committed' AND "committed_cents" IS NOT NULL AND "resolved_at" IS NOT NULL)
      OR ("status" = 'released' AND "committed_cents" IS NULL AND "resolved_at" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "refund_spend_reservations_organization_id_day_operation_key_key"
ON "refund_spend_reservations"("organization_id", "day", "operation_key");

CREATE INDEX "refund_spend_reservations_organization_id_day_status_idx"
ON "refund_spend_reservations"("organization_id", "day", "status");

CREATE INDEX "refund_spend_reservations_status_updated_at_idx"
ON "refund_spend_reservations"("status", "updated_at");

ALTER TABLE "refund_spend_reservations"
ADD CONSTRAINT "refund_spend_reservations_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
