import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InboundJobData } from '../types.js';

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

const channelHandlers = vi.hoisted(() => ({
  handleEmailJob: vi.fn(),
  handleIgDmJob: vi.fn(),
  handleImessageJob: vi.fn(),
  handleShopifyJob: vi.fn(),
}));

let processor: ((job: { id: string; data: InboundJobData }) => Promise<void>) | undefined;

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(function (
    this: { on: ReturnType<typeof vi.fn> },
    _name: string,
    fn: typeof processor,
  ) {
    processor = fn;
    this.on = vi.fn();
    return this;
  }),
}));

vi.mock('../logger.js', () => ({
  default: mockLogger,
}));

vi.mock('../message-handlers/channels.js', () => channelHandlers);

import { createInboundWorker } from './inbound.js';

beforeEach(() => {
  mockLogger.error.mockClear();
  mockLogger.info.mockClear();
  channelHandlers.handleEmailJob.mockClear();
  channelHandlers.handleIgDmJob.mockClear();
  channelHandlers.handleImessageJob.mockClear();
  channelHandlers.handleShopifyJob.mockClear();
  processor = undefined;
});

describe('createInboundWorker', () => {
  it('throws for an unknown platform so BullMQ can retry or fail the job', async () => {
    createInboundWorker({
      aiSummaryQueue: {} as never,
      workerOptions: { connection: {} },
    });

    await expect(processor!({
      id: 'job-unknown',
      data: {
        platform: 'sms' as InboundJobData['platform'],
        organizationId: 'org_1',
        traceId: 'trace_1',
      },
    })).rejects.toThrow('Unknown inbound platform: sms');

    expect(mockLogger.error).toHaveBeenCalledWith(
      { jobId: 'job-unknown', platform: 'sms', traceId: 'trace_1' },
      '[Worker] Unknown inbound platform',
    );
    expect(channelHandlers.handleEmailJob).not.toHaveBeenCalled();
    expect(channelHandlers.handleIgDmJob).not.toHaveBeenCalled();
    expect(channelHandlers.handleImessageJob).not.toHaveBeenCalled();
    expect(channelHandlers.handleShopifyJob).not.toHaveBeenCalled();
  });

  it('routes imessage jobs to the iMessage handler', async () => {
    const aiSummaryQueue = {} as never;
    createInboundWorker({
      aiSummaryQueue,
      workerOptions: { connection: {} },
    });

    const job = {
      id: 'job-imessage',
      data: {
        platform: 'imessage',
        organizationId: 'org_1',
        senderId: '+15551234567',
        text: 'hello',
        externalMessageId: 'imsg_1',
        externalSpaceId: 'any;-;+15551234567',
      },
    };
    await processor!(job);

    expect(channelHandlers.handleImessageJob).toHaveBeenCalledWith(job, aiSummaryQueue);
    expect(channelHandlers.handleEmailJob).not.toHaveBeenCalled();
    expect(channelHandlers.handleIgDmJob).not.toHaveBeenCalled();
    expect(channelHandlers.handleShopifyJob).not.toHaveBeenCalled();
  });
});
