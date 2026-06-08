# Testing

Use the root PR verification path before sending changes that touch app behavior:

```sh
npm run verify:pr
```

That runs structure checks, repo and app lint, unit tests, node script tests, integration tests, smoke E2E, and coverage in the same order CI expects. For a narrower loop, run the smallest script that covers your change:

```sh
npm run lint:structure
npm run lint
npm run test:unit
npm run test:node
npm run test:integration
npm run test:e2e:smoke
npm run test:coverage
```

## Test Ownership

Unit tests belong next to deterministic business logic, validation, formatting, policy, and component helpers. They use the `*.unit.test.ts` suffix and should not need Postgres, Redis, Playwright, provider credentials, or live network calls.

Integration tests cover route handlers, database-backed workflows, queues, Redis locks, and cross-module behavior where the database contract matters. In the dashboard app, regular `*.test.ts` files are integration-owned by default; use `*.integration.test.ts` when the extra clarity helps.

Smoke E2E covers the default PR browser path with `E2E_AUTH_BYPASS=true`. Clerk browser-session E2E is intentionally separate via `npm run test:e2e:browser`, requires real development Clerk credentials, and is a release, nightly, or manual check unless those credentials are reliably configured in CI.

Node script tests cover `scripts/*.test.mjs` and are part of PR verification through `npm run test:node`.

## Local Services

Integration and coverage runs expect local Postgres and Redis test services. Start them with:

```sh
npm run test:services:up
```

Coverage bootstraps the DB package, waits for test services, and runs migrations before collecting dashboard and gateway coverage. It should be hermetic in the same way integration tests are.

## Network Calls

Vitest setup installs a strict fetch guard in dashboard and gateway tests. Localhost and configured local dashboard/gateway URLs are allowed. Real provider hosts and unknown public hosts are blocked by default, including Upstash, Anthropic, Stripe, Clerk, Shopify, Postmark, Meta, Microsoft, Google, and Twilio.

Mock provider calls in-process with `vi.stubGlobal('fetch', mockFetch)`, `vi.spyOn(globalThis, 'fetch')`, SDK mocks, or route-level dependency injection. If a test genuinely needs a fixture host, use the named helper:

```ts
import { allowTestNetworkHosts } from '../../../scripts/test-network-guard.mjs';

const cleanup = allowTestNetworkHosts('provider-fixture.test');
try {
  // test code
} finally {
  cleanup();
}
```

Do not add ad hoc environment flags to bypass the guard.

## Expected Error Logs

Tests that intentionally trigger OAuth CSRF failures, webhook signature failures, API error handling, worker drops, or provider failure alerts should mock or inject the logger and assert the important log call. This keeps CI output readable while preserving coverage for security-relevant logging.
