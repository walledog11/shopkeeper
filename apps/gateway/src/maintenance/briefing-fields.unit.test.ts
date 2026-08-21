import { describe, it, expect } from 'vitest';
import { emptyRequestFacts, type RequestFacts } from '@shopkeeper/agent/classifier-signals';
import {
  byDeadlineFirst,
  daysUntilDeadline,
  formatAskPhrase,
  formatDeadlineLead,
  formatFactsBriefingLine,
} from './briefing-fields.js';

const NOW = new Date('2026-08-21T09:00:00.000Z');

function facts(overrides: Partial<RequestFacts> = {}): RequestFacts {
  return { ...emptyRequestFacts(), ...overrides };
}

describe('formatDeadlineLead', () => {
  it('names the weekday inside a week', () => {
    expect(formatDeadlineLead(facts({ deadline: '2026-08-23' }), NOW)).toBe('By Sunday');
  });

  it('switches to a date past a week out', () => {
    expect(formatDeadlineLead(facts({ deadline: '2026-09-04' }), NOW)).toBe('By Sep 4');
  });

  it('reads today and tomorrow as words', () => {
    expect(formatDeadlineLead(facts({ deadline: '2026-08-21' }), NOW)).toBe('Due today');
    expect(formatDeadlineLead(facts({ deadline: '2026-08-22' }), NOW)).toBe('Due tomorrow');
  });

  // A date the merchant has already missed is the most urgent line on the page.
  it('surfaces a passed deadline rather than dropping it', () => {
    expect(formatDeadlineLead(facts({ deadline: '2026-08-20' }), NOW)).toBe('Overdue since yesterday');
    expect(formatDeadlineLead(facts({ deadline: '2026-08-18' }), NOW)).toBe('Overdue by 3 days');
  });

  // The customer's words are printed as they were written or not at all — there
  // is no rewording step, so there is nothing to repair afterwards.
  it('falls back to the verbatim phrase when no date resolved', () => {
    expect(formatDeadlineLead(facts({ deadlineText: 'before the weekend' }), NOW))
      .toBe('Before the weekend');
  });

  it('is null when the customer named no timing', () => {
    expect(formatDeadlineLead(facts(), NOW)).toBeNull();
  });
});

describe('formatAskPhrase', () => {
  it('joins the ask to the alternative the customer offered', () => {
    expect(formatAskPhrase(facts({ ask: 'refund', alternative: 'exchange' })))
      .toBe('refund or exchange');
  });

  it('names the subject when there is one', () => {
    expect(formatAskPhrase(facts({ ask: 'return', subject: 'the olive linen napkins' })))
      .toBe('return — the olive linen napkins');
  });

  it('does not print "refund or refund" when both fields agree', () => {
    expect(formatAskPhrase(facts({ ask: 'refund', alternative: 'refund' }))).toBe('refund');
  });

  it('is null for asks with no label', () => {
    expect(formatAskPhrase(facts({ ask: 'none' }))).toBeNull();
    expect(formatAskPhrase(facts({ ask: 'other' }))).toBeNull();
  });
});

describe('formatFactsBriefingLine', () => {
  it('leads with the deadline', () => {
    const line = formatFactsBriefingLine(
      facts({
        ask: 'refund',
        alternative: 'exchange',
        subject: 'the olive linen napkins',
        order: '#1024',
        deadline: '2026-08-23',
      }),
      'Dana',
      NOW,
    );
    expect(line).toBe('By Sunday — Dana · #1024: refund or exchange — the olive linen napkins');
  });

  it('drops the lead segment when there is no deadline', () => {
    const line = formatFactsBriefingLine(
      facts({ ask: 'order_status', order: '#1024' }),
      'Dana',
      NOW,
    );
    expect(line).toBe('Dana · #1024: order status');
  });

  it('still renders when nobody is named', () => {
    const line = formatFactsBriefingLine(facts({ ask: 'refund', order: '#1024' }), null, NOW);
    expect(line).toBe('#1024: refund');
  });

  // Threads classified before these fields existed parse to an empty ask, and
  // the caller needs to know to keep using its prose path.
  it('is null when the fields carry nothing', () => {
    expect(formatFactsBriefingLine(emptyRequestFacts(), 'Dana', NOW)).toBeNull();
  });
});

describe('byDeadlineFirst', () => {
  it('sorts soonest first and parks undated items last in arrival order', () => {
    const items = [
      { id: 'none-1', f: facts({ ask: 'refund' }) },
      { id: 'sep', f: facts({ ask: 'refund', deadline: '2026-09-04' }) },
      { id: 'none-2', f: facts({ ask: 'return' }) },
      { id: 'overdue', f: facts({ ask: 'cancel', deadline: '2026-08-19' }) },
      { id: 'sunday', f: facts({ ask: 'exchange', deadline: '2026-08-23' }) },
    ];

    expect(byDeadlineFirst(items, (item) => item.f, NOW).map((item) => item.id))
      .toEqual(['overdue', 'sunday', 'sep', 'none-1', 'none-2']);
  });
});

describe('daysUntilDeadline', () => {
  it('is null for a missing or unparseable date', () => {
    expect(daysUntilDeadline(null, NOW)).toBeNull();
    expect(daysUntilDeadline('not-a-date', NOW)).toBeNull();
  });
});
