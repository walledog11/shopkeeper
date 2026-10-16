import { randomUUID } from 'node:crypto';
import { db } from '@shopkeeper/db';
import type { WaitlistEntry, Prisma } from '@prisma/client';
import { getWaitlistLoopsConfig, type WaitlistLoopsConfig } from './config.js';
import { findLoopsContact, LoopsRequestError, submitLoopsWaitlist, updateLoopsWaitlistProperties } from './client.js';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

async function syncEntry(entry: WaitlistEntry, config: WaitlistLoopsConfig): Promise<Prisma.WaitlistEntryUpdateManyMutationInput> {
  if (['deleted', 'suppressed'].includes(entry.emailStatus)) return { syncAfter: null };
  let contact = await findLoopsContact(config, entry.email);
  if (contact && (contact.optInStatus === 'rejected' || (!contact.subscribed && contact.optInStatus !== 'pending'))) {
    return { emailStatus: 'unsubscribed', loopsContactId: contact.id, launchSubscribed: false, updatesSubscribed: false, syncAfter: new Date(Date.now() + DAY) };
  }
  if (!entry.loopsSubmittedAt && entry.emailStatus !== 'unsubscribed') {
    if (contact?.optInStatus !== 'pending') await submitLoopsWaitlist(config, entry, contact?.mailingLists);
    await db.waitlistEntry.updateMany({ where: { id: entry.id, syncLeaseToken: entry.syncLeaseToken }, data: { loopsSubmittedAt: new Date() } });
    contact = await findLoopsContact(config, entry.email);
  }
  if (!contact) {
    // Once a contact was submitted, a missing remote record may mean deletion.
    // Retry reading; never recreate it automatically through an API upsert.
    throw new LoopsRequestError('loops_contact_not_found');
  }
  const pending = contact.optInStatus === 'pending';
  if (!pending && contact.subscribed) await updateLoopsWaitlistProperties(config, entry);
  return {
    loopsContactId: contact.id,
    emailStatus: pending ? 'pending' : contact.subscribed ? 'subscribed' : 'unsubscribed',
    launchSubscribed: !pending && contact.subscribed && contact.mailingLists[config.earlyAccessListId] === true,
    updatesSubscribed: !pending && contact.subscribed && contact.mailingLists[config.updatesListId] === true,
    loopsSyncedAt: new Date(),
    syncAfter: new Date(Date.now() + (pending ? 15 * MINUTE : DAY)),
  };
}

export async function processWaitlistSync(options: { id?: string; limit?: number } = {}) {
  const config = getWaitlistLoopsConfig();
  if (!config) return { enabled: false, synced: 0, failed: 0 };
  const now = new Date();
  const candidates = await db.waitlistEntry.findMany({
    where: { ...(options.id ? { id: options.id } : {}), syncAfter: { lte: now }, OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lt: now } }] },
    orderBy: { syncAfter: 'asc' }, take: Math.min(options.limit ?? 5, 20),
  });
  let synced = 0;
  let failed = 0;
  for (const candidate of candidates) {
    const token = randomUUID();
    const lease = await db.waitlistEntry.updateMany({
      where: { id: candidate.id, syncAfter: { lte: new Date() }, OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lt: new Date() } }] },
      data: { syncLeaseToken: token, syncLeaseUntil: new Date(Date.now() + 2 * MINUTE) },
    });
    if (!lease.count) continue;
    const entry = await db.waitlistEntry.findUniqueOrThrow({ where: { id: candidate.id } });
    try {
      const result = await syncEntry(entry, config);
      await db.waitlistEntry.updateMany({
        where: { id: entry.id, syncLeaseToken: token, syncRevision: entry.syncRevision },
        data: { ...result, lastSyncError: null, syncAttempts: 0 },
      });
      synced++;
    } catch (error) {
      const code = error instanceof LoopsRequestError ? error.code : 'waitlist_sync_failed';
      await db.waitlistEntry.updateMany({
        where: { id: entry.id, syncLeaseToken: token, syncRevision: entry.syncRevision },
        data: { lastSyncError: code, syncAttempts: { increment: 1 }, syncAfter: new Date(Date.now() + Math.min(6 * 60 * MINUTE, MINUTE * 2 ** Math.min(entry.syncAttempts, 9))) },
      });
      failed++;
    } finally {
      await db.waitlistEntry.updateMany({ where: { id: entry.id, syncLeaseToken: token }, data: { syncLeaseToken: null, syncLeaseUntil: null } });
    }
  }
  return { enabled: true, synced, failed };
}

export async function markWaitlistSignedUp(email: string) {
  return db.waitlistEntry.updateMany({
    where: { email: email.trim().toLowerCase(), stage: { not: 'signed_up' } },
    data: { stage: 'signed_up', signedUpAt: new Date(), syncAfter: new Date(), syncRevision: { increment: 1 } },
  });
}
