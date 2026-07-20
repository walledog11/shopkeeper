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

> Dashboard `UPSTASH_REDIS_REST_URL` (Upstash REST — rate limiting, locks, presence) and gateway `REDIS_URL` (a dedicated per-instance Redis for BullMQ) are **separate** instances and must not point at the same database. BullMQ holds a blocking connection per worker and polls continuously, so running it against Upstash's per-command billing is very expensive. Agent locks are therefore host-local latency guards, not the cross-host correctness boundary: reviewed actions are single-use through PostgreSQL plan claims, operator events through their durable event claim, and capped goodwill through reservations. Both lock adapters renew their token-checked lease during long turns and log a lost/unknown lease; release can never delete a successor's token. The daily LLM spend cap is also shared across both apps via Postgres (the `llm_daily_spend` table), so it stays per-org regardless of the Redis split.

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
  Used for private inbound email and Instagram attachment storage and by `GET /api/attachments`
  to stream those attachments to authenticated workspace members.
- `PRICE_ID_STARTER`
- `PRICE_ID_PRO`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  Gmail OAuth credentials used for connection and watch registration.
- `GMAIL_PUBSUB_TOPIC`
  Fully qualified topic name, for example `projects/shopkeeper-prod/topics/gmail-inbound`.
- `GMAIL_NATIVE_INBOUND`
  Controlled-rollout switch. Defaults to `false`; use the same value in the dashboard and
  gateway. When disabled, Gmail OAuth remains available for sending; merchants may independently
  connect the forwarded Email integration for inbound intake.
- `IMESSAGE_LINE_HANDLE`
  The fixed iMessage handle merchants text to reach the operator agent. Presence makes iMessage
  available in Integrations and onboarding; it is not a secret.
- `INSTAGRAM_INTEGRATION_ENABLED`
  Explicit production rollout switch. Keep it `false` outside the Standard Access test cohort
  until Advanced Access is approved.

Optional:

- `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` for Instagram Login OAuth.
- `INSTAGRAM_BETA_ORG_IDS` optionally limits enabled Instagram OAuth to comma-separated Clerk
  organization IDs. Leave it empty only when every workspace should be eligible.
- `INSTAGRAM_WEBHOOK_APP_SECRET` only when the dashboard's local-development webhook proxy is used;
  set it to the parent Meta app secret that signs webhook deliveries.
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
  Required for inbound email and Instagram attachment upload in the gateway worker.
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
- `INSTAGRAM_WEBHOOK_APP_SECRET`, `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` for Instagram DM webhooks.
  `INSTAGRAM_WEBHOOK_APP_SECRET` is the parent Meta app secret that owns the webhook subscription,
  not the separate Instagram Login OAuth secret.
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` for the Telegram operator channel.

### Email architecture: independent Gmail and forwarding integrations

Each workspace can have one Gmail integration and one forwarded Email/Postmark integration
simultaneously. Connecting, reconnecting, or deleting one must not modify the other.

- **Inbound intake:** Gmail can receive native Pub/Sub push
  notifications, synchronize mailbox history through `gmail-sync`, and enqueue the same
  `process-email` jobs used by Postmark forwarding. Watch renewal runs every 12 hours, and an
  expired history checkpoint triggers a bounded seven-day inbox recovery. Postmark accepts only
  the generated organization recipient from `OriginalRecipient` and requires an active Postmark
  integration row; the visible `To` header is not a tenancy key.
- **Outbound routing:** `Integration.emailProvider` is authoritative. Replies and auto-acks use
  the valid `Thread.replyIntegrationId` from the newest distinct inbound email, then fall back to
  the workspace default if that source was deleted. Proactive email always uses
  `Organization.defaultEmailIntegrationId`. The resolved integration is snapshotted on the
  outbound message and queue job. The reply `From` uses `Integration.fromEmail` (falling back to
  `externalAccountId`); the OAuth account email is the identity used for `replyTo` and token
  refresh.
- **Missing defaults:** one connected provider repairs a missing default automatically. With both
  providers connected, a missing or invalid default is a configuration error and must be repaired
  from Integrations; never choose an unordered email row.

Gmail native inbound is implemented but remains in controlled rollout.

#### Async outbound-email canary (P4-01)

The async path creates the outbound `Message` first, enqueues it with that message ID as the
stable BullMQ job ID, and claims delivery once in the gateway worker. Roll out Postmark and Gmail
separately while keeping the synchronous path available as the rollback rail.

Preflight:

1. Confirm `npm run db:migrate:deploy` reports no pending migrations. Outbound claim fields come
   from `20260714000000_add_outbound_send_claims`.
2. Confirm the public gateway and separate worker run the same commit and `/health/deep` reports
   database, Redis, worker, and queue checks healthy.
3. Run the read-only baseline; every blocker list must be empty:

```bash
railway run --service shopkeeper --environment production -- \
  npm run audit:outbound-email -- --hours=24 --strict
