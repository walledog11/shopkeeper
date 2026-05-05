import { Worker, Queue, type WorkerOptions } from 'bullmq';
import { db, ThreadFilterStatus, ThreadFilterFeedback, type DbThreadFilterStatus } from '@clerk/db';
import * as Sentry from '@sentry/node';
import logger from './logger.js';
import { CHANNEL, QUEUE, JOB } from './constants.js';
import { getTwilio } from './message-handlers.js';
import { updateContext } from './sms-context.js';
import { getGatewayOpsAlertConfig, type GatewayOpsAlertConfig } from './runtime-config.js';
import {
  emitOpsAlert,
  incrementOpsAlertWindow,
  type IncrementOpsAlertWindowResult,
  type OpsAlertCounterClient,
} from './ops-alerts.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const CONCURRENCY = 5;
const FB_GRAPH = 'https://graph.facebook.com/v22.0';
const ARCHIVE_AFTER_DAYS = 90;
const PURGE_AFTER_DAYS = 90;
export const FILTERED_PURGE_AFTER_DAYS = 7;

const DIGEST_QUESTIONABLE_LIMIT = 10;
const DIGEST_SUMMARY_TRUNC = 90;
export const QUEUE_HEALTH_ACTIVE_SAMPLE_LIMIT = 20;

type QueueHealthQueueLabel = 'inbound' | 'aiSummary';
type QueueHealthMetric = 'failed' | 'waiting' | 'active_stuck';

export interface QueueHealthCounts {
  waiting: number;
  active: number;
  failed: number;
  [key: string]: number;
}

export interface QueueHealthActiveJob {
  id?: string | number;
  name?: string;
  attemptsMade?: number;
  timestamp?: number;
  processedOn?: number;
  data?: unknown;
}

export interface QueueHealthActiveJobSnapshot {
  id: string | null;
  name: string | null;
  attemptsMade: number | null;
  ageMs: number;
  startedAt: string;
  timestamp: string | null;
  processedOn: string | null;
  platform: string | null;
  channel: string | null;
  organizationId: string | null;
  traceId: string | null;
}

export interface QueueHealthInspectableQueue {
  getJobCounts: (...types: Array<'waiting' | 'active' | 'failed'>) => Promise<Record<string, number | undefined>>;
  getJobs: (
    types: Array<'active'>,
    start: number,
    end: number,
    asc: boolean,
  ) => Promise<QueueHealthActiveJob[]>;
}

export interface QueueHealthMonitoredQueue {
  label: QueueHealthQueueLabel;
  queueName: string;
  queue: QueueHealthInspectableQueue;
}

export interface QueueHealthSnapshot {
  label: QueueHealthQueueLabel;
  queueName: string;
  counts: QueueHealthCounts;
  activeJobSampleSize: number;
  oldestActiveJob: QueueHealthActiveJobSnapshot | null;
}

export interface QueueHealthAlertDecision {
  queue: QueueHealthQueueLabel;
  metric: QueueHealthMetric;
  value: number;
  threshold: number;
  emitted: boolean;
  window: IncrementOpsAlertWindowResult;
}

export interface QueueHealthCheckResult {
  snapshots: QueueHealthSnapshot[];
  alerts: QueueHealthAlertDecision[];
}

export interface QueueHealthCheckDependencies {
  counterClient: OpsAlertCounterClient;
  config?: GatewayOpsAlertConfig;
  nowMs?: number;
  activeSampleLimit?: number;
  emitAlert?: typeof emitOpsAlert;
  incrementWindow?: typeof incrementOpsAlertWindow;
}

interface DigestThreadRow {
  id: string;
  updatedAt: Date;
  tag: string | null;
  filterStatus: DbThreadFilterStatus;
  aiSummary: string | null;
  filterReason: string | null;
  customer: { name: string | null };
}

interface DigestBuckets {
  genuine: DigestThreadRow[];
  questionable: DigestThreadRow[];
  filteredCount: number;
  urgent: number;
  stale: number;
  fresh: number;
  topTags: string;
}

