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
  handleShopifyJob: vi.fn(),
  handleTikTokShopJob: vi.fn(),
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
  channelHandlers.handleShopifyJob.mockClear();
  channelHandlers.handleTikTokShopJob.mockClear();
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
    expect(channelHandlers.handleShopifyJob).not.toHaveBeenCalled();
    expect(channelHandlers.handleTikTokShopJob).not.toHaveBeenCalled();
  });
});
