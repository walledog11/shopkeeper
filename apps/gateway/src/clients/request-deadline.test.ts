import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ExternalRequestTimeoutError,
  fetchWithDeadline,
} from './request-deadline.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchWithDeadline', () => {
  it('adds a deadline while preserving an existing caller signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const callerSignal = new AbortController().signal;

    await expect(fetchWithDeadline(
      'https://provider.test/resource',
      { signal: callerSignal },
      { provider: 'fixture', operation: 'read' },
    )).resolves.toMatchObject({ status: 204 });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal).not.toBe(callerSignal);
  });

  it('classifies deadline failures with provider context', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      new DOMException('timed out', 'TimeoutError'),
    ));

    const request = fetchWithDeadline(
      'https://provider.test/resource',
      {},
      { provider: 'fixture', operation: 'read', timeoutMs: 25 },
    );

    await expect(request).rejects.toMatchObject({
      name: 'ExternalRequestTimeoutError',
      operation: 'read',
      provider: 'fixture',
      timeoutMs: 25,
    });
    await expect(request).rejects.toBeInstanceOf(ExternalRequestTimeoutError);
  });

  it('preserves non-timeout failures', async () => {
    const failure = new Error('connection reset');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(failure));

    await expect(fetchWithDeadline(
      'https://provider.test/resource',
      {},
      { provider: 'fixture', operation: 'read' },
    )).rejects.toBe(failure);
  });
});
