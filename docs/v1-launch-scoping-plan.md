# Shopkeeper — V1 Launch Scoping Plan (support-only, pre-launch)

> Scopes the generalization/migration findings from `core-extraction-and-module-expansion-plan.md`
> and `autonomy-and-generality-plan.md` down to **what must be true before V1 serves real traffic**.
> V1 = support-only. Order-ops is module #2 and is **not** part of the V1 launch.
>
> Guiding constraint (per `.claude/CLAUDE.md`): **restraint.** Do not build abstraction ahead of
> need; do not turn this into a core refactor. Several items an unscoped reading would put in
> "must fix" are removed here *on purpose*, with the evidence that lets them defer.

**One line:** turn off the unlaunched module, keep auto-execute off, accept one documented
observability gap on the live gateway support path, and add one smoke test. Everything else defers.

---

## Status at a glance (2026-06-08)

| Item | What | Bucket | Size | State |
|---|---|---|---|---|
| **A1** | `ORDER_RISK_MONITOR_ENABLED=false` in Railway | A — launch-blocking | Small | ⬜ |
| **A2** | Confirm `autoExecuteEnabled` off for all orgs at launch | A — launch-blocking | Small | ✅ 2026-06-09 |
| **A3** | Failure-observability posture for gateway operator path (accept + document) | A — launch-blocking | Small / Medium | ✅ 2026-06-09 |
| **A4** | Confirm evals cover the V1 host; add one gateway-operator smoke test | A — launch-blocking | Small + Medium | ✅ 2026-06-09 |
| **B1–B8** | Order-ops + premature generalization + operator settings-source divergence | B — deferred | — | ⬜ defer |

---

## Two established facts (with evidence)

### Fact 1 — Order-ops is a leftover for V1; turn it off

`ORDER_RISK_MONITOR_ENABLED` defaults to **`false`** (`apps/gateway/src/config/runtime-config.ts:128`).
It is currently `true` in the gateway env. It gates exactly three things, all order-ops, all
behind the same flag:

1. **Enqueue** — `orders/created` webhook enqueues `ORDER_REVIEW` only when enabled
   (`apps/gateway/src/routes/webhooks-shopify.ts:119`).
2. **Worker** — `createOrderReviewWorker` early-returns on every job when disabled
   (`apps/gateway/src/workers/order-review.ts:27`). The worker is still *registered*
   unconditionally (`apps/gateway/src/workers/core.ts:27`) but each job no-ops.
3. **Sweep** — the hourly backstop scan early-returns when disabled
   (`apps/gateway/src/maintenance/order-risk-monitor.ts:48`).

**Support dependency: none.** The `ORDER_REVIEW` queue, the risk-monitor sweep, and the
`orders/created` branch are order-ops-exclusive. Support inbound (`INBOUND`/`AI_SUMMARY` queues,
plan generation) is independent. Turning the flag off touches zero support code.

**Clean shut-off:** set `ORDER_RISK_MONITOR_ENABLED=false` (or unset) in Railway. No code change.
The forked `runOrderOps` loop, the inline `flag_order` tool, the order-review worker, and the
sweep all go dormant — registered but idle, no LLM spend, no `AgentAction` findings.

**Recommendation: OFF.** No V1 argument for keeping it on — pre-launch means there is no traffic
to monitor, so even the "shadow data" rationale is empty. On costs real things: LLM spend on the
order-review path, order-ops findings written into the same `AgentAction` table the support feed
reads, and an unlaunched module executing in prod. Reads as a Track-3/4 development leftover.

### Fact 2 — Support can stay on the dashboard for V1; the gateway already owns one live support path irreducibly

Support execution is **already split across both hosts** — not as a forced migration, but because
each host owns the sub-paths native to it:

- **Dashboard (Vercel, `maxDuration = 60`):** ticket plan approval (`POST /api/agent` →
  `executeAgentTurn`), Concierge (`/api/agent/chat`), composer-ask (`/api/agent/ask`). Run where
  the request lands.
