import { describe, expect, it } from 'vitest';
import {
  buildOutboundMessageReplyHeaders,
  buildThreadReplyHeaders,
  createOutboundMessageId,
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

  it('uses a stable per-message ID while preserving thread reply references', () => {
    expect(createOutboundMessageId('message-1', 'mail.test')).toBe('<message-message-1@mail.test>');
    expect(buildOutboundMessageReplyHeaders(
      'thread-1',
      'message-1',
      '<incoming@example.test>',
      'mail.test',
    )).toEqual([
      { name: 'Message-ID', value: '<message-message-1@mail.test>' },
      { name: 'In-Reply-To', value: '<incoming@example.test>' },
      { name: 'References', value: '<incoming@example.test>' },
    ]);
  });

  it('does not emit provider deduplication keys as RFC reply headers', () => {
    const messageId = createThreadMessageId('thread-3', 'mail.test');
    expect(buildThreadReplyHeaders('thread-3', 'gmail:provider-message-1', 'mail.test')).toEqual([
      { name: 'Message-ID', value: messageId },
      { name: 'In-Reply-To', value: messageId },
      { name: 'References', value: messageId },
    ]);
  });
});
