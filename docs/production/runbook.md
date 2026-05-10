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
npx prisma generate --schema=packages/db/prisma/schema.prisma && npm run build -w packages/db && npx turbo run build --filter=clerk-dashboard
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
npm run build -w apps/gateway
```

- If Railway is configured with a custom build command in the console, use the same targeted build path above instead of a monorepo-wide build.

## Environment Matrix

### Dashboard Required At Production Boot

- `DATABASE_URL`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `ANTHROPIC_API_KEY`
- `INTERNAL_API_SECRET`
- `APP_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `SENTRY_DSN`

Rules:

- `APP_URL` must be a valid absolute `http` or `https` URL.
- If `NEXT_PUBLIC_APP_URL` is set, it must be a valid absolute `http` or `https` URL and match `APP_URL`.
- `DATABASE_URL` should include `pgbouncer=true` and `connection_limit=1`.

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
- `PRICE_ID_STARTER`
- `PRICE_ID_PRO`

Optional:

- `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID` for Instagram DM after v1.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_WEBHOOK_URL` for WhatsApp/SMS after v1.
- `USPS_CLIENT_ID`, `USPS_CLIENT_SECRET` if direct USPS tracking is ever reintroduced.

### Gateway Required At Production Boot

- `DATABASE_URL`
- `REDIS_URL`
- `ANTHROPIC_API_KEY`
- `INTERNAL_API_SECRET`
- `DASHBOARD_URL`
- `SENTRY_DSN`

Rules:

- `DASHBOARD_URL` must be a valid absolute `http` or `https` URL.
- In production, `DASHBOARD_URL` is mandatory.
- `DASHBOARD_INTERNAL_URL` is dev-only and should not be relied on in production.
- `DATABASE_URL` should include `pgbouncer=true` and `connection_limit=1`.

### Gateway Required For Launch Scope Features

- `SHOPIFY_APP_SECRET`
- `BLOB_READ_WRITE_TOKEN`
  Required for inbound email attachments.

Optional:

- `GATEWAY_RUNTIME_ROLE`
  Defaults to `all`. Only set it if you intentionally split server and worker processes.
- `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_APP_ID` for Instagram DM after v1.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, `TWILIO_WEBHOOK_URL` for WhatsApp/SMS after v1.

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
DATABASE_URL='postgresql://…' npm run db:migrate:deploy
```

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
VERIFY_INBOUND_EMAIL_FROM='clerk-smoke@example.com' \
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

### WhatsApp / SMS (Deferred After V1)

1. Point Twilio at `POST /webhooks/twilio` on the gateway, not the dashboard proxy route.
2. Send a real inbound WhatsApp message to the live number.
3. Confirm the gateway accepts the webhook, queues the job, and the worker creates the thread.
4. Confirm the WhatsApp plan notification reaches verified org members.
5. Approve or respond and confirm the outbound customer message sends.

### Shopify

1. Complete a live Shopify OAuth connect flow from the production dashboard.
2. Confirm the integration row is written in the DB.
3. Confirm the four order webhooks are registered against the public gateway URL.
4. Trigger one supported order event.
5. Confirm the inbound event reaches the gateway and appears in the dashboard where applicable.

## Production-Only Webhook Routing

The dashboard webhook proxy routes are for local development convenience. In production, point providers directly at the gateway:

- Meta -> `https://<gateway>/webhooks/meta`
- Twilio -> `https://<gateway>/webhooks/twilio`
- Postmark inbound -> `https://<gateway>/webhooks/email/inbound`
- Shopify -> `https://<gateway>/webhooks/shopify`

Relevant proxy routes:

- [apps/dashboard/src/app/api/webhooks/meta/route.ts](../../apps/dashboard/src/app/api/webhooks/meta/route.ts)
- [apps/dashboard/src/app/api/webhooks/twilio/route.ts](../../apps/dashboard/src/app/api/webhooks/twilio/route.ts)
- [apps/dashboard/src/app/api/webhooks/email/route.ts](../../apps/dashboard/src/app/api/webhooks/email/route.ts)

## Operational Guardrails

The guardrail code is implemented, but the production checklist item is not complete until Sentry alert rules are configured and validated against live or staging traffic. Treat [`operational-guardrails.md`](operational-guardrails.md) as the implementation record and this section as the production operating procedure.

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
3. In staging or a safe production window, temporarily set the relevant threshold to `1` and `OPS_ALERT_WINDOW_SECS=60`.
4. Trigger one controlled event per category.
5. Confirm the event lands in Sentry with the expected `category` and `service` tags.
6. Confirm the alert routes to the launch owner.
7. Restore the default threshold after validation.
8. Set `OPS_ALERTS_ENABLED=false` briefly and confirm threshold alerts are silenced without suppressing structured logs.

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
- at least one real inbound message completed the full path:
  webhook accepted -> queue job created -> worker processed -> dashboard thread visible -> plan generated -> outbound reply sent
