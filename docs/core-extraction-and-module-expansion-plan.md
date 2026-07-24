# Shopkeeper Core and Module Roadmap

Current work only. The completed extraction and migration history is archived in
[core-extraction-and-module-expansion-plan-archive-2026-06.md](archive/core-extraction-and-module-expansion-plan-archive-2026-06.md).

Last reviewed: 2026-07-24.

## Current architecture

- `@shopkeeper/agent` owns the host-agnostic agent core, Shopify tools, planning,
  execution, and module entry points.
- The gateway runs durable inbound, planning, and module work in-process.
- The dashboard owns interactive UI flows and provider-coupled delivery.
- Host-specific locks, logging, alerts, and delivery are injected at the package
  boundary.

## Open module work

### Order operations

The order-operations module is code-complete and monitoring-only behind
`ORDER_RISK_MONITOR_ENABLED` (currently **off** in production). This is module #2
and the template for every module after it — it does not get folded into another
plan as a sweep. The single remaining-work list, consolidated 2026-07-24 from the
copies that had drifted apart in this doc, `to-do-list.md`, and the archived
behavior plan's B6:

1. ~~Add dedicated order-risk eval fixtures.~~ **Done 2026-07-22** —
   `apps/gateway/src/order-ops.eval.test.ts` gates the flag/no-flag judgment
   (real-key-gated; deterministic no-signal skip always on).
2. Validate finding persistence and webhook idempotency in production.
3. Confirm the hourly backstop and alerting behavior.
4. **Product decision:** how a flagged order enters the approval loop — is
   "hold fulfillment?" a plan the merchant approves, or notification only?
5. **Product decision:** whether and how this module earns autonomy tiers,
   given the tiers were designed against support actions.
6. Define a shadow-to-live policy before permitting system-of-record mutations.

Keep it flag-and-notify-only until the P1 execution-claim implementation is
rollout-verified, the applicable P3 mutation outcome model and cap enforcement
are proven, and P6-02 monitored replay is exercised (P4-03 durable operator
instructions are complete). Any actionable autonomy gets its own plan, its own
fixtures, and a staged rollout; enabling the existing monitor does not authorize
actions.

### Additional channel adapters

WhatsApp remains the next customer-support adapter. It should use the existing
Meta application and inbound pipeline rather than introduce a second agent
runtime or provider-specific orchestration path.

## Design constraints

- Keep the agent core host-agnostic and thread-optional.
- Add narrow injected seams only for real host differences.
- New modules must reuse the existing run, spend, policy, observability, and tool
  contracts.
- Read-only and flag-only behavior may ship behind a feature flag. External
  writes require reviewable shadow evidence and explicit rollout gates.
- Avoid a speculative plugin framework; add package entry points for concrete
  consumers.

## Source of truth

Near-term product, production, documentation, and module tasks live in
[to-do-list.md](to-do-list.md). Completed implementation detail belongs in the
archive or git history, not in this active roadmap.
