import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';
import { db } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';
import type { IntegrationDisconnectJobData } from '../types.js';
import { enqueueRecoverableIntegrationDisconnects } from './integration-disconnect-sweep.js';

const organizationIds: string[] = [];

afterEach(async () => {
  await Promise.all(organizationIds.splice(0).map((id) => cleanupTestData(id)));
});

describe('integration disconnect recovery pagination', () => {
  it('enqueues every eligible operation in a backlog larger than 100 rows', async () => {
    const organization = await createTestOrg();
    organizationIds.push(organization.id);
    const createdAt = new Date(Date.now() - 1_000);
    const operations = Array.from({ length: 125 }, (_, index) => ({
      id: randomUUID(),
      integrationId: randomUUID(),
      organizationId: organization.id,
      platform: 'email' as const,
      externalAccountId: `recovery-backlog-${index}@example.test`,
      createdAt,
    }));
    await db.integrationDisconnect.createMany({ data: operations });

    const add = vi.fn().mockResolvedValue({ id: 'job' });
    const getJob = vi.fn().mockResolvedValue(null);
    const queue = { add, getJob } as unknown as Queue<IntegrationDisconnectJobData>;

    const enqueued = await enqueueRecoverableIntegrationDisconnects(queue);

    const enqueuedIds = new Set(
      add.mock.calls.map((call) => (call[1] as IntegrationDisconnectJobData).operationId),
    );
    expect(enqueued).toBeGreaterThanOrEqual(operations.length);
    expect(operations.every((operation) => enqueuedIds.has(operation.id))).toBe(true);
  });
});
