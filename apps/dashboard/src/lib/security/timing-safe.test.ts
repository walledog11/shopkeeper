import { describe, expect, it } from 'vitest';
import { timingSafeIncludes } from './timing-safe';

describe('timingSafeIncludes', () => {
  it('matches candidates without throwing on length mismatches', () => {
    expect(timingSafeIncludes(['current-secret', 'previous-secret'], 'previous-secret')).toBe(true);
    expect(timingSafeIncludes(['current-secret'], 'short')).toBe(false);
    expect(timingSafeIncludes([], 'current-secret')).toBe(false);
  });
});
