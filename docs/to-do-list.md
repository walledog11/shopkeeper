# Shopkeeper To-Do List

Open work only. Completed work is deleted, not archived — git history is the
record. Do not add "recently completed" sections to this file.

Last reviewed: 2026-08-02.

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
  and verified at 0 violations enforced on `/` and `/login` with
  `window.Clerk: true`. (Earlier notes said `/sign-in`; that route does not
  exist — the auth routes are `/login` and `/signup`.) Remaining: review
  report-only violations from deployed traffic, then flip the one line.
  - **Not yet.** The report-only traffic on `useshopkeeper.com` is days old at
    most, and the OAuth popup shell — the surface that violates
    `script-src-elem` and `form-action` — was rewritten in `59caf64a`. Do the
    Shopify connect smoke test first and read the reports it generates.
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
- [ ] Canary Postmark. Inbound is configured and proven end to end as of
  2026-08-02 (server `Shopkeeper-production`, ID 20167846); what is uncanaried is
  outbound send and bounce attribution under real traffic.
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
  - **Do not drop `read_products` with `write_products`.** "Plus their implied
    reads" is only safe for scopes the tools do not need, and `read_products`
    is one of the 15 in `SHOPIFY_OAUTH_SCOPES`. Since 2026-08-01 a shortfall
    is at least visible — the integrations card asks the merchant to reconnect
    — but it would be visible on every connected store at once.

- [ ] **Confirm a dashboard ops alert reaches Sentry in production.** The
  dashboard's three alert sources now capture to Sentry
  (`lib/server/ops-alert-notify.ts`, 2026-08-01) the way the gateway pushes to
  Telegram; only the production round-trip is unverified. Note that
  `emit-controlled-ops-alert.ts` will **not** prove it — as a standalone `tsx`
  process it never runs `instrumentation.ts`, so the capture is a no-op there.
  Use the deployed `agent_failure` trigger from
  [alerting-evidence.md](production/alerting-evidence.md).

## Product Gaps

- [ ] **Make the help content answerable by the agent, not just the dashboard.**
  The panel is reachable as of 2026-08-01, but it is a dashboard-only surface
  and "why did no tickets arrive today" is a question the merchant asks from
  their phone. The agent cannot answer it today: `SUPPORT_STABLE_PREFIX` gives
  it no product self-knowledge, so its only move is `escalate_to_human` —
  escalating to the merchant who asked. The content is already
  `Category → Article → Section`, close to `KbArticle` shape.
  - **Operator-scoped only.** Product help in the shared customer-facing KB
    means a customer asking about returns could be answered out of Shopkeeper's
    own documentation. Per the agent-change invariants that also keeps it off
    the shared registry and out of the eval gate.

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

