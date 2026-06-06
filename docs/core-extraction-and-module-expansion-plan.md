# Clerk — Core Extraction & Module Expansion Plan

> Follow-on to `autonomy-and-generality-plan.md`. That plan hardened support, generalized
> the chassis, and proved (its Track 4 fraud spike) that the **substrate is module-agnostic
> but the orchestration is thread-coupled**.

This plan acts on that finding plus a strategic shift: **the product is moving from
dashboard-first to an agent reachable from anywhere** — Telegram now, WhatsApp near-term,
iMessage aspirational. That shift moves the agent's runtime home from Vercel/dashboard to the
durable gateway worker, and makes **module #2 (order operations)** the wedge that forces the
move along a safe path.

**What this plan does, in one line:** make the agent core **thread-agnostic** (Track 1) and
**host-agnostic** (Track 2), make module #2 the first inhabitant of the worker (Track 3), then
migrate the working support path last and incrementally (Track 4). WhatsApp (Track 5) is parallel.

---

## Status at a glance (2026-06-05)

| Track | What | State | Next action |
|---|---|---|---|
| **0** | Decide how the worker runs an agent (A vs B) | ✅ decided → **B** (extract core, run in-process) | — |
| **1** | Thread-optional core (3 seams) | ✅ complete | — |
| **2** | Extract core → `@clerk/agent` | ✅ gate passed (2026-06-05); baseline regenerated **156/168** | — |
| **3** | Order-ops module #2 (event-driven, flag-only, in-worker) | 🔶 code-complete + eval-confirmed (2026-06-05) | manual live e2e; Telegram notify; eval fixtures |
| **4** | Repoint support to in-process worker | 🔶 in progress (2026-06-06) — 4.0 LockProvider ✅; 4.1 orchestration moved ✅; 4.2 worker auto-plan in-process ✅ | 4.3 operator runs in-process |
| **5** | WhatsApp channel surface | ⬜ not started | parallel / later |

**Track 2 is complete (gate passed 2026-06-05).** All code moved (Phases 1–5), gateway dedup done (4/4), build/CI
wired, eval gate green at **94.6%**, baseline regenerated to **156/168**. History of the gate saga is in the
**2026-06-05 update** directly below.

**Track 3 is code-complete + eval-confirmed (2026-06-05).** The order-ops module was rebuilt on the real Track 1/2
seams and now runs **in-process in the gateway worker**: the module moved into `@clerk/agent` (new
`@clerk/agent/order-ops` subpath — `buildOrderOpsContext(orderId, orgId, escalate)` takes the injected Seam-2 sink;
`runOrderOps` gained a deterministic **pre-filter** that skips the model when there are no risk signals, and routes
`flag_order` through `ctx.escalate`); the gateway gained `QUEUE.ORDER_REVIEW`/`JOB.ORDER_REVIEW`, an
`orders/created`-webhook enqueue with a stable per-order jobId, and a new in-process `workers/order-review.ts`
(registered in `workers/core.ts`); the hourly sweep (`order-risk-monitor.ts`) was **demoted to a backstop** that
enqueues into the same queue instead of HTTP-hopping the dashboard; the dashboard `order-risk-internal` route +
`parseAgentOrderRiskInternalBody` parser were **deleted** (no more gateway→dashboard hop). v1 output is
**persist-finding-only** (the escalate sink is a quiet recorder; the finding is the `AgentAction` row already shown in
`/dashboard/review`) — **Telegram notify is deferred** as a later sink swap (no core change). The support eval safety
net confirms no regression: `EVAL_REPEATS=1` ran **53/56 ≈ 94.6% ≥ 93.5%**; the 3 per-fixture failures
(`escalate-out-of-scope`, `address-change-post-fulfillment-escalate`, `order-status-basic`) are the known flappy/under-
escalation set and **all pass at `repeats=3`** (targeted rerun, exit 0) — Track 3 touched zero support-core files.
**Remaining before Track 3 is fully closed:** the manual `ORDER_RISK_MONITOR_ENABLED=1` live-gateway/Shopify e2e
(unrun locally — needs the live env), the Telegram-notify sink swap, and the deferred order-ops eval fixtures (Step 5).
**Resuming work = start Track 4 (repoint support to the in-process worker), now unblocked.**

