#!/usr/bin/env node

/**
 * Controlled ops-alert validation helper for production/staging sign-off.
 *
 * Prerequisites (Better Stack + platform config — manual):
 * - Vercel log drain → Better Stack (dashboard)
 * - Railway log drain → Better Stack (gateway)
 * - Log alert rules: opsAlert + category for all four categories
 *
 * Before executing triggers, temporarily lower thresholds on the target service:
 *   OPS_ALERT_WINDOW_SECS=60
 *   WEBHOOK_SIGNATURE_ALERT_THRESHOLD=1   (gateway)
 *   AGENT_FAILURE_ALERT_THRESHOLD=1       (dashboard)
 *   PROVIDER_SEND_ALERT_THRESHOLD=1       (dashboard)
 *   QUEUE_ALERT_FAILED_THRESHOLD=1        (gateway, only if using natural queue emission)
 *
 * Usage:
 *   DASHBOARD_URL=... GATEWAY_URL=... npm run verify:production:alerts -- --dry-run
 *   DASHBOARD_URL=... GATEWAY_URL=... npm run verify:production:alerts -- --execute webhook_signature
 *   DASHBOARD_URL=... GATEWAY_URL=... npm run verify:production:alerts -- --execute all
 */

const CATEGORIES = [
  'webhook_signature',
  'agent_failure',
  'provider_send',
  'queue_health',
];

function requireAbsoluteUrlEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`[verify-production-alerts] Missing required environment variable: ${name}`);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`[verify-production-alerts] ${name} must be a valid absolute URL`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`[verify-production-alerts] ${name} must use http or https`);
  }

  return value.replace(/\/+$/, '');
}

function readPositiveIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`[verify-production-alerts] ${name} must be a positive integer`);
  }

  return value;
}

function parseArgs(argv) {
  const dryRun = !argv.includes('--execute');
  const executeIndex = argv.indexOf('--execute');
  const selected = executeIndex >= 0
    ? argv.slice(executeIndex + 1).filter((arg) => !arg.startsWith('--'))
    : [];

  if (!dryRun && selected.length === 0) {
    throw new Error('[verify-production-alerts] --execute requires at least one category or "all"');
  }

  const categories = dryRun
    ? CATEGORIES
    : selected.includes('all')
      ? CATEGORIES
      : selected;

  for (const category of categories) {
    if (!CATEGORIES.includes(category)) {
      throw new Error(`[verify-production-alerts] Unknown category: ${category}`);
    }
  }

  return { dryRun, categories };
}

function logSearchHint(category, service) {
  console.log(`  Better Stack search: opsAlert:true AND category:${category} AND service:${service}`);
}

function printPrerequisites() {
  console.log('[verify-production-alerts] Prerequisites');
  console.log('  1. Better Stack log drains configured for Vercel (dashboard) and Railway (gateway).');
  console.log('  2. Log alert rules exist for all four categories (see docs/production/error-tracking-plan.md).');
  console.log('  3. Temporarily lower the threshold under test to 1 and set OPS_ALERT_WINDOW_SECS=60.');
  console.log('  4. Record evidence in docs/production/alerting-evidence.md after each category.');
  console.log('  5. Restore default thresholds and confirm OPS_ALERTS_ENABLED=false silences threshold alerts.');
  console.log('');
}

async function triggerWebhookSignature(gatewayUrl, { dryRun }) {
  const threshold = readPositiveIntEnv('WEBHOOK_SIGNATURE_ALERT_THRESHOLD', 5);
  const path = '/webhooks/shopify';
  const url = new URL(path, `${gatewayUrl}/`).toString();

  console.log('[verify-production-alerts] webhook_signature');
  console.log(`  Trigger: ${threshold}x unsigned POST ${url}`);
  console.log('  Expected response: 401 Unauthorized');
  console.log('  Expected log tags: category=webhook_signature service=gateway provider=shopify');
  logSearchHint('webhook_signature', 'gateway');

  if (dryRun) {
    console.log('  Dry run — no requests sent.');
    console.log('');
    return;
  }

  for (let attempt = 1; attempt <= threshold; attempt += 1) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'shopkeeper-production-alerts/1.0',
      },
      body: '{}',
    });

    const body = await response.text();
    console.log(`  Attempt ${attempt}/${threshold}: HTTP ${response.status} ${body.slice(0, 80)}`);

    if (response.status !== 401) {
      throw new Error(`[verify-production-alerts] Expected 401 from ${url}, received ${response.status}`);
    }
  }

  console.log('  Requests sent. Confirm the ops-alert log and Better Stack notification, then record evidence.');
  console.log('');
}

