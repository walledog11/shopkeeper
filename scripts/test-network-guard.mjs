import net from 'node:net';

const GUARD_MARKER = Symbol.for('clerk.testNetworkGuard.installed');
const ORIGINAL_FETCH = Symbol.for('clerk.testNetworkGuard.originalFetch');

const DEFAULT_PROVIDER_HOSTS = [
  { provider: 'upstash', suffixes: ['upstash.io', 'upstash.com'], exact: ['api.upstash.com'] },
  { provider: 'anthropic', suffixes: ['anthropic.com'], exact: ['api.anthropic.com'] },
  { provider: 'stripe', suffixes: ['stripe.com'], exact: ['api.stripe.com'] },
  { provider: 'clerk', suffixes: ['clerk.com', 'clerk.dev', 'clerk.accounts.dev'], exact: ['api.clerk.com'] },
  { provider: 'shopify', suffixes: ['myshopify.com', 'shopify.com'], exact: ['accounts.shopify.com'] },
  { provider: 'postmark', suffixes: ['postmarkapp.com'], exact: ['api.postmarkapp.com'] },
  {
    provider: 'meta',
    suffixes: ['facebook.com', 'facebook.net', 'instagram.com'],
    exact: ['graph.facebook.com', 'graph.instagram.com'],
  },
  {
    provider: 'microsoft',
    suffixes: ['microsoft.com', 'microsoftonline.com', 'live.com', 'office.com'],
    exact: ['graph.microsoft.com', 'login.microsoftonline.com'],
  },
  {
    provider: 'google',
    suffixes: ['google.com', 'googleapis.com'],
    exact: ['accounts.google.com', 'oauth2.googleapis.com', 'openidconnect.googleapis.com', 'www.googleapis.com'],
  },
  { provider: 'twilio', suffixes: ['twilio.com'], exact: ['api.twilio.com'] },
  { provider: 'sentry', suffixes: ['sentry.io'], exact: ['sentry.io'] },
];

const LOCAL_URL_ENV_KEYS = [
  'APP_URL',
  'DASHBOARD_URL',
  'DASHBOARD_INTERNAL_URL',
  'GATEWAY_INTERNAL_URL',
  'GATEWAY_PUBLIC_URL',
  'TWILIO_WEBHOOK_URL',
];

const explicitAllowedHosts = new Set();

export function allowTestNetworkHosts(hosts) {
  const entries = Array.isArray(hosts) ? hosts : [hosts];
  if (entries.length === 0 || entries.length > 5) {
    throw new Error('[test-network-guard] allowTestNetworkHosts expects 1-5 hosts.');
  }

  const normalized = entries.map(normalizeAllowedHostEntry);
  for (const host of normalized) {
    explicitAllowedHosts.add(host);
  }

  return () => {
    for (const host of normalized) {
      explicitAllowedHosts.delete(host);
    }
  };
}

export function resetTestNetworkAllowlist() {
  explicitAllowedHosts.clear();
}

export function createTestNetworkGuard(fetchImpl, options = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('[test-network-guard] fetch implementation is required.');
  }

  return async function guardedFetch(input, init) {
    const decision = classifyTestNetworkRequest(input, options);
    if (!decision.allowed) {
      throw new Error(formatBlockedRequestMessage(decision));
    }
    return fetchImpl.call(this, input, init);
  };
}

export function installTestNetworkGuard(options = {}) {
  const currentFetch = globalThis.fetch;
  if (typeof currentFetch !== 'function') {
    throw new Error('[test-network-guard] global fetch is not available.');
  }

  if (currentFetch[GUARD_MARKER]) {
    return currentFetch;
  }

  const originalFetch = options.fetchImpl ?? currentFetch[ORIGINAL_FETCH] ?? currentFetch;
  const guardedFetch = createTestNetworkGuard(originalFetch, options);
  Object.defineProperties(guardedFetch, {
    [GUARD_MARKER]: { value: true },
    [ORIGINAL_FETCH]: { value: originalFetch },
  });

  globalThis.fetch = guardedFetch;
  return guardedFetch;
}

