import { clerk } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { requireClerkE2EEnv } from './clerk-env';
import dbHelpers from './db-helpers.cjs';
import outboundHelpers from './outbound-helpers.cjs';

const {
  disconnectDb,
  ensureE2EEmailIntegration,
  getE2EOrg,
  waitForAgentMessage,
  waitForEmailThread,
} = dbHelpers;
const { waitForOutboundRecord } = outboundHelpers;

const gatewayUrl = process.env.GATEWAY_INTERNAL_URL ?? 'http://127.0.0.1:8180';

test.afterAll(async () => {
  await disconnectDb();
});

test('receive inbound email, view ticket, and send a recorded manual reply', async ({ page, request }) => {
  const clerkEnv = requireClerkE2EEnv();
  const org = await getE2EOrg();
  const emailIntegration = await ensureE2EEmailIntegration(org.id);

  const runId = Date.now();
  const customerEmail = `core-e2e-${runId}@example.com`;
  const inboundText = `core browser automated test message ${runId}`;
  const replyText = `core browser manual reply ${runId}`;

  const inboundResponse = await request.post(`${gatewayUrl}/webhooks/email/inbound`, {
    form: {
      From: `Core E2E <${customerEmail}>`,
      To: emailIntegration.externalAccountId,
      Subject: `Core browser E2E ${runId}`,
      TextBody: inboundText,
      MessageID: `<core-e2e-${runId}@example.com>`,
    },
  });
  const inboundBody = await inboundResponse.text();

  expect(
    inboundResponse.ok(),
    `Expected email webhook 2xx, got ${inboundResponse.status()}: ${inboundBody}`,
  ).toBeTruthy();

  const thread = await waitForEmailThread({
    orgId: org.id,
    customerEmail,
    textIncludes: inboundText,
  });

  await page.goto('/');
  await clerk.signIn({ page, emailAddress: clerkEnv.email });
  await clerk.loaded({ page });
  await activateClerkOrganization(page, clerkEnv.orgId);
  await expectDashboardOrg(page, org.id);

  await page.goto(`/dashboard/tickets?thread=${thread.id}`);

  await expect(page.getByTestId('tickets-list')).toBeVisible();
  await expect(page.locator(`[data-testid="ticket-row"][data-ticket-id="${thread.id}"]`)).toBeVisible();
  await expect(page.getByTestId('chat-message').filter({ hasText: inboundText })).toBeVisible();

  const composerTextarea = page.getByTestId('reply-composer-textarea');
  const sendButton = page.getByTestId('reply-composer-send');

  await expect(page.getByTestId('chat-timeline')).toHaveAttribute('data-thread-id', thread.id);
  await composerTextarea.fill(replyText);
  await expect(composerTextarea).toHaveValue(replyText);
  await expect(sendButton).toBeEnabled();

  const sendResponsePromise = page.waitForResponse((response) =>
    response.url().includes('/api/messages') && response.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await sendButton.click();
  const sendResponse = await sendResponsePromise;
  const sendResponseBody = await sendResponse.text();

  expect(
    sendResponse.ok(),
    `Expected manual reply POST 2xx, got ${sendResponse.status()}: ${sendResponseBody}`,
  ).toBeTruthy();

  await waitForOutboundRecord((record: { threadId?: string; channel?: string; text?: string }) =>
    record.threadId === thread.id &&
    record.channel === 'email' &&
    typeof record.text === 'string' &&
    record.text.includes(replyText),
  );

  await waitForAgentMessage({
    threadId: thread.id,
    textIncludes: replyText,
  });
  await expect(page.getByTestId('chat-message').filter({ hasText: replyText })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/dashboard/tickets?thread=${thread.id}`);

  const mobileConversation = page.getByTestId('ticket-conversation');
  const mobileComposer = page.getByTestId('reply-composer-textarea');

  await expect(mobileConversation).toBeVisible();
  await expect(page.getByTestId('chat-timeline')).toHaveAttribute('data-thread-id', thread.id);
  await expect(page.locator('[data-dashboard-mobile-bottom-bar]')).toBeVisible();

  await mobileComposer.focus();
  await expect(mobileConversation).toHaveAttribute('data-keyboard-open', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-mobile-ticket-editing', 'true');
  await expect(page.locator('[data-dashboard-mobile-bottom-bar]')).toBeHidden();
  await expect(page.locator('[data-dashboard-mobile-header]')).toBeHidden();
});

async function activateClerkOrganization(page: Page, organizationId: string) {
  await page.evaluate(async (orgId) => {
    const clerkInstance = (window as Window & {
      Clerk?: {
        loaded?: boolean;
        setActive: (params: { organization: string }) => Promise<void>;
      };
    }).Clerk;

    if (!clerkInstance?.loaded) {
      throw new Error('Clerk did not finish loading before organization activation');
    }

    await clerkInstance.setActive({ organization: orgId });
  }, organizationId);
}

async function expectDashboardOrg(page: Page, expectedOrgId: string) {
  await expect
    .poll(
      async () => {
        const response = await page.request.get('/api/org');
        if (!response.ok()) return null;
        const body = await response.json() as { id?: string };
        return body.id ?? null;
      },
      {
        message: 'Expected Clerk active organization to map to the seeded E2E database organization',
        timeout: 10_000,
      },
    )
    .toBe(expectedOrgId);
}
