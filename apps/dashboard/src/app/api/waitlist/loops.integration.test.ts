import { createHmac, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import { processWaitlistSync, recordLoopsWaitlistEvent } from '@shopkeeper/email/waitlist';
import { POST } from './route';
import { POST as webhook } from '../webhooks/loops/route';

// Next runs these after returning the HTTP response. Tests drive the durable
// worker explicitly so provider outages and races can be controlled.
vi.mock('next/server', async importOriginal => ({
  ...await importOriginal<typeof import('next/server')>(), after: vi.fn(),
}));

const fixture = `loops-test-${randomUUID()}`;
const ids: string[] = [];
const receiptIds: string[] = [];
const secretBytes = Buffer.from('waitlist webhook signing fixture');
const fetchMock = vi.fn<typeof fetch>();
const earlyAccess = 'early-access-fixture';
const updates = 'updates-fixture';

beforeEach(() => {
  vi.stubEnv('LOOPS_WAITLIST_ENABLED', 'true');
  vi.stubEnv('LOOPS_API_KEY', 'loops-test-key');
  vi.stubEnv('LOOPS_FORM_URL', 'https://app.loops.so/api/newsletter-form/fixture');
  vi.stubEnv('LOOPS_EARLY_ACCESS_LIST_ID', earlyAccess);
  vi.stubEnv('LOOPS_UPDATES_LIST_ID', updates);
  vi.stubEnv('LOOPS_LAUNCH_CAMPAIGN_ID', 'launch-fixture');
  vi.stubEnv('LOOPS_SIGNING_SECRET', `whsec_${secretBytes.toString('base64')}`);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => { throw new Error('Unexpected provider request'); });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  await db.waitlistEntry.deleteMany({ where: { OR: [{ id: { in: ids } }, { email: { startsWith: fixture } }] } });
  await db.waitlistWebhookReceipt.deleteMany({ where: { id: { in: receiptIds } } });
  ids.length = 0;
  receiptIds.length = 0;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function entry(newsletterOptIn = false) {
  const saved = await db.waitlistEntry.create({ data: {
    email: `${fixture}-${randomUUID()}@example.com`, source: 'hero', attribution: { utm_source: 'fixture' },
    consentVersion: 'waitlist-updates-v2', newsletterOptIn,
  } });
  ids.push(saved.id);
  return saved;
}

function remote(email: string, state: 'pending' | 'accepted' | 'rejected' = 'pending') {
  return { id: 'contact-fixture', email, optInStatus: state, subscribed: state !== 'rejected', mailingLists: { [earlyAccess]: true, [updates]: true } };
}

async function retry(id: string) {
  await db.waitlistEntry.update({ where: { id }, data: { syncAfter: new Date(0) } });
  return processWaitlistSync({ id });
}

function signed(event: Record<string, unknown>, options: { id?: string; secondsAgo?: number } = {}) {
  const id = options.id ?? randomUUID();
  receiptIds.push(id);
  const body = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1000) - (options.secondsAgo ?? 0));
  const signature = createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${body}`).digest('base64');
  return new Request('http://localhost/api/webhooks/loops', {
    method: 'POST', body,
    headers: { 'content-type': 'application/json', 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${signature}` },
  });
}

