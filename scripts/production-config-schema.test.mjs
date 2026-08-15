import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGatewayProductionConfig } from './lib/production-config-schema.mjs';

test('shared gateway schema normalizes HTTP URLs and rejects other protocols', () => {
  const parsed = parseGatewayProductionConfig({
    DASHBOARD_URL: ' https://app.example.com/// ',
  });
  assert.equal(parsed.dashboardUrl, 'https://app.example.com');

  assert.throws(
    () => parseGatewayProductionConfig({ DASHBOARD_URL: 'file:///tmp/dashboard' }),
    /DASHBOARD_URL must use http or https/,
  );
  assert.throws(
    () => parseGatewayProductionConfig({ DASHBOARD_URL: 'not a URL' }),
    /DASHBOARD_URL must be a valid absolute URL/,
  );
});

test('shared gateway schema uses strict boolean syntax', () => {
  assert.equal(
    parseGatewayProductionConfig({ GMAIL_NATIVE_INBOUND: 'true' }).gmailNativeInbound,
    true,
  );
  assert.equal(
    parseGatewayProductionConfig({ GMAIL_NATIVE_INBOUND: 'false' }).gmailNativeInbound,
    false,
  );

  for (const invalid of ['TRUE', '1', 'yes', 'on']) {
    assert.throws(
      () => parseGatewayProductionConfig({ GMAIL_NATIVE_INBOUND: invalid }),
      /GMAIL_NATIVE_INBOUND must be either true or false/,
    );
  }
});

test('shared gateway schema accepts only positive safe integers', () => {
  assert.equal(
    parseGatewayProductionConfig({ GATEWAY_BULLMQ_DRAIN_DELAY_SECONDS: '1' })
      .workerRedis.drainDelaySeconds,
    1,
  );
  assert.equal(
    parseGatewayProductionConfig({
      GATEWAY_BULLMQ_DRAIN_DELAY_SECONDS: String(Number.MAX_SAFE_INTEGER),
    }).workerRedis.drainDelaySeconds,
    Number.MAX_SAFE_INTEGER,
  );

  for (const invalid of ['0', '-1', '1.5', '12ms', '9007199254740992']) {
    assert.throws(
      () => parseGatewayProductionConfig({ GATEWAY_BULLMQ_DRAIN_DELAY_SECONDS: invalid }),
      /GATEWAY_BULLMQ_DRAIN_DELAY_SECONDS must be a positive/,
    );
  }
});

test('shared gateway schema rejects enum typos', () => {
  assert.equal(parseGatewayProductionConfig({}).emailInboundMode, 'hybrid');
  assert.equal(
    parseGatewayProductionConfig({ EMAIL_INBOUND_MODE: 'GMAIL-ONLY' }).emailInboundMode,
    'gmail-only',
  );
  assert.throws(
    () => parseGatewayProductionConfig({ EMAIL_INBOUND_MODE: 'gmail_only' }),
    /EMAIL_INBOUND_MODE must be one of: hybrid, postmark, gmail-only/,
  );
});
