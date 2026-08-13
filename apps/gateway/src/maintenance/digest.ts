import { getSupportStats, type SupportStatsSummary } from '@shopkeeper/agent/support-stats';
import { canonicalInboxThreadWhere } from '@shopkeeper/agent/inbox-filter';
import { parseClassifierSignals } from '@shopkeeper/agent/classifier-signals';
import { classifyHomePlan } from '@shopkeeper/agent/plan-preview';
import { getCurrentPlanForThread } from '@shopkeeper/agent/plan-cache-shape';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { SENDER_TYPE } from '@shopkeeper/agent/thread-constants';
import { db, ThreadFilterStatus, type DbThreadFilterStatus } from '@shopkeeper/db';
import { JOB, QUEUE } from '../constants.js';
import logger from '../logger.js';
import { listOperatorBindings, notifyOperator, type OperatorBinding, type OperatorNotifyResult } from '../operator-notify.js';
import type { PendingDigest } from '../operator-context.js';
import { digestNotificationIdempotencyKey } from '../operator-notify-idempotency.js';
import {
  capitalize,
  countWord,
  deriveThreadLifecycleState,
  formatBlockedTicketLine,
  formatHandledSection,
  formatNeedsYouAsk,
  formatNeedsYouProse,
  humanizeReportedSummary,
  type BriefingItem,
  loadHandledRollup,
  loadWaitingOnYouItems,
  finalizeDigestSend,
  redactBriefingContacts,
  resolveHandledWindowStart,
  truncateBriefingText,
  type ThreadLifecycleState,
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
// Wide enough for the classifier's one-sentence summary to land whole. At 90 a
// normal summary lost its last clause ("…floats a newsletter tie-up, while also
// mentioning…"), and a merchant who cannot tell from the line has to ask, which
// is the round trip the briefing exists to save. Still capped, because this block
// takes up to DIGEST_QUESTIONABLE_LIMIT items where a handoff takes two.
const DIGEST_SUMMARY_TRUNC = 140;
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
  channelType: string;
  filterStatus: DbThreadFilterStatus;
  filterDecidedAt: Date | null;
  aiTitle: string | null;
  aiSummary: string | null;
  filterReason: string | null;
  customer: { name: string | null };
  // Lifecycle-state inputs. `messages` is the newest non-note message only, in
  // the same descending shape `loadStaleThreadWaitingItems` passes to
  // `getCurrentPlanForThread` — that helper reads the last conversational
  // sender itself, so the two must agree on what "last message" means.
  cachedPlan: unknown;
  cachedPlanMessageId: string | null;
  // `contentText` is here for the handoff section, which quotes the customer
  // rather than the classifier's paraphrase. Reading it off this row is only
  // sound because `blocked_no_plan` is defined by the customer holding the last
  // word, so for those threads this message is theirs.
  messages: Array<{ id: string; senderType: string; sentAt: Date; contentText: string | null }>;
  classifierSignals: unknown;
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

/**
 * `filedSince` scopes the spam count to work done since the last briefing.
 * Nothing ever closes a filtered thread — it is created open and sits there
 * until `purgeFilteredThreads` hard-deletes it a week later — so counting every
 * filtered thread still open is a running total, not a report. Said with "I
 * filed", a running total claims credit every morning for the same spam, and
 * ratchets up all week.
 */
export function bucketDigestThreads(
  threads: DigestThreadRow[],
  now: Date,
  filedSince: Date,
): DigestBuckets {
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
      // An undecided timestamp is not evidence of recent work, so it does not
      // get claimed as any.
      if (t.filterDecidedAt && t.filterDecidedAt >= filedSince) filteredCount++;
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
//
// Also null when the week has no story the message hasn't already told. With
// nothing resolved and every ticket that came in still open, "five tickets in"
// is the same five tickets the line above just called open — one set described
// twice, which reads as two numbers that need reconciling. A resolution figure
// or volume above the open count is new information; neither, and the line is
// restating.
export function formatWeeklySummaryLine(
  stats: SupportStatsSummary,
  openCount: number,
): string | null {
  if (stats.tickets.total < WEEKLY_SUMMARY_MIN_TICKETS) return null;
  if (stats.resolution.closedCount === 0 && stats.tickets.total <= openCount) return null;

  // Ticket counts spell out here too. "You've got five open tickets" three
  // lines above "5 tickets in" is the same noun rendered two ways in one
  // message; the window length and the durations stay in digits.
  const parts = [`${countWord(stats.tickets.total)} tickets in`];
  const topTag = stats.tickets.byTag[0];
  // `General` is the classifier's catch-all, not a topic worth naming.
  if (topTag && topTag.count > 1 && topTag.tag !== 'General') {
    parts.push(`mostly ${topTag.tag}`);
  }
  if (stats.resolution.closedCount > 0) {
    parts.push(
      stats.resolution.avgMinutes != null
        ? `${countWord(stats.resolution.closedCount)} resolved in ${formatDurationShort(stats.resolution.avgMinutes)} on average`
        : `${countWord(stats.resolution.closedCount)} resolved`,
    );
  }
  return `Last 7 days: ${parts.join(', ')}.`;
}

export interface DigestMessageExtras {
  /** Greeting in the agent's own voice; the scheduled worker supplies it. */
  opener?: string | null;
  /** Everything that needs the merchant, in the order it is numbered. */
  needsYou?: BriefingItem[];
  /** What the agent did without them, as a sentence for the closing tail. */
  handledSection?: string | null;
  /** Threads sitting quietly, as a sentence. Never a section: nothing is owed. */
  quietSentence?: string | null;
  garnishLines?: string[];
}

/**
 * The customer has not asked for anything yet — a bare "hello" or "yo" on the
 * storefront, a stray "Test" by email. Getting them to say what they need is the
 * agent's job, not a decision the merchant owes, so these threads are reported in
 * no section: not as a handoff, not as answered-and-quiet, not in the roll-up.
 *
 * Deliberately the classifier's judgment rather than a rule over the text. Length
 * cannot separate "sweater ripped" from "yo", and hiding a two-word complaint is
 * the one failure here that costs a real customer.
 *
 * Only the reporting sections honor it. A parked plan stays in the approval list
 * whatever prompted it, because "yes" still approves it from the operator ledger
 * and a briefing that hides what "yes" would do is worse than a noisy one.
 */
function hasNoRequest(thread: DigestThreadRow): boolean {
  return parseClassifierSignals(thread.classifierSignals)?.intents.no_request === true;
}


// Slicing at a character count lands mid-word, and a raw address here becomes a
// tappable mailto in the middle of the merchant's morning text.
function flaggedBlurb(thread: DigestThreadRow): string {
  const blurb = (thread.aiSummary ?? thread.filterReason ?? '').trim();
  return truncateBriefingText(redactBriefingContacts(blurb), DIGEST_SUMMARY_TRUNC);
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

/**
 * One message, one list, one ask.
 *
 * This used to print up to four separately-headed sections, each named after an
 * internal lifecycle state, two of them numbered from 1, and three different
 * closing questions. A merchant with seven things to do could not tell which
 * number belonged to which list or which question they were answering. The
 * sections were organised around what the agent knew about a thread; the
 * merchant only ever has one job, which is to clear the things that need them.
 *
 * So: everything needing the merchant is one numbered list, grouped only into
 * "a yes clears this" and "this needs a sentence". Everything needing nothing
 * collapses into the closing tail — it is news, not work, and it goes last.
 */
export function formatDigestMessage(
  buckets: DigestBuckets,
  weeklyLine?: string | null,
  extras?: DigestMessageExtras,
): string {
  const { filteredCount } = buckets;
  const items = extras?.needsYou ?? [];
  const list = formatNeedsYouProse(items);
  const ask = formatNeedsYouAsk(items);
  const lines: string[] = [];

  // The opener and the count are one sentence: "Morning, Ada here. Seven things
  // need you." Two lines for a greeting and a number is a paragraph of throat
  // clearing above the only thing worth reading.
  // The group leads carry the counts now ("Two are ready to go the moment you
  // say"), so a separate "Seven things need you" above them counts the same work
  // twice before the merchant has read any of it.
  const opener = extras?.opener?.trim();
  if (opener) lines.push(opener);
  if (list) {
    if (lines.length > 0) lines.push('');
    lines.push(list);
  }
  if (ask) lines.push('', ask);

  // The tail: what happened without them, and what is sitting quietly. Each is a
  // sentence in one paragraph rather than a section, because none of it is a
  // decision and a heading implies one.
  const tail: string[] = [];
  if (extras?.handledSection) tail.push(extras.handledSection);
  if (filteredCount > 0) tail.push(spamSentence(filteredCount));
  if (extras?.quietSentence) tail.push(extras.quietSentence);
  if (tail.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(tail.join(' '));
  }

  for (const line of extras?.garnishLines ?? []) {
    lines.push('', line);
  }
  if (items.length === 0 && weeklyLine) {
    lines.push('', weeklyLine);
  }
  if (items.length === 0) {
    if (lines.length > 0) lines.push('');
    lines.push(`I'll shout if anything comes in.`);
  }

  return lines.join('\n');
}

/** Deliver the briefing as a single operator-channel message. */
export async function deliverOrgDigest(
  organizationId: string,
  member: OperatorBinding,
  digest: OrgDigest,
  idempotencyKey: string,
): Promise<OperatorNotifyResult | null> {
  return notifyOperator(
    organizationId,
    member,
    digest.message,
    { pendingDigest: digest.pendingDigest },
    { idempotencyKey },
  );
}

export interface OrgDigest {
  message: string;
  pendingDigest: PendingDigest;
  flaggedCount: number;
  /**
   * One lifecycle state per open non-filtered thread. Carried, not yet rendered
   * — the message is unchanged until the sections that read these land.
   */
  lifecycleStates: Array<{ threadId: string; state: ThreadLifecycleState }>;
}

/**
 * Build the support-inbox digest for one org from its open threads, ready to
 * send and to seed `OperatorContext.pendingDigest` for follow-up commands.
 * Returns null when the org has no open tickets and nothing waiting on the
 * operator. Scheduled sends pass `includeEmptyInbox: false` so a quiet inbox
 * falls through to the first-night welcome or is skipped; on-demand `SUMMARY`
 * keeps the default and still reports what was handled since the last briefing.
 */
export async function buildOrgDigest(
  organizationId: string,
  now: Date,
  settings: Record<string, unknown> = {},
  options: { opener?: string | null; includeEmptyInbox?: boolean } = {},
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
        channelType: true,
        filterStatus: true,
        filterDecidedAt: true,
        aiTitle: true,
        aiSummary: true,
        filterReason: true,
        customer: { select: { name: true } },
        cachedPlan: true,
        cachedPlanMessageId: true,
        classifierSignals: true,
        messages: {
          where: { deletedAt: null, senderType: { not: SENDER_TYPE.NOTE } },
          orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { id: true, senderType: true, sentAt: true, contentText: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    getSupportStats(organizationId, 7).catch(() => null),
    loadHandledRollup(organizationId, since),
    loadWaitingOnYouItems(organizationId, now),
    loadDigestShopifyGarnish(organizationId, settings, now),
  ]);

  const handledSection = formatHandledSection(handledRollup);
  const includeEmptyInbox = options.includeEmptyInbox ?? true;

  if (openThreads.length === 0 && waitingItems.length === 0 && !includeEmptyInbox) return null;

  const buckets = bucketDigestThreads(openThreads, now, since);
  const waitingThreadIds = new Set(waitingItems.map((item) => item.threadId));

  // Filtered threads are reported as a count and never named, so they get no
  // state. `waitingItems` is the parked-plan set: it already merges the operator
  // ledger with the stale-plan scan, which is the only place a parked plan is
  // visible from here.
  const resolvedSettings = resolveAgentSettings(settings);
  const lifecycleStates = [...buckets.genuine, ...buckets.questionable].map((thread) => {
    const plan = getCurrentPlanForThread(thread, thread.messages);
    return {
      threadId: thread.id,
      state: deriveThreadLifecycleState({
        status: 'open',
        planKind: plan
          ? classifyHomePlan(plan, resolvedSettings, { filterStatus: thread.filterStatus }).kind
          : null,
        parkedPlan: waitingThreadIds.has(thread.id),
        lastConversationalSender: thread.messages[0]?.senderType ?? null,
      }),
    };
  });

  // Questionable threads are named in the flagged block and nowhere else, so
  // only the genuine ones are sorted into sections here. What is left in
  // "Also open" after the split is `awaiting_approval` threads whose plan is not
  // yet stale enough for the waiting list — the merchant already got a card for
  // those. `empty_thread` matches nothing and is never rendered: a thread whose
  // only rows are Shopify webhook notes has nothing to tell the merchant, and
  // P4 stops creating them.
  const stateByThreadId = new Map(lifecycleStates.map((entry) => [entry.threadId, entry.state]));
  const unlisted = buckets.genuine.filter((thread) => (
    !waitingThreadIds.has(thread.id) && !hasNoRequest(thread)
  ));
  const threadsInState = (state: ThreadLifecycleState) => (
    unlisted.filter((thread) => stateByThreadId.get(thread.id) === state)
  );
  // The one list, in the order it is numbered. Approvals first because a yes
  // clears them; then the threads with no plan; then the classifier's maybes,
  // which are the same shape of work — someone has to look and decide.
  const flagged = buckets.questionable.slice(0, DIGEST_QUESTIONABLE_LIMIT);
  const needsYou: BriefingItem[] = [
    ...waitingItems.map((item): BriefingItem => ({
      threadId: item.threadId,
      kind: 'approval',
      ...(item.planId ? { planId: item.planId } : {}),
      line: item.line,
    })),
    ...threadsInState('blocked_no_plan').map((thread): BriefingItem => ({
      threadId: thread.id,
      kind: 'decision',
      line: formatBlockedTicketLine({
        ...thread,
        pendingMessage: thread.messages[0]?.contentText ?? null,
      }),
    })),
    ...flagged.map((thread): BriefingItem => {
      const name = thread.customer.name ?? 'Someone new';
      const blurb = flaggedBlurb(thread);
      return {
        threadId: thread.id,
        kind: 'flagged',
        // No per-item "Real customer?": the group lead already says these are
        // the ones the agent is unsure about, and repeating the question on
        // every line is the tell that a template wrote it.
        line: blurb
          ? endSentence(humanizeReportedSummary(name, blurb) ?? `${name} wrote in. ${blurb}`)
          : `${name} wrote in, and I can't tell whether they're a customer.`,
      };
    }),
  ];

  // Sitting quietly: answered and gone silent, or planned so recently the
  // merchant already has the card. Neither is a decision, so neither gets a line
  // of its own — they are one clause in the tail or nothing at all.
  const quietCount = threadsInState('awaiting_customer').length
    + threadsInState('awaiting_approval').length;
  const quietSentence = quietCount > 0
    ? `${capitalize(countWord(quietCount))} ${quietCount === 1 ? 'other is' : 'others are'} ticking along without me.`
    : null;

  const weeklyLine = needsYou.length > 0
    ? null
    : weeklyStats
      ? formatWeeklySummaryLine(weeklyStats, buckets.genuine.length)
      : null;

  return {
    message: formatDigestMessage(
      buckets,
      weeklyLine,
      {
        opener: options.opener ?? null,
        needsYou,
        handledSection,
        quietSentence,
        garnishLines,
      },
    ),
    pendingDigest: {
      items: needsYou.map(({ threadId, kind, planId }) => ({ threadId, kind, ...(planId ? { planId } : {}) })),
      // The flagged subset stays in briefing order so anything still reading
      // `threadIds` sees the same tickets, just not the same ordinals.
      threadIds: flagged.map((thread) => thread.id),
      sentAt: now.toISOString(),
    },
    flaggedCount: buckets.questionable.length,
    lifecycleStates,
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
    const windowKey = digestWindowKey(orgSettings, now);

    // One briefing per send window, claimed in Postgres before anything goes
    // out. The hourly job is not the only thing that reaches here inside a
    // window: a BullMQ retry, a stalled-job re-delivery, a second replica, or a
    // dev worker pointed at the same database all arrive with their own `now`,
    // so no timestamp derived from this invocation can tell them apart. The
    // claim is one conditional statement, so exactly one caller wins it and the
    // rest skip instead of texting the merchant a second copy.
    if (!(await claimDigestWindow(org.id, windowKey))) {
      logger.info(
        { organizationId: org.id, digestWindow: windowKey },
        '[Digest] Window already claimed — skipping duplicate send',
      );
      continue;
    }

    let delivered = false;
    try {
      const firstBriefingPending = orgSettings.firstBriefingPending === true;
      const agentName = resolveAgentSettings(org.settings).agentName;
      const digest = await buildOrgDigest(org.id, now, orgSettings, {
        opener: buildDigestOpener(agentName, orgSettings, now, firstBriefingPending),
        includeEmptyInbox: false,
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
        pendingDigest = { items: [], threadIds: [], sentAt: now.toISOString() };
      }

      const bindings = await listOperatorBindings(org.id);
      // Keyed by window, not by `pendingDigest.sentAt`: a millisecond stamp is
      // fresh on every attempt, so the Redis dedupe this key exists for could
      // never fire on the retry it was written to cover.
      const idempotencyKey = digestNotificationIdempotencyKey(org.id, windowKey);
      for (const member of bindings) {
        const result = digest
          ? await deliverOrgDigest(org.id, member, digest, idempotencyKey)
          : await notifyOperator(org.id, member, message, { pendingDigest }, { idempotencyKey });
        if (result) {
          delivered = true;
          logger.info(
            { organizationId: org.id, chatId: result.chatId, flagged: flaggedCount, firstBriefing: firstBriefingPending },
            '[Digest] Sent digest',
          );
        }
      }

      await finalizeDigestSend(org.id, now, firstBriefingPending);
    } finally {
      // Nothing reached the merchant, so the window was not spent. Release it
      // rather than trading a duplicate briefing for a missing one — a retry
      // inside the same hour is then free to try again.
      if (!delivered) await releaseDigestWindow(org.id, windowKey);
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

export const DIGEST_WINDOW_SETTING = 'lastDigestWindow';

/**
 * The send window a moment belongs to, in the merchant's own timezone — local
 * date plus local hour, because `shouldSendDigest` fires on a local hour and
 * every supported frequency puts its sends in distinct hours.
 */
export function digestWindowKey(settings: Record<string, unknown>, now: Date): string {
  const timeZone = resolveTz(settings);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    // Some ICU builds render midnight as hour 24 under hour12: false.
    const hour = ((parseInt(part('hour'), 10) % 24) + 24) % 24;
    return `${part('year')}-${part('month')}-${part('day')}T${String(hour).padStart(2, '0')}`;
  } catch {
    // Invalid timeZone — fall back to UTC, as localHourAndDay does.
    return now.toISOString().slice(0, 13);
  }
}

/**
 * Claim this org's send window. Returns false when another caller already holds
 * it, which is the whole point: the guard has to be a single conditional write
 * that separate processes contend for, since they share only Postgres.
 *
 * A jsonb merge rather than a read-modify-write of `settings` so a concurrent
 * settings update keeps its keys.
 */
async function claimDigestWindow(organizationId: string, windowKey: string): Promise<boolean> {
  const claimed = await db.$executeRaw`
    UPDATE organizations
    SET settings = COALESCE(settings, '{}'::jsonb)
          || jsonb_build_object(${DIGEST_WINDOW_SETTING}::text, ${windowKey}::text)
    WHERE id = ${organizationId}::uuid
      AND COALESCE(settings, '{}'::jsonb)->>${DIGEST_WINDOW_SETTING}::text IS DISTINCT FROM ${windowKey}::text`;
  return claimed > 0;
}

async function releaseDigestWindow(organizationId: string, windowKey: string): Promise<void> {
  await db.$executeRaw`
    UPDATE organizations
    SET settings = COALESCE(settings, '{}'::jsonb) - ${DIGEST_WINDOW_SETTING}::text
    WHERE id = ${organizationId}::uuid
      AND COALESCE(settings, '{}'::jsonb)->>${DIGEST_WINDOW_SETTING}::text = ${windowKey}::text`;
}

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
