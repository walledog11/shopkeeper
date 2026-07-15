# Instagram Integration Implementation Plan

**Goal:** ship Instagram DM as a reliable customer-support channel using the
**Instagram API with Instagram Login** (Business Login for Instagram). Merchants connect an
Instagram Professional account directly; Shopkeeper receives customer DMs, creates tickets, and
sends replies through the same connected account.

**Decision:** replace the existing Facebook Login/Page-token implementation completely. Do not
ship a hybrid in which OAuth, tokens, account identifiers, webhooks, profiles, and sends come from
different Meta integration models.

Updated 2026-07-14 after a repository audit and review of Meta's current Instagram API materials.

---

## 1. Current Repository State

The repository contains most of an end-to-end Instagram pipeline, but it is built around the
older Messenger API for Instagram path:

- `apps/dashboard/src/app/api/integrations/instagram/auth/route.ts` starts Facebook Login for
  Business with `META_CONFIG_ID`.
- `apps/dashboard/src/app/api/integrations/instagram/callback/route.ts` exchanges a Facebook user
  token, calls `/me/accounts`, chooses a Facebook Page linked to an Instagram account, stores the
  Page token, and subscribes the Page to messaging webhooks.
- `apps/gateway/src/routes/webhooks-meta.ts` verifies Meta webhook signatures and queues an
  Instagram job.
- `apps/gateway/src/message-handlers/channels.ts` creates customers, threads, and messages from
  Instagram webhook payloads.
- `apps/dashboard/src/lib/messaging/instagram-dispatch.ts` sends replies with the Page token.
- `apps/gateway/src/maintenance/token-health.ts` checks the Page-token connection and attempts to
  refresh the associated Facebook user token.
- `apps/dashboard/src/app/api/integrations/instagram/connect/route.ts` is a development-only
  backdoor that creates an integration from manually supplied Page-token environment variables.

### What likely prevented the old path from working

The repository cannot prove the exact historical failure because the Meta App Dashboard
configuration and provider logs are external. The most probable blockers are the old path's
operational requirements:

- The Instagram account had to be linked to a Facebook Page.
- The connecting user needed the correct Page role/tasks and the Page had to appear in
  `/me/accounts`.
- The Facebook Login for Business configuration had to include every required permission.
- The app needed the appropriate access level, Business Verification, and App Review approval for
  accounts outside the app's roles.
- A failed per-Page webhook subscription was only logged; the callback still reported the
  integration as connected.

### Correction to the previous diagnosis

`graph.facebook.com/{instagram-account-id}/messages` with a Page token is a valid shape for the
legacy Messenger API for Instagram model. It is not, by itself, evidence that outbound replies
were broken. The endpoint and token must change as part of the migration, but the reason to migrate
is simpler merchant onboarding and one coherent, supportable API model—not a claim that the legacy
send node always had to be the Facebook Page ID.

### Confirmed code defects independent of the Meta product choice

1. Long-lived token exchange fails open: the callback falls back to the short-lived token and then
   records a made-up 60-day expiration.
2. Webhook subscription fails open: a failed subscription still produces a successful connection.
3. Only `entry[0]` and `messaging[0]` are processed, so batched messages are silently lost.
4. Organization lookup uses `findFirst` by provider account ID while the database permits
   ambiguous Instagram rows across or within workspaces.
5. Outbound dispatch also uses `findFirst`, so more than one Instagram row in a workspace can send
   a reply through the wrong account.
6. The worker passes an entire webhook payload under the organization resolved from its first
   entry. Merely adding loops in the worker could create a cross-tenant routing bug when a delivery
   contains entries for different Instagram accounts.
7. The provider's message timestamp is ignored. The 24-hour reply window is therefore calculated
   from ingestion time rather than the customer's actual send time.
8. Raw provider attachment and profile-picture URLs are stored even though Meta-hosted URLs can be
   temporary.
9. Disconnect deletes only the local row; it does not remove the account's webhook subscription.
10. Token health resets `tokenExpiresAt` without receiving that expiry from Meta and does not
    replace the stored Page token when it refreshes the Facebook user token.