```

Canary one provider at a time with an internal organization:

1. Enable `OUTBOUND_EMAIL_ASYNC=true` for the dashboard deployment and keep the prior deployment
   available for immediate rollback. Do not remove the synchronous implementation.
2. Send one ordinary reply through the selected provider. Confirm the UI moves
   `pending -> processing -> sent`, the recipient gets exactly one message, and the row records a
   provider message ID.
3. Re-submit the same message ID to the internal enqueue boundary and confirm it is deduplicated;
   do not create a second message row for this check.
4. Require fresh delivered traffic for that provider:

```bash
railway run --service shopkeeper --environment production -- \
  npm run audit:outbound-email -- --hours=1 --strict --require-provider=postmark
```

   Repeat with `--require-provider=gmail` only after the Postmark observation window is clean.
5. Review gateway logs for ownership mismatches, lost claims, provider ambiguity, sweep alerts, or
   permanently failed jobs. Repeat the strict 24-hour audit before expanding rollout.

Rollback by setting `OUTBOUND_EMAIL_ASYNC=false` and redeploying the dashboard. Existing pending,
processing, failed, or unknown rows remain recovery evidence; do not delete or blindly enqueue
them during rollback.

#### Failed or unknown outbound-email recovery

The launch owner/on-call owns review. A `failed` row is retryable only when the recorded failure is
known to have occurred before provider submission. An `unknown` row may already have been accepted
and must never be retried until provider activity proves no delivery.

1. Run `npm run audit:outbound-email -- --hours=24 --strict` and take the message, organization,
   thread, integration, provider, claim/attempt times, status, and error from the report. It omits
   message bodies, customer addresses, and raw provider IDs.
2. Search Gmail or Postmark activity using the stored provider ID when present and the stable RFC
   `Message-ID` `<message-{messageId}@{INBOUND_EMAIL_DOMAIN}>`. Check the recipient mailbox when
   provider activity alone is inconclusive.
3. If the provider proves no submission, leave or move the row to the normal `failed` recovery path
   and let an authorized merchant retry it once. If delivery is proven, record only the missing
   delivery identity/state; do not send again. If truth remains ambiguous, keep the row `unknown`,
   record the incident, and escalate to the production owner.
4. A stale unattempted claim may be converted to `failed` by `outbound-send-sweep`; a stale claim
   with `sendAttemptedAt` is converted to `unknown`. Investigate sweep/worker health before any
   manual state change.

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

### Independent-email canary (Palette)

1. Confirm Palette's existing Gmail row and watch remain active.
2. Connect `support@palettegarments.com` as the forwarded Email integration.
3. Keep Gmail selected as the default for proactive email.
4. Send one inbound message through each path, then alternate both paths from the same customer.
   Confirm one open thread and confirm each reply follows the newest distinct inbound source.
5. Disconnect and reconnect Email; verify the Gmail row, token, watch, and health display do not
   change.
6. Monitor structured `unclaimed_recipient` events, default/source mismatches, provider send
   failures, duplicate suppression, and Gmail watch health before expanding rollout.

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
   - Confirm `GET /health/deep` returns `status: ok` (`checks.worker.status: ok` confirms the worker heartbeat).
   - For detailed queue counts and failed-job metadata, `GET /health/queues` with the `x-internal-secret` header.

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

### Instagram DM (Controlled Rollout)

The complete live Standard Access lifecycle has passed. Keep the integration workspace-gated until
Advanced Access is approved for external merchants and a non-role merchant passes the same loop.
The 2026-07-16 production preflight also confirmed a clean strict ownership/auth-model audit, an
up-to-date migration history, rapid distinct inbound messages with provider timestamps, and an
outbound provider message ID. Reconnect, disconnect suppression, reconnect, and controlled token
refresh also passed.

Before deployment, run the read-only ownership/auth-model audit against production and require a
clean result:

```bash
railway run --service shopkeeper npm run audit:instagram-rollout -- --strict
```

Then:

1. Enable `INSTAGRAM_INTEGRATION_ENABLED` and include the test workspace's Clerk organization ID
   in `INSTAGRAM_BETA_ORG_IDS`.
2. Complete Instagram OAuth through Shopkeeper and confirm `/subscribed_apps` contains `messages`.
3. Verify the Meta webhook handshake succeeds on `GET /webhooks/meta`.
4. Send two real DMs quickly from another Instagram account, including one attachment.
5. Confirm both messages appear exactly once with the provider timestamps and private attachment.
6. Approve a reply, confirm delivery, and confirm the outbound provider message ID was recorded.
7. Reconnect the same account and verify existing thread routing remains intact.
8. Disconnect, confirm later DMs create no tickets, then reconnect for the token-refresh check.

### Telegram Operator Channel

1. Point the Telegram bot webhook at `POST /webhooks/telegram` on the gateway, including the `TELEGRAM_WEBHOOK_SECRET` header.
2. From a bound org member's Telegram chat, send a real inbound message to the bot.
3. Confirm the gateway accepts the webhook and the worker processes the operator turn.
4. Confirm a Telegram plan notification reaches bound org members for a new ticket.
5. Reply `yes` / `no` / freeform and confirm the agent acts (or skips) accordingly.

#### Durable operator-event canary (P4-03)

The queued path persists a provider message before acknowledging it and claims the event once in
the worker. Roll it out one channel at a time; keep iMessage on its synchronous path until the
Telegram window is clean.

Preflight:

1. Confirm `npm run db:migrate:deploy` reports no pending migrations. The required table comes from
   `20260715020000_add_operator_events`.
2. Confirm both Railway gateway services run the same commit and `/health/deep` reports the web and
   worker checks healthy.
3. Run the read-only baseline. Zero events is expected before the flag is enabled, but every blocker
   list must be empty:

```bash
railway run --service shopkeeper --environment production -- \
  npm run audit:operator-events -- --hours=24 --strict
