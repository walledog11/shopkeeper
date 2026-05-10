# Production Deployment

This runbook covers the repo-side production deployment path for the dashboard on Vercel and the gateway on Railway.

## Prerequisites

- Production Neon Postgres database created.
- Production Upstash Redis created in the same region as Vercel and Railway.
- `DATABASE_URL` uses the production database and includes `pgbouncer=true&connection_limit=1`.
- Gateway `REDIS_URL` uses the TLS form: `rediss://...`.
- A new production-only `INTERNAL_API_SECRET` has been generated.
- Production env vars from [`checklist.md`](checklist.md) are populated in Vercel and Railway.
- V1 launch env covers email and Shopify. Meta, Twilio, and USPS vars are optional until those channels are reintroduced.
- `SENTRY_DSN` is set for both apps, and gateway `BLOB_READ_WRITE_TOKEN` is set for inbound email attachments.

## Deploy Order

1. Set or update production env vars in Vercel and Railway.
2. Run the production DB migration:

```bash
DATABASE_URL='postgresql://...' npm run db:migrate:deploy
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
- Vercel builds `packages/db` before the dashboard so the shared package output is current during deploy.
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
