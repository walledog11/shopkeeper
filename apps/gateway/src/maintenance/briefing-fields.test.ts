import { describe, it, expect } from 'vitest';
import { emptyRequestFacts, type RequestFacts } from '@shopkeeper/agent/classifier-signals';
import {
  byDeadlineFirst,
  daysUntilDeadline,
  formatDeadlineLead,
  formatFactsBriefingLine,
} from './briefing-fields.js';

const NOW = new Date('2026-08-21T09:00:00.000Z');

function facts(overrides: Partial<RequestFacts> = {}): RequestFacts {
  return { ...emptyRequestFacts(), ...overrides };
}

describe('formatDeadlineLead', () => {
  // A date the merchant has already missed is the most urgent line on the page.
  it('surfaces a passed deadline rather than dropping it', () => {
    expect(formatDeadlineLead(facts({ deadline: '2026-08-20' }), NOW))
      .toBe('Customer deadline passed: Thu, Aug 20, 2026');
    expect(formatDeadlineLead(facts({ deadline: '2026-08-18' }), NOW))
      .toBe('Customer deadline passed: Tue, Aug 18, 2026');
  });
});

describe('formatFactsBriefingLine', () => {
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
