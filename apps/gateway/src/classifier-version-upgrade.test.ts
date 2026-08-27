import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import { buildAgentPlanCacheRecord, readAgentPlanCache } from '@shopkeeper/agent/plan-cache';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import {
  buildRequestDisplaySnapshot,
  requestDisplayHasContext,
} from './message-handlers/request-display.js';
import { formatOperatorPlanMessage } from './message-handlers/planning-notifications.js';
import {
  formatEscalatedTicketLine,
  formatTicketLine,
  hasHandoffRequestContext,
  rowRequestFacts,
} from './maintenance/digest-briefing.js';

// Every persisted classifier version that has reached production, plus the two
// shapes a row can degrade into. Version 5 is the control: it is the only
// version written today, so a failure there is a failure in the current path
// and a failure below it is a failure in the legacy fallback Milestone 1 shipped.
//
// This suite exists because "v5 is the only version ever written" was false.
// CLASSIFIER_VERSION was 2 on 2026-07-07 and the 2026-08-23 production inventory
// still found two live v4 threads. Any row that is not version 5 renders through
// unavailableRequestDisplay(), so the source-text fallback is the only thing
// standing between a legacy row and a briefing that asks the merchant to decide
// something it cannot show them.

const NOW = new Date('2026-04-29T12:00:00Z');
const CUSTOMER_TEXT = 'My order arrived with a cracked lid. Can I get a refund?';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

afterEach(async () => {
  await cleanupTestData(org?.id);
});

function v5Signals() {
  return {
    version: 5,
    language: 'en',
    intents: {},
    requestFacts: {
      ask: 'refund',
      subject: 'a cracked lid',
      order: '#1024',
      alternative: '',
      deadline: '',
      deadlineText: '',
    },
  };
}

function planCache(lastCustomerMessageId: string | null) {
  return buildAgentPlanCacheRecord({
    instruction: 'Damaged item refund',
    plan: {
      instruction: 'Damaged item refund',
      steps: [{
        id: 'step-1',
        tool: 'refund_order',
        label: 'Refund order',
        description: 'Refund #1024',
        category: 'action',
        enabled: true,
      }],
      rawToolCalls: [{ id: 'step-1', name: 'refund_order', input: { orderName: '#1024' } }],
    },
    lastCustomerMessageId,
    settings: resolveAgentSettings(null),
  });
}

/**
 * A thread as some past classifier version left it. `sourceText: null` seeds the
 * harder legacy case: a row whose request-source message carries no text.
 */
