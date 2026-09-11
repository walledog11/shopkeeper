# SocialAPI controlled-spike evidence — 2026-09-09

Status: partial. Account inventory, controlled text/image discovery, provider-accepted text reply,
participant receipt, webhook endpoint registration, and signed `dm.received` delivery passed.
Milestone-zero ingress and outbound through the durable workflow are implemented and proven live.
Merchant connect (S2) is implemented and deterministically covered but has not been run against a
live merchant OAuth. Outbound `dm.sent` correlation, reconnect, and
disconnect remain open. Image coverage, send-result correlation, and the native Instagram account
id have unresolved provider gaps.

## Scope and handling

The probe used the connected SocialAPI brand and Instagram account supplied through the ignored
`.env.socialapi.local` file. At the initial inventory, a separate sender/test participant had not
yet been designated; the fresh exchange below occurred only after one was explicitly designated. No
credential, raw identifier, participant detail, message text, or media URL is recorded here. Stable
SHA-256 prefixes were used only to compare identifier equality inside the transient probe output.

## Dated observations

- The scoped key could list the assigned brand's accounts.
- Exactly one Instagram account was returned. Its brand matched the assigned brand, status was
  `active`, and no reconnect reason was present.
- The account returned three active conversations in one bounded page.
- The newest conversation returned 25 messages and reported another page. The probe did not follow
  the cursor; this establishes that recovery reads are paginated rather than complete by default.
- The conversation's SocialAPI `id` differed from its `platform_id`.
- Each inspected message's SocialAPI `id` differed from its `platform_id`.
- Every inspected incoming message had the same `sender_id` as the conversation's
  `participant_id`. This demonstrates agreement between SocialAPI's two normalized read surfaces
  for that historical sample. Because the participant was not pre-designated as a controlled test
  identity, this is not acceptance evidence and does **not** prove equality with direct Meta's
  `Customer.platformId`.
- The inspected sample contained text and image messages. Image rows exposed an attachment type and
  URL structurally; URL lifetime, download authorization, deletion, and private persistence remain
  untested.
- After a separate Instagram account was explicitly designated as the controlled participant, a
  fresh text and image appeared as the two newest incoming rows in the same conversation. Their
  sender IDs matched that conversation's participant ID, and the image row carried both text and
  an image attachment structurally. The exact text semantics of image-only messages still need a
  sanitized fixture.
- A guarded send within the fresh response window returned success with one message ID. A bounded
  read immediately afterward showed a new outgoing text row at the expected time.
- The controlled participant confirmed receipt of the marked reply on 2026-09-09.
- Gateway commit `c3b8a79e` deployed successfully to the Railway web service. Its deep health check
  reported database, Redis, worker heartbeat, queues, and iMessage healthy.
- SocialAPI registered one active endpoint for `dm.received` and `dm.sent`; its identifier
  fingerprint is `sha256:9f0912cd02ee2e48`. The one-time endpoint secret was installed directly in
  Railway without printing or committing it. After the secret redeploy, the formerly available
  unsigned registration shape returned `401`, confirming that the exception closed.
- A provider-generated synthetic test passed V2 authentication but was rejected with `400` because
  its event header did not match its structurally inspected `{event,data}` body. Do not weaken the
  header/body check for this synthetic discrepancy. Real deliveries subsequently passed; ask the
  vendor about the synthetic test-delivery header separately.
- A second fresh controlled text/image pair generated two real `dm.received` deliveries. Both passed
  V2 verification, carried distinct delivery IDs, reached the gateway once, and received `200` in
  5–6 ms. SocialAPI's delivery records classify both as `delivered` with one attempt.
- For both real deliveries, webhook `data.account_id` matched the bounded conversation's account,
  `data.conversation_id` matched the inbox conversation ID, and webhook `data.author.id` plus raw
  `sender.id` matched the inbox conversation participant and message sender.
- For both real deliveries, webhook `data.platform_id` and raw `message.mid` matched the stored
  inbox row's `platform_id`. This is the canonical webhook-plus-poll deduplication join observed in
  the spike.
- Webhook `data.id` did **not** match either the stored inbox row's SocialAPI `id` or its
  `platform_id`. Treat the interaction ID as a separate provider identifier; do not use it alone to
  deduplicate webhook delivery against inbox recovery reads.
