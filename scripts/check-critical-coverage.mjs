import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const ROOT = process.cwd();
const MIN_LINES = 80;
const MIN_BRANCHES = 70;

const groups = [
  {
    name: 'dashboard security',
    report: 'apps/dashboard/coverage/coverage-summary.json',
    matches: (file) => file.includes('/src/lib/security/'),
  },
  {
    name: 'dashboard billing writes',
    report: 'apps/dashboard/coverage/coverage-summary.json',
    matches: (file) => /\/src\/app\/api\/billing\/(checkout|portal|webhook)\/route\.ts$/.test(file)
      || file.endsWith('/src/lib/billing/write-gate.ts'),
  },
  {
    name: 'gateway billing writes',
    report: 'apps/gateway/coverage/coverage-summary.json',
    matches: (file) => file.endsWith('/src/billing/write-gate.ts'),
  },
  {
    // The token is the only thing standing between an org's SSE stream and any
    // caller who can reach the gateway, and it is minted in one app and verified
    // in the other.
    name: 'dashboard realtime token',
    report: 'apps/dashboard/coverage/coverage-summary.json',
    matches: (file) => file.endsWith('/src/lib/realtime/token.ts')
      || file.endsWith('/src/app/api/realtime/token/route.ts'),
  },
  {
    name: 'gateway realtime subscription',
    report: 'apps/gateway/coverage/coverage-summary.json',
    matches: (file) => file.endsWith('/src/realtime/token.ts')
      || file.endsWith('/src/realtime/sse.ts'),
  },
  {
    // Health is what uptime monitoring reads. A regression that makes /health
    // touch a dependency, or makes deep report ok while a dependency is down,
    // is invisible until an outage is missed.
    name: 'dashboard health endpoints',
    report: 'apps/dashboard/coverage/coverage-summary.json',
    matches: (file) => /\/src\/app\/api\/health(\/deep)?\/route\.ts$/.test(file),
  },
  {
    name: 'dashboard webhook ingress',
    report: 'apps/dashboard/coverage/coverage-summary.json',
    matches: (file) => /\/src\/app\/api\/webhooks\/(clerk|email|meta|tiktok-shop)\/route\.ts$/.test(file),
  },
  {
    // P4-03. The claim/sweep path is the unknown-outcome recovery surface:
    // it decides whether a committed-but-undelivered operator reply is resent
    // or silently dropped.
    name: 'gateway durable operator events',
    report: 'apps/gateway/coverage/coverage-summary.json',
    matches: (file) => file.endsWith('/src/operator-event-ingest.ts')
      || file.endsWith('/src/operator-event-store.ts')
      || file.endsWith('/src/operator-event-reply.ts')
      || file.endsWith('/src/maintenance/operator-event-sweep.ts')
      || file.endsWith('/src/workers/operator-event.ts'),
  },
  {
    // The approve -> execute path. Its guards are the only thing standing
    // between a stale or edited plan and a real provider mutation, and a
    // replayed approval is a double refund. Held out of this ratchet until
    // 2026-08-21 because it measured 62.26/54.76 and admitting it would have
    // meant lowering the bar to fit.
    name: 'agent plan execution',
    report: 'packages/agent/coverage/coverage-summary.json',
    matches: (file) => file.endsWith('/src/plan-execution.ts')
      || file.endsWith('/src/plan-cache.ts'),
  },
  {
    // Grounding rewrites agent-authored prose after planning. No eval fixture
    // asserts on escalation reason text and judge.ts grades only replyText, so
    // this ratchet is the only automated cover these functions have.
    name: 'agent plan grounding',
    report: 'packages/agent/coverage/coverage-summary.json',
    matches: (file) => file.endsWith('/src/plan-grounding.ts'),
  },
  {
    name: 'gateway webhook validation',
    report: 'apps/gateway/coverage/coverage-summary.json',
    matches: (file) => file.endsWith('/src/routes/telegram/webhook-validation.ts')
      || file.endsWith('/src/routes/webhooks-signature-alerts.ts'),
  },
  {
    name: 'gateway order-risk safety',
    report: 'apps/gateway/coverage/coverage-summary.json',
    matches: (file) => file.endsWith('/src/maintenance/order-risk-monitor.ts')
      || file.endsWith('/src/workers/order-review.ts'),
  },
  {
    // Re-drafts plans for threads that missed one. An absent plan is recovery
    // work, not a merchant decision.
    name: 'gateway plan recovery',
    report: 'apps/gateway/coverage/coverage-summary.json',
    matches: (file) => file.endsWith('/src/maintenance/plan-recovery.ts'),
  },
  {
    // Decides whether a stale outbound row is retried or marked unknown once a
    // provider attempt has started.
    name: 'gateway outbound send sweep',
    report: 'apps/gateway/coverage/coverage-summary.json',
    matches: (file) => file.endsWith('/src/maintenance/outbound-send-sweep.ts'),
  },
  {
    // Re-enqueues durable integration disconnect work that never finished.
    name: 'gateway integration disconnect sweep',
    report: 'apps/gateway/coverage/coverage-summary.json',
    matches: (file) => file.endsWith('/src/maintenance/integration-disconnect-sweep.ts'),
  },
  {
    // Closes genuinely quiet threads without operator-owned work in flight.
    name: 'gateway inactive thread sweep',
    report: 'apps/gateway/coverage/coverage-summary.json',
    matches: (file) => file.endsWith('/src/maintenance/inactive-thread-sweep.ts'),
  },
  {
    name: 'agent Shopify write operations',
    report: 'packages/agent/coverage/coverage-summary.json',
    matches: (file) => /\/src\/shopify\/(discounts|order-cancellation)\.ts$/.test(file),
  },
  {
    // Determines whether a Shopify mutation actually landed after an ambiguous
    // provider outcome. A confident no_effect here can release a duplicate send.
    name: 'agent Shopify reconciliation probes',
    report: 'packages/agent/coverage/coverage-summary.json',
    matches: (file) => file.includes('/src/shopify/reconciliation-probes/'),
  },
  {
    name: 'agent Shopify tracking and product lookup',
    report: 'packages/agent/coverage/coverage-summary.json',
    matches: (file) => /\/src\/shopify\/(tracking|products)\.ts$/.test(file),
  },
  {
    name: 'agent planner safety',
    report: 'packages/agent/coverage/coverage-summary.json',
    matches: (file) => file.endsWith('/src/planner-safety.ts')
      || file.endsWith('/src/run-policy.ts'),
  },
];

