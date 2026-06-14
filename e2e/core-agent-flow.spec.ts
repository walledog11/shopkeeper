import { clerk } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { requireClerkE2EEnv } from './clerk-env';
import dbHelpers from './db-helpers.cjs';
import outboundHelpers from './outbound-helpers.cjs';

const {
  ChannelType,
  SenderType,
  cleanupTestData,
  clearRateLimitKey,
  createTestOrg,
  db,
  disconnectDb,
  ensureE2EEmailIntegration,
  getE2EOrg,
  seedEmailThreadWithCachedPlan,
  waitForAgentAuditNote,
  waitForAgentMessage,
  waitForEmailThread,
} = dbHelpers;
const { readOutboundRecords, waitForOutboundRecord } = outboundHelpers;

const gatewayUrl = process.env.GATEWAY_INTERNAL_URL ?? 'http://127.0.0.1:8180';
const orgIdsToCleanup = new Set<string>();

test.afterAll(async () => {
  for (const orgId of orgIdsToCleanup) {
    await cleanupTestData(orgId);
  }
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

  const ticketsList = page.getByRole('main').getByTestId('tickets-list');
  await expect(ticketsList).toBeVisible();
  await expect(ticketsList.locator(`[data-testid="ticket-row"][data-ticket-id="${thread.id}"]`)).toBeVisible();
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
  await expect(page.locator('html')).toHaveAttribute('data-mobile-ticket-detail', 'true');
  await expect(page.locator('[data-dashboard-mobile-bottom-bar]')).toBeHidden();
  await expect(page.locator('[data-dashboard-mobile-header]')).toBeHidden();

  await mobileComposer.focus();

  // Headless Chromium never raises an on-screen keyboard, so visualViewport.height
  // never shrinks on its own. Override the getter and fire a resize so useVisualKeyboard
  // sees the same signal a real virtual keyboard would produce.
  await page.evaluate(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const proto = Object.getPrototypeOf(vv);
    Object.defineProperty(proto, 'height', { configurable: true, get: () => 500 });
    vv.dispatchEvent(new Event('resize'));
  });

  await expect(mobileConversation).toHaveAttribute('data-keyboard-open', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-mobile-ticket-editing', 'true');
  await expect(page.locator('[data-dashboard-mobile-bottom-bar]')).toBeHidden();
  await expect(page.locator('[data-dashboard-mobile-header]')).toBeHidden();
});

