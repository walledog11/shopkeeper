import { toolEscalated } from "../result.js";
import { noThread } from "./helpers.js";
import { defineTool } from "./schema.js";
import { TOOL_INPUT_FIELDS } from "./input-fields.js";

/** The internal step that records a photo request. */
export const AWAIT_CUSTOMER_PHOTO_TOOL = "await_customer_photo";

/** The internal step that records an order the agent asked a sender to confirm. */
export const AWAIT_ORDER_VERIFICATION_TOOL = "await_order_verification";

export const THREAD_TOOL_DEFINITIONS = [
  defineTool({
    name: "add_internal_note",
    description:
      "Add an internal note to the support thread when the merchant explicitly requests one. Notes are visible only to agents, not the customer. Action outcomes are journaled automatically; do not add a separate note merely to document a tool call.",
    fields: TOOL_INPUT_FIELDS.add_internal_note,
    category: "internal",
    group: "thread",
    capabilities: ["thread-io"],
    label: "Added internal note",
    planStepLabel: "Add internal note",
    requiredReceiptVersion: 1,
    execute: async (input, ctx) => (
      ctx.io ? (ctx.execution ? ctx.io.addInternalNote(input, ctx.execution) : ctx.io.addInternalNote(input)) : noThread
    ),
  }),
  defineTool({
    name: "update_thread_status",
    description: "Update the status of the support thread.",
    fields: TOOL_INPUT_FIELDS.update_thread_status,
    category: "internal",
    group: "thread",
    capabilities: ["thread-io"],
    label: "Updated thread status",
    planStepLabel: "Update ticket status",
    requiredReceiptVersion: 1,
    execute: async (input, ctx) => (
      ctx.io ? (ctx.execution ? ctx.io.updateThreadStatus(input, ctx.execution) : ctx.io.updateThreadStatus(input)) : noThread
    ),
  }),
  defineTool({
    name: "update_thread_tag",
    description: "Update the topic tag on the support thread.",
    fields: TOOL_INPUT_FIELDS.update_thread_tag,
    category: "internal",
    group: "thread",
    capabilities: ["thread-io"],
    label: "Updated thread tag",
    planStepLabel: "Update ticket tag",
    requiredReceiptVersion: 1,
    execute: async (input, ctx) => (
      ctx.io ? (ctx.execution ? ctx.io.updateThreadTag(input, ctx.execution) : ctx.io.updateThreadTag(input)) : noThread
    ),
  }),
  // Offered only by the planner, and only on a damage claim that still needs
  // its photo (`damageEvidenceState`); no other tool set includes it.
  defineTool({
    name: AWAIT_CUSTOMER_PHOTO_TOOL,
    description:
      "Record that your reply asks the customer for a photo of the damaged or defective item, so their next message is read against that request. Call it beside the send_reply that asks for the photo. It sends nothing to the customer.",
    fields: TOOL_INPUT_FIELDS.await_customer_photo,
    category: "internal",
    group: "thread",
    capabilities: ["thread-io"],
    label: "Waiting for a photo of the damage",
    planStepLabel: "Wait for a photo of the damage",
    execute: async (input, ctx) => {
      const io = ctx.io;
      if (!io?.awaitCustomerPhoto) return noThread;
      return ctx.execution ? io.awaitCustomerPhoto(input, ctx.execution) : io.awaitCustomerPhoto(input);
    },
  }),
  // Offered only by the planner, on a direct-message thread whose sender has not
  // shown the order is theirs (`orderVerificationState`). The answer is compared
  // by gateway code, never by the model.
  defineTool({
    name: AWAIT_ORDER_VERIFICATION_TOOL,
    description:
      "Record that your reply asks the customer which order this is about, or to confirm an order is theirs by sending the email address or the shipping zip/postal code on it, so their next message is checked against the order. Call it beside the send_reply that asks. It sends nothing to the customer, and you never pass or judge the email or zip yourself.",
    fields: TOOL_INPUT_FIELDS.await_order_verification,
    category: "internal",
    group: "thread",
    capabilities: ["thread-io"],
    label: "Waiting for the customer to confirm the order",
    planStepLabel: "Ask them to confirm the order",
    execute: async (input, ctx) => {
      const io = ctx.io;
      if (!io?.awaitOrderVerification) return noThread;
      return ctx.execution ? io.awaitOrderVerification(input, ctx.execution) : io.awaitOrderVerification(input);
    },
  }),
  defineTool({
    name: "escalate_to_human",
    description:
      "Hand off the ticket to the merchant when a tool failure, missing data, or out-of-scope question prevents you from helping. Keeps the ticket open, records the escalation time, applies the 'needs_human' tag, and logs the reason. Stop after calling this — do not attempt any other tools or send a reply.",
    fields: TOOL_INPUT_FIELDS.escalate_to_human,
    category: "internal",
    group: "thread",
    capabilities: [],
    label: "Escalated to merchant",
    planStepLabel: "Escalate to merchant",
    execute: async (input, ctx) => {
      const reason = input.reason.trim() || "No reason provided";
      await ctx.escalate(reason);
      return toolEscalated(reason);
    },
  }),
  defineTool({
    name: "ask_operator",
    description:
      "Ask the merchant one clarifying question when a single missing fact or decision is all that stands between you and finishing the ticket — e.g. an unstated policy (\"do we ship internationally?\") or a one-off judgment call only the merchant can make. Never ask about things the order data already answers, like whether or when an order will ship. Use this instead of guessing or telling the customer to contact the store another way. The merchant answers, then you draft the customer reply. Do NOT use it for out-of-scope, fraud, safety, contradictory requests, or money/identity uncertainty — those stay escalate_to_human. The test: would the merchant's one-line answer let you complete the ticket? If yes, ask; if no, escalate. Stop after calling this — do not send a reply.",
    fields: TOOL_INPUT_FIELDS.ask_operator,
    category: "internal",
    group: "thread",
    capabilities: ["thread-io"],
    label: "Asked the merchant",
    planStepLabel: "Ask the merchant",
    execute: async (input, ctx) => {
      const question = input.question.trim() || "No question provided";
      if (ctx.askOperator) await ctx.askOperator(question);
      return toolEscalated(question);
    },
  }),
] as const;
