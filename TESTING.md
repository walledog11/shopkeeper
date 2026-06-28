# Testing

Use the root PR verification path before sending changes that touch app behavior:

```sh
npm run verify:pr
```

That runs structure checks, repo and app lint, fast unit tests, node script tests,
auth-bypass smoke E2E, comprehensive coverage, and the production build in the
same order CI expects. The coverage run owns the integration gate, so
`verify:pr` does not run integration once normally and then repeat it under
coverage. For a narrower loop, run the smallest script that covers your change:

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

Unit tests belong next to deterministic business logic, validation, formatting,
policy, and component helpers. Dashboard and gateway unit tests use the
`*.unit.test.ts` or `*.unit.test.tsx` suffix and should not need Postgres,
Redis, Playwright, provider credentials, or live network calls. Email package
tests are unit-owned. Agent tests are unit-owned except explicit
`*.integration.test.ts` database contracts such as support statistics.

Integration tests cover route handlers, database-backed workflows, queues,
Redis locks, and cross-module behavior where the database contract matters. In
dashboard and gateway, regular `*.test.ts` files are integration-owned by
default. Do not use an extra integration suffix: ownership is deliberately
binary, and `npm run lint:structure` rejects overlap, missing configs, missing
coverage participants, and unowned tests.

Smoke E2E covers the default PR browser path with `E2E_AUTH_BYPASS=true`,
including the seeded ticket → manual reply → recorded outbound delivery and
seeded plan → approval → persistence workflow. Clerk browser-session E2E is
intentionally separate via `npm run test:e2e:browser`, requires real
development Clerk credentials, and is a nightly, release, or manual
identity-provider contract.

Node script tests cover `scripts/*.test.mjs` and are part of PR verification through `npm run test:node`.

## Local Services

Integration and coverage runs expect local Postgres and Redis test services. Start them with:

```sh
npm run test:services:up
```

Coverage bootstraps the DB package, waits for test services, and runs migrations
before collecting dashboard, gateway, agent, and email coverage:

```sh
npm run test:coverage
```

Each V8 config includes every eligible production `src/**/*.{ts,tsx}` file.
Tests, declarations, eval harnesses, fixtures, and build outputs are excluded.
Unimported production files remain in the report at 0%; coverage is not limited
to modules reached by the tests. CI uploads all four `coverage/` directories.

## Coverage Threshold Policy

Global statement, branch, function, and line thresholds are set one percentage
point below the measured comprehensive baseline in each workspace. Security,
billing writes, webhook validation, order-risk safety, Shopify operations, and
planner safety additionally require at least 80% line and 70% branch coverage
through `scripts/check-critical-coverage.mjs`.

Thresholds are ratchets. Increasing them after coverage improves is expected.
Decreasing any threshold requires an explicit reviewed change that explains the
lost behavior coverage; do not lower a threshold merely to make CI green.

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

## Agent evals

The dashboard agent eval harness lives in `apps/dashboard/src/lib/agent/__evals__`. It runs live planner calls against JSON fixtures and compares pass rates to a committed baseline.

```sh
# Fast local iteration (single repeat per fixture)
EVAL_REPEATS=1 npm run test:evals -w apps/dashboard

# Pre-merge gate (matches CI)
EVAL_REPEATS=3 npm run test:evals -w apps/dashboard

# Regenerate baseline.json — always use 3 repeats so flappy fixtures are visible
npm run test:evals:baseline -w apps/dashboard
```

`test:evals:baseline` sets `EVAL_REPEATS=3` and `UPDATE_EVAL_BASELINE=1`. Do not regenerate the baseline at `EVAL_REPEATS=1`; that produces a noisy repeats=1 snapshot that hides flaky fixtures.

The live-AI eval workflow is separate from comprehensive coverage. The
non-judge eval runs on relevant pull requests and manual dispatches; the
judge-scored contract runs nightly or manually and remains non-blocking.

Fixtures can set `expectedPlan.mustIncludeActionWhenMutativeIntent: true` to assert the hollow-reply invariant: when the customer asks for a refund/cancel/address change, a plan with `send_reply` must also include an action tool or `escalate_to_human`.

## Expected Error Logs

Tests that intentionally trigger OAuth CSRF failures, webhook signature failures, API error handling, worker drops, or provider failure alerts should mock or inject the logger and assert the important log call. This keeps CI output readable while preserving coverage for security-relevant logging.
