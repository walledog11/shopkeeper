# SocialAPI Instagram transport plan

Status: in progress. Owner: engineering, with founder ownership of vendor
diligence (S0) and live rollout.

## Objective

SocialAPI is the Instagram transport for `ig_dm` through the first 100 users. It
is a provider underneath the existing `ig_dm` product channel, not a separate
user-visible channel. Meta App Review does not gate the canaries, the pilot, or
growth toward 100 users. The direct Meta implementation stays intact and closed
to new connections (`isInstagramIntegrationEnabledForOrg`); revisiting direct
Meta, migration, or any cross-provider handoff needs a future dated decision.

## Current state

- **Works on a controlled account:** a signed `dm.received` becomes a durable `provider: 'socialapi'` job, a ticket and a plan; an approved reply leaves through SocialAPI's conversation endpoint; an approval card reaches the bound iMessage line. A merchant approval executing a mutative plan end to end through SocialAPI is not yet proven.
- **Built, never run for a live merchant:** merchant OAuth connect (S2). It is closed in production because `SOCIALAPI_ENABLED` and `SOCIALAPI_BRAND_ASSIGNMENTS` are unset, so `getSocialApiConnectConfig` returns null.
- **Absent:** connection generations, `dm.sent` reconciliation, recovery/catch-up reads, SocialAPI health probing, transport-routed disconnect and deletion, OAuth compensation, the "Powered by SocialAPI" disclosure, and transport-tagged observability.
- **Blocked on the vendor:** SocialAPI exposes no native Instagram account ID, and the DPA and retention terms are unreconciled ([S0 diligence](production/socialapi-s0-diligence-2026-09-07.md)).

## Decisions and invariants

1. **SocialAPI is the selected transport through the first 100 users.** Existing direct integrations stay direct and no automatic migration is performed. A future dated decision reopens direct Meta.
2. **SocialAPI is selected server-side per organization.** Merchants do not choose a provider. An audited, fixed set of organization-to-brand assignments (`SOCIALAPI_BRAND_ASSIGNMENTS`) controls admission; merchants still complete OAuth themselves.
3. **One integration uses one transport at a time.** An Instagram account is never intentionally active through both transports except during a bounded, observed migration handoff.
4. **There is no automatic send failover.** A SocialAPI-connected merchant has not authorized Shopkeeper's Meta app. A failed SocialAPI send is never retried through direct Meta.
5. **The existing Shopkeeper workflow remains authoritative.** Both transports normalize into the current durable `InstagramInboundJobData`, ticket, planning, approval, attachment, and outbound-recording paths.
6. **Verified Instagram identity remains canonical.** `Integration.externalAccountId` and `Customer.platformId` keep their direct-Meta identity semantics; SocialAPI brand, account, and conversation IDs are routing metadata. The worker keys on two job fields: `instagramAccountId` selects the integration through `loadActiveInstagramIntegration`, and `senderIgsid` becomes `Customer.platformId`, half of the `(organizationId, platformId)` unique key. SocialAPI's webhook `platform_id` matches its stored inbox row, so no mapping is needed within SocialAPI. Instagram-scoped sender IDs are per Meta app, so a direct-Meta handoff should expect different sender IDs and needs an explicit sender mapping rather than an in-place swap.
7. **SocialAPI credentials are infrastructure secrets.** Never store the workspace API key in `Integration`, logs, jobs, or client-visible responses.
8. **Capacity is enforced in code, and expansion is staged.** Admission is bounded by the vendor tier actually contracted, not by convention, and does not expand merely because the first canaries work. The bound is a capacity contract to renegotiate as the cohort grows, not a deadline to migrate away.

## Launch envelope (first stage)

The first stage is sized to the paid Side Hustle tier (webhooks and support are required). It is not a product ceiling: expanding it takes a vendor conversation plus the S6 capacity evidence. Define the admission unit (connected merchant organizations and brands) before raising any number, so "100 users" maps to enforceable provider capacity.

