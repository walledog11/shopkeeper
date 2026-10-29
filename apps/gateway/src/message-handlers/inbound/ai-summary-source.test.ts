import { describe, expect, it } from 'vitest';
import { resolveAiSummarySourceMessageId } from './ai-summary-flow.js';

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
