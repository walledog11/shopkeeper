# Shopkeeper To-Do List

Open work only. This started as the production-readiness audit and has been
consolidated to the items that are still pending — completed work was removed
(it lives in git history). It now also carries the product/vision gaps surfaced
in the 2026-06-23 review.

Last reviewed: 2026-07-30.

Recently completed — detail is in git history, not here:
- Eval assertion decision and three-repeat baseline re-capture (226/228, 99.1%,
  up from 216/222 / 97.3%) — 2026-07-30
- Production migration workflow documented (`production/deployment.md`) — 2026-07-30
- Alerting doc debt corrected (Better Stack Telemetry, Railway forwarder, threshold alert rules) — 2026-07-30
- Agent behavior tracks A1–A6 and B1–B5 — 2026-07-26
- `fulfill_order` capability, eval gate (78/79) and canary execute family — 2026-07-30
- CSP nonce migration (report-only; enforcement blocked) — 2026-07-30
- Dashboard `send_reply` internal-hop 500 (operator bug 7) — 2026-07-29
- B4 delivery-exception watch (USPS monitor + approval loop) — 2026-07-20
- B3 return-lifecycle monitor (`ReturnWatch` + arrival approval loop) — 2026-07-20
- Operator-channel nudge parity (Telegram + iMessage) — 2026-07-20
- Live operator phone verification (Telegram + iMessage) — 2026-07-20
- P4-03 durable operator queue rollout — 2026-07-20

Roadmap for agent-core extraction and module expansion lives separately in
[core-extraction-and-module-expansion-plan.md](core-extraction-and-module-expansion-plan.md);
this file is the near-term task list.

**Guiding principle for pending integrations.** Shopkeeper is still in active
development — channels and features are being added, not finalized. Pending
integrations (Instagram DM, TikTok, WhatsApp) are work to *finish and build*,
not removal candidates. Frame their tasks as "build/finish," and treat
onboarding sequencing as ordering channels behind the v1 wedge — never as
dropping or de-advertising a channel.

## Pre-Release Blockers

Do these before treating production as ready.

- [ ] **Production alerting — DEFERRED until first real merchant / paid beta
  (decided 2026-06-26).** Ops-alert instrumentation is complete
  ([operational-guardrails.md](production/operational-guardrails.md) Phases 0–4)
  and free: `opsAlert` logs are emitted today and are readable directly in the
  Vercel and Railway log views. The only missing piece is an external listener
  (Phase 5 / Better Stack Level 1). At zero users there is no merchant to protect
  from a silent failure, and wiring the listener now hits multiple paywalls that
  aren't worth buying pre-users:
  - Vercel **custom log drains require a Vercel Pro/Enterprise plan** (blocks
    forwarding dashboard logs out).
  - **Railway has no native log drain** — exporting gateway logs needs a forwarder
    service (e.g. the Locomotive template), not a settings toggle.
  - Better Stack **free tier excludes escalation policies, sub-3-min check
    frequency, and phone/SMS paging** (escalation/on-call is the $29 tier); free
    gives email + Slack alerts and 3-day / 3 GB log retention only.
  - **Free interim option (no paywall, ~15 min):** create the 3 external uptime
    monitors (HTTP keyword checks, 3-min frequency, email alerts) against dashboard
    `/api/health`, gateway `/health/deep`, gateway `/health/queues`. This catches
    "is prod up?" without any Vercel upgrade or Better Stack paid plan. Everything
    else (log drains, log-alert rules, controlled validation, kill-switch sign-off)
    waits.
  - **Resume trigger:** first real merchant onboards or a closed/paid beta starts —
    that's when uptime matters and you'll be paying for the tiers anyway.
  - **When resumed**, the full Better Stack Level 1 checklist (team/escalation,
    Vercel + Railway log drains, four `category` log-alert rules, uptime monitors,
    per-category controlled validation, `OPS_ALERTS_ENABLED=false` kill switch,
    sign-off) lives in [runbook.md](production/runbook.md) and
    [alerting-evidence.md](production/alerting-evidence.md). Prep already done
    (2026-06-24): verification tooling (`scripts/verify-production-alerts.mjs` +
    `emit-controlled-ops-alert.ts` helpers) confirmed working, live health baseline
    recorded, per-category trigger cheatsheet written.
  - ~~**Doc debt:** stale Better Stack product name, nonexistent Railway
    log-drain setting, "keyword alert rules".~~ **Corrected 2026-07-30** in
    [runbook.md](production/runbook.md) and
    [error-tracking-plan.md](production/error-tracking-plan.md): "Logs" is now
    "Telemetry", the Railway step calls for a forwarder service (no native drain
    exists), log alerting is described as query/threshold rules on a saved chart,
    and the free-tier/paywall boundaries are recorded inline so the deferred work
    resumes with accurate instructions.

## Security And Data Hardening

- [ ] **Harden Content Security Policy — nonce migration done 2026-07-30,
  enforcement blocked.** The policy moved out of `apps/dashboard/next.config.js`
  (a static `headers()` entry cannot carry a per-request nonce) into Clerk's
  native `contentSecurityPolicy` middleware option in
  `apps/dashboard/src/proxy.ts`, with the directives in
  `src/proxy/content-security-policy.ts`. `strict: true` drops `http:`/`https:`
  from `script-src` and adds the nonce plus `'strict-dynamic'`; `unsafe-eval` is
  now dev-only. The remaining `'unsafe-inline'` is Clerk's deliberate CSP2
  fallback, which `'strict-dynamic'` makes CSP3 browsers ignore — do not "fix"
  it. `Reporting-Endpoints` is now emitted by Clerk's `reportTo`, so it was
  removed from `next.config.js`. Verified live: 51 of 52 script tags nonced,
  plus preload links. Next 16.2 reads the nonce from the report-only header too
  (`app-render.js:167`), so propagation works before enforcement.
  - **Blocker before enforcing:** Clerk's own `clerk.browser.js` `<script>` is
    server-rendered **without** a nonce, so `'strict-dynamic'` will block it the
    moment the header is enforced — breaking auth. Ruled out: the nonce is
    minted and forwarded (`x-nonce` on both request and response);
    `buildClerkJSScriptAttributes` does apply a nonce when given one
    (`@clerk/shared` `loadClerkJsScript.mjs:160`); and making `providers.tsx` a
    server component with `dynamic` on `ClerkProvider` did not fix it (reverted
    — it costs dynamic rendering and bought nothing). The nonce is lost between
    the header and `ClerkScriptTags`.
  - Still owed after that: review report-only violations from deployed traffic,
    then flip the header. Keep Clerk and Cloudflare challenge requirements
    documented. (Lower urgency.)

