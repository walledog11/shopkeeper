import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  errorMessageFromPayload,
  errorMessageFromUnknown,
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
});
