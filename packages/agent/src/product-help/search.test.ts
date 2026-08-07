import { describe, expect, it } from 'vitest';
import { searchProductHelp } from './index.js';

describe('searchProductHelp', () => {
  it('finds troubleshooting articles for inbox delivery questions', () => {
    const results = searchProductHelp('tickets not appearing');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(result => result.id === 'tickets-not-appearing')).toBe(true);
  });

  it('returns nothing for an empty query', () => {
    expect(searchProductHelp(' ')).toEqual([]);
  });
});
