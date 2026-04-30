import { clerkSetup } from '@clerk/testing/playwright';
import { test as setup } from '@playwright/test';
import { requireClerkE2EEnv } from './clerk-env';

setup.describe.configure({ mode: 'serial' });

setup('configure Clerk testing token', async () => {
  const env = requireClerkE2EEnv();

  await clerkSetup({
    publishableKey: env.publishableKey,
    secretKey: env.secretKey,
  });
});
