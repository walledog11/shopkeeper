import { describe, expect, it } from 'vitest';
import {
  buildThreadReplyHeaders,
  createThreadMessageId,
  formatReplySubject,
} from './reply';

describe('email reply metadata', () => {
  it('formats reply subjects without duplicating an existing prefix', () => {
    expect(formatReplySubject('Order status')).toBe('Re: Order status');
    expect(formatReplySubject('RE: Order status')).toBe('RE: Order status');
    expect(formatReplySubject(null)).toBe('Re: Your inquiry');
    expect(formatReplySubject('  ', 'Support')).toBe('Re: Support');
  });

  it('builds synthetic message IDs and reply headers', () => {
    expect(createThreadMessageId('thread-1', 'mail.test')).toBe('<thread-thread-1@mail.test>');
    expect(buildThreadReplyHeaders('thread-1', '<incoming@example.test>', 'mail.test')).toEqual([
      { name: 'Message-ID', value: '<thread-thread-1@mail.test>' },
      { name: 'In-Reply-To', value: '<incoming@example.test>' },
      { name: 'References', value: '<incoming@example.test>' },
    ]);
  });

  it('uses the synthetic message ID as the reply reference when none exists', () => {
    const messageId = createThreadMessageId('thread-2');
    expect(buildThreadReplyHeaders('thread-2')).toEqual([
      { name: 'Message-ID', value: messageId },
      { name: 'In-Reply-To', value: messageId },
      { name: 'References', value: messageId },
    ]);
  });
});
