import { getSupportStats, type SupportStatsSummary } from '@shopkeeper/agent/support-stats';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { db, ThreadFilterStatus, type DbThreadFilterStatus } from '@shopkeeper/db';
import type { Prisma } from '@prisma/client';
import { JOB, QUEUE } from '../constants.js';
import logger from '../logger.js';
import { listOperatorBindings, notifyOperator } from '../operator-notify.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  ONE_HOUR_MS,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from './registration.js';
const FOUR_HOURS_MS = 4 * ONE_HOUR_MS;
const TWENTY_FOUR_HOURS_MS = 24 * ONE_HOUR_MS;

export const DIGEST_QUESTIONABLE_LIMIT = 10;
const DIGEST_SUMMARY_TRUNC = 90;
const DIGEST_INTERVALS: Record<string, number> = {
  every_4h: 4,
  every_6h: 6,
  every_8h: 8,
  every_12h: 12,
};

export interface DigestThreadRow {
  id: string;
  updatedAt: Date;
  tag: string | null;
  filterStatus: DbThreadFilterStatus;
  aiSummary: string | null;
  filterReason: string | null;
  customer: { name: string | null };
}

export interface DigestBuckets {
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
  const nowMs = now.getTime();
  let urgent = 0, stale = 0, fresh = 0;
  const tagCounts: Record<string, number> = {};

  for (const t of threads) {
    if (t.filterStatus === ThreadFilterStatus.questionable) {
      questionable.push(t);
      continue;
    }
    if (t.filterStatus === ThreadFilterStatus.filtered) {
      filteredCount++;
      continue;
    }

    genuine.push(t);
    const age = nowMs - t.updatedAt.getTime();
    if (age > TWENTY_FOUR_HOURS_MS) urgent++;
    else if (age > FOUR_HOURS_MS) stale++;
    else fresh++;

    if (t.tag) tagCounts[t.tag] = (tagCounts[t.tag] ?? 0) + 1;
  }

  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag, count]) => `${tag} (${count})`)
    .join(' · ');

  return { genuine, questionable, filteredCount, urgent, stale, fresh, topTags };
}

function formatDurationShort(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / (24 * 60))}d`;
}

export function formatWeeklySummaryLine(stats: SupportStatsSummary): string {
  const parts = [`${stats.tickets.total} new ticket${stats.tickets.total === 1 ? '' : 's'}`];
  const topTag = stats.tickets.byTag[0];
  if (topTag) parts.push(`top topic ${topTag.tag} (${topTag.count})`);
  if (stats.resolution.closedCount > 0) {
    parts.push(
      stats.resolution.avgMinutes != null
        ? `${stats.resolution.closedCount} resolved, avg ${formatDurationShort(stats.resolution.avgMinutes)}`
        : `${stats.resolution.closedCount} resolved`,
    );
  }
  return `Last 7 days: ${parts.join(' · ')}`;
}

export function formatDigestMessage(buckets: DigestBuckets, weeklyLine?: string | null): string {
  const { genuine, questionable, filteredCount, urgent, stale, fresh, topTags } = buckets;
  const lines: string[] = [`Here's your support inbox:`, ``, `Open tickets: ${genuine.length}`];

  if (urgent > 0) lines.push(`  No reply >24h: ${urgent}`);
  if (stale > 0) lines.push(`  Needs attention (4-24h): ${stale}`);
  if (fresh > 0) lines.push(`  Recent (<4h): ${fresh}`);

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

  if (weeklyLine) lines.push(``, weeklyLine);

  lines.push(``);
  if (questionable.length > 0) {
    lines.push(`Reply OPEN <n> · SPAM <n> · REPLY <n> <text> · REVIEW to relist`);
  }
  lines.push(`Or send an order number (e.g. #1234) for ticket details.`);

  return lines.join('\n');
}

export interface OrgDigest {
  message: string;
  pendingDigest: { threadIds: string[]; sentAt: string };
  flaggedCount: number;
}

