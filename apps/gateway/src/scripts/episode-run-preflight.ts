import { loadGatewayEnv } from '../config/load-env.js';

loadGatewayEnv();

// THROWAWAY — preflight for the live storefront-chat episode run (item F of the
// conversation-episodes plan). Prints the state the run depends on, so a missing
// binding or a disabled widget is found before the dev store is open rather than
// halfway through a session.
//
// Reports, per org that has a Shopify integration:
//   · the shopify_chat integration, its lifecycle status, and whether the widget
//     is actually enabled (metadata.storefrontChat.enabled) — a non-active row
//     disappears from the dashboard silently, which reads as "never connected"
//   · operator bindings, because the run's notification half arrives on a phone
//   · the approval-shaped settings that decide whether a card appears at all
//   · open shopify_chat threads with their conversational clock, which is what
//     backdate-episode-clock.ts moves
//
//   railway run bash -lc 'NODE_ENV=production npx tsx apps/gateway/src/scripts/episode-run-preflight.ts'
//
// Optional: ORG_ID to narrow to one org.

const HOURS_24_MS = 24 * 60 * 60 * 1000;

function hoursAgo(then: Date, now: Date): string {
  return `${((now.getTime() - then.getTime()) / 3_600_000).toFixed(1)}h ago`;
}

async function main() {
  const { db, SenderType } = await import('@shopkeeper/db');
  const now = new Date();
  const onlyOrg = process.env.ORG_ID ?? undefined;

  const integrations = await db.integration.findMany({
    where: {
      platform: { in: ['shopify', 'shopify_chat'] },
      ...(onlyOrg ? { organizationId: onlyOrg } : {}),
    },
    select: {
      id: true,
      organizationId: true,
      platform: true,
      externalAccountId: true,
      lifecycleStatus: true,
      metadata: true,
      organization: { select: { name: true, settings: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (integrations.length === 0) {
    console.log('No Shopify integrations found — nothing to run against.');
    await db.$disconnect();
    return;
  }

  const orgIds = [...new Set(integrations.map((i) => i.organizationId))];

  for (const orgId of orgIds) {
    const rows = integrations.filter((i) => i.organizationId === orgId);
    const org = rows[0].organization;
    console.log(`\n═══ ${org?.name ?? '?'}  ${orgId}`);

    for (const row of rows) {
      // The merchant's widget switch lives on the `shopify` row's metadata —
      // there is no `shopify_chat` integration. `shopify_chat` is a thread
      // channelType only, so looking for an integration row by that name finds
      // nothing and reads as "not set up".
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const sf = (meta.storefrontChat ?? {}) as Record<string, unknown>;
      const widget = row.platform === 'shopify'
        ? `  widget=${sf.enabled === true ? 'ENABLED' : 'off'}`
        : '';
      console.log(
        `  ${row.platform.padEnd(14)} ${row.externalAccountId.padEnd(34)} ` +
        `lifecycle=${row.lifecycleStatus}${widget}`,
      );
    }

    // The run's notification half. No binding means the card has nowhere to go
    // and Phase 1 cannot be observed at all.
    const [tg, im] = await Promise.all([
      db.orgMemberTelegramChat.findMany({
        where: { orgMember: { organizationId: orgId } },
        select: { chatId: true },
      }),
      db.orgMemberImessageBinding.findMany({
        where: { orgMember: { organizationId: orgId } },
        select: { senderId: true },
      }),
    ]);
    console.log(`  operator: telegram=${tg.length} imessage=${im.length}`);

    const settings = (org?.settings ?? {}) as Record<string, unknown>;
    console.log(
      `  settings: agentName=${JSON.stringify(settings.agentName ?? null)} ` +
      `autonomyTier=${JSON.stringify(settings.autonomyTier ?? null)} ` +
      `autoExecuteMode=${JSON.stringify(settings.autoExecuteMode ?? null)} ` +
      `requireApprovalForActions=${JSON.stringify(settings.requireApprovalForActions ?? null)}`,
    );

    const threads = await db.thread.findMany({
      where: { organizationId: orgId, channelType: 'shopify_chat', status: 'open', deletedAt: null },
      select: { id: true, subject: true, lastMessageAt: true, cachedPlan: true },
      orderBy: { lastMessageAt: 'desc' },
      take: 10,
    });
    console.log(`  open shopify_chat threads: ${threads.length === 0 ? 'none' : threads.length}`);
    for (const t of threads) {
      // The same clock resolve-inbound-episode.ts reads: newest non-note,
      // non-deleted message. Notes are excluded so an agent transcript or an
      // order webhook cannot make a quiet thread look alive.
      const latest = await db.message.findFirst({
        where: { threadId: t.id, senderType: { not: SenderType.note }, deletedAt: null },
        orderBy: { sentAt: 'desc' },
        select: { sentAt: true },
      });
      const clock = latest?.sentAt ?? t.lastMessageAt;
      const idleMs = now.getTime() - clock.getTime();
      console.log(
        `    ${t.id}  clock=${clock.toISOString()} (${hoursAgo(clock, now)}) ` +
        `${idleMs >= HOURS_24_MS ? 'WOULD ROLL' : 'would continue'}  ` +
        `cachedPlan=${t.cachedPlan == null ? 'none' : 'present'}  ${JSON.stringify(t.subject)}`,
      );
    }

    // The closed side of a rollover. An episode that expired correctly carries
    // closedReason = episode_rollover and a cleared cachedPlan; a thread the
    // merchant closed by hand carries something else, and the difference is the
    // whole point of using the idle boundary rather than the close button.
    const closed = await db.thread.findMany({
      where: { organizationId: orgId, channelType: 'shopify_chat', status: 'closed', deletedAt: null },
      select: { id: true, closedReason: true, cachedPlan: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });
    if (closed.length > 0) {
      console.log('  recently closed shopify_chat threads:');
      for (const t of closed) {
        console.log(
          `    ${t.id}  closedReason=${t.closedReason ?? '-'}  ` +
          `cachedPlan=${t.cachedPlan == null ? 'cleared' : 'PRESENT'}  ${t.updatedAt.toISOString()}`,
        );
      }
    }

    // One row per episode the browser session has held. endedAt marks the
    // expired one, and verification resolves through these rows rather than the
    // session's current threadId.
    const episodes = await db.storefrontChatSessionEpisode.findMany({
      where: { organizationId: orgId },
      select: { sessionId: true, threadId: true, startedAt: true, endedAt: true },
      orderBy: { startedAt: 'desc' },
      take: 6,
    });
    if (episodes.length > 0) {
      console.log('  session episodes (newest first):');
      for (const e of episodes) {
        console.log(
          `    session=${e.sessionId.slice(0, 8)} thread=${e.threadId.slice(0, 8)} ` +
          `started=${e.startedAt.toISOString()} ended=${e.endedAt?.toISOString() ?? '—'}`,
        );
      }
    }
  }

  await db.$disconnect();
}

main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
