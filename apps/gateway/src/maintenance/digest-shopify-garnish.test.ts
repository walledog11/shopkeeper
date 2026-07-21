import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isSalesPulseEnabled,
  loadDigestShopifyGarnish,
  resolveLowStockThreshold,
} from './digest-shopify-garnish.js';

vi.mock('@shopkeeper/db', () => ({
  db: {
    integration: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@shopkeeper/agent/shopify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shopkeeper/agent/shopify')>();
  return {
    ...actual,
    summarizeOrdersInWindow: vi.fn(),
    listLowStockVariants: vi.fn(),
  };
});

import { db } from '@shopkeeper/db';
import {
  listLowStockVariants,
  summarizeOrdersInWindow,
} from '@shopkeeper/agent/shopify';

const integrationFindFirst = vi.mocked(db.integration.findFirst);
const summarizeOrdersInWindowMock = vi.mocked(summarizeOrdersInWindow);
const listLowStockVariantsMock = vi.mocked(listLowStockVariants);

afterEach(() => {
  vi.clearAllMocks();
});

describe('digest Shopify garnish settings', () => {
  it('defaults sales pulse to enabled unless explicitly disabled', () => {
    expect(isSalesPulseEnabled({})).toBe(true);
    expect(isSalesPulseEnabled({ salesPulseEnabled: false })).toBe(false);
  });

  it('parses low-stock threshold only when it is a non-negative number', () => {
    expect(resolveLowStockThreshold({})).toBeNull();
    expect(resolveLowStockThreshold({ lowStockThreshold: 5 })).toBe(5);
    expect(resolveLowStockThreshold({ lowStockThreshold: null })).toBeNull();
    expect(resolveLowStockThreshold({ lowStockThreshold: -1 })).toBeNull();
  });
});

describe('loadDigestShopifyGarnish', () => {
  it('returns sales and low-stock lines when Shopify is connected', async () => {
    integrationFindFirst.mockResolvedValue({
      externalAccountId: 'store.myshopify.com',
      accessToken: 'token',
    } as never);

    summarizeOrdersInWindowMock
      .mockResolvedValueOnce({ orderCount: 3, revenueTotal: 120, currency: 'USD' })
      .mockResolvedValueOnce({ orderCount: 2, revenueTotal: 80, currency: 'USD' });
    listLowStockVariantsMock.mockResolvedValue([
      { productTitle: 'Hat', variantTitle: 'Blue', inventoryQuantity: 1 },
    ]);

    const lines = await loadDigestShopifyGarnish('org-1', { lowStockThreshold: 5 }, new Date('2026-04-29T12:00:00Z'));

    expect(lines).toEqual([
      'Sales since your last briefing: 3 orders · $120 (vs 2 orders · $80 last week)',
      'Low stock (≤5): Hat (Blue) · 1 left',
    ]);
  });

  it('drops failed garnish lines without throwing', async () => {
    integrationFindFirst.mockResolvedValue({
      externalAccountId: 'store.myshopify.com',
      accessToken: 'token',
    } as never);

    summarizeOrdersInWindowMock.mockRejectedValue(new Error('Shopify down'));
    listLowStockVariantsMock.mockResolvedValue([]);

    await expect(loadDigestShopifyGarnish('org-1', { lowStockThreshold: 5 }, new Date())).resolves.toEqual([]);
  });
});
