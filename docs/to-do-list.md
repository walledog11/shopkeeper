# Shopkeeper To-Do List

Open work only. This started as the production-readiness audit and has been
consolidated to the items that are still pending — completed work was removed
(it lives in git history). It now also carries the product/vision gaps surfaced
in the 2026-06-23 review.

Last reviewed: 2026-07-20.

Recent completions (not yet removed from history below):
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
  - **Doc debt:** [runbook.md](production/runbook.md) and
    [error-tracking-plan.md](production/error-tracking-plan.md) still describe a
    stale Better Stack ("Logs", not the current "Telemetry"), a nonexistent Railway
    log-drain setting, and "keyword alert rules" (alerts are actually
    query/threshold-based on a saved chart). Correct these when the work is picked
    up.

## Security And Data Hardening

- [ ] **Harden Content Security Policy.** Dashboard still sends
  `Content-Security-Policy-Report-Only` with `unsafe-inline` and `unsafe-eval`
  in `apps/dashboard/next.config.js`. A bounded, privacy-sanitized report
  collector and both browser reporting directives were added locally on
  2026-07-20. Deploy and review report-only violations before reducing or
  justifying `unsafe-inline`/`unsafe-eval`; keep Clerk and Cloudflare challenge
  requirements documented. (Lower urgency.)

## Known Bugs

Consolidated from the retired `operator-channel-bugs.md` (archived 2026-07-19).
Bugs 1/2/8 were fixed and 3–6 were structurally eliminated by the model-owned
operator-interpretation rework (the `lastThreadId` mechanism and keyword-skip
grammar they described no longer exist); full history is in
[archive/operator-channel-bugs.md](archive/operator-channel-bugs.md). Only one
item was still open when the doc was retired:

- [ ] **Dashboard `send_reply` internal hop returned HTTP 500 (bug 7 —
  investigate).** Observed 2026-07-07 on a free-form operator turn: the gateway
  worker `ThreadSink` POST to dashboard `/api/agent/io-send-internal` returned
  500, the agent then burned its token budget and gave the operator the generic
  "too many steps" message. Root cause not captured — the gateway log redacts
  the body, so the dashboard-side failure is unknown. Never confirmed transient
  vs systemic. **Partial fix shipped 2026-07-20:** cross-service
  `x-shopkeeper-request-id` correlation, clearer operator-facing dispatch-failure
  copy, failed approvals no longer clear the parked plan, and operator turns
  stop summarizing as "too many steps" when a send hop failed. Still open:
  pull dashboard/Vercel logs for the original incident window if it recurs.
  Pointers: [`agent-thread-sink.ts`](../apps/gateway/src/message-handlers/agent-thread-sink.ts) (hop, no delivery verify),
  [`io-send-internal/route.ts`](../apps/dashboard/src/app/api/agent/io-send-internal/route.ts) (dashboard receiver).

## Product Gaps

Surfaced in the 2026-06-23 review — divergences between the stated vision and
what ships.

- [ ] **Build the TikTok inbound adapter.** TikTok is stubs only but is already
  promised on the marketing site and in-app help
  (`apps/dashboard/src/app/(marketing)/_components/Channels.tsx`,
  `Integrations.tsx`, `apps/dashboard/src/app/dashboard/_components/help/content/`).
  Wire an inbound adapter so the channel matches what's advertised — a pending
  integration to finish, not a promise to remove.

- [ ] **Build the WhatsApp adapter.** Not built. Track 5 in the roadmap — a small
  adapter on the existing Meta app (same vendor as IG DM). Slots into the same
  inbound channel interface.

- [ ] **Close the agent-capability gaps in support workflows.** The tool registry
  (`packages/agent/src/tools/registry/`) covers refunds, cancellations, order
  edits, address changes, tracking, notes, KB, stats, return-only RMAs,
  exchanges (`create_exchange`, even-or-cheaper only), return labels
  (`attach_return_label`, merchant-supplied URL via the ask_operator loop),
  store credit + gift cards (`issue_store_credit` / `create_gift_card`, sharing
  `maxRefundAmount` and the `dailyRefundCap` goodwill pool — added 2026-07-06;
  note the new OAuth scopes mean already-connected stores must re-auth Shopify),
  and discount codes. Remaining gap:
  - [ ] Fulfillment — no "mark fulfilled" / create shipment / reship-replacement
    helper distinct from `create_shopify_order`. Deferred.

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
