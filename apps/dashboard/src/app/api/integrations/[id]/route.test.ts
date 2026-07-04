import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.stubGlobal('fetch', mockFetch);

import { auth } from '@clerk/nextjs/server';
import { DELETE } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>>;
let otherOrg: Awaited<ReturnType<typeof createTestOrg>> | null;

beforeEach(async () => {
  org = await createTestOrg();
  otherOrg = null;
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_test',
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  await cleanupTestData(otherOrg?.id);
  vi.clearAllMocks();
});

describe('DELETE /api/integrations/[id]', () => {
  it('stops an active Gmail watch before deleting the last mailbox integration', async () => {
    const integration = await createActiveGmailIntegration(org.id);
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const response = await DELETE(
      new Request(`http://localhost/api/integrations/${integration.id}`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: integration.id }) },
    );

    expect(response.status).toBe(204);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0][0])).toBe(
      'https://gmail.googleapis.com/gmail/v1/users/me/stop',
    );
    await expect(
      db.integration.findUnique({ where: { id: integration.id } }),
    ).resolves.toBeNull();
  });

  it('keeps the mailbox watch when another native integration uses it', async () => {
    const integration = await createActiveGmailIntegration(org.id);
    otherOrg = await createTestOrg();
    const retained = await createActiveGmailIntegration(otherOrg.id);

    const response = await DELETE(
      new Request(`http://localhost/api/integrations/${integration.id}`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: integration.id }) },
    );

    expect(response.status).toBe(204);
    expect(mockFetch).not.toHaveBeenCalled();
    await expect(
      db.integration.findUnique({ where: { id: retained.id } }),
    ).resolves.not.toBeNull();
  });
});

async function createActiveGmailIntegration(organizationId: string) {
  return db.integration.create({
    data: {
      organizationId,
      platform: ChannelType.email,
      externalAccountId: 'shared-mailbox@gmail.test',
      accessToken: 'gmail-access-token',
      refreshToken: 'gmail-refresh-token',
      tokenExpiresAt: new Date(Date.now() + 3_600_000),
      metadata: {
        provider: 'gmail',
        oauthScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
        gmail: {
          inboundStatus: 'active',
          historyId: '12345',
          watchExpiration: '1783382400000',
        },
      },
    },
  });
}
