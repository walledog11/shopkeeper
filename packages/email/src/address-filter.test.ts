import { describe, expect, it } from 'vitest';
import { isForSupportAddress } from './address-filter';
import type { ParsedEmail } from './types';

function parsed(overrides: Partial<ParsedEmail>): ParsedEmail {
  return {
    from: 'customer@example.test',
    fromName: null,
    to: [],
    subject: null,
    text: 'hi',
    html: null,
    messageId: null,
    inReplyTo: null,
    references: [],
    attachments: [],
    ...overrides,
  };
}

describe('isForSupportAddress', () => {
  it('matches the support address in To, case-insensitively', () => {
    expect(isForSupportAddress(parsed({ to: ['Support@Merchant.test'] }), 'support@merchant.test')).toBe(true);
  });

  it('matches an address wrapped in angle brackets', () => {
    expect(isForSupportAddress(parsed({ to: ['Help Desk <support@merchant.test>'] }), 'support@merchant.test')).toBe(true);
  });

  it('matches Workspace aliases via Delivered-To / X-Original-To headers', () => {
    expect(
      isForSupportAddress(parsed({ to: ['someone-else@merchant.test'] }), 'support@merchant.test', {
        'delivered-to': 'support@merchant.test',
      }),
    ).toBe(true);
    expect(
      isForSupportAddress(parsed({ to: [] }), 'support@merchant.test', {
        'x-original-to': ['noise@merchant.test', 'support@merchant.test'],
      }),
    ).toBe(true);
  });

  it('returns false when no recipient matches', () => {
    expect(isForSupportAddress(parsed({ to: ['other@merchant.test'] }), 'support@merchant.test')).toBe(false);
  });
});