---

## 2. Target API Contract

Use the following contract consistently. Re-check Meta's changelog immediately before starting
implementation and before production rollout.

| Concern | Target |
| --- | --- |
| Login model | Instagram API with Instagram Login / Business Login for Instagram |
| Supported merchant account | Instagram Professional account (Business or Creator) |
| OAuth authorize URL | `https://www.instagram.com/oauth/authorize` |
| OAuth code exchange | `POST https://api.instagram.com/oauth/access_token` |
| Graph host | `https://graph.instagram.com` |
| Graph version | `v25.0` as of 2026-07-14, centralized in one constant |
| Permissions | `instagram_business_basic`, `instagram_business_manage_messages` |
| Stored provider account ID | Instagram Professional account `user_id` |
| Stored token | Long-lived Instagram user access token |
| Customer identifier | Instagram-scoped ID (IGSID) from `messaging[].sender.id` |
| Webhook object | `instagram` |
| Required webhook field | `messages` |
| Outbound endpoint | `POST /{instagram-user-id}/messages` |
| Standard reply window | 24 hours after the customer's provider message timestamp |
| Development access | Standard Access for owned/managed accounts added in App Dashboard |
| Merchant access | Advanced Access after App Review |

The `HUMAN_AGENT` tag and its separate permission/review path are out of scope for this migration.
V1 will use the standard 24-hour reply window only.

---

## 3. V1 Account and Tenant Model

V1 supports exactly **one active Instagram account per Shopkeeper workspace**. An Instagram
account may belong to only one Shopkeeper workspace at a time.

This is required because:

- Webhooks are routed from `entry.id`, which must resolve to exactly one integration.
- Replies must use the same account that received the customer's DM.
- The current integrations UI represents Instagram as a single connection.
- Supporting multiple accounts properly requires per-thread account selection and additional UI.

Add database enforcement with raw partial unique indexes:

1. One Instagram integration per organization: unique on `organization_id` where
   `platform = 'ig_dm'`.
2. One organization per Instagram account: unique on `external_account_id` where
   `platform = 'ig_dm'`.

Before adding the indexes, audit existing `ig_dm` rows for duplicates. Legacy Page-token rows are
not compatible with the new client and should be deleted during rollout after their identifiers
are logged for operational reference. Existing tickets remain; legacy tickets must not fall back
to a newly connected Instagram account for replies.

For new inbound messages:

- Set `Message.integrationId` to the receiving Instagram integration.
- Set `Thread.replyIntegrationId` to that integration.
- Outbound Instagram dispatch must require the thread's `replyIntegrationId`; it must never pick
  an arbitrary Instagram row with `findFirst`.

If the generic integration relations are not merged before this work starts, add equivalent
Instagram-specific routing fields in the same migration.

---

## 4. Phase 1 — Meta App Dashboard Setup

**Status: Complete (2026-07-14).**

Complete this first because code cannot substitute for missing product access.

1. Add the **Instagram API with Instagram Login** use case/product to the Meta app.
2. Record the Instagram-specific App ID and App Secret shown in the Instagram API setup. Do not
   use the parent Meta/Facebook App ID and secret for Instagram OAuth.
3. Register the exact production callback URL:
   `https://<dashboard>/api/integrations/instagram/callback`.
4. Configure the Instagram webhook callback directly to the production gateway:
   `https://<gateway>/webhooks/meta`.
5. Choose a long random webhook verify token and subscribe the app to the Instagram `messages`
   field.
6. Request only:
   - `instagram_business_basic`
   - `instagram_business_manage_messages`
7. Add an owned Instagram Professional account to the app for Standard Access testing.
8. Start Business Verification and prepare the App Review submission in parallel with code work.

### Environment variables

Dashboard:

- `INSTAGRAM_APP_ID`
- `INSTAGRAM_APP_SECRET`
- `APP_URL`

Gateway:

