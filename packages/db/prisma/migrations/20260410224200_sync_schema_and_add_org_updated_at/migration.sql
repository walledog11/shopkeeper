/*
  Warnings:

  - A unique constraint covering the columns `[stripe_customer_id]` on the table `organizations` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripe_subscription_id]` on the table `organizations` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChannelType" ADD VALUE 'shopify';
ALTER TYPE "ChannelType" ADD VALUE 'sms';
ALTER TYPE "ChannelType" ADD VALUE 'sms_agent';

-- AlterEnum
ALTER TYPE "SenderType" ADD VALUE 'note';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "deleted_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "integrations" ADD COLUMN     "from_email" VARCHAR(255),
ADD COLUMN     "metadata" JSONB DEFAULT '{}',
ADD COLUMN     "token_expires_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "deleted_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "stripe_customer_id" VARCHAR(255),
ADD COLUMN     "stripe_price_id" VARCHAR(255),
ADD COLUMN     "stripe_status" VARCHAR(50),
ADD COLUMN     "stripe_subscription_id" VARCHAR(255),
ADD COLUMN     "trial_ends_at" TIMESTAMPTZ,
ADD COLUMN     "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "threads" ADD COLUMN     "archived_at" TIMESTAMPTZ,
ADD COLUMN     "deleted_at" TIMESTAMPTZ,
ADD COLUMN     "shopify_customer_id" VARCHAR(255);

-- CreateTable
CREATE TABLE "sms_contexts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "phone_number" VARCHAR(20) NOT NULL,
    "last_order_number" VARCHAR(50),
    "last_thread_id" UUID,
    "history" JSONB NOT NULL DEFAULT '[]',
    "pending_plan" JSONB,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_members" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "clerk_user_id" VARCHAR(255) NOT NULL,
    "phone_number" VARCHAR(20),
    "phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canned_responses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canned_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_bases" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "source" VARCHAR(50) NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_articles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "knowledge_base_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kb_articles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sms_contexts_organization_id_idx" ON "sms_contexts"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "sms_contexts_organization_id_phone_number_key" ON "sms_contexts"("organization_id", "phone_number");

-- CreateIndex
CREATE INDEX "org_members_organization_id_idx" ON "org_members"("organization_id");

-- CreateIndex
CREATE INDEX "org_members_phone_number_idx" ON "org_members"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "org_members_organization_id_clerk_user_id_key" ON "org_members"("organization_id", "clerk_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_members_organization_id_phone_number_key" ON "org_members"("organization_id", "phone_number");

-- CreateIndex
CREATE INDEX "canned_responses_organization_id_idx" ON "canned_responses"("organization_id");

-- CreateIndex
CREATE INDEX "knowledge_bases_organization_id_idx" ON "knowledge_bases"("organization_id");

-- CreateIndex
CREATE INDEX "kb_articles_organization_id_idx" ON "kb_articles"("organization_id");

-- CreateIndex
CREATE INDEX "kb_articles_knowledge_base_id_idx" ON "kb_articles"("knowledge_base_id");

-- CreateIndex
CREATE INDEX "customers_deleted_at_idx" ON "customers"("deleted_at");

-- CreateIndex
CREATE INDEX "messages_deleted_at_idx" ON "messages"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_stripe_customer_id_key" ON "organizations"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_stripe_subscription_id_key" ON "organizations"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "threads_organization_id_archived_at_status_idx" ON "threads"("organization_id", "archived_at", "status");

-- CreateIndex
CREATE INDEX "threads_deleted_at_idx" ON "threads"("deleted_at");

-- AddForeignKey
ALTER TABLE "sms_contexts" ADD CONSTRAINT "sms_contexts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canned_responses" ADD CONSTRAINT "canned_responses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