function printAgentFailureSteps(dashboardUrl, { dryRun }) {
  const threshold = readPositiveIntEnv('AGENT_FAILURE_ALERT_THRESHOLD', 3);

  console.log('[verify-production-alerts] agent_failure');
  console.log('  Requires an authenticated launch-test Clerk session (not automatable from this script).');
  console.log(`  1. Set AGENT_FAILURE_ALERT_THRESHOLD=${threshold} and OPS_ALERT_WINDOW_SECS=60 on the dashboard.`);
  console.log(`  2. As a test-org user, POST ${dashboardUrl}/api/agent with a valid test threadId and no approved plan.`);
  console.log(`  3. Repeat until the threshold (${threshold}) is crossed if still at default.`);
  console.log('  Expected response: controlled 400');
  console.log('  Expected log tags: category=agent_failure service=dashboard route=/api/agent');
  logSearchHint('agent_failure', 'dashboard');

  if (!dryRun) {
    console.log('  Skipping automated trigger — complete the manual dashboard steps above.');
  }

  console.log('');
}

function printProviderSendSteps({ dryRun }) {
  const orgId = process.env.VERIFY_ALERT_ORG_ID?.trim() || '<test-org-id>';
  const threshold = readPositiveIntEnv('PROVIDER_SEND_ALERT_THRESHOLD', 3);

  console.log('[verify-production-alerts] provider_send');
  console.log(`  1. Set PROVIDER_SEND_ALERT_THRESHOLD=${threshold} and OPS_ALERT_WINDOW_SECS=60 on the dashboard.`);
  console.log('  2. Load production dashboard env locally (Upstash Redis + alert env vars).');
  console.log(`  3. Run: cd apps/dashboard && npx tsx src/scripts/emit-controlled-ops-alert.ts provider_send ${orgId}`);
  console.log('  Expected log tags: category=provider_send service=dashboard provider=postmark channel=email');
  logSearchHint('provider_send', 'dashboard');

  if (!dryRun) {
    console.log('  Skipping automated trigger — run the dashboard emit script with production env loaded.');
  }

  console.log('');
}

function printQueueHealthSteps({ dryRun }) {
  console.log('[verify-production-alerts] queue_health');
  console.log('  Option A (natural): lower QUEUE_ALERT_FAILED_THRESHOLD=1 and wait for maintenance worker if queues are unhealthy.');
  console.log('  Option B (controlled): load production gateway env locally, then run:');
  console.log('    cd apps/gateway && npx tsx src/scripts/emit-controlled-ops-alert.ts queue_health');
  console.log('  Expected log tags: category=queue_health service=gateway queue=inbound');
  logSearchHint('queue_health', 'gateway');

  if (!dryRun) {
    console.log('  Skipping automated trigger — run the gateway emit script with production env loaded.');
  }

  console.log('');
}

async function main() {
  const { dryRun, categories } = parseArgs(process.argv.slice(2));
  const dashboardUrl = requireAbsoluteUrlEnv('DASHBOARD_URL');
  const gatewayUrl = requireAbsoluteUrlEnv('GATEWAY_URL');

  console.log(`[verify-production-alerts] Mode: ${dryRun ? 'dry-run' : 'execute'}`);
  console.log(`[verify-production-alerts] Dashboard: ${dashboardUrl}`);
  console.log(`[verify-production-alerts] Gateway: ${gatewayUrl}`);
  console.log('');

  printPrerequisites();

  for (const category of categories) {
    if (category === 'webhook_signature') {
      await triggerWebhookSignature(gatewayUrl, { dryRun });
      continue;
    }

    if (category === 'agent_failure') {
      printAgentFailureSteps(dashboardUrl, { dryRun });
      continue;
    }

    if (category === 'provider_send') {
      printProviderSendSteps({ dryRun });
      continue;
    }

    if (category === 'queue_health') {
      printQueueHealthSteps({ dryRun });
    }
  }

  console.log('[verify-production-alerts] Next: confirm each ops-alert log in Better Stack and fill docs/production/alerting-evidence.md');
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
