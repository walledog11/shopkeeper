# Production Deploy Runbook

This runbook covers the first launch track:

1. deploy the dashboard and gateway with a production-safe env contract
2. run migrations
3. verify health endpoints
4. prove the live inbound-message path works end-to-end

It is intentionally narrower than [`checklist.md`](checklist.md). This document is only about getting the current product scope deployed and verified.

## Runtime Contract

### Dashboard

- Platform: Vercel
- Build config: [vercel.json](../../vercel.json)
- Health endpoint: [apps/dashboard/src/app/api/health/route.ts](../../apps/dashboard/src/app/api/health/route.ts)
- Env validation: [apps/dashboard/src/lib/env.ts](../../apps/dashboard/src/lib/env.ts)

### Gateway

- Platform: Railway
- Start config: [railway.json](../../railway.json)
- Supervisor entrypoint: [apps/gateway/src/start.ts](../../apps/gateway/src/start.ts)
- Health endpoints: [apps/gateway/src/index.ts](../../apps/gateway/src/index.ts)
- Env validation: [apps/gateway/src/config/env.ts](../../apps/gateway/src/config/env.ts)

### Verification Tooling

- Production env preflight: [scripts/check-production-env.mjs](../../scripts/check-production-env.mjs)
- Production smoke script: [scripts/verify-production.mjs](../../scripts/verify-production.mjs)
- DB migrate command: [package.json](../../package.json)

## Platform Commands

### Vercel

- Install command: `npm install`
- Build command:

```bash
npx prisma generate --schema=packages/db/prisma/schema.prisma && npm run build -w packages/db && npx turbo run build --filter=shopkeeper-dashboard
```

- Output directory: `apps/dashboard/.next`

### Railway

- Start command:

```bash
npm run start -w apps/gateway
```

- The gateway start script launches both the HTTP server and the worker by default via `dist/start.js`.
- Local validation for the targeted build path:

```bash
npm run build -w packages/db
npm run build -w packages/agent
npm run build -w apps/gateway
```

- If Railway is configured with a custom build command in the console, use the same targeted build path above instead of a monorepo-wide build.

## Environment Matrix

### Dashboard Required At Production Boot

- `DATABASE_URL`
- `DIRECT_DATABASE_URL`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `ANTHROPIC_API_KEY`
- `INTERNAL_API_SECRET`
- `APP_URL`
- `TOKEN_ENCRYPTION_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `SENTRY_DSN`

> Dashboard `UPSTASH_REDIS_REST_URL` (Upstash REST — rate limiting, locks, presence) and gateway `REDIS_URL` (a dedicated per-instance Redis for BullMQ) are **separate** instances and must not point at the same database. BullMQ holds a blocking connection per worker and polls continuously, so running it against Upstash's per-command billing is very expensive. The daily LLM spend cap is shared across both apps via Postgres (the `llm_daily_spend` table), so it stays per-org regardless of the Redis split.

Rules:

- `APP_URL` must be a valid absolute `http` or `https` URL.
- If `NEXT_PUBLIC_APP_URL` is set, it must be a valid absolute `http` or `https` URL and match `APP_URL`.
- `DATABASE_URL` should include `pgbouncer=true` and `connection_limit=1`.
- `DIRECT_DATABASE_URL` must use the direct Neon host (no `-pooler` suffix, no `pgbouncer=true`). Set it on Vercel and Railway even though runtime queries use the pooled URL.

### Dashboard Required For Launch Scope Features

- `GATEWAY_INTERNAL_URL`
  Used for Shopify webhook registration during OAuth and for local webhook proxy routes. In production this should be the public Railway gateway URL even though the name says `internal`.
- `POSTMARK_API_KEY`
- `INBOUND_EMAIL_DOMAIN`
- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`
- `SHOPIFY_APP_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `CLERK_WEBHOOK_SECRET`
  Used by `POST /api/webhooks/clerk` to verify Clerk lifecycle webhooks.
- `BLOB_READ_WRITE_TOKEN`
  Used by `GET /api/attachments` to stream private inbound email attachments to authenticated workspace members.
- `PRICE_ID_STARTER`
- `PRICE_ID_PRO`
- `SENTRY_DSN` — runtime error tracking. Source maps upload via the [Sentry Vercel integration](https://vercel.com/integrations/sentry); no upload token needed on the dashboard.

Optional:

- `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID` for Instagram DM after v1.
- `TELEGRAM_BOT_USERNAME` for the operator-channel deep link in the dashboard.
- `USPS_CLIENT_ID`, `USPS_CLIENT_SECRET` if direct USPS tracking is ever reintroduced.

### Gateway Required At Production Boot

- `DATABASE_URL`
- `DIRECT_DATABASE_URL`
- `REDIS_URL`
- `ANTHROPIC_API_KEY`
- `INTERNAL_API_SECRET`
- `DASHBOARD_URL`
- `TOKEN_ENCRYPTION_KEY`
- `SENTRY_DSN`

Rules:

- `DASHBOARD_URL` must be a valid absolute `http` or `https` URL.
- In production, `DASHBOARD_URL` is mandatory.
- `DASHBOARD_INTERNAL_URL` is dev-only and should not be relied on in production.
- `DATABASE_URL` should include `pgbouncer=true` and `connection_limit=1`.
- `DIRECT_DATABASE_URL` must use the direct Neon host (no `-pooler` suffix, no `pgbouncer=true`).

### Gateway Required For Launch Scope Features

- `SHOPIFY_APP_SECRET`
- `POSTMARK_INBOUND_USERNAME`, `POSTMARK_INBOUND_PASSWORD`
  Required for inbound email webhook basic auth in production.
- `BLOB_READ_WRITE_TOKEN`
  Required for inbound email attachment upload in the gateway worker.
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
  Used by `scripts/sentry-upload-sourcemaps.mjs` for source-map upload.

Optional:

- `GATEWAY_RUNTIME_ROLE`
  Defaults to `all`. Only set it if you intentionally split server and worker processes.
- `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_APP_ID` for Instagram DM after v1.
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` for the Telegram operator channel.

