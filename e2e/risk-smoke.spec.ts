import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import dbHelpers from './db-helpers.cjs';

const { ChannelType, SenderType, db, disconnectDb, getE2EOrg } = dbHelpers;

const createdCustomerIds = new Set<string>();
const createdKnowledgeBaseIds = new Set<string>();

test.afterAll(async () => {
  if (createdKnowledgeBaseIds.size > 0) {
    await db.knowledgeBase.deleteMany({ where: { id: { in: [...createdKnowledgeBaseIds] } } });
  }
  if (createdCustomerIds.size > 0) {
    await db.customer.deleteMany({ where: { id: { in: [...createdCustomerIds] } } });
  }
  const org = await getE2EOrg().catch(() => null);
  if (org) {
    await db.organization.update({ where: { id: org.id }, data: { stripeStatus: null } }).catch(() => undefined);
  }
  await disconnectDb();
});

test('browser smoke creates KB article through authenticated app APIs', async ({ page }) => {
  test.skip(process.env.E2E_AUTH_BYPASS !== 'true', 'E2E auth bypass is disabled');

  const runId = randomUUID();
  const kbName = `Risk KB ${runId}`;
  const articleTitle = `Risk KB Article ${runId}`;

  await page.goto('/dashboard/kb');
  await expect(page.getByRole('heading', { name: 'Memory' })).toBeVisible();

  const result = await page.evaluate(async ({ kbName, articleTitle }) => {
    const kbRes = await fetch('/api/kb/bases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: kbName }),
    });
    const kbBody = await kbRes.json();

    const articleRes = await fetch(`/api/kb/bases/${kbBody.knowledgeBase.id}/articles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: articleTitle,
        body: 'Risk smoke article body',
        tags: ['risk-smoke'],
      }),
    });
    const articleBody = await articleRes.json();

    return {
      articleId: articleBody.article?.id,
      articleStatus: articleRes.status,
      kbId: kbBody.knowledgeBase?.id,
      kbStatus: kbRes.status,
    };
  }, { kbName, articleTitle });

  expect(result.kbStatus).toBe(201);
  expect(result.articleStatus).toBe(201);
  createdKnowledgeBaseIds.add(result.kbId);

  await page.goto('/dashboard/kb');
  await expect(page.getByText(articleTitle)).toBeVisible();
});

test('browser smoke blocks billing-gated message writes without persistence', async ({ page }) => {
  test.skip(process.env.E2E_AUTH_BYPASS !== 'true', 'E2E auth bypass is disabled');

  const org = await getE2EOrg();
  const runId = randomUUID();
  const customer = await db.customer.create({
    data: {
      organizationId: org.id,
      platformId: `billing-gate-${runId}@example.com`,
      name: 'Billing Gate Customer',
    },
  });
  createdCustomerIds.add(customer.id);
  const thread = await db.thread.create({
    data: {
      organizationId: org.id,
      customerId: customer.id,
      channelType: ChannelType.email,
      status: 'open',
      tag: 'Billing Gate',
    },
  });
  await db.message.create({
    data: {
      threadId: thread.id,
      senderType: SenderType.customer,
      contentText: `billing gate inbound ${runId}`,
    },
  });

  await db.organization.update({ where: { id: org.id }, data: { stripeStatus: 'canceled' } });

  await page.goto(`/dashboard/tickets?thread=${thread.id}`);
  const result = await page.evaluate(async (threadId) => {
    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, text: 'blocked billing-gate reply' }),
    });
    return {
      status: response.status,
      body: await response.json(),
    };
  }, thread.id);

  expect(result.status).toBe(402);
  expect(result.body.error).toContain('Billing status canceled blocks write actions');
  await expect(db.message.count({ where: { threadId: thread.id, senderType: SenderType.agent } })).resolves.toBe(0);

  await db.organization.update({ where: { id: org.id }, data: { stripeStatus: null } });
});
