import { describe, expect, it } from 'vitest';
// Deterministic type-guard unit coverage.
import { isRecord, readString } from './typing.js';

describe('isRecord', () => {
  it('accepts plain objects', () => {
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('rejects null, arrays, and primitives', () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord('text')).toBe(false);
  });
});

describe('readString', () => {
  it('trims non-empty strings', () => {
    expect(readString('  hello  ')).toBe('hello');
  });

  it('returns null for empty or non-string values', () => {
    expect(readString('   ')).toBeNull();
    expect(readString(42)).toBeNull();
    expect(readString(null)).toBeNull();
  });
});