- `INSTAGRAM_WEBHOOK_APP_SECRET` for `X-Hub-Signature-256` verification. Use the parent Meta app
  secret that owns the Instagram webhook subscription, not the Instagram Login OAuth secret.
- `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` for the GET verification handshake

The dashboard also needs `INSTAGRAM_WEBHOOK_APP_SECRET` when the local-development webhook proxy
verifies signatures. The gateway does not need the Instagram App ID or OAuth secret for token
refresh. `INSTAGRAM_APP_SECRET` remains a temporary compatibility fallback in the webhook verifier
while deployments migrate to the dedicated signing-secret variable.

Retire Instagram usage of:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_CONFIG_ID`
- `META_PAGE_ACCESS_TOKEN`
- `META_INSTAGRAM_ACCOUNT_ID`

Update `.env.example`, test environment defaults, CI workflow environment, `turbo.json`, README,
and the production runbook in the same change set.

---

## 5. Phase 2 — Instagram API Clients and Configuration

**Status: Complete (2026-07-14).**

Replace the Page/Facebook helpers with coherent Instagram Login clients. Keep browser OAuth code in
the dashboard and runtime/webhook code in the gateway, but use the same API version and response
contracts.

### Dashboard client responsibilities

- Build the Instagram authorization URL.
- Exchange the authorization code for a short-lived Instagram token.
- Exchange the short-lived token for a long-lived Instagram token.
- Fetch/confirm the connected account's `user_id`, username, and account type when available.
- Subscribe and unsubscribe the account's webhook fields.
- Read back `/subscribed_apps` to verify that `messages` is active.

### Gateway client responsibilities

- Fetch the connected account for token-health checks.
- Refresh a long-lived Instagram token.
- Fetch a messaging user's profile by IGSID.
- Parse provider errors consistently.

### Dashboard dispatch client responsibilities

- Send text messages through the Instagram Send API.
- Return the provider message ID on success.
- Return structured error data including HTTP status, Meta error code/subcode, message, and request
  ID when present.

### Client requirements

- Centralize `v25.0` in one exported constant per runtime, with a unit test asserting all paths use
  the same version.
- Use `Authorization: Bearer` for Graph calls where supported rather than placing tokens in logged
  URLs.
- Use form encoding for the OAuth code exchange, including
  `grant_type=authorization_code`.
- Validate response shapes; never infer success from HTTP 200 alone.
- Apply request timeouts.
- Redact tokens, authorization codes, and app secrets from logs.
- Classify provider errors as authentication, permission, rate limit, transient provider failure,
  validation, or unknown.

Suggested files:

- Replace `apps/dashboard/src/app/api/integrations/_lib/meta-oauth-client.ts` with an
  Instagram-specific OAuth client.
- Replace the Instagram portions of `apps/gateway/src/clients/meta-graph.ts` with an
  Instagram-specific Graph client.
- Keep outbound provider code in `apps/dashboard/src/lib/messaging/instagram-dispatch.ts`, backed
  by a small tested client/helper.

---

## 6. Phase 3 — OAuth Connect and Reconnect

**Status: In progress (2026-07-14).** Direct Instagram authorization, fail-closed callback,
subscription verification, tenant ownership enforcement, and same/different-account reconnect
behavior are implemented with focused automated coverage. A real Standard Access acceptance pass
and subsequent removal of the development manual-token backdoor remain.

### Authorization route

Rewrite `apps/dashboard/src/app/api/integrations/instagram/auth/route.ts` to:

1. Require an authenticated workspace session.
2. Keep the existing signed/stateful OAuth cookie machinery.
3. Redirect to `https://www.instagram.com/oauth/authorize` with:
   - `client_id=<INSTAGRAM_APP_ID>`
   - the exact registered `redirect_uri`
   - `response_type=code`
   - `scope=instagram_business_basic,instagram_business_manage_messages`
   - `state=<one-time state>`
   - `enable_fb_login=false` so the UI matches the direct-Instagram product promise
   - `force_reauth=true` for reconnect/account switching

### Callback route

