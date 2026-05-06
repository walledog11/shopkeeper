/**
 * Backfill Action Plans for open tickets that have no cached plan.
 *
 * Finds every OPEN, non-filtered thread where cachedPlanMessageId doesn't
 * match the last customer message, then calls plan-internal for each one.
 *
 * Usage (from apps/gateway/):
 *   tsx src/scripts/backfill-plans.ts
 *
 * Env vars required (same as gateway):
 *   DATABASE_URL, INTERNAL_API_SECRET, DASHBOARD_URL or DASHBOARD_INTERNAL_URL
 */

import { loadGatewayEnv } from '../config/load-env.js';
loadGatewayEnv();

import { PrismaClient } from '@prisma/client';
import { getGatewayDashboardUrl } from '../config/env.js';

const db = new PrismaClient();

function getInternalSecret(): string {
  const s = process.env.INTERNAL_API_SECRET;
  if (!s) throw new Error('Missing INTERNAL_API_SECRET');
  return s;
}

const CONCURRENCY = 3;
const DELAY_MS = 500;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generatePlan(orgId: string, threadId: string): Promise<boolean> {
  const res = await fetch(`${getGatewayDashboardUrl()}/api/agent/plan-internal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': getInternalSecret(),
    },
    body: JSON.stringify({ orgId, threadId }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`  ✗ [${threadId}] plan-internal returned ${res.status}: ${body.slice(0, 120)}`);
    return false;
  }

  const data = await res.json() as { plan?: { steps?: unknown[] } };
  const stepCount = data.plan?.steps?.length ?? 0;
  if (stepCount === 0) {
    console.log(`  – [${threadId}] plan generated but has 0 steps (skipped)`);
    return false;
  }
  console.log(`  ✓ [${threadId}] plan generated (${stepCount} steps)`);
  return true;
}

async function main() {
  const dashboardUrl = getGatewayDashboardUrl();
  console.log(`Dashboard: ${dashboardUrl}`);

  // Fetch all open, non-filtered, non-archived threads with their last customer message
  const threads = await db.thread.findMany({
    where: {
      status: 'open',
      filterStatus: { not: 'filtered' },
      archivedAt: null,
      deletedAt: null,
      channelType: { notIn: ['sms_agent', 'dashboard_agent'] },
    },
    select: {
      id: true,
      organizationId: true,
      cachedPlanMessageId: true,
      messages: {
        where: { senderType: 'customer' },
        orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: { id: true },
      },
    },
  });

  // Filter to those missing a current plan
  const needsPlan = threads.filter(t => {
    const lastMsgId = t.messages[0]?.id ?? null;
    if (!lastMsgId) return false; // no customer message at all
    return t.cachedPlanMessageId !== lastMsgId;
  });

  console.log(`Found ${threads.length} open tickets — ${needsPlan.length} need a plan.\n`);

  if (needsPlan.length === 0) {
    console.log('Nothing to do.');
    await db.$disconnect();
    return;
  }

  let done = 0;
  let success = 0;

  // Process in batches of CONCURRENCY
  for (let i = 0; i < needsPlan.length; i += CONCURRENCY) {
    const batch = needsPlan.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(t => generatePlan(t.organizationId, t.id).catch(err => {
        console.error(`  ✗ [${t.id}] error: ${(err as Error).message}`);
        return false;
      }))
    );
    success += results.filter(Boolean).length;
    done += batch.length;
    console.log(`Progress: ${done}/${needsPlan.length}`);
    if (i + CONCURRENCY < needsPlan.length) await sleep(DELAY_MS);
  }

  console.log(`\nDone. ${success}/${needsPlan.length} plans generated successfully.`);
  await db.$disconnect();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
