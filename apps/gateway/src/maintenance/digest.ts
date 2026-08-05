import { getSupportStats, type SupportStatsSummary } from '@shopkeeper/agent/support-stats';
import { canonicalInboxThreadWhere } from '@shopkeeper/agent/inbox-filter';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { db, ThreadFilterStatus, type DbThreadFilterStatus } from '@shopkeeper/db';
import { JOB, QUEUE } from '../constants.js';
import logger from '../logger.js';
import { listOperatorBindings, notifyOperator } from '../operator-notify.js';
import { digestNotificationIdempotencyKey } from '../operator-notify-idempotency.js';
import {
  capitalize,
  countWord,
  formatHandledSection,
  formatWaitingSection,
  loadHandledRollup,
  loadWaitingOnYouItems,
  finalizeDigestSend,
  resolveHandledWindowStart,
} from './digest-briefing.js';
import { loadDigestShopifyGarnish } from './digest-shopify-garnish.js';
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
const WEEKLY_SUMMARY_MIN_TICKETS = 3;
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

// Null below three tickets a week: a stat line about one ticket is noise the
// merchant already read three lines further up.
export function formatWeeklySummaryLine(stats: SupportStatsSummary): string | null {
  if (stats.tickets.total < WEEKLY_SUMMARY_MIN_TICKETS) return null;

  const parts = [`${stats.tickets.total} tickets in`];
  const topTag = stats.tickets.byTag[0];
  // `General` is the classifier's catch-all, not a topic worth naming.
  if (topTag && topTag.count > 1 && topTag.tag !== 'General') {
    parts.push(`mostly ${topTag.tag}`);
  }
  if (stats.resolution.closedCount > 0) {
    parts.push(
      stats.resolution.avgMinutes != null
        ? `${stats.resolution.closedCount} resolved in ${formatDurationShort(stats.resolution.avgMinutes)} on average`
        : `${stats.resolution.closedCount} resolved`,
    );
  }
  return `Last 7 days: ${parts.join(', ')}.`;
}

export interface DigestMessageExtras {
  /** Greeting in the agent's own voice; the scheduled worker supplies it. */
  opener?: string | null;
  handledSection?: string | null;
  waitingSection?: string | null;
  garnishLines?: string[];
}

// One sentence about the open queue, plus the only urgency split the merchant
// can act on differently: what has been sitting long enough to be embarrassing.
function inboxSentence(genuineCount: number, urgent: number): string {
  // Claims only the reply queue, never "your inbox is clear" — that reads as a
  // contradiction when a flagged ticket is named in the next breath.
  if (genuineCount === 0) return "Nothing's waiting on a reply.";

  const opening = `You've got ${countWord(genuineCount)} open ticket${genuineCount === 1 ? '' : 's'}.`;
  if (urgent === 0) return opening;
  if (urgent === genuineCount) {
    return `${opening} ${genuineCount === 1 ? "It's" : "They've all"} been sitting over a day.`;
  }
  return `${opening} ${capitalize(countWord(urgent))} of them ${urgent === 1 ? 'has' : 'have'} been sitting over a day, so I'd start there.`;
}

function flaggedBlurb(thread: DigestThreadRow): string {
  const blurb = (thread.aiSummary ?? thread.filterReason ?? '').trim();
  return blurb.length > DIGEST_SUMMARY_TRUNC ? `${blurb.slice(0, DIGEST_SUMMARY_TRUNC)}…` : blurb;
}

