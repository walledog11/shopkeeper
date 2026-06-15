import { describe, expect, it } from 'vitest';
import { ChannelType } from '@shopkeeper/db';
import {
  canParallelizeThreadPlanning,
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

  it('parallelizes non-email channels even when filterDecidedAt is unset', () => {
    expect(canParallelizeThreadPlanning({
      channelType: ChannelType.ig_dm,
      filterDecidedAt: null,
    })).toBe(true);

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
