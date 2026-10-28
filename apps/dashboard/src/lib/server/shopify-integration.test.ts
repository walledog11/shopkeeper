import { describe, expect, it } from 'vitest';
import { isShopifyAuthFailure } from './shopify-integration';

describe('isShopifyAuthFailure', () => {
  it('matches Shopify auth failures', () => {
    expect(isShopifyAuthFailure(401)).toBe(true);
    expect(isShopifyAuthFailure(403)).toBe(true);
    expect(isShopifyAuthFailure(404)).toBe(false);
  });
});