- **Gateway (Railway worker, no serverless ceiling):** inbound auto-plan
  (`apps/gateway/src/message-handlers/generate-thread-plan.ts`) and **Telegram operator turns**
  (`apps/gateway/src/message-handlers/execute-operator-agent-turn.ts`). Run where the webhook lands.

**No timeout-driven need to migrate dashboard support to the gateway for V1.** The dashboard has
been the execution host for dashboard-initiated support and works inside 60s. The gateway paths
exist because Telegram/inbound webhooks land there.

**Keystone evidence — gateway inbound is read-only in V1.**
`maybeAutoExecuteCurrentCachedHomePlan` returns `null` immediately when auto-execute mode is `off`
(`packages/agent/src/plan-execution.ts:182-185`), and `autoExecuteEnabled` defaults to **`false`**
(`packages/agent/src/settings.ts:41`). So with the default, gateway inbound only generates and
caches a plan (`planAgent`); the dashboard executes on approval. **The only live mutative support
path on the gateway in V1 is Telegram operator turns.**

This collapses the seam concerns an unscoped reading would flag:

- **Cross-host lock race — does not occur in V1.** Ticket threads (email/IG) mutate only on the
  dashboard (Upstash lock); operator threads (`sms_agent`) mutate only on the gateway (ioredis
  lock). Disjoint channel types, each mutated on a single host. A cross-host same-thread race would
  require auto-execute mutating a *ticket* thread on the gateway while the dashboard executes the
  same thread — which auto-execute-off prevents. The lock *logic* is already shared
  (`createRedisLockProvider`, same `RELEASE_SCRIPT`, same TTL, same fail-open in
  `packages/agent/src/lock/redis-lock.ts`); only the Redis client differs. **Nothing to reconcile
  for V1.**
- **Shadow seam — moot.** The gateway's no-op shadow recorder only matters on the auto-execute
  `shadow`/`live` paths (`plan-execution.ts:192-201`), never reached when auto-execute is off.

**What does not collapse:** the Telegram operator path is live V1 support running on the gateway,
and `buildGatewayTurnDeps` omits `recordToolFailure`
(`apps/gateway/src/message-handlers/agent-turn-deps.ts:18-23`). That observability gap is real and
is the reason A3 exists.

