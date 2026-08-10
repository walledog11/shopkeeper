import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sealOAuthAttempt, unsealOAuthAttempt, type NewOAuthAttempt } from './oauth-attempt';

const NOW = Date.parse('2026-08-09T20:00:00.000Z');
const ATTEMPT: NewOAuthAttempt = {
  provider: 'shopify',
  state: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  userId: 'user_1',
  orgId: 'org_1',
  returnTo: '/dashboard/integrations',
  mode: 'popup',
  extra: { shop: 'fixture.myshopify.com' },
};

beforeEach(() => {
  vi.stubEnv('OAUTH_ATTEMPT_SECRET', 'unit-test-oauth-attempt-secret-value');
});

describe('OAuth attempt envelope', () => {
  it('round-trips a signed attempt bound to its provider and state', () => {
    const token = sealOAuthAttempt(ATTEMPT, NOW);

    expect(unsealOAuthAttempt(token, {
      provider: ATTEMPT.provider,
      state: ATTEMPT.state,
    }, NOW)).toMatchObject(ATTEMPT);
  });

  it('rejects a modified payload', () => {
    const token = sealOAuthAttempt(ATTEMPT, NOW);
    const [encoded, signature] = token.split('.');
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, unknown>;
    payload.orgId = 'org_2';
    const modified = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

    expect(unsealOAuthAttempt(`${modified}.${signature}`, {
      provider: ATTEMPT.provider,
      state: ATTEMPT.state,
    }, NOW)).toBeNull();
  });

  it.each([
    ['provider', { provider: 'instagram' as const, state: ATTEMPT.state }],
    ['state', { provider: ATTEMPT.provider, state: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }],
  ])('rejects an unexpected %s', (_label, expected) => {
    const token = sealOAuthAttempt(ATTEMPT, NOW);
    expect(unsealOAuthAttempt(token, expected, NOW)).toBeNull();
  });

  it('rejects an expired attempt', () => {
    const token = sealOAuthAttempt(ATTEMPT, NOW);
    expect(unsealOAuthAttempt(token, {
      provider: ATTEMPT.provider,
      state: ATTEMPT.state,
    }, NOW + 10 * 60 * 1_000)).toBeNull();
  });

  it('rejects attempts issued in the future', () => {
    const token = sealOAuthAttempt(ATTEMPT, NOW + 1);
    expect(unsealOAuthAttempt(token, {
      provider: ATTEMPT.provider,
      state: ATTEMPT.state,
    }, NOW)).toBeNull();
  });
});