```

4. Set `OPERATOR_DURABLE_QUEUE_TELEGRAM=true` on the public `shopkeeper` service and the separate
   `Gateway Worker` service, then wait for both deployments to become healthy. Leave
   `OPERATOR_DURABLE_QUEUE_IMESSAGE` unset or `false`.

Canary with one bound internal Telegram chat:

1. Send a read-only free-form request such as “what's in my inbox?” and confirm the webhook responds
   promptly, one reply arrives, and the dashboard/operator thread records one exchange.
2. Exercise a deterministic command (`help` or `summary`) and a pending-plan dismissal (`no`). Do
   not use an irreversible Shopify action for the durability canary.
3. Confirm the audit reports one event with one claim attempt and one delivered committed reply per
   Telegram provider message. Gateway logs must contain no permanent job failure, lost-binding
   failure, or sweep alert.
4. After at least one event finishes, require real Telegram traffic in the audit:

```bash
railway run --service shopkeeper --environment production -- \
  npm run audit:operator-events -- --hours=1 --strict --require-channel=telegram
```

5. Keep Telegram enabled through an observation window that includes representative free-form and
   pending-plan traffic. Repeat the 24-hour strict audit before enabling iMessage.

Rollback ingress by setting `OPERATOR_DURABLE_QUEUE_TELEGRAM=false` on both services. Existing
persisted events remain evidence and must not be deleted or blindly re-enqueued; the flag only sends
new Telegram messages back through the synchronous path.

#### Failed or unknown operator-event recovery

The launch owner/on-call owns review. `failed` and `unknown` both mean a turn may have partially
acted; neither state is safe to replay automatically.

1. Run `npm run audit:operator-events -- --hours=24 --strict` and take the event ID, organization,
   channel, claim/process times, error, and correlated action summaries from the report. The audit
   intentionally omits merchant bodies, replies, chat IDs, and provider message IDs.
2. For free-form queued turns deployed with durable turn correlation, inspect `agent_actions` where
   `turn_id = <operator-event-id>`. For a keyword pending-plan decision, also inspect that
   organization's plan-execution rows and actions in the claim-time window.
3. Determine provider truth before taking another action: inspect Shopify transaction/order state,
   the outbound message provider activity, and the dashboard action timeline as applicable. Never
   infer “nothing happened” from a missing operator reply.
4. If the provider proves no side effect, ask the merchant to issue a fresh instruction. If it
   proves a commit, send only the missing confirmation or record a compensating follow-up. If truth
   remains ambiguous, leave the event terminal, record the incident, and escalate to the production
   owner; do not mutate it back to `pending`.
5. A `committed` event with an undelivered reply is normally handled by
   `operator-event-sweep`; it may resend the stored confirmation but never
   reruns the turn. If `last_error` says the reply may have reached the provider,
   the send outcome is ambiguous and the sweep deliberately excludes it from
   automatic resend. Check Telegram/Photon activity and the recipient device;
   never resend without positive no-delivery evidence. Any committed-undelivered
   row remains a strict-audit blocker until it is reconciled.

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
[`imessage-production-readiness-plan.md`](../archive/imessage-production-readiness-plan.md).

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
| `Shopkeeper Gateway Queue Health` | `https://<gateway-production-url>/health/queues` (send `x-internal-secret`) | `"healthy":true` |

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

