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
- Env validation: [apps/dashboard/src/lib/env/index.ts](../../apps/dashboard/src/lib/env/index.ts)

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
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  Gmail OAuth credentials used for connection and watch registration.
- `GMAIL_PUBSUB_TOPIC`
  Fully qualified topic name, for example `projects/shopkeeper-prod/topics/gmail-inbound`.
- `GMAIL_NATIVE_INBOUND`
  Controlled-rollout switch. Defaults to `false`; use the same value in the dashboard and
  gateway. When disabled, Gmail OAuth remains available for sending and the dashboard directs
  merchants to the forwarding fallback.
- `IMESSAGE_LINE_HANDLE`
  The fixed iMessage handle merchants text to reach the operator agent. Presence makes iMessage
  available in Integrations and onboarding; it is not a secret.

Optional:

- `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` for Instagram Login OAuth.
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

Rules:

- `DASHBOARD_URL` must be a valid absolute `http` or `https` URL.
- In production, `DASHBOARD_URL` is mandatory.
- `DASHBOARD_INTERNAL_URL` is dev-only and should not be relied on in production.
- `DATABASE_URL` should include `pgbouncer=true` and `connection_limit=1`.
- `DIRECT_DATABASE_URL` must use the direct Neon host (no `-pooler` suffix, no `pgbouncer=true`).

### Gateway Required For Launch Scope Features

- `SHOPIFY_APP_SECRET`
- `POSTMARK_INBOUND_USERNAME`, `POSTMARK_INBOUND_PASSWORD`
  Required for inbound email webhook basic auth in production whenever the forwarding rail is
  active — i.e. `EMAIL_INBOUND_MODE` is `hybrid` (default) or `postmark`. See the email
  architecture note below.
- `BLOB_READ_WRITE_TOKEN`
  Required for inbound email attachment upload in the gateway worker.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `GMAIL_PUBSUB_TOPIC`
- `GMAIL_PUBSUB_AUDIENCE`
- `GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT`
  Gmail and authenticated Pub/Sub push settings. The audience and service-account email must
  exactly match the push subscription configuration.
- `GMAIL_NATIVE_INBOUND`
  Explicit controlled-rollout switch. Set `false` until Pub/Sub provisioning is verified, and
  keep its value in sync with the dashboard. When disabled, Gmail pushes are acknowledged
  without queueing, sync jobs no-op, and watch renewal skips Gmail integrations.
