# Clerk — Core Extraction & Module Expansion Plan

Follow-on to `autonomy-and-generality-plan.md`. That plan hardened support, generalized
the chassis, and proved (Track 4 fraud spike) that the *substrate* is module-agnostic while
the *orchestration* is thread-coupled. This plan executes the consequences of that finding plus
a strategic shift: **the product is moving from dashboard-first to an agent reachable from
anywhere (Telegram now; WhatsApp near-term; iMessage aspirational).** That shift moves the
agent's runtime home from Vercel/dashboard to the durable gateway worker, and it makes
module #2 (order operations) the wedge that forces the move on a safe path.

**Status (2026-06-04):**
- **Track 0** — ✅ decided: **B** (extract core, run in-process in the worker).
- **Track 1** (thread-optional core, 3 seams) — ✅ complete (all four items below `[x]`; seams landed in `types.ts`/`executor.ts`/`run.ts`).
- **Track 2** (extract → `@clerk/agent`) — 🔶 in progress: Phase 1 (scaffold) ✅ and Phase 2 (types & AI client moved) ✅ done. Remaining: I/O sink seam → move remaining core + re-home `agent-actions`/`refund-spend` → gateway dedup → build/CI wiring. The full integration + eval gate is run once at the end of the track. See the Track 2 ordering line + Phase 2 note.
- **Tracks 3–5** — not started.

## Decisions driving this plan (locked)

These were settled in review; the plan assumes them and does not relitigate them.

1. **Channels:** Telegram is the operator surface today. WhatsApp is the near-term target
   (reachable via the existing Meta app — `META_APP_ID`/`META_APP_SECRET`/`META_CONFIG_ID`).
   iMessage is aspirational only — Apple has no first-party programmatic API for it; treat it
   as a possible third-party *adapter* behind the channel interface, never a constraint on the core.
2. **Thread-optional refactor: now.** It is the foundation under module #2, not speculative — a
   thread-less proactive module literally cannot reuse `run.ts` without it. **Three named seams
   only — no module framework.**
3. **Agent runtime: durable gateway worker.** Execution moves out of Vercel serverless. The
   mechanism is to **extract the agent core into a shared package** so the host is a deployment
   choice, not a code-location accident. (See Track 0 for the A-vs-B sequencing fork.)
4. **Business-level operational memory: later.** Not in scope here. Per-customer memory
   (`customers.memory`) and per-merchant settings/KB are sufficient for V1 + module #2.
5. **Module #2 = order operations, Shape B:** thread-less, proactive, **event-driven**, and
   **flag/notify-only** in its first cut. Not operator-initiated. No autonomous Shopify mutations
   in v1.
6. **Autonomy posture: blast-radius-gated.** Flag-only / read-only / suggest-only proactive work
   ships live behind a feature flag with monitoring (no shadow — worst case is a dismissed
   suggestion). Anything that **mutates a system of record** (moves money, sends external comms,
   writes to Shopify/books) inherits a per-module shadow→live ramp, with "shadow" *redefined* for
   the no-human-baseline case to mean *run-it, record what it would do, surface for human
   spot-check, do not execute* — not the agreement-rate diff that only works when a human approves
   every plan.

**Effort key:** **S** ≈ ≤1 day · **M** ≈ 2–4 days · **L** ≈ 1–2 weeks.

---

## The spine

```
Track 0 (decide A vs B) ─> Track 1 (thread-optional core, 3 seams) ─┐
                                                                     ├─> Track 2 (extract core → @clerk/agent)
                                                                     │      └─> Track 3 (order-ops #2, in-process in worker)
                                                                     │              └─> Track 4 (repoint support, incremental)
Track 5 (WhatsApp surface) ──────────────────────────────────────── parallel / later
```

The through-line: make the core **thread-agnostic** (Track 1) and **host-agnostic** (Track 2),
then let module #2 be the first inhabitant of the worker (Track 3), and only after that is proven
move the working support path (Track 4) — incrementally, never big-bang.

---

## Track 0 — The one decision to make first *(A vs B; pick before starting)*

How does the gateway worker run an agent?

