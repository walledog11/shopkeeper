import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import {
  buildRequestDisplaySnapshot,
  formatRequestDisplayLine,
  readRequestDisplay,
  systemRequestDisplay,
} from './request-display.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

function v5Signals(ask: 'refund' | 'address_change' = 'refund') {
  return {
    version: 5,
    language: 'en',
    intents: {
      mutative_request: true,
      policy_question: false,
      order_status: false,
      fraud_signals: false,
      contradiction: false,
      out_of_scope_commercial: false,
      forwarded_injection: false,
      no_request: false,
    },
    requestFacts: {
      ask,
      subject: ask === 'refund' ? 'linen napkins' : null,
      order: '#1024',
      deadline: null,
      deadlineText: null,
      alternative: null,
    },
  };
}

describe('buildRequestDisplaySnapshot', () => {
  it('persists actionable classified fields when v5 is aligned to the plan source', async () => {
    const customer = await createTestCustomer(org.id, 'snapshot@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    const message = await createTestMessage(thread.id, 'Refund #1024 to 10 King Street, K1A 0B1');
    await db.thread.update({
      where: { id: thread.id },
      data: {
        requestSourceMessageId: message.id,
        classifierSignals: {
          ...v5Signals(),
          requestFacts: { ...v5Signals().requestFacts, subject: 'delivery to 10 King Street' },
        },
        aiTitle: 'Refund to 10 King Street, K1A 0B1',
      },
    });

    const display = await buildRequestDisplaySnapshot({
      organizationId: org.id,
      threadId: thread.id,
      sourceMessageId: message.id,
      rawToolCalls: [{ input: { address1: '10 King Street', zip: 'K1A 0B1' } }],
    });

    expect(display).toEqual(expect.objectContaining({
      version: 1,
      kind: 'classified',
      sourceMessageId: message.id,
      facts: expect.objectContaining({
        ask: 'refund',
        order: '#1024',
        subject: 'delivery to 10 King Street',
      }),
    }));
    expect(display).not.toHaveProperty('quote');
    expect(JSON.stringify(display)).toContain('10 King Street');
    expect(JSON.stringify(display)).toContain('K1A 0B1');

    await db.thread.update({
      where: { id: thread.id },
      data: { requestSourceMessageId: null },
    });
    await expect(buildRequestDisplaySnapshot({
      organizationId: org.id,
      threadId: thread.id,
      sourceMessageId: message.id,
    })).resolves.toEqual({ version: 1, kind: 'unavailable' });
  });

  it('never turns a pre-v5 classifier row into a classified snapshot', async () => {
    const customer = await createTestCustomer(org.id, 'old@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    const message = await createTestMessage(thread.id, 'Please refund #1024');
    await db.thread.update({
      where: { id: thread.id },
      data: {
        requestSourceMessageId: message.id,
        classifierSignals: { ...v5Signals(), version: 4 },
      },
    });

    await expect(buildRequestDisplaySnapshot({
      organizationId: org.id,
      threadId: thread.id,
      sourceMessageId: message.id,
    })).resolves.toEqual({ version: 1, kind: 'unavailable' });
  });
});

describe('request rendering', () => {
  it('renders proactive work as explicitly system-originated', () => {
    expect(formatRequestDisplayLine(systemRequestDisplay('delivery_exception'), 'Dana'))
      .toBe('System follow-up: a delivery exception needs review');
  });

  it('reads an address-change snapshot only from structured fields', () => {
    const display = readRequestDisplay({
      version: 1,
      kind: 'classified',
      sourceMessageId: 'message-1',
      facts: v5Signals('address_change').requestFacts,
      noRequest: false,
      topic: 'Delivery address update',
      quote: 'Move it to 500 Secret Road',
    });
    expect(display).not.toHaveProperty('quote');
    expect(formatRequestDisplayLine(display, 'Dana')).toBe('Dana · #1024: address change');
  });
});
