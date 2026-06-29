import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  captureProductEvent,
  initializeProductAnalytics,
  loggerWarn,
} = vi.hoisted(() => ({
  captureProductEvent: vi.fn(),
  initializeProductAnalytics: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('@shopkeeper/analytics', () => ({
  captureProductEvent,
  initializeProductAnalytics,
  productEventInsertId: {
    integrationConnectionCompleted: vi.fn(),
    integrationConnectionFailed: vi.fn(),
  },
}));

vi.mock('@shopkeeper/db', () => ({
  db: {
    organization: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/server/logger', () => ({
  default: {
    warn: loggerWarn,
  },
}));

const EVENT = {
  event: 'integration_connection_started',
  organizationId: '00000000-0000-4000-8000-000000000001',
  source: 'dashboard',
  platform: 'shopify',
} as const;

async function loadCapture() {
  const analyticsModule = await import('./product-analytics');
  return analyticsModule.captureDashboardProductEvent;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('captureDashboardProductEvent', () => {
  it('initializes the immediate sink once in the capturing bundle', async () => {
    const capture = await loadCapture();

    await capture(EVENT);
    await capture(EVENT);

    expect(initializeProductAnalytics).toHaveBeenCalledTimes(1);
    expect(initializeProductAnalytics).toHaveBeenCalledWith({
      delivery: 'immediate',
      logger: expect.objectContaining({ warn: loggerWarn }),
    });
    expect(captureProductEvent).toHaveBeenCalledTimes(2);
  });

  it('preserves the sink explicitly installed by tests', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const capture = await loadCapture();

    await capture(EVENT);

    expect(initializeProductAnalytics).not.toHaveBeenCalled();
    expect(captureProductEvent).toHaveBeenCalledWith(EVENT);
  });

  it('logs and isolates initialization failures from product capture', async () => {
    initializeProductAnalytics.mockImplementationOnce(() => {
      throw new TypeError('Invalid analytics configuration');
    });
    const capture = await loadCapture();

    await expect(capture(EVENT)).resolves.toBeUndefined();

    expect(loggerWarn).toHaveBeenCalledWith(
      { errorClass: 'TypeError' },
      '[ProductAnalytics] Dashboard initialization failed',
    );
    expect(captureProductEvent).toHaveBeenCalledWith(EVENT);
  });
});
