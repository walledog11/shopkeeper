# Shopkeeper To-Do List

Open work only. Completed work is deleted, not archived — git history is the
record. Do not add "recently completed" sections to this file.

Last reviewed: 2026-08-01.

Roadmap for agent-core extraction and module expansion lives separately in
[core-extraction-and-module-expansion-plan.md](core-extraction-and-module-expansion-plan.md);
this file is the near-term task list.

**Guiding principle for pending integrations.** Shopkeeper is still in active
development — channels and features are being added, not finalized. Pending
integrations (Instagram DM, TikTok, WhatsApp) are work to *finish and build*,
not removal candidates. Frame their tasks as "build/finish," and treat
onboarding sequencing as ordering channels behind the v1 wedge — never as
dropping or de-advertising a channel.

## The one that matters

- [ ] **Get design partner / merchant #1.** Every remaining rollout gate below
  is blocked on real traffic and unblockable any other way — a design partner
  *is* the canary. The trust-critical engineering (durable execution claims,
  identity-checked approval, escalation-over-confidence, spend/refund caps,
  audit trail, durable operator ingestion) is done and tested to a standard most
  launched products don't meet. The failure mode to guard against now is not a
  bad refund; it is spending another month hardening rails nobody has ridden.
  - Constraint to plan around: Instagram is behind Meta App Review, so merchant
    #1 is realistically **email forwarding + Shopify + phone**.
  - Nothing operational is in the way. Monitoring and recoverability are live
    and exercised, not merely configured — evidence in
    [runbook.md](production/runbook.md) ("External Monitors", "Ops Alert Log
    Routing", "Neon PITR"). Everything still open below either needs a merchant
    to exercise it or is deliberately deferred behind a paywall.

## Pre-Release Blockers

- [ ] **Flip CSP `reportOnly` to `false`** in `apps/dashboard/src/proxy.ts`. The
  nonce migration and the static-prerender blocker were both resolved 2026-07-30
  and verified at 0 violations enforced on `/` and `/sign-in` with
  `window.Clerk: true`. Remaining: review report-only violations from deployed
  traffic, then flip the one line.
  - Do not "fix" the remaining `'unsafe-inline'` — it is Clerk's deliberate CSP2
    fallback, which `'strict-dynamic'` makes CSP3 browsers ignore.
  - Accepted cost: `headers()` in the root layout flips every route from static
    to dynamic. Per-request nonces and static prerendering are mutually
    exclusive; this is inherent, not a regression.

- [ ] **Better Stack Level 1 (log drains + escalation) — still DEFERRED until a
  paid beta (decided 2026-06-26).** Everything free is now done: two external
  uptime monitors and gateway ops-alert push to Telegram are live and verified
  (2026-07-31; both documented in [runbook.md](production/runbook.md)). What
  remains is genuinely paywalled — Vercel custom log drains need
  Pro/Enterprise, Railway has no native drain, and escalation policies and
  phone/SMS paging are Better Stack's paid tier. At one hand-held merchant,
  email plus a Telegram push is sufficient paging.
  - **When resumed**, the checklist lives in
    [runbook.md](production/runbook.md),
    [error-tracking-plan.md](production/error-tracking-plan.md) and
    [alerting-evidence.md](production/alerting-evidence.md). Prep is already
    done (2026-06-24): `scripts/verify-production-alerts.mjs` +
    `emit-controlled-ops-alert.ts` verified, live health baseline recorded,
    per-category trigger cheatsheet written.

## Rollout Gates Blocked On Real Traffic

Carried from the codebase-cleanup plan at its closeout (2026-07-30); the plan's
80 completed items are in git history. Every item here needs production traffic
or a configured provider — none is a code task.

- [ ] Canary refund, store-credit, and gift-card reservations independently;
  observe cap totals and duplicate suppression against Shopify dev stores.
- [ ] Run the strict reservation audit through the production observation window
  with no unexplained stale or `unknown` rows. (The `unknown-outcome-sweep`
  worker landed 2026-07-21; proving it against production traffic is the gate.)
- [ ] Exercise crash-after-acceptance / stale-processing / manual-retry email
  recovery under the documented no-resend rules.
- [ ] Canary Postmark once a Postmark integration is configured.
- [ ] Keep the synchronous email rollback rail until the async canary and
  stale-claim observation window are clean. (`OUTBOUND_EMAIL_ASYNC` has never
  been enabled in production.)
- [ ] Observe provider-timeout/error telemetry through the normal canary
  windows; keep provider-specific rollback controls.

- [ ] **Trim the over-granted Shopify scopes in the Partner Dashboard.** The
  `palette-dev` grant is 38 scopes; the app uses 15. Over-granted and unused by
  any tool: `write_products`, `write_inventory`, `write_shipping`,
  `write_reports`, `write_price_rules`, `write_privacy_settings`,
  `write_legal_policies`, `write_draft_orders`, `write_gift_card_transactions`,
  `read_analytics`, `read_reports`, plus their implied reads. Write access to
  inventory and shipping that nothing uses is the wrong default for a
  trust-first product.
  - **Keep `read_all_orders` deliberately** — without it Shopify caps order
    queries at 60 days and support lookups on older orders quietly fail. Needs
    Shopify approval for public apps.
  - Do it before merchant #2: changing scopes forces every connected merchant to
    re-consent, so the cost only goes up.

- [ ] **Dashboard ops alerts still go nowhere.** The gateway pushes `opsAlert`
  to Telegram as of 2026-07-31 (`apps/gateway/src/ops-alert-notify.ts`), covering
  13 of 17 call sites and verified end to end in production the same day. The
  dashboard's three — `agent_failure`
  (`lib/server/agent-failure-alerts.ts`), `provider_send`
  (`lib/server/provider-send-alerts.ts`), `provider_cleanup`
  (`api/integrations/_lib/instagram-disconnect.ts`) — remain log-only, because
  the dashboard has no `TELEGRAM_BOT_TOKEN`. Two options: a gateway internal
  route the dashboard POSTs to (it already holds `GATEWAY_INTERNAL_URL` +
  `INTERNAL_API_SECRET`), or route them to Sentry, whose `captureMessage` shape
  the existing `buildOpsAlertScope` output already matches exactly
  (`level`/`tags`/`extra`/`fingerprint`). Prefer Sentry if its DSN is live —
  no new route, no new auth surface.

## Known Bugs

- [ ] **The help panel cannot be opened.** `HelpProvider` wraps the shell and
  `HelpPanel` is mounted (`(shell)/layout.tsx`), but `openHelp` is called from
  nowhere in the app — verified 2026-08-01 by grep, the only `useHelp()`
  consumer is `HelpPanel` itself, and it only calls `closeHelp`. So ~950 lines
  of help content across eight categories are unreachable. The content itself
  was corrected and agent-name-aware as of `4eeb7628`; what remains is the
  product call — add a trigger (the top bar is the obvious home), or drop the
  feature on the grounds that the merchant can just ask the agent.

## Product Gaps

- [ ] **Decide the TikTok Shop disposition — it is built, not stubbed.** TikTok
  Shop is wired end to end and gated off by `TIKTOK_SHOP_ENABLED=false`:
  `apps/gateway/src/routes/webhooks-tiktok-shop.ts` (HMAC verify, org
  resolution, rate limit, enqueue), `apps/gateway/src/clients/tiktok-shop.ts`,
  the inbound worker, `tiktok-shop-dispatch.ts`, and the OAuth `auth`/`callback`
  routes, all with tests. No prod config; never validated end to end.
  - The decision — not more adapter code — determines whether the next step is
    "configure and enable" or "cut." Gated off it costs nothing to keep dark.
  - If it is pursued, the external gates are: TikTok Shop app approval, seller
    authorization, multi-merchant SaaS support, prod config. Confirm inside
    Partner Center that the Customer Service API is available for US merchants
    and to third-party SaaS (not partner-only), then that conversation-list,
    message-history, send, and webhook APIs exist with their scopes, retention,
    rate limits, and signature scheme. Keep TikTok Shop buyer messages separate
    from generic TikTok DMs — there is no generic-DM adapter and no verified
    public API for one.

- [ ] **Four calls left over from the dashboard UI remediation pass** (plan
  closed out and deleted 2026-08-01; the phases are in git history).
  - Remove the `Auto-plan on ticket open` toggle
    (`(shell)/agent/configure/_components/AgentDefaultBehaviorSection.tsx`)?
    It exposes internal machinery as a preference and no merchant wants it off.
  - Hide the flag-gated monitor toggles when the gateway flag is off, versus
    showing a real "not available" state?
  - The Customers page cannot show the people in the inbox — it is
    Shopify-only. Still the open item from the June 2026 cleanup.
  - An escalated ticket's list preview shows the *agent's* handoff reply, not
    the customer's complaint, because `app/api/threads/route.ts:72` loads
    `messages: take 1`. Honest but wrong-facing; fixing it is a list-query
    cost decision.
  - Small cleanup while in there: `AgentSampleRepliesSection`,
    `AgentResponseSection`, `BusinessHoursSection`, and `SpamFilterSection`
    each keep a non-`embedded` branch that no caller reaches.

- [ ] **Domain / branding migration (was "Phase 6").** See
  [phase-6-external-services.md](phase-6-external-services.md) — 51 open steps,
  barely started. The app still runs on `useclerk.co` and
  `dashboard-shopkeeper.vercel.app`, and `NEXT_PUBLIC_CONTACT_EMAIL` still
  defaults to `hello@useclerk.co`. **This blocks Google's Gmail restricted-scope
  verification**, which requires an owned, Search Console-verified custom domain
  (see [google-gmail-verification-packet.md](production/google-gmail-verification-packet.md)).
  Pick the domain first; the rest of that runbook is DNS-dependent.

- [ ] **Realtime inbox (SSE + Redis pub/sub) is built and parked.** Phases 1–2
  are implemented behind flags, off by default: gateway `realtime/{publish,token,sse}.ts`,
  dashboard `components/realtime/RealtimeProvider.tsx` + `lib/realtime/*`, with
  publish points in inbound persistence, plan generation, the thread sink, and
  intelligence. Polling stays as the 60s safety net when enabled. Decide whether
  to finish and enable it or drop it — it currently costs a flag check and dead
  code. Two cost traps if resumed: never hold SSE on Vercel functions (compute
  billed for connection lifetime) and never use Postgres `LISTEN/NOTIFY` (pins a
  Neon connection, defeats autosuspend).

## Modules / Roadmap

- [ ] **Order-ops (module #2): autonomy.** Code-complete but monitoring-only —
  flag/notify behind `ORDER_RISK_MONITOR_ENABLED`, no autonomy. Eval fixtures
  landed 2026-07-22 (`apps/gateway/src/order-ops.eval.test.ts`). The single
  remaining-work list lives in
  [core-extraction-and-module-expansion-plan.md](core-extraction-and-module-expansion-plan.md)
  — don't re-copy it here.

## Live Integration Plans

Active, still-open plans kept out of this file:

- [email-integration-plan.md](email-integration-plan.md) — Gmail/Postmark;
  Google restricted-scope verification and the live canary matrix remain.
- [instagram-integration-plan.md](instagram-integration-plan.md) — one open
  item: Meta Advanced Access approval plus a non-role merchant loop.
- [product-instrumentation-plan.md](product-instrumentation-plan.md) — PostHog
  Phase 4 run against the production project, then Phase 5 verification.
  `PRODUCT_ANALYTICS_ENABLED` stays `false` until the privacy policy ships.
- [compatibility-retirement-backlog.md](compatibility-retirement-backlog.md) —
  its "Deferred" section is a live landmine list; read before renaming any
  BullMQ queue or job string.
