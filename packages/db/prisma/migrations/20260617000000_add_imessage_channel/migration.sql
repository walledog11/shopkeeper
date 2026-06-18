-- AlterEnum
ALTER TYPE "ChannelType" ADD VALUE 'imessage';

-- AlterTable
ALTER TABLE "threads" ADD COLUMN "external_space_id" TEXT;