// Summaries are model-written and land with or without a final stop. Inlined
// into a paragraph, a missing one runs two sentences together.
function endSentence(text: string): string {
  return /[.!?…"']$/.test(text) ? text : `${text}.`;
}

// Just the disclosure that the agent binned things on the merchant's behalf.
// The 7-day retention window is deliberately not mentioned: there is no
// un-filter path on the operator channel (REVIEW relists *flagged*, not
// filtered), so quoting a deadline against a decision they cannot reverse is
// noise every single morning.
function spamSentence(filteredCount: number): string {
  return filteredCount === 1
    ? `I filed one as spam.`
    : `I filed ${countWord(filteredCount)} as spam.`;
}

export function formatDigestMessage(
  buckets: DigestBuckets,
  weeklyLine?: string | null,
  extras?: DigestMessageExtras,
): string {
  const { genuine, questionable, filteredCount, urgent } = buckets;
  const lines: string[] = [];

  if (extras?.opener) {
    lines.push(extras.opener, '');
  }
  if (extras?.handledSection) {
    lines.push(extras.handledSection, '');
  }
  if (extras?.waitingSection) {
    lines.push(extras.waitingSection, '');
  }

  // Group by topic, not by data source. These two are the same news ("nothing
  // here needs you"), so they belong in one breath. Everything the merchant has
  // to act on gets its own block below.
  const status = [inboxSentence(genuine.length, urgent)];
  if (filteredCount > 0) status.push(spamSentence(filteredCount));
  lines.push(status.join(' '));

  if (questionable.length > 0) {
    lines.push(``);
    if (questionable.length === 1) {
      // A list of one is a tell that a machine wrote it. The ordinal it loses is
      // only an affordance for the `spam 1` keyword path, which still parses,
      // and the model resolves prose from the ids in its own ledger.
      // Name and summary sit on separate lines because the summary is
      // model-written prose that often carries its own colon and quotes —
      // inline, the punctuation collides and the sentence stops scanning.
      const only = questionable[0]!;
      const blurb = flaggedBlurb(only);
      lines.push(`There's one I wasn't sure about, from ${only.customer.name ?? 'someone new'}.`);
      if (blurb) lines.push(endSentence(blurb));
    } else {
      // Numbering earns its place once there is genuinely a list: it is the index
      // the merchant types back (`spam 2`) and the order of `pendingDigest.threadIds`.
      lines.push(`There are ${countWord(questionable.length)} I wasn't sure about:`);
      const shown = questionable.slice(0, DIGEST_QUESTIONABLE_LIMIT);
      shown.forEach((t, i) => {
        const name = t.customer.name ?? 'Unknown';
        const blurb = flaggedBlurb(t);
        // Colon, not a dash: summaries often open with a capitalized proper
        // noun, so a comma would read as a sentence fragment collision.
        lines.push(`${i + 1}. ${name}${blurb ? `: ${blurb}` : ''}`);
      });
      if (questionable.length > shown.length) {
        lines.push(`  …and ${questionable.length - shown.length} more`);
      }
    }
    // The ask belongs against the thing it is asking about, not floating at the
    // end of the message two blocks away from its subject — but it still gets
    // its own line with air above it. A sentence that closes a block always
    // does; jammed against the content it reads as one more detail.
    lines.push(``, questionable.length === 1
      ? `Want me to do anything with it?`
      : `Want me to do anything with those?`);
  }

  for (const line of extras?.garnishLines ?? []) {
    lines.push(``, line);
  }

  if (weeklyLine) lines.push(``, weeklyLine);

  // No command syntax anywhere. An employee ending a briefing asks a question or
  // says nothing — they don't teach you their shortcuts. The keyword fast paths
  // (`open 1`, `spam 1`, …) still parse and are still documented in HELP; the
  // merchant reaches them by muscle memory, not by being drilled every morning.
  // Plain prose resolves too: the model's ledger carries each flagged ticket's
  // id next to the ordinal the merchant saw (`buildDigestLedgerSection`).
  // The flagged ask already landed against its subject above; a fully quiet
  // inbox just gets a sign-off so the message doesn't trail into nothing.
  if (questionable.length === 0 && genuine.length === 0) {
    lines.push(``, `I'll shout if anything comes in.`);
  }

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
export async function buildOrgDigest(
  organizationId: string,
  now: Date,
  settings: Record<string, unknown> = {},
  options: { opener?: string | null } = {},
): Promise<OrgDigest | null> {
  const since = resolveHandledWindowStart(settings, now);
  const [openThreads, weeklyStats, handledRollup, waitingItems, garnishLines] = await Promise.all([
    db.thread.findMany({
      where: {
        ...canonicalInboxThreadWhere(organizationId),
        // The digest reports filtered threads as a count ("Filtered: n") rather
        // than hiding them, so drop that one clause of the inbox scope.
        filterStatus: undefined,
        status: 'open',
      },
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
    getSupportStats(organizationId, 7).catch(() => null),
    loadHandledRollup(organizationId, since),
    loadWaitingOnYouItems(organizationId, now),
    loadDigestShopifyGarnish(organizationId, settings, now),
  ]);

  const handledSection = formatHandledSection(handledRollup);
  const waitingSection = formatWaitingSection(waitingItems);
  const hasBriefingContent = Boolean(handledSection || waitingSection);

  if (openThreads.length === 0 && !hasBriefingContent) return null;

  const buckets = bucketDigestThreads(openThreads, now);
  return {
    message: formatDigestMessage(
      buckets,
      weeklyStats ? formatWeeklySummaryLine(weeklyStats) : null,
      { opener: options.opener ?? null, handledSection, waitingSection, garnishLines },
    ),
    pendingDigest: {
      threadIds: buckets.questionable.slice(0, DIGEST_QUESTIONABLE_LIMIT).map((t) => t.id),
      sentAt: now.toISOString(),
    },
    flaggedCount: buckets.questionable.length,
  };
}

function timeOfDayGreeting(localHour: number): string {
  if (localHour < 12) return 'Morning';
  if (localHour < 17) return 'Afternoon';
  return 'Evening';
}

// The agent says hello in its own name before reporting anything — the same
// voice `buildBindWelcome` and `buildFirstNightMessage` already use. Only the
// scheduled send greets; a merchant who just texted SUMMARY gets the answer.
export function buildDigestOpener(
  agentName: string,
  settings: Record<string, unknown>,
  now: Date,
  firstBriefing: boolean,
): string {
  const greeting = timeOfDayGreeting(localHourAndDay(resolveTz(settings), now).hour);
  return firstBriefing
    ? `${greeting}, ${agentName} here with your first rundown. You'll get one like this every day.`
    : `${greeting}, ${agentName} here.`;
}

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

  const lines = [`Good morning, ${agentName} here with your first rundown.`, '', 'It was quiet overnight. No new tickets came in.', ''];
  if (syncedArticles > 0) {
    lines.push(
      `While it was slow I read through ${store}. ${syncedArticles} ${syncedArticles === 1 ? 'page is' : 'pages are'} now in my memory, so I can answer questions about returns, shipping, and your products.`,
    );
  } else {
    lines.push(`I'm set up and watching ${store}'s inbox. The moment a customer writes in, I'll get to work.`);
  }
  lines.push(
    '',
    "This is the same briefing you'll get every morning: what came in, what I handled, and what needs you. Text SUMMARY anytime to see your inbox.",
  );
  return lines.join('\n');
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
    const orgSettings = (org.settings as Record<string, unknown> | null) ?? {};
    const firstBriefingPending = orgSettings.firstBriefingPending === true;
    const agentName = resolveAgentSettings(org.settings).agentName;
    const digest = await buildOrgDigest(org.id, now, orgSettings, {
      opener: buildDigestOpener(agentName, orgSettings, now, firstBriefingPending),
    });

    // A brand-new merchant with an empty inbox would otherwise never get a
    // first digest. Send a welcome briefing once so they see the morning ritual.
    if (!digest && !firstBriefingPending) continue;

    let message: string;
    let pendingDigest: OrgDigest['pendingDigest'];
    let flaggedCount = 0;
    if (digest) {
      message = digest.message;
      pendingDigest = digest.pendingDigest;
      flaggedCount = digest.flaggedCount;
    } else {
      message = await buildFirstNightMessage(org.id, org.name, agentName);
      pendingDigest = { threadIds: [], sentAt: now.toISOString() };
    }

    const bindings = await listOperatorBindings(org.id);
    const idempotencyKey = digestNotificationIdempotencyKey(org.id, pendingDigest.sentAt);
    for (const member of bindings) {
      const result = await notifyOperator(org.id, member, message, { pendingDigest }, { idempotencyKey });
      if (result) {
        logger.info(
          { organizationId: org.id, chatId: result.chatId, flagged: flaggedCount, firstBriefing: firstBriefingPending },
          '[Digest] Sent digest',
        );
      }
    }

    await finalizeDigestSend(org.id, now, firstBriefingPending);
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
