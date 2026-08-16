/** Instruction for Rewrite / Refresh — always replan as a customer reply, not re-run auto-plan text. */
export const REPLAN_CUSTOMER_REPLY_INSTRUCTION =
  "Draft a helpful reply to the customer's latest message in this thread. You are their support channel — answer here with send_reply. Do not tell them to email, DM, or contact the store another way. Only escalate_to_human if the request is truly out of scope, unsafe, or needs a human judgment you cannot make."