> **Scoping assumption to confirm:** this treats the **Telegram operator channel as in-V1** (vision
> says "Telegram now"; product principle #2 — merchant interacts from wherever they are). If
> Telegram is *also* deferred from the launch surface, the dashboard fully owns V1 support and
> **A3 drops to zero**.

---

## Bucket A — must be true before V1 serves real traffic

Support-path only. Deliberately smaller than an unscoped reading: Fact 2 removes lock-reconciliation
and shadow work entirely. They are cut on purpose, not overlooked.

### A1 — Disable order-ops for launch — *Small*
Set `ORDER_RISK_MONITOR_ENABLED=false` (or unset) in the Railway gateway env. No code change.
Disables an unlaunched module running in prod; no support dependency (Fact 1).

### A2 — Confirm auto-execute is off for V1 — *Small* — ✅ confirmed 2026-06-09
Verify no org has auto-execute on; default is `off` (`settings.ts:41`). **Keystone item:**
auto-execute-off keeps gateway inbound read-only, which moots the cross-host lock race (A-lock) and
the shadow seam — that is why those are not separate A items.

**Result (2026-06-09):** audited all 10 orgs' `Organization.settings`. The effective mode is
`resolveAutoExecuteMode = autoExecuteMode ?? "off"` (`settings.ts:534-536`), with legacy
`autoExecuteEnabled: true` migrating to `live` (`settings.ts:507-508`) — so the check covered **both**
the legacy boolean and the newer `autoExecuteMode` enum, not just the boolean the original line named.
**Every org resolved to `off`** (none `shadow` or `live`, none with the legacy boolean `true`). A2
holds; no remediation needed. Re-confirm before launch if any org edits settings in the interim.

### A3 — Failure-observability posture for the live gateway operator path — *Small (accept)* — ✅ accepted + documented 2026-06-09
`executeOperatorAgentTurn` omits `recordToolFailure`, so the per-tool failure-*rate*
counter/threshold alert (the dashboard's `opsAlert` Pino path) does not fire for operator-turn tool
failures. **Decision: accept the counter gap for V1.** The missing piece is only threshold
aggregation; individual failures are already observable on two tiers, both verified 2026-06-09:

- **Per-tool failures** (caught inside the agent loop, never propagate — `run.ts:192`) surface as
  (a) `AgentAction` error rows — `recordAgentActionsBatch` in `finish()` persists every action
  including `status: "error"` + `errorDetail`, independent of `recordToolFailure`
  (`run.ts:101-113`, `agent-actions.ts:54-59,82-83`); and (b) gateway logs —
  `logger.error "[agent] tool error"` on a throw (`run.ts:198`) plus `logger.info "[agent] tool
  result"` carrying `isError`/`status` for every call (`run.ts:225-233`).
- **Whole-turn failures** (billing gate, thread resolution, lock, any unhandled throw out of
  `executeOperatorAgentTurn`) are caught by the Telegram route handlers and logged
  `logger.error "[Telegram] Operator agent turn failed ..."` (`agent-execution.ts:82-85`,
  `pending-plan-commands.ts:60-63`). The handlers catch-and-reply rather than rethrow, so the
  BullMQ **job succeeds** — these surface through the handlers' own logging, *not* job-failure
  logging (corrects an earlier note in this doc that named BullMQ job-failure logs).

Pre-launch volume is ~0 and individual failures are already observable; only threshold aggregation
is absent. Alternative (Medium): wire an ioredis-backed failure counter on the gateway mirroring the
dashboard's. Not recommended for V1.

### A4 — Confirm evals cover the V1 host; add one gateway-operator smoke test — *Small (confirm) + Medium (test)* — ✅ done 2026-06-09
The agent-quality evals (`apps/dashboard/src/lib/agent/__evals__/runner.ts`) drive the **shared**
`coreRunAgent`. The decision loop is identical package code on both hosts; the dashboard wrapper only
injects alerting, not behavior — so agent quality is already validated for the operator path.
- **Confirmed** this equivalence.
- **Added** `apps/gateway/src/message-handlers/execute-operator-agent-turn.smoke.test.ts` — runs
  `executeOperatorAgentTurn` end-to-end against the real DB + real agent core (only the ioredis lock,
  Clerk approver, billing gate, and Shopify REST are stubbed). It asserts the thread lock is
  acquired/released, an over-cap refund is **escalated** (routed to a human, Shopify never called),
  and a correct `AgentAction` audit row is written. Passes.

> **Finding (2026-06-09), corrects an earlier note in this doc.** While writing the test I confirmed
> the live gateway operator path **does** enforce policy — an over-cap refund escalates. But the cap
> it enforces is the **guarded-tier default (`maxRefundAmount: 50`)**, *not the org's configured tier
> or refund limit*: `executeOperatorAgentTurn` calls `executeAgentTurn` **without `orgSettings`**, so
> `resolveAgentSettings(null)` falls back to the guarded tier (`settings.ts:73-87`, `534-536`). The
> dashboard path, by contrast, passes `orgSettings: params.settings` (`dashboard-approval.ts:300`).
> Net: org policy settings (tier, custom `maxRefundAmount`, `blockCancellations`) are ignored on the
> Telegram operator path; a fixed guarded posture applies instead. This is **fail-safe** (more
> restrictive than an org's likely-higher configured cap, never more permissive), so it is **not**
> launch-blocking — see B8.

**Net Bucket A:** A1/A2 are config, A3 is a documented accept, A4 is one smoke test. That is the
whole launch-blocking set.

---

## Bucket B — deferred to module #2 / #3 (evidence preserved)

Nothing here can bite V1: each item is gated by order-ops being live (A1), auto-execute being on
(A2), or a second module shipping its own tools. Held as documented debt, not V1 work.

- **B1 — Order-ops module stays dormant.** Forked loop `runOrderOps`
  (`packages/agent/src/order-ops/run.ts:49-192`, `MAX_ITERATIONS=4` vs support's 10), inline
  `flag_order` tool (`order-ops/run.ts:22-32`), order-review worker
  (`apps/gateway/src/workers/order-review.ts`), risk-monitor sweep
  (`apps/gateway/src/maintenance/order-risk-monitor.ts`), `orders/created` enqueue
  (`webhooks-shopify.ts:119`). All behind A1's flag. Resume when building module #2.
- **B2 — `runAgentLoop` extraction.** Support's `runAgent` throws for non-support contexts
  (`packages/agent/src/run.ts:311` — "thread-less module loops are not wired until Track 3"), so
  order-ops duplicated the loop, already diverging (iteration cap 4 vs 10). Only matters with two
  live loops; order-ops-off leaves one. Defer.
- **B3 — Module/namespace dimension on the registry.** Flat concat of six support-domain groups
  (`packages/agent/src/tools/registry/index.ts:45-52`); `selectAgentTools` filters by category +
  name only, no module axis (`registry/index.ts:115-127`). Bites when module #2 registers its own
  tools. Defer.
- **B4 — Rule-set policy engine.** `packages/agent/src/tools/static-policy.ts:13-55` is a fixed
  switch of refund/cancellation/custom-line-item rules — no primitive for non-financial guardrails.
  Bites when a non-support action needs a policy. Defer.
- **B5 — Register `flag_order` through the shared registry/executor.** Currently inline + forked
  dispatch; note the rationale comment (`order-ops/run.ts:78-81`) describes an executor that **no
  longer** eagerly builds `threadCtx` (`tools/executor.ts:119-132` passes `ctx` through; thread
  tools degrade via `ctx.io ? … : noThread` in `registry/thread.ts`). Stale comment; revisit
  alongside B2.
- **B6 — Full host-parity eval harness** (same fixtures across both hosts asserting identical
  side-effects). A4's smoke test covers the V1 need; the general harness waits for more hosts/modules.
- **B7 — Gateway shadow recorder** (no-op today, `agent-turn-deps.ts:25-28`). Only meaningful once
  auto-execute moves to `shadow`/`live`. Defer with the autonomy rollout — and gate it on
  documenting the **cross-host lock limitation** (dashboard Upstash vs gateway ioredis are separate
  Redis instances), which becomes a real prerequisite the moment auto-execute can mutate ticket
  threads on the gateway.
- **B8 — Operator path ignores org settings, runs on guarded-tier defaults.**
  `executeOperatorAgentTurn` (`execute-operator-agent-turn.ts:51`) calls `executeAgentTurn` with no
  `orgSettings`, so the Telegram operator turn enforces guarded-tier defaults (`maxRefundAmount: 50`,
  `requireApprovalForActions: true`) regardless of the org's configured tier/limits — unlike the
  dashboard path (`dashboard-approval.ts:300`). **Fail-safe** (more restrictive than an org's likely
  cap, never more permissive), so not V1-blocking. Fix is small (load the org's settings and pass
  `orgSettings` through, mirroring the dashboard) but is a behavior change — an org on `trusted`/`broad`
  would see its higher Telegram refund cap take effect — so it wants a deliberate decision, not a
  silent patch. Captured by A4's smoke test, which currently asserts the guarded-default behavior.

**Can any Bucket B item not wait?** No. Every one is dominated by A1 (order-ops off) or A2
(auto-execute off). The runAgentLoop fork only bites with two live loops; the registry/policy gaps
only bite when a non-support module ships; the shadow/cross-host-lock risk only bites when
auto-execute can mutate ticket threads on the gateway. All correctly defer past V1.