Rewrite `apps/dashboard/src/app/api/integrations/instagram/callback/route.ts` to:

1. Validate the one-time state, authenticated user, and workspace binding before any provider or
   database mutation.
2. Exchange the code for a short-lived Instagram token.
3. Exchange it for a long-lived token. If this fails, fail the connection—never store the
   short-lived token as though it were valid for 60 days.
4. Read the account identity. Use the returned `user_id` as `externalAccountId` and the username as
   the display identity.
5. Confirm the account is Professional and that the granted permissions include both required
   scopes when Meta exposes that information.
6. Reject the connection with `instagram_account_in_use` if the provider account belongs to a
   different workspace.
7. Subscribe the account with:
   `POST https://graph.instagram.com/v25.0/{IG_ID}/subscribed_apps` and
   `subscribed_fields=messages`.
8. Read back `/subscribed_apps` and require `messages` to be present.
9. Persist the integration only after subscription succeeds. Use `expires_in` from Meta to compute
   `tokenExpiresAt`.
10. Store metadata that distinguishes the new model, for example:
    `instagram.authModel = "instagram_login"`, username, account type, granted scopes, and last
    successful subscription time.
11. Emit connection-completed analytics only after the integration and subscription are both
    ready.

If database persistence fails after subscription, issue a compensating unsubscribe before
returning an error.

### Reconnect behavior

- Reconnecting the same Instagram account updates its token, expiry, username, scopes, and
  subscription state in place so existing threads retain their route.
- Connecting a different Instagram account first subscribes the new account, then replaces the old
  integration in a transaction. Old threads lose their reply integration and must remain
  read-only. Best-effort unsubscribe the old account after the transaction.
- Never silently attach an old thread to a newly connected account.

Delete the development backdoor route and its tests once the real Standard Access flow passes.

---

## 7. Phase 4 — Webhook Ingestion and Tenant Isolation

**Status: Complete (2026-07-14).** The gateway now uses Instagram-specific webhook credentials,
accepts only Instagram deliveries, normalizes every entry/message independently, resolves the exact
active Instagram Login integration, rate-limits per message event, and bulk-enqueues one
tenant-scoped job per supported or recordable message. Focused coverage includes signatures,
multi-entry/multi-tenant deliveries, batched messages, echo/self filtering, unknown accounts,
unsupported content, and durable-enqueue failure.

Rewrite the Instagram branch of `apps/gateway/src/routes/webhooks-meta.ts` around normalized events.

### Request-level behavior

1. Keep GET verification but read `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`.
2. Require the raw request body and verify `X-Hub-Signature-256` using
   `INSTAGRAM_WEBHOOK_APP_SECRET` with constant-time comparison.
3. Accept only `object: "instagram"` for this integration.
4. Reject malformed signatures with 401.
5. Return 200 for valid deliveries even when an individual event is unsupported or belongs to an
   unknown/disconnected account; log those events with safe identifiers.
6. Return 500 only when a valid, routable event could not be durably enqueued, so Meta can retry.

### Event-level behavior

For every `entry[]` and every `entry.messaging[]`:

1. Validate `entry.id`, sender ID, message object, and timestamp independently.
2. Resolve `entry.id` to exactly one active Instagram Login integration and return its
   `integrationId`, `organizationId`, account ID, and access token reference.
3. Ignore `message.is_echo` and `message.is_self` events explicitly.
4. Classify text, supported attachments, shares, deleted messages, and unsupported content.
5. Enqueue one job per message event, not one job per webhook delivery.

Normalized job shape:

```ts
interface InstagramInboundJobData {
  platform: 'ig_dm';
  integrationId: string;
  organizationId: string;
  instagramAccountId: string;
  senderIgsid: string;
  externalMessageId: string | null;
  providerSentAt: string;
  text: string | null;
  attachments: Array<{
    type: string;
    url: string | null;
  }>;
  traceId: string;
}
```

Use `Queue.addBulk` after all entries have been normalized. Rate-limit by resolved organization and
count message events rather than treating a multi-message delivery as one customer action.

