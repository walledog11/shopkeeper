import { describe, expect, it } from 'vitest';
import { readString, readStringKey } from './values.js';

describe('readString', () => {
  it('trims and rejects empty strings', () => {
    expect(readString('  hi  ')).toBe('hi');
    expect(readString('   ')).toBeNull();
    expect(readString(1)).toBeNull();
  });
});

describe('readStringKey', () => {
  it('reads the first matching key', () => {
    expect(readStringKey({ a: '  x ', b: 'y' }, 'a', 'b')).toBe('x');
    expect(readStringKey({ b: 'y' }, 'a', 'b')).toBe('y');
  });

  it('coerces finite numbers', () => {
    expect(readStringKey({ id: 42 }, 'id')).toBe('42');
  });
});
