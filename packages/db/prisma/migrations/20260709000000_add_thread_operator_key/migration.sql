-- One durable operator thread per binding: the key is the binding ref
-- (imessage:<senderId> / telegram:<chatId>). NULL for every non-operator thread,
-- so existing rows are unaffected (Postgres treats NULLs as distinct in the unique index).
ALTER TABLE "threads" ADD COLUMN "operator_key" TEXT;

CREATE UNIQUE INDEX "threads_organization_id_operator_key_key" ON "threads"("organization_id", "operator_key");
