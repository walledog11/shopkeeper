# Shopkeeper To-Do List

Open work only. Completed work is deleted, not archived — git history is the
record. Do not add "recently completed" sections to this file.

Last reviewed: 2026-08-13.

Single source of truth for **actionable** open work. Evidence checklists, console
residue, failure-drill procedures, and standing policies live in the linked docs
below — not duplicated here.

Work is grouped by **what kind of action** it needs, not by when it was filed.

**Guiding principle for pending integrations.** Shopkeeper is still in active
development — channels and features are being added, not finalized. Pending
integrations (Instagram DM, TikTok, WhatsApp) are work to *finish and build*,
not removal candidates. Frame their tasks as "build/finish," and treat
onboarding sequencing as ordering channels behind the v1 wedge — never as
dropping or de-advertising a channel.

Not a removal candidate is not the same as next in line. WhatsApp is
deprioritized as of 2026-08-07 — it is a merchant-control channel, so it adds a
third route alongside Telegram and iMessage rather than new customer reach, and
US penetration is low in the target market. Do not propose it as the next
channel to build. See [product-truth.md](product-truth.md) §2.

---


## Build

Code work that is started and not finished.

- [ ] **Storefront chat — the merchant half.** The safety half is done and live in
  production on one controlled dev store (`palette-dev-3peukw16.myshopify.com`,
  `guarded`/`off`): transport, guest tool policy, both kill switches, the spend
  budget, the integration-card toggle, and M1.5 emailed-code order verification.
  The full loop is proven live, including the strong form of the disclosure test.
  **What blocks a second store is now the merchant's experience, not the
  shopper's.** Every storefront message arrives as an approval card ending in
  "Good to send?" — including a verified shopper's read-only "where is my order",
  which teaches a merchant their agent needs supervision to state a fulfillment
  status. Fix notification shape first: routine and safe → act, then report in one
  line; genuine uncertainty → one question about the uncertain thing; risky or
  irreversible → the card. Then the silent dead-email-integration failure, merchant
  alerting on budget exhaustion, the session and `storefront_chat_daily_usage`
  sweeps, the approval-mode local acknowledgement, and the rest of the test plan.
  **The eval gate is red** — 13 fixtures failing or flaky since 2026-08-08, seven
  at 0/3, all pre-existing rather than storefront damage; the stale 2026-07-30
  baseline is deliberately kept because red is the accurate reading. Fix the
  thirteen, add the `shopify_chat` guest fixture, then capture. **Do not enable a
  real merchant workspace until notification shape and the operability items
  land**; the original budget-and-kill-switch condition is met. Full status and
  spec:
  [shopify-storefront-chat-implementation-plan.md](shopify-storefront-chat-implementation-plan.md).
  Evidence and incident history:
  [storefront-chat-verification-2026-08.md](production/storefront-chat-verification-2026-08.md).
- [ ] **Bounded conversation context and cross-channel memory.** Keep persistent
  shopper identity separate from short conversation episodes; plan from the
  newest request and retrieve only verified, relevant history or open
  obligations. Full implementation sequence:
  [conversation-context-and-cross-channel-memory-plan.md](conversation-context-and-cross-channel-memory-plan.md).
- [ ] **Conversation-to-sale attribution.** Connect meaningful storefront-chat
  interactions and product recommendations to later Shopify orders so merchants
  can distinguish direct, product-assisted, and chat-assisted revenue. Report it
  as attribution rather than proof that the conversation caused the purchase.

---


## Prove in prod

Shipped code that needs a production canary, observation window, or configured
provider. **None of these is a code task.**

- [ ] **Postmark outbound canary.** Send and bounce attribution under real
  traffic. Inbound is proven end to end as of 2026-08-02 (server
  `Shopkeeper-production`, ID 20167846). Account approval, sender setup, and
  smoke steps live in
  [phase-6-external-services.md](phase-6-external-services.md) (Postmark
  section).
- [ ] **Instagram Advanced Access.** Implementation and Standard Access acceptance
  are complete. Launch gated on Meta App Review and a non-role merchant account
  completing the full DM loop (connect → inbound → approve reply →
  disconnect/reconnect). Ops in [runbook.md](production/runbook.md).
