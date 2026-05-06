import { describe, it, expect, afterEach } from 'vitest';
import { db, ThreadFilterStatus, ThreadFilterFeedback, ChannelType, SenderType } from '@clerk/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from '@clerk/db/test-helpers';
import { purgeFilteredThreads, FILTERED_PURGE_AFTER_DAYS } from './purge.js';

describe('purgeFilteredThreads', () => {
  const PURGE_NOW = new Date('2026-04-29T12:00:00Z');
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const AGED = new Date(PURGE_NOW.getTime() - (FILTERED_PURGE_AFTER_DAYS + 1) * ONE_DAY_MS);
  const RECENT = new Date(PURGE_NOW.getTime() - (FILTERED_PURGE_AFTER_DAYS - 1) * ONE_DAY_MS);

  let orgId: string | null = null;

  afterEach(async () => {
    await cleanupTestData(orgId);
    orgId = null;
  });

  async function setupThread(opts: {
    filterStatus?: 'genuine' | 'questionable' | 'filtered';
    filterFeedback?: 'none' | 'confirmed_genuine' | 'confirmed_spam';
    filterDecidedAt?: Date | null;
  } = {}) {
    if (!orgId) {
      const org = await createTestOrg();
      orgId = org.id;
    }
    const customer = await createTestCustomer(orgId, `c_${Math.random().toString(16).slice(2)}@test.com`);
    const thread = await createTestThread(orgId, customer.id, ChannelType.email);
    await db.thread.update({
      where: { id: thread.id },
      data: {
        filterStatus: opts.filterStatus ?? ThreadFilterStatus.filtered,
        filterFeedback: opts.filterFeedback ?? ThreadFilterFeedback.none,
        filterDecidedAt: opts.filterDecidedAt === undefined ? AGED : opts.filterDecidedAt,
      },
    });
    return thread;
  }

  it('hard-deletes aged filtered threads with no feedback and no agent reply', async () => {
    const thread = await setupThread();
    await createTestMessage(thread.id, 'spam body', SenderType.customer);

    const count = await purgeFilteredThreads(PURGE_NOW);
    expect(count).toBe(1);

    const after = await db.thread.findUnique({ where: { id: thread.id } });
    expect(after).toBeNull();
    const msgs = await db.message.findMany({ where: { threadId: thread.id } });
    expect(msgs).toHaveLength(0);
  });

  it('preserves filtered threads recovered to genuine via feedback', async () => {
    const thread = await setupThread({ filterFeedback: 'confirmed_genuine' });
    const count = await purgeFilteredThreads(PURGE_NOW);
    expect(count).toBe(0);
    const after = await db.thread.findUnique({ where: { id: thread.id } });
    expect(after).not.toBeNull();
  });

  it('preserves filtered threads with confirmed_spam feedback', async () => {
    const thread = await setupThread({ filterFeedback: 'confirmed_spam' });
    const count = await purgeFilteredThreads(PURGE_NOW);
    expect(count).toBe(0);
    const after = await db.thread.findUnique({ where: { id: thread.id } });
    expect(after).not.toBeNull();
  });

  it('preserves filtered threads where the merchant has replied (agent message exists)', async () => {
    const thread = await setupThread();
    await createTestMessage(thread.id, 'inbound', SenderType.customer);
    await createTestMessage(thread.id, 'merchant reply', SenderType.agent);

    const count = await purgeFilteredThreads(PURGE_NOW);
    expect(count).toBe(0);
    const after = await db.thread.findUnique({ where: { id: thread.id } });
    expect(after).not.toBeNull();
  });

  it('deletes when only customer + note messages exist (notes do not block purge)', async () => {
    const thread = await setupThread();
    await createTestMessage(thread.id, 'inbound', SenderType.customer);
    await createTestMessage(thread.id, '__clerk_agent__ classified as spam', SenderType.note);

    const count = await purgeFilteredThreads(PURGE_NOW);
    expect(count).toBe(1);
  });

  it('preserves filtered threads still inside the 7-day retention window', async () => {
    const thread = await setupThread({ filterDecidedAt: RECENT });
    const count = await purgeFilteredThreads(PURGE_NOW);
    expect(count).toBe(0);
    const after = await db.thread.findUnique({ where: { id: thread.id } });
    expect(after).not.toBeNull();
  });

  it('preserves filtered threads with null filterDecidedAt', async () => {
    const thread = await setupThread({ filterDecidedAt: null });
    const count = await purgeFilteredThreads(PURGE_NOW);
    expect(count).toBe(0);
    const after = await db.thread.findUnique({ where: { id: thread.id } });
    expect(after).not.toBeNull();
  });

  it('does not touch genuine or questionable threads regardless of age', async () => {
    const genuine = await setupThread({ filterStatus: 'genuine' });
    const questionable = await setupThread({ filterStatus: 'questionable' });

    const count = await purgeFilteredThreads(PURGE_NOW);
    expect(count).toBe(0);

    expect(await db.thread.findUnique({ where: { id: genuine.id } })).not.toBeNull();
    expect(await db.thread.findUnique({ where: { id: questionable.id } })).not.toBeNull();
  });
});
