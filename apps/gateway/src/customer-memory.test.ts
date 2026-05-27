import { describe, expect, it } from 'vitest';
import {
  EMPTY_MEMORY,
  KEY_FACTS_MAX,
  KEY_FACT_MAX_CHARS,
  OUTCOME_MAX_CHARS,
  RECENT_INTERACTIONS_MAX,
  SUMMARY_MAX_CHARS,
  boundMemory,
  isEmptyMemory,
  type CustomerMemory,
  type CustomerMemoryInteraction,
} from '@clerk/db';

function interaction(i: number): CustomerMemoryInteraction {
  return {
    threadId: `thread-${i}`,
    channel: 'email',
    tag: 'Support',
    closedAt: '2026-05-26T00:00:00.000Z',
    outcome: 'resolved',
  };
}

function memory(overrides: Partial<CustomerMemory> = {}): CustomerMemory {
  return { ...EMPTY_MEMORY, ...overrides };
}

describe('boundMemory', () => {
  it('trims summary over the character cap', () => {
    const long = 'a'.repeat(SUMMARY_MAX_CHARS + 100);
    const result = boundMemory(memory({ summary: long }));
    expect(result.summary).toHaveLength(SUMMARY_MAX_CHARS);
  });

  it('leaves summary at or under the cap unchanged', () => {
    const result = boundMemory(memory({ summary: 'short' }));
    expect(result.summary).toBe('short');
  });

  it('drops keyFacts beyond the count cap', () => {
    const tooMany = Array.from({ length: KEY_FACTS_MAX + 5 }, (_, i) => `fact ${i}`);
    const result = boundMemory(memory({ keyFacts: tooMany }));
    expect(result.keyFacts).toHaveLength(KEY_FACTS_MAX);
    expect(result.keyFacts[0]).toBe('fact 0');
  });

  it('drops keyFact items over the per-item character cap', () => {
    const longFact = 'x'.repeat(KEY_FACT_MAX_CHARS + 1);
    const okFact = 'y'.repeat(KEY_FACT_MAX_CHARS);
    const result = boundMemory(memory({ keyFacts: [longFact, okFact, ''] }));
    expect(result.keyFacts).toEqual([okFact]);
  });

  it('drops recentInteractions beyond the count cap', () => {
    const tooMany = Array.from({ length: RECENT_INTERACTIONS_MAX + 3 }, (_, i) => interaction(i));
    const result = boundMemory(memory({ recentInteractions: tooMany }));
    expect(result.recentInteractions).toHaveLength(RECENT_INTERACTIONS_MAX);
    expect(result.recentInteractions[0].threadId).toBe('thread-0');
  });

  it('trims interaction outcome to the character cap', () => {
    const longOutcome = 'o'.repeat(OUTCOME_MAX_CHARS + 50);
    const result = boundMemory(
      memory({ recentInteractions: [{ ...interaction(0), outcome: longOutcome }] }),
    );
    expect(result.recentInteractions[0].outcome).toHaveLength(OUTCOME_MAX_CHARS);
  });

  it('keeps only known policyFlags fields with valid types', () => {
    const result = boundMemory(
      memory({
        policyFlags: {
          vip: true,
          complaintPattern: false,
          priorRefundsTotal: 42,
          priorRefundsCount: 3,
          // @ts-expect-error — exercise the boundary: unknown keys are stripped
          rogue: 'nope',
        },
      }),
    );
    expect(result.policyFlags).toEqual({
      vip: true,
      complaintPattern: false,
      priorRefundsTotal: 42,
      priorRefundsCount: 3,
    });
  });

  it('drops negative or non-finite refund numbers', () => {
    const result = boundMemory(
      memory({
        policyFlags: {
          priorRefundsTotal: -1,
          priorRefundsCount: Number.NaN,
        },
      }),
    );
    expect(result.policyFlags).toEqual({});
  });
});

describe('isEmptyMemory', () => {
  it('returns true for {}', () => {
    expect(isEmptyMemory({})).toBe(true);
  });

  it('returns true for null and non-objects', () => {
    expect(isEmptyMemory(null)).toBe(true);
    expect(isEmptyMemory(undefined)).toBe(true);
    expect(isEmptyMemory('summary')).toBe(true);
  });

  it('returns true for the default EMPTY_MEMORY', () => {
    expect(isEmptyMemory(EMPTY_MEMORY)).toBe(true);
  });

  it('returns true when only whitespace summary is set', () => {
    expect(isEmptyMemory({ ...EMPTY_MEMORY, summary: '   ' })).toBe(true);
  });

  it('returns false when summary has content', () => {
    expect(isEmptyMemory({ ...EMPTY_MEMORY, summary: 'knows the customer' })).toBe(false);
  });

  it('returns false when keyFacts is non-empty', () => {
    expect(isEmptyMemory({ ...EMPTY_MEMORY, keyFacts: ['has 3 orders'] })).toBe(false);
  });

  it('returns false when recentInteractions is non-empty', () => {
    expect(isEmptyMemory({ ...EMPTY_MEMORY, recentInteractions: [interaction(0)] })).toBe(false);
  });

  it('returns false when a policyFlag is set', () => {
    expect(isEmptyMemory({ ...EMPTY_MEMORY, policyFlags: { vip: true } })).toBe(false);
  });

  it('ignores policyFlags whose values are all false/undefined', () => {
    expect(isEmptyMemory({ ...EMPTY_MEMORY, policyFlags: { vip: false } })).toBe(true);
  });
});
