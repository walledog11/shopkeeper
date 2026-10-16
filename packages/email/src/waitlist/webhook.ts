import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from '@shopkeeper/db';
import type { Prisma } from '@prisma/client';

export function verifyLoopsWebhook(headers: Headers, body: string, secret: string, now = Date.now()): string {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signature = headers.get('webhook-signature');
  if (!secret || !id || id.length > 255 || !timestamp || !/^\d+$/.test(timestamp) || !signature) throw new Error('invalid_webhook_signature');
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) throw new Error('expired_webhook_signature');
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  if (key.length < 16) throw new Error('invalid_webhook_secret');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  const matched = signature.split(/\s+/).some(part => {
    const [version, encoded] = part.split(',');
    if (version !== 'v1' || !encoded) return false;
    const candidate = Buffer.from(encoded, 'base64');
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
  if (!matched) throw new Error('invalid_webhook_signature');
  return id;
}

const supportedEvents = new Set([
  'contact.created', 'contact.unsubscribed', 'contact.deleted',
  'contact.mailingList.subscribed', 'contact.mailingList.unsubscribed',
  'email.unsubscribed', 'email.resubscribed', 'email.hardBounced', 'email.spamReported',
  'campaign.email.sent',
]);

export async function recordLoopsWaitlistEvent(id: string, input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('invalid_webhook_payload');
  const event = input as Record<string, unknown>;
  if (typeof event.eventName !== 'string') throw new Error('invalid_webhook_payload');
  if (!supportedEvents.has(event.eventName)) return { ignored: true };
  const identity = event.contactIdentity as Record<string, unknown> | undefined;
  if (typeof identity?.email !== 'string' || typeof identity.id !== 'string' || identity.id.length > 128) throw new Error('invalid_webhook_payload');
  const email = identity.email.trim().toLowerCase();
  const eventName = event.eventName;
  const contactId = identity.id;
  return db.$transaction(async tx => {
    const entry = await tx.waitlistEntry.findUnique({ where: { email } });
    if (!entry || (entry.loopsContactId && entry.loopsContactId !== contactId)) return { ignored: true };
    const inserted = await tx.waitlistWebhookReceipt.createMany({ data: [{ id }], skipDuplicates: true });
    if (!inserted.count) return { duplicate: true };
    const now = new Date();
    const suppressed = ['deleted', 'suppressed'].includes(entry.emailStatus);
    const data: Prisma.WaitlistEntryUpdateManyMutationInput = {
      loopsContactId: contactId,
      loopsSubmittedAt: entry.loopsSubmittedAt ?? now,
      syncAfter: suppressed ? null : now,
      syncRevision: { increment: 1 },
    };
    // Apply opt-outs immediately. Other deliveries request a read of current
    // provider state, so delayed/duplicate events cannot restore subscriptions.
    if (eventName === 'contact.deleted') Object.assign(data, { emailStatus: 'deleted', launchSubscribed: false, updatesSubscribed: false, syncAfter: null });
    if (eventName === 'email.hardBounced' || eventName === 'email.spamReported') Object.assign(data, { emailStatus: 'suppressed', launchSubscribed: false, updatesSubscribed: false, syncAfter: null });
    if (eventName === 'contact.unsubscribed' && !suppressed) Object.assign(data, { emailStatus: 'unsubscribed', launchSubscribed: false, updatesSubscribed: false });
    if (eventName === 'contact.mailingList.unsubscribed') {
      const list = event.mailingList as Record<string, unknown> | undefined;
      if (list?.id === process.env.LOOPS_EARLY_ACCESS_LIST_ID) data.launchSubscribed = false;
      if (list?.id === process.env.LOOPS_UPDATES_LIST_ID) data.updatesSubscribed = false;
    }
    if (eventName === 'campaign.email.sent' && process.env.LOOPS_LAUNCH_CAMPAIGN_ID && event.campaignId === process.env.LOOPS_LAUNCH_CAMPAIGN_ID) {
      await tx.waitlistEntry.updateMany({ where: { id: entry.id, stage: 'waiting' }, data: { stage: 'invited', invitedAt: now } });
    }
    await tx.waitlistEntry.update({ where: { id: entry.id }, data });
    return { received: true };
  });
}
