import { loadGatewayEnv } from '../config/load-env.js';

// Load env BEFORE importing anything that constructs the Anthropic/Prisma
// clients at module load — those capture process.env at construction, so the
// db + intelligence modules are dynamically imported inside main() below.
loadGatewayEnv();

// One-shot backfill for the Thread.aiTitle column. Threads created before the
// classifier emitted a "title" have a null aiTitle; re-running intelligence
// populates it (and refreshes the summary/tag in the same call).

const CONCURRENCY = 3;
const BATCH_PAUSE_MS = 500;

interface Args {
  dryRun: boolean;
  orgId: string | null;
  openOnly: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const openOnly = args.includes('--open-only');
  const orgArg = args.find(a => a.startsWith('--org-id='));
  const orgId = orgArg ? orgArg.split('=', 2)[1] : null;
  return { dryRun, orgId, openOnly };
}

async function main() {
  const { db } = await import('@shopkeeper/db');
  const { generateThreadIntelligence } = await import('../message-handlers/intelligence.js');

  const { dryRun, orgId, openOnly } = parseArgs();
  console.log(
    `Backfill thread titles${dryRun ? ' [DRY RUN]' : ''}${orgId ? ` org=${orgId}` : ''}${openOnly ? ' open-only' : ''}`,
  );

  const targets = await db.thread.findMany({
    where: {
      aiTitle: null,
      aiSummary: { not: null },
      ...(orgId ? { organizationId: orgId } : {}),
      ...(openOnly ? { status: 'open' } : {}),
    },
    select: { id: true, aiSummary: true },
    orderBy: { lastMessageAt: 'desc' },
  });
  console.log(`Threads missing a title: ${targets.length}.`);

  if (dryRun) {
    for (const t of targets.slice(0, 20)) {
      console.log(`  ${t.id}: ${JSON.stringify(t.aiSummary)}`);
    }
    if (targets.length > 20) console.log(`  ... and ${targets.length - 20} more.`);
    process.exit(0);
  }
  if (targets.length === 0) {
    console.log('Nothing to do.');
    process.exit(0);
  }

  let succeeded = 0;
  let failed = 0;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(t => generateThreadIntelligence(t.id)),
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) succeeded++;
      else failed++;
    }
    console.log(`  ${i + batch.length}/${targets.length} (ok ${succeeded}, failed ${failed})`);
    if (i + CONCURRENCY < targets.length) {
      await new Promise(r => setTimeout(r, BATCH_PAUSE_MS));
    }
  }

  console.log(`Done. Titled ${succeeded}. Failed ${failed}.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