const failures = [];
for (const group of groups) {
  const reportPath = resolve(ROOT, group.report);
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const entries = Object.entries(report)
    .filter(([file]) => file !== 'total' && group.matches(file));

  if (entries.length === 0) {
    failures.push(`${group.name}: no files matched ${relative(ROOT, reportPath)}`);
    continue;
  }

  const lines = aggregate(entries, 'lines');
  const branches = aggregate(entries, 'branches');
  console.log(
    `[critical-coverage] ${group.name}: lines ${lines.toFixed(2)}%, branches ${branches.toFixed(2)}%`,
  );
  if (lines < MIN_LINES || branches < MIN_BRANCHES) {
    failures.push(
      `${group.name}: expected at least ${MIN_LINES}% lines and ${MIN_BRANCHES}% branches, `
      + `received ${lines.toFixed(2)}% lines and ${branches.toFixed(2)}% branches`,
    );
  }
}

if (failures.length > 0) {
  console.error(`Critical coverage check failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  process.exit(1);
}

function aggregate(entries, metric) {
  const totals = entries.reduce(
    (sum, [, coverage]) => ({
      covered: sum.covered + coverage[metric].covered,
      total: sum.total + coverage[metric].total,
    }),
    { covered: 0, total: 0 },
  );
  return totals.total === 0 ? 100 : (totals.covered / totals.total) * 100;
}
