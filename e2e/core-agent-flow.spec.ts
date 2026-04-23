/**
 * E2E: Core agent flow (requires Clerk auth)
 *
 * Prerequisites:
 *   1. Set CLERK_E2E_EMAIL and CLERK_E2E_PASSWORD in .env.local pointing to a
 *      test Clerk account that belongs to a test organisation.
 *   2. Install @clerk/testing: `npm install --save-dev @clerk/testing -w apps/dashboard`
 *   3. Run `npx playwright install` to download browser binaries.
 *
 * Flow tested:
 *   Receive inbound email → dashboard shows new thread → agent opens thread →
 *   types a reply → reply is dispatched and message appears in conversation.
 *
 * All outbound platform API calls (Postmark, Meta) are intercepted via
 * Playwright route() so no real emails are sent.
 */
import { test } from '@playwright/test';

// TODO: Uncomment once @clerk/testing is installed and credentials are configured.
// import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';

test.skip('receive message → view thread → send reply', async ({ page }) => {
  // --- Auth ---
  // await setupClerkTestingToken({ page });
  // await clerk.signIn({ page, signInParams: {
  //   strategy: 'password',
  //   identifier: process.env.CLERK_E2E_EMAIL!,
  //   password: process.env.CLERK_E2E_PASSWORD!,
  // }});

  // --- Intercept outbound Postmark send ---
  await page.route('https://api.postmarkapp.com/email', async route => {
    await route.fulfill({ status: 200, body: JSON.stringify({ MessageID: 'mock-id' }) });
  });

  // --- Inject an inbound email via gateway ---
  // const orgId = '...'; // retrieve from Clerk session after sign-in
  // await request.post('http://localhost:8080/webhooks/email/inbound', { form: { ... } });

  // --- Navigate to dashboard ---
  await page.goto('/dashboard');
  await page.waitForSelector('[data-testid="thread-list"]');

  // --- Assert new thread is visible ---
  // const threadItem = page.locator('[data-testid="thread-item"]').first();
  // await expect(threadItem).toBeVisible();

  // --- Open thread and send reply ---
  // await threadItem.click();
  // await page.fill('[data-testid="reply-input"]', 'Thanks for reaching out!');
  // await page.click('[data-testid="send-reply"]');

  // --- Assert message appears in conversation ---
  // await expect(page.locator('[data-testid="message-bubble"]').last()).toContainText('Thanks for reaching out!');

  // --- Assert Postmark was called ---
  // expect(postmarkPayload).toMatchObject({ TextBody: 'Thanks for reaching out!' });
});