test('approve a seeded AI plan and record the outbound email reply', async ({ page }) => {
  const clerkEnv = requireClerkE2EEnv();
  const org = await getE2EOrg();
  await ensureE2EEmailIntegration(org.id);

  const runId = randomUUID();
  const customerEmail = `plan-e2e-${runId}@example.com`;
  const inboundText = `plan approval customer question ${runId}`;
  const replyText = `plan approval recorded reply ${runId}`;
  const instruction = `Send the approved plan reply for ${runId}.`;
  const { thread } = await seedEmailThreadWithCachedPlan({
    orgId: org.id,
    customerEmail,
    inboundText,
    replyText,
    instruction,
  });

  await page.goto('/');
  await clerk.signIn({ page, emailAddress: clerkEnv.email });
  await clerk.loaded({ page });
  await activateClerkOrganization(page, clerkEnv.orgId);
  await expectDashboardOrg(page, org.id);

  await page.goto(`/dashboard/tickets?thread=${thread.id}`);

  const ticketsList = page.getByRole('main').getByTestId('tickets-list');
  await expect(ticketsList).toBeVisible();
  await expect(ticketsList.locator(`[data-testid="ticket-row"][data-ticket-id="${thread.id}"]`)).toBeVisible();
  await expect(page.getByTestId('chat-message').filter({ hasText: inboundText })).toBeVisible();

  const planCard = page.getByTestId('action-plan-card');
  const stepToggle = page.getByTestId('action-plan-step-toggle');
  const runButton = page.getByTestId('action-plan-run');

  await expect(planCard).toBeVisible();
  await expect(planCard).toContainText('Proposed plan');
  await expect(planCard).toContainText(replyText);
  await expect(stepToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(runButton).toBeEnabled();

  const approveResponsePromise = page.waitForResponse((response) =>
    response.url().includes('/api/agent') && response.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await runButton.click();
  const approveResponse = await approveResponsePromise;
  const approveResponseBody = await approveResponse.text();

  expect(
    approveResponse.ok(),
    `Expected plan approval POST 2xx, got ${approveResponse.status()}: ${approveResponseBody}`,
  ).toBeTruthy();

  await waitForOutboundRecord((record: { threadId?: string; channel?: string; source?: string; text?: string }) =>
    record.threadId === thread.id &&
    record.channel === 'email' &&
    record.source === 'agent_send_reply' &&
    typeof record.text === 'string' &&
    record.text.includes(replyText),
  );

  await waitForAgentMessage({
    threadId: thread.id,
    textIncludes: replyText,
  });
  const auditNote = await waitForAgentAuditNote({
    threadId: thread.id,
    textIncludes: '"tool":"send_reply"',
  });
  expect(auditNote.contentText).toContain(instruction);
  expect(auditNote.contentText).toContain('Reply sent to customer via email.');

  const updatedThread = await db.thread.findUnique({
    where: { id: thread.id },
    select: { cachedPlan: true, cachedPlanMessageId: true },
  });
  expect(updatedThread).not.toBeNull();
  if (updatedThread?.cachedPlan === null) {
    expect(updatedThread.cachedPlanMessageId).toBeNull();
  }

  await expect(page.getByTestId('chat-message').filter({ hasText: replyText })).toBeVisible();
});

test('blocks cross-org thread API and UI access in an authenticated session', async ({ page }) => {
  const clerkEnv = requireClerkE2EEnv();
  const org = await getE2EOrg();
  const otherOrg = await createTestOrg();
  orgIdsToCleanup.add(otherOrg.id);

  const runId = randomUUID();
  const otherCustomerName = `Other Org Customer ${runId}`;
  const otherCustomerEmail = `other-org-${runId}@example.com`;
  const otherMessageText = `cross org secret message ${runId}`;

  const otherCustomer = await db.customer.create({
    data: {
      organizationId: otherOrg.id,
      platformId: otherCustomerEmail,
      name: otherCustomerName,
    },
  });
  const otherThread = await db.thread.create({
    data: {
      organizationId: otherOrg.id,
      customerId: otherCustomer.id,
      channelType: ChannelType.email,
      status: 'open',
      tag: 'Cross Org Isolation',
      aiSummary: 'Other organization conversation',
      filterStatus: 'genuine',
      filterReason: 'Seeded cross-org E2E thread',
      filterDecidedAt: new Date(),
    },
  });
  await db.message.create({
    data: {
      threadId: otherThread.id,
      organizationId: otherOrg.id,
      senderType: SenderType.customer,
      contentText: otherMessageText,
      externalMessageId: `<cross-org-${runId}@example.com>`,
    },
  });

  await page.goto('/');
  await clerk.signIn({ page, emailAddress: clerkEnv.email });
  await clerk.loaded({ page });
  await activateClerkOrganization(page, clerkEnv.orgId);
  await expectDashboardOrg(page, org.id);

  const apiResult = await page.evaluate(async (threadId) => {
    const response = await fetch(`/api/threads/${threadId}`);
    return {
      status: response.status,
      body: await response.text(),
    };
  }, otherThread.id);
  expect(apiResult.status, apiResult.body).toBe(404);

  await page.goto(`/dashboard/tickets?thread=${otherThread.id}`);

  await expect(page.getByText('Unable to load conversation')).toBeVisible();
  await expect(page.locator(`[data-testid="ticket-row"][data-ticket-id="${otherThread.id}"]`)).toHaveCount(0);
  await expect(page.getByText(otherCustomerName)).toHaveCount(0);
  await expect(page.getByText(otherMessageText)).toHaveCount(0);
  await expect(page.getByTestId('chat-timeline')).toHaveCount(0);
});

test('rejects unsupported channel dispatch without outbound or agent persistence', async ({ page }) => {
  const clerkEnv = requireClerkE2EEnv();
  const org = await getE2EOrg();
  const runId = randomUUID();
  const customerPlatformId = `tiktok-e2e-${runId}`;
  const customerMessage = `unsupported channel inbound ${runId}`;
  const replyText = `unsupported channel reply ${runId}`;

  const customer = await db.customer.create({
    data: {
      organizationId: org.id,
      platformId: customerPlatformId,
      name: 'Unsupported Channel E2E',
    },
  });
  const thread = await db.thread.create({
    data: {
      organizationId: org.id,
      customerId: customer.id,
      channelType: ChannelType.tiktok,
      status: 'open',
      tag: 'Unsupported Channel',
      aiSummary: 'Unsupported channel dispatch regression',
      filterStatus: 'genuine',
      filterReason: 'Seeded unsupported-channel E2E thread',
      filterDecidedAt: new Date(),
    },
  });
  await db.message.create({
    data: {
      threadId: thread.id,
      organizationId: org.id,
      senderType: SenderType.customer,
      contentText: customerMessage,
      externalMessageId: `tiktok-${runId}`,
    },
  });

  await page.goto('/');
  await clerk.signIn({ page, emailAddress: clerkEnv.email });
  await clerk.loaded({ page });
  await activateClerkOrganization(page, clerkEnv.orgId);
  await expectDashboardOrg(page, org.id);

  const dispatchResult = await page.evaluate(async ({ threadId, text }) => {
    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, text }),
    });
    return {
      ok: response.ok,
      status: response.status,
      body: await response.json().catch(() => null),
    };
  }, { threadId: thread.id, text: replyText });

  expect(dispatchResult.ok).toBe(false);
  expect(dispatchResult.status).toBe(502);
  expect(dispatchResult.body).toMatchObject({ error: 'Unsupported channel' });

  const outboundRecords = await readOutboundRecords();
  expect(outboundRecords).not.toContainEqual(expect.objectContaining({ threadId: thread.id }));

  const agentMessageCount = await db.message.count({
    where: { threadId: thread.id, senderType: SenderType.agent },
  });
  expect(agentMessageCount).toBe(0);
});

