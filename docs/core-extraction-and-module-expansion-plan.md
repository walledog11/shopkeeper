# Shopkeeper Core and Module Roadmap

Current work only. The completed extraction and migration history is in git
history (archived plan deleted 2026-07-30).

Last reviewed: 2026-08-04.

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
`ORDER_RISK_MONITOR_ENABLED`, which was turned **on** in production 2026-08-04
19:49 UTC (it had been off since the module landed). This is module #2
and the template for every module after it — it does not get folded into another
plan as a sweep. The single remaining-work list, consolidated 2026-07-24 from the
copies that had drifted apart in this doc, `to-do-list.md`, and the archived
behavior plan's B6:

1. ~~Add dedicated order-risk eval fixtures.~~ **Done 2026-07-22** —
   `apps/gateway/src/order-ops.eval.test.ts` gates the flag/no-flag judgment
   (real-key-gated; deterministic no-signal skip always on).
2. Validate finding persistence and webhook idempotency in production.
   **Persistence closed locally 2026-08-04** — `order-ops-audit.test.ts` now
   drives a real `runOrderOps` run (model stubbed) through to the `AgentAction`
   row, closing the gap left by `order-review.unit.test.ts`, which mocks
   `runOrderOps` outright.
   **Idempotency: one real defect found and fixed.** The stable
   `order-review:{shop}:{orderId}` jobId only dedupes while the completed job is
   still in Redis (`PROCESSING_QUEUE_DEFAULTS`: 24h / 1000 jobs), but
   `listRecentUnfulfilledOrderIds` had no date bound — it returned the 10 most
   recent open/unfulfilled/paid orders regardless of age. An order left
   unfulfilled past the retention window was therefore re-reviewed once an hour,
   forever: repeat model spend and repeat findings. The sweep is now bounded to a
   24h `created_at_min`, matching the retention window and the backstop's actual
   job (catching a missed `orders/created` webhook).
   **Residual:** the `count: 1000` ceiling can still evict inside 24h under
   multi-org load, so a <24h-old order can be reviewed more than once. Exactly-once
   needs a persisted marker; the per-order key to guard on already exists as the
   `order-risk-review:{orderId}` instruction.
   **Prod confirmation still outstanding.** The flag was turned on 2026-08-04
   19:49 UTC. The `order-risk-review:*` rows in prod as of that moment all predate
   it and were written by an earlier build — they record `status: "success"` on
   `flag_order`, which current code never produces (`toolEscalated` →
   `TOOL_STATUS_TO_EXECUTE_STATUS.escalated` → persisted verbatim by
   `deriveStatus`). They demonstrate the thread-less shape but validate nothing
   about the code now deployed. This item closes on a row with
   `executed_at > 2026-08-04 19:49 UTC` **and** `status = 'escalated'`; the status
   is load-bearing, since `runOrderOps` only sets `flagReason` on that exact
   string, and a `success` row means the run called `flag_order` without
   registering as flagged. `order-ops-audit.test.ts` now asserts it.
3. Confirm the hourly backstop and alerting behavior. Scheduling, the flag gate,
   and the `opsAlert` failure path are unit-covered; what remains is genuinely
   production-only — watching a real sweep and a real alert fire.
4. ~~**Product decision:** how a flagged order enters the approval loop.~~
   **Decided 2026-08-04: notification only.** A flag reaches the bound operator
   channels; the merchant acts in Shopify. No plan surface, no new seam. This is
   the standing v1 answer, not a placeholder — the thread-less approval path it
   would otherwise need is the same one B5 documented as blocked, since
   `generateThreadPlan` and the approve→execute path both hard-require a pending
   customer message.
   **Notify half built 2026-08-04.** A flagged order now fans out to every bound
   operator channel via `listOperatorBindings` + `notifyOperator`, keyed
   `order-risk:{orgId}:{orderId}` so a BullMQ retry cannot text twice. Three
   things about the shape, each deliberate:
   - It fires in the worker **after** `runOrderOps` returns, not from the escalate
     sink. The sink runs inside the model loop and `run.ts` swallows what it
     throws, so a send failure there would be both invisible and unretryable.
   - Best-effort, not `critical`. A throw would fail the job and make BullMQ
     re-run the entire model review to retry a text message.
   - The body carries the model's reason **flattened, capped at 200 chars, and
     with forged `<customer_message>` tags defanged** — but not wrapped. Every
     existing `wrapUntrusted` call site wraps a model-facing string; this one is
     what the merchant reads on their phone, and literal boundary tags in an SMS
     would be a first. The defang matters because `notifyOperator` mirrors the
     body onto the operator thread (`operator-notify.ts:188`), where operator mode
     reads it back with `segregateUntrusted` off — so nothing downstream will wrap
     it, and the reason is model-authored prose over buyer-controlled order
     fields.
   **Also fixed:** `/api/orders/attention` now requires `status: 'escalated'`,
   matching what `runOrderOps` treats as a finding. It previously counted any
   `flag_order` row, which surfaced the pre-2026-08-04 `success` rows as live
   findings.
5. ~~**Product decision:** whether this module earns autonomy tiers.~~
   **Decided 2026-08-04: no — order-ops sits outside the tier system.** The tiers
   were designed against support actions with a customer on the other end, and a
   merchant who raises their tier for replies must not thereby authorize order
   mutations. `flag_order` already sets `policy.categoryPermission: false` so no
   workspace toggle can hide the fraud backstop. Any future mutating order action
   gets its own explicit gate rather than inheriting a tier.
6. **Shadow-to-live policy** (writable now that 4 and 5 are settled). Order-ops
   may not call a mutating Shopify tool at all: `runOrderOps` selects
   `READ_TOOL_NAMES` plus `flag_order`, and that restriction is the policy, not an
   implementation detail. Before any mutation is permitted, all of the following
   must hold: a shadow period with a merchant-reviewable record of what the module
   would have done; P1 execution-claim rollout verified; per-module cap
   enforcement proven; and a rollout gate **distinct from**
   `ORDER_RISK_MONITOR_ENABLED` — enabling the monitor must never authorize a
   write. Each mutating action ships with its own plan, its own fixtures, and a
   staged rollout.

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
