
import { rm } from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChannelType, SenderType, db } from '@shopkeeper/db';

import {
  cleanupTestData,
  createTestCustomer,
  createTestIntegration,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';

const { mockFetch, mockPostmarkSend, mockRecordProviderSendFailure } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockPostmarkSend: vi.fn(),
  mockRecordProviderSendFailure: vi.fn(),
}));

vi.stubGlobal('fetch', mockFetch);

vi.mock('postmark', () => ({
  ServerClient: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.sendEmail = mockPostmarkSend;
  }),
}));

vi.mock('@/lib/server/redis', () => ({
  getRedis: vi.fn(() => ({ incr: vi.fn(), expire: vi.fn() })),
}));

vi.mock('@/lib/server/provider-send-alerts', () => ({
  recordProviderSendFailure: mockRecordProviderSendFailure,
}));

import { dispatchMessage } from './dispatch-message';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

let tempDir: string | null = null;

const originalEnv = {
  E2E_OUTBOUND_MODE: process.env.E2E_OUTBOUND_MODE,
  E2E_OUTBOUND_RECORD_PATH: process.env.E2E_OUTBOUND_RECORD_PATH,
  INBOUND_EMAIL_DOMAIN: process.env.INBOUND_EMAIL_DOMAIN,
  OUTBOUND_EMAIL_ASYNC: process.env.OUTBOUND_EMAIL_ASYNC,
  TIKTOK_SHOP_API_BASE_URL: process.env.TIKTOK_SHOP_API_BASE_URL,
  TIKTOK_SHOP_APP_KEY: process.env.TIKTOK_SHOP_APP_KEY,
  TIKTOK_SHOP_APP_SECRET: process.env.TIKTOK_SHOP_APP_SECRET,
  TIKTOK_SHOP_ENABLED: process.env.TIKTOK_SHOP_ENABLED,
  TIKTOK_SHOP_SEND_MESSAGE_PATH: process.env.TIKTOK_SHOP_SEND_MESSAGE_PATH,
  TIKTOK_SHOP_TOKEN_URL: process.env.TIKTOK_SHOP_TOKEN_URL,
};

