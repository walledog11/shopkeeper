# Shopkeeper To-Do List

Open work only. This started as the production-readiness audit and has been
consolidated to the items that are still pending — completed work was removed
(it lives in git history). It now also carries the product/vision gaps surfaced
in the 2026-06-23 review.

Last reviewed: 2026-06-24.

Roadmap for agent-core extraction and module expansion lives separately in
[core-extraction-and-module-expansion-plan.md](core-extraction-and-module-expansion-plan.md);
this file is the near-term task list.

## Pre-Release Blockers

Do these before treating production as ready.

- [ ] **Confirm production alerting is live, not just implemented.** Ops-alert
  instrumentation is complete ([operational-guardrails.md](production/operational-guardrails.md)
  Phases 0–4); remaining work is Phase 5 / Better Stack Level 1. Without this,
  `opsAlert` logs are emitted but nothing is listening.
  - [ ] Better Stack team + escalation policy for the launch owner
  - [ ] Vercel log drain → Better Stack (dashboard)
  - [ ] Railway log drain → Better Stack (gateway)
  - [ ] Log alert rules: `opsAlert` + each of the four `category` values
    (`queue_health`, `webhook_signature`, `provider_send`, `agent_failure`)
  - [ ] Uptime monitors: dashboard `/api/health`, gateway `/health/deep`,
    gateway `/health/queues`
  - [ ] Controlled alert validation per category
    (`npm run verify:production:alerts` or runbook steps)
  - [ ] Kill switch: verify `OPS_ALERTS_ENABLED=false` silences threshold alerts
    on dashboard and gateway
  - [ ] Sign-off recorded in [alerting-evidence.md](production/alerting-evidence.md)
  - Procedure: [runbook.md](production/runbook.md) (External Monitors, Ops Alert
    Log Routing, Controlled Alert Validation). Deploy with default thresholds;
    tune only after observing real traffic.
  - **Prep done (2026-06-24):** verification tooling confirmed functional and
    consistent with the docs — `scripts/verify-production-alerts.mjs` (dry-run
    clean against the live URLs) plus both `emit-controlled-ops-alert.ts` helpers;
    no code changes needed. Production health baseline re-verified live (dashboard
    `/api/health`, gateway `/health/deep` + `/health/queues` all green) and
    recorded in [alerting-evidence.md](production/alerting-evidence.md), which now
    also carries a per-category controlled-trigger cheatsheet — including the drain
    caveat that the emit helpers log to local stdout, so only deployed-process
    triggers reach Better Stack (`provider_send` is therefore counter-only). Also
    closed a latent BullMQ footgun surfaced during the baseline check: `aiSummary`
    was missing from `DEFAULT_QUEUE_OPTIONS` in
    `apps/gateway/src/clients/gateway-queues.ts`, so the read-path queue
    constructor now carries the same `attempts`/`removeOnFail` as the producer.
    **Still open (all sub-items above):** the Better Stack console config (log
    drains, alert rules, uptime monitors, escalation policy) and controlled
    validation in a prod window — none of that is done, so this blocker stays
    unchecked.

- [x] **Finish the billing write-gate route sweep.** Shared write-gate for
  `past_due` and `canceled` orgs lives in
  `apps/dashboard/src/lib/billing/write-gate.ts` and
  `apps/gateway/src/billing/write-gate.ts`, applied via
  `requireBillingWriteAllowed` on `withOrgRoute`.
  - Gated before the sweep: outbound messaging, internal outbound messaging,
    auto-ack, agent plan/execution/chat/quick-approve/voice, org settings writes.
  - Added in the sweep (paid value — LLM spend, external writes, or provisioning):
    `POST /api/agent/ask`, `POST /api/ai/summary`, `POST /api/threads/shopify`,
    `PATCH /api/shopify/customer`, `POST /api/shopify/customers`,
    `POST /api/kb/bases`, `POST /api/kb/bases/[id]/articles`, `PATCH /api/kb/[id]`,
    `POST /api/integrations`, `POST /api/integrations/imessage`,
    `POST /api/integrations/shopify/kb-sync`, `POST /api/integrations/telegram`.
  - Deliberately left ungated, so a lapsed org can still recover and isn't
    trapped: inbound webhooks (clerk/email/meta/`billing/webhook`),
    `billing/checkout` + `billing/portal` (the path to fix billing), OAuth
    `*/auth` + `*/callback` redirect handshakes, all disconnects/teardown/deletes
    (`integrations/[id]` DELETE, telegram DELETE, KB deletes, `agent/sessions`
    DELETE, `org/data`), inbox organizing (thread status/tag PATCH, bulk,
    presence), and lightweight bookkeeping (`agent/actions/feedback`).
    `integrations/instagram/connect` is dev-only (404 in prod).
  - [x] Regression tests: `apps/dashboard/src/app/api/billing-write-gate.test.ts`
    asserts every newly gated route returns the gate 402 for both `past_due` and
    `canceled`. Mechanism is also covered in `apps/dashboard/src/lib/api/route.test.ts`.
  - [x] Dashboard banner for `canceled` billing state, mirroring `past_due` in
    `apps/dashboard/src/app/dashboard/(shell)/layout.tsx` (a "Reactivate" warning
    notification). The `layout.tsx` path in the original note was stale — both
    billing banners live in the `(shell)` layout's notifications array.