- The fresh text event contained text and no media, as expected. The fresh image event contained no
  text and one `ephemeral` media item with no URL in both the webhook and stored inbox row. This is a
  blocking attachment-coverage finding: Shopkeeper cannot privately persist or inspect that image
  from the observed payload. An earlier non-ephemeral image row did expose an image URL, so image
  behavior varies by Instagram send mode and must be classified rather than treated as one shape.
- The send-result message ID fingerprint matched neither the outgoing inbox row's SocialAPI `id`
  nor its `platform_id`. Do not use the current send result as proven correlation or completion
  evidence. Obtain the signed `dm.sent` payload and ask the vendor which identifier joins the send
  response, webhook echo, and inbox read surfaces.

## Next evidence

1. Send one controlled reply and capture its signed `dm.sent` event. Compare the send-response ID,
   webhook interaction/native IDs, and outgoing inbox row rather than inferring success by recency.
2. Ask SocialAPI how `ephemeral` Instagram attachments are intended to be handled and test an
   ordinary gallery image separately from a disappearing or view-once image.
3. Compare the now-proven SocialAPI author/native sender ID with the direct-Meta sender ID for the
   same controlled participant; SocialAPI-internal sender agreement is proven, cross-app equality
   is not.
4. Exercise a controlled webhook retry and bounded recovery read using the native `platform_id` as
   the candidate canonical message key; confirm one durable result once application ingress exists.
5. ~~Route the controlled message through Shopkeeper ticket creation, planning, and a received
   reply while the 24-hour window is open.~~ Done 2026-09-09; see the live run below. Still open:
   send a DM whose plan carries an `action`-category call so the approval leg reaches the phone, and
   confirm the participant received the reply in their Instagram app.
6. Exercise disconnect/reconnect only after the account and recovery target are explicitly
   confirmed.

The 2026-09-09 live run justifies a provisional go on transport feasibility: the path works end to
end for text. It does not close identity, media, recovery, or vendor diligence, and it does not
authorize external merchant data.

## Milestone-zero ingress slice — landed 2026-09-09

The receiver is no longer observation-only. What changed, and what it does not yet do:

- A verified `dm.received` whose `data.account_id` matches `SOCIALAPI_PINNED_ACCOUNT_ID` is
  normalized and added to the existing inbound BullMQ queue as an Instagram job carrying
  `provider: 'socialapi'`. Enqueue happens before the `200`; a queue failure returns `500` so the
  vendor's retry is the recovery path.
- The job's `externalMessageId` is the native `platform_id` (raw `message.mid` fallback) — the join
  this spike proved. The provider interaction `id`, which matched neither inbox identifier, is
  never used for deduplication.
- `senderIgsid` carries SocialAPI's author id. Transport-plan invariant 6 expects this to differ
  from a direct-Meta IGSID because each transport observes the shopper through a different Meta
  app, so it becomes `Customer.platformId` for SocialAPI threads and is not interchangeable with a
  direct row's identity. Nothing migrates between them.
- The worker branches on transport. A SocialAPI job skips Meta profile enrichment and Meta media
  download, both of which need a Meta token the row does not hold, so a SocialAPI customer has no
  display name yet and media renders through `formatInstagramMessage` as
  `[Instagram <type> attachment]`. The `ephemeral` image this spike could not fetch therefore
  reaches the merchant as a visible marker rather than being silently dropped.
- Routing is one pinned account, not account lookup: `SOCIALAPI_PINNED_ACCOUNT_ID` plus
  `SOCIALAPI_PINNED_INTEGRATION_ID`, with `npm run spike:socialapi -- pin --execute` creating or
  re-pointing the `ig_dm` row. With either variable unset the route stays observation-only. S1
  replaces this with the indexed `providerAccountId` column.
  **Superseded later on 2026-09-09:** both variables are gone and the route resolves
  `data.account_id` through `Integration.providerAccountId`. `pin --execute` now writes that
  column, so it remains the way a controlled row is created. The rest of this record stands.