async function seedThread(options: {
  classifierSignals: unknown;
  sourceText?: string | null;
}) {
  const customer = await createTestCustomer(
    org.id,
    `legacy_${randomSuffix()}`,
    { name: 'Dana Reyes' },
  );
  const thread = await createTestThread(org.id, customer.id, 'email');
  const message = options.sourceText === null
    ? null
    : await createTestMessage(thread.id, options.sourceText ?? CUSTOMER_TEXT);

  const updated = await db.thread.update({
    where: { id: thread.id },
    data: {
      aiTitle: 'Cracked Lid Refund',
      aiSummary: 'Customer reports a cracked lid and asks for a refund.',
      classifierSignals: options.classifierSignals as never,
      requestSourceMessageId: message?.id ?? null,
      cachedPlan: planCache(message?.id ?? null) as never,
    },
    select: {
      id: true,
      aiTitle: true,
      channelType: true,
      classifierSignals: true,
      requestSourceMessageId: true,
      cachedPlan: true,
    },
  });

  return { customer, thread: updated, sourceMessageId: message?.id ?? null };
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** The briefing row is built from the persisted thread, not from a literal. */
function briefingRow(
  seeded: Awaited<ReturnType<typeof seedThread>>,
  pendingMessage: string | null,
) {
  return {
    aiTitle: seeded.thread.aiTitle,
    channelType: seeded.thread.channelType,
    customer: { name: seeded.customer.name },
    pendingMessage,
    classifierSignals: seeded.thread.classifierSignals,
  };
}

describe('persisted classifier versions still render', () => {
  it('reads structured facts on the version that writes them today', async () => {
    org = await createTestOrg();
    const seeded = await seedThread({ classifierSignals: v5Signals() });

    const display = await buildRequestDisplaySnapshot({
      organizationId: org.id,
      threadId: seeded.thread.id,
      sourceMessageId: seeded.sourceMessageId,
    });

    expect(display.kind).toBe('classified');
    expect(requestDisplayHasContext(display, NOW)).toBe(true);
    expect(rowRequestFacts(seeded.thread)?.ask).toBe('refund');
  });

  // The versions that reached production before requestFacts existed.
  for (const version of [2, 3, 4]) {
    it(`falls back to the customer's own words on a version-${version} row`, async () => {
      org = await createTestOrg();
      const seeded = await seedThread({
        classifierSignals: { version, language: 'en', intents: {} },
      });

      // Card path: no structured request survives, and the card must say so
      // rather than invent one.
      const display = await buildRequestDisplaySnapshot({
        organizationId: org.id,
        threadId: seeded.thread.id,
        sourceMessageId: seeded.sourceMessageId,
      });
      expect(display.kind).toBe('unavailable');
      expect(rowRequestFacts(seeded.thread)).toBeNull();

      // Digest path: the merchant still sees what was actually asked, because
      // the source message is quoted rather than paraphrased.
      const row = briefingRow(seeded, CUSTOMER_TEXT);
      expect(hasHandoffRequestContext(row, NOW)).toBe(true);
      const line = formatEscalatedTicketLine(row, NOW);
      expect(line).toContain('cracked lid');
      expect(line).not.toContain('Request details unavailable');
    });
  }

  it('renders an approvable card on a legacy row with no structured request', async () => {
    org = await createTestOrg();
    const seeded = await seedThread({
      classifierSignals: { version: 4, language: 'en', intents: {} },
    });

    const display = await buildRequestDisplaySnapshot({
      organizationId: org.id,
      threadId: seeded.thread.id,
      sourceMessageId: seeded.sourceMessageId,
    });
    const cache = readAgentPlanCache(seeded.thread.cachedPlan);
    expect(cache).not.toBeNull();

    const card = formatOperatorPlanMessage(
      seeded.customer.name,
      'email',
      display,
      cache!.plan.steps,
      { threadId: seeded.thread.id, rawToolCalls: cache!.plan.rawToolCalls, now: NOW },
    );

    // The plan is real even when the request rendering is not. The card says
    // plainly that it cannot show the request, and still names the action the
    // merchant is being asked to approve rather than going blank.
    expect(card).toContain('Request details unavailable');
    expect(card).toMatch(/refund/i);
  });

  it('never asks a legacy row to be decided when it cannot be shown', async () => {
    org = await createTestOrg();
    const seeded = await seedThread({
      classifierSignals: { version: 4, language: 'en', intents: {} },
      sourceText: null,
    });

    const row = briefingRow(seeded, null);
    expect(hasHandoffRequestContext(row, NOW)).toBe(false);
    expect(formatTicketLine(row, NOW)).toContain('Request details unavailable');
  });

  // Missing and malformed persisted state, which the completion gate asks for
  // alongside current and legacy.
  const degraded: readonly (readonly [string, unknown])[] = [
    ['missing', null],
    ['malformed object', { version: 'five', intents: 'nope' }],
    ['malformed scalar', 'not-an-object'],
  ];
  for (const [label, signals] of degraded) {
    it(`degrades without throwing on ${label} classifier signals`, async () => {
      org = await createTestOrg();
      const seeded = await seedThread({ classifierSignals: signals });

      const display = await buildRequestDisplaySnapshot({
        organizationId: org.id,
        threadId: seeded.thread.id,
        sourceMessageId: seeded.sourceMessageId,
      });
      expect(display.kind).toBe('unavailable');
      expect(rowRequestFacts(seeded.thread)).toBeNull();

      // Source text still rescues the line: the fallback keys off the message,
      // not off anything the classifier wrote.
      const row = briefingRow(seeded, CUSTOMER_TEXT);
      expect(formatEscalatedTicketLine(row, NOW)).toContain('cracked lid');
    });
  }

  it('keeps a replacement plan renderable and identifiable on a legacy thread', async () => {
    org = await createTestOrg();
    const seeded = await seedThread({
      classifierSignals: { version: 4, language: 'en', intents: {} },
    });
    const first = readAgentPlanCache(seeded.thread.cachedPlan)!;

    // What a replan commits: a new plan record over the same legacy thread.
    const replan = planCache(seeded.sourceMessageId);
    await db.thread.update({
      where: { id: seeded.thread.id },
      data: { cachedPlan: replan as never },
    });

    const reread = await db.thread.findFirstOrThrow({
      where: { id: seeded.thread.id, organizationId: org.id },
      select: { cachedPlan: true },
    });
    const second = readAgentPlanCache(reread.cachedPlan)!;

    expect(second.planId).not.toBe(first.planId);

    const display = await buildRequestDisplaySnapshot({
      organizationId: org.id,
      threadId: seeded.thread.id,
      sourceMessageId: seeded.sourceMessageId,
    });
    const card = formatOperatorPlanMessage(
      seeded.customer.name,
      'email',
      display,
      second.plan.steps,
      { threadId: seeded.thread.id, rawToolCalls: second.plan.rawToolCalls, now: NOW },
    );
    expect(card).toMatch(/refund/i);
  });
});