Add a database resolver that returns the integration—not only an arbitrary organization ID. It
must fail loudly if duplicate rows somehow bypass the database constraints.

---

## 8. Phase 5 — Inbound Worker and Durable Message Data

**Status: In progress (2026-07-14).** The worker consumes normalized jobs, revalidates the exact
integration/account/workspace tuple, uses the Instagram Login profile client as optional
enrichment, omits temporary profile and binary attachment URLs, persists provider timestamps and
integration routing, preserves idempotency, and prevents delayed events from moving thread state
backward. Secure binary media download/private blob storage remains; supported binary attachments
currently produce durable visible placeholders instead of storing provider URLs.

Rewrite `handleIgDmJob` to consume the normalized job instead of reparsing the full webhook.

1. Re-read the integration by `integrationId`, `organizationId`, and `instagramAccountId`. Drop the
   job if the account was disconnected or replaced after enqueueing.
2. Fetch the customer profile from
   `GET https://graph.instagram.com/v25.0/{IGSID}?fields=name,username,profile_pic` using the
   receiving integration's Instagram user token.
3. Treat profile lookup as enrichment: a failure must not lose the customer's message.
4. Cache the profile picture in Shopkeeper-controlled blob storage or omit it. Do not persist an
   expiring Meta URL as durable customer data.
5. Handle attachment types deliberately:
   - Download supported binary media with an HTTPS allowlist, timeout, content-type validation, and
     size limit, then store it in private blob storage.
   - Preserve shared-post/reel/story links as links rather than trying to upload them as binary
     files.
   - Store a visible placeholder for unsupported content so the ticket still records that the
     customer contacted the merchant.
6. Pass `integrationId`, `externalMessageId`, and the provider timestamp into persistence.
7. Generalize inbound persistence so `Message.sentAt` and `Thread.lastMessageAt` use a validated
   provider timestamp for Instagram. Keep ingestion/creation time separately where required for
   operations.
8. Keep database uniqueness on the Meta `mid` for idempotency. Deliveries without a `mid` remain
   distinct.
9. Set `Thread.replyIntegrationId` to the receiving integration without allowing older events to
   overwrite a newer route.

The 24-hour reply-window calculation in the dashboard and server must use the last real customer
message's provider timestamp.

---

## 9. Phase 6 — Outbound Replies

**Status: Complete (2026-07-14).** Outbound Instagram replies now require the thread's exact
`replyIntegrationId`, reject missing/replaced and legacy Page-token routes, validate the Instagram
Login auth model, permissions, and provider expiry, and enforce the 24-hour window from the latest
customer `Message.sentAt` for manual, agent, and auto-ack sends. Sends use the centralized
`graph.instagram.com/v25.0` client, persist the receiving integration and provider message ID, map
structured provider failures without logging tokens or message contents, and do not automatically
retry ambiguous failures. Focused coverage includes exact routing, no fallback, legacy and expired
connections, local and provider reply-window rejection, provider error categories, provider ID
persistence, and the agent-mode guard. The real Standard Access acceptance pass remains pending.

Update `apps/dashboard/src/lib/messaging/instagram-dispatch.ts` to:

1. Require `thread.replyIntegrationId` and load that exact integration within the thread's
   organization.
2. Require `metadata.instagram.authModel === "instagram_login"`, a non-expired token, and an
   account ID.
3. Refuse to send legacy tickets or tickets whose original integration was disconnected. Do not
   fall back to the workspace's current Instagram account.
4. Enforce the 24-hour window server-side using the last customer provider timestamp. Remove any UI
   or agent-mode bypass that allows an ineligible send attempt.
5. Send:

```text
POST https://graph.instagram.com/v25.0/{IG_ID}/messages
Authorization: Bearer <long-lived-instagram-user-token>
Content-Type: application/json

{
  "recipient": { "id": "<IGSID>" },
  "message": { "text": "<reply>" }
}
```

