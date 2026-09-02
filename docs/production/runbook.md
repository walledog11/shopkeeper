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
npx prisma generate --schema=packages/db/prisma/schema.prisma && npm run build -w packages/db && npm run build -w packages/agent && npm run build -w packages/integrations && npx turbo run build --filter=shopkeeper-dashboard
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
npm run build -w packages/email
npm run build -w packages/agent
npm run build -w packages/analytics
npm run build -w packages/integrations
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
  `process-email` jobs used by Postmark forwarding. Maintenance runs every 12
  hours, enqueues one stable history catch-up per active integration, and
  renews healthy watches daily. An expired history checkpoint triggers a
  paginated seven-day inbox recovery capped at 2,000 messages; a larger result
  stays degraded and alerts instead of silently advancing. Postmark accepts only
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

For a Gmail integration, the guarded self-addressed provider canary can establish
queue/provider evidence before changing the broad dashboard flag. It sends one
clearly labeled message only to the connected account's own plus-address, closes
the staged ticket, and prints no address, token, body, or raw provider ID:

```bash
railway run --service shopkeeper --environment production -- \
  env GATEWAY_URL='https://<gateway>' \
  npm run canary:outbound-gmail -w apps/gateway -- \
    --integration-id='<gmail-integration-uuid>' \
    --acknowledge-self-email \
    --execute
```

Require `sendStatus=sent`, `hasProviderMessageId=true`, and
`deduplicated=true`, then run the strict required-Gmail audit. This does not
replace recipient mailbox confirmation, the independent inbound/threading
canary, or recovery-path exercises.

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

After deploying Gmail reliability changes, allow one complete 12-hour
maintenance interval and verify:

1. `gmail-watch-maintenance` completed successfully.
2. One `source=maintenance` job per active Gmail integration completed on
   `gmail-sync`; its job ID uses
   `gmail-sync-maintenance-<integration>-<12-hour-bucket>`.
3. `lastSyncedAt` advanced even if the mailbox was idle.
4. A watch whose `watchLastRenewedAt` is at least 24 hours old renewed without
   replacing its stored history checkpoint.
5. No integration has `lastError=sync_recovery_truncated`. If one does, do not
   force it active or replace its checkpoint; investigate the mailbox window
   and inspect an operator-controlled broader/full recovery:

   ```bash
   npm run recover:gmail-history -- \
     --integration-id='<integration-uuid>' \
     --max-messages=10000 \
     --query='newer_than:30d in:inbox'
   ```

   After reviewing the sanitized preflight, reuse the incident identifier so
   repeat invocations deduplicate:

   ```bash
   npm run recover:gmail-history -- \
     --integration-id='<integration-uuid>' \
     --max-messages=10000 \
     --query='newer_than:30d in:inbox' \
     --recovery-id='<incident-id>' \
     --execute
   ```

   The worker accepts operator recovery only while the integration is degraded
   specifically for `sync_recovery_truncated`; it caps the override at 50,000
   messages and keeps the same checkpoint/idempotency rules.

The 2026-07-29 production release and its observation checklist closed on 2026-08-07
and the record was retired on 2026-08-27; read it at
`git show cb61ac44:docs/production/gmail-rollout-evidence-2026-07-29.md`. The alias
work it left open is in [`to-do-list.md`](../to-do-list.md).
The owner-ready restricted-scope package is
[`google-gmail-verification-packet.md`](google-gmail-verification-packet.md).

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

