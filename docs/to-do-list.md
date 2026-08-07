# Shopkeeper To-Do List

Open work only. Completed work is deleted, not archived — git history is the
record. Do not add "recently completed" sections to this file.

Last reviewed: 2026-08-06.

Single source of truth for open product, production, and module tasks.

Work is grouped by **what kind of action** it needs, not by when it was filed.
Read the bucket that matches how you are working today.

**Guiding principle for pending integrations.** Shopkeeper is still in active
development — channels and features are being added, not finalized. Pending
integrations (Instagram DM, TikTok, WhatsApp) are work to *finish and build*,
not removal candidates. Frame their tasks as "build/finish," and treat
onboarding sequencing as ordering channels behind the v1 wedge — never as
dropping or de-advertising a channel.

---

## Build

Code changes. Pick from here when sitting down to implement.

- [ ] **Make the help content answerable by the agent, not just the dashboard.**
  The panel shipped 2026-08-01, but "why did no tickets arrive today" is a
  question merchants ask from their phone. The agent cannot answer it today:
  `SUPPORT_STABLE_PREFIX` gives it no product self-knowledge, so its only move is
  `escalate_to_human` — escalating to the merchant who asked. Content is already
  `Category → Article → Section`, close to `KbArticle` shape
  (`apps/dashboard/src/app/dashboard/_components/help/content/`).
  - **Operator-scoped only.** Product help in the shared customer-facing KB
    means a customer asking about returns could be answered out of Shopkeeper's
    own documentation. Per agent-change invariants, keep it off the shared
    registry and out of the eval gate.

- [ ] **Customers page: show inbox people, not just Shopify.** `CustomersPanel`
  only calls `/api/shopify/customers`. Merchants who get DMs and email without a
  Shopify customer record are invisible here. Needs an org-scoped inbox/customer
  data source and UI; decide deduping against Shopify identities.

- [ ] **Wire `ProactiveMonitoringSection` to gateway runtime flags.** The
  endpoint is done (`GET /internal/runtime-flags` → `GET /api/gateway/runtime-flags`).
  Remaining: fetch flags on the Agent configure page; for each monitor toggle
  (`deliveryException`, `postResolutionFollowUp`, and eventually `orderRisk` /
  `returnLifecycle`), decide **hide when off** vs **show "not available"**, then
  implement in `ProactiveMonitoringSection.tsx`.

- [x] **Flip CSP `reportOnly` to `false`** in `apps/dashboard/src/proxy.ts`
  — enforced 2026-08-06 after report-only observation; prod header is
  `Content-Security-Policy` (not `-Report-Only`). Collector stays enabled.
  Surviving `'unsafe-inline'` is Clerk's deliberate CSP2 fallback; do not remove.

---

## Prove in prod

Shipped code that needs a production canary, observation window, or configured
provider. **None of these is a code task.**

### Core rails

- [ ] Run the strict reservation audit through the production observation window
  with no unexplained stale or `unknown` rows. (`unknown-outcome-sweep` worker
  landed 2026-07-21.)
- [ ] Exercise crash-after-acceptance / stale-processing / manual-retry email
  recovery under the documented no-resend rules.
- [ ] Canary Postmark **outbound** send and bounce attribution under real traffic.
  Inbound is configured and proven end to end as of 2026-08-02 (server
  `Shopkeeper-production`, ID 20167846).
- [ ] Keep the synchronous email rollback rail until the async canary and
  stale-claim observation window are clean. (`OUTBOUND_EMAIL_ASYNC` has never
  been enabled in production.)
- [ ] Observe provider-timeout/error telemetry through the normal canary
  windows; keep provider-specific rollback controls.

### Order-ops

- [ ] **Prod evidence** (code complete 2026-08-04; worker has
  `ORDER_RISK_MONITOR_ENABLED=1`). Confirm a production `AgentAction` row from
  the current build: `tool = 'flag_order'`, `status = 'escalated'`,
  `executed_at` after the 2026-08-04 19:49 UTC deploy. Pre-deploy rows with
  `status = 'success'` are from an earlier build and don't count. See
  [pre-release-validation-2026-08-04.md](production/pre-release-validation-2026-08-04.md);
  the webhook gateway still has the flag off, so live `orders/created` traffic is
  not admitted until launch owner flips it.
- [ ] **Backstop and alerting.** Unit-covered; observe one real hourly sweep and
  one real `opsAlert` failure path in production.

### Channel and analytics rollout

- [ ] **Gmail live canary.** Code deployed; record scheduled catch-up/renewal
  evidence and close the 24-hour health window
  ([gmail-rollout-evidence-2026-07-29.md](production/gmail-rollout-evidence-2026-07-29.md)).
  Console prep for restricted-scope review is in Console / config.
- [ ] **Instagram Advanced Access.** Implementation and Standard Access acceptance
  are complete. Launch gated on Meta App Review and a non-role merchant account
  completing the full DM loop (connect → inbound → approve reply →
  disconnect/reconnect). Ops in [runbook.md](production/runbook.md).
