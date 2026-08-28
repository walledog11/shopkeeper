import { PLAN_STEP_LABELS } from '@shopkeeper/agent/tools';
import { classifyPerson, personLabel } from '@shopkeeper/agent/person-name';
import { formatFactsBriefingLine } from '../briefing-fields.js';
import { lowerFirst } from '../../lib/sentence-case.js';
import { isRecord } from '../../lib/typing.js';
import {
  formatRequestDisplayLine,
  unavailableRequestDisplay,
} from '../../message-handlers/request-display.js';
import {
  HANDOFF_VERBATIM_MAX,
  PHONE_LINE_MAX,
  FLAGGED_STRUCTURED_LINE_MAX,
} from './constants.js';
import { askLessTopic, rowAskLess, rowRequestFacts } from './request-facts.js';
import {
  capitalize,
  cleanBriefingText,
  countWord,
  endClause,
  truncateBriefingText,
} from './text.js';
import type { BriefingTicketRow } from './types.js';
import type { RequestFacts } from '@shopkeeper/agent/classifier-signals';
import type { RequestDisplay } from '../../message-handlers/request-display.js';
import { requestDisplayHasContext } from '../../message-handlers/request-display.js';

function extractRefundAmount(input: unknown): string | null {
  if (!isRecord(input)) return null;
  const amount = input.amount;
  if (typeof amount === 'number' && Number.isFinite(amount)) {
    return `$${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
  }
  return null;
}

/** What the briefing calls the person on a ticket. */
function briefingPersonName(
  customerName: string | null,
  channelType: string | null,
  verifiedOrders: readonly string[] = [],
  followingText = '',
): string | null {
  return personLabel(classifyPerson({ customerName, channelType, verifiedOrders, followingText }));
}

function approvalActionHead(
  rawToolCalls: Array<{ id: string; name: string; input?: unknown }>,
): string | null {
  const actionable = rawToolCalls.filter((toolCall) => (
    !toolCall.name.startsWith('get_') && !toolCall.name.startsWith('search_')
  ));
  const primary = actionable.find((toolCall) => toolCall.name !== 'add_internal_note')
    ?? actionable[0];
  if (!primary) return null;

  const label = primary.name === 'send_reply'
    ? 'Reply'
    : primary.name === 'send_email'
      ? 'Email'
      : capitalize(PLAN_STEP_LABELS[primary.name] ?? primary.name.replace(/_/g, ' '));
  const rest = actionable.length - 1;
  return rest > 0 ? `${label} + ${countWord(rest)} more` : label;
}

function handoffSubject(thread: BriefingTicketRow, followingText: string): string {
  return briefingPersonName(
    thread.customer?.name ?? null,
    thread.channelType ?? null,
    thread.verifiedOrders ?? [],
    followingText,
  ) ?? 'Someone';
}

function factsHandoffLine(thread: BriefingTicketRow, now: Date): string | null {
  const facts = rowRequestFacts(thread);
  if (!facts) return null;
  const line = formatFactsBriefingLine(
    facts,
    handoffSubject(thread, facts.order ?? ''),
    now,
    rowAskLess(thread),
  );
  return line ? truncateBriefingText(line, PHONE_LINE_MAX) : null;
}

function sourceHandoffLine(thread: BriefingTicketRow): string | null {
  const message = cleanBriefingText(thread.pendingMessage);
  if (!message) return null;
  const subject = handoffSubject(thread, message);
  const complete = message.length <= HANDOFF_VERBATIM_MAX;
  const verb = complete && message.includes('?') ? 'asked' : 'wrote';
  const quote = complete ? message : truncateBriefingText(message, PHONE_LINE_MAX);
  return `${subject} ${verb}: "${quote}"`;
}

/** True only when the briefing can show source-grounded request context. */
export function hasHandoffRequestContext(
  thread: BriefingTicketRow,
  now: Date = new Date(),
): boolean {
  return factsHandoffLine(thread, now) !== null || sourceHandoffLine(thread) !== null;
}

export function formatBlockedTicketLine(thread: BriefingTicketRow, now: Date = new Date()): string {
  const message = cleanBriefingText(thread.pendingMessage);
  const sourceLine = sourceHandoffLine(thread);

  if (message && message.length <= HANDOFF_VERBATIM_MAX) {
    return sourceLine!;
  }

  const factsLine = factsHandoffLine(thread, now);
  if (factsLine) return factsLine;

  if (sourceLine) return sourceLine;
  return formatTicketLine(thread);
}

export function formatEscalatedTicketLine(thread: BriefingTicketRow, now: Date = new Date()): string {
  const factsLine = factsHandoffLine(thread, now);
  if (factsLine) return `${endClause(factsLine)} I flagged it for you.`;
  const sourceLine = sourceHandoffLine(thread);
  if (sourceLine) {
    const sourceClause = /[.!?…]"$/.test(sourceLine) ? sourceLine : `${sourceLine}.`;
    return `${sourceClause} I flagged it for you.`;
  }
  return `${endClause(formatRequestDisplayLine(unavailableRequestDisplay(), null, now))} I flagged it for you.`;
}

export function formatFlaggedTicketLine(thread: BriefingTicketRow, now: Date = new Date()): string {
  const facts = rowRequestFacts(thread);
  const factsLine = facts
    ? formatFactsBriefingLine(
        facts,
        thread.customer.name ?? 'Someone new',
        now,
        rowAskLess(thread),
      )
    : null;
  if (factsLine) return endClause(truncateBriefingText(factsLine, FLAGGED_STRUCTURED_LINE_MAX));
  const sourceLine = sourceHandoffLine(thread);
  if (sourceLine) {
    return /[.!?…]"$/.test(sourceLine) ? sourceLine : `${sourceLine}.`;
  }
  return endClause(formatRequestDisplayLine(unavailableRequestDisplay(), null, now));
}

export function formatTicketLine(thread: BriefingTicketRow, now: Date = new Date()): string {
  const facts = rowRequestFacts(thread);
  if (facts) {
    const person = briefingPersonName(
      thread.customer?.name ?? null,
      thread.channelType ?? null,
      thread.verifiedOrders ?? [],
    );
    const line = formatFactsBriefingLine(facts, person, now, rowAskLess(thread));
    if (line) return line;
  }
  return formatRequestDisplayLine(unavailableRequestDisplay(), null, now);
}

export function formatApprovalItemLine(params: {
  customerName: string | null;
  channelType?: string | null;
  aiTitle?: string | null;
  rawToolCalls: Array<{ id: string; name: string; input?: unknown }>;
  actionLabel?: string;
  verifiedOrders?: readonly string[];
  requestFacts?: RequestFacts | null;
  noRequest?: boolean;
  now?: Date;
  requestDisplay?: RequestDisplay;
  sourceMessageText?: string | null;
}): string {
  const subject = briefingPersonName(
    params.customerName,
    params.channelType ?? null,
    params.verifiedOrders ?? [],
  ) ?? 'Someone';
  const refundAmount = extractRefundAmount(
    params.rawToolCalls.find((toolCall) => toolCall.name === 'create_refund')?.input,
  );
  const action = refundAmount
    ? `${refundAmount} refund`
    : lowerFirst(approvalActionHead(params.rawToolCalls) ?? params.actionLabel ?? 'reply');
  const ready = refundAmount ? `I've got ${refundAmount} ready.` : `${capitalize(action)}'s drafted.`;

  if (params.requestDisplay && requestDisplayHasContext(params.requestDisplay, params.now)) {
    return `${endClause(formatRequestDisplayLine(
      params.requestDisplay,
      subject,
      params.now ?? new Date(),
    ))} ${ready}`;
  }

  const factsClause = params.requestFacts
    ? formatFactsBriefingLine(
        params.requestFacts,
        subject,
        params.now ?? new Date(),
        { noRequest: params.noRequest === true, topic: askLessTopic(params.aiTitle) },
      )
    : null;
  if (factsClause) {
    return `${endClause(truncateBriefingText(factsClause, PHONE_LINE_MAX))} ${ready}`;
  }
  if (params.sourceMessageText?.trim()) {
    const sourceClause = formatBlockedTicketLine({
      customer: { name: params.customerName },
      channelType: params.channelType,
      verifiedOrders: params.verifiedOrders,
      pendingMessage: params.sourceMessageText,
    }, params.now ?? new Date());
    return `${endClause(sourceClause)} ${ready}`;
  }
  return `${endClause(formatRequestDisplayLine(unavailableRequestDisplay(), null, params.now))} ${ready}`;
}