- [ ] **Domain / branding migration (was "Phase 6").** **The code and DNS side is
  done; the external consoles and the email leg are not.** What remains is
  console-only work, reduced to
  [phase-6-external-services.md](phase-6-external-services.md) — a checklist that
  gets **deleted** once its six closing checks pass, not carried. The hosts
  architecture and the naming rule now live in `.claude/CLAUDE.md`.
  - Google's Gmail restricted-scope gate is down to the **OAuth Branding page**,
    two developer contacts, the alias canary, and the demo video. The domain,
    Search Console verification, and the support mailbox
    (`hello@useshopkeeper.com` via ImprovMX) all cleared 2026-08-02 — see
    [google-gmail-verification-packet.md](production/google-gmail-verification-packet.md).
  - **`useshopkeeper.com` REGISTERED 2026-08-02 and attached to Vercel.** Matches
    the `@useshopkeeper` handles already held on X and Instagram. Marketing on the
    apex, dashboard on `app.useshopkeeper.com`, both from the same Vercel project.
    The name "Shopkeeper" stays as a **working brand**.
  - **Telegram bot rename is cosmetic — not a blocker, not now-or-never.** The
    bot works and nothing is broken; the name shown at connect is just
    pre-rebrand. It is *not* the Shopify-scope-trim situation: that forced
    re-consent on every merchant at once, whereas this only forces a re-link on
    the `/newbot` path, and BotFather may allow an in-place username change that
    costs nothing at all. Group it with the other display-name items in
    [phase-6-external-services.md](phase-6-external-services.md).
  - **Telegram is not the primary operator surface — iMessage is**, and iMessage
    is identified by a phone number (`IMESSAGE_LINE_HANDLE`), platform-wide, with
    no username or brand string in the bind path. The rebrand does not touch it.
  - **Trademark cleared 2026-08-02 and the result is bad — proceeding knowingly.** `SHOPKEEP` (US Reg. 3936441, serial 77921264) is
    LIVE, REGISTERED, renewed through 2031, §15 incontestable, standard-character,
    owned by **Lightspeed Commerce USA** and actively maintained by outside IP
    counsel. It covers IC 042 — "operating a website providing software as a
    service (SAAS) for use with business management, namely, sales transaction
    data management … inventory management" — which is this product's class and
    increasingly its goods as order-ops and inventory modules land.
  - **There is a direct 2024 precedent.** Application `+SHOPKEEPER` (serial
    98265867, MarketNation Inc., IC 042 SaaS) was refused on 2024-08-15 under
    **Trademark Act §2(d), likelihood of confusion, citing Reg. 3936441**, and
    abandoned. Every other `SHOPKEEPER` application in software classes is also
    dead. No live `SHOPKEEPER` mark exists in software.
  - Consequence: **registering "Shopkeeper" for software is very likely refused**,
    and a stylized logo does not help — SHOPKEEP is a standard-character mark, and
    the refused `+SHOPKEEPER` was itself a composite. The one live IC 042 mark
    containing the word (`NIMBLY THE SNAPPY SHOPKEEPER`, 87465478) survives because
    an arbitrary coined term dominates it.
  - **Decision 2026-08-02: option (c) — operate unregistered, as a working brand.**
    Rationale: ~10 rounds of name search established that the `.com` namespace is
    closed for anything pronounceable (~400 candidates checked, one free result),
    the alternatives all scored worse, and the real blocker on this list is
    merchant #1 — which does not require a final name. Accepting: the mark can
    never be owned, there is no recourse against a copycat, and Lightspeed could
    ask us to stop. **Mitigations: no paid acquisition and no press launch under
    the name; revisit at ~50 paying merchants or before any marketing spend,
    whichever comes first.** A domain change after Gmail verification means
    redoing restricted-scope review *and* the CASA assessment, so treat that
    revisit as a real decision point. Get a trademark attorney before spending on
    the brand; the facts above are public-record, not legal advice.
  - Names screened and rejected en route: Creance came back **clean** at USPTO
    (nothing in IC 009/035/042) if a rename is ever forced — it is the known-good
    fallback. Daiko was blocked by DAIKIN's standard-character IC 042 registration.
  - **Domain migration DONE 2026-08-02 and verified.** Apex serves marketing,
    `app.useshopkeeper.com` serves the dashboard, both from the same Vercel
    project. Verified live: `APP_URL`/`NEXT_PUBLIC_APP_URL` both
    `https://app.useshopkeeper.com` (the latter confirmed baked into the client
    bundle), zero stale `dashboard-shopkeeper.vercel.app` references,
    `hello@useshopkeeper.com` rendering on `/privacy`, gateway env contract OK.
    Shopify/Meta/Google redirect URIs and Railway `DASHBOARD_URL` updated.
    Re-verified 2026-08-02 against the deployed app: apex `/`, `/privacy`,
    `/terms` and `app.` `/login`, `/signup` all 200; `pk_live_` in the client
    bundle; apex homepage links `/privacy`.
  - **Remaining, none of it code:** a Postmark sender signature for outbound,
    Google OAuth **Branding** (still the old host), the Clerk production webhook,
    the Shopify scope trim + connect smoke test, the Telegram bot migration, then
    the demo video. Search Console, the apex mailbox, the domain, and the whole
    **Postmark receive path incl. bounces** are done.
  - **Unverified seam: the signup funnel starts on the apex.** `/login` and
    `/signup` are not in `CANONICAL_HOST_PATH_PATTERNS`
    (`apps/dashboard/src/proxy/canonical-host.ts`), and every marketing CTA is a
    relative `/signup`, so a merchant signs up on the apex and is redirected
    cross-host to `app.` at `/onboarding`. Clerk production cookies should be
    domain-wide on `.useshopkeeper.com` and survive it, but this is the same
    host-split shape that broke every OAuth connect in `034d60e4`. Verify in a
    browser, or add both paths to the canonical list.

