import { createHmac, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { cleanupTestData, createTestIntegration, createTestOrg } from '@shopkeeper/db/test-helpers';
import { hashVerificationCode, hashVerifiedEmail } from '@shopkeeper/agent/storefront-verification';
import type { OutboundEmail } from '@shopkeeper/email/types';
import { appProxyCanonicalString } from '@/lib/shopify/app-proxy';
import { createResumeSecret, mintSessionToken } from '@/lib/storefront-chat/session-token';

const APP_SECRET = 'storefront-verify-secret';
const OWNER_EMAIL = 'real.owner@example.com';

// The order book this shop's Shopify would answer with. Everything about the
// design turns on the widget never learning which of these exists, so the
// lookup is stubbed rather than the response.
const ORDERS: Record<string, { id: number; name: string; email: string }> = {
  '#1025': { id: 5678901234, name: '#1025', email: OWNER_EMAIL },
};

const shopifyRestJson = vi.fn(async (_ctx: unknown, _path: string, options: { query?: { name?: string } }) => {
  const order = ORDERS[options.query?.name ?? ''];
  return { orders: order ? [order] : [] };
});

const send = vi.fn(async (_email: OutboundEmail) => ({ providerMessageId: 'stub' }));

vi.mock('@shopkeeper/agent/shopify', () => ({
  shopifyRestJson: (...args: unknown[]) => shopifyRestJson(...(args as [unknown, string, { query?: { name?: string } }])),
}));

vi.mock('@shopkeeper/email/senders', () => ({
  getEmailSender: () => ({ send }),
}));

const emitOpsAlert = vi.fn();

vi.mock('@/lib/server/ops-alerts', () => ({
  emitOpsAlert: (...args: unknown[]) => emitOpsAlert(...args),
}));

const { POST } = await import('./route');

let org: Awaited<ReturnType<typeof createTestOrg>>;
let integration: Awaited<ReturnType<typeof createTestIntegration>>;
let session: { id: string };
let token: string;
let envBackup: Record<string, string | undefined>;

function signedRequest(body: Record<string, unknown>) {
  const url = new URL('https://app.useshopkeeper.com/api/storefront-chat/proxy/verify');
  url.searchParams.set('shop', integration.externalAccountId);
  url.searchParams.set('path_prefix', '/apps/shopkeeper-chat');
  url.searchParams.set('timestamp', String(Math.floor(Date.now() / 1000)));
  url.searchParams.set(
    'signature',
    createHmac('sha256', APP_SECRET).update(appProxyCanonicalString(url)).digest('hex'),
  );

  return new Request(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const requestCode = (orderName: string, email: string) =>
  POST(signedRequest({ action: 'request', orderName, email }));

const submitCode = (orderName: string, code: string) =>
  POST(signedRequest({ action: 'code', orderName, code }));

beforeEach(async () => {
  vi.clearAllMocks();
  envBackup = {
    SHOPIFY_APP_SECRET: process.env.SHOPIFY_APP_SECRET,
    STOREFRONT_CHAT_ENABLED: process.env.STOREFRONT_CHAT_ENABLED,
    STOREFRONT_CHAT_SIGNING_SECRET: process.env.STOREFRONT_CHAT_SIGNING_SECRET,
  };
  process.env.SHOPIFY_APP_SECRET = APP_SECRET;
  process.env.STOREFRONT_CHAT_ENABLED = 'true';
  process.env.STOREFRONT_CHAT_SIGNING_SECRET = 'storefront-verify-test-signing-secret';

  org = await createTestOrg();
  integration = await createTestIntegration(org.id, {
    platform: ChannelType.shopify,
    externalAccountId: `verify-${randomUUID()}.myshopify.com`,
    accessToken: 'shpat_test',
    metadata: { storefrontChat: { enabled: true } },
  });
  await createTestIntegration(org.id, {
    platform: ChannelType.email,
    externalAccountId: 'support@example.com',
    fromEmail: 'support@example.com',
  });

  session = await db.storefrontChatSession.create({
    data: {
      organizationId: org.id,
      integrationId: integration.id,
      storefrontHost: integration.externalAccountId,
      resumeSecretHash: createResumeSecret().hash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  token = mintSessionToken({
    sessionId: session.id,
    orgId: org.id,
    integrationId: integration.id,
    shop: integration.externalAccountId,
  });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('storefront chat order verification', () => {
  // The disclosure invariant. If any of these three diverge, someone guessing
  // order numbers learns which ones exist.
  it('answers identically for a match, an email mismatch, and a nonexistent order', async () => {
    const match = await requestCode('#1025', OWNER_EMAIL);
    const mismatch = await requestCode('#1025', 'attacker@example.com');
    const missing = await requestCode('#9999', 'attacker@example.com');

    expect(match.status).toBe(200);
    await expect(match.json()).resolves.toEqual({ status: 'sent' });
    await expect(mismatch.json()).resolves.toEqual({ status: 'sent' });
    await expect(missing.json()).resolves.toEqual({ status: 'sent' });
  });

  it('mails the code to the address on the order, never the one supplied', async () => {
    await requestCode('#1025', OWNER_EMAIL);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ to: OWNER_EMAIL });
  });

  // The silent-failure case from the first live run: a Gmail connection whose
  // token Google had revoked accepted the send and mailed nothing. The shopper
  // cannot be told — identical copy is the disclosure invariant — so the only
  // acceptable outcome is that it leaves loudly by another door.
  describe('when the email integration is dead', () => {
    it('still answers the shopper identically', async () => {
      send.mockRejectedValueOnce(new Error('invalid_grant'));

      const failed = await requestCode('#1025', OWNER_EMAIL);

      expect(failed.status).toBe(200);
      await expect(failed.json()).resolves.toEqual({ status: 'sent' });
    });

    it('raises an ops alert naming the provider and the integration', async () => {
      send.mockRejectedValueOnce(new Error('invalid_grant'));

      await requestCode('#1025', OWNER_EMAIL);

      expect(emitOpsAlert).toHaveBeenCalledTimes(1);
      expect(emitOpsAlert.mock.calls[0][0]).toMatchObject({
        category: 'provider_send',
        level: 'error',
        message: 'Storefront verification code could not be mailed',
      });
      expect(emitOpsAlert.mock.calls[0][0].extra).toMatchObject({
        orgId: org.id,
        err: 'invalid_grant',
      });
    });

    it('raises nothing when the send succeeds', async () => {
      await requestCode('#1025', OWNER_EMAIL);

      expect(emitOpsAlert).not.toHaveBeenCalled();
    });
  });

  it('sends nothing at all when the supplied email is not the one on the order', async () => {
    await requestCode('#1025', 'attacker@example.com');

    expect(send).not.toHaveBeenCalled();
    const rows = await db.storefrontChatVerification.count({ where: { sessionId: session.id } });
    expect(rows).toBe(0);
  });

  it('verifies with the right code and records it against that order', async () => {
    await requestCode('#1025', OWNER_EMAIL);
    const code = send.mock.calls[0][0].text.match(/\d{6}/)![0];

    const response = await submitCode('#1025', code);

    await expect(response.json()).resolves.toEqual({ status: 'verified' });
    const row = await db.storefrontChatVerification.findFirst({ where: { sessionId: session.id } });
    expect(row?.orderName).toBe('#1025');
    expect(row?.orderId).toBe('5678901234');
    expect(row?.verifiedAt).not.toBeNull();
  });

  it('counts attempts down and locks the pair after five wrong codes', async () => {
    await requestCode('#1025', OWNER_EMAIL);

    for (let i = 4; i >= 0; i--) {
      const response = await submitCode('#1025', '000000');
      const body = await response.json();
      expect(body).toEqual({ status: 'wrong_code', attemptsRemaining: i });
    }

    await expect(submitCode('#1025', '000000').then((r) => r.json())).resolves.toEqual({
      status: 'locked',
    });
  });

  // Reporting `expired` here would invite a fresh code request, which is exactly
  // the way out of the attempt ceiling the pure module refuses to offer.
  it('keeps a locked pair locked across a new code request', async () => {
    await requestCode('#1025', OWNER_EMAIL);
    for (let i = 0; i < 5; i++) await submitCode('#1025', '000000');

    const reRequest = await requestCode('#1025', OWNER_EMAIL);
    await expect(reRequest.json()).resolves.toEqual({ status: 'sent' });
    // Identical response, but no second code went out and the lock stands.
    expect(send).toHaveBeenCalledTimes(1);
    await expect(submitCode('#1025', '000000').then((r) => r.json())).resolves.toEqual({
      status: 'locked',
    });
  });

  it('replaces an outstanding challenge rather than leaving two codes valid', async () => {
    await requestCode('#1025', OWNER_EMAIL);
    const first = send.mock.calls[0][0].text.match(/\d{6}/)![0];
    await requestCode('#1025', OWNER_EMAIL);
    const second = send.mock.calls[1][0].text.match(/\d{6}/)![0];

    const rows = await db.storefrontChatVerification.count({ where: { sessionId: session.id } });
    expect(rows).toBe(1);

    if (first !== second) {
      await expect(submitCode('#1025', first).then((r) => r.json())).resolves.toMatchObject({
        status: 'wrong_code',
      });
    }
    await expect(submitCode('#1025', second).then((r) => r.json())).resolves.toEqual({
      status: 'verified',
    });
  });

  it('refuses an expired code', async () => {
    await requestCode('#1025', OWNER_EMAIL);
    const code = send.mock.calls[0][0].text.match(/\d{6}/)![0];
    await db.storefrontChatVerification.updateMany({
      where: { sessionId: session.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(submitCode('#1025', code).then((r) => r.json())).resolves.toEqual({
      status: 'expired',
    });
  });

  // Without its own ceiling the widget is a way to mail-bomb whoever's address
  // is on an order. Probing counts against it too, so it also bounds guessing.
  it('stops sending after the per-session send ceiling', async () => {
    for (let i = 0; i < 5; i++) await requestCode('#1025', OWNER_EMAIL);
    expect(send).toHaveBeenCalledTimes(5);

    const refused = await requestCode('#1025', OWNER_EMAIL);

    await expect(refused.json()).resolves.toEqual({ status: 'send_limit' });
    expect(send).toHaveBeenCalledTimes(5);
  });

  it('charges a miss against the send ceiling, so probing cannot be free', async () => {
    for (let i = 0; i < 5; i++) await requestCode('#9999', 'attacker@example.com');
    expect(send).not.toHaveBeenCalled();

    await expect(requestCode('#1025', OWNER_EMAIL).then((r) => r.json())).resolves.toEqual({
      status: 'send_limit',
    });
  });

  it('reports no challenge for a code on an order that was never asked about', async () => {
    await expect(submitCode('#1025', '123456').then((r) => r.json())).resolves.toEqual({
      status: 'no_challenge',
    });
  });

  it('refuses a code for a challenge belonging to another session', async () => {
    const other = await db.storefrontChatSession.create({
      data: {
        organizationId: org.id,
        integrationId: integration.id,
        storefrontHost: integration.externalAccountId,
        resumeSecretHash: createResumeSecret().hash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    await db.storefrontChatVerification.create({
      data: {
        organizationId: org.id,
        sessionId: other.id,
        orderName: '#1025',
        orderId: '5678901234',
        codeHash: hashVerificationCode('424242'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await expect(submitCode('#1025', '424242').then((r) => r.json())).resolves.toEqual({
      status: 'no_challenge',
    });
  });

  // The identity bridge for conversation-to-sale attribution. Storefront
  // shoppers are anonymous (`platformId` is `shopify_chat:<uuid>`), so a proved
  // address is the only durable link between this browser session and a later
  // order — which makes it the only thing worth forging.
  describe('the verified-email identity bridge', () => {
    it('records nothing on the session until a correct code proves control', async () => {
      await requestCode('#1025', OWNER_EMAIL);

      // The candidate is parked on the challenge, where it cannot be read as
      // proof of anything.
      const challenge = await db.storefrontChatVerification.findFirstOrThrow({
        where: { sessionId: session.id },
      });
      expect(challenge.candidateEmailHash).toBe(hashVerifiedEmail(OWNER_EMAIL));

      const before = await db.storefrontChatSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(before.verifiedEmailHash).toBeNull();
    });

    it('promotes the hash onto the session once the code is accepted', async () => {
      await requestCode('#1025', OWNER_EMAIL);
      const code = send.mock.calls[0][0].text.match(/\d{6}/)![0];

      await expect(submitCode('#1025', code).then((r) => r.json())).resolves.toEqual({
        status: 'verified',
      });

      const after = await db.storefrontChatSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(after.verifiedEmailHash).toBe(hashVerifiedEmail(OWNER_EMAIL));
    });

    it('leaves the session anonymous when the code is wrong', async () => {
      await requestCode('#1025', OWNER_EMAIL);

      await expect(submitCode('#1025', '000000').then((r) => r.json())).resolves.toMatchObject({
        status: 'wrong_code',
      });

      const after = await db.storefrontChatSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(after.verifiedEmailHash).toBeNull();
    });

    it('hashes the address on the order, not the one the shopper typed', async () => {
      // These are the same address here, but the supplied one is attacker-
      // controlled text and the order one is not. Only the latter may become
      // an identity, so the stored hash must be case-insensitively the order's.
      await requestCode('#1025', OWNER_EMAIL.toUpperCase());
      const code = send.mock.calls[0][0].text.match(/\d{6}/)![0];
      await submitCode('#1025', code);

      const after = await db.storefrontChatSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(after.verifiedEmailHash).toBe(hashVerifiedEmail(OWNER_EMAIL));
    });
  });

  it('is refused entirely once the merchant disables storefront chat', async () => {
    await db.integration.update({
      where: { id: integration.id },
      data: { metadata: { storefrontChat: { enabled: false } } },
    });

    const response = await requestCode('#1025', OWNER_EMAIL);

    expect(response.status).toBe(403);
    expect(send).not.toHaveBeenCalled();
  });
});
