# Production Checklist

Last reviewed: 2026-06-28.

This is the short release gate for production readiness. Keep detailed deploy procedure in
[deployment.md](deployment.md) and operational response steps in [runbook.md](runbook.md).

## Pre-Release Gate

Run these from the repo root before cutting a production release candidate:

```bash
npx prisma validate --schema=packages/db/prisma/schema.prisma
npm run verify:production:env
npm run test:integration
npm run verify:pr
```

Notes:

- `npm run verify:production:env` validates the current shell by default. To validate app env
  files directly, use the commands in [runbook.md](runbook.md#deploy-sequence).
- `npm run verify:pr` already includes lint, unit tests, node tests, integration tests, e2e smoke,
  coverage, and build. Keep the standalone integration run in the gate because it fails earlier and
  is the most likely release-blocking suite.
- In sandboxed local environments, Next/Turbopack builds can require permission to bind an internal
  worker port. Treat that sandbox-only bind failure as inconclusive and rerun in CI or a normal
  developer shell.

## Deploy Gate

- Vercel and Railway production env vars are populated for the launch scope in
  [runbook.md](runbook.md#environment-matrix).
- `PRODUCT_ANALYTICS_ENABLED` is explicitly set for both applications. Keep it `false` until the
  privacy policy is deployed, staging payload review passes, and production reports are saved.
- Production migrations are run with both pooled `DATABASE_URL` and direct `DIRECT_DATABASE_URL`
  set, as shown in [deployment.md](deployment.md#deploy-order).
- Dashboard deploy completes and `GET /api/health` returns healthy.
- Gateway deploy completes and `GET /health/deep` plus `GET /health/queues` return healthy.
- `npm run verify:production` passes against the live dashboard and gateway URLs.

## Sign-Off Gate

Before marking production ready, record the evidence listed in
[runbook.md](runbook.md#sign-off-evidence):

- ops-alert log routing and one controlled alert for each guardrail category
- Better Stack monitors for dashboard health, gateway deep health, and gateway queue health
- Neon PITR status and retention window
- at least one real inbound message through webhook, queue, dashboard, plan generation, and outbound
  reply
- product analytics staging payload review, deterministic retry verification, saved report URLs,
  and the owner for first-week delivery-warning monitoring

Remaining readiness work lives in [../to-do-list.md](../to-do-list.md). Do not treat unchecked
pre-release items there as complete unless they are explicitly deferred by the launch owner.
