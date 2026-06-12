import { noThread } from "./helpers.js";
import { defineTool, stringArg } from "./schema.js";
import type { SendEmailInput, SendReplyInput } from "./types.js";

export const MESSAGING_TOOL_DEFINITIONS = [
  defineTool({
    name: "send_reply",
    description:
      "Send a message to the customer on their channel (Instagram DM, email, etc.).",
    fields: {
      text: stringArg("The message text to send.", { required: true }),
    },
    category: "communication",
    group: "messaging",
    label: "Sent reply",
    planStepLabel: "Notify customer",
    execute: async (input: SendReplyInput, ctx) => (
      ctx.io ? ctx.io.sendReply(input) : noThread
    ),
  }),
  defineTool({
    name: "send_email",
    description:
      "Send an outbound email to any email address. Use this to proactively contact a customer (e.g. shipping delay notice) even when the current thread is not an email thread.",
    fields: {
      to: stringArg("Recipient email address in user@domain format (e.g. 'jane@example.com'). Must be a valid SMTP address — never a name or phone number.", { required: true }),
      subject: stringArg("Email subject line.", { required: true }),
      body: stringArg("Email body text.", { required: true }),
    },
    category: "communication",
    group: "messaging",
    label: "Sent email",
    planStepLabel: "Send email to customer",
    execute: async (input: SendEmailInput, ctx) => (
      ctx.io ? ctx.io.sendEmail(input) : noThread
    ),
  }),
] as const;
