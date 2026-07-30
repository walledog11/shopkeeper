# Production Deployment

This runbook covers the repo-side production deployment path for the dashboard on Vercel and the gateway on Railway.

## Prerequisites

- Production Neon Postgres database created.
- Production Upstash Redis created for the dashboard (rate limiting, locks, presence) in the same region as Vercel.
- Dedicated Redis created for the gateway's BullMQ queues (e.g. Railway Redis), **separate** from Upstash, with `maxmemory-policy=noeviction` and persistence enabled.
- `DATABASE_URL` uses the production database and includes `pgbouncer=true&connection_limit=1`.
- `DIRECT_DATABASE_URL` uses the same Neon database over the direct (non-pooler) host. Prisma uses it for migrations; both apps need it set because the schema declares `directUrl`.
- Gateway `REDIS_URL` points at its dedicated Redis: Railway private networking uses `redis://...redis.railway.internal`; managed Redis over the public internet uses the TLS form `rediss://...`. Do not point it at Upstash.
- A new production-only `INTERNAL_API_SECRET` has been generated.
- Production env vars from [`checklist.md`](checklist.md) are populated in Vercel and Railway.
- V1 launch env covers email and Shopify. Meta, Twilio, and USPS vars are optional until those channels are reintroduced.
- Clerk lifecycle webhook endpoint is configured to `https://<dashboard>/api/webhooks/clerk`, and the dashboard has `CLERK_WEBHOOK_SECRET`.
- Separate staging and production PostHog projects are available before product analytics is enabled.

## Deploy Order

