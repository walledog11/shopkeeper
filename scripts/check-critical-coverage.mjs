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
    name: 'agent Shopify write operations',
    report: 'packages/agent/coverage/coverage-summary.json',
    matches: (file) => /\/src\/shopify\/(discounts|order-cancellation)\.ts$/.test(file),
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
