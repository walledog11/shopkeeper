import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChannelType,
  EmailProvider,
  claimIntegrationDisconnect,
  completeIntegrationDisconnect,
  db,
  markIntegrationProviderCleaned,
} from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestIntegration,
  createTestOrg,
} from '@shopkeeper/db/test-helpers';

const { mockEmitOpsAlert, mockEnqueueDisconnect, mockFetch } = vi.hoisted(() => ({
  mockEmitOpsAlert: vi.fn(),
  mockEnqueueDisconnect: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));
vi.mock('@/lib/server/ops-alerts', () => ({
  emitOpsAlert: mockEmitOpsAlert,
}));
vi.mock('@/lib/integrations/enqueue-integration-disconnect', () => ({
  enqueueIntegrationDisconnect: mockEnqueueDisconnect,
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
    orgRole: 'org:admin',
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  mockEnqueueDisconnect.mockResolvedValue('enqueued');
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  await cleanupTestData(otherOrg?.id);
  vi.clearAllMocks();
});

describe('DELETE /api/integrations/[id]', () => {
  it('durably starts a disconnect without performing provider cleanup in the request', async () => {
    const integration = await createActiveGmailIntegration(org.id);

    const response = await DELETE(
      new Request(`http://localhost/api/integrations/${integration.id}`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: integration.id }) },
    );

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body).toMatchObject({
      deduplicated: false,
      queueAdmission: 'enqueued',
      status: 'pending',
    });
    expect(body.operationId).toEqual(expect.any(String));
    expect(mockEnqueueDisconnect).toHaveBeenCalledWith({
      operationId: body.operationId,
      organizationId: org.id,
    });
    expect(mockFetch).not.toHaveBeenCalled();
    await expect(
      db.integration.findUnique({ where: { id: integration.id } }),
    ).resolves.toMatchObject({ lifecycleStatus: 'disconnecting' });
    await expect(db.integrationDisconnect.findUnique({ where: { id: body.operationId } }))
      .resolves.toMatchObject({ integrationId: integration.id, status: 'pending' });
  });

  it('moves the default immediately so new mail never selects a disconnecting provider', async () => {
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

    expect(response.status).toBe(202);
    await expect(db.organization.findUniqueOrThrow({ where: { id: org.id } }))
      .resolves.toMatchObject({ defaultEmailIntegrationId: gmail.id });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('preserves the default when a non-default provider starts disconnecting', async () => {
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

    expect(response.status).toBe(202);
    await expect(db.organization.findUniqueOrThrow({ where: { id: org.id } }))
      .resolves.toMatchObject({ defaultEmailIntegrationId: gmail.id });
  });

  it('deduplicates repeated requests onto the same durable operation', async () => {
    const integration = await createInstagramLoginIntegration(org.id);
    const first = await DELETE(
      new Request(`http://localhost/api/integrations/${integration.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: integration.id }) },
    );
    const second = await DELETE(
      new Request(`http://localhost/api/integrations/${integration.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: integration.id }) },
    );

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(secondBody).toMatchObject({
      operationId: firstBody.operationId,
      deduplicated: true,
      status: 'pending',
    });
    await expect(db.integrationDisconnect.count({
      where: { integrationId: integration.id },
    })).resolves.toBe(1);
  });

  it('keeps a completed disconnect idempotent after the integration row is gone', async () => {
    const integration = await createTestIntegration(org.id);
    const first = await DELETE(
      new Request(`http://localhost/api/integrations/${integration.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: integration.id }) },
    );
    const firstBody = await first.json();
    const claim = await claimIntegrationDisconnect(firstBody.operationId);
    await markIntegrationProviderCleaned(firstBody.operationId, claim!.claimToken);
    await completeIntegrationDisconnect(firstBody.operationId, claim!.claimToken);

    const repeated = await DELETE(
      new Request(`http://localhost/api/integrations/${integration.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: integration.id }) },
    );

    expect(repeated.status).toBe(202);
    await expect(repeated.json()).resolves.toMatchObject({
      operationId: firstBody.operationId,
      status: 'completed',
      queueAdmission: 'not_needed',
      deduplicated: true,
    });
    expect(mockEnqueueDisconnect).toHaveBeenCalledTimes(1);
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

  it('accepts queue admission failure because the database recovery sweep is authoritative', async () => {
    const integration = await createTestIntegration(org.id, {
      platform: ChannelType.ig_dm,
      externalAccountId: `legacy-ig-${org.id.slice(0, 8)}`,
      accessToken: 'legacy-page-token',
    });
    mockEnqueueDisconnect.mockResolvedValueOnce('unknown');

    const response = await DELETE(
      new Request(`http://localhost/api/integrations/${integration.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: integration.id }) },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ queueAdmission: 'unknown' });
    expect(mockFetch).not.toHaveBeenCalled();
    await expect(db.integration.findUnique({ where: { id: integration.id } }))
      .resolves.toMatchObject({ lifecycleStatus: 'disconnecting' });
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
