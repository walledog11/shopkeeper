import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchProviderWithDeadline,
  ProviderRequestTimeoutError,
} from './provider-fetch';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchProviderWithDeadline', () => {
  it('supplies a deadline signal to provider requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchProviderWithDeadline(
      'https://provider.test/token',
      { method: 'POST' },
      { provider: 'fixture', operation: 'token exchange' },
    )).resolves.toMatchObject({ status: 204 });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://provider.test/token',
      expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) }),
    );
  });

  it('preserves caller cancellation while still applying a deadline', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const callerSignal = new AbortController().signal;

    await fetchProviderWithDeadline(
      'https://provider.test/token',
      { signal: callerSignal },
      { provider: 'fixture', operation: 'token exchange' },
    );

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal).not.toBe(callerSignal);
  });

  it('classifies deadline failures with provider and operation context', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      new DOMException('The operation timed out', 'TimeoutError'),
    ));

    const request = fetchProviderWithDeadline(
      'https://provider.test/token',
      { method: 'POST' },
      {
        provider: 'fixture',
        operation: 'token exchange',
        timeoutMs: 25,
      },
    );

    await expect(request).rejects.toMatchObject({
      name: 'ProviderRequestTimeoutError',
      operation: 'token exchange',
      provider: 'fixture',
      timeoutMs: 25,
    });
    await expect(request).rejects.toBeInstanceOf(ProviderRequestTimeoutError);
  });

  it('preserves non-timeout failures', async () => {
    const failure = new Error('connection reset');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(failure));

    await expect(fetchProviderWithDeadline(
      'https://provider.test/token',
      {},
      { provider: 'fixture', operation: 'token exchange' },
    )).rejects.toBe(failure);
  });
});
