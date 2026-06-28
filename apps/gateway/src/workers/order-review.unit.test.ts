import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildContext,
  findUnique,
  isEnabled,
  logger,
  registerFailure,
  resolveSettings,
  runOrderOps,
  workerConstructor,
} = vi.hoisted(() => ({
  buildContext: vi.fn(),
  findUnique: vi.fn(),
  isEnabled: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  registerFailure: vi.fn(),
  resolveSettings: vi.fn(),
  runOrderOps: vi.fn(),
  workerConstructor: vi.fn(),
}));

let processor: ((job: {
  id?: string;
  data: { organizationId?: string; orderId?: string; traceId?: string };
}) => Promise<void>) | undefined;

vi.mock('bullmq', () => ({
  Worker: class MockWorker {
    queueName: string;
    options: unknown;
    on = vi.fn();
    close = vi.fn();

    constructor(queueName: string, handler: typeof processor, options: unknown) {
      this.queueName = queueName;
      this.options = options;
      processor = handler;
      workerConstructor(queueName, handler, options);
    }
  },
}));
vi.mock('@shopkeeper/db', () => ({
  db: { organization: { findUnique } },
}));
vi.mock('@shopkeeper/agent/order-ops', () => ({
  buildOrderOpsContext: buildContext,
  runOrderOps,
}));
vi.mock('@shopkeeper/agent/settings', () => ({
  resolveAgentSettings: resolveSettings,
}));
vi.mock('../config/runtime-config.js', () => ({
  isOrderRiskMonitorEnabled: isEnabled,
}));
vi.mock('../logger.js', () => ({ default: logger }));
vi.mock('./failure.js', () => ({
  registerJobFailureLogging: registerFailure,
}));

import { createOrderReviewWorker } from './order-review.js';

function createWorker() {
  createOrderReviewWorker({
    workerOptions: { connection: {} } as never,
  });
  if (!processor) throw new Error('Worker processor was not registered');
  return processor;
}

describe('order-review worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processor = undefined;
    resolveSettings.mockReturnValue({ autonomyLevel: 'draft' });
    buildContext.mockResolvedValue({ order: { id: '100' } });
    runOrderOps.mockResolvedValue({ flagged: false });
  });

  it('registers permanent failure logging', () => {
    createWorker();

    expect(workerConstructor).toHaveBeenCalledWith(
      'order-review',
      expect.any(Function),
      expect.any(Object),
    );
    expect(registerFailure).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        logMessage: '[OrderReview] Job failed permanently',
      }),
    );
  });

  it('does no work when monitoring is disabled', async () => {
    isEnabled.mockReturnValue(false);
    const handle = createWorker();

    await handle({ id: 'job-1', data: { organizationId: 'org-1', orderId: '100' } });

    expect(findUnique).not.toHaveBeenCalled();
    expect(runOrderOps).not.toHaveBeenCalled();
  });

  it('drops malformed jobs with an explicit error', async () => {
    isEnabled.mockReturnValue(true);
    const handle = createWorker();

    await handle({ id: 'job-1', data: { organizationId: 'org-1', traceId: 'trace-1' } });

    expect(logger.error).toHaveBeenCalledWith(
      { jobId: 'job-1', traceId: 'trace-1' },
      '[OrderReview] Job missing organizationId/orderId — dropping',
    );
    expect(runOrderOps).not.toHaveBeenCalled();
  });

  it('builds context, resolves settings, and records flagged results', async () => {
    isEnabled.mockReturnValue(true);
    findUnique.mockResolvedValue({ settings: { agentTone: 'warm' } });
    runOrderOps.mockResolvedValue({ flagged: true, flagReason: 'Address mismatch' });
    const handle = createWorker();

    await handle({
      id: 'job-1',
      data: { organizationId: 'org-1', orderId: '100', traceId: 'trace-1' },
    });

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      select: { settings: true },
    });
    expect(resolveSettings).toHaveBeenCalledWith({ agentTone: 'warm' });
    expect(buildContext).toHaveBeenCalledWith('100', 'org-1', expect.any(Function));
    expect(runOrderOps).toHaveBeenCalledWith(
      { order: { id: '100' } },
      { autonomyLevel: 'draft' },
    );
    expect(logger.info).toHaveBeenCalledWith(
      {
        organizationId: 'org-1',
        orderId: '100',
        reason: 'Address mismatch',
        traceId: 'trace-1',
      },
      '[OrderReview] order flagged',
    );
  });

  it('propagates provider failures for BullMQ retry handling', async () => {
    isEnabled.mockReturnValue(true);
    findUnique.mockResolvedValue({ settings: null });
    buildContext.mockRejectedValue(new Error('Shopify unavailable'));
    const handle = createWorker();

    await expect(handle({
      id: 'job-1',
      data: { organizationId: 'org-1', orderId: '100' },
    })).rejects.toThrow('Shopify unavailable');
  });
});