export function classifyTestNetworkRequest(input, options = {}) {
  const parsed = parseFetchInput(input);
  if (!parsed.url) {
    return { allowed: true, reason: 'relative-or-non-http-url', raw: parsed.raw };
  }

  if (parsed.url.protocol !== 'http:' && parsed.url.protocol !== 'https:') {
    return {
      allowed: true,
      reason: 'non-network-url',
      raw: parsed.raw,
      protocol: parsed.url.protocol,
    };
  }

  const hostname = normalizeHostname(parsed.url.hostname);
  const host = normalizeHostPort(parsed.url);
  const allowedHosts = options.allowedHosts ?? explicitAllowedHosts;

  if (isAllowedHost(hostname, host, allowedHosts)) {
    return { allowed: true, reason: 'explicit-allowlist', host, hostname, url: parsed.url };
  }

  if (configuredLocalHosts(options.env ?? process.env).has(host)) {
    return { allowed: true, reason: 'configured-local-url', host, hostname, url: parsed.url };
  }

  if (isLocalHostname(hostname)) {
    return { allowed: true, reason: 'local-host', host, hostname, url: parsed.url };
  }

  const provider = providerForHost(hostname);
  return {
    allowed: false,
    reason: provider ? 'known-provider' : 'unknown-public-host',
    provider,
    host,
    hostname,
    url: parsed.url,
  };
}

function formatBlockedRequestMessage(decision) {
  const providerSuffix = decision.provider ? ` (${decision.provider})` : '';
  return [
    `[test-network-guard] Blocked external network request to ${decision.host}${providerSuffix}.`,
    'Mock the provider call in-process, or use allowTestNetworkHosts([...]) for a narrowly scoped test fixture host.',
  ].join(' ');
}

function parseFetchInput(input) {
  const raw = typeof input === 'string' || input instanceof URL
    ? String(input)
    : typeof Request !== 'undefined' && input instanceof Request
      ? input.url
      : input && typeof input === 'object' && 'url' in input
        ? String(input.url)
        : String(input);

  try {
    return { raw, url: new URL(raw) };
  } catch {
    return { raw, url: null };
  }
}

function configuredLocalHosts(env) {
  const hosts = new Set();
  for (const key of LOCAL_URL_ENV_KEYS) {
    const value = env[key];
    if (!value) continue;
    try {
      const url = new URL(value);
      const hostname = normalizeHostname(url.hostname);
      if (isLocalHostname(hostname)) {
        hosts.add(normalizeHostPort(url));
      }
    } catch {
      // Invalid test URLs should fail in the code under test, not in setup.
    }
  }
  return hosts;
}

function isAllowedHost(hostname, host, allowedHosts) {
  return allowedHosts.has(hostname) || allowedHosts.has(host);
}

function providerForHost(hostname) {
  for (const provider of DEFAULT_PROVIDER_HOSTS) {
    if (provider.exact.some((entry) => normalizeHostname(entry) === hostname)) {
      return provider.provider;
    }
    if (provider.suffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))) {
      return provider.provider;
    }
  }
  return null;
}

function normalizeAllowedHostEntry(entry) {
  if (typeof entry !== 'string' || entry.trim().length === 0) {
    throw new Error('[test-network-guard] Allowed hosts must be non-empty strings.');
  }

  const value = entry.trim();
  try {
    const url = value.includes('://') ? new URL(value) : new URL(`http://${value}`);
    return url.port ? normalizeHostPort(url) : normalizeHostname(url.hostname);
  } catch {
    throw new Error(`[test-network-guard] Invalid allowed host: ${entry}`);
  }
}

function normalizeHostPort(url) {
  const hostname = normalizeHostname(url.hostname);
  return url.port ? `${hostname}:${url.port}` : hostname;
}

function normalizeHostname(hostname) {
  return hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/\.$/, '');
}

function isLocalHostname(hostname) {
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '0.0.0.0' ||
    hostname === 'host.docker.internal' ||
    hostname === 'docker.for.mac.localhost'
  ) {
    return true;
  }

  const ipVersion = net.isIP(hostname);
  if (ipVersion === 4) {
    return hostname.startsWith('127.');
  }
  if (ipVersion === 6) {
    return hostname === '::1' || hostname === '0:0:0:0:0:0:0:1';
  }
  return false;
}
