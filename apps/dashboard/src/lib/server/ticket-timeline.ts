import { db } from '@shopkeeper/db';
import { readAgentPlanCacheRecordShape } from '@shopkeeper/agent/plan-cache-shape';
import { isAgentNoteContent, stripAgentNotePrefix } from '@shopkeeper/agent/thread-constants';
import { isAgentTurnContent } from '@shopkeeper/agent/tools';

const MESSAGE_LIMIT = 200;
const ACTION_LIMIT = 100;
const TIMING_LIMIT = 400;
const TEXT_LIMIT = 600;
// The phone side of a ticket (cards, the merchant's replies) runs on the
// workspace's operator thread; its timings inside this window belong to the run.
const PHONE_WINDOW_BEFORE_MS = 60_000;
const PHONE_WINDOW_AFTER_MS = 10 * 60_000;

function at(value: Date | null | undefined): string {
  return value ? value.toISOString().replace('T', ' ').slice(0, 19) : '-';
}

function clock(value: Date): string {
  return value.toISOString().slice(11, 23);
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function oneLine(text: string | null | undefined): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > TEXT_LIMIT ? `${flat.slice(0, TEXT_LIMIT)}…` : flat;
}

function trueKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).filter(([, flag]) => flag === true).map(([key]) => key);
}

function factsLine(value: unknown): string {
  if (!value || typeof value !== 'object') return '-';
  return Object.entries(value as Record<string, unknown>)
    .filter(([, fact]) => fact !== null && fact !== undefined && fact !== '')
    .map(([key, fact]) => `${key}=${typeof fact === 'string' ? fact : JSON.stringify(fact)}`)
    .join(' ') || '-';
}

type TimingLine = { at: Date; text: string };

const TIMED_SENDERS = ['customer', 'agent'] as const;

/**
 * Every timed step for the ticket in order, among its messages for reference:
 * the hops in step_timings and the agent turns in agent_turn_usage, plus the
 * same for the workspace's phone thread while the ticket was active. Null when
 * nothing was timed.
 */