- [ ] **PostHog Phase 4.** Run `npm run provision:posthog-reports` against the
  production project; definitions in
  [posthog-reports.md](production/posthog-reports.md).
- [ ] **PostHog Phase 5.** Staging payload review, privacy policy deployment,
  then enable `PRODUCT_ANALYTICS_ENABLED` in production. Keep `false` until the
  privacy policy ships.

### Alerting and security gates

- [ ] **Confirm a dashboard ops alert reaches Sentry in production.** Dashboard
  alert sources capture to Sentry (`lib/server/ops-alert-notify.ts`, 2026-08-01);
  only the production round-trip is unverified. `emit-controlled-ops-alert.ts`
  will **not** prove it — as a standalone `tsx` process it never runs
  `instrumentation.ts`. Use the deployed `agent_failure` trigger from
  [alerting-evidence.md](production/alerting-evidence.md).
- [x] **CSP gate.** Report-only observation clean (2026-08-06); enforcement live
  on `app.useshopkeeper.com`.

---

## Console / config

External consoles, env vars, and provider dashboards. No application code.

### Brand and domain closeout

Tracked in [phase-6-external-services.md](phase-6-external-services.md) — delete
that file once its six closing checks pass. Code and DNS migration are done
(2026-08-02); hosts architecture lives in `.claude/CLAUDE.md`.

- [ ] Postmark sender signature for **outbound** email.
- [ ] Google OAuth **Branding** page (still shows old host).
- [ ] Telegram bot display-name migration (cosmetic; not launch-blocking).
- [ ] Gmail restricted-scope packet: OAuth branding, two developer contacts,
  alias canary, demo video — see
  [google-gmail-verification-packet.md](production/google-gmail-verification-packet.md).

### Production env

Found 2026-08-02 by `check-production-env.mjs`. Re-verify with
`vercel env ls <env>` for presence — `vercel env pull` redacts sensitive vars to
an **empty string**, indistinguishable from unset.

- [ ] `PRICE_ID_STARTER` and `PRICE_ID_PRO` — missing in Vercel production;
  only legacy `PRICE_ID` exists. Create Stripe prices and set both vars before
  enabling two-tier billing.
- [ ] Gateway `REDIS_URL` — switch to TLS `rediss://` form; customer message
  payloads move through BullMQ over Redis.

### Clerk hygiene

- [ ] Mark `CLERK_SECRET_KEY` as sensitive in the Development scope (Production
  and Preview already do).
- [ ] Delete leftover Clerk application `clerk`
  (`app_3B9VBBAVoAaZGLuVuV5Ldw3atCJ`, dev-only, old product name) once confirmed
  unused.

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

- [ ] **Realtime inbox (SSE + Redis pub/sub).** Phases 1–2 implemented behind
  flags, off by default: gateway `realtime/{publish,token,sse}.ts`, dashboard
  `RealtimeProvider` + `lib/realtime/*`. Polling stays the 60s safety net.
  Decide: finish and enable, or delete. Cost traps if resumed: never hold SSE on
  Vercel functions; never use Postgres `LISTEN/NOTIFY` (pins a Neon connection).

- [ ] **Better Stack Level 1 (log drains + escalation).** Deferred until paid beta
  (decided 2026-06-26). Free tier done: external uptime monitors and gateway
  ops-alert → Telegram verified 2026-07-31
  ([runbook.md](production/runbook.md)). Remaining is paywalled (Vercel log
  drains, Railway drain, phone/SMS paging). Checklist when resumed:
  [runbook.md](production/runbook.md),
  [alerting-evidence.md](production/alerting-evidence.md).

- [ ] **Brand / trademark revisit.** Decision 2026-08-02: operate "Shopkeeper"
  unregistered as a working brand. `SHOPKEEP` (Lightspeed, IC 042) blocks
  registration; `+SHOPKEEPER` was refused §2(d) in 2024. Mitigations: no paid
  acquisition or press launch under the name; revisit at ~50 paying merchants or
  before any marketing spend. Known-good rename fallback if forced: **Creance**
  (clean at USPTO in IC 009/035/042). Domain change after Gmail verification
  redoes restricted-scope review and CASA — treat as a real decision point. Get
  a trademark attorney before brand spend; public-record facts here, not legal
  advice.

---

## Reference docs

- [compatibility-retirement-backlog.md](compatibility-retirement-backlog.md) —
  read before renaming any BullMQ queue or job string.
- [phase-6-external-services.md](phase-6-external-services.md) — console-only
  brand/domain checklist; delete when its six closing checks pass.
- [production/posthog-reports.md](production/posthog-reports.md) — PostHog report
  definitions and provisioning for product analytics rollout.
- [production/runbook.md](production/runbook.md) — ops, monitors, channel rollout.
- [production/alerting-evidence.md](production/alerting-evidence.md) — controlled
  alert triggers and verification cheatsheet.
