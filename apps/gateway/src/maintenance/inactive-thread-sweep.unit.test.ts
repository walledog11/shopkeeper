import { describe, expect, it } from 'vitest';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import {
  CLOSE_AFTER_QUIET_DAYS,
  classifyInactiveThreadClose,
  type InactiveThreadSweepRow,
} from './inactive-thread-sweep.js';

const NOW = new Date('2026-04-29T12:00:00Z');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const QUIET_AGED = new Date(NOW.getTime() - (CLOSE_AFTER_QUIET_DAYS + 1) * ONE_DAY_MS);
const QUIET_RECENT = new Date(NOW.getTime() - (CLOSE_AFTER_QUIET_DAYS - 1) * ONE_DAY_MS);

const emptyContext = {
  operatorPendingThreadIds: new Set<string>(),
  pendingExecutionThreadIds: new Set<string>(),
  openWatchThreadIds: new Set<string>(),
};

function reviewPlanCache(customerMessageId: string) {
  return buildAgentPlanCacheRecord({
    instruction: 'Issue refund',
    plan: {
      instruction: 'Issue refund',
      steps: [{
        id: 'step-1',
        tool: 'create_refund',
        label: 'Issue refund',
        description: 'Issue refund',
        category: 'action',
        enabled: true,
      }],
      rawToolCalls: [{ id: 'step-1', name: 'create_refund', input: { amount: 20 } }],
    },
    lastCustomerMessageId: customerMessageId,
    settings: resolveAgentSettings(null),
  });
}

describe('classifyInactiveThreadClose', () => {
  const base: InactiveThreadSweepRow = {
    id: 'thread-1',
    organizationId: 'org-1',
    updatedAt: QUIET_AGED,
    escalatedAt: null,
    cachedPlan: null,
    cachedPlanMessageId: null,
    filterStatus: 'genuine',
    messages: [],
  };

  it('closes a note-only thread without waiting for the quiet window', () => {
    expect(classifyInactiveThreadClose(
      base,
      NOW,
      resolveAgentSettings(null),
      emptyContext,
    )).toBe('close_non_conversational');
  });

  // A thread is note-only between processInboundMessage creating it and writing
  // the customer's first message. Closing inside that window kills a live
  // conversation the merchant never sees.
  it('spares a note-only thread that changed in the last hour', () => {
    expect(classifyInactiveThreadClose(
      { ...base, updatedAt: new Date(NOW.getTime() - 60 * 1000) },
      NOW,
      resolveAgentSettings(null),
      emptyContext,
    )).toBe('skip');
  });

  it('closes when the agent answered and silence exceeded seven days', () => {
    expect(classifyInactiveThreadClose(
      {
        ...base,
        messages: [
          { id: 'm1', senderType: 'customer', sentAt: QUIET_AGED },
          { id: 'm2', senderType: 'agent', sentAt: QUIET_AGED },
        ],
      },
      NOW,
      resolveAgentSettings(null),
      emptyContext,
    )).toBe('close_quiet');
  });

  it('keeps a six-day answered thread open', () => {
    expect(classifyInactiveThreadClose(
      {
        ...base,
        messages: [
          { id: 'm1', senderType: 'customer', sentAt: QUIET_RECENT },
          { id: 'm2', senderType: 'ai', sentAt: QUIET_RECENT },
        ],
      },
      NOW,
      resolveAgentSettings(null),
      emptyContext,
    )).toBe('skip');
  });

  it('keeps a thread open when the customer spoke last', () => {
    expect(classifyInactiveThreadClose(
      {
        ...base,
        messages: [{ id: 'm1', senderType: 'customer', sentAt: QUIET_AGED }],
      },
      NOW,
      resolveAgentSettings(null),
      emptyContext,
    )).toBe('skip');
  });

  it('keeps escalated threads open', () => {
    expect(classifyInactiveThreadClose(
      { ...base, escalatedAt: NOW },
      NOW,
      resolveAgentSettings(null),
      emptyContext,
    )).toBe('skip');
  });

  it('keeps threads with operator-parked approvals open', () => {
    expect(classifyInactiveThreadClose(
      base,
      NOW,
      resolveAgentSettings(null),
      {
        ...emptyContext,
        operatorPendingThreadIds: new Set(['thread-1']),
      },
    )).toBe('skip');
  });

  it('keeps threads with a non-quick cached plan open', () => {
    const customerId = 'cust-msg';
    expect(classifyInactiveThreadClose(
      {
        ...base,
        cachedPlan: reviewPlanCache(customerId),
        cachedPlanMessageId: customerId,
        messages: [
          { id: customerId, senderType: 'customer', sentAt: QUIET_AGED },
          { id: 'm2', senderType: 'agent', sentAt: QUIET_AGED },
        ],
      },
      NOW,
      resolveAgentSettings(null),
      emptyContext,
    )).toBe('skip');
  });
});
