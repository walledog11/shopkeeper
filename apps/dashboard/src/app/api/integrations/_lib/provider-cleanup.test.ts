import type { Integration } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/ops-alerts', () => ({ emitOpsAlert: vi.fn() }));

import { ServiceUnavailableError } from '@/lib/api/errors';
import { cleanupIntegrationProvider } from './provider-cleanup';

const fetchMock = vi.fn<typeof fetch>();

function socialApiIntegration(): Integration {
  return {
    id: 'integration_1',
    organizationId: 'organization_1',
    platform: 'ig_dm',
    externalAccountId: 'acc_1',
    providerAccountId: 'acc_1',
    accessToken: null,
    lifecycleStatus: 'disconnecting',
    metadata: {
      instagram: {
        authModel: 'socialapi',
        transport: 'socialapi',
        socialApiAccountId: 'acc_1',
        socialApiBrandId: 'brand_1',
      },
    },
  } as unknown as Integration;
}

function listing(accountIds: string[]): Response {
  return Response.json({
    data: accountIds.map(id => ({
      id,
      brand_id: 'brand_1',
      platform: 'instagram',
      username: 'shop',
      status: 'active',
    })),
  });
}

function requests(): string[] {
  return fetchMock.mock.calls.map(([url, init]) => `${init?.method} ${new URL(String(url)).pathname}`);
}

beforeEach(() => {
  vi.stubEnv('SOCIALAPI_API_KEY', 'test-socialapi-key');
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('cleanupIntegrationProvider for a SocialAPI Instagram row', () => {
  it('deletes the connected account at SocialAPI', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await cleanupIntegrationProvider(socialApiIntegration());

    expect(requests()).toEqual(['DELETE /v1/accounts/acc_1']);
  });

  it('treats a 404 as revoked only once the brand no longer lists the account', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(listing(['acc_other']));
    await expect(cleanupIntegrationProvider(socialApiIntegration())).resolves.toBeUndefined();

    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(listing(['acc_1']));
    await expect(cleanupIntegrationProvider(socialApiIntegration()))
      .rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('fails a revoke SocialAPI did not confirm, so the durable disconnect retries it', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(cleanupIntegrationProvider(socialApiIntegration()))
      .rejects.toBeInstanceOf(ServiceUnavailableError);
  });
});