## Security And Data Hardening

- [ ] **Harden Content Security Policy.** Dashboard still sends
  `Content-Security-Policy-Report-Only` with `unsafe-inline` and `unsafe-eval`
  in `apps/dashboard/next.config.js`. Move toward enforcement after reviewing
  report-only violations; reduce or justify `unsafe-inline`/`unsafe-eval`; keep
  Clerk and Cloudflare challenge requirements documented. (Lower urgency.)

## Product Gaps

Surfaced in the 2026-06-23 review — divergences between the stated vision and
what ships.

- [X] **Restore cross-ticket memory.** Product principle #1 is "feel like an
  employee… real memory," but customer memory was removed end-to-end (see git
  history) and nothing replaced it. The agent now has only the per-ticket
  `thread.aiSummary`. Add the planned read-only substitute at context-build time:
  fetch the last 3 closed threads for the customer and inject their `aiSummary` +
  `tag` into the prompt (`packages/agent/src/context.ts`, `packages/agent/src/prompt.ts`).
  No new queues, no editable UI, no LLM maintenance jobs.

- [ ] **Decide TikTok's fate — build inbound or stop advertising it.** TikTok is
  stubs only, yet it's promised on the marketing site and in-app help
  (`apps/dashboard/src/app/(marketing)/_components/Channels.tsx`,
  `Integrations.tsx`, `apps/dashboard/src/app/dashboard/_components/help/content/`).
  Either wire an inbound adapter or remove the promise.

- [x] **Re-wire iMessage to an operator channel (it was built as customer-support).**
  Intent: iMessage is an *operator* channel exactly like Telegram — the merchant
  texts the agent and back; **no customer ever texts the line.** Verified divergence:
  it was actually built as a *customer-support* channel — inbound `handleImessageJob`
  → `processInboundMessage` creates `customer` tickets (same path as IG/email),
  `isOperatorChannel` excludes `imessage`, and there is no operator identity binding
  (`OrgMemberTelegramChat` has no iMessage equivalent). The transport/Photon pipeline
  and Spectrum line provisioning are sound and reusable; the routing was built down the
  wrong path. (The `OrgMemberBindToken` schema comment already names iMessage as an
  operator channel, confirming operator was always the intent.) Concrete re-wire plan:
  [imessage-operator-rewire-plan.md](imessage-operator-rewire-plan.md) — new
  `OrgMemberImessageBinding`, route inbound to the operator agent (reuse
  `executeFreeFormInstruction` + the `sms_agent` thread + `OperatorContext`), reframe
  the dashboard/marketing surfaces, and revert last turn's customer-support promotion.
  - **Done (2026-06-24):** §1 data model, §2 inbound routing, §3 binding, §4 dashboard
    surfaces (bind-token route + tests, channel reclassification, catalog/connect-body
    reframe, handle-binding UI), §5 outbound (async worker **retired** — operator
    replies send synchronously), §6 docs, §7 cleanups (legacy inbound + outbound
    customer paths deleted across gateway + dashboard; `stripMarkdown` extracted to its
    own module). Both apps typecheck/lint clean; affected tests green. Only open item:
    leave-vs-purge any pre-GA `imessage` customer threads (a data call, deferred).
  - [x] **Reframe the customer-support wording to operator** (done 2026-06-24):
    the `connect-imessage` help article and the `Channels.tsx` card + `Pricing.tsx`
    inbox bullet are now operator-framed; CLAUDE.md Channels lists iMessage under
    operator. `Features/Integrations/NavLinks` mentions were already operator-consistent.
  - Binding decided: one-time token texted to the line (reuses `OrgMemberBindToken`).

