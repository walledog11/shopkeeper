# Production Runbook

How to deploy and operate the dashboard (Vercel) and gateway (Railway): env contract, deploy and
migrations, monitoring, triage, recovery, and channel smoke tests. Open work lives in
[../ROADMAP.md](../ROADMAP.md), not here.

## Runtime Contract

**Dashboard** — Vercel, `https://app.useshopkeeper.com`, built by [vercel.json](../../vercel.json),
env validated in [apps/dashboard/src/lib/env/index.ts](../../apps/dashboard/src/lib/env/index.ts).
Health ([apps/dashboard/src/app/api/health/route.ts](../../apps/dashboard/src/app/api/health/route.ts)):

- `GET /api/health` — liveness only, touches no dependency.
- `GET /api/health/deep` — env, DB, Redis; `503` with `{"status":"degraded"` when any fails.

**Gateway** — Railway, `https://clerk-production-e37f.up.railway.app` (pre-rebrand name, never
merchant-visible; renaming it means re-pointing every registered webhook in one sitting). Services
`shopkeeper` (public server) and `Gateway Worker` when split. Start config [railway.json](../../railway.json),
supervisor [apps/gateway/src/start.ts](../../apps/gateway/src/start.ts), env validated in
[apps/gateway/src/config/env.ts](../../apps/gateway/src/config/env.ts) and
[scripts/lib/production-config-schema.mjs](../../scripts/lib/production-config-schema.mjs).
Health ([apps/gateway/src/health.ts](../../apps/gateway/src/health.ts)):

- `GET /health` — liveness only, touches no dependency.
- `GET /health/deep` — DB, Redis, worker heartbeat, queue diagnostics (`503` when any fails), plus `checks.imessage.configured`.
- `GET /health/queues` — needs `x-internal-secret`; queue counts, heartbeat, failed-job tenant
  identifiers. Never give it to a third-party poller.

**Tooling** — `npm run verify:production:env` ([scripts/check-production-env.mjs](../../scripts/check-production-env.mjs)),
`npm run verify:production` ([scripts/verify-production.mjs](../../scripts/verify-production.mjs)),
`npm run verify:production:alerts` ([scripts/verify-production-alerts.mjs](../../scripts/verify-production-alerts.mjs)).
Rollout/retirement audits: [../audit-commands.md](../audit-commands.md). Gateway one-off scripts:
[apps/gateway/src/scripts/README.md](../../apps/gateway/src/scripts/README.md).

## Platform Commands

### Vercel

- Install: `npm install --ignore-scripts && npm run build -w @shopkeeper/shared && npm rebuild @shopkeeper/db`
- Build:

```bash
npx prisma generate --schema=packages/db/prisma/schema.prisma && npm run build -w packages/db && npm run build -w packages/agent && npm run build -w packages/integrations && npx turbo run build --filter=shopkeeper-dashboard
```

- Output directory: `apps/dashboard/.next`

### Railway

- Start (also in `nixpacks.toml`): `npm run start -w apps/gateway` — `dist/start.js` launches server and worker.
- Build (`railway.json`, mirrored in `nixpacks.toml`; also the local validation path):

```bash
npx turbo run build --filter=shopkeeper-gateway
```

- **Never expand that into a literal sequence of `npm run build -w <package>` steps.** turbo orders
  builds from each package's own dependencies; a written-out list is a second copy of the
  dependency graph and goes stale the moment a package gains a workspace dependency (that is how
  `@shopkeeper/email` importing `@shopkeeper/agent` broke a gateway deploy). Verify a build-order
  change by deleting every `packages/*/dist` first — a stale artifact makes the wrong order pass. A
  custom build command in the Railway console must be the one above.
- `GATEWAY_RUNTIME_ROLE`: `all` (default) | `server` (web service) | `worker` (background service); same start command.
- Cost-tuning env vars: `GATEWAY_BULLMQ_DRAIN_DELAY_SECONDS`, `GATEWAY_BULLMQ_STALLED_INTERVAL_MS`,
  `GATEWAY_WORKER_HEARTBEAT_INTERVAL_MS`, `GATEWAY_WORKER_HEARTBEAT_TTL_SECS`,
  `GATEWAY_WORKER_HEARTBEAT_STALE_MS`, `GATEWAY_QUEUE_DIAGNOSTICS_CACHE_MS`, `GATEWAY_ENABLE_MAINTENANCE_WORKERS`.

