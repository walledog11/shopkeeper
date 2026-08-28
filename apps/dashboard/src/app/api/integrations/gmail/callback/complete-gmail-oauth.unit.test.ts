import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '@shopkeeper/agent/testing';

const { mockFetch, mockUpsert } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockUpsert: vi.fn(),
}));

vi.mock('@/app/api/integrations/_lib/email-integration', () => ({
  upsertEmailIntegration: mockUpsert,
}));
vi.mock('@/app/api/integrations/_lib/gmail-watch', () => ({
  registerGmailWatch: vi.fn(),
}));
vi.mock('@/lib/server/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.stubGlobal('fetch', mockFetch);

import { GMAIL_EMAIL_OAUTH } from '@/app/api/integrations/_lib/email-oauth-providers';
import { completeGmailOAuth } from './complete-gmail-oauth';

beforeEach(() => {
  vi.stubEnv('GMAIL_NATIVE_INBOUND', 'false');
  mockUpsert.mockResolvedValue('integration_1');
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('completeGmailOAuth', () => {
  it.each([
    [400, 'token_exchange_failed', 'invalid_credentials'],
    [429, 'token_exchange_failed', 'rate_limited'],
    [503, 'provider_unavailable', 'provider_unavailable'],
  ] as const)('classifies token HTTP %s', async (status, error, failureCategory) => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'rejected' }, status));

    await expect(complete()).resolves.toEqual({ ok: false, error, failureCategory });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('classifies token timeouts as provider unavailable', async () => {
    mockFetch.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));

    await expect(complete()).resolves.toEqual({
      ok: false,
      error: 'provider_unavailable',
      failureCategory: 'provider_unavailable',
    });
  });

  it.each([
    ['malformed JSON', new Response('not-json'), 'token_exchange_failed'],
    ['malformed success', jsonResponse({ scope: 'email' }), 'token_exchange_failed'],
  ])('returns a typed failure for %s', async (_label, response, error) => {
    mockFetch.mockResolvedValueOnce(response);

    await expect(complete()).resolves.toEqual({
      ok: false,
      error,
      failureCategory: 'unknown',
    });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it.each([
    [400, 'no_email', 'invalid_credentials'],
    [429, 'no_email', 'rate_limited'],
    [503, 'provider_unavailable', 'provider_unavailable'],
  ] as const)('classifies userinfo HTTP %s', async (status, error, failureCategory) => {
    mockSuccessfulToken();
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'userinfo failed' }, status));

    await expect(complete()).resolves.toEqual({ ok: false, error, failureCategory });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('classifies a userinfo timeout as provider unavailable', async () => {
    mockSuccessfulToken();
    mockFetch.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));

    await expect(complete()).resolves.toEqual({
      ok: false,
      error: 'provider_unavailable',
      failureCategory: 'provider_unavailable',
    });
  });

  it('does not turn a persistence failure into invalid credentials', async () => {
    mockSuccessfulToken();
    mockFetch.mockResolvedValueOnce(jsonResponse({ email: 'owner@example.test' }));
    mockUpsert.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(complete()).rejects.toThrow('database unavailable');
  });

  it('validates provider fields and returns the persisted integration id', async () => {
    mockSuccessfulToken();
    mockFetch.mockResolvedValueOnce(jsonResponse({
      email: 'owner@example.test',
      hd: 'example.test',
    }));

    await expect(complete()).resolves.toEqual({ ok: true, integrationId: 'integration_1' });
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: 'gmail_access',
      externalAccountId: 'owner@example.test',
      organizationId: 'org_1',
      provider: 'gmail',
      refreshToken: 'gmail_refresh',
      oauthScopes: ['openid', 'email'],
      gmailMetadata: {
        accountType: 'workspace',
        hostedDomain: 'example.test',
      },
    }));
  });
});

function complete() {
  return completeGmailOAuth({
    clientId: 'client_id',
    clientSecret: 'client_secret',
    code: 'oauth_code',
    config: GMAIL_EMAIL_OAUTH,
    organizationId: 'org_1',
    redirectUri: 'https://dashboard.test/api/integrations/gmail/callback',
  });
}

function mockSuccessfulToken() {
  mockFetch.mockResolvedValueOnce(jsonResponse({
    access_token: 'gmail_access',
    expires_in: 3600,
    refresh_token: 'gmail_refresh',
    scope: 'openid email',
  }));
}

