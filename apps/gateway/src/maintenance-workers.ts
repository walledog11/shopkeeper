import { Worker, Queue, type WorkerOptions } from 'bullmq';
import { db } from '@clerk/db';
import * as Sentry from '@sentry/node';
import logger from './logger.js';
import { CHANNEL, QUEUE, JOB } from './constants.js';
import { getTwilio } from './message-handlers.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const CONCURRENCY = 5;
const FB_GRAPH = 'https://graph.facebook.com/v22.0';
const ARCHIVE_AFTER_DAYS = 90;
const PURGE_AFTER_DAYS = 90;
type SharedWorkerOptions = Pick<WorkerOptions, 'drainDelay' | 'stalledInterval'>;

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function createMaintenanceWorkers(
  workerConn: any,
  producerConn: any,
  workerOptions: SharedWorkerOptions,
) {
/* eslint-enable @typescript-eslint/no-explicit-any */

  // ─── Daily Instagram Token Health Check ──────────────────────────────────────

  const tokenHealthQueue = new Queue(QUEUE.TOKEN_HEALTH, { connection: producerConn });

  await tokenHealthQueue.add(
    JOB.TOKEN_HEALTH_CHECK,
    {},
    { repeat: { every: ONE_DAY_MS }, jobId: JOB.TOKEN_HEALTH_ID }
  );

  const tokenHealthWorker = new Worker(QUEUE.TOKEN_HEALTH, async () => {
    logger.info('[TokenHealth] Running daily Instagram token check');

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    const igIntegrations = await db.integration.findMany({
      where: { platform: CHANNEL.IG_DM, accessToken: { not: null } },
      select: { id: true, organizationId: true, externalAccountId: true, accessToken: true, refreshToken: true, tokenExpiresAt: true },
    });

    logger.info({ count: igIntegrations.length }, '[TokenHealth] Checking ig_dm integrations');

    for (let i = 0; i < igIntegrations.length; i += CONCURRENCY) {
      await Promise.all(igIntegrations.slice(i, i + CONCURRENCY).map(async (integration) => {
        try {
          const res = await fetch(
            `${FB_GRAPH}/${integration.externalAccountId}?fields=id&access_token=${integration.accessToken}`
          );
          const data = await res.json() as { error?: { message: string } };

          if (data.error) {
            logger.error({ organizationId: integration.organizationId, accountId: integration.externalAccountId, err: data.error.message }, '[TokenHealth] Token invalid — marking as expired');
            await db.integration.update({
              where: { id: integration.id },
              data: { tokenExpiresAt: new Date(0) },
            });
            return;
          }

          // Page token is valid. If we have the user token and app credentials, refresh
          // the long-lived user token via fb_exchange_token to keep it alive for another 60 days.
          const updateData: { tokenExpiresAt: Date; refreshToken?: string } = {
            tokenExpiresAt: new Date(Date.now() + 60 * ONE_DAY_MS),
          };

          if (integration.refreshToken && appId && appSecret) {
            try {
              const refreshRes = await fetch(
                `${FB_GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${integration.refreshToken}`
              );
              const refreshData = await refreshRes.json() as { access_token?: string; error?: { message: string } };

              if (refreshData.access_token) {
                updateData.refreshToken = refreshData.access_token;
                logger.info({ organizationId: integration.organizationId }, '[TokenHealth] User token refreshed');
              } else {
                logger.warn({ organizationId: integration.organizationId, err: refreshData.error?.message }, '[TokenHealth] User token refresh failed — page token still valid');
              }
            } catch (refreshErr) {
              logger.warn({ organizationId: integration.organizationId, err: (refreshErr as Error).message }, '[TokenHealth] User token refresh error — page token still valid');
            }
          }

          await db.integration.update({
            where: { id: integration.id },
            data: updateData,
          });

          const daysLeft = integration.tokenExpiresAt
            ? Math.round((new Date(integration.tokenExpiresAt).getTime() - Date.now()) / 86_400_000)
            : 'unknown';

          logger.info({ organizationId: integration.organizationId, daysLeft, refreshed: !!updateData.refreshToken }, '[TokenHealth] Token healthy, reset to 60d');
        } catch (err) {
          logger.error({ organizationId: integration.organizationId, err: (err as Error).message }, '[TokenHealth] Failed to check token');
        }
      }));
    }

    logger.info('[TokenHealth] Daily check complete');
  }, { connection: workerConn, ...workerOptions });

  tokenHealthWorker.on('failed', (job, err) => {
    logger.error({ err: err.message, jobId: job?.id }, '[TokenHealth] Job failed');
    Sentry.captureException(err, { extra: { jobId: job?.id } });
  });

  // ─── Thread Archival ──────────────────────────────────────────────────────────

  const archivalQueue = new Queue(QUEUE.ARCHIVAL, { connection: producerConn });

  await archivalQueue.add(
    JOB.ARCHIVE_THREADS,
    {},
    { repeat: { every: ONE_DAY_MS }, jobId: JOB.ARCHIVE_THREADS_ID }
  );

  const archivalWorker = new Worker(QUEUE.ARCHIVAL, async () => {
    const cutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS * ONE_DAY_MS);
    const result = await db.thread.updateMany({
      where: { status: 'closed', archivedAt: null, deletedAt: null, updatedAt: { lt: cutoff } },
      data: { archivedAt: new Date() },
    });
    logger.info({ count: result.count, cutoffDays: ARCHIVE_AFTER_DAYS }, '[Archival] Archived old closed threads');
  }, { connection: workerConn, ...workerOptions });

  archivalWorker.on('failed', (job, err) => {
    logger.error({ err: err.message, jobId: job?.id }, '[Archival] Job failed');
    Sentry.captureException(err, { extra: { jobId: job?.id } });
  });

  // ─── Hard-Delete Purge ────────────────────────────────────────────────────────

  const purgeQueue = new Queue(QUEUE.PURGE, { connection: producerConn });

  await purgeQueue.add(
    JOB.PURGE_DELETED,
    {},
    { repeat: { every: ONE_DAY_MS }, jobId: JOB.PURGE_DELETED_ID }
  );

  const purgeWorker = new Worker(QUEUE.PURGE, async () => {
    const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * ONE_DAY_MS);

    // Delete in leaf-first order to avoid FK cascade wiping records that haven't
    // reached their own retention cutoff.
    const deletedMessages = await db.message.deleteMany({ where: { deletedAt: { lt: cutoff } } });
    const deletedThreads = await db.thread.deleteMany({
      where: { deletedAt: { lt: cutoff }, messages: { none: {} } },
    });
    const deletedCustomers = await db.customer.deleteMany({
      where: { deletedAt: { lt: cutoff }, threads: { none: {} } },
    });

    logger.info(
      { messages: deletedMessages.count, threads: deletedThreads.count, customers: deletedCustomers.count, cutoffDays: PURGE_AFTER_DAYS },
      '[Purge] Hard-deleted expired soft-deleted records'
    );
  }, { connection: workerConn, ...workerOptions });

  purgeWorker.on('failed', (job, err) => {
    logger.error({ err: err.message, jobId: job?.id }, '[Purge] Job failed');
    Sentry.captureException(err, { extra: { jobId: job?.id } });
  });

  // ─── Daily WhatsApp Digest ────────────────────────────────────────────────────

  const digestQueue = new Queue(QUEUE.DIGEST, { connection: producerConn });

  await digestQueue.add(
    JOB.DIGEST,
    {},
    { repeat: { every: ONE_HOUR_MS }, jobId: JOB.DIGEST_ID }
  );

  const DIGEST_INTERVALS: Record<string, number> = {
    every_4h: 4,
    every_6h: 6,
    every_8h: 8,
    every_12h: 12,
  };

  function shouldSendDigest(settings: Record<string, unknown>, currentHourUtc: number): boolean {
    // Math.round guards against non-integer values that would break the === comparisons
    const offset     = typeof settings.digestTimezoneOffset === 'number' ? Math.round(settings.digestTimezoneOffset) : 0;
    const frequency  = typeof settings.digestFrequency === 'string' ? settings.digestFrequency : 'daily';
    const firstHour  = typeof settings.digestHour === 'number' ? settings.digestHour : 8;
    const secondHour = typeof settings.digestSecondHour === 'number' ? settings.digestSecondHour : 17;
    const days       = typeof settings.digestDays === 'string' ? settings.digestDays : 'every_day';

    // Convert UTC hour to local hour for this org
    const localHour = (currentHourUtc + offset + 24) % 24;

    // Days gate — derive local day by shifting UTC epoch by offset hours
    const localDay = new Date(Date.now() + offset * 3_600_000).getUTCDay(); // 0=Sun, 6=Sat
    if (days === 'weekdays' && (localDay === 0 || localDay === 6)) return false;

    if (frequency === 'daily')       return localHour === firstHour;
    if (frequency === 'twice_daily') return localHour === firstHour || localHour === secondHour;

    const interval = DIGEST_INTERVALS[frequency];
    if (!interval) return false;
    // Normalise difference into [0, 23] first, then check against the interval.
    // Without the inner % 24, (localHour - firstHour + 24) can be up to 47 for
    // edge cases, causing every multiple of interval to match instead of only
    // the intended fire slots {firstHour, firstHour+interval, ...} mod 24.
    return ((localHour - firstHour + 24) % 24) % interval === 0;
  }

  const digestWorker = new Worker(QUEUE.DIGEST, async () => {
    const currentHourUtc = new Date().getUTCHours();

    const orgs = await db.organization.findMany({
      where: { members: { some: { phoneVerified: true, phoneNumber: { not: null } } } },
      select: {
        id: true,
        settings: true,
        members: {
          where: { phoneVerified: true, phoneNumber: { not: null } },
          select: { phoneNumber: true },
        },
      },
    });

    const twilioInstance = getTwilio();
    if (!twilioInstance) {
      logger.warn('[Digest] Twilio not configured — skipping');
      return;
    }

    // Filter to orgs that are actually due for a digest this hour
    const eligibleOrgs = orgs.filter(org => {
      const settings = (org.settings as Record<string, unknown> | null) ?? {};
      return settings.digestEnabled && shouldSendDigest(settings, currentHourUtc);
    });

    if (eligibleOrgs.length === 0) return;

    // Single query for all eligible orgs instead of one per org
    const now = new Date();
    const allOpenThreads = await db.thread.findMany({
      where: { organizationId: { in: eligibleOrgs.map(o => o.id) }, status: 'open', deletedAt: null },
      select: { organizationId: true, updatedAt: true, tag: true },
    });

    const threadsByOrg = new Map<string, typeof allOpenThreads>();
    for (const t of allOpenThreads) {
      if (!threadsByOrg.has(t.organizationId)) threadsByOrg.set(t.organizationId, []);
      threadsByOrg.get(t.organizationId)!.push(t);
    }

    for (const org of eligibleOrgs) {
      const openThreads = threadsByOrg.get(org.id) ?? [];
      if (openThreads.length === 0) continue;

      const urgent = openThreads.filter(t => now.getTime() - t.updatedAt.getTime() > 24 * 3_600_000).length;
      const stale  = openThreads.filter(t => { const age = now.getTime() - t.updatedAt.getTime(); return age > 4 * 3_600_000 && age <= 24 * 3_600_000; }).length;
      const fresh  = openThreads.length - urgent - stale;

      const tagCounts: Record<string, number> = {};
      for (const t of openThreads) {
        if (t.tag) tagCounts[t.tag] = (tagCounts[t.tag] ?? 0) + 1;
      }
      const topTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([tag, count]) => `${tag} (${count})`)
        .join(' · ');

      const lines: string[] = [
        `Here's your support inbox:`,
        ``,
        `Open tickets: ${openThreads.length}`,
      ];
      if (urgent > 0) lines.push(`  No reply >24h: ${urgent}`);
      if (stale > 0)  lines.push(`  Needs attention (4-24h): ${stale}`);
      if (fresh > 0)  lines.push(`  Recent (<4h): ${fresh}`);
      if (topTags)    lines.push(``, `Topics: ${topTags}`);
      lines.push(``, `Reply with an order number (e.g. #1234) to get ticket details.`);

      const message = lines.join('\n');

      for (const member of org.members) {
        try {
          await twilioInstance.client.messages.create({
            from: twilioInstance.from,
            to: `whatsapp:${member.phoneNumber}`,
            body: message,
          });
          logger.info({ organizationId: org.id, phone: member.phoneNumber }, '[Digest] Sent digest');
        } catch (e) {
          logger.error({ err: (e as Error).message, phone: member.phoneNumber }, '[Digest] Failed to send digest');
        }
      }
    }
  }, { connection: workerConn, ...workerOptions });

  digestWorker.on('failed', (job, err) => {
    logger.error({ err: err.message, jobId: job?.id }, '[Digest] Job failed');
    Sentry.captureException(err, { extra: { jobId: job?.id } });
  });

  return {
    workers: [tokenHealthWorker, archivalWorker, purgeWorker, digestWorker],
    queues: [tokenHealthQueue, archivalQueue, purgeQueue, digestQueue],
  };
}
