import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, EmailProvider, db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestIntegration,
  createTestOrg,
} from '@shopkeeper/db/test-helpers';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));

import { auth } from '@clerk/nextjs/server';
import { PATCH } from './route';

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

describe('PATCH /api/integrations/email/default', () => {
  it('switches the proactive default between connected email providers', async () => {
    const gmail = await createTestIntegration(org.id, {
      platform: ChannelType.email,
      emailProvider: EmailProvider.gmail,
      externalAccountId: 'merchant@gmail.test',
      metadata: { provider: 'gmail' },
    });
    const forwarding = await createTestIntegration(org.id, {
      platform: ChannelType.email,
      emailProvider: EmailProvider.postmark,
      externalAccountId: 'support@example.com',
      metadata: { provider: 'postmark' },
    });
    await db.organization.update({
      where: { id: org.id },
      data: { defaultEmailIntegrationId: gmail.id },
    });

    const response = await PATCH(request(forwarding.id));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ integrationId: forwarding.id });
    await expect(db.organization.findUniqueOrThrow({ where: { id: org.id } }))
      .resolves.toMatchObject({ defaultEmailIntegrationId: forwarding.id });
  });

  it('rejects an email integration from another workspace', async () => {
    otherOrg = await createTestOrg();
    const foreign = await createTestIntegration(otherOrg.id, {
      platform: ChannelType.email,
      emailProvider: EmailProvider.gmail,
      externalAccountId: 'foreign@gmail.test',
    });

    const response = await PATCH(request(foreign.id));

    expect(response.status).toBe(400);
    await expect(db.organization.findUniqueOrThrow({ where: { id: org.id } }))
      .resolves.toMatchObject({ defaultEmailIntegrationId: null });
  });

  it('accepts a legacy email row during the dual-read rollout', async () => {
    const legacy = await createTestIntegration(org.id, {
      platform: ChannelType.email,
      emailProvider: null,
      externalAccountId: 'legacy@example.test',
      metadata: { provider: 'gmail' },
    });

    const response = await PATCH(request(legacy.id));

    expect(response.status).toBe(200);
    await expect(db.organization.findUniqueOrThrow({ where: { id: org.id } }))
      .resolves.toMatchObject({ defaultEmailIntegrationId: legacy.id });
  });
});

function request(integrationId: string) {
  return new Request('http://localhost/api/integrations/email/default', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ integrationId }),
  });
}