export function bucketDigestThreads(threads: DigestThreadRow[], now: Date): DigestBuckets {
  const genuine: DigestThreadRow[] = [];
  const questionable: DigestThreadRow[] = [];
  let filteredCount = 0;

  for (const t of threads) {
    if (t.filterStatus === ThreadFilterStatus.questionable) questionable.push(t);
    else if (t.filterStatus === ThreadFilterStatus.filtered) filteredCount++;
    else genuine.push(t);
  }

  const nowMs = now.getTime();
  let urgent = 0, stale = 0, fresh = 0;
  for (const t of genuine) {
    const age = nowMs - t.updatedAt.getTime();
    if (age > 24 * 3_600_000)      urgent++;
    else if (age > 4 * 3_600_000)  stale++;
    else                           fresh++;
  }

  const tagCounts: Record<string, number> = {};
  for (const t of genuine) {
    if (t.tag) tagCounts[t.tag] = (tagCounts[t.tag] ?? 0) + 1;
  }
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag, count]) => `${tag} (${count})`)
    .join(' · ');

  return { genuine, questionable, filteredCount, urgent, stale, fresh, topTags };
}

export function formatDigestMessage(buckets: DigestBuckets): string {
  const { genuine, questionable, filteredCount, urgent, stale, fresh, topTags } = buckets;
  const lines: string[] = [`Here's your support inbox:`, ``, `Open tickets: ${genuine.length}`];

  if (urgent > 0) lines.push(`  No reply >24h: ${urgent}`);
  if (stale > 0)  lines.push(`  Needs attention (4-24h): ${stale}`);
  if (fresh > 0)  lines.push(`  Recent (<4h): ${fresh}`);

  if (questionable.length > 0) {
    lines.push(``, `Flagged (review needed): ${questionable.length}`);
    const shown = questionable.slice(0, DIGEST_QUESTIONABLE_LIMIT);
    shown.forEach((t, i) => {
      const name = t.customer.name ?? 'Unknown';
      const blurb = (t.aiSummary ?? t.filterReason ?? '').trim();
      const truncated = blurb.length > DIGEST_SUMMARY_TRUNC ? `${blurb.slice(0, DIGEST_SUMMARY_TRUNC)}…` : blurb;
      lines.push(`${i + 1}. ${name}${truncated ? ` — ${truncated}` : ''}`);
    });
    if (questionable.length > shown.length) {
      lines.push(`  …and ${questionable.length - shown.length} more`);
    }
  }

  if (filteredCount > 0) {
    lines.push(``, `Filtered: ${filteredCount} (auto-removed in 7d)`);
  }

  if (topTags) lines.push(``, `Topics: ${topTags}`);

  lines.push(``);
  if (questionable.length > 0) {
    lines.push(`Reply OPEN <n> · SPAM <n> · REPLY <n> <text> · REVIEW to relist`);
  }
  lines.push(`Or send an order number (e.g. #1234) for ticket details.`);

  return lines.join('\n');
}
export async function purgeFilteredThreads(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - FILTERED_PURGE_AFTER_DAYS * ONE_DAY_MS);
  const result = await db.thread.deleteMany({
    where: {
      filterStatus: ThreadFilterStatus.filtered,
      filterFeedback: ThreadFilterFeedback.none,
      filterDecidedAt: { lt: cutoff },
      messages: { none: { senderType: 'agent' } },
    },
  });
  return result.count;
}

