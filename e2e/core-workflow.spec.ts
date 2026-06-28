import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import dbHelpers from './db-helpers.cjs';
import outboundHelpers from './outbound-helpers.cjs';

const {
  ChannelType,
  SenderType,
  db,
  disconnectDb,
  ensureE2EEmailIntegration,
  getE2EOrg,
  seedEmailThreadWithCachedPlan,
  waitForAgentMessage,
} = dbHelpers;
const { waitForOutboundRecord } = outboundHelpers;

const customerIdsToCleanup: string[] = [];

test.afterAll(async () => {
  if (customerIdsToCleanup.length > 0) {
    await db.customer.deleteMany({ where: { id: { in: customerIdsToCleanup } } });
  }
  await disconnectDb();
});

test('auth-bypass core workflow sends a manual reply and approves an agent plan', async ({ page }) => {
  test.skip(process.env.E2E_AUTH_BYPASS !== 'true', 'E2E auth bypass is disabled');

  const org = await getE2EOrg();
  await ensureE2EEmailIntegration(org.id);
  await db.organization.update({
    where: { id: org.id },
    data: {
      settings: {
        autoPlanOnOpen: false,
        spamFilterEnabled: false,
        onboardingCompletedAt: '2020-01-01T00:00:00.000Z',
      },
    },
  });
  const onboardingResponse = await page.request.patch('/api/org', {
    data: {
      settings: {
        onboardingCompletedAt: '2020-01-01T00:00:00.000Z',
      },
    },
  });
  expect(
    onboardingResponse.ok(),
    `Expected onboarding completion PATCH 2xx, got ${onboardingResponse.status()}: ${await onboardingResponse.text()}`,
  ).toBeTruthy();
  const activeOrgResponse = await page.request.get('/api/org');
  const activeOrg = await activeOrgResponse.json() as {
    id: string;
    settings: { onboardingCompletedAt?: string };
  };
  expect(activeOrg.id).toBe(org.id);
  expect(activeOrg.settings.onboardingCompletedAt).toBe('2020-01-01T00:00:00.000Z');
  const runId = randomUUID();

  const manualCustomer = await db.customer.create({
    data: {
      organizationId: org.id,
      platformId: `manual-${runId}@example.com`,
      name: 'Manual Workflow Customer',
    },
  });
  customerIdsToCleanup.push(manualCustomer.id);
  const manualThread = await db.thread.create({
    data: {
      organizationId: org.id,
      customerId: manualCustomer.id,
      channelType: ChannelType.email,
      status: 'open',
      subject: `Manual workflow ${runId}`,
      tag: 'Support',
      filterStatus: 'genuine',
      filterReason: 'Seeded E2E support conversation',
      filterDecidedAt: new Date(),
    },
  });
  const inboundText = `Seeded inbound conversation ${runId}`;
  const manualReply = `Recorded manual reply ${runId}`;
  await db.message.create({
    data: {
      threadId: manualThread.id,
      organizationId: org.id,
      senderType: SenderType.customer,
      contentText: inboundText,
      externalMessageId: `<manual-${runId}@example.com>`,
    },
  });

  await page.goto(`/dashboard/tickets?thread=${manualThread.id}`);
  await expect(page.getByTestId('ticket-conversation')).toBeVisible();
  await expect(page.getByTestId('chat-message').filter({ hasText: inboundText })).toBeVisible();

  const textarea = page.getByTestId('reply-composer-textarea');
  await textarea.fill(manualReply);
  await expect(textarea).toHaveValue(manualReply);
  const manualResponsePromise = page.waitForResponse((response) => (
    response.url().includes('/api/messages') && response.request().method() === 'POST'
  ));
  await page.getByTestId('reply-composer-send').click();
  expect((await manualResponsePromise).ok()).toBeTruthy();

  await waitForAgentMessage({ threadId: manualThread.id, textIncludes: manualReply });
  await waitForOutboundRecord((record: { threadId?: string; text?: string }) => (
    record.threadId === manualThread.id
    && record.text?.includes(manualReply)
  ));
  await expect(page.getByTestId('chat-message').filter({ hasText: manualReply })).toBeVisible();

  const planInbound = `Seeded plan question ${runId}`;
  const planReply = `Approved agent reply ${runId}`;
  const { customer: planCustomer, thread: planThread } = await seedEmailThreadWithCachedPlan({
    orgId: org.id,
    customerEmail: `plan-${runId}@example.com`,
    inboundText: planInbound,
    replyText: planReply,
    instruction: `Reply to the seeded workflow ${runId}.`,
  });
  customerIdsToCleanup.push(planCustomer.id);

  await page.goto(`/dashboard/tickets?thread=${planThread.id}`);
  await expect(page.getByTestId('chat-message').filter({ hasText: planInbound })).toBeVisible();
  const planCard = page.getByTestId('action-plan-card');
  await expect(planCard).toBeVisible();
  await expect(planCard).toContainText(planReply);

  const approvalResponsePromise = page.waitForResponse((response) => (
    response.url().includes('/api/agent') && response.request().method() === 'POST'
  ));
  await page.getByTestId('action-plan-run').click();
  expect((await approvalResponsePromise).ok()).toBeTruthy();

  await waitForAgentMessage({ threadId: planThread.id, textIncludes: planReply });
  await waitForOutboundRecord((record: { threadId?: string; source?: string; text?: string }) => (
    record.threadId === planThread.id
    && record.source === 'agent_send_reply'
    && record.text?.includes(planReply)
  ));
  await expect.poll(
    () => db.agentAction.count({
      where: {
        organizationId: org.id,
        threadId: planThread.id,
        tool: 'send_reply',
        status: 'success',
        mode: 'human_approved',
      },
    }),
  ).toBe(1);
  await expect(page.getByTestId('chat-message').filter({ hasText: planReply })).toBeVisible();
});
