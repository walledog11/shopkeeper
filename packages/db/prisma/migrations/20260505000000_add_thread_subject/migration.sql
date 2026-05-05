-- Email subject preserved separately from `tag` so the AI classifier doesn't
-- clobber the customer-visible inquiry title.
ALTER TABLE "threads" ADD COLUMN "subject" TEXT;
