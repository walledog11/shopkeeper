# Shopkeeper To-Do List

Open work only. Completed work is deleted, not archived — git history is the
record. Do not add "recently completed" sections to this file.

Last reviewed: 2026-08-18.

Single source of truth for **actionable** open work. Evidence checklists, console
residue, failure-drill procedures, and standing policies live in the linked docs
below — not duplicated here.

Work is grouped by **what kind of action** it needs, not by when it was filed.
Deploy actions come first because everything merchant-facing is downstream of
them and they take minutes.

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


## Deploy

Release actions on the surfaces that carry code to merchants. Both are minutes
of work and both fail **silently** — that is why they sort above everything else.

"On HEAD" names three surfaces, not one: Vercel, Railway, and the Shopify app
version. As of 2026-08-18 Vercel production is `READY` on `0b43a03c`, which is
`master`. The other two are unconfirmed.

- [ ] **Confirm the 2026-08-14 migrations reached production.** Three landed that
  day — `20260814120000_add_conversation_episodes`,
  `20260814130000_add_knowledge_base_singleton_key`, and
  `20260814140000_add_shopify_privacy_requests` — and the code that reads all
  three is already serving in production. Migration-behind-code has hit this repo
  twice, two for two, and the failure is invisible from the merchant side: the
  dashboard stays healthy and an unsigned probe answers `401`, which reads as
  alive. Run from the repo root, never from inside `packages/db` — the Prisma CLI
  ignores an inline `DATABASE_URL` there and resolves the package's own env:

  ```sh
  npx prisma migrate status --schema=packages/db/prisma/schema.prisma
  npm run db:migrate:deploy
  ```

- [ ] **Run `shopify app deploy`.** The theme extension last changed 2026-08-15
  (`1f59d2b2`) and `shopify.app.toml` last changed 2026-08-14 (`79e12292`, which
  added the `compliance_topics` block). Neither reaches a storefront nor Shopify
  until an app version ships, so the live widget may be days stale and the
  compliance declarations may not exist on Shopify's side at all. This is the
  same gap that made the verification card absent from the store on 2026-08-12
  while every route behind it was live. Blocks the compliance item under
  Console / config, and the widget half of the storefront-chat rollout below.

---


## Prove in prod

Shipped code that needs a production canary, observation window, or configured
provider. **None of these is a code task.** The first item is ranked highest: it
is the only one where the failure mode is total and silent.

- [ ] **One Shopify order event, delivered exactly once.** Step 5 of
  [shopify-webhook-migration.md](production/shopify-webhook-migration.md), still
  unperformed. Per-shop subscriptions were deleted in favour of app-level
  declaration (`e7d881c9`), and the audit confirms the connected store now carries
  `total=0` shop-specific subscriptions — so app config is the **only** delivery
  path, and a wrong declaration means the shop receives nothing rather than
  everything twice. The topic strings themselves are no longer the risk: as of
  2026-08-18 `webhooks-shopify.ts` and `shopify.app.toml` agree on all five, and
  `orders/create` is correct in both places the order-ops trigger reads it. What
  remains unproven is delivery. Nothing persists a Shopify webhook receipt, so a
  real order event on the dev store is the only thing that can close it.
- [ ] **Storefront chat dev-store browser matrix.** Run Online Store 2.0 and a
  vintage theme on desktop and mobile, with the embed on and off and the Shopify
  Inbox bubble present and removed. The automated remainder is covered: real
  first-message races and thread rollover, 4,000-character truncation, uninstall
  revocation, and reply/approval/auto-execution dispatch persistence. Evidence
  and the full matrix:
  [storefront-chat-verification-2026-08.md](production/storefront-chat-verification-2026-08.md).
- [ ] **The storefront-chat episode loop, end to end on the dev store.** Item F of
  the conversation-episodes plan. Its eval half is **done** — the gate run that
  item owed was satisfied by the 2026-08-17 full recapture, which came after A, B
  and C had all landed and folded in safe-reply auto-execution. What is left is
  the live run: widget, dashboard, operator notification, and reply/approval paths
  exercised together. Closing it closes the plan file.
- [ ] **One real merchant workspace on storefront chat, in approval mode.** Toggle
  on through the integration card, theme embed activated, Shopify Inbox bubble
  removed, then the full loop verified with no ops touching metadata. Never
  exercised outside the dev store the author controls. The condition that held
  this — notification shape plus the operability items — was met 2026-08-13, so
  what remains is the rollout itself. Needs the `shopify app deploy` above first,
  or the merchant activates a stale widget.
- [ ] **Guest escalation that keeps its reply, exercised live.** The regression
  where guest order questions escalated with no reply at all was fixed by passing
  `keepReply` into `applyEscalationRouting` — but **the router-materialized path
  has still never fired in a live test**. The one live card that showed a reply and
  a handoff together came through a *model-elected* escalation, which was the path
  that already worked. Storefront chat, dev store. Background:
  [storefront-chat-verification-2026-08.md](production/storefront-chat-verification-2026-08.md).
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
- [ ] **What version 9 of the Shopify app actually grants.** No fresh install has
  confirmed the scope set, and no connected production merchant has been checked
  for the re-authorization prompt `write_app_proxy` raises. The merchant-facing
  explanation for that prompt was never written either; connected merchants are
  few enough to tell directly.