beforeEach(async () => {
  org = await createTestOrg();
  process.env.E2E_OUTBOUND_MODE = 'live';
  process.env.INBOUND_EMAIL_DOMAIN = 'mail.test';
  delete process.env.OUTBOUND_EMAIL_ASYNC;
  mockFetch.mockReset();
  mockPostmarkSend.mockReset().mockResolvedValue({ MessageID: 'mock-message-id' });
  mockRecordProviderSendFailure.mockReset().mockResolvedValue({ emitted: false });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await cleanupTestData(org?.id);
  process.env.E2E_OUTBOUND_MODE = originalEnv.E2E_OUTBOUND_MODE;
  process.env.E2E_OUTBOUND_RECORD_PATH = originalEnv.E2E_OUTBOUND_RECORD_PATH;
  process.env.INBOUND_EMAIL_DOMAIN = originalEnv.INBOUND_EMAIL_DOMAIN;
  if (originalEnv.OUTBOUND_EMAIL_ASYNC === undefined) {
    delete process.env.OUTBOUND_EMAIL_ASYNC;
  } else {
    process.env.OUTBOUND_EMAIL_ASYNC = originalEnv.OUTBOUND_EMAIL_ASYNC;
  }
  restoreEnv('TIKTOK_SHOP_API_BASE_URL', originalEnv.TIKTOK_SHOP_API_BASE_URL);
  restoreEnv('TIKTOK_SHOP_APP_KEY', originalEnv.TIKTOK_SHOP_APP_KEY);
  restoreEnv('TIKTOK_SHOP_APP_SECRET', originalEnv.TIKTOK_SHOP_APP_SECRET);
  restoreEnv('TIKTOK_SHOP_ENABLED', originalEnv.TIKTOK_SHOP_ENABLED);
  restoreEnv('TIKTOK_SHOP_SEND_MESSAGE_PATH', originalEnv.TIKTOK_SHOP_SEND_MESSAGE_PATH);
  restoreEnv('TIKTOK_SHOP_TOKEN_URL', originalEnv.TIKTOK_SHOP_TOKEN_URL);

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

describe('dispatchMessage', () => {
  it('sends a TikTok Shop reply and persists the agent message after provider success', async () => {
    vi.stubEnv('TIKTOK_SHOP_ENABLED', 'true');
    vi.stubEnv('TIKTOK_SHOP_APP_KEY', 'tts-app-key');
    vi.stubEnv('TIKTOK_SHOP_APP_SECRET', 'tts-app-secret');
    vi.stubEnv('TIKTOK_SHOP_API_BASE_URL', 'https://open-api.tiktok.test');
    vi.stubEnv('TIKTOK_SHOP_SEND_MESSAGE_PATH', '/customer-service/messages/send');
    vi.stubEnv('TIKTOK_SHOP_TOKEN_URL', 'https://auth.tiktok.test/token');
    await createTestIntegration(org.id, {
      platform: ChannelType.tiktok,
      externalAccountId: `shop_${org.id.slice(0, 8)}`,
      accessToken: 'tts-access-token',
    });
    const customer = await createTestCustomer(org.id, `tiktok:shop_${org.id.slice(0, 8)}:buyer_123`);
    const thread = await createTestThread(org.id, customer.id, ChannelType.tiktok);
    const threadWithSpace = await db.thread.update({
      where: { id: thread.id },
      data: { externalSpaceId: 'conversation_123' },
      include: { customer: true },
    });
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { message_id: 'tts_msg_1' } }), { status: 200 }));

    const result = await dispatchMessage(threadWithSpace, org, 'TikTok Shop reply.');

    expect(result).toMatchObject({ ok: true });
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toBe('https://open-api.tiktok.test/customer-service/messages/send?app_key=tts-app-key');
    expect(init).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer tts-access-token' }),
    });
    expect(JSON.parse(init.body as string)).toMatchObject({
      conversation_id: 'conversation_123',
      buyer_id: 'buyer_123',
      content: { text: 'TikTok Shop reply.' },
    });

    const saved = await db.message.findFirst({
      where: { threadId: thread.id, senderType: SenderType.agent },
    });
    expect(saved?.contentText).toBe('TikTok Shop reply.');
  });

  it('returns TikTok Shop provider errors without persisting an agent message', async () => {
    vi.stubEnv('TIKTOK_SHOP_ENABLED', 'true');
    vi.stubEnv('TIKTOK_SHOP_APP_KEY', 'tts-app-key');
    vi.stubEnv('TIKTOK_SHOP_APP_SECRET', 'tts-app-secret');
    vi.stubEnv('TIKTOK_SHOP_API_BASE_URL', 'https://open-api.tiktok.test');
    vi.stubEnv('TIKTOK_SHOP_SEND_MESSAGE_PATH', '/customer-service/messages/send');
    vi.stubEnv('TIKTOK_SHOP_TOKEN_URL', 'https://auth.tiktok.test/token');
    const integration = await createTestIntegration(org.id, {
      platform: ChannelType.tiktok,
      externalAccountId: 'shop_failure',
      accessToken: 'tts-access-token',
    });
    const customer = await createTestCustomer(org.id, 'tiktok:shop_failure:buyer_404');
    const thread = await createTestThread(org.id, customer.id, ChannelType.tiktok);
    const threadWithSpace = await db.thread.update({
      where: { id: thread.id },
      data: { externalSpaceId: 'conversation_404' },
      include: { customer: true },
    });
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'response_window_closed', message: 'window closed' }), { status: 400 }));

    const result = await dispatchMessage(threadWithSpace, org, 'Too late.');

    expect(result).toEqual({
      ok: false,
      error: 'TikTok Shop only allows replies inside the buyer-service response window',
      providerStatus: 400,
    });
    expect(mockRecordProviderSendFailure).toHaveBeenCalledWith(
      'tiktok_shop',
      'tiktok',
      org.id,
      expect.objectContaining({
        threadId: thread.id,
        integrationId: integration.id,
        detail: 'Outside TikTok Shop response window or policy',
      }),
    );
    await expect(db.message.count({
      where: { threadId: thread.id, senderType: SenderType.agent },
    })).resolves.toBe(0);
  });

  it('classifies a timed-out TikTok Shop mutation as an unknown delivery outcome', async () => {
    vi.stubEnv('TIKTOK_SHOP_ENABLED', 'true');
    vi.stubEnv('TIKTOK_SHOP_APP_KEY', 'tts-app-key');
    vi.stubEnv('TIKTOK_SHOP_APP_SECRET', 'tts-app-secret');
    vi.stubEnv('TIKTOK_SHOP_API_BASE_URL', 'https://open-api.tiktok.test');
    vi.stubEnv('TIKTOK_SHOP_SEND_MESSAGE_PATH', '/customer-service/messages/send');
    vi.stubEnv('TIKTOK_SHOP_TOKEN_URL', 'https://auth.tiktok.test/token');
    const integration = await createTestIntegration(org.id, {
      platform: ChannelType.tiktok,
      externalAccountId: 'shop_timeout',
      accessToken: 'tts-access-token',
    });
    const customer = await createTestCustomer(org.id, 'tiktok:shop_timeout:buyer_timeout');
    const thread = await createTestThread(org.id, customer.id, ChannelType.tiktok);
    const threadWithSpace = await db.thread.update({
      where: { id: thread.id },
      data: { externalSpaceId: 'conversation_timeout' },
      include: { customer: true },
    });
    mockFetch.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));

    const result = await dispatchMessage(threadWithSpace, org, 'Did this arrive?');

    expect(result).toEqual({
      ok: false,
      error: 'TikTok Shop delivery could not be confirmed',
      outcome: 'unknown',
    });
    expect(mockRecordProviderSendFailure).toHaveBeenCalledWith(
      'tiktok_shop',
      'tiktok',
      org.id,
      expect.objectContaining({
        threadId: thread.id,
        integrationId: integration.id,
        detail: 'TikTok Shop delivery outcome unknown',
      }),
    );
    await expect(db.message.count({
      where: { threadId: thread.id, senderType: SenderType.agent },
    })).resolves.toBe(0);
  });
});
