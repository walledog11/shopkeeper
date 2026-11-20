import type { DbChannelType } from '@shopkeeper/db';
import { personObject } from '@shopkeeper/agent/person-name';
import type { WorkspaceNotice } from '../../../operator-email.js';
import type { ConfirmedOrder } from '../../../storefront-chat-verified-orders.js';
import type { RequestDisplay } from '../../shared/request-display.js';
import { endSentence } from '../../../lib/sentence-case.js';
import { channelNoun } from './headers.js';
import { formatCardOpening } from './format-plan.js';
import { formatQuestionMessage } from './format-question.js';
import type { ConversationStage } from './types.js';

interface TicketEmailInput {
  customerName: string | null;
  channelType: DbChannelType;
  requestDisplay: RequestDisplay;
  stage: ConversationStage;
  verifiedOrders?: readonly ConfirmedOrder[];
  sourceMessageText?: string | null;
}

/** What is waiting on the merchant, said after the phone card's own opening. */
export type TicketEmailAsk =
  | { kind: 'approval' }
  | { kind: 'invalid_plan' }
  | { kind: 'handoff'; blocker: string | null }
  | { kind: 'question'; question: string };

/**
 * The email a workspace with no linked phone gets for a ticket: the opening the
 * phone card has (who wrote and what they asked), then what is waiting. It
 * shows no draft and asks for no reply, because the merchant reviews and
 * approves in the app the email links to.
 */
export function formatTicketEmail(
  input: TicketEmailInput,
  ask: TicketEmailAsk,
): Pick<WorkspaceNotice, 'kind' | 'subject' | 'paragraphs'> {
  const { lines, person } = formatCardOpening(input);
  const conversation = `${channelNoun(input.channelType)} from ${personObject(person)}`;
  const opening = lines.join('\n');
  switch (ask.kind) {
    case 'approval':
      return {
        kind: 'approval',
        subject: `Waiting for your approval: ${conversation}`,
        paragraphs: [opening, "I've drafted a plan, and it's waiting for your approval."],
      };
    case 'invalid_plan':
      return {
        kind: 'handoff',
        subject: `Needs a look: ${conversation}`,
        paragraphs: [opening, "I drafted a plan, but it didn't pass its checks, so it can't run as written."],
      };
    case 'handoff':
      return {
        kind: 'handoff',
        subject: `Over to you: ${conversation}`,
        paragraphs: [opening, ask.blocker ? endSentence(ask.blocker) : "I can't take this one any further, so it's over to you."],
      };
    case 'question':
      return {
        kind: 'question',
        subject: `Question for you: ${conversation}`,
        paragraphs: [formatQuestionMessage({ ...input, question: ask.question })],
      };
  }
}