- The thread stores the webhook's `conversation_id` in `Thread.externalSpaceId`, and an approved
  reply for a SocialAPI thread leaves through SocialAPI's conversation endpoint with the workspace
  `SOCIALAPI_API_KEY`. It shares the 24-hour window check, reply-integration routing, and outbound
  recording with the direct Meta path, skips the Meta health/permission/token gates, and is never
  retried through Meta. Send failures alert as `provider=socialapi`, so a SocialAPI outage cannot
  read as a Meta outage.
- Still absent: OAuth, `dm.sent` reconciliation, recovery and catch-up reads, health probing,
  reconnect, disconnect, deletion, capacity controls, and per-transport observability.

Deterministic coverage: 14 route tests (pinned enqueue, native-id keying, raw fallbacks, media
pass-through, unpinned and `dm.sent` no-ops, missing pinned row, queue-failure `500`), 4 normalizer
tests, 3 worker integration tests against a real database (persistence without a Meta call,
unfetchable media rendered rather than dropped, and a SocialAPI job refused against a direct Meta
row), and 4 dispatch integration tests (provider send rather than Graph, refusal without a
conversation id, refusal without an API key, and no Meta retry on failure). Full unit, integration,
node-script, typecheck, lint, knip, and doc-reference checks pass.

The dashboard integration suite went red once during this work and passed on two immediate reruns
with no code change, matching the known workspace-concurrency flake rather than anything here.

## Live end-to-end run — 2026-09-09

The first real Instagram DM to produce a Shopkeeper ticket. Merge commit `351894e8` deployed to
Railway (deep health reported database, Redis, worker, queues and iMessage healthy) and to Vercel
production. The controlled account is pinned to the `Linen & Loom` workspace, chosen because it is
the only organization holding both an active iMessage operator binding and a live Shopify
connection. Its `ig_dm` thread count was zero immediately before the send, so the thread below is
attributable to this message alone.

- A DM reading "Could you let me know where my order is" arrived as a signed `dm.received`, passed
  V2 verification, was queued, and produced thread `f161a9b1` in `open` status.
- `Customer.platformId` is SocialAPI's author id. `Thread.externalSpaceId` holds the provider
  conversation id, and `Thread.replyIntegrationId` is the pinned SocialAPI integration.
- The stored `Message.externalMessageId` is the native Instagram message id — a base64 value
  decoding to an `ig_item:...IGMessage...` identifier, confirming the native `platform_id` join
  rather than the provider interaction id, live and not only in fixtures.
- The classifier ran on the SocialAPI-originated message: tag `Order Status`, summary "Customer
  asks for the status or location of their order but provides no order number."
- The agent replied asking for an order number or checkout email, and the reply left through
  SocialAPI: the persisted `Message.providerMessageId` is a `sapi_dm_...` identifier, so outbound
  used the provider conversation endpoint and not Meta's Graph API.
- The `AgentAction` row records `send_reply`, category `communication`, status `success`, mode
  `auto_executed`, with no approver.

**Why no merchant approval was requested, and why that is correct.** The organization has
`autoExecuteMode: "off"` and `autonomyTier: "guarded"`. In `decideAutonomy`, `autoExecuteMode`
gates plans containing a **mutative** (`action` category) call. This plan's only step was
`send_reply`, which is `communication`, so it fell through to the `quick_reply` branch, which
auto-sends a single safe reply under any tier above `watch`. That is the designed shape and it
predates this work — an `auto_executed` `send_reply` is recorded on the email path on 2026-08-30.
The consequence for certification is that this run exercised ingress, classification, planning and
provider-pinned outbound, but **not** the approval leg. Proving that leg needs a DM whose plan
contains an `action`-category call — a refund or order change naming an order — which will route to
`needs_review` and reach the merchant's phone.

## Merchant connect slice — landed 2026-09-09

The pinned row was the only way a workspace could hold a SocialAPI integration. It now has a
merchant-facing connect, built but **not yet run against a live merchant OAuth**:

- One connect entry point for the channel. `/api/integrations/instagram/auth` asks
  `resolveInstagramConnectTransport` which transport the workspace is on and dispatches; the
  integrations card links there whichever answer it gets. A workspace on the SocialAPI assignment
  map can no longer reach the direct-Meta authorize URL even while `INSTAGRAM_INTEGRATION_ENABLED`
  is on for it.
