import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { db, ChannelType, SenderType } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestIntegration,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';
import {
  DAILY_USAGE_RETAIN_DAYS,
  purgeExpiredStorefrontChatSessions,
  purgeStorefrontChatDailyUsage,
  SESSION_PURGE_AFTER_DAYS,
} from './storefront-chat-sweep.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-13T12:00:00Z');

describe('storefront chat sweep', () => {
  let orgId: string;
  let integrationId: string;
  let shop: string;

  beforeEach(async () => {
    const org = await createTestOrg();
    orgId = org.id;
    shop = `sweep-${randomUUID()}.myshopify.com`;
    const integration = await createTestIntegration(orgId, {
      platform: ChannelType.shopify,
      externalAccountId: shop,
    });
    integrationId = integration.id;
  });

  afterEach(async () => {
    await cleanupTestData(orgId);
  });

  function createSession(data: { expiresAt: Date; revokedAt?: Date | null; threadId?: string }) {
    return db.storefrontChatSession.create({
      data: {
        organizationId: orgId,
        integrationId,
        storefrontHost: shop,
        resumeSecretHash: randomUUID().replace(/-/g, ''),
        expiresAt: data.expiresAt,
        revokedAt: data.revokedAt ?? null,
        threadId: data.threadId ?? null,
      },
    });
  }

  const aged = (days: number) => new Date(NOW.getTime() - days * ONE_DAY_MS);

  describe('purgeExpiredStorefrontChatSessions', () => {
    it('deletes a session expired past the audit window', async () => {
      const session = await createSession({ expiresAt: aged(SESSION_PURGE_AFTER_DAYS + 1) });

      expect(await purgeExpiredStorefrontChatSessions(NOW)).toBe(1);
      expect(await db.storefrontChatSession.findUnique({ where: { id: session.id } })).toBeNull();
    });

    it('deletes a session revoked past the audit window', async () => {
      const session = await createSession({
        expiresAt: new Date(NOW.getTime() + ONE_DAY_MS),
        revokedAt: aged(SESSION_PURGE_AFTER_DAYS + 1),
      });

      expect(await purgeExpiredStorefrontChatSessions(NOW)).toBe(1);
      expect(await db.storefrontChatSession.findUnique({ where: { id: session.id } })).toBeNull();
    });

    it('keeps a session that expired inside the audit window', async () => {
      const session = await createSession({ expiresAt: aged(SESSION_PURGE_AFTER_DAYS - 1) });

      expect(await purgeExpiredStorefrontChatSessions(NOW)).toBe(0);
      expect(await db.storefrontChatSession.findUnique({ where: { id: session.id } })).not.toBeNull();
    });

    it('keeps a live session', async () => {
      const session = await createSession({ expiresAt: new Date(NOW.getTime() + 30 * ONE_DAY_MS) });

      expect(await purgeExpiredStorefrontChatSessions(NOW)).toBe(0);
      expect(await db.storefrontChatSession.findUnique({ where: { id: session.id } })).not.toBeNull();
    });

    // The property that matters: a shopper's conversation is a ticket like any
    // other and must not vanish because the browser identity behind it aged out.
    it('leaves the thread and its messages behind when the session goes', async () => {
      const customer = await createTestCustomer(orgId, `shopify_chat:${randomUUID()}`);
      const thread = await createTestThread(orgId, customer.id, ChannelType.shopify_chat);
      await createTestMessage(thread.id, 'where is my order', SenderType.customer);
      await createSession({ expiresAt: aged(SESSION_PURGE_AFTER_DAYS + 1), threadId: thread.id });

      expect(await purgeExpiredStorefrontChatSessions(NOW)).toBe(1);

      expect(await db.thread.findUnique({ where: { id: thread.id } })).not.toBeNull();
      expect(await db.message.findMany({ where: { threadId: thread.id } })).toHaveLength(1);
      expect(await db.customer.findUnique({ where: { id: customer.id } })).not.toBeNull();
    });

    it('takes the session\'s verification rows with it', async () => {
      const session = await createSession({ expiresAt: aged(SESSION_PURGE_AFTER_DAYS + 1) });
      await db.storefrontChatVerification.create({
        data: {
          organizationId: orgId,
          sessionId: session.id,
          orderName: '#1024',
          orderId: '1024',
          codeHash: 'a'.repeat(64),
          expiresAt: aged(SESSION_PURGE_AFTER_DAYS + 1),
        },
      });

      await purgeExpiredStorefrontChatSessions(NOW);

      expect(await db.storefrontChatVerification.findMany({ where: { sessionId: session.id } })).toHaveLength(0);
    });
  });

  describe('purgeStorefrontChatDailyUsage', () => {
    function createUsage(day: string) {
      return db.storefrontChatDailyUsage.create({
        data: { organizationId: orgId, integrationId, day, messageCount: 5 },
      });
    }

    it('deletes counters past the retention window', async () => {
      const old = aged(DAILY_USAGE_RETAIN_DAYS + 5).toISOString().slice(0, 10);
      await createUsage(old);

      expect(await purgeStorefrontChatDailyUsage(NOW)).toBe(1);
      expect(await db.storefrontChatDailyUsage.findMany({ where: { integrationId } })).toHaveLength(0);
    });

    it('keeps counters inside the retention window and today\'s row', async () => {
      const recent = aged(DAILY_USAGE_RETAIN_DAYS - 5).toISOString().slice(0, 10);
      const today = NOW.toISOString().slice(0, 10);
      await createUsage(recent);
      await createUsage(today);

      expect(await purgeStorefrontChatDailyUsage(NOW)).toBe(0);
      expect(await db.storefrontChatDailyUsage.findMany({ where: { integrationId } })).toHaveLength(2);
    });
  });
});
