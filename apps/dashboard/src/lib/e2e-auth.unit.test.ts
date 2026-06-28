import { describe, expect, it } from 'vitest';
// Deterministic auth-bypass policy unit coverage.
import { getE2EAuthIdentity, isE2EAuthBypassEnabled } from './e2e-auth';

describe('E2E auth bypass guard', () => {
  it('is disabled unless both NODE_ENV=test and E2E_AUTH_BYPASS=true are set', () => {
    expect(isE2EAuthBypassEnabled({ NODE_ENV: 'test' })).toBe(false);
    expect(isE2EAuthBypassEnabled({ NODE_ENV: 'production', E2E_AUTH_BYPASS: 'true' })).toBe(false);
    expect(isE2EAuthBypassEnabled({ NODE_ENV: 'development', E2E_AUTH_BYPASS: 'true' })).toBe(false);
    expect(isE2EAuthBypassEnabled({ NODE_ENV: 'test', E2E_AUTH_BYPASS: 'true' })).toBe(true);
  });

  it('returns no identity when bypass is disabled', () => {
    expect(getE2EAuthIdentity({ NODE_ENV: 'test', E2E_AUTH_BYPASS: 'false' })).toBeNull();
  });

  it('returns the seeded test identity when bypass is enabled', () => {
    expect(getE2EAuthIdentity({
      NODE_ENV: 'test',
      E2E_AUTH_BYPASS: 'true',
      E2E_CLERK_ORG_ID: 'org_custom',
      E2E_CLERK_USER_ID: 'user_custom',
      E2E_TEST_ORG_NAME: 'Custom E2E Store',
    })).toEqual({
      orgId: 'org_custom',
      orgName: 'Custom E2E Store',
      userId: 'user_custom',
    });
  });
});
