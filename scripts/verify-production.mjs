function requireEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`[verify-production] Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function requireAbsoluteUrlEnv(name) {
  const value = requireEnv(name);

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`[verify-production] ${name} must be a valid absolute URL`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`[verify-production] ${name} must use http or https`);
  }

  return value.replace(/\/+$/, '');
}

function buildUrl(base, path) {
  return new URL(path, base.endsWith('/') ? base : `${base}/`).toString();
}

async function fetchJson(url, expectedStatuses = [200]) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'clerk-production-verify/1.0',
    },
  });

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }

  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`[verify-production] ${url} returned ${response.status}: ${raw}`);
  }

  return { response, data };
}

function assertCheck(data, checkPath, expectedValue) {
  const parts = checkPath.split('.');
  let current = data;
  for (const part of parts) {
    current = current?.[part];
  }

  if (current !== expectedValue) {
    throw new Error(`[verify-production] Expected ${checkPath}=${expectedValue}, received ${JSON.stringify(current)}`);
  }
}

async function verifyDashboard(baseUrl) {
  const url = buildUrl(baseUrl, '/api/health');
  const { data } = await fetchJson(url, [200]);
  assertCheck(data, 'status', 'ok');
  assertCheck(data, 'checks.env.status', 'ok');
  assertCheck(data, 'checks.db.status', 'ok');
  assertCheck(data, 'checks.redis.status', 'ok');
  console.log(`[verify-production] Dashboard health OK: ${url}`);
}

async function verifyGateway(baseUrl) {
  const url = buildUrl(baseUrl, '/health/deep');
  const { data } = await fetchJson(url, [200]);
  assertCheck(data, 'status', 'ok');
  assertCheck(data, 'checks.db.status', 'ok');
  assertCheck(data, 'checks.redis.status', 'ok');
  assertCheck(data, 'checks.worker.status', 'ok');
  assertCheck(data, 'checks.queues.status', 'ok');
  console.log(`[verify-production] Gateway deep health OK: ${url}`);
}

async function verifyGatewayQueues(baseUrl) {
  const url = buildUrl(baseUrl, '/health/queues');
  const { data } = await fetchJson(url, [200]);

  if (data?.worker?.healthy !== true) {
    throw new Error(`[verify-production] Expected worker.healthy=true, received ${JSON.stringify(data?.worker)}`);
  }

  if (!data?.queues || typeof data.queues !== 'object') {
    throw new Error('[verify-production] Queue diagnostics payload is missing or invalid');
  }

  console.log(`[verify-production] Gateway queue health OK: ${url}`);
}

async function verifyInboundEmailWebhook(baseUrl) {
  const to = process.env.VERIFY_INBOUND_EMAIL_TO;
  if (!to) {
    console.log('[verify-production] Skipping inbound email smoke check: VERIFY_INBOUND_EMAIL_TO not set');
    return;
  }

  const from = process.env.VERIFY_INBOUND_EMAIL_FROM ?? 'clerk-smoke@example.com';
  const subject = process.env.VERIFY_INBOUND_EMAIL_SUBJECT ?? `Clerk production smoke ${new Date().toISOString()}`;
  const textBody = process.env.VERIFY_INBOUND_EMAIL_BODY ?? 'Production smoke test message';

  const form = new URLSearchParams({
    From: from,
    To: to,
    Subject: subject,
    TextBody: textBody,
  });

  const url = buildUrl(baseUrl, '/webhooks/email/inbound');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'clerk-production-verify/1.0',
    },
    body: form,
  });

  const body = await response.text();
  if (!response.ok || body !== 'OK') {
    throw new Error(`[verify-production] Inbound email smoke check failed: ${response.status} ${body}`);
  }

  console.log(`[verify-production] Inbound email webhook accepted: ${url}`);
  console.log('[verify-production] Confirm the smoke-test thread appears in the dashboard before marking deploy complete');
}

async function main() {
  const dashboardUrl = requireAbsoluteUrlEnv('DASHBOARD_URL');
  const gatewayUrl = requireAbsoluteUrlEnv('GATEWAY_URL');

  await verifyDashboard(dashboardUrl);
  await verifyGateway(gatewayUrl);
  await verifyGatewayQueues(gatewayUrl);
  await verifyInboundEmailWebhook(gatewayUrl);

  console.log('[verify-production] Production verification passed');
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
