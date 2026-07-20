import { describe, it, expect } from 'vitest';
import {
  parseClassifierJson,
  classifierSignals,
  emptyIntents,
  CLASSIFIER_SYSTEM_PROMPT,
  CLASSIFIER_VERSION,
} from './email-classification.js';

function fullResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    title: 'Where is order #1452',
    summary: 'Customer asks where their order is.',
    tag: 'Order Status',
    classification: 'genuine',
    reason: 'Real support request.',
    language: 'en',
    intents: {
      mutative_request: false,
      policy_question: false,
      order_status: true,
      fraud_signals: false,
      contradiction: false,
      out_of_scope_commercial: false,
      forwarded_injection: false,
    },
    ...overrides,
  });
}

describe('parseClassifierJson — intents + language', () => {
  it('parses intents and language from a full response', () => {
    const result = parseClassifierJson(fullResponse());
    expect(result.language).toBe('en');
    expect(result.intents.order_status).toBe(true);
    expect(result.intents.mutative_request).toBe(false);
  });

  it('defaults intents to all-false and language to "" when absent', () => {
    const result = parseClassifierJson(
      JSON.stringify({
        summary: 'Customer says hi.',
        tag: 'General',
        classification: 'genuine',
        reason: 'Greeting.',
      }),
    );
    expect(result.language).toBe('');
    expect(result.intents).toEqual(emptyIntents());
  });

  it('coerces non-true intent values to false', () => {
    const result = parseClassifierJson(
      fullResponse({
        intents: {
          mutative_request: 'yes',
          policy_question: 1,
          order_status: true,
          fraud_signals: null,
          contradiction: 'true',
          out_of_scope_commercial: false,
          forwarded_injection: undefined,
        },
      }),
    );
    expect(result.intents.order_status).toBe(true);
    expect(result.intents.mutative_request).toBe(false);
    expect(result.intents.policy_question).toBe(false);
    expect(result.intents.contradiction).toBe(false);
  });

  it('normalizes language to lowercase and trims it', () => {
    expect(parseClassifierJson(fullResponse({ language: '  ES  ' })).language).toBe('es');
    expect(parseClassifierJson(fullResponse({ language: 42 })).language).toBe('');
    expect(parseClassifierJson(fullResponse({ language: 'eng' })).language).toBe('');
    expect(parseClassifierJson(fullResponse({ language: 'e1' })).language).toBe('');
  });

  it('still throws when a core field is missing', () => {
    expect(() =>
      parseClassifierJson(JSON.stringify({ summary: 'x', tag: 'General', classification: 'genuine' })),
    ).toThrow();
  });

  it.each(['Refund', 'shipping', '', 42, null])('rejects invalid classifier tag %j', (tag) => {
    expect(() => parseClassifierJson(fullResponse({ tag }))).toThrow(/invalid tag/i);
  });

  it('rejects invalid core field types', () => {
    expect(() => parseClassifierJson(fullResponse({ summary: ['not', 'text'] }))).toThrow(/summary/i);
    expect(() => parseClassifierJson(fullResponse({ reason: { text: 'why' } }))).toThrow(/reason/i);
    expect(() => parseClassifierJson(fullResponse({ classification: 'maybe' }))).toThrow(/classification/i);
  });

  it('bounds persisted classifier text fields', () => {
    const result = parseClassifierJson(fullResponse({
      title: `Title ${'x'.repeat(200)}`,
      summary: `Summary ${'y'.repeat(1_200)}`,
      reason: `Reason ${'z'.repeat(300)}`,
    }));

    expect(result.title).toHaveLength(120);
    expect(result.summary).toHaveLength(1_000);
    expect(result.filterReason).toHaveLength(240);
  });
});

describe('classifierSignals', () => {
  it('wraps a result into the persisted shape with version', () => {
    const result = parseClassifierJson(fullResponse({ language: 'fr' }));
    expect(classifierSignals(result)).toEqual({
      version: CLASSIFIER_VERSION,
      language: 'fr',
      intents: result.intents,
    });
  });
});

describe('CLASSIFIER_SYSTEM_PROMPT attachment safety', () => {
  it('forbids text-only summaries from inventing image details', () => {
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('[Instagram image attachment]');
    expect(CLASSIFIER_SYSTEM_PROMPT).toMatch(/never infer or describe visual details/i);
  });
});
