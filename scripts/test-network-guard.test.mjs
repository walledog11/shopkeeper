import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allowTestNetworkHosts,
  classifyTestNetworkRequest,
  createTestNetworkGuard,
  resetTestNetworkAllowlist,
} from './test-network-guard.mjs';

test.afterEach(() => {
  resetTestNetworkAllowlist();
});

test('test network guard allows localhost', async () => {
  const calls = [];
  const guardedFetch = createTestNetworkGuard(async (input) => {
    calls.push(String(input));
    return new Response('ok');
  });

  const response = await guardedFetch('http://localhost:3100/api/health');

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ['http://localhost:3100/api/health']);
  assert.equal(classifyTestNetworkRequest('http://127.0.0.1:8180/health').allowed, true);
});

test('test network guard blocks known provider hosts before fetch runs', async () => {
  const calls = [];
  const guardedFetch = createTestNetworkGuard(async (input) => {
    calls.push(String(input));
    return new Response('ok');
  });

  await assert.rejects(
    () => guardedFetch('https://api.anthropic.com/v1/messages'),
    /Blocked external network request to api\.anthropic\.com \(anthropic\)/,
  );
  assert.deepEqual(calls, []);
});

test('test network guard blocks unknown public hosts before fetch runs', async () => {
  const calls = [];
  const guardedFetch = createTestNetworkGuard(async (input) => {
    calls.push(String(input));
    return new Response('ok');
  });

  await assert.rejects(
    () => guardedFetch('https://public-fixture.example/api'),
    /Blocked external network request to public-fixture\.example/,
  );
  assert.deepEqual(calls, []);
});

test('test network guard handles Request object inputs', async () => {
  const calls = [];
  const guardedFetch = createTestNetworkGuard(async (input) => {
    calls.push(input);
    return new Response('ok');
  });

  await assert.rejects(
    () => guardedFetch(new Request('https://api.stripe.com/v1/customers')),
    /Blocked external network request to api\.stripe\.com \(stripe\)/,
  );
  assert.deepEqual(calls, []);
});

test('test network guard identifies configured local env URLs', () => {
  const decision = classifyTestNetworkRequest('http://127.0.0.1:3100/api/health', {
    env: { DASHBOARD_INTERNAL_URL: 'http://127.0.0.1:3100' },
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, 'configured-local-url');
  assert.equal(decision.host, '127.0.0.1:3100');
});

test('test network guard blocks provider suffixes', () => {
  const decision = classifyTestNetworkRequest('https://shop.example.myshopify.com/admin/api');

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'known-provider');
  assert.equal(decision.provider, 'shopify');
});

test('test network guard allows explicitly allowlisted fixture hosts', async () => {
  const cleanup = allowTestNetworkHosts('provider-fixture.test');
  const calls = [];
  const guardedFetch = createTestNetworkGuard(async (input) => {
    calls.push(String(input));
    return new Response('ok');
  });

  try {
    const response = await guardedFetch('https://provider-fixture.test/v1/mock');
    assert.equal(response.status, 200);
    assert.deepEqual(calls, ['https://provider-fixture.test/v1/mock']);
  } finally {
    cleanup();
  }
});

test('test network guard rejects invalid allowlist entries', () => {
  assert.throws(() => allowTestNetworkHosts(''), /Allowed hosts must be non-empty strings/);
  assert.throws(() => allowTestNetworkHosts(['a.test', 'b.test', 'c.test', 'd.test', 'e.test', 'f.test']), /expects 1-5 hosts/);
  assert.throws(() => allowTestNetworkHosts('bad host'), /Invalid allowed host/);
});

test('test network guard reset clears explicit allowlist entries', () => {
  allowTestNetworkHosts('reset-fixture.test');
  assert.equal(classifyTestNetworkRequest('https://reset-fixture.test/api').allowed, true);

  resetTestNetworkAllowlist();
  const decision = classifyTestNetworkRequest('https://reset-fixture.test/api');
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'unknown-public-host');
});
