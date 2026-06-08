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
- **Dashboard (Vercel):** `next build` only; no external error-tracking SDK or source-map upload step.
- **Gateway (Railway):** `npm run build` is compile-only (`tsc`).
- The dashboard health endpoint is `/api/health`.
- The gateway readiness endpoints are `/health/deep` and `/health/queues`.
- Ops alerts emit structured Pino logs with `opsAlert: true` when thresholds are crossed. See [`runbook.md`](runbook.md) for validation steps.

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

See [`runbook.md`](runbook.md) for operational procedures.