export async function checkGatewayQueueHealth(
  monitoredQueues: QueueHealthMonitoredQueue[],
  dependencies: QueueHealthCheckDependencies,
): Promise<QueueHealthCheckResult> {
  const config = dependencies.config ?? getGatewayOpsAlertConfig();
  const nowMs = dependencies.nowMs ?? Date.now();
  const activeSampleLimit = normalizeSampleLimit(dependencies.activeSampleLimit);
  const emitAlert = dependencies.emitAlert ?? emitOpsAlert;
  const incrementWindow = dependencies.incrementWindow ?? incrementOpsAlertWindow;

  const snapshots = await Promise.all(
    monitoredQueues.map((monitoredQueue) =>
      readQueueHealthSnapshot(monitoredQueue, { nowMs, activeSampleLimit }),
    ),
  );

  const alerts: QueueHealthAlertDecision[] = [];
  for (const snapshot of snapshots) {
    if (snapshot.counts.failed > config.queueFailedThreshold) {
      alerts.push(await emitQueueHealthAlert({
        snapshot,
        metric: 'failed',
        value: snapshot.counts.failed,
        threshold: config.queueFailedThreshold,
        config,
        nowMs,
        counterClient: dependencies.counterClient,
        emitAlert,
        incrementWindow,
      }));
    }

    if (snapshot.counts.waiting > config.queueWaitingThreshold) {
      alerts.push(await emitQueueHealthAlert({
        snapshot,
        metric: 'waiting',
        value: snapshot.counts.waiting,
        threshold: config.queueWaitingThreshold,
        config,
        nowMs,
        counterClient: dependencies.counterClient,
        emitAlert,
        incrementWindow,
      }));
    }

    if (
      snapshot.oldestActiveJob
      && snapshot.oldestActiveJob.ageMs > config.queueActiveStuckMs
    ) {
      alerts.push(await emitQueueHealthAlert({
        snapshot,
        metric: 'active_stuck',
        value: snapshot.oldestActiveJob.ageMs,
        threshold: config.queueActiveStuckMs,
        config,
        nowMs,
        counterClient: dependencies.counterClient,
        emitAlert,
        incrementWindow,
      }));
    }
  }

  return { snapshots, alerts };
}

export async function readQueueHealthSnapshot(
  monitoredQueue: QueueHealthMonitoredQueue,
  options: { nowMs: number; activeSampleLimit?: number },
): Promise<QueueHealthSnapshot> {
  const activeSampleLimit = normalizeSampleLimit(options.activeSampleLimit);
  const [rawCounts, activeJobs] = await Promise.all([
    monitoredQueue.queue.getJobCounts('waiting', 'active', 'failed'),
    monitoredQueue.queue.getJobs(['active'], 0, activeSampleLimit - 1, true),
  ]);

  return {
    label: monitoredQueue.label,
    queueName: monitoredQueue.queueName,
    counts: normalizeQueueCounts(rawCounts),
    activeJobSampleSize: activeJobs.length,
    oldestActiveJob: getOldestActiveJobSnapshot(activeJobs, options.nowMs),
  };
}

export function getOldestActiveJobSnapshot(
  activeJobs: QueueHealthActiveJob[],
  nowMs: number,
): QueueHealthActiveJobSnapshot | null {
  let oldest: QueueHealthActiveJobSnapshot | null = null;

  for (const job of activeJobs) {
    const startedAtMs = readTimestampMs(job.processedOn) ?? readTimestampMs(job.timestamp);
    if (startedAtMs === null) continue;

    const data = isRecord(job.data) ? job.data : {};
    const platform = readString(data.platform);
    const channel = readString(data.channelType) ?? platform;
    const snapshot: QueueHealthActiveJobSnapshot = {
      id: job.id === undefined ? null : String(job.id),
      name: readString(job.name),
      attemptsMade: Number.isInteger(job.attemptsMade) ? job.attemptsMade! : null,
      ageMs: Math.max(0, nowMs - startedAtMs),
      startedAt: new Date(startedAtMs).toISOString(),
      timestamp: formatTimestamp(job.timestamp),
      processedOn: formatTimestamp(job.processedOn),
      platform,
      channel,
      organizationId: readString(data.organizationId),
      traceId: readString(data.traceId),
    };

    if (!oldest || snapshot.ageMs > oldest.ageMs) {
      oldest = snapshot;
    }
  }

  return oldest;
}