### Bounded AI context rollout (P2-02)

`AGENT_CONTEXT_BUDGET_MODE=off|shadow|enforce` controls bounded recent-message,
prior-summary, KB, store-profile, sample-reply, order, operator-ledger, and
instruction context. Keep the dashboard, public gateway, and worker aligned.

1. Run the long-thread quality/cost comparison with a real Anthropic test key:

   ```bash
   RUN_JUDGE_EVALS=0 npm run test:integration -w apps/dashboard -- --run src/lib/agent/__evals__/context-budget.eval.test.ts
   ```

   Both legacy and bounded runs must pass, and bounded prompt tokens must be at
   least 20% lower for the long-thread fixture. Then run the full eval suite with
   `AGENT_CONTEXT_BUDGET_MODE=enforce`; its committed baseline gate must remain
   green.
2. Deploy all three hosts with `AGENT_CONTEXT_BUDGET_MODE=shadow`. Review
   `[agent:context] budget` and `[Worker] AI input budget` telemetry by purpose;
   logs contain counts/character totals only, never prompt text.
3. Canary one long thread in `enforce`. Confirm thread intelligence includes the
   prior summary plus newest messages, the newest customer request produces the
   same plan, and `[Worker] AI model usage` shows the expected input-token drop.
4. Keep `enforce` through the normal observation window before removing the
   legacy `off` behavior. Roll back by setting all hosts to `off`; no stored data
   or cached-plan schema changes are involved.

### CSP report-only observation and enforcement (P8-03)