6. Capture `recipient_id` and `message_id` on success and persist the provider message ID with the
   outbound message when the current dispatch pipeline permits it.
7. Preserve specific user-facing errors for:
   - outside the messaging window
   - expired/revoked token
   - missing permission
   - disconnected/replaced account
   - rate limiting
   - temporary Meta failure
8. Log Meta error code/subcode and request ID, but never the token or message contents in provider
   error metadata.
9. Do not blindly retry ambiguous send failures: the Send API does not provide a Shopkeeper
   idempotency key, so an automatic retry can duplicate a customer reply. Surface a controlled
   manual retry unless Meta definitively rejected the request before accepting it.

The UI check is an early guard only; Meta's response remains authoritative.

---

## 10. Phase 7 — Token Lifecycle and Connection Health

**Status: Complete (2026-07-14).** The daily job now selects only Instagram Login integrations,
probes account identity and the `messages` subscription, refreshes eligible long-lived tokens with
Meta's returned token and expiry, clears legacy refresh tokens, and records healthy, degraded, or
reconnect-required metadata without expiring connections for transient failures. Dashboard health
and outbound guards consume the definitive reconnect state. A controlled real-token refresh remains
part of the Standard Access acceptance pass.

Replace the Facebook/Page-token branch in `token-health.ts` with Instagram long-lived-token logic.

### Daily health job

1. Select only integrations marked `instagram.authModel = "instagram_login"`.
2. Probe the connected account through `graph.instagram.com`.
3. Refresh only when the stored expiry is within a defined window (recommended: seven days), the
   token is at least 24 hours old, and it has not expired:

```text
GET https://graph.instagram.com/refresh_access_token
  ?grant_type=ig_refresh_token
  &access_token=<CURRENT_LONG_LIVED_TOKEN>
```

4. Replace `Integration.accessToken` with the returned token.
5. Set `tokenExpiresAt` from the returned `expires_in`; never reset it to a hard-coded 60 days.
6. Record last check, last refresh, and last error metadata for operational visibility.
7. Mark a connection expired only for a definitive authentication/revocation response or when the
   stored expiry has actually passed.
8. Do not mark tokens expired for timeouts, rate limits, or Meta 5xx responses.

There is no separate refresh token in this model. Clear `Integration.refreshToken` for new
Instagram Login rows.

### Dashboard health

- `healthy`: token valid, `messages` subscription confirmed.
- `refreshing/degraded`: transient health or subscription check failure while the token remains
  valid.
- `reconnect required`: token expired/revoked, required permission missing, or account identity no
  longer matches.

Do not display a fabricated expiry based solely on a successful account probe.

---

## 11. Phase 8 — Disconnect and Replacement Cleanup

**Status: Complete (2026-07-14).** Disconnect now verifies workspace ownership before any provider
call, unsubscribes Instagram Login accounts from `messages`, and always removes local access even
when Meta is unavailable. Failed provider cleanup emits a structured operational warning for manual
follow-up, integration deletion clears related thread reply routes through the database relation, and
legacy Page tokens are never sent to the Instagram Login endpoint. The current official Instagram
API collection documents webhook unsubscribe but no separate Instagram Login authorization-
revocation request.

Before deleting an Instagram integration:

1. Load it with an organization ownership check.
2. Call
   `DELETE https://graph.instagram.com/v25.0/{IG_ID}/subscribed_apps` with its current token.
3. Delete the local row even if Meta is temporarily unavailable, because the merchant's request to
   remove local access must succeed.
4. Record an operational warning/retry task if provider unsubscribe failed. Subsequent webhook
   deliveries will be validly signed but will resolve to no integration and be dropped.
5. Ensure related threads lose `replyIntegrationId` and cannot send through another Instagram
   account.

If Meta exposes a current authorization-revocation endpoint for this login model, invoke it as a
best-effort additional cleanup after unsubscribe and cover it with a contract test.

---

## 12. Phase 9 — UI, Copy, Analytics, and Documentation

Update all user-facing copy to match the new model:

