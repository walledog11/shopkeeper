import { describe, it, expect } from 'vitest';
import {
  parseClassifierJson,
  classifierSignals,
  classifiedFilterFields,
  classifiedRequestFields,
  emptyIntents,
  CLASSIFIER_SYSTEM_PROMPT,
  CLASSIFIER_OUTPUT_SCHEMA,
  classifierSystemPrompt,
} from './classification.js';

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
  it('persists an explicit compensation request independently of its language', () => {
    const result = parseClassifierJson(fullResponse({
      language: 'es',
      requestSummary: 'Customer asks for store credit.',
      intents: { mutative_request: true, compensation_request: true },
      requestFacts: { ask: 'other', subject: null, order: null, deadline: null, deadlineText: null, alternative: null },
    }));
    expect(classifierSignals(result).intents.compensation_request).toBe(true);
    expect(result.language).toBe('es');
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
  // The Messages API validates this schema server-side and rejects the whole
  // request when a node pairs a union `type` with an `enum`. Every test here
  // mocks Anthropic, so that 400 is invisible locally — it took four days and a
  // production canary to surface, and it had disabled classification the whole
  // time. This walks the schema for that one pairing so the next occurrence
  // fails here instead.
  it('never pairs a union type with an enum', () => {
    const offenders: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach((entry, index) => { walk(entry, `${path}[${index}]`); });
        return;
      }
      const record = node as Record<string, unknown>;
      if (Array.isArray(record.type) && record.enum !== undefined) offenders.push(path);
      for (const [key, value] of Object.entries(record)) walk(value, `${path}.${key}`);
    };
    walk(CLASSIFIER_OUTPUT_SCHEMA, 'schema');
    expect(offenders).toEqual([]);
  });
});

describe('classifierSystemPrompt', () => {
  it('caches the shared prefix on every channel', () => {
    const [stable] = classifierSystemPrompt('email');
    expect(stable?.text).toBe(CLASSIFIER_SYSTEM_PROMPT);
    expect(stable?.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('splits the channel suffix into its own block so the prefix stays shared', () => {
    const blocks = classifierSystemPrompt('shopify_chat', ['#1024']);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.text).toBe(CLASSIFIER_SYSTEM_PROMPT);
    // The shared half outlives one thread, so it is worth the longer TTL.
    expect(blocks[0]?.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(blocks[1]?.cache_control).toEqual({ type: 'ephemeral' });
  });
});

describe('thread write contract', () => {
  const result = parseClassifierJson(fullResponse());

  it('routes the filter verdict through the channel rule, not the raw model word', () => {
    const filtered = parseClassifierJson(fullResponse({ classification: 'filtered' }));
    // Email is the only channel allowed to reach `filtered`.
    expect(classifiedFilterFields(filtered, 'email')?.filterStatus).toBe('filtered');
    // A shopper is capped at questionable, never binned.
    expect(classifiedFilterFields(filtered, 'shopify_chat')?.filterStatus).toBe('questionable');
    // A channel that takes no verdict writes nothing at all.
    expect(classifiedFilterFields(filtered, 'operator')).toBeNull();
  });

  it('carries the request source message id so the request half can be aligned', () => {
    expect(classifiedRequestFields(result, 'message-1')).toMatchObject({
      requestSourceMessageId: 'message-1',
      classifierSignals: classifierSignals(result),
    });
    // A burst with no unanswered customer message still writes a null source
    // rather than silently keeping a stale one.
    expect(classifiedRequestFields(result, null).requestSourceMessageId).toBeNull();
  });
});
