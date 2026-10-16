CREATE TABLE "waitlist_entries" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "attribution" JSONB NOT NULL,
    "consent_version" VARCHAR(40) NOT NULL DEFAULT 'early-access-v1',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "waitlist_entries_email_key" ON "waitlist_entries"("email");
CREATE INDEX "waitlist_entries_created_at_idx" ON "waitlist_entries"("created_at");
