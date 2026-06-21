import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

import { auth } from '@clerk/nextjs/server';
import { POST } from './route';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_test',
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
});

function post(body: unknown) {
  return POST(new Request('http://localhost/api/integrations/imessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

describe('/api/integrations/imessage', () => {
  it('stores the Spectrum credentials and returns the webhook URL without exposing secrets', async () => {
    const res = await post({ projectId: 'proj_123', projectSecret: 'sec_456', webhookSecret: 'whk_789' });

    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body.platform).toBe('imessage');
    expect(body.externalAccountId).toBe('proj_123');
    expect(String(body.webhookUrl)).toContain(`/webhooks/photon/${body.id}`);
    expect(body).not.toHaveProperty('accessToken');
    expect(body).not.toHaveProperty('refreshToken');

    const rows = await db.integration.findMany({
      where: { organizationId: org.id, platform: ChannelType.imessage },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].externalAccountId).toBe('proj_123');
    expect(rows[0].accessToken).toBe('sec_456');
    expect(rows[0].refreshToken).toBe('whk_789');
  });

  it('rejects missing credentials without creating an integration', async () => {
    const res = await post({ projectId: 'proj_123' });

    expect(res.status).toBe(400);
    await expect(
      db.integration.count({ where: { organizationId: org.id } }),
    ).resolves.toBe(0);
  });

  it('updates the existing line when reconnecting with the same project id', async () => {
    await post({ projectId: 'proj_123', projectSecret: 'old', webhookSecret: 'old_whk' });
    const res = await post({ projectId: 'proj_123', projectSecret: 'new', webhookSecret: 'new_whk' });

    expect(res.status).toBe(201);
    const rows = await db.integration.findMany({
      where: { organizationId: org.id, platform: ChannelType.imessage },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].accessToken).toBe('new');
    expect(rows[0].refreshToken).toBe('new_whk');
  });
});
