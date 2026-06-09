import { describe, expect, it } from 'vitest';
import {
  isSameShopifyStore,
  normalizeShopifyShopDomain,
  parseShopifyShopIdentity,
} from './oauth';

describe('normalizeShopifyShopDomain', () => {
  it('normalizes bare store handles', () => {
    expect(normalizeShopifyShopDomain('Fixture-Shop')).toBe('fixture-shop.myshopify.com');
  });
});

describe('parseShopifyShopIdentity', () => {
  it('returns canonical myshopify domain from shop.json payload', () => {
    expect(
      parseShopifyShopIdentity(
        { shop: { id: 42, name: 'Palette Garments', myshopify_domain: 'rxcemn-vt.myshopify.com' } },
        'almond-9567.myshopify.com',
      ),
    ).toEqual({
      id: 42,
      name: 'Palette Garments',
      myshopifyDomain: 'rxcemn-vt.myshopify.com',
    });
  });
});

describe('isSameShopifyStore', () => {
  it('matches stores by permanent shop id', () => {
    const canonical = {
      id: 42,
      name: 'Palette Garments',
      myshopifyDomain: 'rxcemn-vt.myshopify.com',
    };
    const alias = {
      id: 42,
      name: 'Palette Garments',
      myshopifyDomain: 'almond-9567.myshopify.com',
    };
    expect(isSameShopifyStore(canonical, alias)).toBe(true);
  });
});