describe('waitlist delivery and consent', () => {
  it('deduplicates concurrent public signups and preserves the original consent', async () => {
    const email = `${fixture}@example.com`;
    const request = (newsletterOptIn: boolean) => new Request('http://localhost/api/waitlist', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify({ email: ` ${email.toUpperCase()} `, newsletterOptIn, source: 'footer' }),
    });
    const responses = await Promise.all([POST(request(false)), POST(request(false))]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect(await responses[0].json()).toEqual({ success: true, confirmationRequired: true });
    expect(await POST(request(true)).then(response => response.status)).toBe(200);
    const rows = await db.waitlistEntry.findMany({ where: { email } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ newsletterOptIn: false, newsletterConsentAt: null, source: 'footer' });
  });

  it.each([false, true])('waits for confirmation and includes only selected lists (newsletter: %s)', async newsletterOptIn => {
    const saved = await entry(newsletterOptIn);
    fetchMock
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json({ success: true }))
      .mockResolvedValueOnce(Response.json([remote(saved.email)]));
    expect(await processWaitlistSync({ id: saved.id })).toMatchObject({ synced: 1, failed: 0 });
    const submitted = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')!;
    const form = new URLSearchParams(String(submitted[1]?.body));
    expect(form.get('mailingLists')?.split(',')).toEqual(newsletterOptIn ? [earlyAccess, updates] : [earlyAccess]);
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'PUT')).toBe(false);
    expect(await db.waitlistEntry.findUniqueOrThrow({ where: { id: saved.id } })).toMatchObject({
      emailStatus: 'pending', launchSubscribed: false, updatesSubscribed: false,
    });
    fetchMock
      .mockResolvedValueOnce(Response.json([{ ...remote(saved.email, 'accepted'), mailingLists: { [earlyAccess]: true, [updates]: newsletterOptIn } }]))
      .mockResolvedValueOnce(Response.json({ success: true }));
    await retry(saved.id);
    const updated = fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT')!;
    const properties = JSON.parse(String(updated[1]?.body));
    expect(properties).not.toHaveProperty('subscribed');
    expect(properties).not.toHaveProperty('mailingLists');
    expect(await db.waitlistEntry.findUniqueOrThrow({ where: { id: saved.id } })).toMatchObject({
      emailStatus: 'subscribed', launchSubscribed: true, updatesSubscribed: newsletterOptIn,
    });
  });

  it('recovers an unknown form outcome without sending a second confirmation', async () => {
    const saved = await entry();
    fetchMock.mockResolvedValueOnce(Response.json([])).mockRejectedValueOnce(new Error('Response lost after provider accepted form'));
    expect(await processWaitlistSync({ id: saved.id })).toMatchObject({ failed: 1 });
    const failed = await db.waitlistEntry.findUniqueOrThrow({ where: { id: saved.id } });
    expect(failed.lastSyncError).toBe('loops_network_error');
    expect(failed.syncAfter!.getTime()).toBeGreaterThan(Date.now());
    fetchMock.mockResolvedValueOnce(Response.json([remote(saved.email)])).mockResolvedValueOnce(Response.json([remote(saved.email)]));
    expect(await retry(saved.id)).toMatchObject({ synced: 1, failed: 0 });
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
    expect(await db.waitlistEntry.findUniqueOrThrow({ where: { id: saved.id } })).toMatchObject({ lastSyncError: null, syncAttempts: 0, emailStatus: 'pending' });
  });

  it('leases a signup so concurrent workers submit it only once', async () => {
    const saved = await entry();
    let contact: ReturnType<typeof remote> | null = null;
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.method === 'POST') { contact = remote(saved.email); return Response.json({ success: true }); }
      return Response.json(contact ? [contact] : []);
    });
    await Promise.all([processWaitlistSync({ id: saved.id }), processWaitlistSync({ id: saved.id })]);
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
    expect(await db.waitlistEntry.findUniqueOrThrow({ where: { id: saved.id } })).toMatchObject({ syncLeaseToken: null, syncLeaseUntil: null });
  });

  it('does not submit or update a previously unsubscribed contact', async () => {
    const saved = await entry(true);
    fetchMock.mockResolvedValueOnce(Response.json([remote(saved.email, 'rejected')]));
    await processWaitlistSync({ id: saved.id });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await db.waitlistEntry.findUniqueOrThrow({ where: { id: saved.id } })).toMatchObject({ emailStatus: 'unsubscribed', launchSubscribed: false, updatesSubscribed: false });
  });

  it('does not recreate a contact that disappears after submission', async () => {
    const saved = await entry();
    await db.waitlistEntry.update({ where: { id: saved.id }, data: { loopsSubmittedAt: new Date() } });
    fetchMock.mockResolvedValueOnce(Response.json([]));
    expect(await processWaitlistSync({ id: saved.id })).toMatchObject({ failed: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('leaves consent pending if the provider omits its opt-in status', async () => {
    const saved = await entry();
    fetchMock.mockResolvedValueOnce(Response.json([{ ...remote(saved.email), optInStatus: undefined }]));
    expect(await processWaitlistSync({ id: saved.id })).toMatchObject({ failed: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: saved.id } })).emailStatus).toBe('pending');
  });

  it('preserves an existing list opt-out even when the contact is globally subscribed', async () => {
    const saved = await entry();
    const contact = { ...remote(saved.email, 'accepted'), mailingLists: { [earlyAccess]: false } };
    fetchMock
      .mockResolvedValueOnce(Response.json([contact]))
      .mockResolvedValueOnce(Response.json([contact]))
      .mockResolvedValueOnce(Response.json({ success: true }));
    await processWaitlistSync({ id: saved.id });
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: saved.id } })).launchSubscribed).toBe(false);
  });
});