## Deploy Sequence

1. Prepare production URLs.
   - Decide the canonical dashboard URL, for example `https://app.example.com`.
   - Decide the public Railway gateway URL, for example `https://gateway.up.railway.app`.
   - Set `APP_URL` to the canonical dashboard URL.
   - If you define `NEXT_PUBLIC_APP_URL` for compatibility, set it to the same dashboard URL.
   - Set dashboard `GATEWAY_INTERNAL_URL` to the public Railway gateway URL.
   - Set gateway `DASHBOARD_URL` to the public dashboard URL.

2. Load Vercel and Railway env vars.
   - Populate every boot-required variable first.
   - Populate the launch-scope integration variables before turning on real providers.
   - Run `npm run verify:production:env` before deploy. For a boot-only pass, run `npm run verify:production:env -- --scope=boot`.
   - If you want to validate app-specific env files locally instead of the current shell, run:

```bash
node scripts/check-production-env.mjs dashboard --scope=launch --env-file=apps/dashboard/.env.local
node scripts/check-production-env.mjs gateway --scope=launch --env-file=apps/gateway/.env
```

3. Run the production migration before first deploy.

```bash
DATABASE_URL='postgresql://...@ep-....-pooler.us-east-2.aws.neon.tech/neondb?pgbouncer=true&connection_limit=1' \
DIRECT_DATABASE_URL='postgresql://...@ep-....us-east-2.aws.neon.tech/neondb?sslmode=require' \
npm run db:migrate:deploy
```

Prisma routes migrations through `DIRECT_DATABASE_URL` (`directUrl` in the schema). CI and local migration runs need both URLs set.

4. Deploy the dashboard to Vercel.
   - Confirm `GET /api/health` returns `status: ok`.

5. Deploy the gateway to Railway.
   - Confirm `GET /health/deep` returns `status: ok`.
   - Confirm the worker heartbeat is healthy in `GET /health/queues`.

6. Run the smoke script against the live services.

```bash
DASHBOARD_URL='https://app.example.com' \
GATEWAY_URL='https://gateway.up.railway.app' \
npm run verify:production
```

7. If email is part of the launch validation, run the optional inbound-email smoke check.

```bash
DASHBOARD_URL='https://app.example.com' \
GATEWAY_URL='https://gateway.up.railway.app' \
VERIFY_INBOUND_EMAIL_TO='org-id@mail.example.com' \
VERIFY_INBOUND_EMAIL_FROM='shopkeeper-smoke@example.com' \
npm run verify:production
```

## Manual End-to-End Smoke Tests

Automated health checks are necessary but not sufficient. Before marking the deploy complete, run at least one real smoke flow through the current launch scope.

### Email

1. Send an inbound email to the production inbound address.
2. Confirm the gateway returns `200 OK`.
3. Confirm an inbound BullMQ job is created and processed.
4. Confirm a new thread appears in the dashboard with an AI summary and cached plan.
5. Approve a response and confirm the outbound email sends successfully.

