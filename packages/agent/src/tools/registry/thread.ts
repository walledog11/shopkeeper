import { toolEscalated } from "../result.js";
import { noThread, threadStatuses } from "./helpers.js";
import { defineTool, stringArg } from "./schema.js";
import type {
  AddInternalNoteInput,
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
      "Hand off the ticket to the merchant when a tool failure, missing data, or out-of-scope question prevents you from helping. Marks the thread as pending with a 'needs_human' tag and logs the reason. Stop after calling this , do not attempt any other tools or send a reply.",
    fields: {
      reason: stringArg("A short explanation of why a human needs to take over (e.g. 'Customer is asking about wholesale pricing , out of scope', 'Shopify returned 503 on refund attempt').", { required: true }),
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
] as const;
