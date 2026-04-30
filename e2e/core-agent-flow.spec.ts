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

  await page.goto(`/dashboard/tickets?thread=${thread.id}`);

  await expect(page.getByTestId('tickets-list')).toBeVisible();
  await expect(page.locator(`[data-testid="ticket-row"][data-ticket-id="${thread.id}"]`)).toBeVisible();
  await expect(page.getByTestId('chat-message').filter({ hasText: inboundText })).toBeVisible();

  await page.getByTestId('reply-composer-textarea').fill(replyText);
  await page.getByTestId('reply-composer-send').click();

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
