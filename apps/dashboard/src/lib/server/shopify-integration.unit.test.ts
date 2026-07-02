import { beforeEach, describe, expect, it, vi } from 'vitest';

const { shopifyRestJson, redisSet } = vi.hoisted(() => ({
  shopifyRestJson: vi.fn(),
  redisSet: vi.fn(),
}));

vi.mock('@shopkeeper/agent/shopify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shopkeeper/agent/shopify')>();
  return {
    ...actual,
    shopifyRestJson,
  };
});

vi.mock('@/lib/server/redis', () => ({
  getRedis: () => ({ set: redisSet }),
}));

vi.mock('@shopkeeper/db', () => ({
  db: {
    integration: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

import { ShopifyRequestError } from '@shopkeeper/agent/shopify';
import {
  getShopifyConnectionState,
  isShopifyAuthFailure,
  isShopifyIntegrationOperational,
  refreshShopifyIntegrationHealthIfDue,
} from './shopify-integration';

const integration = {
  id: 'int_1',
  organizationId: 'org_1',
  externalAccountId: 'fixture-shop.myshopify.com',
  accessToken: 'shpat_test',
  tokenExpiresAt: null as Date | null,
};

beforeEach(() => {
  vi.clearAllMocks();
  redisSet.mockResolvedValue('OK');
});

describe('getShopifyConnectionState', () => {
  it('marks integrations without access tokens as incomplete', () => {
    expect(getShopifyConnectionState({ accessToken: null, tokenExpiresAt: null })).toBe('incomplete');
  });

  it('marks expired integrations as invalid', () => {
    expect(getShopifyConnectionState({
      accessToken: 'shpat_test',
      tokenExpiresAt: new Date(0),
    })).toBe('invalid');
  });

  it('marks healthy integrations as active', () => {
    expect(getShopifyConnectionState({
      accessToken: 'shpat_test',
      tokenExpiresAt: null,
    })).toBe('active');
  });
});

describe('isShopifyIntegrationOperational', () => {
  it('returns true only for active integrations', () => {
    expect(isShopifyIntegrationOperational({
      accessToken: 'shpat_test',
      tokenExpiresAt: null,
    })).toBe(true);
    expect(isShopifyIntegrationOperational({
      accessToken: null,
      tokenExpiresAt: null,
    })).toBe(false);
  });
});

describe('isShopifyAuthFailure', () => {
  it('matches Shopify auth failures', () => {
    expect(isShopifyAuthFailure(401)).toBe(true);
    expect(isShopifyAuthFailure(403)).toBe(true);
    expect(isShopifyAuthFailure(404)).toBe(false);
  });
});

describe('refreshShopifyIntegrationHealthIfDue', () => {
  it('never probes a simulated integration', async () => {
    const result = await refreshShopifyIntegrationHealthIfDue({
      ...integration,
      metadata: { simulated: true },
    });

    expect(result).toBeNull();
    expect(redisSet).not.toHaveBeenCalled();
    expect(shopifyRestJson).not.toHaveBeenCalled();
  });

  it('skips probe when integration is not operational', async () => {
    const result = await refreshShopifyIntegrationHealthIfDue({
      ...integration,
      accessToken: null,
    });

    expect(result).toBeNull();
    expect(shopifyRestJson).not.toHaveBeenCalled();
  });

  it('skips probe when redis cooldown is active', async () => {
    redisSet.mockResolvedValue(null);

    const result = await refreshShopifyIntegrationHealthIfDue(integration);

    expect(result).toBeNull();
    expect(shopifyRestJson).not.toHaveBeenCalled();
  });

  it('returns epoch when Shopify auth fails', async () => {
    shopifyRestJson.mockRejectedValue(new ShopifyRequestError('Unauthorized', { status: 401 }));

    const result = await refreshShopifyIntegrationHealthIfDue(integration);

    expect(result?.getTime()).toBe(0);
  });
});
