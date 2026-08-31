#!/usr/bin/env node
// `customers/redact` canary — delivery half.
//
// `shopify app webhook trigger` signs correctly but sends a *sample* payload
// with no override flag, so it names a customer that does not exist locally:
// the selection comes back empty and the transaction commits having deleted
// nothing. This signs the seeded payload instead, so the delivery matches a
// real fixture.
//
// The signature covers the exact bytes on the wire, so the body is serialized
// once and both signed and sent as that buffer.
//
// Requires the same SHOPIFY_APP_SECRET the receiving gateway holds. A 401 means
// the secret differs from that deployment's — a real finding, not a test setup
// problem.
//
//   SHOPIFY_APP_SECRET=... node scripts/canary-customer-redact-deliver.mjs \
//     --state=redact-canary.json --url=https://<gateway-host>/webhooks/shopify
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv({ announce: false });

function stringArg(name) {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

const statePath = stringArg('state');
const url = stringArg('url');
const topic = stringArg('topic') ?? 'customers/redact';
const secret = process.env.SHOPIFY_APP_SECRET;

if (!statePath || !url) {
  console.error('--state=<path> and --url=<gateway>/webhooks/shopify are both required.');
  console.error('The destination is never inferred; point it at the deployment you mean to test.');
  process.exit(1);
}
if (!secret) {
  console.error('SHOPIFY_APP_SECRET is unset. It must match the secret on the receiving gateway,');
  console.error('not merely be a valid-looking value, or the request is rejected with 401.');
  process.exit(1);
}

const state = JSON.parse(readFileSync(statePath, 'utf8'));
const body = Buffer.from(JSON.stringify(state.payload), 'utf8');
const signature = createHmac('sha256', secret).update(body).digest('base64');
const webhookId = randomUUID();

console.error(`POST ${url}`);
console.error(`  topic       ${topic}`);
console.error(`  shop        ${state.shop}`);
console.error(`  webhook id  ${webhookId}`);
console.error(`  body        ${body.byteLength} bytes`);

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-shopify-topic': topic,
    'x-shopify-shop-domain': state.shop,
    'x-shopify-hmac-sha256': signature,
    'x-shopify-webhook-id': webhookId,
  },
  body,
});
const text = await response.text();
console.log(JSON.stringify({ status: response.status, body: text.slice(0, 200) }, null, 2));

if (response.status === 401) {
  console.error('');
  console.error('401 — signature rejected. SHOPIFY_APP_SECRET here differs from the one on that');
  console.error('gateway. Compare them before assuming the canary is at fault.');
} else if (response.status === 200) {
  console.error('');
  console.error('200 is not the assertion. Run the verify half, and read the gateway log line');
  console.error('"[Webhook] Shopify customer data redacted" for non-zero deleted* counts.');
}
process.exitCode = response.ok ? 0 : 1;
