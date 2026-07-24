# Agent Behavior — Open Work

What's left from the 2026-07-11 agent-behavior audit. The plan itself is done:
Track A (A1–A6, conversational operator channel) and Track B1–B5 (support-adjacent
proactive expansions) are all implementation-complete and live-verified. The full
history is in
[archive/agent-behavior-and-expansion-plan-2026-07.md](archive/agent-behavior-and-expansion-plan-2026-07.md).
B6 (order-ops autonomy) was never a behavior phase — it's module #2 and now lives
only in
[core-extraction-and-module-expansion-plan.md](core-extraction-and-module-expansion-plan.md).

Last reviewed: 2026-07-24.

## Rollout state

Code state and production state are different things; this table is the only
place that says both.

| Capability | Flag | Code | Production |
| --- | --- | --- | --- |
| Operator pending-plan queue (A6) | `OPERATOR_PLAN_QUEUE_MAX` | merged `f2778ec1` | **`1`** — single-slot parity, queue inert |
| Return-lifecycle monitor (B3) | `RETURN_LIFECYCLE_MONITOR_ENABLED` | merged 2026-07-20 | **off** (migration applied 2026-07-22) |
| Delivery-exception monitor (B4) | `DELIVERY_EXCEPTION_MONITOR_ENABLED` | merged 2026-07-20 | **off** (migration applied 2026-07-22) |
| Post-resolution follow-up (B5) | `POST_RESOLUTION_FOLLOWUP_MONITOR_ENABLED` | merged `9a686639` | **on** since 2026-07-22 |
| Order-risk fraud monitor (B6) | `ORDER_RISK_MONITOR_ENABLED` | code-complete | **off** — flag-and-notify only, no autonomy |

Per-org opt-outs, all in `Organization.settings` and surfaced on
`/dashboard/agent/configure`: `salesPulseEnabled`, `lowStockThreshold`,
`deliveryExceptionWatchEnabled`, `postResolutionFollowUpEnabled` /
`postResolutionFollowUpDays`.

## Finishable now

Nothing here waits on production traffic, credits, or another plan.

1. **A2 live phone verification.** The only Track A phase never phone-verified.
   Digest arrives → "the one from Sarah is spam" → "reply to the second: we ship
   Friday". Both must hit the model path, not the `SPAM n` / `REPLY n` fast path.
2. ~~**A1 executor coverage gap.**~~ **Done 2026-07-24.** An `executor path`
   suite in `operator-inbox-tools.test.ts` now drives both tools through
   `executeToolWithStatus` — the same entry point `run-execution.ts` uses — so
   `definition.parse` (enum, required, type, unknown-key rejection) and
   `categoryPermission` are covered, plus a guard that neither tool resolves
   without the gateway `moduleTools`. Verified by mutation: deleting the
   `status` enum fails the suite.
3. **Decision — digest spam via the model.** Trust clear intent, or always
   confirm before marking spam? Plan approval trusts clear intent; spam is
   lower-stakes and reversible, so trusting it is the consistent choice.
4. **Decision — Concierge parity for the inbox tools.** Concierge runs in the
   dashboard and can't use gateway `moduleTools`. Mirror `list_active_tickets` /
   `get_ticket` as dashboard host tools, or is the inbox UI enough there?

## Blocked, and on what

Each row names the event that unblocks it. None of these are code.

| Item | Blocked on | Unblock event |
| --- | --- | --- |
| A5's "Handled" section claiming actions definitely completed | P3-01 provider canaries | Run them one tool family at a time: `npm run canary:shopify-mutations` (inspect-only by default). **Not** blocked on store availability — `palette-dev` was confirmed as the dev store with test orders on 2026-07-20. |
| Raising `OPERATOR_PLAN_QUEUE_MAX` above 1 | P1 execution-ledger rollout verification | `npm run audit:plan-executions -- --hours=24` returning representative dashboard *and* gateway executions. It currently returns zero — there is no traffic yet. |
| Enabling B3/B4 monitors | same P1 rollout, plus the P6-02 controlled recovery exercise | as above |
| B3/B4/B5 live push verification | a real return arrival, delivery exception, or 5-day-old resolution | first real merchant traffic, or a deliberately staged fixture on the test DB |

Until its gate lands, a capability may ship only the read-only or copy-only
portion that doesn't widen the unsafe action surface. Enabling a flag does not
bypass a gate — it only exposes an already-complete path.

## Dependencies elsewhere

The systems-safety gates live in
[codebase-cleanup-plan.md](codebase-cleanup-plan.md); read status there, not
here, so it can't drift. The mapping that still matters:

| Behavior | Required cleanup work |
| --- | --- |
| Pending-plan approve/dismiss/revise/queue | P1-01…P1-03, P2-01 |
| Natural-language ticket sends from the operator channel | P4-03 (done), P5-01 (done), P4-01 for async email |
| Briefing claims about completed actions | P1/P3 committed execution outcomes |
| New mutative/proactive monitors | P1 execution claims, P3 mutation/cap work, P4 delivery durability, P6-02 queue monitoring |
