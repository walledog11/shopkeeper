import { describe, expect, it } from 'vitest';
import { lowerFirst } from './sentence-case.js';

describe('lowerFirst', () => {
  it('lower-cases an ordinary capitalized label', () => {
    expect(lowerFirst('Refund $40')).toBe('refund $40');
  });

  it('leaves an acronym opener alone', () => {
    expect(lowerFirst('URL expired')).toBe('URL expired');
    expect(lowerFirst('KB article missing')).toBe('KB article missing');
  });

  it('leaves text that does not start capitalized alone', () => {
    expect(lowerFirst('refund $40')).toBe('refund $40');
    expect(lowerFirst('')).toBe('');
  });
});
