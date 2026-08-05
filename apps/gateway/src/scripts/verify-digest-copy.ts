import { loadGatewayEnv } from '../config/load-env.js';

// Load env BEFORE importing anything that constructs the Anthropic/Prisma
// clients at module load — those capture process.env at construction, so the
// db + digest modules are dynamically imported inside main() below.
loadGatewayEnv();

// THROWAWAY — render the scheduled morning briefing for a real org through the
// production path (buildOrgDigest with the scheduled opener) so the new copy can
// be judged on a phone.
//
// Dry run by default: prints the exact message and sends nothing.
//
//   ORG_ID=<org> npx tsx apps/gateway/src/scripts/verify-digest-copy.ts
//
// Add SEND=1 to fan it out to every bound operator channel. The only write is
// `OperatorContext.pendingDigest` (so "open 1" / "spam 1" resolve against the
// digest just received); the `lastSuccessfulDigestAt` cursor is deliberately
// NOT advanced, so the real scheduled digest still behaves normally afterwards.
// No idempotency key is passed, so re-running always re-sends.

async function main() {
  const { db } = await import('@shopkeeper/db');
  const { resolveAgentSettings } = await import('@shopkeeper/agent/settings');
  const { buildOrgDigest, buildDigestOpener } = await import('../maintenance/digest.js');
  const { listOperatorBindings, notifyOperator } = await import('../operator-notify.js');

  const orgId = process.env.ORG_ID?.trim();
  if (!orgId) {
    console.error('Set ORG_ID (run find-operator-org.ts to list bound orgs).');
    process.exit(1);
  }

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, settings: true },
  });
  if (!org) {
    console.error(`No organization ${orgId}.`);
    process.exit(1);
  }

  const now = new Date();
  const settings = (org.settings as Record<string, unknown> | null) ?? {};
  const agentName = resolveAgentSettings(org.settings).agentName;
  const digest = await buildOrgDigest(org.id, now, settings, {
    opener: buildDigestOpener(agentName, settings, now, false),
  });

  if (!digest) {
    console.log(`No digest for ${org.name}: nothing open and nothing handled/waiting.`);
    await db.$disconnect();
    return;
  }

  console.log(`─── ${org.name} · ${agentName} · ${now.toISOString()} ───\n`);
  console.log(digest.message);
  console.log(`\n─── ${digest.message.length} chars · ${digest.flaggedCount} flagged ───`);

  const bindings = await listOperatorBindings(org.id);
  console.log(`\nBound operator channels: ${bindings.map((b) => b.channel).join(', ') || 'none'}`);

  if (process.env.SEND !== '1') {
    console.log('\nDry run. Re-run with SEND=1 to text it.');
    await db.$disconnect();
    return;
  }

  for (const member of bindings) {
    const result = await notifyOperator(
      org.id,
      member,
      digest.message,
      { pendingDigest: digest.pendingDigest },
      { idempotencyKey: null },
    );
    console.log(result ? `Sent via ${result.channel} (${result.chatId})` : `FAILED on ${member.channel}`);
  }

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  const { db } = await import('@shopkeeper/db').catch(() => ({ db: null }));
  await db?.$disconnect().catch(() => {});
  process.exit(1);
});