describe('signed subscription events', () => {
  it('deduplicates signed opt-outs and keeps suppression after delayed events', async () => {
    const saved = await entry();
    const contactIdentity = { id: 'contact-fixture', email: saved.email };
    const id = randomUUID();
    const event = { eventName: 'contact.unsubscribed', contactIdentity };
    expect((await webhook(signed(event, { id }))).status).toBe(200);
    expect(await (await webhook(signed(event, { id }))).json()).toEqual({ duplicate: true });
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: saved.id } })).syncRevision).toBe(2);
    await webhook(signed({ eventName: 'contact.deleted', contactIdentity }));
    await webhook(signed(event));
    await webhook(signed({ eventName: 'email.resubscribed', contactIdentity }));
    expect(await db.waitlistEntry.findUniqueOrThrow({ where: { id: saved.id } })).toMatchObject({ emailStatus: 'deleted', syncAfter: null, launchSubscribed: false, updatesSubscribed: false });
  });

  it('rejects tampered and stale signatures without changing consent', async () => {
    const saved = await entry();
    const event = { eventName: 'contact.unsubscribed', contactIdentity: { id: 'contact-fixture', email: saved.email } };
    const tampered = signed(event);
    tampered.headers.set('webhook-signature', 'v1,invalid');
    expect((await webhook(tampered)).status).toBe(401);
    expect((await webhook(signed(event, { secondsAgo: 600 }))).status).toBe(401);
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: saved.id } })).emailStatus).toBe('pending');
  });

  it('does not let an in-flight sync overwrite a newer opt-out', async () => {
    const saved = await entry();
    await db.waitlistEntry.update({ where: { id: saved.id }, data: { loopsSubmittedAt: new Date() } });
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.method === 'PUT') {
        const id = randomUUID();
        receiptIds.push(id);
        await recordLoopsWaitlistEvent(id, { eventName: 'contact.unsubscribed', contactIdentity: { id: 'contact-fixture', email: saved.email } });
        return Response.json({ success: true });
      }
      return Response.json([remote(saved.email, 'accepted')]);
    });
    await processWaitlistSync({ id: saved.id });
    expect(await db.waitlistEntry.findUniqueOrThrow({ where: { id: saved.id } })).toMatchObject({ emailStatus: 'unsubscribed', launchSubscribed: false, updatesSubscribed: false, syncLeaseToken: null });
  });

  it('records launch invitations without regressing people who already signed up', async () => {
    const saved = await entry();
    const event = { eventName: 'campaign.email.sent', campaignId: 'launch-fixture', contactIdentity: { id: 'contact-fixture', email: saved.email } };
    await webhook(signed(event));
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: saved.id } })).stage).toBe('invited');
    await db.waitlistEntry.update({ where: { id: saved.id }, data: { stage: 'signed_up', signedUpAt: new Date() } });
    await webhook(signed(event));
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: saved.id } })).stage).toBe('signed_up');
  });
});