async function emitQueueHealthAlert(input: {
  snapshot: QueueHealthSnapshot;
  metric: QueueHealthMetric;
  value: number;
  threshold: number;
  config: GatewayOpsAlertConfig;
  nowMs: number;
  counterClient: OpsAlertCounterClient;
  emitAlert: typeof emitOpsAlert;
  incrementWindow: typeof incrementOpsAlertWindow;
}): Promise<QueueHealthAlertDecision> {
  const window = await input.incrementWindow(input.counterClient, {
    keyParts: ['queue_health', input.snapshot.label, input.metric],
    threshold: 1,
    windowSecs: input.config.windowSecs,
    nowMs: input.nowMs,
  });

  if (window.thresholdCrossed) {
    const oldestActiveJob = input.snapshot.oldestActiveJob;
    const activeJobTags = input.metric === 'active_stuck'
      ? {
          platform: oldestActiveJob?.platform,
          channel: oldestActiveJob?.channel,
          orgId: oldestActiveJob?.organizationId,
        }
      : {};

    input.emitAlert({
      category: 'queue_health',
      message: formatQueueHealthAlertMessage(input.metric, input.snapshot.label, input.value, input.threshold),
      level: 'warning',
      tags: {
        queue: input.snapshot.label,
        ...activeJobTags,
      },
      fingerprint: buildQueueHealthFingerprint(
        input.snapshot.label,
        input.metric,
        oldestActiveJob?.channel,
      ),
      extra: {
        metric: input.metric,
        queue: input.snapshot.label,
        queueName: input.snapshot.queueName,
        value: input.value,
        threshold: input.threshold,
        counts: input.snapshot.counts,
        activeJobSampleSize: input.snapshot.activeJobSampleSize,
        oldestActiveJob,
        alertWindow: window,
      },
    }, { config: input.config });
  }

  return {
    queue: input.snapshot.label,
    metric: input.metric,
    value: input.value,
    threshold: input.threshold,
    emitted: window.thresholdCrossed,
    window,
  };
}

function formatQueueHealthAlertMessage(
  metric: QueueHealthMetric,
  queue: QueueHealthQueueLabel,
  value: number,
  threshold: number,
): string {
  if (metric === 'active_stuck') {
    return `Queue alert: ${queue} active job age (${value}ms) exceeded threshold (${threshold}ms)`;
  }

  const metricLabel = metric === 'failed' ? 'failed jobs' : 'waiting jobs';
  return `Queue alert: ${queue} ${metricLabel} (${value}) exceeded threshold (${threshold})`;
}

function buildQueueHealthFingerprint(
  queue: QueueHealthQueueLabel,
  metric: QueueHealthMetric,
  channel: string | null | undefined,
): string[] {
  const fingerprint = ['ops-alert', 'queue_health', 'gateway', `queue:${queue}`, `metric:${metric}`];
  if (metric === 'active_stuck' && channel) {
    fingerprint.push(`channel:${channel}`);
  }
  return fingerprint;
}

function normalizeQueueCounts(rawCounts: Record<string, number | undefined>): QueueHealthCounts {
  return {
    ...Object.fromEntries(
      Object.entries(rawCounts).map(([key, value]) => [key, normalizeCount(value)]),
    ),
    waiting: normalizeCount(rawCounts.waiting),
    active: normalizeCount(rawCounts.active),
    failed: normalizeCount(rawCounts.failed),
  };
}

function normalizeCount(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

function normalizeSampleLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return QUEUE_HEALTH_ACTIVE_SAMPLE_LIMIT;
  }
  return Math.max(1, Math.floor(value));
}

