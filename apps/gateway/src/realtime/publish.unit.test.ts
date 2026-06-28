import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { publish, warn } = vi.hoisted(() => ({
  publish: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../clients/redis-client.js', () => ({
  getGatewayRedis: () => ({ publish }),
}));
vi.mock('../logger.js', () => ({
  default: { warn },
}));

import {
  publishThreadEvent,
  REALTIME_CHANNEL,
  REALTIME_PUBLISH_TIMEOUT_MS,
} from './publish.js';

describe('publishThreadEvent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('publishes an organization-scoped invalidation event', async () => {
    publish.mockResolvedValue(1);

    await publishThreadEvent('org-1', 'thread-1');

    expect(publish).toHaveBeenCalledWith(
      REALTIME_CHANNEL,
      JSON.stringify({ orgId: 'org-1', threadId: 'thread-1' }),
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('stops waiting when Redis does not settle', async () => {
    publish.mockReturnValue(new Promise(() => {}));

    const pending = publishThreadEvent('org-1', 'thread-1');
    await vi.advanceTimersByTimeAsync(REALTIME_PUBLISH_TIMEOUT_MS);
    await pending;

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: `Redis publish timed out after ${REALTIME_PUBLISH_TIMEOUT_MS}ms`,
        orgId: 'org-1',
        threadId: 'thread-1',
      }),
      '[Realtime] publishThreadEvent failed',
    );
  });
});
