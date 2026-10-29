import { describe, expect, it } from 'vitest';
import { isBareVerificationCode } from './verification';

// The only text inspection in the verification design, and it decides nothing
// except which handler runs. It must not swallow ordinary conversation: a
// message misread as a code is a message the merchant never sees.
describe('isBareVerificationCode', () => {
  it('accepts a code however the shopper spaces it', () => {
    expect(isBareVerificationCode('123456')).toBe(true);
    expect(isBareVerificationCode('123 456')).toBe(true);
    expect(isBareVerificationCode('123-456')).toBe(true);
    expect(isBareVerificationCode('  123456  ')).toBe(true);
  });

  it('rejects anything carrying words, so real messages stay messages', () => {
    expect(isBareVerificationCode('my code is 123456')).toBe(false);
    expect(isBareVerificationCode('order 123456')).toBe(false);
    expect(isBareVerificationCode('123456?')).toBe(true);
    expect(isBareVerificationCode('where is my order')).toBe(false);
  });

  it('rejects digit strings that are not six long', () => {
    expect(isBareVerificationCode('12345')).toBe(false);
    expect(isBareVerificationCode('1234567')).toBe(false);
    expect(isBareVerificationCode('1025')).toBe(false);
    // A phone number is the realistic collision, and it is far too long.
    expect(isBareVerificationCode('+1 415 555 0134')).toBe(false);
  });

  it('rejects an empty message', () => {
    expect(isBareVerificationCode('')).toBe(false);
  });
});
