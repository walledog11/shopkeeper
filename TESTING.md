# Testing

## When a test is worth writing

Add a test when you fix a bug and nothing existing would have caught it, and the test
reproduces that bug. Money, tenant isolation, approval races and unknown provider
outcomes are where such a test usually pays for itself; for database ownership and
concurrency, use the real test database rather than a mock.

Do not add tests to raise coverage, fill a registry or satisfy a checklist, and do not
pin wording or echo mock calls. A user-facing flow is done when you have tried it once in
the real app; a passing suite does not stand in for that, and a scripted model does not
show conversational quality.

A red check is investigated, not bypassed. Fix the product defect, or fix the specific
misleading check.

## Suites

| Command | What it runs | Needs |
| --- | --- | --- |
| `npm run test:unit` | unit tests in every workspace | nothing |
| `npm run test:node` | `scripts/*.test.mjs` | nothing |
| `npm run test:integration` | database/queue/route tests | `npm run test:services:up` |
| `npm run test:e2e:smoke` | Playwright smoke with `E2E_AUTH_BYPASS=true` | services |
| `npm run test:e2e:browser` | Playwright with real dev Clerk credentials | services, Clerk |
| `npm run test:coverage` | unit + integration under V8 coverage (reported, never enforced) | services |
| `npm run verify:pr` | CI's test and build stages (`--stage=static\|unit\|coverage\|build\|e2e`); gitleaks, the dependency audit, the eval preflight and the Clerk browser contract run only in CI | services |

During a change, typecheck and run the targeted tests for what you touched. Leave
`verify:pr` to CI unless something justifies a full local run.

**Which suite a file belongs to is decided by its name**, the same way in every
workspace, and `npm run lint:structure` rejects a file no suite owns:
`*.integration.test.ts(x)` needs services and runs in the integration suite; any other
`*.test.ts(x)` is unit. `packages/db` has integration tests only.

Unit tests must not need Postgres, Redis, Playwright, provider credentials or network.

## Test environment

- `npm run test:services:up` starts Postgres and Redis from `docker-compose.test.yml`;
  `test:integration` and `test:coverage` bootstrap the DB package and run migrations.
  Local development shares these containers but uses `shopkeeper_dev` and Redis DB 1;
  tests use `clerk_test` and Redis DB 0. Do not flush all Redis databases in tests.
  Integration tasks always execute; Turbo does not cache their database-dependent results.
- In `apps/dashboard` and `apps/gateway`, Vitest setup installs a fetch guard: localhost
  and the configured local service URLs are allowed, every other host is blocked.
  Package tests run without it, so mock fetch there yourself (`vi.stubGlobal('fetch', …)`,
  SDK mocks, injected dependencies). For a fixture host, use `allowTestNetworkHosts` from
  `scripts/test-network-guard.mjs`; don't add env flags to bypass the guard.
- `test-setup.ts` defaults `E2E_TEST_RUN=true` because the rate limiter fails closed
  without Upstash; a wall of 429s means that flag got unset.
- A dashboard test signs in with `mockClerkSession()`
  (`apps/dashboard/src/test-fixtures/clerk-session.ts`), which also confirms the Clerk
  membership `getOrCreateOrg` checks; the file still mocks `@clerk/nextjs/server` itself.
- `with-test-env.mjs` loads `apps/dashboard/.env.local` and `apps/gateway/.env`, so a
  real `ANTHROPIC_API_KEY` is usually present locally.
- `.githooks/pre-push` runs `npm run typecheck`; enable it with
  `git config core.hooksPath .githooks`.
- In a sandboxed shell, Next builds can fail to bind a worker port and integration/E2E
  can be denied the Postgres socket. That is inconclusive, not a failure — rerun with
  local access or in CI.

## Agent evals (paid — run only when asked)

The live-model harness is `apps/dashboard/src/lib/agent/__evals__`: JSON fixtures, a
judge, and `recorded-stochastic-core-fixtures.json` for the two core cases that stay
off the hard release gate. Free checks live in `harness.integration.test.ts`; paid cases
in `index.integration.test.ts`. Both skip unless `EVAL_RUN=1` or `REQUIRE_MODEL_EVALS=1`,
so ordinary runs never bill. Path-triggered pushes run only the free deterministic
preflight in `evals.yml`. A second paid suite, the order-ops eval
(`apps/gateway/src/order-ops.eval.integration.test.ts`,
`npm run test:evals -w apps/gateway`), follows the same skip and ceiling rules.

Each suite has one paid command, `test:evals`, and it refuses to start without both
ceilings, `EVAL_MAX_USD` and `EVAL_MAX_MODEL_CALLS`; the call cap is the strict backstop.
The canonical paid run is a manual dispatch of `evals.yml` (`release` or `targeted`),
which sizes both suites' ceilings before any model call:

```sh
gh workflow run evals.yml -f mode=release -f max_usd=0.90 -f max_model_calls=120
```

Locally, run one fixture for diagnosis:

```sh
EVAL_MAX_USD=0.10 EVAL_MAX_MODEL_CALLS=20 EVAL_FIXTURE=refund-partial \
  npm run test:evals -w apps/dashboard
```

Scope comes from env: `EVAL_FIXTURE`, `EVAL_SUITE` (`core`/`full`), `EVAL_REPEATS`, and
`RUN_JUDGE_EVALS=1`. Paid budget sizing reads `eval-budget-evidence.json`, not a full
pass-rate baseline.

The test database must be up: with Postgres down every fixture fails before any model
call (`calls=0`). Evals cannot see the Shopify layer — every Shopify tool result is
simulated — so a broken Shopify tool only shows up when you try it against the dev store.
