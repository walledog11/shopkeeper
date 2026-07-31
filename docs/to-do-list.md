# Shopkeeper To-Do List

Open work only. This started as the production-readiness audit and has been
consolidated to the items that are still pending — completed work was removed
(it lives in git history). It now also carries the product/vision gaps surfaced
in the 2026-06-23 review.

Last reviewed: 2026-07-30.

Recently completed — detail is in git history, not here:
- Eval assertion decision and three-repeat baseline re-capture (228/228, 100%,
  up from 226/228 / 99.1%) — 2026-07-30
- Full-tier `tier-full-cancel-auto` drift fixed (cancel-only prompt rule; 3/3) — 2026-07-30
- Production migration workflow documented (`production/deployment.md`) — 2026-07-30
- Alerting doc debt corrected (Better Stack Telemetry, Railway forwarder, threshold alert rules) — 2026-07-30
- `fulfill_order` capability, eval gate (78/79) and canary execute family — 2026-07-30
- CSP nonce migration (report-only; enforcement blocked) — 2026-07-30
- Dashboard `send_reply` internal-hop 500 (operator bug 7) — 2026-07-29
- Agent behavior tracks A1–A6 and B1–B5 — 2026-07-26

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

## Security And Data Hardening

- [ ] **Harden Content Security Policy — nonce migration and enforcement blocker
  both done 2026-07-30; only the header flip remains.** The policy moved out of
  `apps/dashboard/next.config.js`
  (a static `headers()` entry cannot carry a per-request nonce) into Clerk's
  native `contentSecurityPolicy` middleware option in
  `apps/dashboard/src/proxy.ts`, with the directives in
  `src/proxy/content-security-policy.ts`. `strict: true` drops `http:`/`https:`
  from `script-src` and adds the nonce plus `'strict-dynamic'`; `unsafe-eval` is
  now dev-only. The remaining `'unsafe-inline'` is Clerk's deliberate CSP2
  fallback, which `'strict-dynamic'` makes CSP3 browsers ignore — do not "fix"
  it. `Reporting-Endpoints` is now emitted by Clerk's `reportTo`, so it was
  removed from `next.config.js`. Next 16.2 reads the nonce from the report-only
  header too (`app-render.js:167`), so propagation works before enforcement.
  - **Blocker resolved 2026-07-30 — the diagnosis was bigger than "Clerk's
    script tag."** Measured against a real production build with
    `reportOnly: false`, `/` produced **44 CSP violations and zero nonced
    script tags** — every Next chunk blocked, not just `clerk.browser.js`, and
    `window.Clerk` never loaded. Cause: `/` and `/sign-in` were **statically
    prerendered** (`○` in the route table), and prerendered HTML cannot carry a
    per-request nonce, so `'strict-dynamic'` rejected the whole bundle. The
    earlier "51 of 52 nonced" reading came from a dynamic route and hid this.
  - **Fix:** the root layout now reads `x-nonce` from `headers()` and threads it
    to `ClerkProvider` via a `nonce` prop (`app/layout.tsx`, `app/providers.tsx`).
    The client `ClerkProvider` cannot read request headers — it renders
    `ClerkScripts`, which takes the nonce from provider options — so the prop is
    required; the `dynamic` prop only helps the *server* provider, which a
    `"use client"` `providers.tsx` never reaches. That is why the earlier
    `dynamic` attempt failed. `style-src`/`font-src` also gained
    `fonts.googleapis.com`/`fonts.gstatic.com` for the `globals.css` imports.
  - **Verified:** enforced-CSP production build, headless Chromium, `/` and
    `/sign-in` → **0 violations, `window.Clerk: true`** on both (was 44 and 31
    violations, Clerk dead). Proxy unit tests 17/17.
  - **Accepted cost:** `headers()` in the root layout flips every route from
    static to dynamic (`○ /` → `ƒ /`). This is inherent — a per-request nonce and
    static prerendering are mutually exclusive — not a regression to fix.
  - Still owed: review report-only violations from deployed traffic, then flip
    `reportOnly` to `false` in `apps/dashboard/src/proxy.ts` (left `true`; the
    flip is a one-line, deploy-gated decision). Keep Clerk and Cloudflare
    challenge requirements documented.

## Known Bugs

History for the eight closed operator-channel bugs:
[archive/operator-channel-bugs.md](archive/operator-channel-bugs.md).

- [ ] **Local `next build` / `npm run typecheck` fail on stale generated route
  validators.** `apps/dashboard/tsconfig.json` includes `.next/types/**`,
  `.next-dev/types/**` and `.next-e2e/types/**`, so a deleted route leaves every
  existing dist dir's generated `validator.ts` importing source that no longer
  exists. Currently failing on the Sentry example routes removed 2026-07-30:
  `Cannot find module '../../src/app/sentry-example-page/page.js'`. CI builds
  fresh so it never sees this; it only bites locally, and it recurs on every
  route deletion. Rebuilding each dist dir clears it — the durable fix is to stop
  type-checking stale dist dirs.

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
  occurred in the failed run. **Blocked locally until `TOKEN_ENCRYPTION_KEY` and
  a decryptable palette-dev integration are available in the operator shell.**

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