- Admission is the operator assignment map, not a count. `SOCIALAPI_BRAND_ASSIGNMENTS` holds
  `clerk_org_id:brand_id` pairs and a map larger than `SOCIALAPI_MAX_ACTIVE_ORGS` (ceiling 8) closes
  connect entirely. Because brands are provisioned by hand anyway, bounding the map bounds the slots
  with no connect-time race to lose.
- SocialAPI mints the OAuth state, so ours could not ride `state`. It travels in the redirect URI as
  `attempt`, keys the sealed attempt cookie, and `runOAuthCallback` correlates on it. The provider's
  state is sealed into that cookie at connect and compared before the exchange, so both halves are
  bound and neither is taken from the browser alone. The attempt cookie is written only after the
  vendor returns an authorization URL, so an outage leaves no half-started attempt.
- The callback re-resolves the brand from the assignment map rather than trusting the callback, and
  refuses if the sealed brand no longer matches. The account is then read back **brand-scoped**,
  which is what proves it landed in the workspace's own brand; an account whose `status` is not
  `active`, or which already carries a `reconnect_reason`, is refused rather than persisted.
- `persistSocialApiConnection` decides ownership on `providerAccountId` — the column gateway ingress
  resolves — so a provider account another workspace holds is refused at connect instead of
  discovered later by a webhook resolving to two rows. It writes `accessToken: null` (a leftover
  Meta token would make the row look reachable from Meta-signed ingress), the
  `transport: 'socialapi'` metadata the worker branches on, and releases the threads of a replaced
  row rather than stranding their replies.
- Two proxy-layer gaps were found and closed in the same pass, both silent failures rather than
  errors: `/api/integrations/instagram/socialapi/callback` was not in `publicRoutePatterns` (the
  direct pattern ends at `callback`), and the SocialAPI authorize host was absent from CSP
  `form-action`, which is the 2026-08-15 failure one provider later — Chrome checks every redirect
  hop of a form submission, so the connect would have died on the popup spinner with no console
  error. The vendor domain is allowed only while `SOCIALAPI_ENABLED` is set.
- **Not built:** the "Powered by SocialAPI" disclosure and privacy link (blocked on capturing the
  live consent screen, S0), compensation for a remote account created by a failed attempt, and
  disconnect/reconnect/deletion.

**Native account id is an open gap.** Neither `POST /oauth/exchange` nor `GET /accounts` returns
Instagram's own account id or an account type. `externalAccountId` therefore holds the provider id,
recorded as `instagram.externalAccountIdSource: 'provider'`, and Professional-account eligibility
cannot be verified at connect. Nothing breaks today — ingress resolves `providerAccountId` and the
job carries the same row's `externalAccountId` back to the worker — but cross-transport account
ownership is unenforced, and is unreachable only because direct Meta is closed to new workspaces.
Vendor question 5 already asks for the native id.

Deterministic coverage: 8 connect-config tests, 5 connect-start tests, 8 callback-completion tests,
4 persistence integration tests against a real database, 2 transport-dispatch tests on the shared
auth route, plus new cases on the two shared seams this touched (`stateParam` correlation in the
callback runner, supplied-state validation in the session module) and on the proxy public-path and
CSP lists. Full unit, integration, typecheck, lint, knip and doc-reference checks pass.

## Locally verified receiver slice

The gateway now has a spike-only `POST /webhooks/socialapi` route. While no endpoint secret is
configured, it accepts only a rate-limited, small `webhook.test` registration shape and performs no
queue or persistence work. Once `SOCIALAPI_WEBHOOK_SECRET` is configured, every event—including
test deliveries—must pass the replay-bounded V2 signature check; real events must also carry a
delivery ID. Its observation log contains only event structure, counts, timestamps, and SHA-256
identifier prefixes. It deliberately does not create Shopkeeper jobs yet.

Focused route tests cover the registration gate, unsigned rejection, V2 acceptance, stale
signatures, event mismatch, required real-delivery IDs, content-free logging, and the signed-webhook
body limit. The route tests, gateway typecheck/lint/build, and integrations build passed locally on
2026-09-09. Commit `c3b8a79e` is deployed and its endpoint is registered. Two real signed
`dm.received` deliveries passed against that observation-only build; the ingress slice recorded
above supersedes the no-work behavior and is not yet deployed or live-verified.

