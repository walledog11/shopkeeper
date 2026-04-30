import { expect, test } from '@playwright/test';

test('E2E auth bypass opens the dashboard without a Clerk browser session', async ({ request }) => {
  test.skip(process.env.E2E_AUTH_BYPASS !== 'true', 'E2E auth bypass is disabled');

  const response = await request.get('/dashboard/tickets', { maxRedirects: 0 });
  const body = await response.text();

  expect(response?.status(), 'dashboard tickets page should load').toBeLessThan(400);
  expect(body).not.toContain('Sign in');
  expect(body).not.toContain('Create your first workspace');
});