Both platforms build the shared packages before their app. Neither uploads source maps (dashboard
errors go to `@sentry/nextjs`; the gateway build is compile-only `tsc`). **Neither runs migrations** — see [Migrations](#migrations).

## Prerequisites

- **Neon Postgres.** `DATABASE_URL` = pooled host with `pgbouncer=true`; `DIRECT_DATABASE_URL` = same
  database on the direct (non-`-pooler`) host. Both apps need both (the schema declares
  `directUrl`). Pool size and deadlines come from `DB_POOL_MAX`, `DB_CONNECT_TIMEOUT_MS`,
  `DB_POOL_WAIT_TIMEOUT_MS`, `DB_QUERY_TIMEOUT_MS` (`databasePoolConfig` in `packages/db/pool-config.ts`),
  which override any `connection_limit` in the URL.
- **Upstash Redis** for the dashboard (rate limits, locks, presence), same region as Vercel.
- **A dedicated Redis for gateway BullMQ** (e.g. Railway Redis) with `maxmemory-policy=noeviction`
  and persistence — never Upstash, whose per-command billing runs away under always-on workers (the
  gateway warns at boot). Railway private networking: `redis://...redis.railway.internal`; over the internet: `rediss://...`.
- **Secrets.** `INTERNAL_API_SECRET` (production-only, same on both apps), `TOKEN_ENCRYPTION_KEY`
  (same on both apps; test a PITR restore after changing it), `OAUTH_ATTEMPT_SECRET` (dashboard, ≥ 32 chars).
  Both apps also accept `INTERNAL_API_SECRET_PREV`, so rotate without downtime: (1) set `_PREV` to
  the new value on both and deploy both; (2) swap (`INTERNAL_API_SECRET`=new, `_PREV`=old) and deploy both; (3) clear `_PREV`.
- **Clerk lifecycle webhook** at `https://<dashboard>/api/webhooks/clerk`, secret in dashboard `CLERK_WEBHOOK_SECRET`.
- **Separate staging and production PostHog projects** before analytics is enabled.

## Environment Matrix

Names and comments live in each app's `.env.example`; the contract the preflight enforces is
`CONTRACTS` in `scripts/check-production-env.mjs`. Dashboard `UPSTASH_REDIS_REST_URL` and gateway
`REDIS_URL` are **separate** instances. Redis locks are host-local latency guards; cross-host
single-use lives in Postgres (plan claims, operator-event claims, goodwill reservations), as does the
daily LLM spend cap (`llm_daily_spend`).

### Dashboard

- **Boot:** `DATABASE_URL`, `DIRECT_DATABASE_URL`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
  `ANTHROPIC_API_KEY`, `INTERNAL_API_SECRET`, `APP_URL`, `TOKEN_ENCRYPTION_KEY`, `OAUTH_ATTEMPT_SECRET`,
  `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `PRODUCT_ANALYTICS_ENABLED`,
  `PLAN_EXECUTION_LEDGER_MODE`. The runtime also refuses production boot without `BLOB_READ_WRITE_TOKEN`.
- **Launch:** `GATEWAY_INTERNAL_URL` (the **public** gateway URL despite the name — every dashboard →
  gateway hop: outbound-email enqueue, operator turns, storefront chat, dev webhook proxies), `POSTMARK_API_KEY`, `INBOUND_EMAIL_DOMAIN`,
  `BLOB_READ_WRITE_TOKEN` (private attachments, served by `GET /api/attachments`), `SHOPIFY_CLIENT_ID`,
  `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_APP_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `PRICE_ID_STARTER`, `PRICE_ID_PRO`, `CLERK_WEBHOOK_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GMAIL_PUBSUB_TOPIC` (`projects/<project>/topics/<topic>`), `IMESSAGE_LINE_HANDLE` (the handle
  merchants text; not a secret), `INSTAGRAM_INTEGRATION_ENABLED` (see [Instagram](#instagram-dm)).
- **Optional:**
  - `NEXT_PUBLIC_APP_URL` — if set, must equal `APP_URL` (equality-checked in production).
  - `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` (required when `INSTAGRAM_INTEGRATION_ENABLED=true`);
    `INSTAGRAM_BETA_ORG_IDS` (Clerk org IDs allowed a new direct-Meta connect — empty allows **no one**
    in production); `INSTAGRAM_WEBHOOK_APP_SECRET` (local webhook proxy only).
  - `SOCIALAPI_API_KEY`, `SOCIALAPI_ENABLED`, `SOCIALAPI_BRAND_ASSIGNMENTS` (`clerk_org_id:brand_id`
    pairs), `SOCIALAPI_MAX_ACTIVE_ORGS`, `SOCIALAPI_BASE_URL` (test override only) — see
    [socialapi-transport-plan.md](../socialapi-transport-plan.md).
  - `STOREFRONT_CHAT_ENABLED` (off unless exactly `true`), `STOREFRONT_CHAT_SIGNING_SECRET` (must not equal `INTERNAL_API_SECRET`).
  - `NEXT_PUBLIC_GATEWAY_EVENTS_URL` — gateway base for live-inbox SSE (pairs with gateway `GATEWAY_REALTIME_ENABLED=true`); empty disables realtime.
  - `TELEGRAM_BOT_USERNAME`, `NEXT_PUBLIC_CONTACT_EMAIL`, `POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST` (see [Product Analytics](#product-analytics)).

### Gateway

- **Boot:** `DATABASE_URL`, `DIRECT_DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`, `INTERNAL_API_SECRET`,
  `DASHBOARD_URL`, `TOKEN_ENCRYPTION_KEY`, `PRODUCT_ANALYTICS_ENABLED`, `PLAN_EXECUTION_LEDGER_MODE`,
  plus `POSTMARK_INBOUND_USERNAME`/`POSTMARK_INBOUND_PASSWORD` unless `EMAIL_INBOUND_MODE=gmail-only`.
- **Launch:** `SHOPIFY_APP_SECRET`, `POSTMARK_INBOUND_USERNAME`, `POSTMARK_INBOUND_PASSWORD` (basic
  auth on `/webhooks/email/inbound` and `/webhooks/email/bounce`), `BLOB_READ_WRITE_TOKEN`,
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_PUBSUB_TOPIC`, `GMAIL_PUBSUB_AUDIENCE`,
  `GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT` (audience and account must exactly match the push
  subscription), `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET`, `SPECTRUM_WEBHOOK_SECRET` (one
  platform-wide Photon project; the webhook secret is per-endpoint and changes if it is recreated).
- **Optional:**
  - `EMAIL_INBOUND_MODE` — `standard` (default; both adapters, transport chosen per integration) |
    `postmark` (Gmail sync off globally) | `gmail-only` (no Postmark inbound creds). Legacy `hybrid` reads as `standard`.
  - `INSTAGRAM_WEBHOOK_APP_SECRET` (the parent Meta app secret that owns the webhook subscription,
    not the Instagram Login secret), `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` — direct-Meta DM webhooks.
  - `SOCIALAPI_WEBHOOK_SECRET` (returned once when `/webhooks/socialapi` is registered), `SOCIALAPI_API_KEY` (display-name enrichment only).
  - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`; `OPS_ALERT_TELEGRAM_CHAT_ID` (see [Ops alerts](#ops-alerts));
    `GATEWAY_REALTIME_ENABLED`; `POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST`.

**Rules:** `APP_URL`, `DASHBOARD_URL` and `GATEWAY_INTERNAL_URL` are absolute `http(s)` URLs.
`DASHBOARD_INTERNAL_URL` is dev-only (the gateway warns if set in production). `DIRECT_DATABASE_URL`
uses the direct host (no `-pooler`, no `pgbouncer=true`) and differs from `DATABASE_URL`.

### Plan-execution ledger

`PLAN_EXECUTION_LEDGER_MODE` must be `enforce` on the dashboard and both gateway services; Postgres
is the single-use boundary for reviewed plans. `off` makes every plan execution refuse ("Durable
proposals require the execution ledger") — an emergency stop, not a rollback. A stored `shadow` reads
as `enforce`. After any change, run `npm run verify:production` and:

```bash
railway run --service shopkeeper --environment production -- \
  npm run audit:plan-executions -- --hours=240 --strict
railway run --service shopkeeper --environment production -- \
  npm run audit:unknown-outcomes -- --hours=240 --strict
```

Require no unknown outcomes or stale claims. For an `unknown` execution, establish provider truth
before any fresh instruction; never reset the row to `pending` or replay it.

## Deploy Sequence

1. **URLs.** `APP_URL` (and `NEXT_PUBLIC_APP_URL` if set) = dashboard origin; dashboard
   `GATEWAY_INTERNAL_URL` = public gateway URL; gateway `DASHBOARD_URL` = public dashboard URL.
2. **Env.** Boot variables first, launch-scope ones before turning on real providers. Run
   `npm run verify:production:env` (boot-only: `-- --scope=boot`), or against env files:

```bash
node scripts/check-production-env.mjs dashboard --scope=launch --env-file=apps/dashboard/.env.local
node scripts/check-production-env.mjs gateway --scope=launch --env-file=apps/gateway/.env
```

3. **Migrate** before deploying the build that reads new schema ([Applying one](#applying-one)).
4. **Dashboard.** Deploy; `GET /api/health/deep` returns `status: ok`.
5. **Gateway.** Deploy; `GET /health/deep` returns `status: ok` (`checks.worker.status: ok` is the
   worker heartbeat); queue detail on `GET /health/queues` with `x-internal-secret`.
6. **Smoke** (needs `INTERNAL_API_SECRET` in the environment — it checks `/health/queues`):

```bash
DASHBOARD_URL='https://app.useshopkeeper.com' \
GATEWAY_URL='https://clerk-production-e37f.up.railway.app' \
npm run verify:production
```

7. Run at least one real flow from [Channel Smoke Tests](#channel-smoke-tests-and-recovery), and
   `migrate status` if the release carried a migration ([Verify](#verify-what-is-actually-applied)).

## Release Checklist

Before cutting a release candidate, from the repo root:

```bash
npx prisma validate --schema=packages/db/prisma/schema.prisma
npm run verify:production:env
npm run verify:pr   # the contract CI runs (lint, Knip, typecheck, unit, node, e2e smoke, coverage incl. integration suites, build); a green CI run counts
```

A sandboxed Next/Turbopack build that cannot bind an internal worker port is inconclusive, not a
failure — rerun in CI or a normal shell. Then the deploy gate, all of:

- launch-scope env populated on both platforms; `PRODUCT_ANALYTICS_ENABLED` and `PLAN_EXECUTION_LEDGER_MODE` explicitly set on both apps;
- migrations applied with both database URLs, and `migrate status` shows none lagging its code;
- dashboard `/api/health/deep`, gateway `/health/deep` and `/health/queues` healthy; `npm run verify:production` passes;
- one real inbound message completes webhook → queue → worker → dashboard thread → plan → outbound reply.

## Migrations

Every migration runs through `prisma migrate deploy` against `packages/db/prisma/schema.prisma`.
**Nothing applies them automatically** (Vercel runs `next build`, Railway runs `tsc`, CI only migrates
a throwaway database). Apply an additive migration **before** deploying the build that reads it;
ship destructive cleanup as a separate later release.

### Writing one

Production carries partial indexes `schema.prisma` cannot declare (Prisma 6.19.3 has no `where` on
`@@unique`/`@@index`), created by raw SQL: `threads_one_open_per_customer`,
`messages_org_external_id_unique`, `integrations_non_email_account_unique`,
`integrations_instagram_organization_unique`, `integrations_instagram_account_unique`,
`integrations_shopify_account_unique`, `integrations_provider_account_unique`, and the non-unique
`messages_pending_inbound_processing_idx`. `prisma migrate dev` diffs a shadow database against the
schema and emits a `DROP INDEX` for each inside whatever migration you author — silently removing
inbound dedupe, open-thread race protection and the cross-tenant integration constraints at once.

- Hand-write the migration directory and `migration.sql`; apply with `prisma migrate deploy`.
  **Never run `prisma migrate dev` against this schema.**
- If you draft with `prisma migrate diff`, delete every `DROP INDEX`; check the saved file has none before applying.
- A migration that adds another raw-SQL index adds it to the list above and the query below.
- After it lands, confirm every listed index survived (all eight names must come back):

  ```sql
  SELECT indexname FROM pg_indexes WHERE indexname IN (
    'threads_one_open_per_customer', 'messages_org_external_id_unique',
    'integrations_non_email_account_unique', 'integrations_instagram_organization_unique',
    'integrations_instagram_account_unique', 'integrations_shopify_account_unique',
    'integrations_provider_account_unique', 'messages_pending_inbound_processing_idx');
  ```

**Run prisma from the repo root, never from inside `packages/db`.** That directory's `.env` points at
production Neon and *overrides* an inline `DATABASE_URL`, so
`cd packages/db && DATABASE_URL=…local… npx prisma migrate deploy` silently targets production. Read
the `Datasource "db": … neon.tech` line before trusting where a migration went. Some audits gate
specific migrations (`audit:agent-action-operation-keys`, `audit:retired-channel-types`) — see
[../audit-commands.md](../audit-commands.md).

### Env vars by context

The datasource declares `url = env("DATABASE_URL")` (pooled) and `directUrl = env("DIRECT_DATABASE_URL")`
(migrations travel over it), so Prisma resolves both everywhere — set both on Vercel and Railway too.

| Context | `DATABASE_URL` | `DIRECT_DATABASE_URL` | Migrates? |
|---------|----------------|-----------------------|-----------|
| Production migration run (your machine) | pooled Neon host + `?pgbouncer=true` | direct host + `?sslmode=require` | **Yes — the only path that migrates production** |
| Vercel / Railway | pooled Neon host | direct Neon host | No |
| Local tests | injected by `scripts/with-test-env.mjs` | same value | Yes — `scripts/test-bootstrap.mjs` |
| CI | same as local tests | same value | Yes — same bootstrap, CI service container |

The test database defaults to `postgresql://postgres:postgres@127.0.0.1:55432/clerk_test?schema=public`
(override with `TEST_DATABASE_URL`); pass both URLs inline when targeting it by hand.

### Applying one

```bash
DATABASE_URL='postgresql://...@ep-....-pooler.us-west-2.aws.neon.tech/neondb?pgbouncer=true' \
DIRECT_DATABASE_URL='postgresql://...@ep-....us-west-2.aws.neon.tech/neondb?sslmode=require' \
npm run db:migrate:deploy
```

Locally, `test:integration` bootstraps the schema itself; to apply without running the suite:
`npm run test:services:up && node scripts/test-bootstrap.mjs`.

### Verify what is actually applied

**A migration that ships behind its code is an outage, not a lag.** Deploying does not mean the
migration ran. With production env injected:

```bash
railway run npx prisma migrate status --schema=packages/db/prisma/schema.prisma
```

Run it after every deploy that carried a migration, before closing anything that adds a table or
column, and whenever a tool starts failing-and-warning for no apparent reason.

## Webhook Routing

Point provider traffic directly at the gateway. The dashboard's `/api/webhooks/meta`,
`/api/webhooks/email` and `/api/webhooks/tiktok-shop` routes are local-development proxies.

| Provider | Production URL |
| --- | --- |
| Shopify (orders, `app/uninstalled`, compliance — declared in `shopify.app.toml`) | `https://<gateway>/webhooks/shopify` |
| Postmark inbound / bounce | `https://<gateway>/webhooks/email/inbound`, `/webhooks/email/bounce` |
| Gmail Pub/Sub push | `https://<gateway>/webhooks/gmail/push` |
| Telegram | `https://<gateway>/webhooks/telegram` |
| Photon Spectrum (iMessage operator) | `https://<gateway>/webhooks/photon` |
| SocialAPI (Instagram) | `https://<gateway>/webhooks/socialapi` |
| Meta (direct Instagram) | `https://<gateway>/webhooks/meta` |
| TikTok Shop (gated off) | `https://<gateway>/webhooks/tiktok-shop` |
| Clerk lifecycle | `https://<dashboard>/api/webhooks/clerk` |
| Stripe | `https://<dashboard>/api/billing/webhook` |

The storefront-chat app proxy (`/apps/shopkeeper-chat`) targets
`https://app.useshopkeeper.com/api/storefront-chat/proxy`. Shopify app config and its rollback:
[shopify-app-config-reference.md](shopify-app-config-reference.md).

## Monitoring

### External monitors

Better Stack free tier, configured in its console; keep its tokens out of the repo.

| Monitor | URL | Required keyword |
| --- | --- | --- |
| `Shopkeeper Dashboard Health` | `https://app.useshopkeeper.com/api/health` | `{"status":"ok"` |
| `Shopkeeper Gateway Health` | `https://<gateway>/health` | `{"status":"ok"` |

- **Monitors must not query Postgres.** A `SELECT 1` every three minutes resets Neon's five-minute
  scale-to-zero timer, so the compute bills as always-on. If you ever monitor a `deep` route, use an
  interval well above five minutes.
- **Keep the leading brace in the keyword.** A bare `"status":"ok"` also matches a degraded deep
  response through its nested checks; `{"status":"ok"` only matches at the document root.
- Settings: `keyword`, `GET`, every 3 minutes (free-tier floor), 15 s timeout, verify SSL, follow
  redirects, region `us`, email the launch owner on failure **and** recovery. Test routing with
  Better Stack's test notification, never by taking production down.
- These see "the process is dead"; dependency failures surface through `/health/deep` and ops
  alerts. Drill down after an alert with `curl -H "x-internal-secret: $INTERNAL_API_SECRET" https://<gateway>/health/queues`.

### Ops alerts

Structured Pino logs with `opsAlert: true` and stable `category`, `service`, `tags`, `extra`,
`fingerprint` fields. Field names are a contract: rewording a message is safe, renaming a field
breaks routing. Categories (`OPS_ALERT_CATEGORIES` in `packages/agent/src/observability/ops-alerts.ts`):
`queue_health`, `webhook_signature`, `provider_send`, `provider_cleanup`, `agent_failure`,
`gmail_inbound`, `inbound_unclaimed`.

- **Gateway → Telegram.** Every alert raised through `emitOpsAlert` is pushed to the chat in
  `OPS_ALERT_TELEGRAM_CHAT_ID` (Railway); unset = log-only. Use a chat you own, never a merchant binding.
- **Dashboard → Sentry.** `agent_failure`, `provider_send` and `provider_cleanup` call
  `Sentry.captureMessage` with the alert fingerprint through the existing DSN; nothing to configure.
- **Log drains are not configured** (Vercel → Better Stack, plus a forwarder for Railway, which has
  no native drain). Until they are, a raw `logger.*({ opsAlert: true, … })` line that bypasses
  `emitOpsAlert` — `[OutboundSendSweep]`, `[UnknownOutcomeSweep]`, the operator-event sweep,
  workspace-deletion retry, Shopify `customers/data_request` — reaches **only** the Railway/Vercel
  log viewer. Search those logs for `opsAlert` during triage.

`apps/gateway/src/ops-alert-notify.ts` must keep three properties: it never uses
`clients/telegram-client.sendMessage` (which raises its own `provider_send` alerts — a Telegram
outage would alert about Telegram, over Telegram), and its sender records nothing and never throws;
the push carries only level, message and the tags `category`, `service`, `queue`, `provider`,
`channel`, `tool` — `extra`, `orgId` and `threadId` are dropped for the same reason `/health/queues`
is behind auth (Sentry keeps `extra`; it is private); dispatch is fire-and-forget after the log
write, and a suppressed alert never pushes.

Thresholds and defaults: `OPS_ALERTS_ENABLED=true` (`false` silences threshold alerts, not ordinary
logs), `OPS_ALERT_WINDOW_SECS=300`, `QUEUE_ALERT_FAILED_THRESHOLD=10`,
`QUEUE_ALERT_WAITING_THRESHOLD=100`, `QUEUE_ALERT_ACTIVE_STUCK_MS=900000`,
`WEBHOOK_SIGNATURE_ALERT_THRESHOLD=5`, `PROVIDER_SEND_ALERT_THRESHOLD=3`,
`AGENT_FAILURE_ALERT_THRESHOLD=3`, `UNCLAIMED_RECIPIENT_ALERT_THRESHOLD=5`. Route both apps to the
same launch owner; keep `service`, `queue`, `provider`, `channel`, `tool` visible, and do not route
by `orgId`, which fragments platform incidents.

### Controlled alert validation

Test org/user data only, in a safe window. Set `OPS_ALERT_WINDOW_SECS=60` and the threshold under
test to `1` on the target service; restore defaults afterwards.
`npm run verify:production:alerts -- --dry-run` prints every step.

Triggers that fire from the **deployed** process (prove the whole path, Telegram/Sentry included):

- `webhook_signature`: unsigned requests at the live gateway, each `401`:

  ```bash
  WEBHOOK_SIGNATURE_ALERT_THRESHOLD=1 \
  DASHBOARD_URL=https://app.useshopkeeper.com \
  GATEWAY_URL=https://clerk-production-e37f.up.railway.app \
  npm run verify:production:alerts -- --execute webhook_signature
  ```

- `agent_failure` (the only trigger that exercises Sentry): as an authenticated test-org user,
  `POST https://app.useshopkeeper.com/api/agent` with a valid test `threadId` and no approved plan →
  controlled `400`; expect `category=agent_failure`, `service=dashboard`, `route=/api/agent`.
- `queue_health`: if `/health/queues` already shows a failed, waiting or stuck condition, lower only
  the matching queue threshold and let the maintenance worker emit naturally.

Local emitters check threshold/counter logic and log to your terminal — they prove no drain, and the
dashboard one cannot prove Sentry (a standalone `tsx` process never initializes it). Load the target
app's production env first; never break live provider credentials to trigger `provider_send`:

```bash
npx tsx scripts/emit-controlled-ops-alert.ts --app=gateway queue_health
npx tsx scripts/emit-controlled-ops-alert.ts --app=gateway webhook_signature
npx tsx scripts/emit-controlled-ops-alert.ts --app=gateway provider_send <test-org-id>   # provider=imessage channel=operator_notify
npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/emit-controlled-ops-alert.ts --app=dashboard provider_send <test-org-id>   # provider=postmark channel=email
npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/emit-controlled-ops-alert.ts --app=dashboard agent_failure <test-org-id>
```

`gmail_inbound` (a Gmail **test** integration only; never touch a merchant grant): force its watch
expiration into the renewal window and let `gmail-watch-maintenance` run; in an isolated
configuration confirm the third consecutive renewal failure emits `category=gmail_inbound` (an
expired watch emits it immediately) carrying only integration identifiers, the safe error category
and the failure count; then constrain the stale-recovery bound and confirm incomplete pagination
emits fingerprint `recovery_truncated`, leaves `inboundStatus=degraded`, and sets no new checkpoint.

Finally set `OPS_ALERTS_ENABLED=false` briefly on each app, confirm threshold alerts go silent while
ordinary logs flow, then unset it.

### Triage by alert category

- **`queue_health`** — `/health/queues` for heartbeat and counts (coarse status on public
  `/health/deep`); inspect stuck jobs by trace id in Railway logs ([BullMQ Failed Jobs](#bullmq-failed-jobs));
  restart the worker only after Redis and the DB are confirmed healthy.
- **`webhook_signature`** — provider URLs point directly at the gateway ([Webhook Routing](#webhook-routing));
  provider secrets match production env; check whether failures concentrate on one provider or org.
- **`provider_send`** — provider credentials, account status, rate limits, sandbox/live state, status
  pages; confirm no successful outbound message was persisted for a failed send. `provider=imessage`:
  [iMessage down triage](#imessage-down-triage).
- **`agent_failure`** — group by tool and org; inspect `AgentAction` rows and logs; if write actions
  put customers at risk, disable the affected tool categories in org settings.
- **`gmail_inbound`** — see [Gmail native inbound](#gmail-native-inbound); never force a degraded
  integration active or replace its checkpoint by hand.
- **`inbound_unclaimed`** — Postmark deliveries no active forwarding integration claims (`reason` =
  `missing_recipient` | `malformed_local_part` | `no_integration`). Check the merchant's forwarding
  rule targets the generated `{orgId}@<INBOUND_EMAIL_DOMAIN>` address and the forwarding integration
  still exists; logs carry `unclaimed_recipient`.
- **`provider_cleanup`** — an Instagram webhook unsubscribe failed on disconnect
  (`[Instagram Disconnect] Provider unsubscribe cleanup required`, `manualCleanupRequired: true`);
  remove the subscription in the Meta app console for the logged account.

## Neon PITR

| Field | Value |
| --- | --- |
| Project | `misty-bird-75162134` (`shopkeeper`), `aws-us-west-2`, PG 17 |
| Production branch | `production` (`br-aged-union-akjqrbbs`) — the only branch |
| Endpoint | `ep-red-waterfall-akf6xfkq`, the only endpoint |
| PITR | Enabled, **7 days** (`history_retention_seconds: 604800`) |
| `autoscaling_limit_max_cu` | `2` |

Record the retention Neon reports, never an assumed plan default, and do not shorten it — the bill is
compute, not history, and a few hours does not survive a Friday-evening fault noticed on Saturday.
The 2 CU cap bounds blast radius; sustained throttling means fix the query, not raise the ceiling.

Test a restore after any change to `TOKEN_ENCRYPTION_KEY` or retention. What matters is that
encrypted integration tokens still decrypt — the key lives outside the database.

```bash
# 1. Branch from a point in time. --parent takes a name OR a timestamp as a single value
#    (`name@timestamp` is not valid for create). --expires-at stops a forgotten branch billing.
neonctl branches create --project-id misty-bird-75162134 --name pitr-test \
  --parent '<ISO8601 timestamp>' --expires-at '<ISO8601 +2h>'
# 2. Connection string (do not echo it — it carries credentials)
neonctl connection-string pitr-test --project-id misty-bird-75162134
# 3. Override DATABASE_URL/DIRECT_DATABASE_URL with it; compare row counts against production AND
#    confirm an Integration accessToken still decrypts (the Prisma client carries the encryption extension).
# 4. Always delete — a forgotten branch keeps its own compute.
neonctl branches delete pitr-test --project-id misty-bird-75162134
```

**`branches create --parent <timestamp>` is non-destructive (the test). `branches restore` rewinds the
target branch — never use it for a test.** Restore is whole-branch: to repair one merchant, restore to
a *separate* branch and copy rows out. PITR restores Postgres only — not Vercel Blob, not Redis
(in-flight BullMQ jobs are lost), and it does not un-charge Stripe, un-refund Shopify or un-send
email, so after a restore the database disagrees with Clerk, Stripe and Shopify. `AgentAction` is the
audit trail you would actually reconstruct from.

## BullMQ Failed Jobs

A retry-exhausted job lands in its queue's `failed` set. It is evidence, not proof the business
operation failed — compare with Postgres and provider truth before replaying or removing it. Queues:
`inbound-messages` (email, Shopify order events, deferred Instagram DMs), `ai-summary` (summary, plan
precompute, auto-ack, notifications), `outbound-email`, `gmail-sync`, `gmail-watch-maintenance`,
`order-review`, `operator-event`, `agent-task`, `integration-disconnect`.

Inspect with production `REDIS_URL` loaded (e.g. via `railway run`); it prints counts and identifiers
only — never dump raw `job.data`, which can hold message content. The script calls `loadGatewayEnv`,
which lets a local `apps/gateway/.env` override injected values unless `NODE_ENV=production`:

```bash
cd apps/gateway
NODE_ENV=production npx tsx src/scripts/inspect-failed-queue-jobs.ts inbound-messages
```

If the evidence does not fit the safe condition, escalate instead of replaying:

| Queue | Truth to inspect | Replay rule |
| --- | --- | --- |
| `inbound-messages` | Provider message/webhook identity, persisted `Message`/order event, downstream summary job | Replay the original job only once its stable provider identity is present and ingestion dedupes it. Never reconstruct a job with a new ID. |
| `ai-summary` | `sourceMessageId`, latest customer message, cached-plan identity, any `PlanExecution` | Only while `sourceMessageId` is still the latest customer request; leave stale jobs superseded. No stable source identity = not replayable. |
| `gmail-sync` | History cursor, Gmail message ID, stable `gmail-inbound-<integration>-<message>` jobs | Replay after credentials/provider recover; the checkpoint is monotonic and inbound jobs use stable IDs. |
| `gmail-watch-maintenance` | Watch expiration/status, catch-up admission, Pub/Sub config | Prefer the next 12-hour run after the fix; one manual run only for an expired/near-expiry watch or overdue catch-up. Never create a second repeat schedule. |
| `order-review` | Organization/order identity, existing `AgentAction` rows | One original job after the model/provider fix; duplicate audit observations and model cost are possible. |
| `outbound-email` | `Message.sendStatus`, `sendAttemptedAt`, `providerMessageId`, RFC `Message-ID`, provider activity | **Never generic replay** — [outbound-email recovery](#failed-or-unknown-outbound-email-recovery). |
| `operator-event` | `OperatorEvent.status`, claim timestamps, `replyText`, `replyDeliveredAt`, provider activity | **Never replay a claimed or terminal turn.** A `pending` event may be re-enqueued with its same ID; the sweep reconciles stale claims to `unknown` and may resend a committed reply but never reruns the turn. |
| `agent-task`, `integration-disconnect` | The durable task / `IntegrationDisconnect` row | No generic replay; their sweeps own retry. Escalate. |

Before any permitted replay: check `failedReason`, `attemptsMade`, `traceId`, tenant identifiers
and provider response in Railway logs; confirm Redis, Postgres and the provider are healthy and the
root cause is fixed; record the evidence it is safe to rerun; replay **one** job and watch
`/health/queues`, the durable row and provider activity before any batch. Retry without changing the
job's identity (production `REDIS_URL` in the shell; this does not read `apps/gateway/.env`):

```bash
cd apps/gateway
QUEUE_NAME='gmail-sync' JOB_ID='<failed-job-id>' npx tsx -e "import { getGatewayBullMqQueue, closeGatewayBullMqQueues } from './src/clients/gateway-queues.ts'; import { closeGatewayRedisConnections } from './src/clients/redis-client.ts'; (async () => { const replayable = new Set(['inbound-messages','ai-summary','gmail-sync','gmail-watch-maintenance','order-review']); const name = process.env.QUEUE_NAME ?? ''; const id = process.env.JOB_ID ?? ''; if (!replayable.has(name) || !id) throw new Error('QUEUE_NAME is not generically replayable or JOB_ID is missing'); const q = getGatewayBullMqQueue(name); try { const job = await q.getJob(id); if (!job) throw new Error('Job not found'); if (await job.getState() !== 'failed') throw new Error('Job is not failed'); await job.retry('failed'); console.log('Retried job', job.id, 'on', name); } finally { await closeGatewayBullMqQueues(); await closeGatewayRedisConnections(); } })().catch((e) => { console.error(e); process.exit(1); });"
```

Removing a stale failed record is housekeeping, not recovery: capture its sanitized evidence, verify
the durable operation is terminal or superseded, then remove only that job with
`npx tsx src/scripts/remove-failed-queue-job.ts <queue> <jobId>` (from `apps/gateway`) or
`POST https://<gateway>/internal/queue/remove-failed` (`x-internal-secret`, body
`{"queue":"…","jobId":"…"}`). Both re-check the job is still `failed` and refuse waiting, active,
delayed or completed work. Never delete the related ledger, message or event row.

## Email

### Independent Gmail and forwarding integrations

A workspace may hold one Gmail and one forwarded (Postmark) integration at once; connecting,
reconnecting or deleting one must not touch the other.

- **Inbound.** Gmail receives Pub/Sub push, syncs history through `gmail-sync`, and enqueues the same
  `process-email` jobs as Postmark. Maintenance runs every 12 hours (one stable catch-up per active
  integration) and renews healthy watches daily. An expired history checkpoint triggers a paginated
  seven-day inbox recovery capped at 2,000 messages; a larger result stays degraded and alerts rather
  than silently advancing. Postmark accepts only the generated organization recipient from
  `OriginalRecipient` with an active Postmark integration; the visible `To` header is never a tenancy key.
- **Outbound.** `Integration.emailProvider` is authoritative. Replies and auto-acks use
  `Thread.replyIntegrationId` from the newest distinct inbound email, falling back to the workspace
  default if it was deleted; proactive email always uses `Organization.defaultEmailIntegrationId`. The
  resolved integration is snapshotted on the message and job. `From` is `Integration.fromEmail`
  (fallback `externalAccountId`); the OAuth account email is used for `replyTo` and token refresh.
- **Missing default.** One provider connected: it self-repairs. Both connected: a configuration error
  to fix from Integrations — never pick an unordered row.

### Outbound email delivery mode

`OUTBOUND_EMAIL_ASYNC=true` on the dashboard selects the async path: the outbound `Message` is
created first, enqueued with its ID as the stable job ID, and claimed once by the gateway worker.
Unset/`false` keeps the synchronous path, the rollback rail (`npm run audit:outbound-email-mode`
reports the mode). Roll out one provider at a time. Baseline (every blocker list empty), then after
enabling for a provider send one ordinary reply (UI moves `pending → processing → sent`, exactly one
message arrives, a provider message ID is recorded) and require fresh traffic:

```bash
railway run --service shopkeeper --environment production -- \
  npm run audit:outbound-email -- --hours=24 --strict
railway run --service shopkeeper --environment production -- \
  npm run audit:outbound-email -- --hours=1 --strict --require-provider=postmark   # then gmail
```

Review logs for ownership mismatches, lost claims, provider ambiguity, sweep alerts or permanently
failed jobs. For Gmail, the self-addressed canary proves queue/provider behavior without the dashboard
flag — one labeled message to the account's own plus-address, staged ticket closed, nothing sensitive printed:

```bash
railway run --service shopkeeper --environment production -- \
  env GATEWAY_URL='https://<gateway>' \
  npm run canary:outbound-gmail -w apps/gateway -- \
    --integration-id='<gmail-integration-uuid>' \
    --acknowledge-self-email \
    --execute
```

Require `sendStatus=sent`, `hasProviderMessageId=true`, `deduplicated=true`, then the strict
`--require-provider=gmail` audit. Attachment modes (mutually exclusive — opposite assertions):
`--attach` / `--attach-file=<path>` sends a real file (also require `attachment: "sent"` and open it
in the mailbox; Gmail and Postmark build attachments differently, so one passing proves nothing about
the other); `--attach-missing` stages a never-written ref and requires `sendStatus=failed`,
`providerWasAttempted=false` and a non-empty `sendError` — **`unknown` is the regression it catches**,
and `sent` is worse (the reply went out without the file).

Rollback: `OUTBOUND_EMAIL_ASYNC=false` and redeploy the dashboard. Leave pending, processing, failed
and unknown rows as recovery evidence; never delete or blindly enqueue them.

### Failed or unknown outbound-email recovery

A `failed` row is retryable only when the failure is known to precede provider submission. An
`unknown` row may already have been accepted and is never retried until provider activity proves no delivery.

1. `npm run audit:outbound-email -- --hours=24 --strict`: take message, organization, thread,
   integration, provider, claim/attempt times, status and error (bodies, addresses and raw provider IDs are omitted).
2. Search Gmail/Postmark activity by the stored provider ID and the RFC `Message-ID`
   `<message-{messageId}@{INBOUND_EMAIL_DOMAIN}>`; check the recipient mailbox if inconclusive.
3. No submission proven → leave/move the row to `failed` and let an authorized merchant retry once.
   Delivery proven → record only the missing delivery identity/state; never send again. Ambiguous →
   keep `unknown`, record the incident, escalate.
4. `outbound-send-sweep` turns a stale unattempted claim into `failed` and a stale claim with
   `sendAttemptedAt` into `unknown`. Check sweep/worker health before any manual state change.

### Gmail native inbound

**One inbound transport per mailbox.** Gmail OAuth workspaces receive via Gmail sync only; Postmark
forwarding is for forward-only workspaces. Never run both on the same INBOX or replay one message
through both rails. Roll back per integration (pause native sync or revert to forwarding-only),
never by re-enabling global dual delivery.

```bash
npm run audit:email-inbound-transport
npm run audit:email-inbound-transport -- --strict   # fails when dual-delivery risk > 0
```

New Gmail connects register a watch automatically when inbox scopes are granted. Until restricted-scope
verification passes only Google OAuth test users can connect —
[google-gmail-verification-packet.md](google-gmail-verification-packet.md).

**Pub/Sub provisioning.** Authenticate `gcloud` as an admin of the project that owns the Gmail OAuth
client (Pub/Sub Admin plus service-account IAM, including `iam.serviceAccounts.actAs` on the push
account), then run the idempotent setup; it creates the topic, Gmail publisher grant, push service
account with OIDC permission, and the authenticated push subscription. Copy the three printed
`GMAIL_PUBSUB_*` values into Vercel and Railway.

```bash
GCP_PROJECT_ID='shopkeeper-prod' \
GMAIL_PUBSUB_PUSH_ENDPOINT='https://<gateway>/webhooks/gmail/push' \
GMAIL_PUBSUB_AUDIENCE='https://<gateway>/webhooks/gmail/push' \
npm run configure:gmail-pubsub
```

**Health after a Gmail-path deploy**, once a full 12-hour maintenance interval has passed:
`gmail-watch-maintenance` completed; one `source=maintenance` job per active integration completed on
`gmail-sync` (job ID `gmail-sync-maintenance-<integration>-<12-hour-bucket>`); `lastSyncedAt`
advanced even for idle mailboxes; a watch with `watchLastRenewedAt` ≥ 24 hours old renewed without
replacing its checkpoint; no integration has `lastError=sync_recovery_truncated`.

**Truncated recovery.** Never force a `sync_recovery_truncated` integration active or replace its
checkpoint. Inspect the mailbox window with an operator-controlled broader recovery (inspect-only by
default), then execute with a stable incident ID so repeats deduplicate:

```bash
npm run recover:gmail-history -- \
  --integration-id='<integration-uuid>' \
  --max-messages=10000 \
  --query='newer_than:30d in:inbox'

npm run recover:gmail-history -- \
  --integration-id='<integration-uuid>' \
  --max-messages=10000 \
  --query='newer_than:30d in:inbox' \
  --recovery-id='<incident-id>' \
  --execute
```

The worker accepts it only while the integration is degraded for exactly `sync_recovery_truncated`,
caps it at 50,000 messages, and keeps the same checkpoint/idempotency rules.

## Channel Smoke Tests and Recovery

Health checks are necessary, not sufficient: run at least one real flow per channel in scope.

**Email.** Send a real email to the production inbound address (or a connected Gmail inbox); confirm
the inbound job is processed, a thread appears with an AI summary and cached plan, and an approved
response sends.

**Shopify.** Complete a live OAuth connect and confirm the integration row; confirm the app's webhook
subscriptions point at the gateway (`npm run audit:shopify-webhooks`; topics live in
`shopify.app.toml`); trigger one supported order event and confirm it reaches the gateway and, where
applicable, the dashboard.

**Clerk lifecycle.** Point a Clerk webhook at `https://<dashboard>/api/webhooks/clerk`, subscribed to
`organization.deleted`, `user.deleted` and `organizationMembership.deleted`; store its secret as
`CLERK_WEBHOOK_SECRET`; confirm a `200` from Clerk's testing tab or a staging org deletion. An org
deletion starts the workspace-deletion ledger (finished by the gateway sweep); a user deletion removes
that user's `org_members`; a membership deletion removes only that org's member row. Detail:
[data-deletion.md](data-deletion.md).

### Instagram DM

SocialAPI carries `ig_dm` for new connections; admission is the operator-provisioned
`SOCIALAPI_BRAND_ASSIGNMENTS` map. Rules and rollback: [socialapi-transport-plan.md](../socialapi-transport-plan.md).

Direct Meta stays implemented but closed to new connections (Standard Access only: a merchant would
hear nothing from customers who never messaged the app). To exercise it for a test workspace, first
require a clean ownership/auth-model audit:

```bash
railway run --service shopkeeper npm run audit:instagram-rollout -- --strict
```

Then set `INSTAGRAM_INTEGRATION_ENABLED=true` and add the workspace's Clerk org ID to
`INSTAGRAM_BETA_ORG_IDS`; complete OAuth and confirm `/subscribed_apps` contains `messages`; confirm
the `GET /webhooks/meta` handshake; send two quick DMs (one with an attachment) and confirm each
appears once with provider timestamps and the private attachment; approve a reply and confirm its
provider message ID; reconnect and confirm routing holds; disconnect and confirm later DMs create no tickets.

### Telegram operator channel

Register the bot webhook, and re-register after any token or gateway-host change (needs
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`):

```bash
cd apps/gateway && npx tsx src/scripts/set-telegram-webhook.ts https://<gateway>/webhooks/telegram
```

Smoke: from a bound member's chat send a message and confirm the operator turn runs; confirm a plan
notification reaches bound members for a new ticket; reply `yes` / `no` / free-form and confirm the
agent acts or skips. Each member may bind at most 3 Telegram devices.

### Durable operator events

Every Telegram and iMessage operator message is persisted and enqueued before the webhook is
acknowledged; the `operator-event` worker claims it once and runs the turn. There is no synchronous
fallback. Never delete or blindly re-enqueue `OperatorEvent` rows.

```bash
railway run --service shopkeeper --environment production -- \
  npm run audit:operator-events -- --hours=24 --strict
npm run audit:operator-events -- --hours=24 --strict --require-channel=telegram
npm run audit:operator-events -- --hours=24 --strict --require-channel=imessage
```

Expect committed events with delivered replies and no failed, unknown, stale, undelivered or
repeated-claim records. **Failed or unknown events** may have partially acted; neither is safe to replay:

1. Take event ID, organization, channel, claim/process times, error and correlated action summaries
   from the strict audit (it omits bodies, replies, chat IDs and provider message IDs).
2. Inspect `agent_actions` where `turn_id = <operator-event-id>`; for a keyword pending-plan decision,
   also that org's plan executions and actions in the claim-time window.
3. Establish provider truth (Shopify transaction/order state, outbound provider activity, dashboard
   action timeline). Never infer "nothing happened" from a missing operator reply.
4. No side effect → ask the merchant for a fresh instruction. Commit proven → send only the missing
   confirmation or a compensating follow-up. Ambiguous → leave it terminal, record the incident,
   escalate; never mutate it back to `pending`.
5. `operator-event-sweep` (every 15 minutes) resends a committed event's stored confirmation but never
   reruns the turn. If `last_error` says the reply may have reached the provider, the sweep skips it:
   check Telegram/Photon activity and the device, and never resend without positive no-delivery
   evidence. A committed-undelivered row stays a strict-audit blocker until reconciled.

### iMessage operator channel

One platform-wide Photon Spectrum line serves all orgs; merchants bind their iPhone by texting a
connect code, and customers never use it.

**Setup.** (1) Confirm or create a Spectrum project with an iMessage line (`photon login`,
`photon projects show`, `photon spectrum lines list`, or the [Photon dashboard](https://app.photon.codes)).
(2) In app.photon.codes → **Webhooks**, register `https://<gateway>/webhooks/photon` and copy its
signing secret into `SPECTRUM_WEBHOOK_SECRET` on every gateway service. (3) Gateway:
`SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET`, `SPECTRUM_WEBHOOK_SECRET`; dashboard:
`IMESSAGE_LINE_HANDLE` matching the line. (4) `GATEWAY_RUNTIME_ROLE` must include `server` on the
service receiving the webhook.

```bash
# Must not return 503 (= Spectrum creds missing); 400/401 are fine for an unsigned probe
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  https://<gateway>/webhooks/photon -H "Content-Type: application/json" -d '{}'
curl -sS https://<gateway>/health/deep | jq '.checks.imessage'   # {"configured": true}
```

A signed inbound logs `[Webhook] Photon delivery processed` with `status: 200`; Integrations shows
iMessage Connect enabled when `IMESSAGE_LINE_HANDLE` is set.

#### iMessage down triage

When merchants report missing plan pushes, bind replies or digests:

1. **Configured?** `/health/deep` `.checks.imessage.configured` must be `true`. A `503` on
   `POST /webhooks/photon` with `[Webhook] Photon webhook received but iMessage is not configured`
   means missing gateway creds.
2. **Ingress.** The Photon webhook URL must be `https://<gateway>/webhooks/photon` and
   `SPECTRUM_WEBHOOK_SECRET` its endpoint secret; a mismatch returns `401` and emits `category=webhook_signature`.
3. **Rotation.** After rotating any `SPECTRUM_*` value, redeploy the gateway and re-run a bind smoke.
4. **Stale `spaceId`.** Proactive sends use `OrgMemberImessageBinding.spaceId`, refreshed on each
   inbound merchant message; if Photon re-provisioned the space, have the merchant text the line once.
   Logs: `[Spectrum] iMessage send failed` / `[Spectrum] iMessage space load failed` with `spaceId`;
   repeats emit `category=provider_send`, `provider=imessage`, `channel=operator_notify`.
5. **Devices.** No iMessage device cap; unlink stale handles from Integrations after a phone change.
6. **Dedupe.** Retries use per-channel Redis idempotency keys (1-hour TTL), so a partial fan-out
   failure does not re-text channels that already got it (`[OperatorNotify] Duplicate delivery skipped`).
   Failures log `[OperatorNotify] Send failed`; no bound members logs
   `[Worker] No bound operator members — skipping plan notification`.
7. **No delivery receipts.** Success means Spectrum `space.send()` resolved, not that it was read.
8. **Bind path.** Search `[iMessage] Bind succeeded`, `Bind rejected`, `Bind failed`; unbound senders
   should get connect instructions, never agent runs or tickets.

#### iMessage bind support

Each handle (`senderId`) binds to **one member globally** (unique `org_member_imessage_bindings.sender_id`):
texting a code from org B moves it there and org A stops getting notifications until someone re-binds.
Codes are single-use with a 24-hour TTL (`ORG_MEMBER_BIND_TOKEN_TTL_SECONDS`), minted only by
`POST /api/integrations/imessage/bind` (billing-write gated). Bind logs carry `senderId`, `spaceId`,
`orgId` and `outcome` only — never the token or body.

- **Wrong-org bind:** find the owner (Integrations → iMessage, or `org_member_imessage_bindings` by
  `sender_id`); unlink from the current org, or mint a code from the intended org and text it.
- **Lost operator access:** confirm iMessage is configured on `/health/deep` and
  `IMESSAGE_LINE_HANDLE` matches the line; the merchant unlinks, mints a new code and texts it; if
  inbound works but proactive sends fail, have them text the line once; escalate to engineering if
  bind succeeds but sends still fail (`provider_send` alerts).

## Product Analytics

Both apps require an explicit `PRODUCT_ANALYTICS_ENABLED` in production. Ship new instrumentation
with capture off (`PRODUCT_ANALYTICS_ENABLED=false`, `POSTHOG_PROJECT_TOKEN=<project-token>`,
`POSTHOG_HOST=https://us.i.posthog.com`), using the environment-specific project's token. Analytics
is server-only and organization-scoped: no browser PostHog key, autocapture, session replay, cookies
or person profiles.

Before enabling production capture: the privacy policy is deployed; every event was enabled and
reviewed in staging; raw payloads hold no names, addresses, message content, prompts, provider
identifiers, credentials or provider payloads; deterministic retries keep one unique event; the
reports in [posthog-reports.md](posthog-reports.md) are saved (`npm run provision:posthog-reports`);
someone owns analytics-delivery warnings for the first week. Afterwards, run one controlled workspace
journey and check raw events and reports. Never backfill pre-deployment events.

## Content Security Policy

The dashboard CSP is **enforced**, built per request by Clerk's middleware option in
`apps/dashboard/src/proxy.ts` (fresh nonce, `'strict-dynamic'`) with directives in
`apps/dashboard/src/proxy/content-security-policy.ts` — check a real response, not a static header.

- Violations post to `POST /api/security/csp-report` (16 KiB cap, no authenticated action), logged
  as normalized directive, status and URL origins only under `[CSP] Browser policy violation`.
- The surviving `'unsafe-inline'` is Clerk's CSP2 fallback, ignored by CSP3 browsers under
  `'strict-dynamic'` — do not remove it. `unsafe-eval` is dev-only.
- Every integration connect is a form POST that 303s to the provider's authorize page, and Chrome
  checks each hop against `form-action`. A new provider or authorize host goes into
  `providerAuthorizeOrigins`, with a real connect re-verified, or the OAuth popup dies on its spinner.
- Emergency rollback is a code change: `reportOnly: true` in `proxy.ts`, redeploy, keep the collector on.