- [ ] **One Shopify order event, delivered exactly once.** Step 5 of
  [shopify-webhook-migration.md](production/shopify-webhook-migration.md), still
  unperformed. Per-shop subscriptions were deleted in favour of app-level
  declaration (`e7d881c9`), and the audit confirms the connected store now carries
  `total=0` shop-specific subscriptions — so app config is the **only** delivery
  path, and a wrong declaration means the shop receives nothing rather than
  everything twice. That failure is silent in exactly the way the topic-name bug
  already was once, and nothing persists a Shopify webhook receipt, so a real order
  event on the dev store is the only thing that can close it.
- [ ] **Guest escalation that keeps its reply, exercised live.** The regression
  where guest order questions escalated with no reply at all was fixed by passing
  `keepReply` into `applyEscalationRouting` — but **the router-materialized path
  has still never fired in a live test**. The one live card that showed a reply and
  a handoff together came through a *model-elected* escalation, which was the path
  that already worked. Storefront chat, dev store. Background:
  [storefront-chat-verification-2026-08.md](production/storefront-chat-verification-2026-08.md).
- [x] **Realtime inbox (SSE + Redis pub/sub).** Decision 2026-08-06: finish and
  enable, not delete. Both gates are set and the canary passed **2026-08-07**:
  Railway `GATEWAY_REALTIME_ENABLED=true`, Vercel
  `NEXT_PUBLIC_GATEWAY_EVENTS_URL=https://clerk-production-e37f.up.railway.app`
  inlined into the serving build (`NEXT_PUBLIC_*` is build-time, not a runtime
  flip). Evidence: `realtime:smoke` PASS against prod (delivery *and* cross-org
  non-delivery); `[Realtime] Subscribed channel:"realtime:thread"` in the
  `shopkeeper` service logs; live `connect-src` on `app.useshopkeeper.com`
  includes the gateway origin; and a signed-in browser on `/dashboard/tickets`
  refetched `/api/threads` within a second of a publish, against a 20s control
  window with zero requests — so the merchant-facing `RealtimeProvider` stream
  is live, not just the transport. Rollback: unset the Vercel var and redeploy;
  polling returns to 15s. **Failure mode to watch:** if SSE cannot connect,
  `RealtimeProvider` retries silently forever while polling has already slowed
  to 60s/120s — the inbox gets slower with nothing surfaced, so check the logs
  before walking away. Standing cost traps: never hold SSE on Vercel functions;
  never use Postgres `LISTEN/NOTIFY` (pins a Neon connection). **No longer
  gates M1 of**
  [shopify-storefront-chat-implementation-plan.md](shopify-storefront-chat-implementation-plan.md).

  Re-running the smoke needs prod Redis over the `REDIS_PUBLIC_URL` TCP proxy —
  the gateway's own `REDIS_URL` is `redis.railway.internal` and never resolves
  from a laptop — plus `NODE_ENV=production` so `loadGatewayEnv` does not
  override it with the local `.env`:

  ```
  cd apps/gateway
  REDIS_PUB=$(railway variables --service Redis --json | node -e '…REDIS_PUBLIC_URL…')
  NODE_ENV=production railway run --service shopkeeper -- sh -c \
    "NODE_ENV=production REDIS_URL='$REDIS_PUB' npx tsx src/scripts/realtime-smoke.ts \
     --org-id=<prod org> --url=https://clerk-production-e37f.up.railway.app"
  ```
- [x] **Dashboard ops alert → Sentry.** Production round-trip verified
  2026-08-07 via deployed `agent_failure` trigger (`POST /api/agent`, no
  approved plan). Evidence in
  [alerting-evidence.md](production/alerting-evidence.md). Spot-check the
  Sentry issue in the UI if you want a second pair of eyes — local CLI tokens
  are `org:ci` only.

---


## Console / config

External consoles, env vars, and provider dashboards. No application code.

**All brand, domain, OAuth branding, Postmark approval, Clerk/Shopify/Meta
display names, Telegram migration, and Gmail restricted-scope packet work:**
[phase-6-external-services.md](phase-6-external-services.md). Delete that file
when its closing verification passes. Re-verify env presence with
`vercel env ls production` — `vercel env pull` redacts sensitive vars to an
empty string, indistinguishable from unset.

