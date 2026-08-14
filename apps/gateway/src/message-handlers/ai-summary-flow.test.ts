import { describe, expect, it } from 'vitest';
import { ChannelType } from '@shopkeeper/db';
import {
  canParallelizeThreadPlanning,
  resolveAiSummarySourceMessageId,
  resolveParallelPlanInstruction,
  DEFAULT_PLAN_INSTRUCTION,
} from './ai-summary-flow.js';

describe('canParallelizeThreadPlanning', () => {
  it('keeps email first messages sequential until the spam filter decides', () => {
    expect(canParallelizeThreadPlanning({
      channelType: ChannelType.email,
      filterDecidedAt: null,
    })).toBe(false);
  });

  it('parallelizes email follow-ups after filterDecidedAt is set', () => {
    expect(canParallelizeThreadPlanning({
      channelType: ChannelType.email,
      filterDecidedAt: new Date(),
    })).toBe(true);
  });

  it('waits for sender trust on other filterable customer channels', () => {
    expect(canParallelizeThreadPlanning({
      channelType: ChannelType.ig_dm,
      filterDecidedAt: null,
    })).toBe(false);

    expect(canParallelizeThreadPlanning({
      channelType: ChannelType.shopify_chat,
      filterDecidedAt: null,
    })).toBe(false);

    expect(canParallelizeThreadPlanning({
      channelType: ChannelType.shopify,
      filterDecidedAt: null,
    })).toBe(true);
  });
});

describe('resolveParallelPlanInstruction', () => {
  it('uses the latest customer message when present', () => {
    expect(resolveParallelPlanInstruction('Where is my order #1001?')).toBe('Where is my order #1001?');
  });

  it('falls back to the default instruction when the message is empty', () => {
    expect(resolveParallelPlanInstruction(null)).toBe(DEFAULT_PLAN_INSTRUCTION);
    expect(resolveParallelPlanInstruction('   ')).toBe(DEFAULT_PLAN_INSTRUCTION);
  });
});

describe('resolveAiSummarySourceMessageId', () => {
  it('reconciles an out-of-order debounce payload to the newest customer message', () => {
    expect(resolveAiSummarySourceMessageId(
      'message_older',
      { id: 'message_newer', senderType: 'customer' },
    )).toBe('message_newer');
  });

  it('does not treat an agent or note message as a pending customer source', () => {
    expect(resolveAiSummarySourceMessageId(
      'message_customer',
      { id: 'message_agent', senderType: 'agent' },
    )).toBe('message_customer');
    expect(resolveAiSummarySourceMessageId(
      'message_customer',
      { id: 'message_note', senderType: 'note' },
    )).toBe('message_customer');
  });

  it('keeps the queued source when the thread has no conversation messages', () => {
    expect(resolveAiSummarySourceMessageId('message_customer', null)).toBe('message_customer');
  });
});