## Known Bugs

**None open.** All eight operator-channel bugs consolidated from the retired
`operator-channel-bugs.md` are closed — 1/2/8 fixed, 3–6 structurally eliminated
by the model-owned operator-interpretation rework, and 7 (the dashboard
`send_reply` internal-hop 500) closed 2026-07-29 with request-ID correlation and
the `npm run test:e2e:send-reply-hop` cross-service canary. Full history:
[archive/operator-channel-bugs.md](archive/operator-channel-bugs.md).

## Product Gaps

Surfaced in the 2026-06-23 review — divergences between the stated vision and
what ships.

- [ ] **Decide the TikTok Shop disposition — it is built, not stubbed.**
  Corrected 2026-07-30: the "stubs only" framing was stale. TikTok Shop is
  wired end to end and gated off by `TIKTOK_SHOP_ENABLED=false` —
  `apps/gateway/src/routes/webhooks-tiktok-shop.ts` (HMAC verify,
  signature-failure alerting, org resolution, rate limit, enqueue),
  `apps/gateway/src/clients/tiktok-shop.ts` (payload normalization +
  signature), the inbound worker, `tiktok-shop-dispatch.ts` for outbound, and
  the OAuth `auth`/`callback` routes, all with tests.
  The open item is the unresolved question from
  [vision-audit-2026-07.md](vision-audit-2026-07.md) §5: is this code the
  feasibility spike from
  [tiktok-shop-customer-service-api-spike.md](tiktok-shop-customer-service-api-spike.md)
  in progress, or did it get built ahead of that spike's answer? That decision
  — not more adapter code — determines whether the next step is "configure and
  enable" or "cut." Needs an owner call, not a guess.

- [ ] **Full-tier auto-execute is drifting — `tier-full-cancel-auto` scored 1/3
  in the 2026-07-30 baseline, down from 2/3 on 2026-07-10.** The fixture is a
  full-autonomy org with `blockCancellations: false` asking to cancel an
  unfulfilled order: it expects `cancel_order` + `send_reply`, an `auto_execute`
  classification, and both actions recorded as `auto_executed`. It is
  `advisory: true`, so it does not gate the suite — which is exactly why the
  drift needs an owner rather than a green checkmark. It is the only fixture
  that asserts full tier actually acts on its own; if it keeps sliding, "full"
  autonomy is a setting that does nothing. Which of the four assertions missed
  is not recorded — diagnose with a single-fixture probe before assuming it is
  the classifier. (When comparing runs, note `npm run test:evals` defaults to
  `EVAL_REPEATS=1` while the baseline is captured at 3, so a single miss reads
  as a 100% → 0% "regression".)

- [ ] **Complete the `fulfill_order` canary family against the live store.** The
  family landed in `scripts/canary-shopify-mutations.mjs` on 2026-07-30 and is
  verified locally (syntax, lint, both directions of the `--test-orders-only`
  guard). The first guarded run against `palette-dev` on 2026-07-30 created a
  fresh test order (ID `6126844477674`) with fulfillment receipts disabled, then
  stopped before the mutation: Shopify denied the preflight
  `Order.fulfillmentOrders` read. That exposed a real install-scope gap.
  `SHOPIFY_OAUTH_SCOPES` and its health check now include
  `read_merchant_managed_fulfillment_orders` and
  `write_merchant_managed_fulfillment_orders`, with focused tests passing.
  Remaining: ship that scope change, re-authorize `palette-dev`, and rerun
  `--execute --test-orders-only --only=fulfill_order`. The mutation call also
  carries `notify_customer: false`; no fulfillment mutation or customer email
  occurred in the failed run.

## Modules / Roadmap

Full detail in [core-extraction-and-module-expansion-plan.md](core-extraction-and-module-expansion-plan.md);
near-term pointers only here.

- [ ] **Order-ops (module #2): autonomy.** Code-complete but monitoring-only —
  flag/notify behind `ORDER_RISK_MONITOR_ENABLED`, no autonomy. **Eval fixtures
  landed 2026-07-22** (`apps/gateway/src/order-ops.eval.test.ts`: real-key-gated
  flag/no-flag judgment fixtures + an always-on deterministic no-signal skip).
  The single remaining-work list lives in
  [core-extraction-and-module-expansion-plan.md](core-extraction-and-module-expansion-plan.md)
  — consolidated there 2026-07-24; don't re-copy it here.

Durable findings from the completed agent-behavior audit (tracks A1–A6, B1–B5)
live in
[archive/agent-behavior-and-expansion-plan-2026-07.md](archive/agent-behavior-and-expansion-plan-2026-07.md).

## Documentation

No open items. The production migration workflow is documented in
[deployment.md](production/deployment.md) → **Database Migrations**: env vars per
context (production run, Vercel, Railway, local, CI), the commands, the
`migrate status` verification step, and the two incidents where a migration
lagged its code.
