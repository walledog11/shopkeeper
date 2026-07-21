import { defineTool, stringArg, toolError, toolOk, type AgentToolDefinition } from '@shopkeeper/agent/tools';
import type { OperatorContext } from '../operator-context.js';
import {
  findDigestThread,
  formatDigestReplyConfirmation,
  formatDigestSpamConfirmation,
  markDigestThreadSpam,
  sendDigestThreadReply,
} from './digest-triage.js';

export interface OperatorDigestToolDeps {
  organizationId: string;
  context: OperatorContext;
}

interface MarkTicketSpamInput {
  ticket_id: string;
}

interface SendTicketReplyInput {
  ticket_id: string;
  text: string;
}

const NO_PENDING_DIGEST = 'Error: no digest is awaiting triage.';
const NOT_IN_DIGEST = 'Error: that ticket is not in the current digest. Use get_ticket for other inbox tickets.';
const TICKET_NOT_FOUND = 'Error: no flagged ticket with that id was found.';

export function buildOperatorDigestTools(
  deps: OperatorDigestToolDeps,
): Record<string, AgentToolDefinition> {
  const { organizationId, context } = deps;

  const markTicketSpam = defineTool({
    name: 'mark_ticket_spam',
    description:
      'Mark a flagged digest ticket as spam when the merchant clearly wants to dismiss it. Use the ticket id from the digest list. Ask one short confirming question first if their intent is ambiguous.',
    fields: {
      ticket_id: stringArg('The flagged ticket id from the digest list.', { required: true }),
    },
    category: 'action',
    group: 'thread',
    capabilities: [],
    label: 'Marked digest ticket as spam',
    planStepLabel: 'Mark digest ticket as spam',
    policy: { categoryPermission: false },
    execute: async (input: MarkTicketSpamInput) => {
      const pendingDigest = context.pendingDigest;
      if (!pendingDigest) return toolError(NO_PENDING_DIGEST);

      const result = await markDigestThreadSpam(organizationId, pendingDigest, input.ticket_id);
      if (!result.ok) {
        if (result.reason === 'not_in_digest') return toolError(NOT_IN_DIGEST);
        return toolError(TICKET_NOT_FOUND);
      }

      return toolOk(formatDigestSpamConfirmation(result.customerName, result.index));
    },
  });

  const sendTicketReply = defineTool({
    name: 'send_ticket_reply',
    description:
      'Send a customer reply on a flagged digest ticket when the merchant supplies the message text. Use the ticket id from the digest list. Multiple digest actions may run in one turn.',
    fields: {
      ticket_id: stringArg('The flagged ticket id from the digest list.', { required: true }),
      text: stringArg('The exact reply text to send to the customer.', { required: true }),
    },
    category: 'action',
    group: 'thread',
    capabilities: [],
    label: 'Sent digest ticket reply',
    planStepLabel: 'Send digest ticket reply',
    policy: { categoryPermission: false },
    execute: async (input: SendTicketReplyInput) => {
      const pendingDigest = context.pendingDigest;
      if (!pendingDigest) return toolError(NO_PENDING_DIGEST);

      const index = pendingDigest.threadIds.indexOf(input.ticket_id);
      if (index < 0) return toolError(NOT_IN_DIGEST);

      const thread = await findDigestThread(organizationId, pendingDigest, input.ticket_id);
      if (!thread) return toolError(TICKET_NOT_FOUND);

      const response = await sendDigestThreadReply(input.ticket_id, input.text);
      if (!response.ok) {
        return toolError(response.outcome === 'unknown'
          ? 'I could not confirm whether that reply sent. Check the ticket before trying again.'
          : 'Reply failed to send. Please try again from the dashboard.');
      }

      return toolOk(formatDigestReplyConfirmation(thread.customer.name, index + 1, input.text));
    },
  });

  return {
    mark_ticket_spam: markTicketSpam,
    send_ticket_reply: sendTicketReply,
  };
}
