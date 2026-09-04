import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import dbHelpers from './db-helpers.cjs';
import outboundHelpers from './outbound-helpers.cjs';

const {
  ChannelType,
  SenderType,
  db,
  deleteTestCustomers,
  disconnectDb,
  ensureE2EEmailIntegration,
  getE2EOrg,
} = dbHelpers;
const { waitForOutboundRecord } = outboundHelpers;

const customerIdsToCleanup: string[] = [];

test.afterAll(async () => {
  await deleteTestCustomers(customerIdsToCleanup);
  await disconnectDb();
});

// Real Vercel Blob, deliberately: the store has no local emulator, and the
// substituted `test-blob-token` in with-test-env.mjs cannot upload. Without a
// real token this proves nothing, so it skips rather than passing hollow.
test('merchant attaches a file to an email reply and it reaches the provider payload', async ({ page }) => {
  test.skip(process.env.E2E_AUTH_BYPASS !== 'true', 'E2E auth bypass is disabled');
  test.skip(
    !process.env.BLOB_READ_WRITE_TOKEN?.startsWith('vercel_blob_rw_'),
    'Needs a real BLOB_READ_WRITE_TOKEN — uploads hit Vercel Blob for real',
  );

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

  const runId = randomUUID();
  const customer = await db.customer.create({
    data: {
      organizationId: org.id,
      platformId: `attach-${runId}@example.com`,
      name: 'Attachment Customer',
    },
  });
  customerIdsToCleanup.push(customer.id);
  const thread = await db.thread.create({
    data: {
      organizationId: org.id,
      customerId: customer.id,
      channelType: ChannelType.email,
      status: 'open',
      subject: `Attachment run ${runId}`,
      tag: 'Support',
      filterStatus: 'genuine',
      filterReason: 'Seeded E2E attachment conversation',
      filterDecidedAt: new Date(),
    },
  });
  await db.message.create({
    data: {
      threadId: thread.id,
      organizationId: org.id,
      senderType: SenderType.customer,
      contentText: `Can you send me the receipt? ${runId}`,
      externalMessageId: `<attach-${runId}@example.com>`,
    },
  });

  await page.goto(`/dashboard/tickets?thread=${thread.id}`);
  await expect(page.getByTestId('ticket-conversation')).toBeVisible();

  const uploaded = page.waitForResponse(res => (
    res.url().includes('/api/attachments') && res.request().method() === 'POST'
  ));
  await page.getByTestId('composer-attach').click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'receipt.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(`receipt for ${runId}`),
  });
  const uploadResponse = await uploaded;
  expect(
    uploadResponse.ok(),
    `Upload failed ${uploadResponse.status()}: ${await uploadResponse.text()}`,
  ).toBeTruthy();
  const { ref } = await uploadResponse.json() as { ref: string };
  expect(ref).toBe(`blob:attachments/${org.id}/${ref.split('/')[2]}/receipt.pdf`);

  await expect(page.getByTestId('composer-attachment-chip')).toContainText('receipt.pdf');

  const replyText = `Receipt attached ${runId}`;
  await page.getByTestId('reply-composer-textarea').fill(replyText);
  // Only meaningful once there is text: an empty composer disables send on its
  // own, which would make this pass without the upload having settled.
  await expect(page.getByTestId('reply-composer-send')).toBeEnabled();
  const sent = page.waitForResponse(res => (
    res.url().includes('/api/messages') && res.request().method() === 'POST'
  ));
  await page.getByTestId('reply-composer-send').click();
  expect((await sent).ok()).toBeTruthy();

  // The recorder stands in for the provider, and the loader runs ahead of it —
  // so a record naming the file proves the upload, the ref on the row, and the
  // byte read out of Blob all happened.
  const record = await waitForOutboundRecord((r: {
    threadId?: string;
    text?: string;
    metadata?: { attachments?: string[] };
  }) => r.threadId === thread.id && r.text?.includes(replyText) === true);
  expect(record.metadata?.attachments).toEqual(['receipt.pdf']);

  const message = await db.message.findFirst({
    where: { threadId: thread.id, senderType: SenderType.agent },
  });
  expect(message?.attachments).toEqual([ref]);

  await expect(page.getByTestId('chat-message').filter({ hasText: replyText })).toBeVisible();
});