---


## Build

Code work that is started and not finished.

- [ ] **Bounded conversation context and cross-channel memory.** Keep persistent
  shopper identity separate from short conversation episodes; plan from the
  newest request and retrieve only verified, relevant history or open
  obligations. P0, P1 and items A–E have shipped; F is the live dev-store run,
  filed under Prove in prod above. Full sequence and the deferred list:
  [conversation-context-and-cross-channel-memory-plan.md](conversation-context-and-cross-channel-memory-plan.md).
- [ ] **Decide whether the spend backstop should price 1-hour cache writes
  correctly.** `LLM_PRICING` in `packages/db/llm-spend.ts` prices
  `cacheCreationPerToken` at 1.25× input on every model, and `usage.ts:48`
  hardcodes the same `1.25 *` multiplier — both are the **5-minute** TTL write
  premium. But `buildSplitCachedSystemPrompt` sets `ttl: "1h"` on the stable
  block, and all three production planner paths use it (`planner.ts:57`,
  `planner-skip-reply.ts:193`, `run.ts:214`). A 1-hour write costs 2× input, so
  cache-creation tokens are undercounted by 0.75× — against a file whose own
  comment says the backstop must never undercount. Not filed as a straight bug
  fix because correcting it raises measured spend against the shared daily cap
  and could start tripping `llm_daily_spend` for real orgs; the two files have to
  move together.
- [ ] **Conversation-to-sale attribution.** Connect meaningful storefront-chat
  interactions and product recommendations to later Shopify orders so merchants
  can distinguish direct, product-assisted, and chat-assisted revenue. Report it
  as attribution rather than proof that the conversation caused the purchase.
- [ ] **Expand confidence outside the curated coverage islands.** The audit found
  20 of 76 dashboard API routes without a colocated route test, low coverage in
  several recovery/reconciliation paths, only eight groups in the critical
  coverage ratchet, and PR browser smoke running with authentication bypass. Map
  equivalent indirect tests before adding duplicates, then prioritize tenant
  boundaries, health/realtime tokens, webhook routes, unknown-outcome recovery,
  plan execution, and a targeted real-Clerk contract on auth-sensitive changes.
  Ratchet thresholds from a clean, reproducible coverage run rather than chasing
  a repository-wide percentage.
- [ ] **Split the highest-risk multi-purpose modules along operational seams.**
  Start with `digest-briefing.ts`, `digest.ts`, `reconciliation-probes.ts`,
  `gmail-sync.ts`, `planning-notifications.ts`, and the database package barrel.
  Separate pure selection/rendering/policy code from persistence, provider calls,
  scheduling, and worker/HTTP wiring; use a registry for reconciliation probes.
  Do this after the correctness blockers above, in behavior-preserving slices with
  characterization tests, rather than as one repository-wide rewrite.

### Eval-gate residue

The gate is **green** and the baseline is current — 250/252 across 84 fixtures at
3 repeats, captured 2026-08-17 (`e9345501`, then `4037a82a`). The 2026-08-08 red
run is closed: the thirteen failures are fixed, `storefront-guest-product-search`
gives the gate its storefront coverage, safe-reply auto-execution has had its
run, and 79 of 84 fixtures now carry `classifierIntents` — so production's
`computeClassifierRouting` path is exercised, which it never was before. What is
left is small and deliberately not urgent:

- [ ] **`quick-reply-thanks-ack` passes 1/3.** The only fixture below full. Runs
  classify `needs_review` after repeated `get_order_by_name` errors and escalate.
  Advisory, so it does not gate.
- [ ] **The 1-hour stable-prefix cache TTL is unverified.** `ttl: "1h"` is set on
  the stable block in `buildSplitCachedSystemPrompt`, but no one has confirmed a
  cache hit across two plans separated by at least seven minutes with different
  thread contexts.

Runs stay expensive. Follow the
[paid model-eval workflow](production/critical-path-test-checklist.md#paid-model-backed-agent-evals):
single-fixture one-repeat probes for diagnosis, explicit approval before an
unfiltered live-key run, and no automatic tune-then-rerun loop.

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
- [ ] **Prove Shopify compliance webhooks.** The HMAC-gated handlers, durable
  data-request workflow, redaction paths and app-level declarations for
  `customers/data_request`, `customers/redact` and `shop/redact` are implemented
  and declared in `shopify.app.toml`. Both deploy halves are the Deploy section
  above — the migration and the app version. Once those land, exercise Shopify's
  compliance checks or signed production deliveries. Operator fulfillment and
  completion steps live in
  [production/data-deletion.md](production/data-deletion.md).

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

- [ ] **Storefront chat M2 — Customer Account OAuth.** Largely superseded by
  emailed-code verification, which bought the same disclosure at a fraction of the
  cost and forced no re-authorization. Keep only for genuine account binding —
  order history across orders, saved addresses — and only if a merchant asks. Two
  blockers first: the two `customer_read_*` scopes force re-authorization on every
  already-connected merchant, and the Customer Account API requires the shop to be
  on new customer accounts, so merchants on classic accounts would be permanently
  guest-only. Sketch and open questions in
  [storefront-chat-verification-2026-08.md](production/storefront-chat-verification-2026-08.md).

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