## Approval leg — 2026-09-10

Milestone zero proved inbound and outbound but not approval: its plan was a single clarifying
`send_reply`, which `decideAutonomy` auto-sends via `quick_reply` because `autoExecuteMode` gates
only `action`-category calls. This run supplied the missing half by sending a DM whose plan had to
carry a mutative call.

**The run.** A DM on thread `f161a9b1` reading "Hi I ordered the wrong item for order 1031. Could
you refund it?" was classified `Returns`. The planner resolved the order through
`get_order_by_name` — `#1031`, `$43.48 USD`, `paid`, unfulfilled — and proposed `create_refund`,
`add_internal_note`, `send_reply`. The `action` category routed it to `needs_review`, and the card
reached the bound iMessage line 34 seconds after the DM arrived. The merchant replied `Yes`; the
turn ran as `mode: human_approved` and `pendingPlans` cleared to zero.

`create_refund` then returned `policy_block` with `code: "currency_mismatch"` on both the
currency-qualified call and a retry without one. The agent re-read the ticket and the order, and
escalated to the merchant rather than proceeding. **No customer-facing message was sent and no
completion was claimed.** A failed money movement produced an honest escalation, which is the
behavior A4 exists to guarantee and the first time it has been observed against a real provider
failure rather than a fixture.

**The blocked first attempt, and why it is the useful evidence.** The same message text planned an
hour earlier was rejected by `validatePlan` as `ungrounded_customer_reply`, making the whole plan
invalid; the phone received "nothing can run from this draft" instead of a card. The cause was not
the model overclaiming. `proposedCompletionFacts` built the refund fact's target through
`orderTarget`, which attaches the human-readable order name only from `ctx.recentOrders` —
populated from the *resolved* Shopify customer. An Instagram sender id is not a Shopify customer,
so that list was empty, the fact carried a bare numeric order id, the reply named `#1031`, and a
supported claim read as unsupported. The plan already held the name in its own `get_order_by_name`
result. Fixed in `0e5bcec0` (PR #88) by passing the turn's read results into the fact builders on
both the proposal and execution sides. The two runs are an A/B on identical message text 39 minutes
apart, differing only in the deployed commit:

| | before `0e5bcec0` | after |
| --- | --- | --- |
| `validation.status` | `invalid` (`ungrounded_customer_reply`) | `valid`, no issues |
| operator card | "I couldn't produce a safe executable draft… Nothing can run from this draft." | "Here's what I'd do: 1. Issue refund 2. Add internal note 3. Reply to the customer… Sound good?" |
| `pendingPlans` entry | present, `validation: invalid` | present, `actionLabel: "run those 3 steps"` |

**The `currency_mismatch` block, and why the first fix missed.** A 2026-09-11 re-run escalated with
the same message: "requested currency USD does not match Shopify currency CAD". A read-only probe
against the live store (`orders/{id}/refunds/calculate.json`, which prices without committing) records
the shape: order #1031 is a **USD shop** whose customer was charged **59.90 CAD**, and Shopify's
calculation answers CAD whether or not the request names a currency. So the executor's CAD was right
and the agent's USD was wrong. `afc88439` had fixed the executor and the order read but not the
instruction that produces the input: `create_refund`'s schema still asked for the amount "in the
store's currency" and for the "three-letter store currency", which is exactly what the agent sent.
The contract and the executor had been made to disagree, and the guard caught the disagreement. The
schema now asks for the currency the customer was charged and names the order-read fields that carry
it (`presentment_total_price` / `presentment_currency`, falling back to `total_price` / `currency`).

**Still open from this run**, all tracked in `to-do-list.md`: `approve_pending_plan` returning "no plan is awaiting the merchant's approval" twice
before the plan it approves executed anyway; and `AgentAction.approverId` being null on rows marked
`human_approved`. The plan also still carries `shopify_customer_unresolved` as a blocking signal —
the agent found the order but never identified the shopper, which is a separate identity problem
and the same gap that caused the grounding failure.
