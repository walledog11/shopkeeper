/**
 * Backfill action plans for open tickets that have no cached plan.
 *
 * Finds every OPEN thread whose latest non-note message is still from the
 * customer and whose cachedPlanMessageId doesn't match it, then runs
 * generateThreadPlan() in-process (same path as the worker).
 *
 * Usage (from apps/gateway/):
 *   tsx src/scripts/backfill-plans.ts
 *   tsx src/scripts/backfill-plans.ts --dry-run
 *   tsx src/scripts/backfill-plans.ts --genuine-only
 *
 * Env vars required (same as gateway worker):
 *   DATABASE_URL, ANTHROPIC_API_KEY, and other gateway agent runtime vars
 */

import { db, SenderType } from '@shopkeeper/db';
import { clearThreadPlanCache } from '@shopkeeper/agent/plan-execution';
import { loadGatewayEnv } from '../config/load-env.js';
import { generateThreadPlan } from '../message-handlers/generate-thread-plan.js';

loadGatewayEnv();

const CONCURRENCY = 3;
const DELAY_MS = 500;

interface Args {
  dryRun: boolean;
  genuineOnly: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    genuineOnly: args.includes('--genuine-only'),
  };
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generatePlan(orgId: string, threadId: string, dryRun: boolean): Promise<boolean> {
  if (dryRun) {
    console.log(`  – [${threadId}] would generate plan`);
    return true;
  }

  try {
    const { plan } = await generateThreadPlan(orgId, threadId, false);
    const stepCount = plan?.steps?.length ?? 0;
    if (stepCount === 0) {
      console.log(`  – [${threadId}] plan generated but has 0 steps (skipped)`);
      return false;
    }
    console.log(`  ✓ [${threadId}] plan generated (${stepCount} steps)`);
    return true;
  } catch (err) {
    console.error(`  ✗ [${threadId}] error: ${(err as Error).message}`);
    return false;
  }
}

async function main() {
  const { dryRun, genuineOnly } = parseArgs();
  console.log(`Backfill plans${dryRun ? ' [DRY RUN]' : ''}${genuineOnly ? ' [genuine-only]' : ''}`);

  const threads = await db.thread.findMany({
    where: genuineOnly
      ? {
          status: 'open',
          filterStatus: 'genuine',
          archivedAt: null,
          deletedAt: null,
        }
      : {
          status: 'open',
          filterStatus: { notIn: ['filtered', 'questionable'] },
          archivedAt: null,
          deletedAt: null,
          channelType: { notIn: ['sms_agent', 'dashboard_agent'] },
        },
    select: {
      id: true,
      organizationId: true,
      cachedPlanMessageId: true,
      cachedPlan: true,
      messages: {
        where: { deletedAt: null, senderType: { not: SenderType.note } },
        orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: { id: true, senderType: true },
      },
    },
  });

  const needsPlan = threads.filter(t => {
    const lastConversation = t.messages[0];
    if (!lastConversation || lastConversation.senderType !== SenderType.customer) {
      if (!dryRun && (t.cachedPlan || t.cachedPlanMessageId)) {
        void clearThreadPlanCache({ orgId: t.organizationId, threadId: t.id });
      }
      return false;
    }
    return t.cachedPlanMessageId !== lastConversation.id;
  });

  console.log(`Found ${threads.length} open tickets — ${needsPlan.length} need a plan.\n`);

  if (needsPlan.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  let done = 0;
  let success = 0;

  for (let i = 0; i < needsPlan.length; i += CONCURRENCY) {
    const batch = needsPlan.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(t => generatePlan(t.organizationId, t.id, dryRun)),
    );
    success += results.filter(Boolean).length;
    done += batch.length;
    console.log(`Progress: ${done}/${needsPlan.length}`);
    if (i + CONCURRENCY < needsPlan.length) await sleep(DELAY_MS);
  }

  console.log(`\nDone. ${success}/${needsPlan.length} plans generated successfully.`);
}

main()
  .catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
