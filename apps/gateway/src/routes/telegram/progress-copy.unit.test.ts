import { describe, expect, it } from 'vitest';
// Deterministic progress-copy unit coverage.
import { buildProgressCopy } from './progress-copy.js';

describe('buildProgressCopy', () => {
  it('describes plan approval with an order number', () => {
    expect(buildProgressCopy({
      kind: 'plan-run',
      orderNumber: '#1234',
    })).toBe('Running the approved plan for #1234…');
  });

  it('describes plan approval without an order number', () => {
    expect(buildProgressCopy({ kind: 'plan-run' })).toBe('Running the approved plan…');
  });

  it('describes free-form work generically, ignoring any order number', () => {
    expect(buildProgressCopy({ kind: 'free-form' })).toBe('Working on that…');
    expect(buildProgressCopy({
      kind: 'free-form',
      orderNumber: '#5678',
    })).toBe('Working on that…');
  });

  it('describes digest replies with a ticket index', () => {
    expect(buildProgressCopy({
      kind: 'digest-reply',
      ticketIndex: 2,
    })).toBe('Sending your reply on ticket 2…');
  });

  it('describes digest replies without a ticket index', () => {
    expect(buildProgressCopy({ kind: 'digest-reply' })).toBe('Sending your reply…');
  });
});