- [ ] **Confirm the connected store survived app version 9.** `shopify.app.toml`
  shipped 2026-08-07 as `shopkeeper-production-9`, adding `write_app_proxy` and
  the `[app_proxy]` block (M0a and M0b, both closed). Two console checks were
  never done: whether the one connected production store shows the new scope as
  granted or backfilled, and whether it raised a re-authorization prompt. Also
  still owed from M0b — the merchant-facing explanation of that prompt, which
  was supposed to be written *before* deploying. `-8` remains re-releasable;
  reference in
  [production/shopify-app-config-reference.md](production/shopify-app-config-reference.md).
- [ ] **Shopify compliance webhooks are declared nowhere.**
  `customers/data_request`, `customers/redact`, `shop/redact` have no handlers
  in the repo, no app-level declaration, and no per-shop registration —
  confirmed against the 2026-08-07 config export. Pre-existing, inherited by M0a
  rather than caused by it, and **blocking for App Store distribution**. Fix is
  handlers first, then declare the topics; pointing them at `/webhooks/shopify`
  would fail silently against its topic allowlist.

---


## Parked / decide

Built or decided-deferred. No active build work unless you explicitly choose to
resume. Gated-off integrations cost nothing to keep dark.

- [ ] **TikTok Shop disposition.** Wired end to end behind
  `TIKTOK_SHOP_ENABLED=false` with tests; never validated in prod. Decision —
  configure and enable, or cut — not more adapter code. If pursued: TikTok Shop
  app approval, seller authorization, multi-merchant SaaS support, prod config.
  Confirm Customer Service API availability for US merchants and third-party
  SaaS in Partner Center. Keep TikTok Shop buyer messages separate from generic
  TikTok DMs (no generic-DM adapter exists).

**Resume when triggered** (not open checkboxes):

| Trigger | Work | Where |
| --- | --- | --- |
| Privacy policy ships | PostHog Phase 5: staging payload review, then `PRODUCT_ANALYTICS_ENABLED=true` | [posthog-reports.md](production/posthog-reports.md) |
| Two-tier billing ships | Create Stripe `PRICE_ID_STARTER` / `PRICE_ID_PRO` and set in Vercel production | [phase-6-external-services.md](phase-6-external-services.md) (Stripe) |
| Redis TLS migration | Gateway `REDIS_URL` → `rediss://` on both services | [compatibility-retirement-backlog.md](compatibility-retirement-backlog.md) |
| Paid beta | Better Stack Level 1 log drains + escalation (free tier done 2026-07-31) | [runbook.md](production/runbook.md), [alerting-evidence.md](production/alerting-evidence.md) |

**Decisions on record** (not tasks): operate "Shopkeeper" unregistered
(2026-08-02); revisit trademark at ~50 paying merchants or before marketing
spend. Sync outbound email remains the rollback rail until async recovery
exercises complete — policy in
[compatibility-retirement-backlog.md](compatibility-retirement-backlog.md), not a
checkbox here. Email stale-claim / manual-retry drills:
[alerting-evidence.md](production/alerting-evidence.md),
[runbook.md](production/runbook.md).

---


## Reference docs

- [compatibility-retirement-backlog.md](compatibility-retirement-backlog.md) —
  read before renaming any BullMQ queue or job string.
- [phase-6-external-services.md](phase-6-external-services.md) — console-only
  brand/domain checklist; delete when closing verification passes.
- [production/pre-release-validation-2026-08-04.md](production/pre-release-validation-2026-08-04.md) —
  2026-08-04 production validation evidence.
- [production/gmail-rollout-evidence-2026-07-29.md](production/gmail-rollout-evidence-2026-07-29.md) —
  Gmail native inbound soak (scheduled observation closed 2026-08-07).
- [production/posthog-reports.md](production/posthog-reports.md) — PostHog report
  definitions and provisioning.
- [production/runbook.md](production/runbook.md) — ops, monitors, channel rollout.
- [production/alerting-evidence.md](production/alerting-evidence.md) — controlled
  alert triggers and verification cheatsheet.