- Maximum **8 active production SocialAPI merchant organizations**, the headroom the published 10-brand tier leaves. Enforced at connect: `SOCIALAPI_MAX_ACTIVE_ORGS` (ceiling 8) bounds the assignment map, and a map larger than the cap closes connect. Raising it requires a contracted tier with documented headroom.
- Cohorts: 2 canaries, then 5 merchants, then at most 8 on this tier.
- Review trigger: the earliest of **30 calendar days, 5 active merchants, 500 inbound events/day, or 100 outbound replies/day** across the cohort. Before the first external canary, record its activation date and a capacity-review deadline 30 days later in the runbook. The review decides expand, hold, or renegotiate; without a recorded decision, freeze onboarding but do not drop service for connected merchants.
- Freeze new SocialAPI connections immediately for any unresolved cross-tenant routing defect, missing supported DM, attachment-loss incident, two consecutive OAuth failures affecting different merchants, or the S6 provider failure alert.
- Do not upgrade to the 50-brand plan as a reflex. Reaching 8 requires a written decision to negotiate stronger terms or dedicated infrastructure, or to delay expansion, based on observed reliability and support response.
- Event thresholds are review triggers, not message-dropping limits. A connected account's valid events are always accepted; the connection gate is what limits exposure.
- Use separate SocialAPI workspaces/keys for non-production if the vendor supports them; otherwise keep non-production brands out of the production slots and count them in the capacity audit.
- Brands and scoped runtime keys are provisioned through an audited operator workflow before merchant OAuth. Pending connections hold a slot; failed or abandoned OAuth retains it until explicitly released; reconnect reuses it. Automated brand creation and dynamic slot allocation are deferred.

## Target architecture

```text
                                     ┌─ Meta direct OAuth/webhook/API ─────┐
Merchant Instagram ─ provider pin ───┤                                    ├─ normalized IG job
                                     └─ SocialAPI OAuth/webhook/API ───────┘         │
                                                                                     ▼
                                                        existing persistence → agent → approval
                                                                                     │
                                                                                     ▼
                                                        provider-pinned outbound transport
```

The provider pin belongs to the `Integration`, and `Thread.replyIntegrationId` selects the exact connected account. `Thread.externalSpaceId` stores the SocialAPI conversation ID needed for replies; it does not make Instagram conversation IDs episode boundaries.

Integration metadata:

```json
{
  "instagram": {
    "authModel": "socialapi",
    "transport": "socialapi",
    "socialApiBrandId": "br_...",
    "connectionGeneration": 1,
    "username": "merchant",
    "connectedAt": "2026-09-07T00:00:00.000Z",
    "healthStatus": "healthy"
  }
}
```

Direct records keep `authModel: "instagram_login"`; a record without `transport` is `meta_direct`.

`Integration.providerAccountId` holds SocialAPI's `acc_...` ID, indexed by `integrations_provider_account_unique` (non-null rows), which serves the webhook lookup and stops one provider account resolving to two workspaces. `externalAccountId` is meant to hold the native Instagram account ID so the global Instagram ownership constraint holds across transports. Because the vendor does not expose that ID, a SocialAPI row currently stores the provider ID there and records `instagram.externalAccountIdSource: 'provider'`. The join is self-consistent, but cross-transport ownership is not enforced; that is unreachable only while direct Meta is closed to new workspaces. Professional-account eligibility cannot be checked at connect either.

The columns are authoritative; do not duplicate account IDs in metadata. One shared typed reader combines the columns, validated metadata, and a server-side credential reference into the active integration contract. Scoped keys live in the server secret store, never metadata; the administrative key stays out of messaging processes. Increment `connectionGeneration` on reconnect or transport change so queued work cannot bind to a replacement connection.

The normalized inbound job carries optional `provider` and `providerConversationId` today; `providerAccountId` and `connectionGeneration` are still to add. They are optional only for compatibility with queued direct jobs: new SocialAPI jobs require all routing fields. A missing provider means legacy direct Meta and is never inferred as SocialAPI from the integration's current state.

`externalMessageId` uses the native Meta message ID (`data.platform_id`, falling back to raw `message.mid`), never the provider interaction ID. External onboarding requires proven webhook/poll deduplication, and any future handoff requires a tested cross-provider deduplication or mapping strategy.

## Remaining work

Build the shortest path that exercises the real flow, then harden what actually breaks. Order once the approval leg is proven end to end: image coverage, live merchant OAuth, disconnect/reconnect, second account, then S4–S6 hardening.

### Controlled-account probe

