import { classifyPerson, personSubject } from '@shopkeeper/agent/person-name';
import { isReadToolName, PLAN_STEP_LABELS } from '@shopkeeper/agent/tools';
import type { RequestFacts } from '@shopkeeper/agent/classifier-signals';
import { firstDraftExcerpt } from '../../message-handlers/operator/operator-ledger.js';
import { formatAlternativeMention, formatDeadlineLead, formatRequestPhrase } from '../briefing-fields.js';
import { cleanBriefingText, endClause, truncateBriefingText } from './text.js';
import { lowerFirst } from '../../lib/sentence-case.js';
import type { SystemRequestKind } from '../../message-handlers/shared/request-display.js';

/** Presentation evidence only; execution always uses the original pending plan. */
export interface ConversationBrief {
  person: string;
  sourceText: string;
  requestContext: string;
  request: string;
  draft: string | null;
  draftText: string | null;
  actions: string[];
  question: string | null;
  reason: string | null;
  deadline: string | null;
  threadUrl?: string;
}

export function buildConversationBrief(params: {
  customerName: string | null;
  channelType?: string | null;
  verifiedOrders?: readonly string[];
  sourceText?: string | null;
  facts?: RequestFacts | null;
  topic?: string | null;
  rawToolCalls?: readonly { name: string; input?: unknown }[];
  operatorQuestion?: string | null;
  escalationReason?: string | null;
  systemEvent?: SystemRequestKind;
  now: Date;
}): ConversationBrief {
  const sourceText = params.systemEvent ? '' : cleanBriefingText(params.sourceText);
  const person = personSubject(classifyPerson({
    customerName: params.customerName,
    channelType: params.channelType,
    verifiedOrders: params.verifiedOrders,
    followingText: sourceText || params.facts?.order || '',
  }));
  const facts = params.facts;
  let requestContext = '';
  if (facts && facts.ask !== 'none' && facts.ask !== 'other') {
    const alternativeMention = facts.alternative ? formatAlternativeMention(facts.alternative) : null;
    requestContext = endClause([
      `${person} ${formatRequestPhrase(facts)}`,
      facts.order ? `(${facts.order})` : '',
      alternativeMention ? `and mentioned ${alternativeMention} as an alternative` : '',
    ].filter(Boolean).join(' '));
  } else if (params.topic) {
    requestContext = `${person} wrote about ${cleanBriefingText(params.topic)}.`;
  }
  const request = params.systemEvent === 'return_arrival'
    ? `A returned item from ${person} has arrived.`
    : params.systemEvent === 'delivery_exception'
      ? `There's a delivery issue with ${person}'s order.`
      : sourceText
    ? `${person} wrote: "${truncateBriefingText(sourceText, 360)}"`
    : requestContext || `${person} needs your review.`;
  const calls = params.rawToolCalls ?? [];
  const draftText = firstDraftExcerpt(calls);
  const firstSend = calls.find((call) => call.name === 'send_reply' || call.name === 'send_email');
  const actions = calls.filter((call) => !isReadToolName(call.name)
    && call !== firstSend && call.name !== 'ask_operator')
    .map((call) => {
      const label = PLAN_STEP_LABELS[call.name] ?? call.name.replaceAll('_', ' ');
      const input = call.input as Record<string, unknown> | null;
      if (call.name === 'create_refund' && input && typeof input.amount === 'number' && Number.isFinite(input.amount)) {
        const currency = typeof input.currency === 'string' ? ` ${input.currency}` : '';
        return `issue a refund of ${input.amount}${currency}`;
      }
      if (call.name === 'send_reply') return 'send another reply';
      if (call.name === 'send_email') return 'send a separate email';
      if (call.name === 'escalate_to_human') return 'hand the conversation over to you';
      if (call.name === 'add_internal_note') return 'add an internal note';
      return lowerFirst(label);
    });
  const questionCall = calls.find((call) => call.name === 'ask_operator');
  const questionInput = questionCall?.input as { question?: unknown } | undefined;
  const question = typeof questionInput?.question === 'string'
    ? cleanBriefingText(questionInput.question) : cleanBriefingText(params.operatorQuestion) || null;
  const escalation = calls.find((call) => call.name === 'escalate_to_human')?.input as { reason?: unknown } | undefined;
  const reason = cleanBriefingText(typeof escalation?.reason === 'string' ? escalation.reason : params.escalationReason) || null;
  return {
    person, sourceText, requestContext: params.systemEvent ? '' : requestContext,
    request, draftText, actions, question, reason,
    draft: draftText ? `I've drafted a reply: "${cleanBriefingText(draftText)}"` : null,
    deadline: facts ? formatDeadlineLead(facts, params.now) : null,
  };
}

export function formatConversationParagraph(
  conversation: ConversationBrief,
  kind: 'approval' | 'decision' | 'flagged',
  needsThreadReview: boolean,
): string {
  const { person, request, deadline, draft, actions, question, threadUrl } = conversation;
  const link = threadUrl ? ` Open thread: ${threadUrl}` : '';
  if (needsThreadReview) {
    return `I couldn't retrieve the request details for ${person}'s conversation. Please review the original message.${link}`;
  }
  const parts = [request];
  if (deadline) parts.push(endClause(deadline));
  if (kind === 'approval') {
    if (draft) parts.push(draft);
    if (actions.length) parts.push(`I'd ${new Intl.ListFormat('en').format(actions)}.`);
    parts.push(draft && actions.length === 0 ? 'Shall I send it?' : 'Shall I go ahead with this plan?');
  } else if (kind === 'decision') {
    if (conversation.reason) parts.push(endClause(`This needs your help: ${conversation.reason}`));
    parts.push(question || 'How would you like me to handle this?');
  } else {
    parts.push("I'm not sure this is a genuine customer enquiry. Should I keep it or mark it as spam?");
  }
  return parts.join(' ') + (actions.length > 0 || conversation.draftText?.endsWith('…') ? link : '');
}