1. Set or update production env vars in Vercel and Railway.
2. Run the production DB migration — see [Database Migrations](#database-migrations) for the exact command and env vars.
3. Deploy the dashboard to Vercel.
4. Deploy the gateway to Railway.
5. Confirm no migration lagged the code (see [Verify what is actually applied](#verify-what-is-actually-applied)).

## Database Migrations

Every migration runs through `prisma migrate deploy` against
`packages/db/prisma/schema.prisma`. **Nothing applies them automatically.** The
Vercel build is `next build`, the Railway build is `tsc`, and CI only ever
migrates a throwaway local database. A production migration is applied because a
human ran it — which is why the failures at the end of this section keep
recurring.

Apply an additive migration **before** deploying the build that reads the new
columns, and treat destructive cleanup as a separate later release.

### Env vars by context

The datasource declares both URLs, so Prisma resolves **both** variables
everywhere — even in contexts that never migrate:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")         // pooled (PgBouncer)
  directUrl = env("DIRECT_DATABASE_URL")  // direct host; migrations travel over this
}
```

| Context | `DATABASE_URL` | `DIRECT_DATABASE_URL` | Runs migrations? |
|---------|----------------|-----------------------|------------------|
| Production migration run (your machine) | pooled Neon host + `?pgbouncer=true&connection_limit=1` | direct Neon host + `?sslmode=require` | **Yes — this is the only path that migrates production** |
| Vercel (dashboard) | pooled Neon host | direct Neon host | No — `next build` only |
| Railway (gateway server + worker) | pooled Neon host | direct Neon host | No — `npm run build` is compile-only |
| Local tests | injected by `scripts/with-test-env.mjs` | same value | Yes — via `scripts/test-bootstrap.mjs` |
| CI | same as local tests | same value | Yes — same bootstrap, against the CI service container |

Set both variables in Vercel and Railway even though neither platform migrates:
the schema declares `directUrl`, so both must resolve at client initialization.

The local/CI test database defaults to
`postgresql://postgres:postgres@127.0.0.1:55432/clerk_test?schema=public` and is
overridden with `TEST_DATABASE_URL`. It is never a deployed database.

### Commands

Production — run before deploying the build that depends on the migration:

```bash
DATABASE_URL='postgresql://...@ep-....-pooler.us-east-2.aws.neon.tech/neondb?pgbouncer=true&connection_limit=1' \
DIRECT_DATABASE_URL='postgresql://...@ep-....us-east-2.aws.neon.tech/neondb?sslmode=require' \
npm run db:migrate:deploy
```

Local and CI — `test:integration` bootstraps the schema itself, so a new
migration needs no separate step:

```bash
npm run test:services:up
npm run test:integration     # runs scripts/test-bootstrap.mjs -> prisma migrate deploy
```

To apply new migrations to the local test database without running the suite:

```bash
npm run test:services:up
node scripts/test-bootstrap.mjs
```

### Verify what is actually applied

Merging and deploying a feature does **not** imply its migration ran. Check
explicitly, with production env injected and no credentials on your clipboard:

```bash
railway run npx prisma migrate status --schema=packages/db/prisma/schema.prisma
```

Run this after every deploy that included a migration, and whenever a tool
starts failing-and-warning for no apparent reason.

### Known failures this prevents

- **2026-07-22** — the B3/B4 watch-table migrations (`add_return_watches`,
  `add_shipment_watches`) were found unapplied in production two days after
  their code shipped, so their tool-success recording had been failing and
  warning the entire time. They were applied together with B5's
  `add_follow_up_watches`.
- **2026-07-28** — release verification found the additive
  `20260723000000_add_operator_pending_plans` migration had never been applied,
  well after the feature merged. Applying it brought production current at all
  62 migrations.

Both were caught by `migrate status`, not by an error at deploy time.

## Config Notes

- Railway start command is `npm run start -w apps/gateway`.
- `nixpacks.toml` mirrors that start command.
- `GATEWAY_RUNTIME_ROLE=all` is the default. For split Railway services, use `server` on the web service and `worker` on the background worker service while keeping the same start command.
- Upstash Redis free tier is usually not enough for always-on BullMQ workers. Use Upstash pay-as-you-go/fixed pricing or another Redis deployment for production.
- The gateway exposes cost-tuning env vars for BullMQ and health polling:
  `GATEWAY_BULLMQ_DRAIN_DELAY_SECONDS`,
  `GATEWAY_BULLMQ_STALLED_INTERVAL_MS`,
  `GATEWAY_WORKER_HEARTBEAT_INTERVAL_MS`,
  `GATEWAY_WORKER_HEARTBEAT_TTL_SECS`,
  `GATEWAY_WORKER_HEARTBEAT_STALE_MS`,
  `GATEWAY_QUEUE_DIAGNOSTICS_CACHE_MS`,
  `GATEWAY_ENABLE_MAINTENANCE_WORKERS`.
- Vercel and Railway build the shared DB and agent packages before their apps so package output is current during deploy.
- **Dashboard (Vercel):** `next build` only; no Level 2 error-tracking SDK or source-map upload step at launch (see [error-tracking-plan.md](error-tracking-plan.md)).
- **Gateway (Railway):** `npm run build` is compile-only (`tsc`); no source-map upload at launch.
- The dashboard health endpoint is `/api/health`.
- The gateway readiness endpoints are `/health/deep` and `/health/queues`.
- Ops alerts emit structured Pino logs with `opsAlert: true` when thresholds are crossed. See [`runbook.md`](runbook.md) for validation steps.

### Product Analytics

Both dashboard and gateway require an explicit `PRODUCT_ANALYTICS_ENABLED` value in production.
Deploy new instrumentation with capture disabled first:

```dotenv
PRODUCT_ANALYTICS_ENABLED=false
POSTHOG_PROJECT_TOKEN=<project-token>
POSTHOG_HOST=https://us.i.posthog.com
```

When enabled, use the token for the environment-specific PostHog project. Product analytics is
server-only and organization-scoped; do not add a browser PostHog key or enable autocapture,
session replay, cookies, or person profiles.

Before enabling production capture:

1. enable and review every event in staging;
2. confirm raw payloads contain no names, addresses, message content, prompts, provider identifiers,
   credentials, or provider payloads;
3. confirm deterministic retries retain one unique event;
4. save and verify the four reports specified in
   [`posthog-reports.md`](posthog-reports.md); and
5. assign an owner to monitor analytics-delivery warnings for the first production week.

## Post-Deploy Verification

Run the env preflight before deploy:

```bash
npm run verify:production:env
```

Or validate the app env files directly:

```bash
node scripts/check-production-env.mjs dashboard --scope=launch --env-file=apps/dashboard/.env.local
node scripts/check-production-env.mjs gateway --scope=launch --env-file=apps/gateway/.env
```

After deploy, run the production smoke check:

```bash
npm run verify:production
```

Also confirm no migration lagged the code — see
[Verify what is actually applied](#verify-what-is-actually-applied).

For the product analytics rollout, complete one controlled workspace journey after enabling capture
and verify both the raw events and saved reports. Do not backfill events from before deployment.

See [`runbook.md`](runbook.md) for operational procedures.
