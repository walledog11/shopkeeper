import { describe, expect, it } from 'vitest';
import {
  formatStorefrontChatExhaustionMessage,
  storefrontChatExhaustionIdempotencyKey,
} from './storefront-chat-exhaustion-alert.js';

describe('formatStorefrontChatExhaustionMessage', () => {
  it('reports the closed widget instead of asking the merchant to approve anything', () => {
    const message = formatStorefrontChatExhaustionMessage(200, 'palette-dev.myshopify.com');

    expect(message).toContain("hit today's limit of 200 messages");
    expect(message).toContain('palette-dev.myshopify.com');
    // The notification-shape rule: nothing here is a decision, so nothing here
    // asks for one.
    expect(message).not.toContain('Good to send?');
    expect(message).not.toContain('Sound good?');
    expect(message).not.toContain('?\n');
  });

  it('names the shop so an org with more than one store knows which', () => {
    expect(formatStorefrontChatExhaustionMessage(200, 'a.myshopify.com')).toContain('on a.myshopify.com');
  });

  it('still reads as a sentence when the shop domain is unavailable', () => {
    const message = formatStorefrontChatExhaustionMessage(200, null);

    expect(message).toContain('Your storefront chat hit');
    expect(message).not.toContain('null');
    expect(message).not.toContain('undefined');
  });

  it('tells the merchant what the shopper is seeing and what they can change', () => {
    const message = formatStorefrontChatExhaustionMessage(50, null);

    expect(message).toContain('asked to email you instead');
    expect(message).toContain('the limit can go up');
  });
});

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