- **Option A — defer extraction (spike's pattern):** gateway → HTTP → dashboard route; the core
  stays in `apps/dashboard` and runs in Vercel serverless. Order-ops ships faster, but you build
  the worker wiring twice and keep the HTTP hop you'll pay for on every message forever.
- **Option B — extract now (recommended):** the agent core becomes a shared package; the gateway
  imports and runs it **in-process** in the durable worker. Pays the extraction cost once, on the
  safe net-new path, and makes the eventual support migration downhill.

**Recommendation: B.** The hop is a permanent tax in an agent-anywhere product, and order-ops is
the cheapest place to absorb the extraction. The only reason to choose A is if validating the
thread-less core *this week* outweighs doing the worker wiring once — a legitimate speed-vs-once
tradeoff, but not the default.

The rest of this plan assumes **B**.

---

## Track 1 — Thread-optional core refactor *(M; do first; gated by the support eval suite)*

Make `run.ts` + the executor run on a context with **no thread and no customer**. Extract exactly
the three seams the *second* module needs. **Do not** build a `Module` interface, plugin registry,
or lifecycle hooks — there are two real consumers (support + order-ops); factor for two.

- [x] **Seam 1 — pluggable context.** Widen the executor's ctx to `BaseAgentContext` and make
  `threadCtx` lazy. Today `executor.ts:93` eagerly builds `threadCtx = { threadId: ctx.thread.id }`
  for *every* tool call, so a thread-less ctx throws before any Shopify-only tool runs. Also guard
  `search_kb` writing `threadId: ctx.thread.id` into `kbCitation` (executor `search_kb` branch).
- [x] **Seam 2 — pluggable escalate/flag sink.** Replace the hard-wired `escalateToHuman`
  (`tools/thread.ts` — sets thread → pending, `needs_human` tag, operator notify) with an injected
  sink. Support supplies the thread-shaped escalation; order-ops supplies a finding/notify sink.
  The deterministic escalate-on-policy-block in `run.ts` must route through the injected sink, not
  the thread-specific function, so the safety backstop survives in a thread-less run.
- [x] **Seam 3 — guarded thread/customer reads in `run.ts`.** The ~10 `ctx.thread.*` / `ctx.customer.*`
  sites (operator-channel check, audit call, logging, approved-plan channel gating, order-status
  fast-path, prompt/intent selection) become thread-optional. `intent.ts` and
  `order-status-fast-path.ts` are support-only and simply do not run for thread-less modules.
- [x] **Messaging tools are thread-coupled too** (`send_reply`/`send_email` build on `threadCtx`).
  Decided: order-ops v1 (flag/notify-only) needs neither path. The executor's lazy `threadContextOf`
  already makes `send_reply`/`send_email` return a defensive `noThread` error when thread-less, so the
  seam does not preclude option (a) — spawning a customer thread as an action — later.

**Exit:** support eval suite green (157/168 baseline, `EVAL_REPEATS=3`) — if support behavior is
unchanged, the refactor is safe. The order-ops fork from the Track 4 spike is deleted and rebuilt
on the real seams (Track 3), not kept.

**Anti-overbuild guard:** if you find yourself adding a third abstraction "for the inventory
module," stop. The inventory module does not exist; its needs are unknowable.

### Track 1 — implementation plan (code-grounded)

Type substrate already half-exists: `BaseAgentContext` ⊂ `SupportContext` (`types.ts:33,42`),
`AgentContext = SupportContext` (`types.ts:62`). The invariant for the whole track: the support
path does byte-for-byte what it does today; the seams are wired so support is unchanged. No live
thread-less caller is built here (that's Track 3) — Track 1 proves thread-optionality structurally
(types widen, guards compile) plus one cheap unit test. Do **not** touch the spike
(`order-ops/*`, `order-risk-internal`, `order-risk-monitor.ts`); it is deleted and rebuilt on these
seams in Track 3.

**Seam 1 — pluggable / lazy context in the executor** (`tools/executor.ts`, `types.ts`):
- Promote `shopify` to `BaseAgentContext` (module-agnostic; remove from `SupportContext` and from
  the spike's `OrderOpsContext`). Shopify branches already gate on `ctx.shopify ? … : noShopify`.
- Widen the four entry points (`executeTool`, `executeToolStructured`, `executeToolWithStatus`,
  `runToolBody`) from `ctx: AgentContext` → `ctx: BaseAgentContext`. The planner caller is
  unaffected (`SupportContext` still satisfies it).
- Kill the eager `threadCtx` at `executor.ts:93`; add `threadContextOf(ctx): ThreadContext | null`
  (reads `(ctx as Partial<SupportContext>).thread`). Each thread-coupled branch
  (`add_internal_note`, `send_reply`, `send_email`, `update_thread_status`, `update_thread_tag`)
  resolves it lazily and returns a defensive `toolError` when absent (never hit on the support
  path — these tools are filtered out of any thread-less tool set).
- Guard `search_kb`'s `db.kbCitation.createMany` (`executor.ts:181-187`) behind a thread check; the
  article return is unchanged.

**Seam 2 — pluggable escalate/flag sink** (`types.ts`, `tools/executor.ts`, `run.ts`, `context.ts`):
- Add a **required** `escalate: (reason: string) => Promise<void>` to `BaseAgentContext` — every
  module must declare its escalation path (the safety backstop of Decisions #3/#6).
- Rewire both hard-wired escalation sites off the thread-shaped `escalateToHuman`
  (`tools/thread.ts:286`): the `escalate_to_human` tool branch (`executor.ts:162`) becomes
  `await ctx.escalate(reason); return toolEscalated(reason)`; the deterministic policy-block backstop
  (`run.ts:209`) becomes `await ctx.escalate(reason)`. Drop the `escalateToHuman` imports from both.
- Support wiring in `buildContext` (`context.ts`): `escalate: (reason) => escalateToHuman({ reason },
  { threadId: thread.id, orgId, orgName }).then(() => {})` — makes the support path identical.
- `escalateToHuman` stays in `thread.ts`, now referenced only by the support context builder. Order-ops'
  sink records a finding (Track 3) — which also collapses the spike's bespoke `flag_order` tool into
  `escalate_to_human` + a finding sink. Noted, not built here.

**Seam 3 — guarded thread/customer reads in `run.ts`**: widen `runAgent` to `ctx: BaseAgentContext`,
add `isSupportContext(ctx): ctx is SupportContext` (truthy `ctx.thread`), then:
- Logging/audit sites (`:96-97, :109, :117-118, :155, :166, :227`): `ctx.thread.id` →
  `ctx.thread?.id ?? null`, `ctx.customer.id` → `ctx.customer?.id ?? null`. `recordAgentActionsBatch`
  already accepts null `threadId`/`customerId`.
- `operatorMode` (`:83`): `isSupportContext(ctx) && isOperatorChannel(ctx.thread.channelType)`.
- Gate the support-only preamble — fast-path (`:268`), operator history slicing (`:294`), intent
  tool selection (`:298`), `buildSystemPrompt` (`:301`) — behind `isSupportContext(ctx)`.
- `dashboard_agent` approved-plan gating (`:283, :287, :306`): guard with
  `ctx.thread?.channelType === "dashboard_agent"`.
- A thread-less `runAgent` still needs a module-supplied prompt + tool set to run a loop — that is
  Track 3. Track 1 leaves `runAgent` support-shaped but null-safe.

**Ordering:** Seam 1 → Seam 2 (needs the `BaseAgentContext` widening) → Seam 3 (the `:209` backstop
routes through the sink).

**Verification:** typecheck + agent unit tests; one new thread-less unit test calling
`executeToolWithStatus` for a Shopify read + `search_kb` on a minimal `BaseAgentContext` (no
`thread`/`customer`, stub `escalate`), asserting no throw. Final gate: full support eval suite green
at baseline, `EVAL_REPEATS=3` — iterate on single fixtures while developing, run the full suite once
at the end.

---

## Track 2 — Extract the agent core into a shared package *(M–L; depends on Track 1)*

Move `runAgent`/`planAgent`/tools/prompt/context into a workspace package (`@clerk/agent`,
alongside `@clerk/db`) so both apps import it and the host becomes a deployment decision.

- 🔶 **Extract** the core (`lib/agent/{run,planner,executor,prompt,context,settings,intent,
  plan-preview,tools/*,shopify/*}`) into the package. Keep public entry points narrow:
  `runAgent`, `planAgent`, `buildContext`/`buildOrderOpsContext`, `selectAgentTools`,
  `classifyHomePlan`, and the policy surface. **`lib/agent/api/*` stays in the dashboard** — it is
  Next route glue (auth, errors, plan-cache, sessions), not core.
  - [x] **done (Phase 2):** `settings` (+ `usage`, `spend`, and the `ai/*` client) moved into the package.
  - [ ] **remaining:** `run`, `planner`, `executor`, `prompt`, `context`, `intent`, `plan-preview`,
    `tools/*`, `shopify/*` — gated behind the I/O sink seam (so `tools/thread.ts` can stay in the dashboard).
- 🔶 **Resolve the dashboard couplings the core carries today.** The core imports ~15 `@/lib/*`
  modules; each is resolved one of three ways — **move into the package** (agent-domain code),
  **inject via the context** (dashboard-specific I/O, the Seam 2 pattern), or **leave in the
  dashboard** (route glue). See the coupling table below.
  - [x] **done (Phase 2):** `@/types` agent subset (moved + re-exported); `@/lib/ai` + `@/lib/ai/anthropic`
    (moved); `@/lib/server/logger` for `spend.ts` (resolved with the package's console `logger.ts` — the
    full inject-host-logger seam still owed when `run`/`planner`/`tools/thread` move).
  - [ ] **remaining:** `@/lib/messaging/thread-constants` (move); the messaging I/O sink for `tools/thread.ts`
    (inject — the one new seam); `recordAgentActionsBatch` (move as core); `@/lib/server/refund-spend`
    (move to `@clerk/db`); `@/lib/server/{ops-alerts,agent-failure-alerts}` types (move with the core; already injected).
- 🔶 **Consolidate the duplication the two apps already carry** (extraction's real payoff — paying
  down existing debt, not new abstraction). **Status:** the package now owns the dashboard-side halves
  of the spend wrapper and the Anthropic client (Phase 2); **all four gateway-side consolidations below
  remain** (gateway untouched so far — this is the later "gateway dedup" step). Current state matters here:
  - gateway `llm-spend.ts` ↔ dashboard `lib/agent/spend.ts` — **already mostly done**: the pricing,
    nano-dollar math, Postgres counter, and `SpendCapError` live in `@clerk/db` (`llm-spend.ts` +
    `spend-store.ts`). What remains are two ~45-line wrappers that collapse into one in `@clerk/agent`.
  - gateway `getAnthropic()` (`message-handlers/shared.ts:49`) ↔ dashboard `lib/ai/anthropic.ts` —
    one Anthropic client + `buildCachedSystemPrompt` + `pickModel` tiering, owned by the package.
  - gateway `customer-memory-summarizer.ts` ↔ dashboard memory reads — `@clerk/db/customer-memory`
    already owns the shared types/constants; finish the seam (the summarizer's model call routes
    through the package AI client).
  - gateway raw Shopify `fetch` (`message-handlers/shared.ts:lookupShopifyCustomerName`) ↔ the
    throttled `shopify/client.ts`. Promote the gateway to the real client during extraction (closes
    the "gateway bypasses the Shopify seam" crack from the prior plan).
- 🔶 **Both apps depend on the package.** Dashboard API routes call the core in-process (no behavior
  change, preserved via re-export shims). Gateway gains the ability to run the core in-process
  (used first by Track 3).
  - [x] **done (Phase 2):** dashboard depends on `@clerk/agent` — `@/types` re-exports the type subset and
    the `@/lib/ai`, `@/lib/ai/anthropic`, `@/lib/agent/{settings,spend,usage}` shims route through the package.
  - [ ] **remaining:** dashboard routes call the *actual core* (`runAgent`/`planAgent`) in-process once it
    moves; gateway adds `@clerk/agent` as a dependency and runs the core in-process (first used by Track 3).
- [x] **Build/types:** match the `@clerk/db` ESM dual-package setup (runtime `dist/*.js` + `.d.ts`,
  `type: module`, `exports` map, `tsc` build, turbo `predev`/`build` wiring). Extend
  `scripts/check-module-structure.mjs` `SCAN_ROOTS` to cover the package. **Done** — `packages/agent/`
  scaffolded (`package.json`/`tsconfig.json`/`src/index.ts`), wired into workspaces + root `predev`,
  `SCAN_ROOTS` extended; builds clean, `import('@clerk/agent')` resolves under NodeNext.

**Exit:** dashboard-hosted support paths behave identically (same eval baseline, `EVAL_REPEATS=3`);
gateway builds and can `import { runAgent }` from `@clerk/agent` and execute the core in-process.

**Anti-overbuild guard:** extract for the **two real consumers** (gateway worker, dashboard). Do
not design an "agent SDK" with versioned plugin contracts. Narrow entry points, no speculative API.
The injected-I/O sink (below) is the *one* new seam — it is forced by the extraction (the executor
cannot import Postmark into a shared package), not speculative.

### Track 2 — implementation plan (code-grounded)

The invariant, same as Track 1: **the dashboard support path does byte-for-byte what it does today.**
Extraction is a code-location move plus one forced seam (the I/O sink); it is "safe" iff the eval
baseline stays green. The package is built for exactly two consumers (dashboard, gateway worker) and
no third. Track 2 does **not** build a thread-less caller (Track 3) — it makes the core importable
and host-agnostic.

**The coupling table (the design crux).** Every `@/lib/*` / `@/types` import the core carries today,
and how Track 2 resolves it:

| Dashboard dep (today) | Used by | Resolution |
|---|---|---|
| `@/types` (`OrgSettings`, `AgentPlan`, `RawToolCall`, `PlanStep`, `ToolCategory`, `SampleReply`) | everywhere (31×) | **Move** the agent subset of `src/types/index.ts` into `@clerk/agent`; dashboard `@/types` re-exports them. |
| `@/lib/ai` + `@/lib/ai/anthropic` (client, `buildCachedSystemPrompt`, `pickModel`, model IDs, `ModelTask`) | `run.ts`, `planner.ts` | **Move** into the package. Subsumes gateway `getAnthropic()`. (Note `lib/ai/index.ts` already imports `spend`/`settings`/`usage` — those move too, so the cycle becomes package-internal.) |
| `@/lib/messaging/thread-constants` (`isOperatorChannel`, `AGENT_NOTE_PREFIX`, `THREAD_STATUS`, `CHANNEL_TYPE`) | `context`, `intent`, `prompt`, `tools/thread` | **Move** into the package (channel/thread domain constants); dashboard messaging imports them back from `@clerk/agent`. |
| `@/lib/server/logger` | `run`, `planner`, `spend`, `tools/thread` (9×) | **Inject.** Add an optional `logger` to the runtime deps (default no-op); each app passes its pino. Keeps logging config out of the package. |
| `@/lib/messaging/*` (`dispatch-message`, `email`, `email/reply`, `provider-send-failures`) + `@/lib/server/{outbound-recorder,gateway-url,customer-memory}` | **`tools/thread.ts` only** | **Inject — the one new seam.** See "I/O sink" below. These drag Postmark/IG/email providers; they must not enter the package. |
| `api/agent-actions.ts` (`recordAgentActionsBatch`) | `run.ts` | **Move** into the package as core. It is a module-agnostic `AgentAction` DB writer (already null-`threadId`/`customerId` safe) — Track 3 order-ops writes the same rows. It is mis-homed under `api/` today. |
| `@/lib/server/refund-spend` (daily refund-cap counter) | `tools/executor.ts` | **Move to `@clerk/db`** alongside `llm-spend.ts`/`spend-store.ts` — it is a sibling Postgres counter, not agent logic. |
| `@/lib/server/{ops-alerts,agent-failure-alerts}` | `run.ts` | **Already injected** via the `failureCounterClient`/`failureRoute` `RunAgentOptions` — keep as-is; the types move with the core. |
| `@clerk/db`, `shopify/*` | core | **No change.** `@clerk/db` stays a dependency; `shopify/*` is already self-contained (zero `@/` imports) and moves wholesale. |

**The I/O sink — the one forced seam** (`types.ts`, `tools/executor.ts`, `tools/thread.ts`,
`context.ts`). After Track 1, the executor still dispatches the five thread-coupled tools
(`add_internal_note`, `send_reply`, `send_email`, `update_thread_status`, `update_thread_tag`) by
directly importing `./thread`, which imports the dashboard messaging stack. A shared package cannot
import Postmark. So generalize Seam 2's injected `escalate` into a small injected I/O object on
`BaseAgentContext` (e.g. `io?: { sendReply; sendEmail; addInternalNote; updateThreadStatus;
updateThreadTag }`), resolved lazily exactly like `threadContextOf`:
- The executor's thread-tool branches call `ctx.io?.sendReply(...)` etc., returning the existing
  defensive `noThread`/no-op when absent (never hit on the support path — these tools are filtered
  out of any thread-less tool set).
- The current `tools/thread.ts` implementation **stays in the dashboard** and becomes the support
  `io` sink, wired in `buildContext` next to the `escalate` sink. Postmark/IG/email/outbound-recorder
  never move. `escalateToHuman` (already the support `escalate` sink) lives alongside it.
- Net effect: `@clerk/agent` owns orchestration + Shopify + KB + prompt + policy; the dashboard owns
  outbound delivery and route glue. The boundary is "does it touch a message provider or an HTTP
  request" → dashboard; "does it decide what to do" → package.

**Package scaffold** (mirror `@clerk/db`) — ✅ **DONE (Phase 1).** Created `packages/agent/` with
`package.json` (`name: @clerk/agent`, `type: module`, `main`/`types` → `dist/`, `exports` map,
`build: tsc`, `dependencies: @anthropic-ai/sdk@0.80.0` + `@clerk/db`), `tsconfig.json`
(extends `tsconfig.base.json`, `NodeNext`, `rootDir: src`, `declaration: true`), and
`src/index.ts` (placeholder barrel). Wired into root `workspaces` (already `packages/*`), root
`predev` (`build -w packages/agent`, after `@clerk/db`), and turbo `build` (via `^build`). **ESM
decision (settled):** option (a) — **plain `tsc` under `NodeNext`, all relative imports authored with
`.js` extensions**, mirroring `@clerk/db`'s own convention (`from './crypto.js'`). No bundler, no
`rewriteRelativeImportExtensions`. This is the mechanical convention for every file moved in later
phases. Verified: package builds, emits `dist/{index.js,index.d.ts}`, resolves at runtime under
NodeNext, and `check-module-structure` passes with the new root scanned.

**Mechanical move + shims (the no-churn lever).** `git mv` the extraction set into
`packages/agent/src`, rewrite `@/...` imports per the table (package-internal, injected, or
`@clerk/db`). Then keep dashboard call sites unchanged with **re-export shims**: `@/lib/agent/runner`,
`@/lib/agent/settings`, `@/lib/ai`, and the agent slice of `@/types` re-export from `@clerk/agent`.
This is what makes "no behavior change" true without editing ~40 routes/components. The route glue in
`lib/agent/api/*` keeps importing through these shims.

**Dedup consolidation** (after the move compiles): delete gateway `llm-spend.ts` and dashboard
`lib/agent/spend.ts` in favor of the package's spend wrapper; point gateway
`message-handlers/{shared,intelligence}.ts` and `maintenance/*` at the package AI client (drop
`getAnthropic`); replace gateway `lookupShopifyCustomerName`'s raw `fetch` with the package's
`shopify/client.ts` request helper.

**Ordering:** ~~scaffold + ESM decision~~ ✅ **(Phase 1 done)** → ~~move types & AI client~~ ✅
**(Phase 2 done)** → **[next]** I/O sink seam (so `tools/thread.ts` can stay behind) →
move remaining core + re-home `agent-actions`/`refund-spend` → re-export shims (dashboard compiles) →
gateway dedup → build/CI wiring.

**Phase 2 done (move types & AI client).** Moved into `@clerk/agent`: the agent type subset
(`OrgSettings` + `AgentToolPermissions`, `SampleReply`, `ToolCategory`, `RawToolCall`, `PlanStep`,
`AgentPlan` → `src/types.ts`), the Anthropic client + tiering (`src/ai/{anthropic,index}.ts`,
subsumes nothing on the gateway yet — that's the later dedup step), and the three deps the AI client
drags (`src/{settings,spend,usage}.ts`). `spend.ts`'s `@/lib/server/logger` import resolved with a
minimal console-backed `src/logger.ts` (the full inject-host-logger seam is deferred to the
remaining-core move). Dashboard `@/types` re-exports the type subset; re-export shims at
`@/lib/ai`, `@/lib/ai/anthropic`, `@/lib/agent/{settings,spend,usage}` keep ~30 call sites unchanged.
`generateText`'s unit test moved into the package with a minimal `vitest.config.ts` + `test:unit`
script; `packages/agent/src/**` wired into the root ESLint flat config. Verified: both packages and
both apps typecheck clean (only pre-existing dashboard `*.test.ts` quirks remain), package + dashboard
unit suites green, `lint:structure` + package ESLint clean. **Not yet run: full integration + eval
baseline — that is the end-of-Track-2 gate, to run once after the remaining phases, not per-phase.**

**Verification:** package `tsc` build clean; both apps typecheck; full agent unit + integration
green; **eval baseline green at `EVAL_REPEATS=3`** (the gate); gateway builds and a smoke
`import { runAgent } from "@clerk/agent"` resolves at runtime under NodeNext. Run the full eval suite
once at the end, not per-step.

**Open decisions (set when the work reaches them):** (1) logger — inject (recommended) vs. the
package owning a thin pino; (2) the eval suite (`__evals__`) — stay in `apps/dashboard` importing
`@clerk/agent` (recommended, no harness change) vs. move into the package.

---

## Track 3 — Order operations (module #2), Shape B *(M; depends on Track 2)*

Event-driven, thread-less, flag/notify-only. Runs **in-process in the gateway worker**, not via the
spike's HTTP hop. Rebuild the Track 4 spike (`order-ops/*`, `order-risk-monitor.ts`) on the real
Track 1 seams; delete the forked dispatch.

- [ ] **Trigger: event-driven per order.** Enqueue one review job on the Shopify `orders/create`
  webhook (already ingested by `webhooks-shopify.ts`). Idempotent on order id (review each order
  once). Keep a low-frequency scheduled sweep only as a backstop for missed webhooks — not the
  primary path.
- [ ] **Run** `runOrderOps` on the extracted core via the injected finding sink (Seam 2). Pre-scan
  risk signals (billing/shipping mismatch, high-value new customer, payment-not-captured) stay as
  the cheap deterministic pre-filter; the model only runs on flagged candidates.
- [ ] **Output: flag/notify only.** A finding becomes an `AgentAction` row
  (`threadId`/`customerId` null — already supported) plus a merchant notification (Telegram / a
  dashboard review surface). **No Shopify mutations.** No customer contact in v1.
- [ ] **Autonomy: live behind `ORDER_RISK_MONITOR_ENABLED` with monitoring, no shadow.** Blast
  radius is a dismissed flag; the blast-radius gate (Decision #6) puts this in the "ship behind a
  flag" bucket.
- [ ] **Evals: a handful of order-ops fixtures, written when the behavior is worth gating** — not a
  generalized fixture-schema rework. Let the schema's real shape emerge from 2–3 concrete fixtures.

**Exit:** order-ops reviews real `orders/create` events in-process in the worker, persists findings,
notifies the merchant, and the support suite is untouched.

**When order-ops later gains its first *mutating* action** (auto-cancel suspected fraud, auto-correct
an address): *that action* — not the whole module — inherits the redefined per-module shadow→live
ramp (Decision #6). Out of scope here; noted as the trigger.

---

## Track 4 — Repoint support to the in-process worker *(M; last; incremental)*

Once the core is a package and the worker runs order-ops in-process, migrate support's
**gateway-triggered** paths off the HTTP hop — one trigger at a time, never big-bang.

- [ ] **Support auto-plan:** the worker calls the core in-process instead of
  `POST /api/agent/plan-internal`.
- [ ] **Telegram operator runs:** call the core in-process instead of `POST /api/agent/internal`.
- [ ] **Leave dashboard UI-initiated paths** (composer-ask, concierge, UI approve/quick-approve)
  calling the core in-process in Next, or have them call the gateway — a minor, later choice. No
  urgency; they are a minority of traffic and already work.
- [ ] Retire the internal HTTP routes only after their callers are migrated.

**Exit:** the majority of agent runs (channel-triggered) execute in the durable worker with no
network hop; the dashboard keeps working throughout.

**Anti-overbuild guard:** this is "repoint the trigger," not "rewrite the runtime." If a step looks
like a rewrite, the package boundary from Track 2 is wrong — fix that, don't power through.

---

## Track 5 — Channel surface: WhatsApp *(M; parallel / later)*

Only when channel expansion is actually scheduled. Not on the critical path for modules.

- [ ] **Split the `ChannelType` enum** into *channel* (email/ig/shopify/sms/whatsapp/…) vs *agent
  surface/mode* (currently `dashboard_agent`/`sms_agent` are jammed into the channel enum). Do this
  **as part of the WhatsApp work**, not before — order-ops adds no channel, so the split is not
  needed earlier.
- [ ] **WhatsApp adapter** via the existing Meta app (Cloud API; same vendor as IG DM). Slot into
  the same inbound→core→outbound path the channel interface defines.
- [ ] **iMessage:** keep the channel interface able to accept a third-party adapter (Sendblue /
  LoopMessage / self-hosted bridge) without core changes. Do not build it; do not let its
  constraints shape the core.

---

## Freeze / trim list (overbuild discipline)

Already-built systems that are ahead of the traffic that justifies them. **Do not extend these.**
The cost is sunk; the move is to stop pouring in, not to rip out (except where noted).

- **Shadow/canary rig** (`AutonomyShadowDecision`, readiness aggregation, `/dashboard/review`
  card): freeze. Add no further readiness analytics until real auto-execute traffic populates it.
- **Five autonomy tiers:** collapse the **UI** to three buckets ("draft everything" / "handle easy
  stuff, ask on money" / "just run it"); keep the five-value machinery underneath if convenient. Do
  not surface `broad`/`full` "coming soon" to merchants.
- **LLM spend split by model** (`llm_daily_spend` per-model rows): do not extend. One daily $ cap is
  what a solo merchant needs.
- **Voice-learning loop** (`VoiceEdit` → synthesis → `voiceProposal`): keep, do not extend (no
  per-tag voice models etc.) until merchants are correcting drafts at volume. The manual path
  (`brandVoice` + `sampleReplies`) already delivers most of the value.
- **Playbooks** (`Playbook`/`PlaybookRun` + routes): evaluate for **deletion**. The agent is the
  automation; a parallel rules-engine table is redundant surface. (Confirm it's unused first.)

## Explicitly deferred (not in this plan)

- Business-level operational memory (Decision #4).
- `ChannelType` split → folded into Track 5 (WhatsApp), not before.
- Generalized eval fixture schema → only when a module's behavior is worth gating (Track 3 writes a
  few fixtures, no schema rework).
- Distributed/global Shopify rate limiter → the in-process per-shop bucket is fine at solo-merchant
  volume; revisit when concurrent write-heavy modules hammer one shop.
- LLM-provider outage handling / fallback → still deliberately out of scope (carried from prior plan).

---

## Sequencing & effort

| Track | What | Effort | Depends on |
|------|------|--------|-----------|
| 0 | Decide A vs B (recommend B) | — | — |
| 1 | Thread-optional core (3 seams) | M | 0 |
| 2 | Extract core → `@clerk/agent` + de-dupe | M–L | 1 |
| 3 | Order-ops #2 (event-driven, flag-only, in-worker) | M | 2 |
| 4 | Repoint support to in-process worker | M | 2, 3 |
| 5 | WhatsApp surface + `ChannelType` split | M | parallel/later |

Critical path: **0 → 1 → 2 → 3 → 4.** Track 5 is independent.

## Decisions still open (set when the work reaches them, not now)

1. **Per-module mutation ramp thresholds:** when order-ops (or any module) gains its first mutating
   action, the redefined-shadow agreement bar / spot-check window before it goes live. Set when the
   first mutation is actually proposed.
2. **Dashboard UI-initiated execution host:** in-process in Next vs call the gateway. Decide during
   Track 4; low stakes either way.
3. **Customer contact from proactive runs:** thread-spawn vs thread-less `send_email`. Decide when a
   module first needs to contact a customer (not order-ops v1).

## Guardrails carried through every track

- **Factor for the two real consumers, never the hypothetical third.** Two concrete modules is the
  minimum to factor an abstraction honestly.
- **The support eval suite is the safety net.** Any core refactor (Tracks 1, 2, 4) is "safe" iff the
  support baseline stays green. That suite is the entry gate, exactly as it is for the autonomy raise.
- **Move risk to the net-new path.** Order-ops absorbs the extraction's rough edges; the working
  support path is migrated last and incrementally.
