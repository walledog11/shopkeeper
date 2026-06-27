import assert from 'node:assert/strict';
import test from 'node:test';
import { getNgrokArgs } from './start-ngrok.mjs';

test('ngrok uses the gateway default port without requiring a reserved domain', () => {
  assert.deepEqual(getNgrokArgs({}), ['http', '8080']);
});

test('ngrok accepts environment-controlled port and domain values', () => {
  assert.deepEqual(
    getNgrokArgs({
      GATEWAY_PORT: '9090',
      NGROK_DOMAIN: 'gateway.example.ngrok.app',
    }),
    ['http', '9090', '--url', 'gateway.example.ngrok.app'],
  );
});