async function loadTimingLines(
  organizationId: string,
  threadId: string,
  messages: ReadonlyArray<{ sentAt: Date; senderType: string }>,
): Promise<TimingLine[] | null> {
  const first = messages[0]?.sentAt;
  const last = messages.at(-1)?.sentAt;
  const phoneWindow = first && last
    ? { gte: new Date(first.getTime() - PHONE_WINDOW_BEFORE_MS), lte: new Date(last.getTime() + PHONE_WINDOW_AFTER_MS) }
    : null;
  const phoneThread = { organizationId, channelType: 'operator' as const };
  const stepSelect = { step: true, detail: true, startedAt: true, durationMs: true } as const;
  const turnSelect = { purpose: true, outcome: true, modelCalls: true, durationMs: true, createdAt: true } as const;
  const [steps, turns, phoneSteps, phoneTurns, phoneMessages] = await Promise.all([
    db.stepTiming.findMany({ where: { organizationId, threadId }, orderBy: { startedAt: 'asc' }, take: TIMING_LIMIT, select: stepSelect }),
    db.agentTurnUsage.findMany({ where: { organizationId, threadId }, orderBy: { createdAt: 'asc' }, take: TIMING_LIMIT, select: turnSelect }),
    phoneWindow
      ? db.stepTiming.findMany({
        where: { organizationId, startedAt: phoneWindow, thread: phoneThread },
        orderBy: { startedAt: 'asc' },
        take: TIMING_LIMIT,
        select: stepSelect,
      })
      : [],
    phoneWindow
      ? db.agentTurnUsage.findMany({
        where: { organizationId, createdAt: phoneWindow, thread: phoneThread },
        orderBy: { createdAt: 'asc' },
        take: TIMING_LIMIT,
        select: turnSelect,
      })
      : [],
    phoneWindow
      ? db.message.findMany({
        where: { organizationId, sentAt: phoneWindow, senderType: { in: [...TIMED_SENDERS] }, thread: phoneThread },
        orderBy: { sentAt: 'asc' },
        take: TIMING_LIMIT,
        select: { sentAt: true, senderType: true },
      })
      : [],
  ]);
  if (steps.length + turns.length + phoneSteps.length + phoneTurns.length === 0) return null;

  const stepLine = (prefix: string) => (row: (typeof steps)[number]): TimingLine => ({
    at: row.startedAt,
    text: `${prefix}${row.step} ${seconds(row.durationMs)}${row.detail ? ` · ${row.detail}` : ''}`,
  });
  // A turn's row is written when it ends.
  const turnLine = (prefix: string) => (row: (typeof turns)[number]): TimingLine => ({
    at: new Date(row.createdAt.getTime() - row.durationMs),
    text: `${prefix}${row.purpose} turn ${seconds(row.durationMs)} · ${row.modelCalls} model call(s), ${row.outcome}`,
  });
  return [
    ...messages
      .filter(message => (TIMED_SENDERS as readonly string[]).includes(message.senderType))
      .map(message => ({ at: message.sentAt, text: `${message.senderType} message` })),
    ...steps.map(stepLine('')),
    ...turns.map(turnLine('')),
    ...phoneMessages.map(message => ({
      at: message.sentAt,
      text: `phone · ${message.senderType === 'customer' ? 'merchant' : 'agent'} message`,
    })),
    ...phoneSteps.map(stepLine('phone · ')),
    ...phoneTurns.map(turnLine('phone · ')),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * One ticket as plain text for diagnosing a run: what the customer and agent
 * said, how the classifier read the request, how the current plan was routed and
 * why, what the agent did, where order confirmation stands, and how long each
 * step took. The merchant
 * copies it from the ticket; nothing here is shown to the customer.
 */
export async function loadTicketTimeline(organizationId: string, threadId: string): Promise<string | null> {
  const thread = await db.thread.findFirst({
    where: { id: threadId, organizationId },
    select: {
      id: true,
      channelType: true,
      status: true,
      closedReason: true,
      createdAt: true,
      escalatedAt: true,
      awaitingCustomer: true,
      awaitingCustomerSince: true,
      filterStatus: true,
      tag: true,
      requestSummary: true,
      requestDisposition: true,
      classifierSignals: true,
      cachedPlan: true,
      cachedPlanMessageId: true,
      customer: { select: { name: true } },
      messages: {
        orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
        take: MESSAGE_LIMIT,
        select: { id: true, sentAt: true, senderType: true, contentText: true, attachments: true, sendStatus: true },
      },
      agentActions: {
        orderBy: { createdAt: 'asc' },
        take: ACTION_LIMIT,
        select: { createdAt: true, tool: true, status: true, mode: true, errorDetail: true, approvedAt: true, executionId: true },
      },
      orderVerifications: {
        orderBy: { requestedAt: 'asc' },
        select: { orderName: true, method: true, asks: true, attempts: true, verifiedAt: true, requestedAt: true },
      },
    },
  });
  if (!thread) return null;

  const signals = thread.classifierSignals as { intents?: unknown; requestFacts?: unknown } | null;
  const lines: string[] = [
    'Shopkeeper ticket timeline (times UTC)',
    `Ticket ${thread.id} · ${thread.channelType} · ${thread.status}${thread.closedReason ? ` (${thread.closedReason})` : ''}`
      + ` · created ${at(thread.createdAt)} · escalated ${at(thread.escalatedAt)}`,
    `Customer: ${thread.customer.name ?? '(no name)'}`,
    `Classifier: tag ${thread.tag ?? '-'} · filter ${thread.filterStatus} · disposition ${thread.requestDisposition ?? '-'}`,
    `  request: ${oneLine(thread.requestSummary) || '-'}`,
    `  facts: ${factsLine(signals?.requestFacts)}`,
    `  intents: ${trueKeys(signals?.intents).join(', ') || '-'}`,
    `Waiting on customer: ${thread.awaitingCustomer ? `${thread.awaitingCustomer} since ${at(thread.awaitingCustomerSince)}` : 'no'}`,
  ];

  lines.push('Order confirmations:');
  if (thread.orderVerifications.length === 0) lines.push('  none');
  for (const row of thread.orderVerifications) {
    lines.push(
      `  ${row.orderName ?? '(order not named)'} · asked ${row.asks}× from ${at(row.requestedAt)} · ${row.attempts} attempt(s)`
      + ` · ${row.verifiedAt ? `confirmed by ${row.method} at ${at(row.verifiedAt)}` : 'not confirmed'}`,
    );
  }

  lines.push('', 'Messages:');
  for (const message of thread.messages) {
    const text = isAgentTurnContent(message.contentText)
      ? '(agent run record)'
      : oneLine(isAgentNoteContent(message.contentText) ? stripAgentNotePrefix(message.contentText ?? '') : message.contentText);
    const extras = [
      message.attachments.length > 0 ? `${message.attachments.length} attachment(s)` : null,
      message.sendStatus && message.sendStatus !== 'sent' ? `send ${message.sendStatus}` : null,
    ].filter(Boolean).join(', ');
    lines.push(`  ${at(message.sentAt)}  ${message.senderType.padEnd(8)} ${text}${extras ? ` [${extras}]` : ''}`);
  }
  if (thread.messages.length === MESSAGE_LIMIT) lines.push(`  (first ${MESSAGE_LIMIT} messages only)`);

  lines.push('', 'Agent actions:');
  if (thread.agentActions.length === 0) lines.push('  none');
  for (const action of thread.agentActions) {
    lines.push(
      `  ${at(action.createdAt)}  ${action.tool} · ${action.status} · ${action.mode}`
      + `${action.approvedAt ? ` · approved ${at(action.approvedAt)}` : ''}`
      + `${action.executionId ? ' · in an execution' : ''}`
      + `${action.errorDetail ? ` · ${oneLine(action.errorDetail)}` : ''}`,
    );
  }

  lines.push('', 'Timings (start, step, duration):');
  // Diagnostics only: unreadable timings never cost the rest of the timeline.
  const timings = await loadTimingLines(organizationId, thread.id, thread.messages).catch(() => undefined);
  if (timings === undefined) lines.push('  unavailable');
  else if (timings === null) lines.push('  none recorded');
  for (const line of timings ?? []) lines.push(`  ${clock(line.at)}  ${line.text}`);

  const cache = readAgentPlanCacheRecordShape(thread.cachedPlan);
  lines.push('', 'Current plan:');
  if (!cache?.plan) {
    lines.push('  none');
  } else {
    const plan = cache.plan;
    const latestMessageId = thread.messages.at(-1)?.id ?? null;
    lines.push(
      `  drafted for message ${thread.cachedPlanMessageId ?? '-'}${thread.cachedPlanMessageId === latestMessageId ? ' (latest)' : ' (not the latest message)'}`,
      `  steps: ${plan.rawToolCalls.map(call => call.name).join(', ') || '-'}`,
      `  routing: ${plan.routingEvidence?.codes.join(', ') || '-'}${plan.routingEvidence?.escalationReason ? ` — ${oneLine(plan.routingEvidence.escalationReason)}` : ''}`,
      `  signals: ${plan.signals?.map(signal => `${signal.code}(${signal.severity})`).join(', ') || '-'}`,
      `  validation: ${plan.validation?.status ?? '-'}`,
    );
  }

  return lines.join('\n');
}
