import { db, ThreadFilterStatus } from '@shopkeeper/db';

export const DIGEST_FIXTURE_NOW = new Date('2026-04-29T12:00:00Z');
export const DIGEST_FIXTURE_HOUR_MS = 3_600_000;

/** Stands in for the last-briefing cursor: spam counts since then, not all open filtered rows. */
export function digestFiledSince(now: Date = DIGEST_FIXTURE_NOW): Date {
  return new Date(now.getTime() - 24 * DIGEST_FIXTURE_HOUR_MS);
}

/** What the classifier persists for "hello" / "yo" / "Test": real person, no ask yet. */
export const digestNoRequestClassifierSignals = {
  version: 3,
  language: 'en',
  intents: { no_request: true },
} as const;

export function digestFactsClassifierSignals(facts: {
  ask: string;
  subject?: string;
  order?: string;
  deadline?: string;
  deadlineText?: string;
}) {
  return {
    version: 5,
    language: 'en',
    intents: {},
    requestFacts: {
      ask: facts.ask,
      subject: facts.subject ?? null,
      order: facts.order ?? null,
      deadline: facts.deadline ?? null,
      deadlineText: facts.deadlineText ?? null,
      alternative: null,
    },
  };
}

export function makeDigestThreadRow(
  now: Date,
  overrides: Partial<{
    id: string;
    filterStatus: 'genuine' | 'questionable' | 'filtered';
    ageHours: number;
    filterDecidedAt: Date | null;
    tag: string | null;
    customerName: string | null;
    channelType: string;
    aiTitle: string | null;
    aiSummary: string | null;
    requestSummary: string | null;
    filterReason: string | null;
    escalatedAt: Date | null;
    noRequest: boolean;
  }> = {},
) {
  const ageHours = overrides.ageHours ?? 1;
  return {
    id: overrides.id ?? `t-${Math.random().toString(16).slice(2)}`,
    updatedAt: new Date(now.getTime() - ageHours * DIGEST_FIXTURE_HOUR_MS),
    tag: overrides.tag === undefined ? 'Support' : overrides.tag,
    channelType: overrides.channelType ?? 'email',
    aiTitle: overrides.aiTitle ?? null,
    filterStatus: (overrides.filterStatus ?? ThreadFilterStatus.genuine) as 'genuine' | 'questionable' | 'filtered',
    filterDecidedAt: overrides.filterDecidedAt === undefined
      ? new Date(now.getTime() - ageHours * DIGEST_FIXTURE_HOUR_MS)
      : overrides.filterDecidedAt,
    aiSummary: overrides.aiSummary ?? null,
    requestSummary: overrides.requestSummary ?? null,
    filterReason: overrides.filterReason ?? null,
    escalatedAt: overrides.escalatedAt ?? null,
    requestSourceMessageId: null,
    customer: { name: overrides.customerName === undefined ? 'Jane' : overrides.customerName },
    cachedPlan: null,
    cachedPlanMessageId: null,
    messages: [],
    classifierSignals: overrides.noRequest ? digestNoRequestClassifierSignals : null,
  };
}

// createTestMessage stamps sentAt from the clock, so two messages written in the
// same millisecond fall back to the `id desc` tiebreak — a random UUID order,
// which decides whether a thread reads as answered or as blocked. Any fixture
// with more than one message has to pin the order it means.
export async function pinMessageSentAtMinutesAgo(
  messageId: string,
  minutes: number,
  now: Date = DIGEST_FIXTURE_NOW,
) {
  await db.message.update({
    where: { id: messageId },
    data: { sentAt: new Date(now.getTime() - minutes * 60_000) },
  });
}
