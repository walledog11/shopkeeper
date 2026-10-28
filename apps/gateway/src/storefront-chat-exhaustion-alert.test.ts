import { describe, expect, it } from 'vitest';
import { storefrontChatExhaustionIdempotencyKey } from './storefront-chat-exhaustion-alert.js';

describe('storefrontChatExhaustionIdempotencyKey', () => {
  it('is stable for one shop on one day, so repeated refusals cannot re-send', () => {
    const first = storefrontChatExhaustionIdempotencyKey('org_1', 'int_1', '2026-08-13');
    const second = storefrontChatExhaustionIdempotencyKey('org_1', 'int_1', '2026-08-13');

    expect(first).toBe(second);
  });

  it('rolls with the day, so tomorrow gets its own notice', () => {
    expect(storefrontChatExhaustionIdempotencyKey('org_1', 'int_1', '2026-08-13'))
      .not.toBe(storefrontChatExhaustionIdempotencyKey('org_1', 'int_1', '2026-08-14'));
  });

  it('separates two shops in one workspace', () => {
    expect(storefrontChatExhaustionIdempotencyKey('org_1', 'int_1', '2026-08-13'))
      .not.toBe(storefrontChatExhaustionIdempotencyKey('org_1', 'int_2', '2026-08-13'));
  });
});
