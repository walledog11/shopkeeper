import { describe, expect, it } from 'vitest';
import { safeEqual } from './crypto.js';

describe('safeEqual', () => {
  it('returns true for equal strings', () => {
    expect(safeEqual('secret', 'secret')).toBe(true);
  });

  it('returns false for different strings', () => {
    expect(safeEqual('secret', 'other')).toBe(false);
  });

  it('returns false when lengths differ', () => {
    expect(safeEqual('short', 'longer-value')).toBe(false);
  });
});
