import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, EmailProvider, db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestIntegration,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';

const { mockEmitOpsAlert, mockFetch } = vi.hoisted(() => ({
  mockEmitOpsAlert: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));
vi.mock('@/lib/server/ops-alerts', () => ({
  emitOpsAlert: mockEmitOpsAlert,
}));

vi.stubGlobal('fetch', mockFetch);

import { auth } from '@clerk/nextjs/server';
import { DELETE, PATCH } from './route';

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

  it('moves the default to the remaining provider when the default is deleted', async () => {
    const gmail = await createActiveGmailIntegration(org.id);
    const forwarding = await createTestIntegration(org.id, {
      platform: ChannelType.email,
      emailProvider: EmailProvider.postmark,
      externalAccountId: 'support@example.com',
    });
    await db.organization.update({
      where: { id: org.id },
      data: { defaultEmailIntegrationId: forwarding.id },
    });

    const response = await DELETE(
      new Request(`http://localhost/api/integrations/${forwarding.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: forwarding.id }) },
    );

    expect(response.status).toBe(204);
    await expect(db.organization.findUniqueOrThrow({ where: { id: org.id } }))
      .resolves.toMatchObject({ defaultEmailIntegrationId: gmail.id });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('preserves the default when the non-default provider is deleted', async () => {
    const gmail = await createActiveGmailIntegration(org.id);
    const forwarding = await createTestIntegration(org.id, {
      platform: ChannelType.email,
      emailProvider: EmailProvider.postmark,
      externalAccountId: 'support@example.com',
    });
    await db.organization.update({
      where: { id: org.id },
      data: { defaultEmailIntegrationId: gmail.id },
    });

    const response = await DELETE(
      new Request(`http://localhost/api/integrations/${forwarding.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: forwarding.id }) },
    );

    expect(response.status).toBe(204);
    await expect(db.organization.findUniqueOrThrow({ where: { id: org.id } }))
      .resolves.toMatchObject({ defaultEmailIntegrationId: gmail.id });
  });

  it('unsubscribes an Instagram Login account before deleting it locally', async () => {
    const integration = await createInstagramLoginIntegration(org.id);
    const customer = await createTestCustomer(org.id, 'instagram-disconnect-customer');
    const thread = await createTestThread(org.id, customer.id, ChannelType.ig_dm);
    await db.thread.update({
      where: { id: thread.id },
      data: { replyIntegrationId: integration.id },
    });
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }));

    const response = await DELETE(
      new Request(`http://localhost/api/integrations/${integration.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: integration.id }) },
    );

    expect(response.status).toBe(204);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://graph.instagram.com/v25.0/${integration.externalAccountId}/subscribed_apps`);
    expect(init).toMatchObject({
      method: 'DELETE',
      headers: expect.objectContaining({ Authorization: 'Bearer instagram-access-token' }),
    });
    expect(String(init.body)).toBe('subscribed_fields=messages');
    expect(new URL(url).searchParams.has('access_token')).toBe(false);
    await expect(db.integration.findUnique({ where: { id: integration.id } })).resolves.toBeNull();
    await expect(db.thread.findUniqueOrThrow({ where: { id: thread.id } }))
      .resolves.toMatchObject({ replyIntegrationId: null });
    expect(mockEmitOpsAlert).not.toHaveBeenCalled();
  });

  it('deletes local Instagram access and emits a cleanup warning when unsubscribe fails', async () => {
    const integration = await createInstagramLoginIntegration(org.id);
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      error: {
        code: 2,
        error_subcode: 99,
        fbtrace_id: 'trace-cleanup',
        message: 'Meta temporarily unavailable',
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 503,
    }));

    const response = await DELETE(
      new Request(`http://localhost/api/integrations/${integration.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: integration.id }) },
    );

    expect(response.status).toBe(204);
    await expect(db.integration.findUnique({ where: { id: integration.id } })).resolves.toBeNull();
    expect(mockEmitOpsAlert).toHaveBeenCalledWith(expect.objectContaining({
      category: 'provider_cleanup',
      level: 'warning',
      tags: { channel: 'ig_dm', provider: 'meta' },
      extra: expect.objectContaining({
        accountId: integration.externalAccountId,
        category: 'transient_provider_failure',
        code: 2,
        httpStatus: 503,
        integrationId: integration.id,
        manualCleanupRequired: true,
        organizationId: org.id,
        reason: 'provider_unsubscribe_failed',
        requestId: 'trace-cleanup',
        subcode: 99,
      }),
    }));
  });

  it('does not expose another organization Instagram token during disconnect', async () => {
    otherOrg = await createTestOrg();
    const integration = await createInstagramLoginIntegration(otherOrg.id);

    const response = await DELETE(
      new Request(`http://localhost/api/integrations/${integration.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: integration.id }) },
    );

    expect(response.status).toBe(404);
    expect(mockFetch).not.toHaveBeenCalled();
    await expect(db.integration.findUnique({ where: { id: integration.id } }))
      .resolves.not.toBeNull();
  });

  it('deletes legacy Page-token rows without sending them to the Instagram Login API', async () => {
    const integration = await createTestIntegration(org.id, {
      platform: ChannelType.ig_dm,
      externalAccountId: `legacy-ig-${org.id.slice(0, 8)}`,
      accessToken: 'legacy-page-token',
    });

    const response = await DELETE(
      new Request(`http://localhost/api/integrations/${integration.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: integration.id }) },
    );

    expect(response.status).toBe(204);
    expect(mockFetch).not.toHaveBeenCalled();
    await expect(db.integration.findUnique({ where: { id: integration.id } })).resolves.toBeNull();
  });
});

describe('PATCH /api/integrations/[id]', () => {
  it('updates and normalizes the customer-facing email address', async () => {
    const integration = await createActiveGmailIntegration(org.id);

    const response = await PATCH(
      new Request(`http://localhost/api/integrations/${integration.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromEmail: ' Support@Merchant.Test ' }),
      }),
      { params: Promise.resolve({ id: integration.id }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: integration.id,
      fromEmail: 'support@merchant.test',
    });
    await expect(
      db.integration.findUniqueOrThrow({ where: { id: integration.id } }),
    ).resolves.toMatchObject({ fromEmail: 'support@merchant.test' });
  });

  it('rejects invalid addresses without changing the integration', async () => {
    const integration = await createActiveGmailIntegration(org.id);

    const response = await PATCH(
      new Request(`http://localhost/api/integrations/${integration.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromEmail: 'not-an-email' }),
      }),
      { params: Promise.resolve({ id: integration.id }) },
    );

    expect(response.status).toBe(400);
    await expect(
      db.integration.findUniqueOrThrow({ where: { id: integration.id } }),
    ).resolves.toMatchObject({ fromEmail: null });
  });

  it('does not allow updating another organization’s integration', async () => {
    otherOrg = await createTestOrg();
    const integration = await createActiveGmailIntegration(otherOrg.id);

    const response = await PATCH(
      new Request(`http://localhost/api/integrations/${integration.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromEmail: 'support@merchant.test' }),
      }),
      { params: Promise.resolve({ id: integration.id }) },
    );

    expect(response.status).toBe(404);
  });
});

async function createActiveGmailIntegration(organizationId: string) {
  return db.integration.create({
    data: {
      organizationId,
      platform: ChannelType.email,
      emailProvider: EmailProvider.gmail,
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

async function createInstagramLoginIntegration(organizationId: string) {
  return createTestIntegration(organizationId, {
    platform: ChannelType.ig_dm,
    externalAccountId: `ig-${organizationId.slice(0, 8)}`,
    accessToken: 'instagram-access-token',
    metadata: {
      instagram: {
        authModel: 'instagram_login',
        subscribedFields: ['messages'],
      },
    },
  });
}
