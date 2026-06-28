import { describe, expect, it } from 'vitest';
// Deterministic command parsing unit coverage.
import { parseTelegramCommand } from './command-parser.js';

describe('parseTelegramCommand', () => {
  it('parses digest and pending-plan commands with mixed casing', () => {
    expect(parseTelegramCommand('ReViEw')).toEqual({ type: 'digest-review' });
    expect(parseTelegramCommand('OpEn 2')).toEqual({ type: 'digest-open', index: 2 });
    expect(parseTelegramCommand('SPAM 3')).toEqual({ type: 'digest-spam', index: 3 });
    expect(parseTelegramCommand('RePlY 4 Thanks!')).toEqual({
      type: 'digest-reply',
      index: 4,
      text: 'Thanks!',
    });
    expect(parseTelegramCommand('YeS')).toEqual({ type: 'plan-run' });
    expect(parseTelegramCommand('NO')).toEqual({ type: 'plan-dismiss' });
    expect(parseTelegramCommand('SkIp 2')).toEqual({ type: 'plan-skip', index: 2 });
  });

  it('falls back to free-form for malformed indexes', () => {
    expect(parseTelegramCommand('open two')).toEqual({ type: 'free-form', instruction: 'open two' });
    expect(parseTelegramCommand('spam 1.5')).toEqual({ type: 'free-form', instruction: 'spam 1.5' });
    expect(parseTelegramCommand('skip -1')).toEqual({ type: 'free-form', instruction: 'skip -1' });
  });

  it('falls back to free-form when reply text is empty', () => {
    expect(parseTelegramCommand('reply 1')).toEqual({ type: 'free-form', instruction: 'reply 1' });
    expect(parseTelegramCommand('reply 1   ')).toEqual({ type: 'free-form', instruction: 'reply 1   ' });
  });

  it('parses order lookups and preserves arbitrary free-form instructions', () => {
    expect(parseTelegramCommand('ORDER #4242')).toEqual({ type: 'order-lookup', orderNumber: '#4242' });
    expect(parseTelegramCommand('refund #4242')).toEqual({
      type: 'free-form',
      instruction: 'refund #4242',
    });
  });
});
