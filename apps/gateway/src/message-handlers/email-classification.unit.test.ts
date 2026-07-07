import { describe, it, expect } from 'vitest';
import {
  parseClassifierJson,
  classifierSignals,
  emptyIntents,
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
  });

  it('still throws when a core field is missing', () => {
    expect(() =>
      parseClassifierJson(JSON.stringify({ summary: 'x', tag: 'General', classification: 'genuine' })),
    ).toThrow();
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
