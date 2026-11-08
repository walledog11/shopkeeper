import { describe, expect, it } from 'vitest';
// Deterministic command parsing unit coverage.
import { parseOperatorCommand } from './command-parser.js';

describe('parseOperatorCommand', () => {
  it('parses digest and pending-plan commands with mixed casing', () => {
    expect(parseOperatorCommand('ReViEw')).toEqual({ type: 'digest-review' });
    expect(parseOperatorCommand('OpEn 2')).toEqual({ type: 'digest-open', index: 2 });
    expect(parseOperatorCommand('SPAM 3')).toEqual({ type: 'digest-spam', index: 3 });
    expect(parseOperatorCommand('RePlY 4 Thanks!')).toEqual({
      type: 'digest-reply',
      index: 4,
      text: 'Thanks!',
    });
    expect(parseOperatorCommand('YeS')).toEqual({ type: 'plan-run' });
    expect(parseOperatorCommand('NO')).toEqual({ type: 'plan-dismiss' });
  });

  it('falls back to free-form for malformed indexes', () => {
    expect(parseOperatorCommand('open two')).toEqual({ type: 'free-form', instruction: 'open two' });
    expect(parseOperatorCommand('spam 1.5')).toEqual({ type: 'free-form', instruction: 'spam 1.5' });
    // Leaving a step out is a revision the agent drafts, not a command.
    expect(parseOperatorCommand('skip 2')).toEqual({ type: 'free-form', instruction: 'skip 2' });
  });

  it('falls back to free-form when reply text is empty', () => {
    expect(parseOperatorCommand('reply 1')).toEqual({ type: 'free-form', instruction: 'reply 1' });
    expect(parseOperatorCommand('reply 1   ')).toEqual({ type: 'free-form', instruction: 'reply 1   ' });
  });

  it('treats order references and arbitrary text as free-form for the agent', () => {
    // Order lookups are no longer a deterministic command — they flow to the agent.
    expect(parseOperatorCommand('ORDER #4242')).toEqual({ type: 'free-form', instruction: 'ORDER #4242' });
    expect(parseOperatorCommand('#4242')).toEqual({ type: 'free-form', instruction: '#4242' });
    expect(parseOperatorCommand('refund #4242')).toEqual({
      type: 'free-form',
      instruction: 'refund #4242',
    });
  });

  it('trims surrounding whitespace before matching keyword literals', () => {
    expect(parseOperatorCommand('  yes  ')).toEqual({ type: 'plan-run' });
    expect(parseOperatorCommand(' NO ')).toEqual({ type: 'plan-dismiss' });
  });
});
