CREATE TABLE "shopify_privacy_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "shop_domain" VARCHAR(255) NOT NULL,
    "topic" VARCHAR(64) NOT NULL,
    "shopify_request_id" VARCHAR(255) NOT NULL,
    "shopify_customer_id" VARCHAR(255),
    "customer_email" VARCHAR(320),
    "order_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exported_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "shopify_privacy_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shopify_privacy_requests_status_check"
      CHECK ("status" IN ('pending', 'exported', 'completed'))
);

CREATE UNIQUE INDEX "shopify_privacy_requests_shop_domain_topic_request_id_key"
ON "shopify_privacy_requests"("shop_domain", "topic", "shopify_request_id");

CREATE INDEX "shopify_privacy_requests_organization_id_status_received_at_idx"
ON "shopify_privacy_requests"("organization_id", "status", "received_at");

CREATE INDEX "shopify_privacy_requests_status_received_at_idx"
ON "shopify_privacy_requests"("status", "received_at");

ALTER TABLE "shopify_privacy_requests"
ADD CONSTRAINT "shopify_privacy_requests_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