function readTimestampMs(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function formatTimestamp(value: unknown): string | null {
  const timestampMs = readTimestampMs(value);
  return timestampMs === null ? null : new Date(timestampMs).toISOString();
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
    Sentry.captureException(err, { extra: { jobId: job?.id, queue: 'token-health', attemptsMade: job?.attemptsMade } });
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
    Sentry.captureException(err, { extra: { jobId: job?.id, queue: 'thread-archival', attemptsMade: job?.attemptsMade } });
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

    const filteredPurged = await purgeFilteredThreads(new Date());
    logger.info(
      { count: filteredPurged, cutoffDays: FILTERED_PURGE_AFTER_DAYS },
      '[Purge] Hard-deleted aged filtered threads'
    );
  }, { connection: workerConn, ...workerOptions });

  purgeWorker.on('failed', (job, err) => {
    logger.error({ err: err.message, jobId: job?.id }, '[Purge] Job failed');
    Sentry.captureException(err, { extra: { jobId: job?.id, queue: 'purge', attemptsMade: job?.attemptsMade } });
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

    // Single query for all eligible orgs. We fetch every open thread regardless
    // of filterStatus so the bucketing happens in memory.
    const now = new Date();
    const allOpenThreads = await db.thread.findMany({
      where: { organizationId: { in: eligibleOrgs.map(o => o.id) }, status: 'open', deletedAt: null },
      select: {
        id: true,
        organizationId: true,
        updatedAt: true,
        tag: true,
        filterStatus: true,
        aiSummary: true,
        filterReason: true,
        customer: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    type DigestThread = typeof allOpenThreads[number];
    const threadsByOrg = new Map<string, DigestThread[]>();
    for (const t of allOpenThreads) {
      if (!threadsByOrg.has(t.organizationId)) threadsByOrg.set(t.organizationId, []);
      threadsByOrg.get(t.organizationId)!.push(t);
    }

    for (const org of eligibleOrgs) {
      const openThreads = threadsByOrg.get(org.id) ?? [];
      if (openThreads.length === 0) continue;

      const buckets = bucketDigestThreads(openThreads, now);
      const message = formatDigestMessage(buckets);

      const pendingDigest = {
        threadIds: buckets.questionable.slice(0, DIGEST_QUESTIONABLE_LIMIT).map(t => t.id),
        sentAt: now.toISOString(),
      };

      for (const member of org.members) {
        try {
          await twilioInstance.client.messages.create({
            from: twilioInstance.from,
            to: `whatsapp:${member.phoneNumber}`,
            body: message,
          });
          // Persist the numbered list so OPEN/SPAM/REPLY <n> can resolve to a thread id.
          await updateContext(org.id, member.phoneNumber!, { pendingDigest });
          logger.info({ organizationId: org.id, phone: member.phoneNumber, flagged: buckets.questionable.length }, '[Digest] Sent digest');
        } catch (e) {
          logger.error({ err: (e as Error).message, phone: member.phoneNumber }, '[Digest] Failed to send digest');
        }
      }
    }
  }, { connection: workerConn, ...workerOptions });

  digestWorker.on('failed', (job, err) => {
    logger.error({ err: err.message, jobId: job?.id }, '[Digest] Job failed');
    Sentry.captureException(err, { extra: { jobId: job?.id, queue: 'whatsapp-digest', attemptsMade: job?.attemptsMade } });
  });

  // ─── Queue Health Monitor ─────────────────────────────────────────────────────

  const FIVE_MINUTES_MS = 5 * 60 * 1000;

  const queueHealthQueue = new Queue(QUEUE.QUEUE_HEALTH, { connection: producerConn });

  await queueHealthQueue.add(
    JOB.QUEUE_HEALTH_CHECK,
    {},
    { repeat: { every: FIVE_MINUTES_MS }, jobId: JOB.QUEUE_HEALTH_ID }
  );

  const queueHealthWorker = new Worker(QUEUE.QUEUE_HEALTH, async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conn = producerConn as unknown as any;
    const inboundQueue = new Queue(QUEUE.INBOUND, { connection: conn });
    const summaryQueue = new Queue(QUEUE.AI_SUMMARY, { connection: conn });

    try {
      await checkGatewayQueueHealth([
        { label: 'inbound', queueName: QUEUE.INBOUND, queue: inboundQueue },
        { label: 'aiSummary', queueName: QUEUE.AI_SUMMARY, queue: summaryQueue },
      ], {
        counterClient: producerConn as OpsAlertCounterClient,
      });
    } finally {
      await Promise.all([inboundQueue.close(), summaryQueue.close()]);
    }
  }, { connection: workerConn, ...workerOptions });

  queueHealthWorker.on('failed', (job, err) => {
    logger.error({ err: err.message, jobId: job?.id }, '[QueueHealth] Job failed');
    Sentry.captureException(err, { extra: { jobId: job?.id, queue: 'queue-health', attemptsMade: job?.attemptsMade } });
  });

  return {
    workers: [tokenHealthWorker, archivalWorker, purgeWorker, digestWorker, queueHealthWorker],
    queues: [tokenHealthQueue, archivalQueue, purgeQueue, digestQueue, queueHealthQueue],
  };
}
