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

function optionalEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  return value.trim();
}

function buildDashboardRequestHeaders(extra = {}) {
  const headers = {
    'user-agent': 'shopkeeper-production-verify/1.0',
    ...extra,
  };

  const bypass = optionalEnv('VERCEL_PROTECTION_BYPASS');
  if (bypass) {
    headers['x-vercel-protection-bypass'] = bypass;
  }

  return headers;
}

function buildInternalRequestHeaders(extra = {}) {
  const secret = optionalEnv('INTERNAL_API_SECRET');
  if (!secret) {
    return null;
  }

  return buildDashboardRequestHeaders({
    'content-type': 'application/json',
    'x-internal-secret': secret,
    ...extra,
  });
}

async function fetchJson(url, expectedStatuses = [200], headers = buildDashboardRequestHeaders()) {
  const response = await fetch(url, { headers });

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

async function postJson(url, body, expectedStatuses, headers) {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`[verify-production] ${url} returned ${response.status}: ${raw}`);
  }

  return { response, raw };
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

async function verifyDashboardHopBackRoutes(baseUrl) {
  const headers = buildInternalRequestHeaders();
  if (!headers) {
    console.log('[verify-production] Skipping dashboard hop-back auth checks: INTERNAL_API_SECRET not set');
    return;
  }

  const hopBackRoutes = [
    {
      path: '/api/agent/io-send-internal',
      body: {},
      label: 'io-send-internal',
    },
    {
      path: '/api/messages/auto-ack',
      body: {},
      label: 'messages/auto-ack',
    },
    {
      path: '/api/messages/internal',
      body: {},
      label: 'messages/internal',
    },
  ];

  for (const route of hopBackRoutes) {
    const url = buildUrl(baseUrl, route.path);
    await postJson(url, route.body, [400], headers);
    console.log(`[verify-production] Dashboard hop-back auth OK (${route.label} -> 400 validation): ${url}`);
  }

  const retiredRoutes = [
    '/api/agent/plan-internal',
    '/api/agent/internal',
    '/api/agent/order-risk-internal',
  ];

  for (const path of retiredRoutes) {
    const url = buildUrl(baseUrl, path);
    await postJson(url, {}, [401], headers);
    console.log(`[verify-production] Retired orchestration route unreachable (${path} -> 401): ${url}`);
  }
}

function warnAboutVercelProtectionBypass(dashboardUrl) {
  let hostname = '';
  try {
    hostname = new URL(dashboardUrl).hostname;
  } catch {
    return;
  }

  if (!hostname.endsWith('.vercel.app')) {
    return;
  }

  if (optionalEnv('VERCEL_PROTECTION_BYPASS')) {
    return;
  }

  console.warn(
    '[verify-production] DASHBOARD_URL uses a protected *.vercel.app hostname but VERCEL_PROTECTION_BYPASS is unset. Set it on Railway before worker hop-back delivery can succeed.',
  );
}

async function verifyGateway(baseUrl) {
  const url = buildUrl(baseUrl, '/health/deep');
  const { data } = await fetchJson(url, [200]);
  assertCheck(data, 'status', 'ok');
  assertCheck(data, 'checks.db.status', 'ok');
  assertCheck(data, 'checks.redis.status', 'ok');
  assertCheck(data, 'checks.worker.status', 'ok');
  assertCheck(data, 'checks.queues.status', 'ok');

  if (optionalEnv('VERIFY_IMESSAGE') !== 'false' && data?.checks?.imessage) {
    if (data.checks.imessage.configured !== true) {
      throw new Error('[verify-production] Gateway iMessage is not configured (checks.imessage.configured !== true)');
    }
    console.log('[verify-production] Gateway iMessage configured');
  }

  console.log(`[verify-production] Gateway deep health OK: ${url}`);
}

async function verifyPhotonWebhookInfrastructure(baseUrl) {
  if (optionalEnv('VERIFY_IMESSAGE') === 'false') {
    console.log('[verify-production] Skipping Photon webhook check: VERIFY_IMESSAGE=false');
    return;
  }

  const url = buildUrl(baseUrl, '/webhooks/photon');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'shopkeeper-production-verify/1.0',
    },
    body: JSON.stringify({}),
  });

  if (response.status === 503) {
    throw new Error(
      '[verify-production] Photon webhook returned 503 — set SPECTRUM_PROJECT_ID, SPECTRUM_PROJECT_SECRET, and SPECTRUM_WEBHOOK_SECRET on the gateway',
    );
  }

  console.log(
    `[verify-production] Photon webhook route reachable (status ${response.status}; 503 means iMessage is not configured): ${url}`,
  );
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

  const failedQueues = Object.entries(data.queues)
    .filter(([, counts]) => (counts?.failed ?? 0) > 0)
    .map(([name, counts]) => `${name}:failed=${counts.failed}`);

  if (failedQueues.length > 0) {
    throw new Error(`[verify-production] Queue failures detected: ${failedQueues.join(', ')}`);
  }

  console.log(`[verify-production] Gateway queue health OK: ${url}`);
}

async function verifyInboundEmailWebhook(baseUrl) {
  const to = process.env.VERIFY_INBOUND_EMAIL_TO;
  if (!to) {
    console.log('[verify-production] Skipping inbound email smoke check: VERIFY_INBOUND_EMAIL_TO not set');
    return;
  }

  const from = process.env.VERIFY_INBOUND_EMAIL_FROM ?? 'shopkeeper-smoke@example.com';
  const subject = process.env.VERIFY_INBOUND_EMAIL_SUBJECT ?? `Shopkeeper production smoke ${new Date().toISOString()}`;
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
      'user-agent': 'shopkeeper-production-verify/1.0',
    },
    body: form,
  });

  const body = await response.text();
  if (!response.ok || body !== 'OK') {
    throw new Error(`[verify-production] Inbound email smoke check failed: ${response.status} ${body}`);
  }

  console.log(`[verify-production] Inbound email webhook accepted: ${url}`);
  console.log('[verify-production] Track 4.6 follow-up: confirm ai-summary -> in-process auto-plan -> auto-execute -> io-send-internal delivery in the dashboard');
}

async function main() {
  const dashboardUrl = requireAbsoluteUrlEnv('DASHBOARD_URL');
  const gatewayUrl = requireAbsoluteUrlEnv('GATEWAY_URL');

  warnAboutVercelProtectionBypass(dashboardUrl);
  await verifyDashboard(dashboardUrl);
  await verifyDashboardHopBackRoutes(dashboardUrl);
  await verifyGateway(gatewayUrl);
  await verifyGatewayQueues(gatewayUrl);
  await verifyPhotonWebhookInfrastructure(gatewayUrl);
  await verifyInboundEmailWebhook(gatewayUrl);

  console.log('[verify-production] Production verification passed');
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
