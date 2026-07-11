-- Operator context is now pending-state only. The last-order-number, last-thread-id,
-- and rolling history columns stopped being consumed once the merchant's chat became
-- one durable operator thread (the agent reads that thread's messages, not this side
-- table). Drop the vestiges.
ALTER TABLE "operator_contexts" DROP COLUMN "last_order_number";
ALTER TABLE "operator_contexts" DROP COLUMN "last_thread_id";
ALTER TABLE "operator_contexts" DROP COLUMN "history";
