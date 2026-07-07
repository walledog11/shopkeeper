import { toolEscalated } from "../result.js";
import { noThread, threadStatuses } from "./helpers.js";
import { defineTool, stringArg } from "./schema.js";
import type {
  AddInternalNoteInput,
  AskOperatorInput,
  EscalateToHumanInput,
  UpdateThreadStatusInput,
  UpdateThreadTagInput,
} from "./types.js";

export const THREAD_TOOL_DEFINITIONS = [
  defineTool({
    name: "add_internal_note",
    description:
      "Add an internal note to the support thread. Notes are visible only to agents, not the customer. Always call this to document what you did.",
    fields: {
      text: stringArg("Note content.", { required: true }),
    },
    category: "internal",
    group: "thread",
    label: "Added internal note",
    planStepLabel: "Add internal note",
    execute: async (input: AddInternalNoteInput, ctx) => (
      ctx.io ? ctx.io.addInternalNote(input) : noThread
    ),
  }),
  defineTool({
    name: "update_thread_status",
    description: "Update the status of the support thread.",
    fields: {
      status: stringArg("New status for the thread.", { required: true, enum: threadStatuses }),
    },
    category: "internal",
    group: "thread",
    label: "Updated thread status",
    planStepLabel: "Update ticket status",
    execute: async (input: UpdateThreadStatusInput, ctx) => (
      ctx.io ? ctx.io.updateThreadStatus(input) : noThread
    ),
  }),
  defineTool({
    name: "update_thread_tag",
    description: "Update the topic tag on the support thread.",
    fields: {
      tag: stringArg("New tag (e.g. 'Shipping', 'Returns', 'Billing').", { required: true }),
    },
    category: "internal",
    group: "thread",
    label: "Updated thread tag",
    planStepLabel: "Update ticket tag",
    execute: async (input: UpdateThreadTagInput, ctx) => (
      ctx.io ? ctx.io.updateThreadTag(input) : noThread
    ),
  }),
  defineTool({
    name: "escalate_to_human",
    description:
      "Hand off the ticket to the merchant when a tool failure, missing data, or out-of-scope question prevents you from helping. Marks the thread as pending with a 'needs_human' tag and logs the reason. Stop after calling this — do not attempt any other tools or send a reply.",
    fields: {
      reason: stringArg("A short explanation of why a human needs to take over (e.g. 'Customer is asking about wholesale pricing — out of scope', 'Shopify returned 503 on refund attempt').", { required: true }),
    },
    category: "internal",
    group: "thread",
    label: "Escalated to merchant",
    planStepLabel: "Escalate to merchant",
    execute: async (input: EscalateToHumanInput, ctx) => {
      const reason = input.reason.trim() || "No reason provided";
      await ctx.escalate(reason);
      return toolEscalated(reason);
    },
  }),
  defineTool({
    name: "ask_operator",
    description:
      "Ask the merchant one clarifying question when a single missing fact or decision is all that stands between you and finishing the ticket — e.g. an unstated policy (\"do we ship internationally?\") or a one-off judgment call only the merchant can make. Never ask about things the order data already answers, like whether or when an order will ship. Use this instead of guessing or telling the customer to contact the store another way. The merchant answers, then you draft the customer reply. Do NOT use it for out-of-scope, fraud, safety, contradictory requests, or money/identity uncertainty — those stay escalate_to_human. The test: would the merchant's one-line answer let you complete the ticket? If yes, ask; if no, escalate. Stop after calling this — do not send a reply.",
    fields: {
      question: stringArg("The specific question for the merchant, phrased so a one-line answer unblocks the ticket (e.g. 'Do we ship to Canada, and at what rate?').", { required: true }),
    },
    category: "internal",
    group: "thread",
    label: "Asked the merchant",
    planStepLabel: "Ask the merchant",
    execute: async (input: AskOperatorInput, ctx) => {
      const question = input.question.trim() || "No question provided";
      if (ctx.askOperator) await ctx.askOperator(question);
      return toolEscalated(question);
    },
  }),
] as const;
