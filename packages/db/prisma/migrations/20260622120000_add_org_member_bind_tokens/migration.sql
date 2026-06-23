-- Single-use operator-channel bind tokens shared by dashboard and gateway.
CREATE TABLE "org_member_bind_tokens" (
    "token" VARCHAR(64) NOT NULL,
    "organization_id" UUID NOT NULL,
    "clerk_user_id" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_member_bind_tokens_pkey" PRIMARY KEY ("token")
);

CREATE INDEX "org_member_bind_tokens_expires_at_idx" ON "org_member_bind_tokens"("expires_at");

ALTER TABLE "org_member_bind_tokens" ADD CONSTRAINT "org_member_bind_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
