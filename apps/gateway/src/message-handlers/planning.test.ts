import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../logger.js', () => ({
  default: mockLogger,
}));

import { sendAutoAck } from './planning.js';

beforeEach(() => {
  mockLogger.debug.mockClear();
  mockLogger.error.mockClear();
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
});

describe('sendAutoAck', () => {
  it('dispatches through the dashboard internal API and logs success', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    try {
      await sendAutoAck('org_1', 'thread_1');

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/\/api\/messages\/auto-ack$/);
      expect(init).toMatchObject({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_API_SECRET,
        },
        body: JSON.stringify({ threadId: 'thread_1' }),
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        { threadId: 'thread_1', organizationId: 'org_1' },
        '[Worker] Auto-ack sent to customer',
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('preserves skipped and failed dispatch warnings', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }));

    try {
      await sendAutoAck('org_1', 'thread_skipped');
      await sendAutoAck('org_1', 'thread_failed');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { threadId: 'thread_skipped', organizationId: 'org_1' },
        '[Worker] Auto-ack skipped by dashboard — check businessHoursEnabled setting sync',
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { status: 503, outcome: 'failed', threadId: 'thread_failed', organizationId: 'org_1' },
        '[Worker] Auto-ack dispatch failed',
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('logs ambiguous dispatch outcomes without claiming a definite failure', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    try {
      await expect(sendAutoAck('org_1', 'thread_1')).resolves.toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { status: null, outcome: 'unknown', threadId: 'thread_1', organizationId: 'org_1' },
        '[Worker] Auto-ack dispatch outcome unknown',
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