- [ ] **Build the WhatsApp adapter.** Not built. Track 5 in the roadmap — a small
  adapter on the existing Meta app (same vendor as IG DM). Slots into the same
  inbound channel interface.

- [ ] **Close the agent-capability gaps in support workflows.** The tool registry
  (`packages/agent/src/tools/registry/`) covers refunds, cancellations, order
  edits, address changes, tracking, notes, KB, stats — but a support agent is
  missing:
  - [x] Returns / exchanges (RMA) — `create_return` ships a return-only RMA via
    the GraphQL Returns API (`returnableFulfillments` → `returnCreate`, no
    refund); returns all returnable items by default or one by `variant_id`.
    Added `read_returns,write_returns` OAuth scopes (existing stores must re-auth).
    Exchanges + return labels still deferred.
  - [ ] Softer resolutions — goodwill gestures other than a full refund, which
    fights principle #3 ("one bad refund undoes months of goodwill").
    - [x] Discount code — `issue_discount` ships a single-use percentage code
      (`discountCodeBasicCreate`), capped by the new `maxDiscountPercent` setting
      (tier defaults 0/15/20/30/50; Trust level → Advanced overrides). Prompt
      steers it ahead of refunds. LLM eval gate run 2026-06-23: steer does NOT
      steal refunds; `issue-discount-goodwill-over-refund` advisory fixture 2/3.
      That gate run also surfaced and fixed an unrelated `ask_operator` over-fire
      regression — see Loose Ends.
    - [ ] Store credit + gift card — deferred; need a shared goodwill spend cap
      (likely folded into `dailyRefundCap`) before they're safe to add.
  - [ ] Fulfillment — no "mark fulfilled" / create shipment / reship-replacement
    helper distinct from `create_shopify_order`. Deferred.

## Onboarding Polish

- [ ] **Refocus the first-run flow around v1:** connect Shopify → configure email
  forwarding → see first agent reply. Onboarding still presents Gmail/Outlook
  OAuth as the primary email path instead of forwarding-first setup.
- [ ] **De-emphasize post-launch channels during onboarding.** Instagram DM is
  still a first-class channel card in
  `apps/dashboard/src/app/(onboarding)/onboarding/_components/step-channels.tsx`.
- [ ] **Add a lightweight completion/progress state.** Local step index is
  persisted in `concierge-onboarding-v1` localStorage; still need a clearer v1
  completion signal tied to Shopify + forwarding + first reply.

## Modules / Roadmap

Full detail in [core-extraction-and-module-expansion-plan.md](core-extraction-and-module-expansion-plan.md);
near-term pointers only here.

- [ ] **Order-ops (module #2): evals + autonomy.** Code-complete but
  monitoring-only — flag/notify behind `ORDER_RISK_MONITOR_ENABLED`, no autonomy,
  evals deferred (Track 3, Step 5). Write the order-ops eval fixtures when the
  behavior is worth gating, then plan how/whether it earns autonomy.

## Documentation

- [ ] **Document the final production migration workflow.** Partially covered in
  [deployment.md](production/deployment.md) (pooled `DATABASE_URL` vs direct
  `DIRECT_DATABASE_URL` for `npm run db:migrate:deploy`). Still needed: one
  consolidated section with exact env vars for Vercel, Railway, local migration
  runs, and CI.

## Loose Ends

- [x] **Watch the policy-gap `ask_operator` guard for residual over-fire.**
  `applyPolicyGapAskOperatorGuard` (added `adc503a`) deterministically strips
  `send_reply` and forces `ask_operator` when `hasMerchantPolicyGapIntent`
  (`intent.ts`) matches. The 2026-06-23 order-reference bail fixed the
  `address-change-missing-fields` misfire (verified 3/3 + regression test). The
  remaining no-order-ref over-fire (e.g. "can you ship my order to <new address>")
  is **fixed 2026-06-24**: added a `SHIPPING_ACTION_REQUEST_RES` bail in
  `hasMerchantPolicyGapIntent` — a request to ship the customer's *own*
  order/parcel ("ship my order to …", "send it to …") is an order operation and
  bails before the broad shipping-coverage regex, while object-less coverage
  questions ("do you ship to Canada", "will you deliver to a PO box") still
  force-ask. Regression tests in `intent.test.ts` (action bails false; coverage
  stays true); `intent`/`planner-safety` suites green, package typechecks/lints.
