import { noThread } from "./helpers.js";
import { defineTool } from "./schema.js";
import { TOOL_INPUT_FIELDS } from "./input-fields.js";
export { SEND_EMAIL_FIELDS } from "./input-fields.js";

export const MESSAGING_TOOL_DEFINITIONS = [
  defineTool({
    name: "send_reply",
    description:
      "Send a message to the customer on their channel (Instagram DM, email, etc.).",
    fields: TOOL_INPUT_FIELDS.send_reply,
    category: "communication",
    group: "messaging",
    capabilities: ["thread-io"],
    label: "Sent reply",
    planStepLabel: "Notify customer",
    requiredReceiptVersion: 1,
    execute: async (input, ctx) => (
      ctx.io ? (ctx.execution ? ctx.io.sendReply(input, ctx.execution) : ctx.io.sendReply(input)) : noThread
    ),
  }),
  defineTool({
    name: "send_email",
    description:
      "Send an outbound email to any email address. Use this to proactively contact a customer (e.g. shipping delay notice) even when the current thread is not an email thread.",
    fields: TOOL_INPUT_FIELDS.send_email,
    category: "communication",
    group: "messaging",
    capabilities: ["thread-io"],
    label: "Sent email",
    planStepLabel: "Send email to customer",
    requiredReceiptVersion: 1,
    execute: async (input, ctx) => (
      ctx.io ? (ctx.execution ? ctx.io.sendEmail(input, ctx.execution) : ctx.io.sendEmail(input)) : noThread
    ),
  }),
] as const;
