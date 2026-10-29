import { noThread } from "./helpers.js";
import { booleanArg, defineTool, stringArg } from "./schema.js";
import type { SendEmailInput, SendReplyInput } from "./types.js";

// Every customer message the agent writes is one of these two fields, so the
// shop's voice is set here once for every mode that drafts one.
const CUSTOMER_MESSAGE_TEXT =
  "Exactly what they read. Write it the way a person at the shop would: warm, plain, short sentences, no em dashes (—), bullet characters or markdown. Never describe their photos or attachments back to them. Order and tracking numbers are the only store references to mention; leave out internal ones such as a return's.";

export const MESSAGING_TOOL_DEFINITIONS = [
  defineTool({
    name: "send_reply",
    description:
      "Send a message to the customer on their channel (Instagram DM, email, etc.).",
    fields: {
      text: stringArg(CUSTOMER_MESSAGE_TEXT, { required: true, nonBlank: true }),
      await_response: booleanArg("Set true only when this reply asks the customer for information required to continue the current task."),
      promises_follow_up: booleanArg("Set true when this reply tells the customer that you or anyone at the store will do something later, such as look into it, pass it along, or get back to them. Nothing does that work on its own, so the merchant approves the reply before it is sent."),
    },
    category: "communication",
    group: "messaging",
    capabilities: ["thread-io"],
    label: "Sent reply",
    planStepLabel: "Notify customer",
    requiredReceiptVersion: 1,
    execute: async (input: SendReplyInput, ctx) => (
      ctx.io ? (ctx.execution ? ctx.io.sendReply(input, ctx.execution) : ctx.io.sendReply(input)) : noThread
    ),
  }),
  defineTool({
    name: "send_email",
    description:
      "Send an outbound email to any email address. Use this to proactively contact a customer (e.g. shipping delay notice) even when the current thread is not an email thread.",
    fields: {
      to: stringArg("Recipient email address in user@domain format (e.g. 'jane@example.com'). Must be a valid SMTP address — never a name or phone number.", { required: true, nonBlank: true }),
      subject: stringArg("Email subject line.", { required: true, nonBlank: true }),
      body: stringArg(CUSTOMER_MESSAGE_TEXT, { required: true, nonBlank: true }),
    },
    category: "communication",
    group: "messaging",
    capabilities: ["thread-io"],
    label: "Sent email",
    planStepLabel: "Send email to customer",
    requiredReceiptVersion: 1,
    execute: async (input: SendEmailInput, ctx) => (
      ctx.io ? (ctx.execution ? ctx.io.sendEmail(input, ctx.execution) : ctx.io.sendEmail(input)) : noThread
    ),
  }),
] as const;
