export interface E2EAuthIdentity {
  orgId: string;
  orgName: string;
  userId: string;
}

export function isE2EAuthBypassEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === 'production' || env.E2E_AUTH_BYPASS !== 'true') {
    return false;
  }
  // `next dev` runs with NODE_ENV=development; the preview harness still needs
  // auth bypass when pointed at the local test database.
  return env.NODE_ENV === 'test' || env.NODE_ENV === 'development';
}

export function getE2EAuthIdentity(env: NodeJS.ProcessEnv = process.env): E2EAuthIdentity | null {
  if (!isE2EAuthBypassEnabled(env)) {
    return null;
  }

  return {
    orgId: env.E2E_CLERK_ORG_ID || 'org_e2e_test',
    orgName: env.E2E_TEST_ORG_NAME || 'E2E Test Store',
    userId: env.E2E_CLERK_USER_ID || 'user_e2e_test',
  };
}