### Instagram DM (Deferred After V1)

1. Verify the Meta webhook handshake succeeds on `GET /webhooks/meta`.
2. Send a real DM to the connected Instagram account.
3. Confirm the gateway verifies the signature, queues the job, and the worker creates the thread.
4. Confirm the dashboard shows the thread and plan.
5. Approve a reply and confirm the DM is delivered.

### Telegram Operator Channel

1. Point the Telegram bot webhook at `POST /webhooks/telegram` on the gateway, including the `TELEGRAM_WEBHOOK_SECRET` header.
2. From a bound org member's Telegram chat, send a real inbound message to the bot.
3. Confirm the gateway accepts the webhook and the worker processes the operator turn.
4. Confirm a Telegram plan notification reaches bound org members for a new ticket.
5. Reply `yes` / `no` / freeform and confirm the agent acts (or skips) accordingly.

### Shopify

1. Complete a live Shopify OAuth connect flow from the production dashboard.
2. Confirm the integration row is written in the DB.
3. Confirm the four order webhooks are registered against the public gateway URL.
4. Trigger one supported order event.
5. Confirm the inbound event reaches the gateway and appears in the dashboard where applicable.

### Clerk Lifecycle

1. In the Clerk Dashboard, create or update a webhook endpoint for `https://<dashboard>/api/webhooks/clerk`.
2. Subscribe it to `organization.deleted`, `user.deleted`, and `organizationMembership.deleted`.
3. Store the endpoint signing secret as dashboard `CLERK_WEBHOOK_SECRET`.
4. Use the Clerk webhook testing tab or a safe staging organization deletion to confirm the dashboard returns `200`.
5. Confirm local rows are cleaned up: deleted organizations should cascade through workspace data, deleted users should remove matching `org_members`, and deleted memberships should remove only that organization's member row.

## Production-Only Webhook Routing

The dashboard webhook proxy routes are for local development convenience. In production, point provider traffic directly at the gateway:

- Meta -> `https://<gateway>/webhooks/meta`
- Telegram -> `https://<gateway>/webhooks/telegram`
- Postmark inbound -> `https://<gateway>/webhooks/email/inbound`
- Shopify -> `https://<gateway>/webhooks/shopify`

Clerk lifecycle webhooks are the exception because they clean up dashboard-owned tenant records:

- Clerk -> `https://<dashboard>/api/webhooks/clerk`

Relevant proxy routes:

- [apps/dashboard/src/app/api/webhooks/meta/route.ts](../../apps/dashboard/src/app/api/webhooks/meta/route.ts)
- [apps/dashboard/src/app/api/webhooks/email/route.ts](../../apps/dashboard/src/app/api/webhooks/email/route.ts)

Relevant signed dashboard webhook route:

- [apps/dashboard/src/app/api/webhooks/clerk/route.ts](../../apps/dashboard/src/app/api/webhooks/clerk/route.ts)

## Operational Guardrails

The guardrail code is implemented, but the production checklist item is not complete until Sentry alert rules are configured and validated against live or staging traffic. Treat [`operational-guardrails.md`](operational-guardrails.md) as the implementation record and this section as the production operating procedure.

### External Monitors

Configure Better Stack HTTP keyword checks before sign-off. Do this manually in the Better Stack console; do not add Better Stack API tokens or credentials to the repo. Route these monitors to the same launch owner or escalation policy used for the Sentry guardrail rules.

Before creating monitors, verify the live production health endpoints from a trusted shell:

```bash
DASHBOARD_URL='https://<dashboard-production-url>' \
GATEWAY_URL='https://<gateway-production-url>' \
npm run verify:production
```

Create a Better Stack monitor group named `Shopkeeper Production`, then create these monitors:

| Monitor | URL | Required keyword |
| --- | --- | --- |
| `Shopkeeper Dashboard Health` | `https://<dashboard-production-url>/api/health` | `"status":"ok"` |
| `Shopkeeper Gateway Deep Health` | `https://<gateway-production-url>/health/deep` | `"status":"ok"` |
| `Shopkeeper Gateway Queue Health` | `https://<gateway-production-url>/health/queues` | `"healthy":true` |

Use the same settings for all three monitors:

- Monitor type: `keyword`
- HTTP method: `GET`
- Check frequency: `60` seconds
- Confirmation period: `60` seconds
- Request timeout: `10` seconds
- Verify SSL: enabled
- Follow redirects: enabled
- Region: `us`
- Escalation policy: same launch owner or policy used by Sentry