- Say **Instagram Professional account**, not only Business account.
- Remove instructions to create or link a Facebook Page.
- Explain that personal Instagram accounts cannot connect.
- Explain that customers must message the account first.
- Keep the 24-hour reply-window disclosure.
- Show subscription/token health separately from simple row existence.
- Show a clear reconnect action for revoked or expired tokens.
- Show a clear error when the Instagram account is already connected to another workspace.

Update OAuth error mapping for at least:

- `access_denied`
- `invalid_callback`
- `token_exchange_failed`
- `long_lived_token_failed`
- `not_professional_account`
- `missing_instagram_permissions`
- `instagram_account_in_use`
- `webhook_subscription_failed`
- `provider_unavailable`

Update analytics so `integration_connection_completed` fires only for a fully subscribed, usable
connection. Add failure categories for token upgrade, identity validation, account conflict, and
subscription.

Update:

- `README.md`
- `docs/production/runbook.md`
- environment examples and production validation scripts
- integration help content
- onboarding copy
- the Instagram decision memo or replace it with a link to this plan

Remove the "Deferred After V1" language when the real-account acceptance test passes, not merely
when the code merges.

---

## 13. Test Plan

### OAuth unit/integration tests

- Authorization URL contains the exact callback, state, two scopes, and `enable_fb_login=false`.
- Missing configuration fails before redirect.
- State mismatch cannot mutate an integration.
- Code exchange uses form encoding and `grant_type=authorization_code`.
- Short-token success plus long-token failure does not save an integration.
- Provider `expires_in` controls `tokenExpiresAt`.
- Personal/non-professional accounts are rejected.
- Missing message permission is rejected.
- Subscription failure does not report success.
- Subscription success plus database failure triggers compensating unsubscribe.
- Same-account reconnect updates in place.
- Different-account replacement leaves old threads unable to send.
- Cross-workspace account conflict is rejected.

### Webhook route tests

- GET verification success, mismatch, and missing parameters.
- Missing, malformed, and incorrect HMAC signatures return 401.
- Multiple entries for different organizations enqueue isolated jobs with the correct
  `organizationId` and `integrationId`.
- Multiple messages in one entry enqueue every message.
- Echo and self-test events are skipped.
- Unknown/disconnected accounts do not affect valid entries in the same delivery.
- Queue failure for a routable event returns 500.
- Valid unsupported events return 200 without enqueueing.

### Inbound worker tests

- Text-only, attachment-only, mixed, shared-media, deleted, and unsupported messages.
- Profile success, permission failure, timeout, and temporary URL download failure.
- Expiring provider URLs are not persisted as durable blob references.
- Duplicate `mid` is idempotent; missing `mid` events remain distinct.
- Provider timestamp is stored and controls `lastMessageAt`.
- A disconnected/replaced integration is rejected after enqueue.
- `Message.integrationId` and `Thread.replyIntegrationId` are set correctly.

### Outbound tests

- Exact `graph.instagram.com/v25.0/{IG_ID}/messages` URL, bearer token, and body.
- The thread's integration is used even if another row exists in fixtures.
- A missing/disconnected/replaced integration never falls back to another account.
- Successful provider message ID is captured.
- 24-hour window, token expiry, permission, rate-limit, and 5xx error mapping.
- Agent mode cannot bypass the reply window.
- Outbound failure does not persist a successful agent message.

### Token and disconnect tests

- Healthy tokens outside the refresh window are not refreshed.
- Expiring tokens are refreshed and both token and provider expiry are saved.
- 429/5xx/timeouts do not mark a token expired.
- Definitive code 190/revocation marks reconnect required.
- Disconnect attempts unsubscribe and always removes local access.
- Failed unsubscribe produces an operational warning without leaving the integration connected.

### Real Meta acceptance test under Standard Access

