import { randomUUID } from 'node:crypto';
import zlib from 'node:zlib';
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

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

// A real PNG rather than text with an image name. Most of these bytes are above
// 0x7f, so a mistake anywhere in the base64 round trip — upload, blob storage,
// the loader, the MIME encoder — corrupts the file, which a text payload would
// survive unnoticed.
function makePng(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 3);
    for (let x = 0; x < width; x += 1) {
      const px = row + 1 + x * 3;
      raw[px] = (x * 7) & 0xff;
      raw[px + 1] = (y * 11) & 0xff;
      raw[px + 2] = ((x ^ y) * 13) & 0xff;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

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

  const png = makePng(64, 64);
  const uploaded = page.waitForResponse(res => (
    res.url().includes('/api/attachments') && res.request().method() === 'POST'
  ));
  await page.getByTestId('composer-attach').click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: png,
  });
  const uploadResponse = await uploaded;
  expect(
    uploadResponse.ok(),
    `Upload failed ${uploadResponse.status()}: ${await uploadResponse.text()}`,
  ).toBeTruthy();
  const { ref, bytes } = await uploadResponse.json() as { ref: string; bytes: number };
  expect(ref).toBe(`blob:attachments/${org.id}/${ref.split('/')[2]}/receipt.png`);
  expect(bytes).toBe(png.length);

  await expect(page.getByTestId('composer-attachment-chip')).toContainText('receipt.png');

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
  expect(record.metadata?.attachments).toEqual(['receipt.png']);

  const message = await db.message.findFirst({
    where: { threadId: thread.id, senderType: SenderType.agent },
  });
  expect(message?.attachments).toEqual([ref]);

  await expect(page.getByTestId('chat-message').filter({ hasText: replyText })).toBeVisible();

  // Read it back the way the timeline does. Byte equality is the integrity
  // check the outbound record cannot make — it only carries the filename — and
  // it covers the serving route in the same pass.
  const served = await page.request.get(`/api/attachments?ref=${encodeURIComponent(ref)}`);
  expect(served.ok()).toBeTruthy();
  expect(served.headers()['content-type']).toBe('image/png');
  // A PNG whose declared type and extension agree is the one case served
  // inline; everything else is forced to download.
  expect(served.headers()['content-disposition']).toBe('inline; filename="receipt.png"');
  expect(Buffer.from(await served.body()).equals(png)).toBe(true);
});
