const PLACEHOLDER_SECRET_KEYS = new Set(['sk_test_clerk']);
const PLACEHOLDER_PUBLISHABLE_KEYS = new Set(['pk_test_Y2xlcmsuZXhhbXBsZS5jb20k']);
const PLACEHOLDER_ORG_IDS = new Set(['org_e2e_test']);

export interface ClerkE2EEnv {
  email: string;
  orgId: string;
  publishableKey: string;
  secretKey: string;
}

export function requireClerkE2EEnv(env: NodeJS.ProcessEnv = process.env): ClerkE2EEnv {
  const email = env.CLERK_E2E_EMAIL;
  const orgId = env.E2E_CLERK_ORG_ID;
  const secretKey = env.CLERK_SECRET_KEY;
  const publishableKey = env.CLERK_PUBLISHABLE_KEY || env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  const missing = [
    ['CLERK_E2E_EMAIL', email],
    ['E2E_CLERK_ORG_ID', isUsableOrgId(orgId) ? orgId : undefined],
    ['CLERK_SECRET_KEY', isUsableSecretKey(secretKey) ? secretKey : undefined],
    ['CLERK_PUBLISHABLE_KEY or NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', isUsablePublishableKey(publishableKey) ? publishableKey : undefined],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      [
        `[e2e] Missing Clerk browser E2E configuration: ${missing.join(', ')}`,
        'Set these to real Clerk development-instance values before running npm run test:e2e:browser.',
        'The server-side E2E_AUTH_BYPASS is only valid for request-level smoke tests.',
      ].join('\n'),
    );
  }

  return {
    email: email as string,
    orgId: orgId as string,
    publishableKey: publishableKey as string,
    secretKey: secretKey as string,
  };
}

function isUsableSecretKey(value: string | undefined): value is string {
  return Boolean(value && value.startsWith('sk_test_') && !PLACEHOLDER_SECRET_KEYS.has(value));
}

function isUsablePublishableKey(value: string | undefined): value is string {
  return Boolean(value && value.startsWith('pk_test_') && !PLACEHOLDER_PUBLISHABLE_KEYS.has(value));
}

function isUsableOrgId(value: string | undefined): value is string {
  return Boolean(value && value.startsWith('org_') && !PLACEHOLDER_ORG_IDS.has(value));
}