`npm run spike:socialapi -- inspect` reads `SOCIALAPI_API_KEY` and `SOCIALAPI_BRAND_ID` (plus optional `SOCIALAPI_ACCOUNT_ID` and `SOCIALAPI_CONVERSATION_ID`) from the git-ignored `.env.socialapi.local`. It fingerprints identifiers and records only structural facts; keep credentials, OAuth state/code, participant details, message text, and media URLs out of anything tracked. `--use-sole-account` allows conversation inventory when the brand has exactly one account; `--use-newest-conversation` reads the newest conversation only after a fresh controlled inbound message. `connect`, `exchange`, `send`, and `disconnect` require `--execute`; `send` also requires a controlled marker and, without configured IDs, both selection flags and a conversation active within 15 minutes; `disconnect` requires `--confirm-controlled-account`.

Still to establish with the controlled account: `dm.sent` correlation (the webhook interaction ID matched neither inbox-row ID), webhook/stored-ID convergence and missed-delivery recovery, every required attachment/event shape with URL lifetime and deletion behavior (a view-once image arrives `ephemeral` with no URL), and reconnect. Unresolved identity or exit semantics block external onboarding.

### S0. Vendor and data-processing gate

Tracked in [S0 diligence](production/socialapi-s0-diligence-2026-09-07.md). Block external merchant onboarding if identity, attachment coverage, deletion, or retention cannot be resolved. Controlled testing proceeds alongside it.

### S1. Provider boundary and schema

Entry points: `packages/integrations/src/instagram`, `packages/db/prisma/schema.prisma`, `apps/gateway/src/lib/instagram-integration.ts`, `apps/gateway/src/types.ts`, `apps/dashboard/src/lib/messaging/instagram-dispatch.ts`.

- [ ] Define a discriminated `InstagramTransport`/active-integration contract for `meta_direct` and `socialapi`: direct requires its stored Meta token; SocialAPI requires `providerAccountId` and a server-resolved scoped credential. Keep it limited to Instagram's actual needs.
- [ ] Treat missing `instagram.transport` on existing rows as `meta_direct` everywhere through that one reader.
- [ ] Keep `externalAccountId` native once the vendor exposes the ID, and preserve one Instagram account per Shopkeeper organization.
- [ ] Add `providerAccountId` and `connectionGeneration` to `InstagramInboundJobData` without breaking queued direct-Meta jobs.
- [ ] Add strict metadata readers/writers; do not scatter JSON casts across routes.
- [ ] Define reconnect and migration transitions before implementing them: drain or durably quarantine old-generation work, pause new sends during cutover, never relabel queued jobs as belonging to a new connection, and resolve quarantined work before declaring a handoff complete.
- [ ] Specify atomic conversation-route replacement on validated reconnect. Inbound persistence only fills an empty `externalSpaceId`; a changed conversation ID must not stay stale, and a late old-generation event must not overwrite the new route.
- [ ] Define a durable cleanup snapshot (old transport, provider account/brand IDs, generation, credential reference) taken before an in-place migration overwrites metadata. Cleanup targets the snapshot without deleting the retained integration or its threads.
- [ ] Define OAuth attempt ownership so callback retries and losing concurrent attempts cannot compensate by deleting the winning or pre-existing remote account.
- [ ] Decide error categories once: authentication/reconnect, permission, response-window, rate-limit, transient-provider, validation, isolation, and unknown.

Done when existing direct Meta tests pass with at most compatibility-only adjustments and a SocialAPI integration is represented without a fake access token.

### S2. SocialAPI client and OAuth lifecycle

Built: the core REST client (`packages/integrations/src/socialapi/client.ts`: connect, exchange, account read, conversation send, disconnect) with bounded timeouts, response validation and no blind retry of sends; connect configuration and the assignment cap (`apps/dashboard/src/lib/socialapi/config.ts`, base-URL override ignored in production); OAuth state bound to the initiating organization via the sealed attempt cookie keyed by the redirect URI's `attempt`, with the provider's own state compared before exchange; brand re-resolved from the assignment map on callback; one connect entry point dispatching on `resolveInstagramConnectTransport`; the transactional recheck of the current integration in `persistSocialApiConnection`.