test('enforces the high-cost agent endpoint rate limit when E2E force mode is requested', async ({ page }) => {
  const clerkEnv = requireClerkE2EEnv();
  const org = await getE2EOrg();
  await clearRateLimitKey(`agent:${org.id}`);

  await page.goto('/');
  await clerk.signIn({ page, emailAddress: clerkEnv.email });
  await clerk.loaded({ page });
  await activateClerkOrganization(page, clerkEnv.orgId);
  await expectDashboardOrg(page, org.id);

  const responses = await page.evaluate(async () => {
    const attempts: Array<{ status: number; retryAfter: string | null; reset: string | null; body: string }> = [];

    for (let i = 0; i < 25; i += 1) {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-e2e-rate-limit': 'enforce',
        },
        body: JSON.stringify({
          threadId: '00000000-0000-0000-0000-000000000000',
          instruction: `rate limit probe ${i}`,
        }),
      });
      attempts.push({
        status: response.status,
        retryAfter: response.headers.get('Retry-After'),
        reset: response.headers.get('X-RateLimit-Reset'),
        body: await response.text(),
      });
      if (response.status === 429) break;
    }

    return attempts;
  });

  const limitedIndex = responses.findIndex((response) => response.status === 429);
  expect(limitedIndex, JSON.stringify(responses)).toBeGreaterThanOrEqual(0);
  expect(responses.slice(0, limitedIndex).every((response) => response.status !== 429)).toBe(true);

  const limitedResponse = responses[limitedIndex];
  expect(limitedResponse.retryAfter).toMatch(/^\d+$/);
  expect(limitedResponse.reset).toMatch(/^\d+$/);
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
