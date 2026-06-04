import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiRequestError,
  errorMessageFromPayload,
  errorMessageFromUnknown,
  fetcher,
  isApiRequestError,
  readJsonResponse,
  requestJson,
} from './fetcher';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('client API response helpers', () => {
  it('formats nested API errors and unknown thrown values', () => {
    expect(errorMessageFromPayload({
      error: {
        email: ['is invalid', 'is already used'],
        profile: { name: 'is required' },
      },
    }, 'Fallback')).toBe('email: is invalid; is already used; profile: name: is required');
    expect(errorMessageFromPayload({}, 'Fallback')).toBe('Fallback');
    expect(errorMessageFromUnknown(new Error('Network failed'), 'Fallback')).toBe('Network failed');
    expect(errorMessageFromUnknown('Network failed', 'Fallback')).toBe('Fallback');
  });

  it('returns null for a non-JSON response', async () => {
    await expect(readJsonResponse(new Response('not-json'))).resolves.toBeNull();
  });

  it('throws the API error for failed JSON requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Could not save' }), { status: 400 }),
    ));

    await expect(requestJson('/api/example', { method: 'POST' }, 'Fallback'))
      .rejects.toThrow('Could not save');
  });

  it('preserves response status and payload on request errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }),
    ));

    const error = await requestJson('/api/example').catch(value => value);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(isApiRequestError(error, 404)).toBe(true);
    expect(error).toMatchObject({ message: 'Not found', payload: { error: 'Not found' }, status: 404 });
  });

  it('uses the same API error extraction contract for SWR fetches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { email: ['is invalid'] } }), { status: 422 }),
    ));

    await expect(fetcher('/api/example')).rejects.toThrow('email: is invalid');
  });

  it('rejects successful responses that do not contain JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(requestJson('/api/example', {}, 'Invalid response'))
      .rejects.toThrow('Invalid response');
  });
});
