import { beforeEach, describe, expect, it, vi } from 'vitest';

const queueInstances: Array<Record<string, unknown>> = [];

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(function (this: Record<string, unknown>, name: string) {
    const instance = {
      name,
      close: vi.fn().mockResolvedValue(undefined),
    };
    Object.assign(this, instance);
    queueInstances.push(this);
    return this;
  }),
}));

const producerConnection = { id: 'producer' };

vi.mock('./redis-client.js', () => ({
  getGatewayBullMqProducerConnection: vi.fn(() => producerConnection),
  resetGatewayRedisConnectionsForTests: vi.fn(),
}));

import { Queue } from 'bullmq';
import {
  closeGatewayBullMqQueues,
  getGatewayBullMqQueue,
  resetGatewayBullMqQueuesForTests,
} from './gateway-queues.js';
import { QUEUE } from '../constants.js';

beforeEach(() => {
  queueInstances.length = 0;
  vi.mocked(Queue).mockClear();
  resetGatewayBullMqQueuesForTests();
});

describe('getGatewayBullMqQueue', () => {
  it('reuses cached Queue instances per resolved queue name', () => {
    const inbound = getGatewayBullMqQueue(QUEUE.INBOUND);
    const inboundAlias = getGatewayBullMqQueue('inbound');
    const summary = getGatewayBullMqQueue(QUEUE.AI_SUMMARY);

    expect(inbound).toBe(inboundAlias);
    expect(summary).not.toBe(inbound);
    expect(Queue).toHaveBeenCalledTimes(2);
    expect(Queue).toHaveBeenCalledWith(QUEUE.INBOUND, {
      connection: producerConnection,
      defaultJobOptions: expect.objectContaining({ attempts: 3 }),
    });
  });

  it('closes and clears cached queues on shutdown', async () => {
    const inbound = getGatewayBullMqQueue(QUEUE.INBOUND);
    await closeGatewayBullMqQueues();

    expect(inbound.close).toHaveBeenCalledOnce();
    expect(getGatewayBullMqQueue(QUEUE.INBOUND)).not.toBe(inbound);
    expect(Queue).toHaveBeenCalledTimes(2);
  });
});