**Update (2026-06-05, later) — gate PASSED, Track 2 complete.** With credits added, the confirming `EVAL_REPEATS=1`
run came back **53/56 (94.6%) ≥ 93.5%** — the aggregate gate did not throw. The executor-mock fix is confirmed
(refund 6/6, tier 10/10 — the fixtures that read the false 81.5%). The three per-fixture `it()` failures were
`repeats=1` single-draw noise: a targeted `repeats=3` re-run scored `address-change-missing-fields` 3/3,
`escalate-out-of-scope` 2/3, `escalate-tool-failure-mid-action` 2/3. The prompt split's cost win is confirmed:
`cacheHit` ~64–70%, `costVsUncached` ~0.40x. A **blocker found + fixed first**: the working tree had added
`strict: true` to all 36 tools (`registry.ts`), never committed — the strict-mode compiled grammar exceeds
Anthropic's size limit, 400-ing **every** call (prod too). Removed it (+ its `registry.test.ts` assertion).
Then **baseline regenerated** at `EVAL_REPEATS=3` → new committed baseline **156/168 (92.9%)**, flat vs old 157/168
(the prompt reorder's expected re-baseline churn). **Watch item:** the reorder slightly weakened *escalation
tendency* (`escalate-post-fulfillment-cancel`/`escalate-shopify-down`/`tier-watch-refund-draft-only` under-escalated
on some draws) — the dangerous direction per Decision-#3/principle-#3; baked into the new baseline, worth a prompt
pass if escalation reliability matters. Caveat for whoever runs the next baseline: `npm run test:evals:baseline`
does **not** set `EVAL_REPEATS` — pass `EVAL_REPEATS=3` explicitly or it writes a noisy repeats=1 baseline.

**Earlier update (2026-06-05) — gate attempted, harness regression found + fixed.** Running the gate
surfaced an **81.5% vs 93.5%** regression: every refund / tier-auto / escalate-ambiguous fixture that relies on
`simulateToolResults` failed, because the eval runner spied the dashboard `executor` shim while the extracted
`run.ts` calls the executor through its own **package-internal** import — the same mock-targeting class as the Phase 5
`@anthropic-ai/sdk` fix. **Fixed** by mocking `@clerk/agent/executor` directly (verified mechanically with a
zero-cost probe that vitest inlines the package, so the mock reaches `run.ts`). Two cost changes landed alongside:
**(a)** per-phase token + cache reporting in the suite (`[eval:usage]`, planner/run/judge split with `cacheHit%` +
`costVsUncached`), and **(b)** the support system prompt split into a **stable cached prefix + volatile suffix**
(`buildSplitCachedSystemPrompt`) so the static tools+instructions prefix caches across requests — a production-cost
win, not just an eval one. Details in the *Remaining work* section.

**Run the gate at `EVAL_REPEATS=1`, not 3 — ~$2 vs ~$6.** A single repeat is enough to confirm a refactor didn't
regress; `repeats=3`'s only job is exposing flappy fixtures, which matters when **regenerating** the committed
baseline, not when checking against it. One repeats=1 run validates the mock fix, re-baselines the prompt split (vs
157/168), and emits the `[eval:usage]` cache numbers in one shot. Reserve `repeats=3` for the run that commits a new
baseline. (Caveat: against a repeats=3 baseline, a repeats=1 run is noisier on the known-flappy fixtures — read those
per-fixture rather than trusting the aggregate gate alone.) Still: do not run the full eval per-phase while iterating.

**Critical path:** `0 → 1 → 2 → 3 → 4`. Track 5 is independent.

**Effort key:** **S** ≈ ≤1 day · **M** ≈ 2–4 days · **L** ≈ 1–2 weeks.

---

## The spine

```
Track 0 (decide A vs B) ─> Track 1 (thread-optional core) ─┐
                                                           ├─> Track 2 (extract → @clerk/agent)
                                                           │      └─> Track 3 (order-ops #2, in worker)
                                                           │              └─> Track 4 (repoint support)
Track 5 (WhatsApp surface) ──────────────────────────────── parallel / later
```

---

## Locked decisions

Settled in review. The plan assumes these and does not relitigate them.

1. **Channels.** Telegram is the operator surface today. WhatsApp is the near-term target
   (reachable via the existing Meta app: `META_APP_ID` / `META_APP_SECRET` / `META_CONFIG_ID`).
   iMessage is aspirational only — Apple has no first-party programmatic API; treat it as a possible
   third-party *adapter* behind the channel interface, never a constraint on the core.
2. **Thread-optional refactor happens now.** It is the foundation under module #2, not speculative —
   a thread-less proactive module literally cannot reuse `run.ts` without it. **Three named seams
   only — no module framework.**
3. **Agent runtime = durable gateway worker.** Execution moves out of Vercel serverless. Mechanism:
   **extract the agent core into a shared package** so the host is a deployment choice, not a
   code-location accident.
4. **Business-level operational memory: later.** Out of scope here. Per-customer memory
   (`customers.memory`) and per-merchant settings/KB are enough for V1 + module #2.
5. **Module #2 = order operations, Shape B:** thread-less, proactive, **event-driven**, and
   **flag/notify-only** in its first cut. Not operator-initiated. No autonomous Shopify mutations in v1.
6. **Autonomy posture = blast-radius-gated.** Flag-only / read-only / suggest-only work ships live
   behind a feature flag with monitoring (no shadow — worst case is a dismissed suggestion). Anything
   that **mutates a system of record** (moves money, sends external comms, writes to Shopify/books)
   inherits a per-module shadow→live ramp. For the no-human-baseline case, "shadow" is *redefined*:
   run it, record what it *would* do, surface for human spot-check, **do not execute** — not the
   agreement-rate diff that only works when a human approves every plan.

---

## Track 0 — How does the worker run an agent? *(decided: B)*

- **Option A — defer extraction:** gateway → HTTP → dashboard route; core stays in `apps/dashboard`,
  runs in Vercel serverless. Ships order-ops faster, but you build the worker wiring twice and keep a
  per-message HTTP hop forever.
- **Option B — extract now (chosen):** the core becomes a shared package; the gateway imports and runs
  it **in-process** in the durable worker. Pays the extraction cost once, on the safe net-new path, and
  makes the eventual support migration downhill.

**Decision: B.** The hop is a permanent tax in an agent-anywhere product, and order-ops is the cheapest
place to absorb the extraction. The rest of this plan assumes B.

---

## Track 1 — Thread-optional core *(M · ✅ complete · gated by the support eval suite)*

**Goal:** make `run.ts` + the executor run on a context with **no thread and no customer**. Extract
exactly the three seams module #2 needs. **No `Module` interface, plugin registry, or lifecycle
hooks** — there are two real consumers (support + order-ops); factor for two.

**Type substrate (already existed):** `BaseAgentContext` ⊂ `SupportContext` (`types.ts:33,42`),
`AgentContext = SupportContext` (`types.ts:62`). Invariant for the whole track: **the support path does
byte-for-byte what it does today.** Track 1 proves thread-optionality structurally (types widen, guards
compile) plus one cheap unit test — no live thread-less caller is built here (that's Track 3).

### The three seams (all ✅)

**Seam 1 — pluggable / lazy context** (`tools/executor.ts`, `types.ts`)
- Promote `shopify` to `BaseAgentContext` (module-agnostic). Shopify branches already gate on
  `ctx.shopify ? … : noShopify`.
- Widen the four entry points (`executeTool`, `executeToolStructured`, `executeToolWithStatus`,
  `runToolBody`) from `AgentContext` → `BaseAgentContext`. The planner caller still satisfies it.
- Kill the eager `threadCtx` at `executor.ts:93`; add `threadContextOf(ctx): ThreadContext | null`.
  Each thread-coupled branch (`add_internal_note`, `send_reply`, `send_email`, `update_thread_status`,
  `update_thread_tag`) resolves it lazily and returns a defensive `toolError` when absent (never hit on
  the support path — these tools are filtered out of any thread-less tool set).
- Guard `search_kb`'s `db.kbCitation.createMany` (`executor.ts:181-187`) behind a thread check.

**Seam 2 — pluggable escalate/flag sink** (`types.ts`, `executor.ts`, `run.ts`, `context.ts`)
- Add a **required** `escalate: (reason: string) => Promise<void>` to `BaseAgentContext` — every module
  must declare its escalation path (the safety backstop of Decisions #3 / #6).
- Rewire both hard-wired escalation sites off the thread-shaped `escalateToHuman` (`tools/thread.ts:286`):
  the `escalate_to_human` tool branch (`executor.ts:162`) → `await ctx.escalate(reason)`; the
  deterministic policy-block backstop (`run.ts:209`) → `await ctx.escalate(reason)`.
- Support wiring lives in `buildContext` (`context.ts`) and routes to `escalateToHuman`, making the
  support path identical. `escalateToHuman` stays in `thread.ts`, now referenced only by the support
  context builder. Order-ops' sink records a finding (Track 3).

**Seam 3 — guarded thread/customer reads in `run.ts`**
- Widen `runAgent` to `BaseAgentContext`; add `isSupportContext(ctx): ctx is SupportContext` (truthy `ctx.thread`).
- Logging/audit sites (`:96-97, :109, :117-118, :155, :166, :227`): `ctx.thread.id` → `ctx.thread?.id ?? null`,
  same for `ctx.customer.id`. `recordAgentActionsBatch` already accepts null `threadId` / `customerId`.
- `operatorMode` (`:83`) → `isSupportContext(ctx) && isOperatorChannel(ctx.thread.channelType)`.
- Gate the support-only preamble — fast-path (`:268`), operator history slice (`:294`), intent tool
  selection (`:298`), `buildSystemPrompt` (`:301`) — behind `isSupportContext(ctx)`.
- `dashboard_agent` approved-plan gating (`:283, :287, :306`) → guard with
  `ctx.thread?.channelType === "dashboard_agent"`.
- `intent.ts` and `order-status-fast-path.ts` are support-only and simply do not run for thread-less
  modules. A thread-less `runAgent` still needs a module-supplied prompt + tool set to run a loop —
  that is Track 3.

**Messaging tools** (`send_reply` / `send_email`) are thread-coupled too. Order-ops v1 (flag/notify-only)
needs neither, and the lazy `threadContextOf` returns a defensive `noThread` error when thread-less — so
the seam does not preclude spawning a customer thread as an action later.

**Ordering:** Seam 1 → Seam 2 → Seam 3.

**Exit (met):** support eval suite green (157/168 baseline, `EVAL_REPEATS=3`) — unchanged support behavior
= safe refactor. The order-ops fork from the prior spike is deleted and rebuilt on the real seams (Track 3).

**Anti-overbuild guard:** if you start adding a third abstraction "for the inventory module," stop. That
module does not exist; its needs are unknowable.

---

## Track 2 — Extract the core into `@clerk/agent` *(M–L · 🔶 Phases 1–5 done · depends on Track 1)*

**Goal:** move `runAgent` / `planAgent` / tools / prompt / context into a workspace package
(`@clerk/agent`, alongside `@clerk/db`) so both apps import it and the host becomes a deployment decision.

**Invariant (same as Track 1):** the dashboard support path does **byte-for-byte** what it does today.
Extraction is a code-location move plus *one* forced new seam (the I/O sink); it is "safe" iff the eval
baseline stays green. Built for exactly **two consumers** (dashboard, gateway worker) — no third. Track 2
does **not** build a thread-less caller (that's Track 3); it makes the core importable and host-agnostic.

**Public entry points (keep narrow):** `runAgent`, `planAgent`, `buildContext` / `buildOrderOpsContext`,
`selectAgentTools`, `classifyHomePlan`, and the policy surface. **`lib/agent/api/*` stays in the
dashboard** — it is Next route glue (auth, errors, plan-cache, sessions), not core.

### The coupling table (the design crux)

Every `@/lib/*` / `@/types` import the core carried, and how it's resolved. Three resolutions: **move**
into the package (agent-domain code), **inject** via the context (dashboard-specific I/O, the Seam 2
pattern), or **leave** in the dashboard (route glue).

| Dashboard dep (today) | Used by | Resolution |
|---|---|---|
| `@/types` (`OrgSettings`, `AgentPlan`, `RawToolCall`, `PlanStep`, `ToolCategory`, `SampleReply`) | everywhere (31×) | **Move** the agent subset of `types/index.ts` into the package; `@/types` re-exports. ✅ |
| `@/lib/ai` + `@/lib/ai/anthropic` (client, `buildCachedSystemPrompt`, `pickModel`, model IDs, `ModelTask`) | `run`, `planner` | **Move** into the package; subsumes gateway `getAnthropic()`. (`lib/ai/index.ts` already imports `spend`/`settings`/`usage` — those move too; the cycle becomes package-internal.) ✅ |
| `@/lib/messaging/thread-constants` (`isOperatorChannel`, `AGENT_NOTE_PREFIX`, `THREAD_STATUS`, `CHANNEL_TYPE`) | `context`, `intent`, `prompt`, `tools/thread` | **Move** into the package; dashboard messaging imports them back. ✅ |
| `@/lib/server/logger` | `run`, `planner`, `spend`, `tools/thread` (9×) | **Resolved with the package's console `logger.ts`**, not a host-pino inject seam (that's deferred; `tools/thread` keeps its own pino in the dashboard). ✅ |
| `@/lib/messaging/*` (`dispatch-message`, `email`, `email/reply`, `provider-send-failures`) + `@/lib/server/{outbound-recorder,gateway-url,customer-memory}` | **`tools/thread.ts` only** | **Inject — the one new seam** (`ctx.io`). These drag Postmark/IG/email; they must not enter the package. ✅ |
| `api/agent-actions.ts` (`recordAgentActionsBatch`) | `run.ts` | **Move** into the package as core (`@clerk/agent/agent-actions`); null-`threadId`/`customerId`-safe. Dashboard path is now a re-export shim. ✅ |
| `@/lib/server/refund-spend` (daily refund-cap counter) | `tools/executor.ts` | **Move** to `@clerk/db`. ⚠️ It was actually **Upstash Redis**, not a Postgres counter as first assumed — re-implemented as a Postgres counter (`refund-spend.ts` + new `RefundDailySpend` model), mirroring `spend-store.ts`. ✅ The schema change shipped as a committed migration (`20260604120000_add_refund_daily_spend`). **Correction:** an earlier pass landed the table via `prisma db push` to local dev *only* and left no migration — so CI and prod (both `prisma migrate deploy`) were missing the table and the executor's counter write threw in prod. Fixed by adding the migration; verified `migrate deploy` + the real-DB test pass. |
| `@/lib/server/{ops-alerts,agent-failure-alerts}` | `run.ts` | ⚠️ the "already injected" assumption was wrong: `run.ts` imported `recordAgentFailure` as a **value** (drags `@/lib/env` + Sentry). Collapsed `failureRoute`/`failureCounterClient` into one injected `recordToolFailure(kind, tool, detail)` callback on `RunAgentOptions`; the dashboard shim builds the closure. Alerting infra stays in the dashboard. ✅ |
| `@clerk/db`, `shopify/*` | core | **No change.** `@clerk/db` stays a dependency; `shopify/*` is self-contained (zero `@/` imports) and moves wholesale. ✅ |

### The I/O sink — the one forced seam

After Track 1, the executor still dispatches the five thread-coupled tools (`add_internal_note`,
`send_reply`, `send_email`, `update_thread_status`, `update_thread_tag`) by importing `./thread`, which
imports the dashboard messaging stack. **A shared package cannot import Postmark.** So Seam 2's injected
`escalate` generalizes into a small injected I/O object on `BaseAgentContext`
(`io?: { sendReply; sendEmail; addInternalNote; updateThreadStatus; updateThreadTag }`), resolved lazily
exactly like `threadContextOf`:

- Executor thread-tool branches call `ctx.io?.sendReply(...)` etc., returning the defensive `noThread` /
  no-op when absent (never hit on the support path — filtered out of any thread-less tool set).
- `tools/thread.ts` **stays in the dashboard** and becomes the support `io` sink, wired in `buildContext`
  next to the `escalate` sink. Postmark / IG / email / outbound-recorder never move.
- **Net boundary:** `@clerk/agent` owns orchestration + Shopify + KB + prompt + policy; the dashboard owns
  outbound delivery and route glue. The rule: *touches a message provider or an HTTP request* → dashboard;
  *decides what to do* → package.

### Build / packaging (✅ done)

Mirror `@clerk/db`'s ESM dual-package setup: runtime `dist/*.js` + `.d.ts`, `type: module`, `exports` map,
`tsc` build, turbo `predev` / `build` wiring. **ESM decision (settled):** plain `tsc` under `NodeNext`,
all relative imports authored with `.js` extensions (mirrors `@clerk/db`'s `from './crypto.js'`). No
bundler, no `rewriteRelativeImportExtensions`. `scripts/check-module-structure.mjs` `SCAN_ROOTS` extended
to cover the package. Verified: builds clean, emits `dist/{index.js,index.d.ts}`, resolves under NodeNext,
`check-module-structure` passes.

**Mechanical move pattern:** `git mv` the extraction set into `packages/agent/src`, rewrite `@/...`
imports per the table, then keep dashboard call sites unchanged with **re-export shims**
(`@/lib/agent/runner`, `@/lib/agent/settings`, `@/lib/ai`, the agent slice of `@/types`). This is what
makes "no behavior change" true without editing ~40 routes/components. Route glue in `lib/agent/api/*`
keeps importing through these shims.

### Phase changelog (what actually moved + the gotchas)

- **Phase 1 — scaffold ✅.** `packages/agent/` created (`package.json` / `tsconfig.json` / `src/index.ts`),
  wired into root `workspaces`, `predev` (after `@clerk/db`), and turbo `build`. ESM decision settled (above).
- **Phase 2 — types & AI client ✅.** Moved: agent type subset → `src/types.ts`; Anthropic client + tiering
  → `src/ai/{anthropic,index}.ts`; the three deps the AI client drags → `src/{settings,spend,usage}.ts`.
  `spend.ts`'s logger import resolved with a console-backed `src/logger.ts`. Dashboard `@/types` re-exports;
  shims at `@/lib/ai`, `@/lib/ai/anthropic`, `@/lib/agent/{settings,spend,usage}`. `generateText`'s unit
  test moved in with a minimal `vitest.config.ts` + `test:unit`; package wired into root ESLint flat config.
- **Phase 3 — I/O sink seam ✅.** Injected `ctx.io` for `tools/thread.ts` (see above).
- **Phase 4 — shopify + tools + executor ✅.** Moved: `shopify/*`, `tools/*` registry surface,
  `tools/executor.ts`. `tools/thread.ts` stays in the dashboard as the I/O sink. Executor exposed via a
  **server-only `@clerk/agent/executor` subpath** (kept out of the `@clerk/agent/tools` barrel so client
  components importing tool metadata don't pull `db`/Prisma). Context types
  (`BaseAgentContext`/`SupportContext`/`AgentIO`/…) → `@clerk/agent/context`; thread-constants →
  `@clerk/agent/thread-constants`. `refund-spend` → `@clerk/db` Postgres counter (the Redis surprise, above).
- **Phase 5 — remaining core ✅.** Moved: `run`, `planner`, `prompt`, `context` (as `buildContext` + a new
  injected `ThreadSink`), `intent`, `plan-preview`, `message-history`, `order-status-fast-path`, and
  `agent-actions` (re-homed as core; its `Prisma` JSON type now imports from `@prisma/client`, added as a
  package dep). New package subpaths: `./run`, `./planner`, `./build-context`, `./intent`, `./prompt`,
  `./plan-preview`, `./message-history`, `./order-status-fast-path`, `./agent-actions`; server-tainted ones
  plus `buildContext` also land in the main barrel for the gateway's eventual in-process call. Each original
  dashboard path is a thin re-export shim. The two that aren't pure re-exports are host wrappers: `run.ts`
  (injects `recordToolFailure` from the dashboard's `recordAgentFailure` + ops-alert counter) and
  `context.ts` (injects the `tools/thread` I/O sink).
  - **Two new injected seams:** `recordToolFailure` on `RunAgentOptions`, and `ThreadSink` into `buildContext`.
  - **Test-mock migration gotcha:** `run-policy.unit.test.ts` and `runner.test.ts` drove the model loop by
    mocking the dashboard `@/lib/ai/anthropic` shim — which no longer intercepts the package's internal
    client import. Both now mock the shared `@anthropic-ai/sdk` specifier instead (+ the unit test stubs the
    spend-store reads in its `@clerk/db` mock).
  - **Verified:** package + gateway build clean; dashboard typecheck has zero production errors (only
    pre-existing `*.test.ts` quirks); package units 9/9, dashboard agent units 64/64, `runner.test.ts`
    integration 11/11.
  - **Phase 4 orphan (resolved):** the old `apps/dashboard/src/lib/server/refund-spend.test.ts` (Redis
    version, importing the deleted dashboard `refund-spend.ts`) was deleted and re-ported as a real-DB test
    at `apps/gateway/src/refund-spend.test.ts`, mirroring `spend.test.ts` (`createTestOrg`/`cleanupTestData`,
    counter imported from `@clerk/db`). 5/5 green.

### Remaining work (the "what's next")

1. **Gateway dedup** (the extraction's real payoff — pays down existing duplication, not new abstraction).
   The package now owns the dashboard-side halves of the spend wrapper and Anthropic client. **Three of four
   gateway-side consolidations done; the Shopify one remains:**
   - gateway `llm-spend.ts` ↔ dashboard `spend.ts` — ✅ **done.** Deleted `apps/gateway/src/llm-spend.ts`;
     the gateway now imports `enforceSpendCap` / `recordSpend` from `@clerk/agent/spend` and `readModelUsage`
     from `@clerk/agent/usage`. The package's `enforceSpendCap` was relaxed to a `SpendCapSettings` param
     (`{ dailyLLMSpendCapUsd? }` | null) so it accepts both full `OrgSettings` and the gateway's bare cap.
     The real-DB spend test moved with it (`llm-spend.test.ts` → `spend.test.ts`, retargeted at the package).
   - gateway `getAnthropic()` (`message-handlers/shared.ts:49`) ↔ dashboard `lib/ai/anthropic.ts` — ✅ **done.**
     Removed the gateway's lazy client; all call sites use the package's `anthropic` client via a new
     `@clerk/agent/ai` subpath (which also exposes `buildCachedSystemPrompt` + `pickModel`). The gateway's
     non-agent calls keep their explicit `MODEL` constants rather than adopting `pickModel` tiering — those
     constants already equal the package's Haiku/Sonnet IDs, so behaviour is unchanged.
   - gateway `customer-memory-summarizer.ts` ↔ dashboard memory reads — ✅ **done.** `@clerk/db/customer-memory`
     owns the shared types/constants; the summarizer's model call now routes through the package `anthropic`
     client.
   - gateway raw Shopify `fetch` (`message-handlers/shared.ts` → `lookupShopifyCustomerName`) ↔ the throttled
     `shopify/client.ts` — ✅ **done.** `lookupShopifyCustomerName` now calls `shopifyRestJson` from
     `@clerk/agent/shopify` (per-shop token bucket + retry), closing the "gateway bypasses the Shopify seam"
     crack from the prior plan. The dead `SHOPIFY_API_VERSION` import in `shared.ts` was dropped (the constant
     stays in `constants.ts` for `order-risk-monitor.ts`, the Track 3 spike).
2. **Gateway depends on `@clerk/agent`** — ✅ established (imports `spend` / `usage` / `ai` / `settings`).
   Running the core in-process (`runAgent`) is first exercised by Track 3. Dashboard already does (✅, via shims).
3. **Build/CI wiring** — ✅ **done.** The `evals.yml` PR-trigger path filter was stale (still watched the
   old `apps/dashboard/src/lib/agent/**` location); now also fires on `packages/agent/**` and
   `packages/db/refund-spend.ts`. The missing `refund_daily_spend` migration was committed (see the coupling
   table correction).
4. **Eval-harness fix + cost work (2026-06-05)** — ✅ **confirmed by the credited gate (94.6%) + baseline regen (156/168).**
   - **Executor-mock fix (required for the gate to pass at all):** the runner's `simulateToolResults` now drives a
     hoisted `vi.mock("@clerk/agent/executor")` instead of a `vi.spyOn` on the dashboard shim namespace — the spy
     couldn't reach `run.ts`'s package-internal `executeTool*` call. Without this the gate reads a false 81.5%.
   - **(a) Per-phase usage reporting:** `EvalUsage` gains `plannerUsage`/`runUsage`/`judgeUsage`; the runner tags each
     model call by phase; `formatUsageBreakdown` prints `[eval:usage]` (prompt/input/cacheWrite/cacheRead +
     `cacheHit%` + `costVsUncached`). Read this on the next run to confirm (b) lands cache hits.
   - **(b) Split cache breakpoint:** `buildSystemPromptParts` + `buildSplitCachedSystemPrompt` cache a stable support
     prefix (generic role + instructions + injection guidance — identical across all support threads/orgs) separately
     from the per-thread volatile suffix; operator + composer-ask stay single-block. 3 positional refs in
     `SUPPORT_INSTRUCTIONS` reworded to be order-neutral. Reorders the support prompt → **must re-baseline**, but a
     production token win too.

**Ordering:** ~~scaffold~~ ✅ → ~~types & AI client~~ ✅ → ~~I/O sink~~ ✅ → ~~shopify + tools + executor~~ ✅
→ ~~remaining core + shims~~ ✅ → ~~gateway dedup (4/4)~~ ✅ → ~~build/CI wiring~~ ✅ → ~~eval-harness fix + cost
work~~ ✅ → ~~re-run gate (`EVAL_REPEATS=1`) + regenerate baseline~~ ✅ **(done 2026-06-05 — 94.6% gate, 156/168 baseline).**

**Exit (met 2026-06-05):** dashboard-hosted support paths behave identically — `EVAL_REPEATS=1` confirming gate
**94.6% ≥ 93.5%**, committed baseline regenerated at `repeats=3` to **156/168** (flat, absorbing the prompt-split
reorder); gateway builds and can `import { runAgent } from "@clerk/agent"`. Remaining housekeeping: commit the WIP.

**Anti-overbuild guard:** extract for the **two real consumers** (gateway worker, dashboard). Do not design
an "agent SDK" with versioned plugin contracts. Narrow entry points, no speculative API. The injected I/O
sink is the *one* new seam — forced by the extraction (the executor cannot import Postmark into a shared
package), not speculative.

**Open (decide when the work reaches it):** (1) logger — inject host pino (recommended) vs. the package
owning a thin pino; (2) the eval suite (`__evals__`) — stay in `apps/dashboard` importing `@clerk/agent`
(recommended, no harness change) vs. move into the package.

---

## Track 3 — Order operations (module #2), Shape B *(M · 🔶 code-complete + eval-confirmed 2026-06-05 · depends on Track 2)*

Event-driven, thread-less, flag/notify-only. Runs **in-process in the gateway worker**, not via the
prior spike's HTTP hop. Rebuild the spike (`order-ops/*`, `order-risk-monitor.ts`) on the real Track 1
seams; delete the forked dispatch.

- [x] **Trigger: event-driven per order.** ✅ `orders/created` webhook (`webhooks-shopify.ts`) enqueues one
  review job into `QUEUE.ORDER_REVIEW` with a stable per-order jobId (`order-review:${shop}:${orderId}`),
  flag-gated by `ORDER_RISK_MONITOR_ENABLED`. The hourly sweep (`order-risk-monitor.ts`) is demoted to a
  backstop that enqueues into the same queue (no more dashboard HTTP hop).
- [x] **Run `runOrderOps`** on the extracted core via the injected sink (Seam 2). ✅ Module moved into
  `@clerk/agent` (`@clerk/agent/order-ops`); the new in-process `workers/order-review.ts` builds the context
  with an injected `escalate` and runs the loop. `runOrderOps` has a deterministic pre-filter (skips the
  model when `riskSignals` is empty); `flag_order` routes through `ctx.escalate`.
- [x] **Output: flag/notify only.** ✅ A finding → an `AgentAction` row (`threadId`/`customerId` null). v1 is
  **persist-only** — the escalate sink is a quiet recorder; the row already renders in `/dashboard/review`.
  **Telegram notify deferred** (later sink swap, no core change). No Shopify mutations, no customer contact.
- [x] **Autonomy: live behind `ORDER_RISK_MONITOR_ENABLED` with monitoring, no shadow.** ✅ Both the webhook
  enqueue and the worker processor gate on the flag.
- [ ] **Evals: a handful of order-ops fixtures, written when the behavior is worth gating** — deferred (Step 5).
  Support suite re-confirmed green (53/56 ≈ 94.6%; the 3 repeats=1 failures are the known flappy set, all pass
  at repeats=3). No order-ops fixtures yet.
- [ ] **Manual live e2e** (`ORDER_RISK_MONITOR_ENABLED=1`, real gateway + Shopify): benign→no-model,
  risky→finding, idempotency, backstop. **Not yet run** — needs the live env.

**Exit:** order-ops reviews real `orders/create` events in-process in the worker, persists findings,
notifies the merchant; the support suite is untouched. *(Met in code + eval; the live-e2e leg and Telegram
notify remain.)*

**When order-ops later gains its first *mutating* action** (auto-cancel suspected fraud, auto-correct an
address): *that action* — not the whole module — inherits the redefined per-module shadow→live ramp
(Decision #6). Out of scope here; noted as the trigger.

---

## Track 4 — Repoint support to the in-process worker *(M · 🔶 in progress · last, incremental)*

Once the core is a package and the worker runs order-ops in-process, migrate support's
**gateway-triggered** paths off the HTTP hop — one trigger at a time, never big-bang.

**The finding (2026-06-05).** The two gateway-triggered routes (`/api/agent/plan-internal` for auto-plan,
`/api/agent/internal` for Telegram operator runs) don't sit on thin route glue — they sit on a stack of
`lib/agent/api/*` **orchestration** (`executeAgentTurn`, plan-cache read/write, auto-execute, audit-note
serialization, thread resolution) that Track 2 deliberately left in the dashboard. That orchestration is
genuinely shared, not Next-specific, but it drags three host-coupled things into the package boundary:
**Upstash Redis** (thread lock `agent-lock.ts` + failure counter), **Clerk** (approver resolution), and the
**billing gate**. Auto-execute is live on the auto-plan path (`ai-summary.ts:44` passes
`allowAutoExecute: withinBusinessHours`), so repointing auto-plan needs the full plan→run path, not just
`planAgent`.

**Decision (2026-06-05): promote the shared orchestration into `@clerk/agent` with injected infra seams**
(not re-implement it gateway-side). Both the dashboard route and the worker call the *same*
`executeAgentTurn`; the host-coupled bits become injected seams (the Tracks 1–2 pattern). This keeps the
byte-for-byte support invariant (one source of truth, no drift) and honors the "repoint the trigger, don't
rewrite the runtime" guardrail below. **Migrate auto-plan first**, then operator runs.

### Seam inventory (move / inject / leave)

| `lib/agent/api` dep | Nature | Resolution |
|---|---|---|
| `buildContext` / `runAgent` / `planAgent` | ✅ already `@clerk/agent` | call directly (order-review already does) |
| `acquireThreadLock` (`agent-lock.ts`) | Upstash `.set({nx,ex})` / `.eval` | **inject `LockProvider`** — gateway is ioredis (`REDIS_URL`), different API; logic moves, client injected |
| `serializeAgentTurn` (`turns.ts`), plan-cache (`plan-cache.ts`) | pure | **move** to package |
| auto-execute (`plan-execution.ts`) | drags shadow recorder + approver | **move** core; **inject `ShadowRecorder`** (frozen/dashboard-rollout-only per trim list → no-op in worker) |
| `resolveInternalAgentThread` (`internal.ts`), `requireOrgThread` (`auth.ts`) | DB (+ `@clerk/agent/shopify`) | **move** to package |
| route failure counter (Upstash) | host I/O | collapse into the existing injected `recordToolFailure` seam (Track 2); host builds the closure |
| billing gate, Clerk approver | host I/O | **leave** host-side; pass resolved values in (operator path only) |
| `rateLimit` (Upstash), `parse*Body` | Next route I/O | **leave** — the HTTP route keeps them; the in-process path skips them (BullMQ jobId-dedup + concurrency already serialize) |

### Phasing

- [x] **4.0 — `LockProvider` seam ✅ (2026-06-05).** New `@clerk/agent/lock` subpath exports the
  `LockProvider`/`ThreadLock` interface (`acquire(threadId, ttlSeconds?) → {release} | null`).
  `executeAgentTurn` gained an optional `lock?: LockProvider` param defaulting to the dashboard's Upstash
  provider — **zero churn at the 5 callers** now; the optional→required flip lands in 4.1 when the function
  moves and the host wrapper supplies the lock. Dashboard `agent-lock.ts` exposes `upstashLockProvider`
  (wraps existing `acquireThreadLock`, behavior unchanged); gateway `clients/agent-lock.ts` adds
  `createGatewayLockProvider(redis)` — ioredis (`set k v EX ttl NX` + numkeys-form `eval` release), same
  fail-open posture, **wired in 4.2**. Verified: package + gateway build clean, dashboard 0 production type
  errors, `agent-lock` test 7/7, lint clean.
- [x] **4.1 — Move orchestration into `@clerk/agent` ✅ (2026-06-06).** Moved into `packages/agent/src`:
  `errors.ts` (the pure `ApiError` + subclasses — Next-free, dashboard `@/lib/api/errors` re-exports them and
  keeps `handleApiError`), `plan-cache-shape.ts`, `plan-cache.ts`, `turns.ts` (+ `AgentTurn` into `types.ts`),
  `thread-auth.ts` (was `auth.ts`), `internal-thread.ts` (was `internal.ts`), `turn.ts` (`executeAgentTurn`),
  `plan-execution.ts` (auto-execute core). New subpaths + barrel exports for the gateway's eventual in-process
  call. **Seams:** `executeAgentTurn(params, deps)` takes injected `{ lock: LockProvider; buildContext; runAgent }`
  (the host wrappers); `plan-execution` adds an injected `ShadowRecorder` (`PlanExecutionDeps`); `failureRoute`
  relaxed to `string`. The `getRedis()` failure-counter construction stays host-side in a new
  `lib/agent/api/turn-deps.ts` (a **lazy** `buildDashboardTurnDeps()` shared by the execution + plan-execution
  shims, so partial-mock tests don't trip an eager runner access). Dashboard shims at the old paths keep the
  ~15 route/component call sites unchanged. **Test note (the Track 2 mock-targeting class):** quick-approve +
  plan-internal route tests reach the turn *through* plan-execution → retargeted their `executeAgentTurn` mock
  from `@/lib/agent/api/execution` to `@clerk/agent/turn`, and the 2-arg `(params, deps)` signature needed
  `expect.anything()` for the deps arg. **Gate met:** dashboard 0 production type errors; package units 170/170,
  dashboard units 119/119, agent-surface integration 92/92, gateway 231/1-skip, lint clean; eval suite
  `EVAL_REPEATS=1` **54/56 (96.4%) ≥ 93.5%** (above the 92.9% baseline) — the 2 repeats=1 failures
  (`memory-empty-no-regression`, `tier-watch-refund-draft-only`) are the known flappy/under-escalation set and
  both pass at `repeats=3`. Refactor touched orchestration plumbing only, not the prompt/model path.
- [x] **4.2 — Worker auto-plan in-process ✅ (2026-06-06).** `planning-dashboard-client.ts`'s
  `requestThreadPlan` HTTP hop is gone; `precomputeThreadPlan` now calls a new in-process
  `generateThreadPlan(orgId, threadId, allowAutoExecute)` (`message-handlers/generate-thread-plan.ts`) that
  mirrors the `plan-internal` route: `requireOrgThread` → settings → plan-cache hit/miss → `planAgent` →
  cache write → (within business hours) `maybeAutoExecuteCurrentCachedHomePlan` with the gateway's injected
  deps. `precomputeThreadPlan`'s shape + `PrecomputedPlanResult` are unchanged (one localized `as unknown`
  widening at the boundary — the gateway keeps its looser JSON-shaped `AgentPlan`, exactly what `JSON.parse`
  did before). (`requestAutoAck → /api/messages/auto-ack` still **stays a hop**.)
  - **Injected gateway deps (`agent-turn-deps.ts`):** ioredis `LockProvider` (4.0), `buildContext` +
    in-process `ThreadSink`, core `runAgent` (no ops-alert counter yet — `recordToolFailure` omitted; failures
    still land as `AgentAction` rows + BullMQ/Sentry job-failure logging), **no-op `ShadowRecorder`** (rig is
    dashboard-rollout-only).
  - **Gateway `ThreadSink` (`agent-thread-sink.ts`) — hop-back sink (decided 2026-06-06):** DB-only ops run
    in-process — `add_internal_note` / `update_thread_tag` (pure DB), `update_thread_status` (+ in-process
    customer-memory enqueue on close), `escalate_to_human` (+ in-process operator-notify via the extracted
    `pushOperatorEscalation`; the dashboard sink *hops to the gateway* for exactly this, so in-process is the
    terminus). The two provider-coupled tools `send_reply` / `send_email` **hop back** to a new internal
    dashboard route `POST /api/agent/io-send-internal`, which runs the unchanged `tools/thread` dispatch
    (Postmark/IG stays in the dashboard per the package boundary). Lazy process-singletons in
    `clients/agent-runtime.ts` (lock client + customer-memory queue).
  - **Verified:** package + gateway build clean; gateway typecheck 0 errors; dashboard 0 production type errors
    (only pre-existing `*.test.ts` quirks); lint + `check-module-structure` clean; gateway suite 231 pass / 1
    skip (incl. refactored `internal-operator` 404-path + unchanged `sendAutoAck`). The support eval net is not
    implicated — the dashboard `plan-internal` path is byte-for-byte unchanged and the package core was not
    touched. **Remaining:** manual live e2e (in-process auto-plan + auto-execute through the hop-back sink,
    needs the live env, like Track 3's); optionally wire the gateway `recordToolFailure` closure.
- [ ] **4.3 — Operator runs in-process.** Point `executeFreeFormInstruction` + `handlePendingPlanCommand`
  (Telegram) at an in-process `executeAgentTurn` + `resolveInternalAgentThread`. Billing gate + Clerk approver
  resolve gateway-side (move billing check to `@clerk/db` or a gateway copy; approver passed pre-resolved).
- [ ] **4.4 — Leave dashboard UI-initiated paths** (composer-ask, concierge, UI approve/quick-approve) calling
  the core in Next — minor, later choice. No urgency; minority of traffic, already work.
- [ ] **4.5 — Retire the internal HTTP routes** only after their callers are migrated. (Note: `plan-internal`
  also has a non-worker caller — `scripts/backfill-plans.ts`; keep the route or repoint the script.)

**Exit:** the majority of agent runs (channel-triggered) execute in the durable worker with no network hop;
the dashboard keeps working throughout.

**Anti-overbuild guard:** this is "repoint the trigger," not "rewrite the runtime." If a step looks like a
rewrite, the Track 2 package boundary is wrong — fix that, don't power through. (This is exactly why 4.1
*moves* the orchestration rather than re-implementing it in the worker.)

---

## Track 5 — Channel surface: WhatsApp *(M · ⬜ · parallel / later)*

Only when channel expansion is actually scheduled. Not on the critical path for modules.

- [ ] **Split the `ChannelType` enum** into *channel* (email/ig/shopify/sms/whatsapp/…) vs *agent
  surface/mode* (`dashboard_agent` / `sms_agent` are currently jammed into the channel enum). Do this **as
  part of the WhatsApp work**, not before — order-ops adds no channel, so the split isn't needed earlier.
- [ ] **WhatsApp adapter** via the existing Meta app (Cloud API; same vendor as IG DM). Slot into the same
  inbound→core→outbound path the channel interface defines.
- [ ] **iMessage:** keep the channel interface able to accept a third-party adapter (Sendblue / LoopMessage /
  self-hosted bridge) without core changes. Do not build it; do not let its constraints shape the core.

---

## Freeze / trim list (overbuild discipline)

Already-built systems ahead of the traffic that justifies them. **Do not extend these.** The cost is sunk;
the move is to stop pouring in, not rip out (except where noted).

- **Shadow/canary rig** (`AutonomyShadowDecision`, readiness aggregation, `/dashboard/review` card):
  **freeze.** No further readiness analytics until real auto-execute traffic populates it.
- **Five autonomy tiers:** collapse the **UI** to three buckets ("draft everything" / "handle easy stuff,
  ask on money" / "just run it"); keep the five-value machinery underneath if convenient. Don't surface
  `broad`/`full` "coming soon" to merchants.
- **LLM spend split by model** (`llm_daily_spend` per-model rows): do not extend. One daily $ cap is what a
  solo merchant needs.
- **Voice-learning loop** (`VoiceEdit` → synthesis → `voiceProposal`): keep, do not extend (no per-tag voice
  models etc.) until merchants are correcting drafts at volume. The manual path (`brandVoice` +
  `sampleReplies`) already delivers most of the value.
- **Playbooks** (`Playbook` / `PlaybookRun` + routes): **evaluate for deletion.** The agent is the
  automation; a parallel rules-engine table is redundant surface. (Confirm unused first.)

## Explicitly deferred (not in this plan)

- Business-level operational memory (Decision #4).
- `ChannelType` split → folded into Track 5 (WhatsApp), not before.
- Generalized eval fixture schema → only when a module's behavior is worth gating (Track 3 writes a few
  fixtures, no schema rework).
- Distributed/global Shopify rate limiter → the in-process per-shop bucket is fine at solo-merchant volume;
  revisit when concurrent write-heavy modules hammer one shop.
- LLM-provider outage handling / fallback → deliberately out of scope (carried from prior plan).

---

## Sequencing & effort

| Track | What | Effort | Depends on |
|---|---|---|---|
| 0 | Decide A vs B (→ B) | — | — |
| 1 | Thread-optional core (3 seams) | M | 0 |
| 2 | Extract core → `@clerk/agent` + de-dupe | M–L | 1 |
| 3 | Order-ops #2 (event-driven, flag-only, in-worker) | M | 2 |
| 4 | Repoint support to in-process worker | M | 2, 3 |
| 5 | WhatsApp surface + `ChannelType` split | M | parallel / later |

**Critical path: 0 → 1 → 2 → 3 → 4.** Track 5 is independent.

## Decisions still open (set when the work reaches them)

1. **Per-module mutation ramp thresholds:** when a module gains its first mutating action, the
   redefined-shadow agreement bar / spot-check window before it goes live. Set when the first mutation is
   actually proposed.
2. **Dashboard UI-initiated execution host:** in-process in Next vs. call the gateway. Decide during Track 4;
   low stakes either way.
3. **Customer contact from proactive runs:** thread-spawn vs. thread-less `send_email`. Decide when a module
   first needs to contact a customer (not order-ops v1).

## Guardrails carried through every track

- **Factor for the two real consumers, never the hypothetical third.** Two concrete modules is the minimum
  to factor an abstraction honestly.
- **The support eval suite is the safety net.** Any core refactor (Tracks 1, 2, 4) is "safe" iff the support
  baseline stays green. That suite is the entry gate.
- **Move risk to the net-new path.** Order-ops absorbs the extraction's rough edges; the working support
  path is migrated last and incrementally.
