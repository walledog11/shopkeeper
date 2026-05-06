import { db } from '@clerk/db';
import { loadGatewayEnv } from '../config/load-env.js';
import { generateThreadIntelligence } from '../message-handlers/intelligence.js';

loadGatewayEnv();

// Patterns produced by the OLD summarizer prompt when given sparse / unclear
// inbound messages. Kept here (not in the runtime UI) because this is a
// one-shot data migration — false positives just re-summarize a healthy row.
const BAD_SUMMARY_PATTERNS = [
  /^i (don'?t|do not) have/i,
  /^i (can'?t|cannot|am unable)/i,
  /^i'?m unable/i,
  /no (customer )?support thread/i,
  /could you (please )?(share|provide|send)/i,
  /please (share|provide|send) (the|more|details)/i,
];

const CONCURRENCY = 3;
const BATCH_PAUSE_MS = 500;

interface Args {
  dryRun: boolean;
  orgId: string | null;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const orgArg = args.find(a => a.startsWith('--org-id='));
  const orgId = orgArg ? orgArg.split('=', 2)[1] : null;
  return { dryRun, orgId };
}

function isBadSummary(s: string | null): boolean {
  if (!s) return false;
  const trimmed = s.trim();
  if (trimmed.length < 6) return true;
  return BAD_SUMMARY_PATTERNS.some(rx => rx.test(trimmed));
}

async function main() {
  const { dryRun, orgId } = parseArgs();
  console.log(`Rebuild bad summaries${dryRun ? ' [DRY RUN]' : ''}${orgId ? ` org=${orgId}` : ''}`);

  const candidates = await db.thread.findMany({
    where: {
      aiSummary: { not: null },
      ...(orgId ? { organizationId: orgId } : {}),
    },
    select: { id: true, aiSummary: true, organizationId: true },
  });
  const targets = candidates.filter(t => isBadSummary(t.aiSummary));
  console.log(`Scanned ${candidates.length} threads. Bad summaries: ${targets.length}.`);

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
      batch.map(t => generateThreadIntelligence(t.id, { triggerPlaybooks: false })),
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

  console.log(`Done. Re-summarized ${succeeded}. Failed ${failed}.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
