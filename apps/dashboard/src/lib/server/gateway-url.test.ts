import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGatewayBaseUrl } from './gateway-url';

describe('getGatewayBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the canonical gateway URL when configured', () => {
    vi.stubEnv('GATEWAY_PUBLIC_URL', '');
    vi.stubEnv('GATEWAY_INTERNAL_URL', 'https://gateway.example.com/');

    expect(getGatewayBaseUrl({ required: true })).toBe('https://gateway.example.com');
  });

  it('falls back to the legacy public gateway URL when needed', () => {
    vi.stubEnv('GATEWAY_INTERNAL_URL', '');
    vi.stubEnv('GATEWAY_PUBLIC_URL', 'https://gateway.example.com');

    expect(getGatewayBaseUrl({ required: true })).toBe('https://gateway.example.com');
  });

  it('rejects mismatched canonical and legacy gateway URLs', () => {
    vi.stubEnv('GATEWAY_INTERNAL_URL', 'https://gateway.example.com');
    vi.stubEnv('GATEWAY_PUBLIC_URL', 'https://other.example.com');

    expect(() => getGatewayBaseUrl({ required: true })).toThrow(
      /GATEWAY_INTERNAL_URL and GATEWAY_PUBLIC_URL must match/
    );
  });

  it('defaults to localhost outside production when no gateway URL is set', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('GATEWAY_INTERNAL_URL', '');
    vi.stubEnv('GATEWAY_PUBLIC_URL', '');

    expect(getGatewayBaseUrl()).toBe('http://localhost:8080');
  });

  it('returns null in production when optional gateway URL is unset', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GATEWAY_INTERNAL_URL', '');
    vi.stubEnv('GATEWAY_PUBLIC_URL', '');

    expect(getGatewayBaseUrl()).toBeNull();
  });

  it('requires a gateway URL in production when explicitly requested', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GATEWAY_INTERNAL_URL', '');
    vi.stubEnv('GATEWAY_PUBLIC_URL', '');

    expect(() => getGatewayBaseUrl({ required: true })).toThrow(
      /Missing required environment variable: GATEWAY_INTERNAL_URL/
    );
  });

  it('rejects invalid gateway URLs', () => {
    vi.stubEnv('GATEWAY_PUBLIC_URL', '');
    vi.stubEnv('GATEWAY_INTERNAL_URL', 'not-a-url');

    expect(() => getGatewayBaseUrl({ required: true })).toThrow(
      /GATEWAY_INTERNAL_URL must be a valid absolute URL/
    );
  });
});