- [ ] Add health, list/sync recovery, and deletion operations to the client as S4/S5 need them.
- [ ] Validate native account ID and Professional-account eligibility at connect. Blocked: neither `POST /oauth/exchange` nor `GET /accounts` returns them (vendor question 5).
- [ ] Durably schedule compensation for a remote account proven to have been created by a failed attempt and not adopted by a successful connection; ambiguous ownership goes to reconciliation.
- [ ] Show "Powered by SocialAPI" before authorization and link the updated privacy disclosure. Blocked on capturing the live consent screen (S0).
- [ ] Run connect for one assigned organization against a live merchant OAuth: an unassigned organization keeps the direct behavior, callback replay is harmless, and cross-organization ownership attempts fail.

### S3. Signed inbound webhook

Built in `apps/gateway/src/routes/webhooks-socialapi.ts`: `POST /webhooks/socialapi` with V2 HMAC-SHA256 over `<timestamp>.<raw body>` and a five-minute tolerance; the unsigned `webhook.test` registration ping as the sole exception (strict schema, rate-limited, no side effects, only while no endpoint secret exists); durable queue admission before the `200`, with a queue failure returning `500`; only `dm.received` creates work; `resolveSocialApiIntegration` resolves `data.account_id` through `providerAccountId`, takes the organization from the row, and throws `AmbiguousInstagramIntegrationError` on duplicates; `normalizeSocialApiDmReceived` maps native message and sender IDs.

- [ ] Use `dm.sent` to reconcile outbound results once the identifier question is answered.
- [ ] Match connection generation once S1 adds it.
- [ ] Preserve existing body limits, no-content logging, trace IDs, bulk queue behavior, and signature-failure alerts tagged `provider=socialapi`.
- [ ] Make retries idempotent using the organization-scoped external-message uniqueness guarantee, and use stable delivery IDs for delivery correlation where present. Delivery IDs do not replace canonical message IDs; retry timestamps describe the delivery attempt, not the customer's message time.
- [ ] The vendor's separately triggered signed synthetic test has an event header/body mismatch and returns `400`; real deliveries pass. Confirm with the vendor or accept.

Done when valid events are durably admitted, replays persist once, invalid signatures never reach the queue, unmapped accounts alert safely, and direct Meta ingress is unchanged. Exactly-once persistence is the guarantee; queue redelivery is allowed.

### S4. Worker, attachment, and catch-up behavior

Built: SocialAPI rows skip the Meta-token paths; display names come from SocialAPI's conversation list through `fetchSocialApiParticipantProfile` with a bounded cache; media flows through the shared allowlisted downloader into private blob storage.

- [ ] Require matching transport, provider account ID, and connection generation when loading the active integration; apply the S1 handoff rules to stale jobs.
- [ ] Prove every required attachment type is either privately persisted before its URL expires or represented truthfully as unsupported, keeping count, byte, MIME, timeout, concurrency, and SSRF protections and permitting only validated provider/CDN origins.
- [ ] Validate account/conversation ownership and apply generation-guarded route replacement on reconnect.
- [ ] Bounded recovery for two cases: vendor-received messages not forwarded to Shopkeeper (stored-message/event reads) and messages the vendor missed upstream (platform inbox sync). Account sync refreshes only the conversation list, so recovery must enumerate changed conversations and page messages per thread.
- [ ] Set a durable activation boundary: no automatic import of pre-connection history; recovery uses original message time, accepts only genuine inbound customer events, and never reopens the 24-hour send window using poll time.
- [ ] Start with a five-minute recovery schedule subject to quotas, with stable ordering, checkpoint plus overlap, page/work budgets, and resumable continuation. A capped run must not advance past unprocessed pages.
- [ ] Record the checkpoint only after every fetched event in the range is durably admitted; webhook and poll ingestion converge on one idempotency key.

Done when webhooks and polling cannot create duplicate messages and a missed webhook is recovered.

### S5. Outbound, health, disconnect, and deletion

Built in `dispatchInstagramDirect`: outbound branches on the pinned transport after loading `replyIntegrationId`; the 24-hour window check is shared; a SocialAPI thread with no `externalSpaceId` refuses to send; calls and send-failure alerts carry the transport; a SocialAPI failure never touches a Graph API host.

- [ ] SocialAPI health probing for account status and reconnect reason; do not run direct Meta subscription/token-refresh logic for SocialAPI rows.
- [ ] Route durable disconnect cleanup by transport: direct unsubscribes Meta; SocialAPI deletes the connected account (`disconnectInstagramAccount` exists in the client but nothing calls it). Workspace deletion also deletes the remote brand when safe.
- [ ] Reconnect updates the existing integration and thread routing when the verified account is unchanged, increments generation, and prevents stale jobs restoring old routes.
- [ ] Outage behavior: flag the integration degraded, stop automated sends when outcome safety is unclear, keep reconciliation scheduled, and tell the merchant to use Instagram directly. A provider message ID proves acceptance, not delivery.