After creation, wait for all three monitors to show `up`, confirm each has a first passing check timestamp, and use Better Stack's built-in test notification for the selected escalation policy. Do not validate alert routing by intentionally taking production down.

Expected failure behavior:

- Dashboard DB, Redis, or env failure should make `/api/health` return degraded/non-`200` behavior and lose the dashboard monitor's passing condition.
- Gateway DB, Redis, worker heartbeat, or queue diagnostics failure should make `/health/deep` return degraded/non-`200` behavior and alert after the confirmation period.
- Missing or stale worker heartbeat should make `/health/queues` return `"healthy":false`, causing the queue keyword monitor to fail even though the diagnostics endpoint can still return `200`.

Record this evidence before checking off the uptime item:

- Monitor group:
- Escalation policy or owner:
- Dashboard monitor id, URL, required keyword, first passing check time:
- Gateway deep monitor id, URL, required keyword, first passing check time:
- Gateway queue monitor id, URL, required keyword, first passing check time:
- Better Stack test notification recipient and time:

### Neon PITR

Confirm point-in-time recovery on the production Neon branch before sign-off. Record the exact retention window from Neon, not an assumed plan default.

Evidence to record:

- Neon project:
- Production branch:
- PITR status:
- Retention window:
- Confirmed by:
- Confirmed at:

Do not check off the PITR item until the retention window is recorded here or in the launch evidence tracker.

### Sentry Alert Rules

Create issue or metric alert rules for events with the following tags:

- `category=queue_health`
- `category=webhook_signature`
- `category=provider_send`
- `category=agent_failure`

Route both dashboard and gateway alerts to the same launch owner until ownership is split. Keep `service`, `queue`, `provider`, `channel`, and `tool` visible in notifications, and avoid routing by `orgId` because that fragments platform incidents.

Before sign-off:

1. Set `SENTRY_DSN` for both dashboard and gateway.
2. Confirm `OPS_ALERTS_ENABLED` is unset or set to `true`.
3. In staging or a safe production window, record the current alert env values.
4. Temporarily set `OPS_ALERT_WINDOW_SECS=60` and set only the threshold under test to `1`.
5. Trigger one controlled event per category.
6. Confirm the event lands in Sentry with the expected `category` and `service` tags.
7. Confirm the alert routes to the launch owner.
8. Confirm the issue grouping, notification tags, extras, and absence of customer-facing side effects.
9. Restore the default thresholds after validation.
10. Set `OPS_ALERTS_ENABLED=false` briefly and confirm threshold alerts are silenced without suppressing structured logs.

Default thresholds to restore:

- `OPS_ALERT_WINDOW_SECS=300`
- `QUEUE_ALERT_FAILED_THRESHOLD=10`
- `QUEUE_ALERT_WAITING_THRESHOLD=100`
- `QUEUE_ALERT_ACTIVE_STUCK_MS=900000`
- `WEBHOOK_SIGNATURE_ALERT_THRESHOLD=5`
- `PROVIDER_SEND_ALERT_THRESHOLD=3`
- `AGENT_FAILURE_ALERT_THRESHOLD=3`

### Controlled Alert Validation

Run these in a safe production window with test org/user data only.

`webhook_signature`:

1. Set `WEBHOOK_SIGNATURE_ALERT_THRESHOLD=1` and `OPS_ALERT_WINDOW_SECS=60` on the gateway.
2. Send one intentionally unsigned or bad-signature request to `POST https://<gateway>/webhooks/shopify` or `POST https://<gateway>/webhooks/meta`.
3. Confirm the app returns the existing rejection response, normally `401`.
4. Confirm Sentry receives an event tagged `category=webhook_signature` and `service=gateway`.

`agent_failure`:

1. Set `AGENT_FAILURE_ALERT_THRESHOLD=1` and `OPS_ALERT_WINDOW_SECS=60` on the dashboard.
2. As an authenticated launch-test user in a test organization, call `POST https://<dashboard>/api/agent` with a valid test `threadId` but no approved plan.
3. Confirm the route returns the controlled `400`.
4. Confirm Sentry receives an event tagged `category=agent_failure`, `service=dashboard`, and `route=/api/agent`.

`provider_send`:

1. Set `PROVIDER_SEND_ALERT_THRESHOLD=1` and `OPS_ALERT_WINDOW_SECS=60` on the dashboard.
2. Do not break live provider credentials. Trigger one controlled dashboard-side provider alert using the existing alert helper against production Sentry and Redis with test metadata: `provider=postmark`, `channel=email`, and `orgId=<test-org-id>`.
3. Confirm Sentry receives an event tagged `category=provider_send`, `service=dashboard`, `provider=postmark`, and `channel=email`.

`queue_health`:

1. Check `GET https://<gateway>/health/queues` first.
2. If there is already a failed, waiting, or active-stuck condition, lower only the matching queue threshold and let the maintenance worker emit naturally.
3. If queues are clean, trigger one controlled gateway-side queue alert through the existing alert helper with `category=queue_health`, `queue=inbound`, and test metadata.
4. Confirm Sentry receives an event tagged `category=queue_health`, `service=gateway`, and `queue=inbound`.

After each category, record the Sentry issue URL, event id, alert recipient, tags/extras checked, and any side-effect notes in the sign-off evidence section.

### BullMQ Failed Jobs

Retry-exhausted BullMQ jobs land in the queue's `failed` set after all configured attempts are used. The launch queues most likely to need inspection are:

- `inbound-messages` for inbound email, Shopify order events, and deferred Instagram DM jobs.
- `ai-summary` for summary, plan precompute, auto-ack, and notification work.

Inspect failed jobs from a shell with production `REDIS_URL` loaded:

```bash
cd apps/gateway
npx tsx -e "import { Queue } from 'bullmq'; import { createGatewayRedisClient } from './src/clients/redis-client.ts'; import { QUEUE } from './src/constants.ts'; const conn = createGatewayRedisClient(); const q = new Queue(QUEUE.INBOUND, { connection: conn }); const jobs = await q.getJobs(['failed'], 0, 20, false); for (const job of jobs) console.log(JSON.stringify({ id: job.id, name: job.name, failedReason: job.failedReason, attemptsMade: job.attemptsMade, data: job.data }, null, 2)); await q.close(); await conn.quit();"
```

For the summary queue, change `QUEUE.INBOUND` to `QUEUE.AI_SUMMARY`.

Replay a failed job only after the root cause is understood and fixed:

```bash
cd apps/gateway
JOB_ID='the-failed-job-id' npx tsx -e "import { Queue } from 'bullmq'; import { createGatewayRedisClient } from './src/clients/redis-client.ts'; import { QUEUE } from './src/constants.ts'; const conn = createGatewayRedisClient(); const q = new Queue(QUEUE.INBOUND, { connection: conn }); const job = await q.getJob(process.env.JOB_ID); if (!job) throw new Error('Job not found'); await job.retry('failed'); console.log('Retried job', job.id); await q.close(); await conn.quit();"
```

Before replaying:

- Check `failedReason`, `attemptsMade`, `traceId`, `organizationId`, and provider response details in Railway logs.
- Confirm Redis, Postgres, and provider credentials are healthy.
- Check whether the job may have already created customer-visible side effects.
- Prefer replaying one job first, then watch `/health/queues` before replaying a batch.

## Sign-Off Evidence

Do not mark the deploy track done until you have all of the following:

- `npm run db:migrate:deploy` completed successfully against production
- dashboard `/api/health` returned `200`
- gateway `/health/deep` returned `200`
- gateway `/health/queues` showed a healthy worker heartbeat
- Sentry alert rules are configured and one controlled alert per guardrail category has routed correctly
- `npm run verify:production` passed against the live URLs
- Better Stack checks are passing for dashboard health, gateway deep health, and gateway queue health
- Neon production PITR is enabled and the retention window is recorded
- at least one real inbound message completed the full path:
  webhook accepted -> queue job created -> worker processed -> dashboard thread visible -> plan generated -> outbound reply sent

Reliability evidence to record before updating [`checklist.md`](checklist.md):

- Sentry `queue_health`: issue URL, event id, routed owner, validation time
- Sentry `webhook_signature`: issue URL, event id, routed owner, validation time
- Sentry `provider_send`: issue URL, event id, routed owner, validation time
- Sentry `agent_failure`: issue URL, event id, routed owner, validation time
- Better Stack dashboard monitor: monitor id, monitor URL, escalation policy or owner, required keyword, first passing check time
- Better Stack gateway deep monitor: monitor id, monitor URL, escalation policy or owner, required keyword, first passing check time
- Better Stack gateway queue monitor: monitor id, monitor URL, escalation policy or owner, required keyword, first passing check time
- Neon PITR: branch, status, retention window, confirmation time