/**
 * Build the support-inbox digest for one org from its open threads, ready to
 * send and to seed `OperatorContext.pendingDigest` for follow-up commands.
 * Returns null when the org has no open tickets. Shared by the scheduled digest
 * worker and the on-demand `SUMMARY` operator command.
 */
export async function buildOrgDigest(organizationId: string, now: Date): Promise<OrgDigest | null> {
  const [openThreads, weeklyStats] = await Promise.all([
    db.thread.findMany({
      where: { organizationId, status: 'open', deletedAt: null },
      select: {
        id: true,
        updatedAt: true,
        tag: true,
        filterStatus: true,
        aiSummary: true,
        filterReason: true,
        customer: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    // The weekly line is garnish — never let it sink the digest itself.
    getSupportStats(organizationId, 7).catch(() => null),
  ]);

  if (openThreads.length === 0) return null;

  const buckets = bucketDigestThreads(openThreads, now);
  return {
    message: formatDigestMessage(buckets, weeklyStats ? formatWeeklySummaryLine(weeklyStats) : null),
    pendingDigest: {
      threadIds: buckets.questionable.slice(0, DIGEST_QUESTIONABLE_LIMIT).map((t) => t.id),
      sentAt: now.toISOString(),
    },
    flaggedCount: buckets.questionable.length,
  };
}

const FIRST_BRIEFING_PREAMBLE = "Good morning — here's your first rundown. You'll get one like this every morning.";

// The welcome briefing sent when the first scheduled digest lands on an empty
// inbox: introduce the morning ritual and show what the agent has already
// learned from the merchant's Shopify store instead of skipping the send.
export async function buildFirstNightMessage(
  organizationId: string,
  storeName: string | null,
  agentName: string,
): Promise<string> {
  const syncedArticles = await db.kbArticle.count({
    where: { organizationId, knowledgeBase: { source: 'shopify' } },
  });
  const store = storeName?.trim() ? storeName.trim() : 'your store';

  const lines = [`Good morning — ${agentName} here with your first rundown.`, '', 'It was quiet overnight — no new tickets came in.', ''];
  if (syncedArticles > 0) {
    lines.push(
      `While it was slow I read through ${store} — ${syncedArticles} ${syncedArticles === 1 ? 'page is' : 'pages are'} now in my memory, so I can answer questions about returns, shipping, and your products.`,
    );
  } else {
    lines.push(`I'm set up and watching ${store}'s inbox — the moment a customer writes in, I'll get to work.`);
  }
  lines.push(
    '',
    "This is the same briefing you'll get every morning: what came in, what I handled, and what needs you. Text SUMMARY anytime to see your inbox.",
  );
  return lines.join('\n');
}

async function clearFirstBriefingPending(organizationId: string, currentSettings: unknown): Promise<void> {
  const raw = (currentSettings as Record<string, unknown> | null) ?? {};
  await db.organization.update({
    where: { id: organizationId },
    data: { settings: { ...raw, firstBriefingPending: false } as Prisma.InputJsonObject },
  });
}

export async function sendScheduledDigests(): Promise<void> {
  const now = new Date();
  const nowMs = now.getTime();
  const orgs = await db.organization.findMany({
    where: {
      members: {
        some: {
          OR: [{ telegramChats: { some: {} } }, { imessageBindings: { some: {} } }],
        },
      },
    },
    select: { id: true, name: true, settings: true },
  });

  const eligibleOrgs = orgs.filter(org => {
    const settings = (org.settings as Record<string, unknown> | null) ?? {};
    return settings.digestEnabled === true && shouldSendDigest(settings, nowMs);
  });

  if (eligibleOrgs.length === 0) return;

  for (const org of eligibleOrgs) {
    const firstBriefingPending = ((org.settings as Record<string, unknown> | null) ?? {}).firstBriefingPending === true;
    const digest = await buildOrgDigest(org.id, now);

    // A brand-new merchant with an empty inbox would otherwise never get a
    // first digest. Send a welcome briefing once so they see the morning ritual.
    if (!digest && !firstBriefingPending) continue;

    let message: string;
    let pendingDigest: OrgDigest['pendingDigest'];
    let flaggedCount = 0;
    if (digest) {
      message = firstBriefingPending ? `${FIRST_BRIEFING_PREAMBLE}\n\n${digest.message}` : digest.message;
      pendingDigest = digest.pendingDigest;
      flaggedCount = digest.flaggedCount;
    } else {
      const agentName = resolveAgentSettings(org.settings).agentName;
      message = await buildFirstNightMessage(org.id, org.name, agentName);
      pendingDigest = { threadIds: [], sentAt: now.toISOString() };
    }

    const bindings = await listOperatorBindings(org.id);
    for (const member of bindings) {
      const result = await notifyOperator(org.id, member, message, { pendingDigest });
      if (result) {
        logger.info(
          { organizationId: org.id, chatId: result.chatId, flagged: flaggedCount, firstBriefing: firstBriefingPending },
          '[Digest] Sent digest',
        );
      }
    }

    if (firstBriefingPending) {
      await clearFirstBriefingPending(org.id, org.settings);
    }
  }
}

export const registerDigestMaintenanceJob: MaintenanceJobRegistration = async (context) => {
  const queue = createMaintenanceQueue(context, QUEUE.DIGEST);
  await scheduleRepeatableJob(queue, JOB.DIGEST, JOB.DIGEST_ID, ONE_HOUR_MS);

  const worker = createMaintenanceWorker(context, QUEUE.DIGEST, sendScheduledDigests, {
    label: 'Digest',
    failureQueue: QUEUE.DIGEST,
  });

  return { workers: [worker], queues: [queue] };
};

function normalizeHour(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return ((Math.round(value) % 24) + 24) % 24;
}

function offsetToIanaFallback(offset: number): string {
  const rounded = Math.max(-12, Math.min(14, Math.round(offset)));
  if (rounded === 0) return 'UTC';
  return `Etc/GMT${rounded > 0 ? '-' : '+'}${Math.abs(rounded)}`;
}

function resolveTz(settings: Record<string, unknown>): string {
  const tz = settings.digestTimezone;
  if (typeof tz === 'string' && tz.trim() !== '') return tz;
  const offset = typeof settings.digestTimezoneOffset === 'number'
    ? Math.round(settings.digestTimezoneOffset)
    : 0;
  return offsetToIanaFallback(offset);
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function localHourAndDay(timeZone: string, now: Date): { hour: number; day: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      weekday: 'short',
      hour12: false,
    }).formatToParts(now);
    const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
    return {
      hour: ((parseInt(hourStr, 10) % 24) + 24) % 24,
      day: WEEKDAY_INDEX[weekday] ?? 0,
    };
  } catch {
    // Invalid timeZone — fall back to UTC.
    return { hour: now.getUTCHours(), day: now.getUTCDay() };
  }
}

export function shouldSendDigest(
  settings: Record<string, unknown>,
  nowMs: number,
): boolean {
  const frequency = typeof settings.digestFrequency === 'string' ? settings.digestFrequency : 'daily';
  const firstHour = normalizeHour(settings.digestHour, 8);
  const secondHour = normalizeHour(settings.digestSecondHour, 17);
  const days = typeof settings.digestDays === 'string' ? settings.digestDays : 'every_day';

  const tz = resolveTz(settings);
  const { hour: localHour, day: localDay } = localHourAndDay(tz, new Date(nowMs));

  if (days === 'weekdays' && (localDay === 0 || localDay === 6)) return false;

  if (frequency === 'daily') return localHour === firstHour;
  if (frequency === 'twice_daily') return localHour === firstHour || localHour === secondHour;

  const interval = DIGEST_INTERVALS[frequency];
  if (!interval) return false;

  return ((localHour - firstHour + 24) % 24) % interval === 0;
}
