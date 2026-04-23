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
- Env validation: [apps/gateway/src/env.ts](../../apps/gateway/src/env.ts)

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
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `INTERNAL_API_SECRET`
- `APP_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Rules:

- `APP_URL` must be a valid absolute `http` or `https` URL.
- If `NEXT_PUBLIC_APP_URL` is set, it must be a valid absolute `http` or `https` URL and match `APP_URL`.
- `DATABASE_URL` should include `pgbouncer=true` and `connection_limit=1`.

### Dashboard Required For Launch Scope Features

- `GATEWAY_INTERNAL_URL`
  Used for Shopify webhook registration during OAuth and for local webhook proxy routes. In production this should be the public Railway gateway URL even though the name says `internal`.
- `POSTMARK_API_KEY`
- `INBOUND_EMAIL_DOMAIN`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_CONFIG_ID`
  Required for Instagram OAuth initiation.
- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`
- `SHOPIFY_APP_SECRET`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `TWILIO_WEBHOOK_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PRICE_ID_STARTER`
- `PRICE_ID_PRO`

Optional:

- `SENTRY_DSN`

### Gateway Required At Production Boot

- `DATABASE_URL`
- `REDIS_URL`
- `ANTHROPIC_API_KEY`
- `INTERNAL_API_SECRET`
- `DASHBOARD_URL`
- `META_APP_SECRET`

Rules:

- `DASHBOARD_URL` must be a valid absolute `http` or `https` URL.
- In production, `DASHBOARD_URL` is mandatory.
- `DASHBOARD_INTERNAL_URL` is dev-only and should not be relied on in production.
- `DATABASE_URL` should include `pgbouncer=true` and `connection_limit=1`.

### Gateway Required For Launch Scope Features

- `META_VERIFY_TOKEN`
- `META_APP_ID`
  Needed for the Instagram token-health maintenance job.
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_NUMBER`
- `TWILIO_WEBHOOK_URL`
- `SHOPIFY_APP_SECRET`

Optional:

- `SENTRY_DSN`
- `GATEWAY_RUNTIME_ROLE`
  Defaults to `all`. Only set it if you intentionally split server and worker processes.

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

### Instagram DM

1. Verify the Meta webhook handshake succeeds on `GET /webhooks/meta`.
2. Send a real DM to the connected Instagram account.
3. Confirm the gateway verifies the signature, queues the job, and the worker creates the thread.
4. Confirm the dashboard shows the thread and plan.
5. Approve a reply and confirm the DM is delivered.

### WhatsApp / SMS

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

## Sign-Off Evidence

Do not mark the deploy track done until you have all of the following:

- `npm run db:migrate:deploy` completed successfully against production
- dashboard `/api/health` returned `200`
- gateway `/health/deep` returned `200`
- gateway `/health/queues` showed a healthy worker heartbeat
- `npm run verify:production` passed against the live URLs
- at least one real inbound message completed the full path:
  webhook accepted -> queue job created -> worker processed -> dashboard thread visible -> plan generated -> outbound reply sent
