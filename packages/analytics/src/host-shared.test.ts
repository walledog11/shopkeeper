import { describe, expect, it } from 'vitest';
import { toProductMessageChannel } from './host-shared.js';

describe('toProductMessageChannel', () => {
  it('accepts current thread channel enum values', () => {
    expect(toProductMessageChannel('ig_dm')).toBe('ig_dm');
    expect(toProductMessageChannel('operator')).toBe('operator');
  });

  it('maps retired sms_agent rows to operator for in-flight analytics', () => {
    expect(toProductMessageChannel('sms_agent')).toBe('operator');
  });

  it('drops retired channel types removed from the database enum', () => {
    expect(toProductMessageChannel('sms')).toBeNull();
    expect(toProductMessageChannel('imessage')).toBeNull();
  });
});
