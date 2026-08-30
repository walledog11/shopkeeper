import { loadGatewayEnv } from '../config/load-env.js';

loadGatewayEnv();

// What agent turns actually cost, and why they stopped. Reads `agent_turn_usage`
// — the record `railway logs` cannot be relied on for, since the log line is
// only readable while the platform is still holding it.
//
//   railway run npx tsx apps/gateway/src/scripts/inspect-turn-usage.ts
//   ORG_ID=<uuid> HOURS=48 PURPOSE=operator_turn npx tsx ...
//
// The two budget columns are the point. `first` is the weighted total after the
// first model call, `total` after the last; TOKEN_BUDGET (20,000) is compared
// against `total`. A turn that stops with `first` already near the ceiling is a
// cache-temperature problem; one where `first` is small and `total` is not is a
// loop.
//
// Read `1h-write` against `cache-read`, never on its own. The 1h block is the
// stable prompt prefix (`buildSplitCachedSystemPrompt`), and `budgetTokens`
// excludes its write entirely while counting reads at 0.1 — so the WARM turn is
// the one showing `1h-write 0` beside a large `cache-read`, and it scores higher
// than the cold turn that wrote the block. That inversion is the accounting, not
// a cost: a hit is far cheaper in dollars. A rewrite means the prefix expired
// (>1h) or changed (a deploy), and a changed prefix writes a different number of
// tokens than the one before it. The real fault this column catches is a write
// with no 1h attribution AND no reads at all.

function arg(name: string, fallback?: string): string | undefined {
  return process.env[name]?.trim() || fallback;
}

async function main() {
  const { db } = await import('@shopkeeper/db');
  const { TOKEN_BUDGET } = await import('@shopkeeper/agent/run-policy');

  const hours = Number(arg('HOURS', '24'));
  const since = new Date(Date.now() - hours * 3_600_000);
  const orgId = arg('ORG_ID');
  const purpose = arg('PURPOSE');

  const rows = await db.agentTurnUsage.findMany({
    where: {
      createdAt: { gte: since },
      ...(orgId ? { organizationId: orgId } : {}),
      ...(purpose ? { purpose } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Number(arg('LIMIT', '50')),
  });

  if (rows.length === 0) {
    console.log(`No turns in the last ${hours}h.`);
    await db.$disconnect();
    return;
  }

  console.log(
    `${'when'.padEnd(21)} ${'purpose'.padEnd(13)} ${'outcome'.padEnd(14)} `
    + `${'calls'.padStart(5)} ${'first'.padStart(7)} ${'total'.padStart(7)} `
    + `${'%budget'.padStart(7)} ${'1h-write'.padStart(9)} ${'cache-read'.padStart(10)}`,
  );
  for (const row of rows) {
    const pct = Math.round((row.budgetTokens / TOKEN_BUDGET) * 100);
    console.log(
      `${row.createdAt.toISOString().slice(0, 19).padEnd(21)} `
      + `${row.purpose.padEnd(13)} ${row.outcome.padEnd(14)} `
      + `${String(row.modelCalls).padStart(5)} `
      + `${String(row.firstCallBudgetTokens).padStart(7)} `
      + `${String(row.budgetTokens).padStart(7)} `
      + `${`${pct}%`.padStart(7)} `
      + `${String(row.cacheCreation1hInputTokens).padStart(9)} `
      + `${String(row.cacheReadInputTokens).padStart(10)}`,
    );
  }

  const stopped = rows.filter((row) => row.outcome === 'token_budget');
  console.log(`\n${rows.length} turns, ${stopped.length} stopped on token_budget.`);
  // A write with no 1h attribution is only a fault when nothing was read either:
  // that is a turn that neither wrote nor hit the stable prefix, so the whole
  // write counted at 1.25x. The same two columns on a turn that DID read are an
  // ordinary cache hit — see the header note before reading anything into them.
  const unattributedWrites = rows.filter(
    (row) => row.cacheCreationInputTokens > 0
      && row.cacheCreation1hInputTokens === 0
      && row.cacheReadInputTokens === 0,
  );
  if (unattributedWrites.length > 0) {
    console.log(
      `${unattributedWrites.length} turn(s) wrote cache with no 1h block and no reads — `
      + 'the stable prefix is missing, and those paid 1.25x on the whole write.',
    );
  }

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