- `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET`, `SPECTRUM_WEBHOOK_SECRET`
  Platform-wide Photon Spectrum credentials for the operator iMessage line (one project for all orgs).
  `SPECTRUM_WEBHOOK_SECRET` is the per-endpoint secret shown when registering
  `https://<gateway>/webhooks/photon` in [app.photon.codes](https://app.photon.codes) → Webhooks.
  Rotates if that endpoint is recreated.

Optional:

- `EMAIL_INBOUND_MODE`
  `hybrid` (default) | `postmark` | `gmail-only`. Selects which inbound rail(s) the gateway
  expects. `gmail-only` lets the gateway boot without Postmark inbound creds (dev / future
  native-only); production stays `hybrid` until the last forwarding merchant migrates.
- `GATEWAY_RUNTIME_ROLE`
  Defaults to `all`. Only set it if you intentionally split server and worker processes.
- `INSTAGRAM_APP_SECRET`, `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` for Instagram DM webhooks.
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` for the Telegram operator channel.

### Email architecture: inbound rail vs outbound provider

Email is a **hybrid model** — keep the two concerns separate when debugging:

- **Inbound rail** (how customer mail becomes a ticket): Gmail can receive native Pub/Sub push
  notifications, synchronize mailbox history through `gmail-sync`, and enqueue the same
  `process-email` jobs used by Postmark forwarding. Watch renewal runs every 12 hours, and an
  expired history checkpoint triggers a bounded seven-day inbox recovery. Keep
  `EMAIL_INBOUND_MODE=hybrid` during rollout so Postmark remains the fallback.
- **Outbound provider** (how replies are sent): chosen per integration from
  `Integration.metadata.provider` — `gmail` (Gmail API) or `postmark` (forwarding fallback).
  The reply `From` uses `Integration.fromEmail` (falling back to
  `externalAccountId`); the OAuth account email is the identity used for `replyTo` and token
  refresh.

Gmail native inbound is implemented but remains in controlled rollout.

### Gmail native-inbound rollout

Keep `EMAIL_INBOUND_MODE=hybrid` for every rollout stage so Postmark forwarding remains active.
Set `GMAIL_NATIVE_INBOUND=true` in both dashboard and gateway only after the environment's
Pub/Sub topic, push subscription, OIDC audience, and service account have been verified.
Enabling the flag does not automatically enroll existing send-only Gmail connections; they enter
native inbound only after an explicit reconnect (or an operator sets their integration
`inboundMode` to `hybrid`/`native`). Existing active watches continue to renew.

Roll out in this order:

1. Local and automated tests with mocked Gmail and Pub/Sub.
2. One OAuth test user through a public development tunnel.
3. Internal organizations with Gmail and Postmark dual delivery.
4. Google OAuth test users while restricted-scope verification is pending.
5. Newly connected external merchants after verification.
6. Existing Gmail merchants after explicit reconnection.

For every stage, verify watch expiration, last successful sync, duplicate suppression, alias
filtering, outbound send-as behavior, and reconnect/degraded states in Integrations. Roll back by
setting `GMAIL_NATIVE_INBOUND=false` in both services; leave `EMAIL_INBOUND_MODE=hybrid`.
Do not use `gmail-only` until the production soak is complete and no forwarding integrations
remain.

### Gmail Pub/Sub provisioning

Authenticate `gcloud` as an administrator for the Google Cloud project that owns the Gmail OAuth
client, then run the idempotent setup command:

```bash
GCP_PROJECT_ID='shopkeeper-prod' \
GMAIL_PUBSUB_PUSH_ENDPOINT='https://gateway.example.com/webhooks/gmail/push' \
GMAIL_PUBSUB_AUDIENCE='https://gateway.example.com/webhooks/gmail/push' \
npm run configure:gmail-pubsub
```

The command creates the topic, grants Gmail's system publisher, creates the dedicated push service
account, grants Pub/Sub permission to mint its OIDC token, and creates or updates the authenticated
push subscription. Copy the three printed `GMAIL_PUBSUB_*` values into Vercel and Railway as listed
above. The operator running it needs Pub/Sub Admin and permission to manage service accounts and
their IAM policies, including `iam.serviceAccounts.actAs` on the push service account.

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

### iMessage Operator Channel (Phase 0 infra)

One platform-wide Photon Spectrum line serves all orgs. Merchants bind their iPhone by texting a
connect code; customers never use this channel.

**One-time Photon setup**

1. Confirm or create a Spectrum project with an iMessage line (shared pool is fine for beta).
   Use `photon login` then `photon projects show` and `photon spectrum lines list`, or the
   [Photon dashboard](https://app.photon.codes).
2. Register the inbound webhook in app.photon.codes → **Webhooks**:
   - URL: `https://<gateway>/webhooks/photon`
   - Copy the endpoint signing secret into gateway `SPECTRUM_WEBHOOK_SECRET` on Railway (both
     `shopkeeper` and `Gateway Worker` services if split).
3. Set env vars:

   | Service | Variables |
   |---------|-----------|
   | **Gateway (Railway)** | `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET`, `SPECTRUM_WEBHOOK_SECRET` |
   | **Dashboard (Vercel)** | `IMESSAGE_LINE_HANDLE` — must match the handle merchants text |

4. Apply migration `20260624000000_add_org_member_imessage_bindings` (and later iMessage migrations)
   if not already deployed: `npm run db:migrate:deploy`.
5. Confirm `GATEWAY_RUNTIME_ROLE` includes `server` (default `all` on a single Railway service).
   Spectrum inbound webhooks need the public gateway process.

**Phase 0 verification**

```bash
# Webhook route must not return 503 (missing Spectrum creds)
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  https://<gateway>/webhooks/photon \
  -H "Content-Type: application/json" -d '{}'

# After gateway deploy with imessage health check:
curl -sS https://<gateway>/health/deep | jq '.checks.imessage'

DASHBOARD_URL='https://<dashboard>' \
GATEWAY_URL='https://<gateway>' \
npm run verify:production
```

Pass criteria:

- Photon webhook POST returns anything except `503` (signature errors `400`/`401` are fine pre-test).
- Gateway logs `[Webhook] Photon delivery processed` with `status: 200` on a signed test inbound.
- Dashboard Integrations shows iMessage Connect enabled (not disabled) when `IMESSAGE_LINE_HANDLE` is set.

Full merchant flows (bind, plan push, approve) are Phase 1 in
[`imessage-production-readiness-plan.md`](../imessage-production-readiness-plan.md).

### iMessage down triage

When merchants report missing plan pushes, bind replies, or digests:

1. **Configured?** `curl -sS https://<gateway>/health/deep | jq '.checks.imessage'` — `ok` means
   `isImessageConfigured()` passed (all three `SPECTRUM_*` vars set). `503` on
   `POST /webhooks/photon` with `[Webhook] Photon webhook received but iMessage is not configured`
   means missing creds on the gateway.
2. **Webhook ingress** — Confirm Photon dashboard webhook URL is `https://<gateway>/webhooks/photon`
   and `SPECTRUM_WEBHOOK_SECRET` matches the endpoint secret shown in
   [app.photon.codes](https://app.photon.codes) → Webhooks. Signature failures emit
   `category=webhook_signature`.
3. **Credential rotation** — After rotating `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET`, or
   `SPECTRUM_WEBHOOK_SECRET`, redeploy the gateway and re-run Phase 1 bind smoke. A mismatched
   webhook secret returns `401` on inbound Photon deliveries.
4. **Stale `spaceId`** — Proactive sends (plan push, digest, escalation) use
   `OrgMemberImessageBinding.spaceId`. Inbound refreshes `spaceId` on each merchant message; if
   Photon re-provisioned the space, ask the merchant to text the line once before proactive sends
   resume. Gateway logs `[Spectrum] iMessage send failed` or `[Spectrum] iMessage space load failed`
   with `spaceId`; repeated failures emit `category=provider_send`, `provider=imessage`,
   `channel=operator_notify`.
5. **Device cap** — Telegram limits each member to 3 bound devices; iMessage has **no device cap**
   (unlimited iPhones per member). Unlink stale handles from Integrations if a merchant rotates phones.
6. **Proactive send dedupe** — BullMQ retries use Redis idempotency keys per channel
   (`[OperatorNotify] Duplicate delivery skipped`) so a partial fan-out failure does not re-text
   channels that already received the notification. Keys expire after 1 hour.
7. **No delivery receipts** — A successful send means Spectrum `space.send()` resolved, not that the
   message was read on the iPhone. Check gateway logs for `[Worker] Plan notification sent` with
   `channel: imessage` vs `[Worker] Plan notification failed`.
8. **Bind path** — Search `[iMessage] Bind succeeded`, `Bind rejected`, or `Bind failed` in gateway
   logs. Unbound senders should receive connect instructions, not agent runs or ticket creation.

Controlled validation (gateway iMessage `provider_send`):

```bash
cd apps/gateway
PROVIDER_SEND_ALERT_THRESHOLD=1 OPS_ALERT_WINDOW_SECS=60 \
  npx tsx src/scripts/emit-controlled-ops-alert.ts provider_send <test-org-id>
```

Expected log tags: `category=provider_send`, `service=gateway`, `provider=imessage`,
`channel=operator_notify`.

### iMessage bind support playbook

**Binding security (verified in code):**

- Each iPhone handle (`senderId`) binds to **one member globally** — unique index on
  `org_member_imessage_bindings.sender_id`. Texting a fresh connect code from org B moves the
  handle to org B; org A stops receiving operator notifications until someone re-binds there.
- Connect codes are **single-use**, **24h TTL** (`ORG_MEMBER_BIND_TOKEN_TTL_SECONDS`), minted only
  via `POST /api/integrations/imessage/bind` with `requireBillingWriteAllowed: true`.
- Gateway bind logs include `senderId`, `spaceId`, `orgId`, and `outcome` only — never the token
  or inbound message body at info/warn.

**Wrong-org bind**

1. Confirm which org owns the handle: Integrations → iMessage on each workspace, or query
   `org_member_imessage_bindings` by `sender_id`.
2. The merchant (or support) unlinks the handle from the **current** org's Integrations page, or
   mints a code from the **intended** org and texts it — the global upsert moves the binding.
3. Org that lost the handle sees no plan pushes until a member re-binds from that dashboard.

**Lost operator access (no plan pushes / bind reply fails)**

1. Check gateway `/health/deep` → `checks.imessage` is `ok` and `IMESSAGE_LINE_HANDLE` matches
   Photon's line on the dashboard.
2. Merchant: Integrations → iMessage → **Unlink**, mint a new code, text it from the iPhone.
3. If proactive sends fail but inbound works, ask the merchant to text the line once (refreshes
   stale `spaceId` — see triage above).
4. Escalate to engineering if bind succeeds but sends still fail (`provider_send` ops alerts).

**Legacy customer iMessage threads (pre-rewire)**

Pre-GA customer-support threads with `channel_type = imessage` are orphaned — iMessage is
operator-only and no longer opens inbox tickets. Soft-delete them before GA:

```bash
# Preview count
cd apps/gateway
npx tsx src/scripts/purge-legacy-imessage-threads.ts --dry-run

# Apply (sets deleted_at + status closed)
npx tsx src/scripts/purge-legacy-imessage-threads.ts
```

Hard purge of soft-deleted rows follows the normal 90-day retention job in `maintenance/retention.ts`.

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
- Photon Spectrum (iMessage operator) -> `https://<gateway>/webhooks/photon`
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

The guardrail code is implemented, but the production checklist item is not complete until ops-alert log routing is validated against live or staging traffic. Treat [`operational-guardrails.md`](operational-guardrails.md) as the implementation record and this section as the production operating procedure.

### External Monitors

Configure Better Stack HTTP keyword checks before sign-off. Do this manually in the Better Stack console; do not add Better Stack API tokens or credentials to the repo. Route these monitors to the same launch owner or escalation policy used for ops-alert notifications.

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
- Escalation policy: same launch owner or policy used for ops alerts

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

### Ops Alert Log Routing

Ops alerts emit structured Pino logs with `opsAlert: true` and stable `category`, `service`, `tags`, `extra`, and `fingerprint` fields. Route Vercel and Railway log drains to Better Stack and create keyword alert rules on `opsAlert` and `category` (see [error-tracking-plan.md](error-tracking-plan.md)).

Alert categories:

- `category=queue_health`
- `category=webhook_signature`
- `category=provider_send`
- `category=agent_failure`

Route both dashboard and gateway alerts to the same launch owner until ownership is split. Keep `service`, `queue`, `provider`, `channel`, and `tool` visible in notifications, and avoid routing by `orgId` because that fragments platform incidents.

Before sign-off:

1. Confirm `OPS_ALERTS_ENABLED` is unset or set to `true`.
2. In staging or a safe production window, record the current alert env values.
3. Temporarily set `OPS_ALERT_WINDOW_SECS=60` and set only the threshold under test to `1`.
4. Trigger one controlled event per category.
5. Confirm the structured log lands in your log drain with the expected `category` and `service` tags.
6. Confirm the log-based alert routes to the launch owner.
7. Confirm the log fields, grouping keys, and absence of customer-facing side effects.
8. Restore the default thresholds after validation.
9. Set `OPS_ALERTS_ENABLED=false` briefly and confirm threshold alerts are silenced without suppressing ordinary structured logs.

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
4. Confirm the log drain receives an entry tagged `category=webhook_signature` and `service=gateway`.

`agent_failure`:

1. Set `AGENT_FAILURE_ALERT_THRESHOLD=1` and `OPS_ALERT_WINDOW_SECS=60` on the dashboard.
2. As an authenticated launch-test user in a test organization, call `POST https://<dashboard>/api/agent` with a valid test `threadId` but no approved plan.
3. Confirm the route returns the controlled `400`.
4. Confirm the log drain receives an entry tagged `category=agent_failure`, `service=dashboard`, and `route=/api/agent`.

`provider_send`:

1. Set `PROVIDER_SEND_ALERT_THRESHOLD=1` and `OPS_ALERT_WINDOW_SECS=60` on the gateway.
2. Do not break live provider credentials. Trigger one controlled gateway-side provider alert using
   the existing alert helper with test metadata:
   `cd apps/gateway && npx tsx src/scripts/emit-controlled-ops-alert.ts provider_send <test-org-id>`
3. Confirm the log drain receives an entry tagged `category=provider_send`, `service=gateway`,
   `provider=imessage`, and `channel=operator_notify`.

For dashboard email sends, repeat with the dashboard helper:
`cd apps/dashboard && npx tsx src/scripts/emit-controlled-ops-alert.ts provider_send <test-org-id>`
(tags: `service=dashboard`, `provider=postmark`, `channel=email`).

`queue_health`:

1. Check `GET https://<gateway>/health/queues` first.
2. If there is already a failed, waiting, or active-stuck condition, lower only the matching queue threshold and let the maintenance worker emit naturally.
3. If queues are clean, trigger one controlled gateway-side queue alert through the existing alert helper with `category=queue_health`, `queue=inbound`, and test metadata.
4. Confirm the log drain receives an entry tagged `category=queue_health`, `service=gateway`, and `queue=inbound`.

`gmail_inbound`:

1. Use a Gmail test integration; do not revoke or alter a production merchant grant.
2. Force the test integration's watch expiration into the renewal window and let
   `gmail-watch-maintenance` run.
3. For the failure path, use an isolated test configuration and confirm the third consecutive
   renewal failure emits `category=gmail_inbound`. An expired watch emits the same category
   immediately.
4. Confirm the alert includes only integration identifiers, the safe error category, and the
   failure count—not OAuth tokens or message content.

After each category, record the log entry timestamp, alert recipient, tags/extras checked, and any side-effect notes in [`alerting-evidence.md`](alerting-evidence.md).

### BullMQ Failed Jobs

Retry-exhausted BullMQ jobs land in the queue's `failed` set after all configured attempts are used. The launch queues most likely to need inspection are:

- `inbound-messages` for inbound email, Shopify order events, and deferred Instagram DM jobs.
- `ai-summary` for summary, plan precompute, auto-ack, and notification work.
- `gmail-sync` for Gmail history synchronization and stale-history recovery.
- `gmail-watch-maintenance` for 12-hour watch renewal and inbound health monitoring.

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
- ops-alert log routing is configured and one controlled alert per guardrail category has routed correctly
- `npm run verify:production` passed against the live URLs
- Better Stack checks are passing for dashboard health, gateway deep health, and gateway queue health
- Neon production PITR is enabled and the retention window is recorded
- at least one real inbound message completed the full path:
  webhook accepted -> queue job created -> worker processed -> dashboard thread visible -> plan generated -> outbound reply sent

Reliability evidence to record before updating [`checklist.md`](checklist.md):

- Ops alert `queue_health`: log timestamp, routed owner, validation time
- Ops alert `webhook_signature`: log timestamp, routed owner, validation time
- Ops alert `provider_send`: log timestamp, routed owner, validation time
- Ops alert `agent_failure`: log timestamp, routed owner, validation time
- Ops alert `gmail_inbound`: log timestamp, routed owner, validation time
- Better Stack dashboard monitor: monitor id, monitor URL, escalation policy or owner, required keyword, first passing check time
- Better Stack gateway deep monitor: monitor id, monitor URL, escalation policy or owner, required keyword, first passing check time
- Better Stack gateway queue monitor: monitor id, monitor URL, escalation policy or owner, required keyword, first passing check time
- Neon PITR: branch, status, retention window, confirmation time
