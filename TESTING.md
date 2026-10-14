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

**Which suite a file belongs to is decided by its name**, and `npm run lint:structure`
rejects a file no suite owns:

- `apps/dashboard`, `apps/gateway`: `*.unit.test.ts(x)` is unit; any other `*.test.ts(x)`
  is integration.
- `packages/agent`: `*.integration.test.ts` is integration; any other `*.test.ts` is
  unit.
- `packages/db`: integration only — every test is `*.integration.test.ts`.
- Other packages (`analytics`, `email`, `integrations`, `shared`): unit.

Unit tests must not need Postgres, Redis, Playwright, provider credentials or network.

## Test environment

- `npm run test:services:up` starts Postgres and Redis from `docker-compose.test.yml`;
  `test:integration` and `test:coverage` bootstrap the DB package and run migrations.
- In `apps/dashboard` and `apps/gateway`, Vitest setup installs a fetch guard: localhost
  and the configured local service URLs are allowed, every other host is blocked.
  Package tests run without it, so mock fetch there yourself (`vi.stubGlobal('fetch', …)`,
  SDK mocks, injected dependencies). For a fixture host, use `allowTestNetworkHosts` from
  `scripts/test-network-guard.mjs`; don't add env flags to bypass the guard.
- `test-setup.ts` defaults `E2E_TEST_RUN=true` because the rate limiter fails closed
  without Upstash; a wall of 429s means that flag got unset.
- `with-test-env.mjs` loads `apps/dashboard/.env.local` and `apps/gateway/.env`, so a
  real `ANTHROPIC_API_KEY` is usually present locally.
- `.githooks/pre-push` runs `npm run typecheck`; enable it with
  `git config core.hooksPath .githooks`.
- In a sandboxed shell, Next builds can fail to bind a worker port and integration/E2E
  can be denied the Postgres socket. That is inconclusive, not a failure — rerun with
  local access or in CI.

## Agent evals (paid — run only when asked)

The live-model harness is `apps/dashboard/src/lib/agent/__evals__`: JSON fixtures, a
committed `baseline.json`, and a judge. Eval test files are swept into integration runs
but skip unless `EVAL_RUN=1` or `REQUIRE_MODEL_EVALS=1`, so ordinary runs never bill.
Pull requests run only a free deterministic preflight. A second paid suite, the order-ops
eval (`apps/gateway/src/order-ops.eval.test.ts`, `npm run test:evals -w apps/gateway`),
follows the same skip and ceiling rules.

Every paid command refuses to start without both ceilings, `EVAL_MAX_USD` and
`EVAL_MAX_MODEL_CALLS`; the call cap is the strict backstop.

```sh
# one fixture, for diagnosis
EVAL_MAX_USD=0.10 EVAL_MAX_MODEL_CALLS=20 EVAL_FIXTURE=refund-partial \
  npm run test:evals:fixture -w apps/dashboard
# every fixture in fixtures/ (core and extended); the refusal message prints ceilings
EVAL_CONFIRM=1 EVAL_MAX_USD=0.76 EVAL_MAX_MODEL_CALLS=149 npm run test:evals -w apps/dashboard
# 3-repeat baseline comparison; test:evals:baseline:overwrite rewrites baseline.json
EVAL_CONFIRM=1 EVAL_MAX_USD=2.58 EVAL_MAX_MODEL_CALLS=446 npm run test:evals:baseline -w apps/dashboard
```

In CI, paid modes are a manual `workflow_dispatch` of `evals.yml` with `max_usd` and
`max_model_calls`.

The test database must be up: with Postgres down every fixture fails before any model
call (`calls=0`). Evals cannot see the Shopify layer — every Shopify tool result is
simulated — so a broken Shopify tool only shows up when you try it against the dev store.