- [x] **Clerk migrated dev → production, 2026-08-02.** The live instance was a
  *development* one (`pk_test_…` on `premium-goblin-44.clerk.accounts.dev`).
  Now: production instance `ins_3HNf1c6BNEOk38K6QIBoY8j1RG9` on
  `useshopkeeper.com`, Frontend API at `clerk.useshopkeeper.com`, `pk_live_`/
  `sk_live_` set across Production/Preview/Development (deliberate choice — all
  three point at production), Google social connection configured with our own
  OAuth client (a *separate* client from the Gmail one, so the restricted-scope
  review isn't disturbed). Five CNAMEs added in Vercel DNS: `clerk`, `accounts`,
  `clkmail`, `clk._domainkey`, `clk2._domainkey`. DNS/SSL/mail all verified
  complete via `clerk deploy status`.
  - **Users and orgs did NOT transfer** — dev and production instances have
    separate databases. `getOrCreateOrg()` maps Clerk org IDs to `Organization`
    rows, so any pre-existing rows are now orphaned. Re-onboard from scratch.
  - **Landmine — do not misdiagnose this:** `curl .../dashboard` returns **404,
    not a redirect**, on *both* instance types. Clerk's `auth.protect()` does a
    `protect-rewrite` to `/_not-found` to hide protected routes from
    unauthenticated clients. Only the `x-clerk-auth-reason` header differs
    (`dev-browser-missing` → `session-token-and-uat-missing`). It is not a bug
    and it is not a dev-instance symptom; verify auth in a browser.
  - **Still open:** `CLERK_WEBHOOK_SECRET` is absent and the production webhook
    endpoint does not exist yet. Create it in the Clerk dashboard pointing at
    `https://app.useshopkeeper.com/api/webhooks/clerk`, then set the secret in
    Vercel. The CLI cannot create webhook endpoints (`clerk webhooks` only
    streams/verifies locally).
    - What this actually breaks is **deletion propagation, not membership
      creation.** `api/webhooks/clerk/route.ts` handles exactly three events —
      `organization.deleted`, `user.deleted`, `organizationMembership.deleted` —
      while creation happens on demand via `getOrCreateOrg()`. So onboarding
      works; what fails is revocation: someone removed from a Clerk org keeps
      their `OrgMember` row, and with it their Telegram binding and operator
      access. Worth closing before a real merchant, but it is not an onboarding
      blocker.
  - **Also open:** the Development scope stored `CLERK_SECRET_KEY` as
    *non-sensitive* (readable via `vercel env pull`) while Production and Preview
    marked it sensitive. Tighten it. And the leftover Clerk application named
    `clerk` (`app_3B9VBBAVoAaZGLuVuV5Ldw3atCJ`, dev-only, from the old product
    name) should be deleted once confirmed unused.

- [ ] **Production env gaps found 2026-08-02** by
  `check-production-env.mjs` run against pulled Vercel/Railway values:
  - `CLERK_WEBHOOK_SECRET` is **absent entirely** in Vercel production, so
    `/api/webhooks/clerk` cannot verify signatures and org-membership sync is
    dead. Fix as part of the Clerk production migration above.
  - `PRICE_ID_STARTER` and `PRICE_ID_PRO` are **missing** — only a legacy
    `PRICE_ID` exists. Billing tiers are not fully wired.
  - ~~`INBOUND_EMAIL_DOMAIN` placeholder~~ — fixed 2026-08-02, now
    `inbound.useshopkeeper.com` with MX live and verified.
  - Gateway warning: `REDIS_URL` is not using the TLS `rediss://` form, and
    customer message payloads move through BullMQ over it.
  - **Tooling caveat — corrected 2026-08-02.** `vercel env pull` redacts
    sensitive vars to an **empty string**, not the literal `[SENSITIVE]` an
    earlier note claimed. That is strictly worse: empty is indistinguishable
    from unset, so a pulled file cannot tell you whether a var is missing or
    merely hidden. Observed `NEXT_PUBLIC_APP_URL=""`, `CLERK_SECRET_KEY=""`,
    `TOKEN_ENCRYPTION_KEY=""` on a pull — all three demonstrably have values.
    - **Use `vercel env ls <env>` presence as the reliable check**, never a
      pulled value. The three findings above were re-verified that way on
      2026-08-02 and are genuine absences.
    - For format/content checks, run the checker as a Vercel build step where
      real values are injected.

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
