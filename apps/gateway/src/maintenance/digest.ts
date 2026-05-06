import { ThreadFilterStatus, type DbThreadFilterStatus } from '@clerk/db';

const ONE_HOUR_MS = 60 * 60 * 1000;
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

export function formatDigestMessage(buckets: DigestBuckets): string {
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

  lines.push(``);
  if (questionable.length > 0) {
    lines.push(`Reply OPEN <n> · SPAM <n> · REPLY <n> <text> · REVIEW to relist`);
  }
  lines.push(`Or send an order number (e.g. #1234) for ticket details.`);

  return lines.join('\n');
}

function normalizeHour(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return ((Math.round(value) % 24) + 24) % 24;
}

export function shouldSendDigest(
  settings: Record<string, unknown>,
  currentHourUtc: number,
  nowMs: number,
): boolean {
  const offset = typeof settings.digestTimezoneOffset === 'number'
    ? Math.round(settings.digestTimezoneOffset)
    : 0;
  const frequency = typeof settings.digestFrequency === 'string' ? settings.digestFrequency : 'daily';
  const firstHour = normalizeHour(settings.digestHour, 8);
  const secondHour = normalizeHour(settings.digestSecondHour, 17);
  const days = typeof settings.digestDays === 'string' ? settings.digestDays : 'every_day';

  const localHour = (currentHourUtc + offset + 24) % 24;

  const localDay = new Date(nowMs + offset * ONE_HOUR_MS).getUTCDay();
  if (days === 'weekdays' && (localDay === 0 || localDay === 6)) return false;

  if (frequency === 'daily') return localHour === firstHour;
  if (frequency === 'twice_daily') return localHour === firstHour || localHour === secondHour;

  const interval = DIGEST_INTERVALS[frequency];
  if (!interval) return false;

  return ((localHour - firstHour + 24) % 24) % interval === 0;
}
