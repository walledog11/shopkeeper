import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { db } from '@shopkeeper/db';
import logger from '../../logger.js';
import { listOperatorBindings, notifyOperator, type OperatorBinding, type OperatorNotifyResult } from '../../operator-notify.js';
import { digestNotificationIdempotencyKey } from '../../operator-notify-idempotency.js';
import { finalizeDigestSend } from '../digest-briefing/index.js';
import { buildOrgDigest } from './build.js';
import { buildDigestOpener, digestWindowKey, shouldSendDigest } from './schedule.js';
import type { OrgDigest, SendScheduledDigestsOptions } from './types.js';
import { claimDigestWindow, releaseDigestWindow } from './window-claim.js';

/** Deliver the briefing as a single operator-channel message. */
export async function deliverOrgDigest(
  organizationId: string,
  member: OperatorBinding,
  digest: OrgDigest,
  idempotencyKey?: string,
): Promise<OperatorNotifyResult | null> {
  return notifyOperator(
    organizationId,
    member,
    digest.message,
    { pendingDigest: digest.pendingDigest },
    idempotencyKey ? { idempotencyKey } : {},
  );
}

// The welcome briefing sent when the first scheduled digest lands on an empty
// inbox: introduce the morning ritual and show what the agent has already
// learned from the merchant's Shopify store instead of skipping the send.
async function buildFirstNightMessage(
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

export async function sendScheduledDigests(
  options: SendScheduledDigestsOptions = {},
): Promise<void> {
  const now = new Date();
  const nowMs = now.getTime();
  const orgs = await db.organization.findMany({
    where: {
      ...(options.organizationIds === undefined
        ? {}
        : { id: { in: [...options.organizationIds] } }),
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