Done when send, failure, reconnect, disconnect, and workspace deletion are provider-correct and recoverable without leaking credentials or orphaning remote access.

### S6. Observability, capacity, and operations

- [ ] Tag integration analytics and ops alerts with `transport=meta_direct|socialapi`, keeping `channel=ig_dm`.
- [ ] Count OAuth attempts/results, active SocialAPI organizations, signed/unmapped/duplicate webhooks, queue failures, reconciliation discoveries, attachment failures, provider status and latency, sends by result category, and reconnect-required accounts.
- [ ] Measure provider-received-to-ticket lag and approval-to-provider-accepted latency without logging message content or customer identifiers.
- [ ] Alert immediately on any isolation mismatch, confirmed missing supported message/attachment, or unrecovered reconciliation gap; alert on invalid-signature bursts and webhook-path inbound lag above two minutes.
- [ ] Provider 5xx/timeout above 2% over a rolling 15 minutes with at least 100 calls; below that volume, alert and freeze onboarding after three consecutive failures within 15 minutes. Attachment failures above 1% with at least 100 attempts in 24 hours; below that, review each and freeze for confirmed loss.
- [ ] Report active and assigned/pending merchants separately; alert at 5/8 and 7/8 assigned slots; audit all remote brands including test accounts.
- [ ] Extend `audit:instagram-rollout` with transport counts, invalid metadata, missing provider account IDs, duplicate identities, health, last ingress/send, and cap utilization.
- [ ] Add SocialAPI variables to `turbo.json`, launch-environment validation, network test guards, and the runbook. Secret checks report presence/fingerprint only.
- [ ] A synthetic production canary if SocialAPI permits a dedicated test account; otherwise a documented daily manual check through the supervised stages.

Done when ops can tell direct and SocialAPI failures apart, stop onboarding before the stage limit, and diagnose a merchant without viewing message content.

### Canaries and staged launch

Entry requires S0 closed, S1–S6 done, and controlled-account acceptance. Live acceptance, controlled account first and then two non-role merchants:

- Connect → inbound text → ticket/plan → approve → accepted reply with provider ID, received in the recipient's Instagram app.
- Two rapid messages keep provider timestamps and persist exactly once.
- Image, video, audio, story/post share, deleted/unsent, referral, and unsupported inputs meet the documented mapping.
- A temporarily failed webhook endpoint recovers through retry plus reconciliation without duplicates.
- Revoked provider access shows health/reconnect behavior; disconnect stops new tickets; reconnect restores existing routing.
- Provider-held data deletion executes.
- 7–14 days of observation with zero missing supported messages, zero cross-tenant errors, zero duplicate persisted messages, and a provider message ID on every eligible reply.

Then expand: keep the same two canaries (do not reset the clock), go to five after the observation window, hold at least three clean days at five, and go to eight only with diligence closed, clean attachment/reconciliation evidence, and adequate support response. At the stage limit, run the capacity review against the next cohort size.

If a future decision reopens direct Meta, the handoff freezes new SocialAPI connections, pauses automated sends, drains or quarantines old-generation work, persists the cleanup snapshot before changing the integration in place, preserves `replyIntegrationId`, increments generation, runs a bounded dual-subscription overlap with the tested dedupe/mapping, and disconnects the old account only after inbound and outbound are verified. Failure pauses further migrations and never discards queued messages.

## Release and rollback rules

- All schema changes are additive and deploy before code that reads them.
- Dashboard and gateway accept both old direct jobs and provider-tagged jobs for as long as both transports have live integrations.
- Rollback disables **new** SocialAPI connects first. It does not disable ingress or replies for already connected merchants.
- A severe isolation or integrity incident disables SocialAPI automated outbound, retains signed ingress where safe, and activates the merchant manual-response procedure.
- Provider switching is an explicit OAuth/reconnect operation. A feature-flag flip alone cannot move a merchant between OAuth apps.
- Removal is complete only after remote account/brand deletion is verified and production secrets are revoked.
