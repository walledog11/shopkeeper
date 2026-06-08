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
- `TOKEN_ENCRYPTION_KEY` and `SENTRY_DSN` are set for both apps, gateway `POSTMARK_INBOUND_USERNAME` / `POSTMARK_INBOUND_PASSWORD` are set for inbound email, `BLOB_READ_WRITE_TOKEN` is set on both gateway (upload) and dashboard (authenticated download proxy), and Sentry source-map upload vars are available in the build environment.
- Clerk lifecycle webhook endpoint is configured to `https://<dashboard>/api/webhooks/clerk`, and the dashboard has `CLERK_WEBHOOK_SECRET`.

## Deploy Order

1. Set or update production env vars in Vercel and Railway.
2. Run the production DB migration (uses `DIRECT_DATABASE_URL` via Prisma `directUrl`; keep the pooled `DATABASE_URL` set as well):

```bash
DATABASE_URL='postgresql://...@ep-....-pooler.us-east-2.aws.neon.tech/neondb?pgbouncer=true&connection_limit=1' \
DIRECT_DATABASE_URL='postgresql://...@ep-....us-east-2.aws.neon.tech/neondb?sslmode=require' \
npm run db:migrate:deploy
```

3. Deploy the dashboard to Vercel.
4. Deploy the gateway to Railway.

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
- Dashboard uses `@sentry/nextjs` `withSentryConfig` in `apps/dashboard/next.config.js` — source maps upload as part of `next build` (Turbopack hook), not a separate deploy script.
- Gateway uploads in `apps/gateway` `build` (`tsc && node scripts/sentry-upload-sourcemaps.mjs dist --require`).
- Set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` in the **build** environment for Vercel and Railway. `SENTRY_DSN` alone is not enough.
- Vercel builds fail at config load if those three vars are missing (`VERCEL=1`). Gateway/Railway deploy builds fail in the upload script when vars are missing.
- If Vercel Root Directory is `apps/dashboard`, use `apps/dashboard/vercel.json`. If root is the repo root, use root `vercel.json`.
- The dashboard health endpoint is `/api/health`.
- The gateway readiness endpoints are `/health/deep` and `/health/queues`.

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

Run the automated verification first:

```bash
DASHBOARD_URL='https://your-dashboard.vercel.app' \
GATEWAY_URL='https://your-gateway.up.railway.app' \
npm run verify:production
```

Optional inbound email smoke test:

```bash
DASHBOARD_URL='https://your-dashboard.vercel.app' \
GATEWAY_URL='https://your-gateway.up.railway.app' \
VERIFY_INBOUND_EMAIL_TO='support@inbound.example.com' \
VERIFY_INBOUND_EMAIL_FROM='smoke@example.com' \
npm run verify:production
```

## Manual Completion Checks

After the automated checks pass, confirm the v1 support flow in production:

1. Send a smoke-test inbound email to the production inbound address.
2. Confirm the gateway accepts the webhook.
3. Confirm `/health/deep` reports `checks.worker.status = ok`.
4. Confirm the thread appears in the dashboard inbox.
5. Open the thread and verify the message body and metadata are present.
6. Send a reply from the dashboard and confirm provider delivery succeeds.

Do not mark the deployment complete until both the health checks and the inbox smoke test pass.
