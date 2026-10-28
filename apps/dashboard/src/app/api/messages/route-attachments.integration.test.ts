import { rm } from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockClerkSession } from '@/test-fixtures/clerk-session';
import { ChannelType, SenderType, db } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestIntegration,
  createTestThread,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

// Mock outbound dispatch clients — we verify dispatch logic, not external APIs
vi.mock('postmark', () => ({
  ServerClient: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.sendEmail = vi.fn().mockResolvedValue({ MessageID: 'mock-msg-id' });
  }),
}));

// Mock global fetch for Meta Graph API calls in the IG dispatch branch
const { mockFetch, mockRecordProviderSendFailure, mockBlobGet } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockRecordProviderSendFailure: vi.fn().mockResolvedValue({ emitted: false }),
  mockBlobGet: vi.fn(),
}));
vi.stubGlobal('fetch', mockFetch);

vi.mock('@vercel/blob', () => ({ get: mockBlobGet, put: vi.fn(), del: vi.fn() }));

vi.mock('@/lib/server/redis', () => ({
  getRedis: vi.fn(() => ({ incr: vi.fn(), expire: vi.fn() })),
}));

vi.mock('@/lib/server/provider-send-alerts', () => ({
  recordProviderSendFailure: mockRecordProviderSendFailure,
}));

import { POST } from './route';
import { ServerClient } from 'postmark';

let org!: Awaited<ReturnType<typeof createTestOrg>>;
let tempDir: string | null = null;
const originalEnv = {
  E2E_OUTBOUND_MODE: process.env.E2E_OUTBOUND_MODE,
  E2E_OUTBOUND_RECORD_PATH: process.env.E2E_OUTBOUND_RECORD_PATH,
  POSTMARK_API_KEY: process.env.POSTMARK_API_KEY,
};

beforeEach(async () => {
  org = await createTestOrg();
  mockClerkSession({ userId: 'usr_test', orgId: org.clerkOrgId });
  mockFetch.mockReset();
  vi.mocked(ServerClient).mockClear();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await cleanupTestData(org?.id);
  process.env.E2E_OUTBOUND_MODE = originalEnv.E2E_OUTBOUND_MODE;
  process.env.E2E_OUTBOUND_RECORD_PATH = originalEnv.E2E_OUTBOUND_RECORD_PATH;
  process.env.POSTMARK_API_KEY = originalEnv.POSTMARK_API_KEY;
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
  vi.clearAllMocks();
});

describe('POST /api/messages — attachments', () => {
  async function emailThread() {
    await createTestIntegration(org.id, {
      externalAccountId: 'support@store.com',
      fromEmail: 'support@store.com',
    });
    const customer = await createTestCustomer(org.id, 'attach@example.com');
    return createTestThread(org.id, customer.id, ChannelType.email);
  }

  beforeEach(() => {
    mockBlobGet.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('receipt bytes'));
          controller.close();
        },
      }),
      blob: { contentType: 'application/pdf' },
    });
  });

  function send(threadId: string, attachments: unknown, text = 'Here you go') {
    return POST(new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, text, attachments }),
    }));
  }

  it('persists an owned attachment ref onto the sent message', async () => {
    process.env.POSTMARK_API_KEY = 'test-key';
    const thread = await emailThread();
    const ref = `blob:attachments/${org.id}/file-id/receipt.pdf`;

    const res = await send(thread.id, [ref]);
    expect(res.status).toBe(200);

    const message = await db.message.findFirst({
      where: { threadId: thread.id, senderType: SenderType.agent },
    });
    expect(message?.attachments).toEqual([ref]);
  });

  // The refs arrive from the client, so a foreign one must be refused rather
  // than trusted — otherwise a merchant could attach another workspace's blob
  // and the read route's org check would be bypassed on the way out.
  it('refuses a ref belonging to another org before any write', async () => {
    const thread = await emailThread();
    const foreign = 'blob:attachments/00000000-0000-0000-0000-000000000099/file-id/secret.pdf';

    const res = await send(thread.id, [foreign]);

    expect(res.status).toBe(400);
    expect(await db.message.count({
      where: { threadId: thread.id, senderType: SenderType.agent },
    })).toBe(0);
  });

  it('refuses a ref pointing outside managed storage', async () => {
    const thread = await emailThread();

    const res = await send(thread.id, ['https://elsewhere.example/payload.pdf']);

    expect(res.status).toBe(400);
  });

  it('refuses more attachments than the count ceiling', async () => {
    const thread = await emailThread();
    const refs = Array.from(
      { length: 6 },
      (_, i) => `blob:attachments/${org.id}/file-id/f${i}.pdf`,
    );

    const res = await send(thread.id, refs);

    expect(res.status).toBe(400);
    expect(await db.message.count({
      where: { threadId: thread.id, senderType: SenderType.agent },
    })).toBe(0);
  });

  it('refuses attachments on a channel that cannot carry them', async () => {
    const customer = await createTestCustomer(org.id, 'ig-user-attach');
    const thread = await createTestThread(org.id, customer.id, ChannelType.ig_dm);

    const res = await send(thread.id, [`blob:attachments/${org.id}/file-id/receipt.pdf`]);

    expect(res.status).toBe(502);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(await db.message.count({
      where: { threadId: thread.id, senderType: SenderType.agent },
    })).toBe(0);
  });
});
