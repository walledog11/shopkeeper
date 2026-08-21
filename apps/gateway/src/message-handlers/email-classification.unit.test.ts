import { describe, it, expect } from 'vitest';
import {
  parseClassifierJson,
  classifierSignals,
  emptyIntents,
  CLASSIFIER_SYSTEM_PROMPT,
  CLASSIFIER_VERSION,
  CLASSIFIER_OUTPUT_SCHEMA,
  classifierSystemPrompt,
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
      requestFacts: result.requestFacts,
    });
  });
});

describe('parseClassifierJson — requestFacts', () => {
  it('parses the fields the briefing composes its line from', () => {
    const result = parseClassifierJson(fullResponse({
      requestFacts: {
        ask: 'refund',
        subject: 'the olive linen napkins',
        order: '#1024',
        deadline: '2026-08-23',
        deadlineText: 'before the weekend',
        alternative: 'exchange',
      },
    }));

    expect(result.requestFacts).toEqual({
      ask: 'refund',
      subject: 'the olive linen napkins',
      order: '#1024',
      deadline: '2026-08-23',
      deadlineText: 'before the weekend',
      alternative: 'exchange',
    });
  });

  // Threads classified before the field existed have none, and must stay
  // readable rather than costing the whole classification.
  it('defaults to an empty ask when the field is absent', () => {
    const result = parseClassifierJson(fullResponse());
    expect(result.requestFacts.ask).toBe('none');
    expect(result.requestFacts.deadline).toBeNull();
  });

  it('rejects an ask outside the vocabulary rather than passing it through', () => {
    const result = parseClassifierJson(fullResponse({
      requestFacts: { ask: 'wire_transfer', order: '#1024' },
    }));
    expect(result.requestFacts.ask).toBe('none');
    expect(result.requestFacts.order).toBe('#1024');
  });

  it('normalizes an order written without the hash', () => {
    const result = parseClassifierJson(fullResponse({
      requestFacts: { ask: 'cancel', order: 'order 1024' },
    }));
    expect(result.requestFacts.order).toBe('#1024');
  });

  it('drops a deadline that is not an ISO date, keeping the words', () => {
    const result = parseClassifierJson(fullResponse({
      requestFacts: { ask: 'refund', deadline: 'Friday', deadlineText: 'by Friday' },
    }));
    expect(result.requestFacts.deadline).toBeNull();
    expect(result.requestFacts.deadlineText).toBe('by Friday');
  });
});

describe('CLASSIFIER_OUTPUT_SCHEMA', () => {
  // The classifier used to ask for JSON in prose on every inbound message, so a
  // malformed field cost the whole classification.
  it('constrains every field the prompt asks for', () => {
    expect(CLASSIFIER_OUTPUT_SCHEMA.required).toContain('requestFacts');
    expect(CLASSIFIER_OUTPUT_SCHEMA.properties.requestFacts.properties.ask.enum)
      .toContain('refund');
    expect(CLASSIFIER_OUTPUT_SCHEMA.additionalProperties).toBe(false);
  });
});

describe('CLASSIFIER_SYSTEM_PROMPT attachment safety', () => {
  it('forbids text-only summaries from inventing image details', () => {
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('[Instagram image attachment]');
    expect(CLASSIFIER_SYSTEM_PROMPT).toMatch(/never infer or describe visual details/i);
  });
});

describe('classifierSystemPrompt', () => {
  it('tells the summariser a storefront visitor is not a known customer', () => {
    const prompt = classifierSystemPrompt('shopify_chat');
    expect(prompt.startsWith(CLASSIFIER_SYSTEM_PROMPT)).toBe(true);
    expect(prompt).toMatch(/never "the customer"/i);
    expect(prompt).toContain('the visitor');
  });

  it('leaves every other channel byte-identical', () => {
    for (const channel of ['email', 'ig_dm', 'shopify', 'imessage', 'tiktok']) {
      expect(classifierSystemPrompt(channel)).toBe(CLASSIFIER_SYSTEM_PROMPT);
    }
  });

  it('stops asserting anonymity once the shopper has verified an order', () => {
    const prompt = classifierSystemPrompt('shopify_chat', ['#1024']);
    expect(prompt.startsWith(CLASSIFIER_SYSTEM_PROMPT)).toBe(true);
    expect(prompt).toContain('verified owner of #1024');
    // The guest suffix instructs the model to call the person "the visitor" and
    // shows it an example ending "without giving an order number" — the exact
    // sentence that landed on a card quoting the shopper's street address.
    expect(prompt).not.toMatch(/never "the customer"/i);
    expect(prompt).not.toContain('without giving an order number');
    expect(prompt).toMatch(/never say they gave no order number/i);
  });

  it('scopes the verified claim to the orders actually proved', () => {
    const prompt = classifierSystemPrompt('shopify_chat', ['#1024', '#1031']);
    expect(prompt).toContain('#1024, #1031');
    expect(prompt).toMatch(/any other order they mention as unverified/i);
  });

  it('keeps the guest wording when no order is verified', () => {
    expect(classifierSystemPrompt('shopify_chat', [])).toBe(classifierSystemPrompt('shopify_chat'));
  });

  it('ignores verified orders on every other channel', () => {
    expect(classifierSystemPrompt('email', ['#1024'])).toBe(CLASSIFIER_SYSTEM_PROMPT);
  });
});
