import { afterEach, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';
import { db, ChannelType } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';

vi.mock('../realtime/publish.js', () => ({ publishThreadEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../operator-context.js', () => ({ removePendingPlanForThread: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../product-analytics.js', () => ({ captureInboundMessageProcessed: vi.fn() }));

import { processInboundMessage } from './inbound-persistence.js';
import { recoverInboundProcessing } from './inbound-processing.js';

const orgIds: string[] = [];
afterEach(async () => { await Promise.all(orgIds.splice(0).map(cleanupTestData)); });

async function setup() {
  const org = await createTestOrg(); orgIds.push(org.id);
  const add = vi.fn().mockRejectedValueOnce(new Error('queue unavailable')).mockResolvedValue({});
  const queue = { add } as unknown as Queue;
  const ingest = () => processInboundMessage(org.id, 'customer@example.com', ChannelType.email, 'Help', queue, { externalMessageId: 'provider-message' });
  return { org, add, queue, ingest };
}

it('commits recovery work with the message and delivers it on duplicate retry', async () => {
  const { org, add, ingest } = await setup();
  await expect(ingest()).rejects.toThrow('queue unavailable');
  const persisted = await db.message.findFirstOrThrow({ where: { organizationId: org.id } });
  expect(persisted.inboundProcessingPending).toBe(true);
  await expect(ingest()).resolves.toBeNull();
  expect(await db.message.count({ where: { organizationId: org.id } })).toBe(1);
  expect(add).toHaveBeenCalledTimes(2);
  expect((await db.message.findUniqueOrThrow({ where: { id: persisted.id } })).inboundProcessingPending).toBe(false);
});

it('recovers committed work without a provider redelivery', async () => {
  const { org, queue, ingest } = await setup();
  await expect(ingest()).rejects.toThrow('queue unavailable');
  await recoverInboundProcessing(queue);
  expect(await db.message.count({ where: { organizationId: org.id, inboundProcessingPending: true } })).toBe(0);
});