1. Complete OAuth using the Shopkeeper UI.
2. Confirm `/subscribed_apps` contains `messages`.
3. Send two DMs quickly from a separate Instagram account, including one attachment.
4. Confirm both messages appear once, with the correct customer and timestamps.
5. Approve a reply and confirm delivery in Instagram.
6. Confirm the outbound provider message ID was recorded.
7. Exercise reconnect with the same account.
8. Disconnect and confirm new DMs no longer create tickets.
9. Reconnect and exercise the token refresh client with a controlled test token when possible.

No App Review submission should be made until this complete loop works through Shopkeeper—not only
through Graph API Explorer or the App Dashboard's webhook test tool.

---

## 14. App Review and Rollout

Standard Access is only for accounts the app owns/manages and has added in the App Dashboard.
External merchants require Advanced Access for the requested Instagram permissions.

Prepare the current items requested by the Meta App Dashboard, including:

- completed Business Verification
- app icon, category, business/contact information
- privacy policy, terms, and data-deletion instructions/URL
- a precise usage explanation for each requested permission
- reviewer credentials for Shopkeeper and a connectable test Instagram account
- an English screencast showing:
  1. merchant opens Shopkeeper Integrations
  2. merchant completes Instagram OAuth
  3. customer sends a real DM
  4. DM appears as a Shopkeeper ticket
  5. merchant approves/sends the reply
  6. reply appears in the Instagram conversation

Do not put a guaranteed review duration in the delivery schedule; Meta does not provide a reliable
approval SLA. Treat Advanced Access as an external launch gate.

### Rollout order

1. Merge code behind an Instagram integration feature flag.
2. Deploy new environment variables to dashboard and gateway.
3. Apply the uniqueness/migration changes after auditing legacy duplicates.
4. Deploy gateway webhook handling and clients.
5. Deploy dashboard OAuth, UI, dispatch, token health, and disconnect changes.
6. Run the Standard Access acceptance test in production-like infrastructure.
7. Submit App Review/Advanced Access.
8. Keep external connection disabled until approval is visible and a non-role merchant test passes.
9. Enable for a small beta cohort and monitor connection failures, webhook signature failures,
   unknown account IDs, queue failures, send failures, and token refresh failures.
10. Remove legacy Meta environment variables and dead Page-token code after the beta proves stable.

---

## 15. Definition of Done

Instagram is launch-ready only when all of the following are true:

- The repository contains no active Facebook Page-token Instagram path or manual-token backdoor.
- OAuth uses Instagram-specific credentials and the two approved `instagram_business_*` scopes.
- A connection is shown as successful only after long-token exchange, identity validation, and
  confirmed `messages` subscription.
- One provider account resolves to exactly one workspace and one active integration.
- Every webhook entry/message is isolated, normalized, queued, and deduplicated correctly.
- Inbound tickets retain their receiving integration and provider timestamp.
- Replies use the exact receiving integration and `graph.instagram.com/v25.0`.
- Replaced, disconnected, legacy, and outside-window threads cannot send through another account.
- Tokens refresh before expiry using Meta's returned token and expiry.
- Disconnect removes local access and attempts provider unsubscribe.
- The full real-DM loop passes under Standard Access.
- Advanced Access is approved and a non-role merchant account completes the same loop.
- The production runbook, environment validation, dashboards, and alerts cover Instagram.

---

## References

- [Instagram API with Instagram Login — overview](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/)
- [Instagram API with Instagram Login — messaging](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/)
- [Business Login for Instagram](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/)
- [Instagram Platform changelog](https://developers.facebook.com/docs/instagram-platform/changelog/)
- [Graph API changelog](https://developers.facebook.com/docs/graph-api/changelog/)
- [Meta's official Instagram API Postman collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)
- [Meta's official Instagram webhook subscription request](https://www.postman.com/meta/instagram/request/23987686-0223707a-7035-46a2-8015-1fdf7249278f)
- [Meta's official Instagram messaging webhook reference](https://www.postman.com/meta/instagram/request/23987686-95cce6f6-b811-41dc-b560-d43741c5002a)
- [Meta's official Instagram User Profile API collection](https://www.postman.com/meta/instagram/folder/23987686-22b3a5b0-4a51-449a-9299-e3667d69b182)