The dashboard policy is intentionally report-only while browser compatibility is
measured. Both `report-uri` and the Reporting API endpoint target
`POST /api/security/csp-report`. The collector accepts no authenticated business
action, caps requests at 16 KiB, and logs only normalized directives, status, and
URL origins under `[CSP] Browser policy violation`; it discards paths, queries,
fragments, code samples, and raw payloads.

1. Deploy the collector without changing the
   `Content-Security-Policy-Report-Only` header to enforcement. Confirm a
   production dashboard response includes `report-uri
   /api/security/csp-report`, `report-to csp-endpoint`, and the matching
   `Reporting-Endpoints` header.
2. Submit one synthetic `application/csp-report` violation with test origins and
   confirm the log drain contains only the sanitized origin/directive fields.
   Confirm malformed and oversized requests do not create log entries.
3. Observe normal authenticated login/signup, dashboard, analytics, Sentry,
   OAuth, Clerk challenge, and supported browser traffic. Group violations by
   effective directive and blocked origin. Add only a narrowly justified source;
   never use captured customer URLs or script samples for diagnosis because the
   collector deliberately does not retain them.
4. After a representative clean window, remove production `unsafe-eval` and
   replace required inline execution with per-request nonces or static hashes in
   a production-like build. Exercise the full authenticated Playwright matrix
   before enabling an enforcement canary.
5. Canary `Content-Security-Policy` on limited production traffic and verify an
   injected script fixture is blocked while supported flows remain clean. Roll
   back by restoring the report-only header; keep the collector enabled so the
   violation evidence remains available.

### BullMQ Failed Jobs

Retry-exhausted BullMQ jobs land in the queue's `failed` set after all configured attempts are used. A failed BullMQ row is evidence to triage, not proof that the underlying business operation failed. Always compare the job with PostgreSQL and provider truth before replaying or removing it.

The launch queues most likely to need inspection are:

- `inbound-messages` for inbound email, Shopify order events, and deferred Instagram DM jobs.
- `ai-summary` for summary, plan precompute, auto-ack, and notification work.
- `outbound-email` for a message whose durable send row owns delivery truth.
- `gmail-sync` for Gmail history synchronization and stale-history recovery.
- `gmail-watch-maintenance` for 12-hour watch renewal and inbound health monitoring.
- `order-review` for the flag-only order risk reviewer.
- `operator-event` for durable Telegram and iMessage operator turns.

Inspect failed jobs from a shell with production `REDIS_URL` loaded. This command intentionally prints only identifiers and failure metadata; do not dump arbitrary `job.data`, which can contain message content.

```bash
cd apps/gateway
QUEUE_NAME='inbound-messages' npx tsx -e "import { Queue } from 'bullmq'; import { createGatewayRedisClient } from './src/clients/redis-client.ts'; const allowed = new Set(['inbound-messages','ai-summary','outbound-email','gmail-sync','gmail-watch-maintenance','order-review','operator-event']); const name = process.env.QUEUE_NAME ?? ''; if (!allowed.has(name)) throw new Error('Unsupported QUEUE_NAME'); const conn = createGatewayRedisClient(); const q = new Queue(name, { connection: conn }); const jobs = await q.getJobs(['failed'], 0, 20, false); const keys = ['organizationId','threadId','messageId','integrationId','orderId','operatorEventId','sourceMessageId','platform','traceId']; for (const job of jobs) { const data = Object.fromEntries(keys.flatMap((key) => job.data?.[key] === undefined ? [] : [[key, job.data[key]]])); console.log(JSON.stringify({ id: job.id, name: job.name, failedReason: job.failedReason, attemptsMade: job.attemptsMade, timestamp: job.timestamp, processedOn: job.processedOn, finishedOn: job.finishedOn, data }, null, 2)); } await q.close(); await conn.quit();"
```

Use the following recovery decision matrix. If the evidence does not fit the stated safe condition, escalate to the owning engineer instead of replaying.

