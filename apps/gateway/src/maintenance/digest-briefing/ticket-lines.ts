import { classifyPerson, personLabel } from '@shopkeeper/agent/person-name';
import { formatFactsBriefingLine } from '../briefing-fields.js';
import {
  formatRequestDisplayLine,
  unavailableRequestDisplay,
} from '../../message-handlers/shared/request-display.js';
import { HANDOFF_VERBATIM_MAX, PHONE_LINE_MAX } from './constants.js';
import { rowAskLess, rowRequestFacts } from './request-facts.js';
import { cleanBriefingText, truncateBriefingText } from './text.js';
import type { BriefingTicketRow } from './types.js';

/** What the briefing calls the person on a ticket. */
function briefingPersonName(
  customerName: string | null,
  channelType: string | null,
  verifiedOrders: readonly string[] = [],
  followingText = '',
): string | null {
  return personLabel(classifyPerson({ customerName, channelType, verifiedOrders, followingText }));
}

function handoffSubject(thread: BriefingTicketRow, followingText: string): string {
  return briefingPersonName(
    thread.customer?.name ?? null,
    thread.channelType ?? null,
    thread.verifiedOrders ?? [],
    followingText,
  ) ?? 'Someone';
}

function endQuotedClause(line: string): string {
  return /[.!?…]"$/.test(line) ? line : `${line}.`;
}

function formatStructuredHandoffLine(
  thread: BriefingTicketRow,
  now: Date,
  person: string | null,
  maxLen = PHONE_LINE_MAX,
): string | null {
  const facts = rowRequestFacts(thread);
  if (!facts) return null;
  const line = formatFactsBriefingLine(facts, person, now, rowAskLess(thread));
  return line ? truncateBriefingText(line, maxLen) : null;
}

function factsHandoffLine(thread: BriefingTicketRow, now: Date): string | null {
  const facts = rowRequestFacts(thread);
  return formatStructuredHandoffLine(
    thread,
    now,
    handoffSubject(thread, facts?.order ?? ''),
  );
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

  if (sourceLine) return endQuotedClause(sourceLine);
  return formatTicketLine(thread, now);
}

export function formatTicketLine(thread: BriefingTicketRow, now: Date = new Date()): string {
  const factsLine = formatStructuredHandoffLine(
    thread,
    now,
    briefingPersonName(
      thread.customer?.name ?? null,
      thread.channelType ?? null,
      thread.verifiedOrders ?? [],
    ),
  );
  if (factsLine) return factsLine;
  return formatRequestDisplayLine(unavailableRequestDisplay(), null, now);
}
