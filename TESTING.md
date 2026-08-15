# Testing

Use the root PR verification path before sending changes that touch app behavior:

```sh
npm run verify:pr
```

That is the canonical local and CI contract. It runs structure checks, repo and
app lint, root Knip, an explicit workspace typecheck, fast unit tests, node
script tests, auth-bypass smoke E2E, comprehensive coverage, and the production
build. The coverage run owns the integration gate, so
`verify:pr` does not run integration once normally and then repeat it under
coverage. CI calls the same command with `--stage=static`, `unit`, `coverage`,
`build`, or `e2e` so independent work remains parallel without duplicating the
contract in workflow YAML. For a narrower loop, run the smallest script that
covers your change:

```sh
npm run lint:structure
npm run lint
npm run lint:knip
npm run typecheck
npm run test:unit
npm run test:node
npm run test:integration
npm run test:e2e:smoke
npm run test:e2e:send-reply-hop
npm run test:coverage
```

Knip's reviewed baseline is zero findings for unused files, dependencies, dev
dependencies, unlisted imports, binaries, and duplicate exports; those rules are
blocking. Export and exported-type analysis is enabled at warning severity with
the reviewed 2026-08-14 baseline of 151 exports and 121 types. This includes
exports referenced only inside their declaring file; Knip's broad
`ignoreExportsUsedInFile` escape hatch is deliberately not used. Reduce those
counts in focused cleanup slices, then promote each rule to blocking at zero. The
`lint:knip` wrapper rejects growth above either count, so warning severity is a
ratchet rather than permission to add new debt.

The two ignored `.d.mts` files declare types for sibling runtime modules. The two
ignored binaries (`docker-compose` and `ngrok`) are host tools spawned by local
infrastructure scripts. Dependency exceptions are scoped to the workspace that
loads them indirectly: CSS/tool configuration in the dashboard, Pino's string
transport in the gateway, the Neon adapter's pinned transitive driver in the DB
package, and the manually invoked Shopify CLI at the root. Root automation/E2E
files and application operations scripts are explicit entry points because
humans or package scripts invoke them. Do not add a directory-wide ignore to
land a change: add the real entry point or dependency, remove the dead code, or
document the smallest exception next to its Knip configuration with the
invocation that requires it.

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
identity-provider contract. Its agent approval coverage includes a real
recorded-delivery approval plus controlled server-authoritative committed,
known-failure, and unknown presentation canaries. The failure canaries exercise
recovery copy and live-region behavior without issuing a provider/customer
side effect.

`npm run test:e2e:send-reply-hop` is the focused cross-service delivery canary.
It starts both apps, seeds an isolated email thread, invokes the gateway
`ThreadSink` in a separate gateway process, crosses the authenticated
`/api/agent/io-send-internal` HTTP boundary, and requires both a recorded
provider call and one committed agent message. Test env forces synchronous
record mode, a loopback dashboard URL, and an `example.com` recipient, so this
canary cannot reach a real provider.

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

Vitest setup installs a strict fetch guard in dashboard and gateway tests. Localhost and configured local dashboard/gateway URLs are allowed. Real provider hosts and unknown public hosts are blocked by default, including Upstash, Anthropic, Stripe, Clerk, Shopify, Postmark, Meta, Google, and Twilio.

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

Two prerequisites, both of which fail quietly rather than loudly:

- **`ANTHROPIC_API_KEY` must be in the shell**, not just an `.env` file. `with-test-env.mjs` does not forward it, so the whole suite reports `skipped` — not failed — when it is missing.
- **The test database must be up** (`npm run test:services:up`). Fixtures seed a real org, so with Postgres down every fixture fails instantly with `runner threw: … Can't reach database server`. The tell is `calls=0` in the `[eval]` line: no model call was made, so nothing was spent.

To run a subset, filter by test name — the name is `<fixture id> — <description>`, so the filter matches description text too:

```sh
npx vitest run --config vitest.integration.config.ts src/lib/agent/__evals__/index.test.ts -t "fulfill"
```

On a subset run the suite still compares against the full baseline and will fail with an aggregate regression that only reflects the fixtures you ran. Read `[eval:gates]` and the per-category lines instead. Before treating a single-repeat failure as a regression, check the fixture's recorded rate in `baseline.json` and re-run it at `EVAL_REPEATS=3`: several fixtures sit at 66.7% by design, and advisory fixtures never hard-fail their own test but do move the aggregate.

The live-AI eval workflow is separate from comprehensive coverage. The
non-judge eval runs on relevant pull requests and manual dispatches; the
judge-scored contract runs nightly or manually and remains non-blocking.

Fixtures can set `expectedPlan.mustIncludeActionWhenMutativeIntent: true` to assert the hollow-reply invariant: when the customer asks for a refund/cancel/address change, a plan with `send_reply` must also include an action tool or `escalate_to_human`.

## Expected Error Logs

Tests that intentionally trigger OAuth CSRF failures, webhook signature failures, API error handling, worker drops, or provider failure alerts should mock or inject the logger and assert the important log call. This keeps CI output readable while preserving coverage for security-relevant logging.