| Queue | Durable/provider truth to inspect | Replay rule |
| --- | --- | --- |
| `inbound-messages` | Provider message/webhook identity, persisted `Message`/order event, and downstream summary job | Replay the original job only after confirming its stable provider identity is present and the ingestion path deduplicates that exact identity. Do not reconstruct a new job with a new ID. |
| `ai-summary` | `sourceMessageId`, latest customer message, cached-plan identity, and any `PlanExecution` | Replay only when `sourceMessageId` is still the latest customer request. A stale job should be left superseded. Auto-execution must be behind the durable execution ledger; legacy jobs without stable source identity are not replayable. |
| `gmail-sync` | Integration history cursor, Gmail message ID, and stable `gmail-inbound-<integration>-<message>` jobs | Replay the original sync after credentials/provider health recover. The checkpoint is monotonic and individual inbound jobs use stable IDs. |
| `gmail-watch-maintenance` | Integration watch expiration/status and current Pub/Sub configuration | Prefer letting the 12-hour repeat job run after the root cause is fixed. Run one manual maintenance invocation only for an expired/near-expiry watch; do not create a second repeat schedule. |
| `order-review` | Organization/order identity and existing `AgentAction` audit rows | Safe to replay one original job after the model/provider issue is fixed. The current reviewer is flag/log-only, but duplicate audit observations and model cost are possible. |
| `outbound-email` | `Message.sendStatus`, `sendAttemptedAt`, `providerMessageId`, stable RFC `Message-ID`, and provider activity | **Never use generic BullMQ replay.** Follow the outbound-email recovery procedure above. Retry only a known pre-provider `failed` row through the authorized application path; `processing`/`unknown` after provider attempt requires provider reconciliation and positive no-send evidence. |
| `operator-event` | `OperatorEvent.status`, claim timestamps, `replyText`, `replyDeliveredAt`, and channel-provider activity | **Never replay a claimed or terminal turn.** A `pending` event can be re-enqueued with its same event ID after infrastructure recovery. Let the sweep reconcile stale claims to `unknown`; it may re-send a committed reply but never re-run the turn. |

Before any permitted replay:

- Check `failedReason`, `attemptsMade`, `traceId`, tenant identifiers, and provider response category in Railway logs.
- Confirm Redis, PostgreSQL, and the relevant provider are healthy and the code/config root cause is fixed.
- Record the database/provider evidence that proves the operation is safe to run again.
- Replay one job first and watch authenticated `/health/queues`, the durable row, and provider activity before a batch.

For a queue whose matrix entry permits BullMQ replay, retry the existing failed job without changing its identity:

```bash
cd apps/gateway
QUEUE_NAME='gmail-sync' JOB_ID='the-failed-job-id' npx tsx -e "import { Queue } from 'bullmq'; import { createGatewayRedisClient } from './src/clients/redis-client.ts'; const replayable = new Set(['inbound-messages','ai-summary','gmail-sync','gmail-watch-maintenance','order-review']); const name = process.env.QUEUE_NAME ?? ''; const id = process.env.JOB_ID ?? ''; if (!replayable.has(name) || !id) throw new Error('QUEUE_NAME is not generically replayable or JOB_ID is missing'); const conn = createGatewayRedisClient(); const q = new Queue(name, { connection: conn }); const job = await q.getJob(id); if (!job) throw new Error('Job not found'); if (await job.getState() !== 'failed') throw new Error('Job is not failed'); await job.retry('failed'); console.log('Retried job', job.id, 'on', name); await q.close(); await conn.quit();"
```

Removing a stale failed BullMQ record is housekeeping, not recovery. Capture its sanitized evidence first, verify the durable operation is terminal or superseded, then remove only that exact job through the authenticated internal queue endpoint. The endpoint re-checks that the job is still `failed` and refuses to remove waiting, active, delayed, or completed work. Never delete the related PostgreSQL ledger/message/event row.

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