Prisma routes migrations through `DIRECT_DATABASE_URL` (`directUrl` in the schema). CI and local migration runs need both URLs set. Every migration in this repo is hand-written — see [Writing a migration](#writing-a-migration) before authoring one.

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

## Writing a migration

Standing rules for **every** migration in this repo, not one-time tasks.

Production carries **six partial unique indexes that `schema.prisma` cannot
declare**, created by raw SQL across six migrations:
`threads_one_open_per_customer`, `messages_org_external_id_unique`,
`integrations_instagram_organization_unique`,
`integrations_instagram_account_unique`, `integrations_shopify_account_unique`,
`integrations_non_email_account_unique`.

Prisma has no `where` clause on `@@unique` or `@@index` (verified against the
pinned 6.19.3), so `prisma migrate dev` builds its shadow database from the
migration history, diffs it against `schema.prisma`, and emits a `DROP INDEX` for
each one inside whatever migration you are authoring — silently removing inbound
dedupe, the open-thread race protection, and every cross-tenant integration
constraint at once. Hand-writing is not the fallback; it is the only path.

- Hand-write the migration directory and its `migration.sql`, then apply with
  `prisma migrate deploy`. Never run `prisma migrate dev` against this schema.
- If you draft SQL with `prisma migrate diff`, delete every `DROP INDEX` from its
  output before saving.
- Verify the saved `migration.sql` contains no `DROP INDEX` before applying it.
- After it lands, confirm all six survived — this must return 6:

  ```sql
  SELECT count(*) FROM pg_indexes WHERE indexname IN (
    'threads_one_open_per_customer', 'messages_org_external_id_unique',
    'integrations_instagram_organization_unique', 'integrations_instagram_account_unique',
    'integrations_shopify_account_unique', 'integrations_non_email_account_unique');
  ```

**Run prisma from the repo root, never from inside `packages/db`.** That
directory's `.env` points at the production Neon instance and *overrides* an
inline `DATABASE_URL`, so `cd packages/db && DATABASE_URL=…local… npx prisma
migrate deploy` silently targets production. It has done so once, landing a
migration in production before its code. Additive and inert that time, so nothing
broke, but read the `Datasource "db": … neon.tech` line before trusting where a
migration went. The local test DB is `127.0.0.1:55432/clerk_test` and needs both
`DATABASE_URL` and `DIRECT_DATABASE_URL` passed inline.

**A migration that ships behind its code is an outage, not a lag.** Read
production `migrate status` before closing anything that adds a table or column.

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

#### Durable operator events (P4-03) — complete

Durable ingestion is the only path for Telegram and iMessage operator messages
(completed 2026-07-20). Each inbound message is persisted and enqueued before
the webhook acknowledges it; the operator-event worker claims the event once and
runs the turn.

**Routine monitoring:**

```bash
railway run --service shopkeeper --environment production -- \
  npm run audit:operator-events -- --hours=24 --strict
```

Expect committed events with delivered replies and no failed, unknown, stale,
undelivered, or repeated-claim records. Per-channel checks:

```bash
npm run audit:operator-events -- --hours=24 --strict --require-channel=telegram
npm run audit:operator-events -- --hours=24 --strict --require-channel=imessage
```

There is no synchronous webhook fallback to roll back to. If durable ingestion
must be disabled, redeploy a prior gateway build that still carried the
fallback — do not delete or blindly re-enqueue existing `OperatorEvent` rows.

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

Full merchant flows (bind, plan push, approve) were signed off 2026-07-08; the
Phase 1 detail is in git history (`docs/archive/imessage-production-readiness-plan.md`,
deleted 2026-07-30).

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

The purge module was retired 2026-07-30, but the `imessage` enum value outlived it
and is still a tracked retirement candidate — see
[compatibility-retirement-backlog.md](../compatibility-retirement-backlog.md).
Pre-GA customer-support rows on `channel_type = imessage` were migration tooling
only; operator iMessage uses `sms_agent` plus `org_member_imessage_bindings` and is
unaffected. Verify with:

```bash
npm run audit:legacy-imessage-threads
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

The guardrail code is implemented, but the production checklist item is not complete until ops-alert log routing is validated against live or staging traffic. This section is the production operating procedure; the sign-off evidence is in [`alerting-evidence.md`](alerting-evidence.md). The V1 implementation plan that built these — thresholds, call sites, phase gates — had every code phase ticked and only its Phase 5 production rollout open, which is what `alerting-evidence.md` tracks. It was deleted on 2026-09-01; read it at `git show c06be3b4:docs/production/operational-guardrails.md`.

### Plan-execution ledger staged enforcement (P1-02)

`PLAN_EXECUTION_LEDGER_MODE=off|shadow|enforce` controls whether reviewed plans
only record observations or atomically claim and complete their durable
execution row. Roll out by host: dashboard first, then the public gateway and
worker together after the dashboard observation window. PostgreSQL is the
single-use boundary; Redis remains only a latency guard.

**Current stage (2026-07-30):** dashboard, Railway public gateway, and Railway
worker are all in `enforce`. Gateway canary execution
`345be6f6-555e-4cde-9e1e-961fca91cb22` committed on 2026-07-30 with enforce-state
invariants. Hold a normal 24-hour observation window with representative
gateway/operator traffic; strict audits must stay clean.

**Previous stage (2026-07-29):** the Vercel dashboard was in `enforce`; Railway
public gateway and worker remained in `shadow`. Dashboard canary execution
`6fdec37f-e92a-4115-b909-c8a226464fe4` committed with one linked successful
internal action, zero shadow observations, and populated claim/completion
timestamps. Representative reviewed execution
`9bbe5f42-4da9-4f89-ad13-e10a7b167d49` subsequently committed one successful
`send_reply` with the same enforce-state invariants and no error.

Before and after every flag change:

1. Verify the target host's non-secret flag directly. Do not infer it from
   health alone, and do not let a local `.env.local` override the downloaded
   Vercel production value.
2. Run `npm run verify:production`.
3. Run:

   ```bash
   railway run --service shopkeeper --environment production -- \
     npm run audit:plan-executions -- --hours=240 --strict
   railway run --service shopkeeper --environment production -- \
     npm run audit:unknown-outcomes -- --hours=240 --strict
   ```

4. Require no repeated shadow observations, unknown outcomes, or stale claims.
   In `enforce`, a successful canary must be terminal `committed`, have
   `observationCount=0`, populated `claimedAt`/`completedAt`, no `lastError`,
   and linked successful actions.

Keep dashboard-only enforcement for at least one normal 24-hour observation
window containing representative reviewed dashboard traffic before promoting
gateway/worker. Gateway and worker were promoted to `enforce` on 2026-07-30;
repeat the canary/audit sequence and hold a broad observation window after any
future flag change.

Dashboard rollback is configuration-only: restore the Vercel Production
variable to explicit non-sensitive `shadow`, redeploy the same known-good
artifact, verify the cloud value, and rerun both audits. Do not change the
Railway flags during a dashboard-stage rollback. If an enforced execution is
`unknown`, determine provider truth before any fresh instruction; never reset
the row to `pending` or replay it.

### External Monitors

**Configured 2026-07-31** on the Better Stack free tier. Keep this manual in the
Better Stack console; do not add Better Stack API tokens or credentials to the
repo.

**Two monitors, not three.** Corrected 2026-07-31 — this previously specified a
third monitor against `/health/queues`, which is wrong on two counts:

- That route requires the internal secret (`health.ts:214`, `authorizeInternalRequest`)
  and deliberately exposes queue counts and failed-job **tenant identifiers**
  (AUD-017). It must not be polled by a third-party vendor.
- It is redundant. `/health/deep` already rolls up the worker heartbeat *and*
  queue diagnostics and returns `503` if either is unhealthy, so a stale worker
  already fails the gateway monitor.

`/health/queues` is the manual drill-down *after* an alert fires:

```bash
curl -H "x-internal-secret: $INTERNAL_API_SECRET" \
  https://<gateway-production-url>/health/queues
```

| Monitor | URL | Required keyword |
| --- | --- | --- |
| `Shopkeeper Dashboard Health` | `https://<dashboard-production-url>/api/health` | `{"status":"ok"` |
| `Shopkeeper Gateway Deep Health` | `https://<gateway-production-url>/health/deep` | `{"status":"ok"` |

**The keyword must include the leading brace.** A bare `"status":"ok"` matches a
*degraded* response too, because the nested checks still contain it:

```json
{"status":"degraded","checks":{"db":{"status":"error"},"redis":{"status":"ok"}, ...}}
```

That monitor would sit green while the database is down. `{"status":"ok"` only
matches at the document root. Both endpoints return compact JSON with no
whitespace — verified live 2026-07-31.

Settings for both monitors:

- Monitor type: `keyword`
- HTTP method: `GET`
- Check frequency: `3` minutes (free-tier floor; sub-3-minute is paid)
- Request timeout: `15` seconds
- Verify SSL: enabled
- Follow redirects: enabled
- Region: `us`
- Notify: email to the launch owner, on failure **and** recovery

Escalation policies and phone/SMS paging are paid features and are deliberately
not used pre-merchant. Do not validate alert routing by intentionally taking
production down; use Better Stack's built-in test notification.

Expected failure behavior:

- Dashboard DB, Redis, or env failure makes `/api/health` return `503` with
  `{"status":"degraded"`, failing the keyword and the status code.
- Gateway DB, Redis, worker heartbeat, or queue-diagnostics failure makes
  `/health/deep` return `503` the same way.

These monitors cover "the process is dead." They structurally cannot see "the
process is alive and something is wrong inside it" — that is what ops-alert
routing below is for.

### Neon PITR

Confirmed 2026-07-31. Record the exact retention window Neon reports, never an
assumed plan default.

| Field | Value |
| --- | --- |
| Project | `misty-bird-75162134` (`shopkeeper`), `aws-us-west-2`, PG 17 |
| Production branch | `production` (`br-aged-union-akjqrbbs`) — the only branch |
| Endpoint | `ep-red-waterfall-akf6xfkq` (`c-3.us-west-2`), the only endpoint |
| PITR status | Enabled |
| Retention window | **7 days** (`history_retention_seconds: 604800`) |
| Confirmed at | 2026-07-31 |

Raised from **6 hours** to 7 days on 2026-07-31. Six hours does not survive a
Friday-evening fault noticed on Saturday, which is the realistic failure mode for
a solo operator. The increase is effectively free — see the cost note below.

**Restore tested 2026-08-01.** Branch `pitr-test` (`br-purple-poetry-ak42k8g4`)
created from LSN `0/2168BC20` at `2026-07-31T23:07:29Z`, verified, deleted. All
seven checked tables matched production exactly, and the Shopify access token
**decrypted correctly on the restored branch** — the risk worth testing, since
`TOKEN_ENCRYPTION_KEY` lives outside the database and a restore returning
undecryptable rows is a restore in name only.

Repeat this after any change to `TOKEN_ENCRYPTION_KEY` or the retention window.

```bash
# 1. Branch from a point in time. --parent takes a name OR a timestamp as a
#    single value; `name@timestamp` is NOT valid syntax for create.
#    --expires-at is a safety net so a forgotten branch cannot bill compute.
neonctl branches create --project-id misty-bird-75162134 --name pitr-test \
  --parent '<ISO8601 timestamp>' --expires-at '<ISO8601 +2h>'

# 2. Connection string (do not echo it — it carries credentials)
neonctl connection-string pitr-test --project-id misty-bird-75162134

# 3. Verify with DATABASE_URL/DIRECT_DATABASE_URL overridden to that string.
#    Compare row counts against production AND confirm an Integration
#    accessToken still decrypts (the client carries the encryption extension).

# 4. Always delete — a forgotten branch keeps its own compute, and compute is
#    the entire Neon bill.
neonctl branches delete pitr-test --project-id misty-bird-75162134
```

**Do not confuse `branches create --parent <timestamp>` (non-destructive, makes a
new branch — this is the test) with `branches restore` (destructive, rewinds the
target branch).** Never use the latter for a test.

#### What PITR does not cover

Branch restore is a **whole-branch** operation — you cannot restore one table or
one organization. To repair a single merchant's data, restore to a *separate*
branch and copy rows out; do not roll production back and lose everyone else's
day.

It restores Postgres only. It does not restore Vercel Blob (attachments), Redis
(in-flight BullMQ jobs are simply lost), or the external systems of record.
Rolling the database back does not un-charge a Stripe invoice, un-issue a Shopify
refund, or un-send an email — after a restore the database disagrees with Clerk,
Stripe and Shopify about what happened. PITR is a last resort; `AgentAction` is
the audit trail you would actually reconstruct from.

#### Cost shape (measured 2026-07-31)

The Neon bill is **entirely compute**, which is why retention is cheap to extend:

| Metric | Value |
| --- | --- |
| `active_time` | 742.0 h — **99.7% of a 744-hour month** |
| `cpu_used_sec` | 330.1 CU-hours, averaging 0.445 CU while active |
| Storage | 36 MB |

The compute never suspends. Autosuspend requires zero client connections, and the
gateway is an always-on Railway process holding a Prisma pool through pgbouncer —
`pg_stat_activity` shows persistent idle pooler connections. `suspend_timeout_seconds: 0`
is Neon's 5-minute default and never gets the chance to fire. This is
architectural, not a misconfiguration: Neon's scale-to-zero pricing assumes bursty
serverless access, and a 24/7 worker is the opposite. Even perfect idle-timeout
tuning would be undone by the 15-minute maintenance sweeps, and each cold start
would add latency to a merchant-facing agent.

Consequences for anyone touching this:

- **Raising history retention does not raise the bill** at this data volume. Do
  not trade recoverability for a saving that is not there.
- **`autoscaling_limit_max_cu` is capped at 2** (endpoint and project default),
  lowered from 8 on 2026-07-31. This is a blast-radius cap, not a saving — it
  bounds the damage when a query that was fine against 36 MB stops being fine
  once a merchant's data lands. Sustained throttling at 2 CU is a signal to fix
  the query, not to raise the ceiling.
- If the bill ever grows materially, the lever is the always-on access pattern —
  a fixed small Postgres instance suits it better than serverless pricing. That
  is a migration with real risk; do not attempt it ahead of a merchant.

### Ops Alert Log Routing

Ops alerts emit structured Pino logs with `opsAlert: true` and stable `category`, `service`, `tags`, `extra`, and `fingerprint` fields. Forward both services' logs into Better Stack **Telemetry** — a Vercel log drain for the dashboard (needs Vercel Pro/Enterprise) and a **forwarder service** for the gateway, since **Railway has no native log drain** — then alert on `opsAlert` and `category`.

#### Gateway → Telegram push (live since 2026-07-31)

The log-drain path above is still deferred behind its paywalls. In the meantime
the **gateway** pushes every alert it raises straight to an operator Telegram
chat, which is the half external uptime monitors cannot see. Verified end to end
in production on 2026-07-31 via `emit-controlled-ops-alert.ts queue_health`.

- Set by `OPS_ALERT_TELEGRAM_CHAT_ID` on the Railway gateway service. **Unset
  leaves alerts log-only** — the feature is inert until configured.
- Use an operator chat you own, never a merchant binding. Alerts carry no
  customer data, but they are internal diagnostics, not merchant-facing copy.
- Covers the gateway's 13 call sites. The dashboard holds no
  `TELEGRAM_BOT_TOKEN`, so its three (`agent_failure`, `provider_send`,
  `provider_cleanup`) take the Sentry path below instead.

Two design constraints in `apps/gateway/src/ops-alert-notify.ts` that must
survive any edit:

- It does **not** reuse `clients/telegram-client.sendMessage`. That path reports
  its own failures through `recordProviderSendFailure`, which emits a
  `provider_send` ops alert — routing through it would make a Telegram outage
  generate alerts about Telegram, sent over Telegram. The dedicated sender
  records nothing and never throws.
- The payload carries level, message, and a whitelist of tags (`category`,
  `service`, `queue`, `provider`, `channel`, `tool`). **`extra` is excluded and
  `orgId`/`threadId` are dropped** for the same reason `/health/queues` is behind
  auth (AUD-017): the alert push must not become the leak that route is not.

Dispatch is fire-and-forget after the log write, so it can never delay or fail
the caller that raised the alert, and a suppressed alert
(`OPS_ALERTS_ENABLED=false`) never pushes.

#### Dashboard → Sentry capture (shipped 2026-08-01, production round-trip unverified)

The dashboard's three sources capture to Sentry instead
(`apps/dashboard/src/lib/server/ops-alert-notify.ts`), on the same
fire-and-forget rule and off the same `emitOpsAlert` seam, so a source added
later is covered without new wiring.

- No configuration: the DSN in `sentry.server.config.ts` is the one already
  carrying dashboard exceptions. `OPS_ALERTS_ENABLED=false` suppresses the
  capture with the log.
- `captureMessage`, not `captureException` — `buildOpsAlertScope` computes the
  grouping fingerprint, and an exception would regroup by stack trace instead.
- `extra` **is** kept here, unlike the Telegram push: Sentry is a private
  surface and the identifiers are what make an alert actionable.
- Unverified in production, and **`emit-controlled-ops-alert.ts` cannot verify
  it**: that script is a standalone `tsx` process, where `instrumentation.ts`
  never runs and `Sentry.captureMessage` is a no-op against an uninitialized
  client. It proves the log line, not the capture. Use the deployed
  `agent_failure` trigger in
  [alerting-evidence.md](alerting-evidence.md) — an authenticated `POST
  /api/agent` with no approved plan — which raises the alert inside the Next
  runtime where Sentry is initialized.

Better Stack log alerting is **query/threshold-based on a saved Telemetry chart**,
not raw-text keyword matching: filter the structured fields into a chart, save it,
and attach a threshold rule. This is why the `category` / `service` / `fingerprint`
field values are a stable contract — rewording an alert message is safe, renaming
a field silently breaks paging. Sign-off evidence:
[alerting-evidence.md](alerting-evidence.md). Paywalled Level 1 items are
deferred in [to-do-list.md](../to-do-list.md).

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

### Triage By Alert Category

When `queue_health` fires:

- Check `/health/queues` (send the `x-internal-secret` header) for worker heartbeat and queue counts. Coarse liveness (db/redis/worker/queue `status`) is on the public `/health/deep`.
- If active jobs are stuck, inspect the job payload and trace id in Railway logs.
- Restart the gateway worker only after confirming Redis and DB are healthy.

When `webhook_signature` fires:

- Confirm provider webhook URLs point directly at the gateway production routes.
- Confirm provider secrets match production env vars.
- Check whether failures are concentrated on one provider or one org.

When `provider_send` fires:

- Confirm provider credentials and account status.
- Check rate limits, sandbox/live account state, and provider incident pages.
- Confirm the app did not persist a successful outbound message for failed sends.

When `agent_failure` fires:

- Group failures by tool name and org.
- Inspect the associated audit note and structured logs.
- Disable affected tool categories in org settings if the issue involves write actions and customer risk.

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
5. In an isolated test integration, constrain the stale-recovery bound and
   confirm incomplete pagination emits the same category with fingerprint
   `recovery_truncated`, leaves `inboundStatus=degraded`, and does not establish
   a new checkpoint.

After each category, record the log entry timestamp, alert recipient, tags/extras checked, and any side-effect notes in [`alerting-evidence.md`](alerting-evidence.md).

### Bounded AI context (P2-02, retired)

Bounded recent-message, prior-summary, KB, store-profile, sample-reply, order,
operator-ledger, and instruction context is unconditional. `AGENT_CONTEXT_BUDGET_MODE`
and its legacy unbounded branch were removed once production had moved onto the
bounded path; the flag, the `canary:context-budget` script, and the mode-comparison
eval no longer exist. Rollback is a revert of that change, not an environment edit.

The 2026-08-12 context correction still stands: token bounding is not a
conversation boundary. Bounded context combines a whole-thread prior summary with
recent messages and must not be presented as the fix for stale context. Episode
boundaries are code-owned defaults with no flag behind them —
`CHANNEL_EPISODE_POLICY` in
`apps/gateway/src/message-handlers/resolve-inbound-episode.ts`, which carries the
per-channel rule and the reason each absent channel never rolls.

Budget telemetry remains: `[agent:context] budget` and `[Worker] AI input budget`
carry counts and character totals only, never prompt text.

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
   `Reporting-Endpoints` header. Since 2026-07-30 the policy is built
   **per request** by Clerk's middleware CSP option in
   `apps/dashboard/src/proxy.ts` (it carries a fresh nonce), not by a static
   `next.config.js` header — so check a real response, and expect the nonce and
   `Reporting-Endpoints` to differ between requests.
2. Submit one synthetic `application/csp-report` violation with test origins and
   confirm the log drain contains only the sanitized origin/directive fields.
   Confirm malformed and oversized requests do not create log entries.
3. Observe normal authenticated login/signup, dashboard, analytics, Sentry,
   OAuth, Clerk challenge, and supported browser traffic. Group violations by
   effective directive and blocked origin. Add only a narrowly justified source;
   never use captured customer URLs or script samples for diagnosis because the
   collector deliberately does not retain them.
4. ~~Remove production `unsafe-eval` and replace required inline execution with
   per-request nonces.~~ **Done 2026-07-30**, ahead of the observation window.
   `unsafe-eval` is dev-only, `http:`/`https:` are gone from `script-src`, and
   every script carries a per-request nonce under `'strict-dynamic'`. The
   surviving `'unsafe-inline'` is Clerk's intentional CSP2 fallback, which
   `'strict-dynamic'` makes CSP3 browsers ignore — do not remove it. Still
   exercise the full authenticated Playwright matrix in a production-like build
   before enabling an enforcement canary.
5. **Gate — resolve before any enforcement canary.** Clerk's own
   `clerk.browser.js` `<script>` tag is server-rendered **without** a nonce, so
   `'strict-dynamic'` blocks it the moment the header is enforced, breaking
   authentication for every user. Already ruled out: the nonce is minted and
   forwarded (`x-nonce` on request and response);
   `buildClerkJSScriptAttributes` applies a nonce when given one (`@clerk/shared`,
   `loadClerkJsScript`); and a server-component `providers.tsx` with
   `dynamic` on `ClerkProvider` does not fix it. Expect this to appear in the
   report-only telemetry as a `script-src` violation against the Clerk frontend
   API origin — that is the policy working, not a collector fault.
6. Canary `Content-Security-Policy` on limited production traffic and verify an
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
- `gmail-watch-maintenance` for 12-hour catch-up admission, daily watch renewal,
  and inbound health monitoring.
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
| `gmail-watch-maintenance` | Integration watch expiration/status, scheduled catch-up admission, and current Pub/Sub configuration | Prefer letting the 12-hour repeat job run after the root cause is fixed. Run one manual maintenance invocation only for an expired/near-expiry watch or an overdue catch-up; do not create a second repeat schedule. |
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
- Better Stack checks are passing for dashboard health and gateway deep health
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
- Neon PITR: recorded 2026-07-31 — branch `production`, enabled, 7 days; restore tested 2026-08-01, counts matched and tokens decrypted (see "Neon PITR")
