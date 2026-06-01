# Clerk — Remediation & Hardening Plan

## Decisions driving this plan

- **Model:** Sonnet on mutative/judgment paths, Haiku elsewhere.
- **Horizon:** Harden support to ship **and** generalize the core to be module-agnostic. Do **not** build module #2 (order ops) yet — only leave its seams.
- This is the strategy doc; execution starts at Phase 0.1 on approval.

## Framing

Two facts shape the sequencing:

1. **The engine is reusable; the chassis isn't.** The run loop, tool dispatch, policy/autonomy, audit, spend, escalation, and eval harness are ~80% module-agnostic and in good shape. The *context layer* (`context.ts`, `prompt.ts`) and the *dashboard's* Shopify access are support-coupled. We generalize the chassis without rewriting the engine.
2. **Nothing gets refactored until drift is measurable.** The eval harness is excellent but reports pass/fail per run with no persisted score (`pass: failures.length === 0` in `__evals__/runner.ts`). Every refactor below (especially the prompt and the model swap) can silently degrade judgment. So a scored, tracked baseline is the literal first task and gates everything after it.

### Corrections to the original analysis (verified in code)

- **`shopify/client.ts` exists and is solid** — timeout, 429/5xx retry honoring `Retry-After`. All six agent *tool* modules (orders, refunds, tracking, customers, products) already route through it. The "common integration layer is aspirational" claim is stale. What's true: `context.ts`, `api/internal.ts`, and **7 dashboard CRUD routes** still bypass it with raw `fetch`, and there is **no cross-call rate limiting** — the retry is per-call only.
- **`prompt.ts` is already partly decomposed** into helpers (`buildCustomerMemorySection`, `buildGuardrailClauses`, `buildAutonomySection`). The skeleton/module split still doesn't exist, but it's not a from-scratch 260-line monolith.
- **KB retrieval is weaker than "keyword LIKE"** — it's `take: 3` most-recently-updated articles, then a tag-equality filter. No embeddings/pgvector anywhere. Treat semantic retrieval as a real feature add, not a swap.

Verified as accurate: live agent on Haiku (`AI_MODEL = claude-haiku-4-5`), memory summarizer + eval judge on Sonnet (`gateway/constants.ts`, `judge.ts`) — the inversion is real; control flow keyed on result strings (`result.toLowerCase().startsWith("error:")` in `executor.ts`; planner warning regexes); injection defense is a regex denylist (`INJECTION_PATTERNS` / `sanitizeUserInput` in `gateway/src/message-handlers/shared.ts`).

Effort key: **S** ≈ ≤1 day, **M** ≈ 2–4 days, **L** ≈ 1–2 weeks.

---

## Phase 0 — Lock the safety net *(do before touching anything)* [COMPLETED]

**Goal:** make agent quality a number you watch over time, so the model swap and prompt refactor can be proven non-regressive.

| # | Workstream | Files | Effort | Risk |
|---|---|---|---|---|
| 0.1 | **Scored, persisted eval baseline.** Extend `__evals__/runner.ts` to emit an aggregate + per-category pass-rate and write a JSON snapshot (e.g. `__evals__/baseline.json`). Add a compare step that fails CI / flags when aggregate drops > threshold vs the committed baseline. | `__evals__/runner.ts`, `__evals__/index.test.ts`, new `baseline.json` | M | Low | [COMPLETED]
| 0.2 | **Judge-on in a gated scored run.** Today the judge is off in CI (`isJudgeEnabled`). Add a separate, non-blocking scored job that runs *with* the judge so subjective rubric drift is tracked, without making CI flaky/expensive. | `__evals__/judge.ts`, CI config | S | Low | [COMPLETED]
| 0.3 | **Capture the current number.** Run the suite, commit the baseline, record per-category scores so we know what the score was before any change. | — | S | — | [COMPLETED]

**Baseline captured (2026-06-01, judge-off to match the CI gate):** aggregate **30/39 (76.9%)**, committed to `__evals__/baseline.json`. Per-category — address-change 3/3, brand-voice 2/2, cancel 2/2, kb 2/2, multi-step 2/2, no-tool 1/1, operator 3/3, order-status 5/5, prompt-injection 2/2, quick-reply 2/2 (all 100%); tier 3/5, memory 2/3, refund 1/3, **escalate 0/3**, sample-reply 0/1.

The 9 failures cluster on one axis — **the agent under-escalates**: all three `escalate` fixtures, `refund-over-cap-escalate`, `memory-complaint-pattern-escalates`, and `tier-watch-refund-draft-only` drafted a reply (or an empty plan) instead of calling `escalate_to_human`; `refund-under-cap` skipped the approved refund; `tier-trusted-refund-under-cap` mis-classified as `needs_review` (sample-reply's miss is a minor phrasing check). This is exactly the judgment weakness **1.1 (Sonnet on mutative/judgment paths)** is meant to move — the baseline now makes that delta measurable. Caveat: the suite is LLM-nondeterministic and the escalation categories are small (1–3 fixtures), so they're the most likely to flap run-to-run; the 5% default gate threshold absorbs some jitter.

**0.2 done:** the judge-scored CI job is wired. `evals.yml` now carries a second job, `agent-evals-judge`, with `RUN_JUDGE_EVALS=1`, gated to `workflow_dispatch` + a nightly `schedule` (never on PRs, to cap per-push Sonnet spend) and marked `continue-on-error: true`. It re-uses the existing `RUN_JUDGE_EVALS` gate in `runner.ts` (no production code touched). Because it compares against the judge-off `baseline.json`, extra rubric failures may drop the aggregate — that's expected; the job is a non-blocking drift signal, not a gate, and surfaces its `[eval:summary]` per-category scores in the step summary. The PR gate (`agent-evals`) stays judge-off and is excluded from the nightly so it doesn't double-spend. The captured baseline above is judge-off by design, matching the conditions that gate runs under.

**Exit criteria:** a committed baseline ✅; a CI signal that goes red on regression ✅ (aggregate-drop > threshold throws in `index.test.ts` `afterAll`); the judge-scored job runs on demand ✅ (0.2 — `agent-evals-judge` in `evals.yml`, `workflow_dispatch` + nightly). *No production code touched.*

---

## Phase 1 — Generalize the core + pay down the load-bearing debt

**Goal:** the engine becomes module-agnostic; the support-specific bits compose onto it; the integration seam is finished and rate-safe; the model is tiered. Re-run Phase 0 evals after **each** item.

### 1.1 — Model tiering: Sonnet on judgment/mutative paths *(M, medium risk)*
Today `AI_MODEL` is one constant. Introduce a model-selection seam so the *decision-making* calls that can lead to mutations run on Sonnet, while reads/drafts/summaries/classification-tagging stay on Haiku.
- Concretely: the **planner's re-plan call** (the one that decides whether to refund/cancel/edit) and the **`classifyHomePlan` auto-execute gate** → Sonnet; read-tool execution, `send_reply` drafting, composer-ask, gateway summaries → Haiku.
- Keep it a single function (`pickModel(context)`) threaded through, mirroring the existing `AI_MODEL` discipline so it stays one place.
- **Measure the delta against the 0.1 baseline** — this is exactly why Phase 0 comes first. If Sonnet doesn't move the score on mutative fixtures, don't pay for it.
- Files: `lib/ai/index.ts`, `lib/agent/planner.ts`, `lib/agent/run.ts`, `plan-preview.ts`.

### 1.2 — Finish the Shopify integration seam + make it rate-safe *(M, medium risk — top scale concern)*
- Route the **7 dashboard CRUD routes** + `context.ts` + `api/internal.ts` through `shopify/client.ts`. Kill the inline `admin/api/${SHOPIFY_API_VERSION}` literals and raw `fetch`.
- Add the missing piece the client *doesn't* have: **cross-call throttling**. Per-call single-retry doesn't stop concurrent auto-pilot runs from stampeding the 2 req/s leaky bucket. Add a per-shop concurrency limiter / token-bucket in the client (or a small queue) so parallel runs back off cooperatively, not just individually on 429.
- Files: `shopify/client.ts`, `context.ts`, `api/internal.ts`, `app/api/shopify/*`, `app/api/orders/route.ts`, `app/api/integrations/shopify/*`.

### 1.3 — De-string-key the control flow *(S, medium risk)*
Brittle today: `executor.ts` infers status via `result.toLowerCase().startsWith("error:")`; the planner derives warnings via regexes on lowercased tool output. A wording change silently breaks spend accounting / warning suppression.
- Have tool implementations return a structured result (`{ status, message, data }`) and let the executor/planner branch on `status`, keeping the string only for the model-facing text.
- Files: `tools/executor.ts`, `tools/thread.ts`, `shopify/*.ts`, `planner.ts`.

### 1.4 — `BaseAgentContext` extraction *(M, medium risk)*
Split `AgentContext` into a base (`org`, `settings`, `memory`, `channel`, `tools`) + a composed `SupportContext` (thread, customer, recentOrders, kbArticles, shopify linkage). `buildContext()` becomes "build base, then compose support." No behavior change — pure shape refactor that unblocks future modules.
- Files: `lib/agent/types.ts`, `context.ts`, consumers in `planner.ts`/`run.ts`/`prompt.ts`.

### 1.5 — Prompt skeleton + module blocks *(M, highest regression risk)*
`prompt.ts` already has helpers; add the structural split: a shared skeleton (identity, autonomy, guardrails, voice, memory) + a **support instruction block** injected as a module. This is the change most likely to move eval scores — do it last in Phase 1, isolated, and diff the baseline before/after.
- Files: `prompt.ts`.

### 1.6 — Tool registry grouping *(S, low risk)*
Group the 20 tools by capability/module and formalize per-module subsets through the existing `selectAgentTools` allow-list. The seam exists; this is organization, not new machinery.
- Files: `tools/registry.ts`.

**Exit criteria:** eval baseline ≥ pre-Phase-1 score; zero raw Shopify `fetch` outside `client.ts`; Shopify calls throttle under concurrency; tool results structured; support context composes on a base; prompt split with no score regression.

---

## Phase 2 — Ship V1 support

**Goal:** a support product solid enough to depend on. Generalization is done; now finish the user-facing surface and the safety gaps.

| # | Workstream | Effort | Notes |
|---|---|---|---|
| 2.1 | **Production output-sampling surface.** A way to eyeball real agent outputs (drafts sent, actions taken) — you're flying on evals alone. Pipe from the existing `AgentAction` audit table into a review view. | M | Highest-leverage quality gap. Reuses audit infra. |
| 2.2 | **Structured-command texting / daily-summary.** Telegram operator + digests exist; make the SMS/structured-command summary a first-class V1 deliverable. | M | Builds on `OperatorContext` + maintenance digests. |
| 2.3 | **Prompt-injection strategy, not a denylist.** `sanitizeUserInput` is a regex denylist feeding an agent that can refund/cancel. Autonomy caps are the real backstop (keep), but as supplier email / social DMs feed the agent, harden input handling (structural quoting/segregation of untrusted text in the prompt, not pattern-matching). | M | Caps already mitigate; this reduces blast radius. |
| 2.4 | **Close V1-path stub pages.** Audit the 18 dashboard routes; finish the ones on the support critical path. | M | Scope depends on how stubby — needs a sizing pass. |
| 2.5 | **Brand-voice correction loop (decision needed).** Today: free-text + tagged sample replies, prompt-injected. If "training" means "you edited my draft → I learn," that's net-new and needs a scope call. | S–L | Flag for decision before building. |

**Deferred out of V1 (Phase 3 candidates):** KB semantic retrieval (real feature: needs embeddings + pgvector/store + retrieval — defer unless support quality on policy questions demands it); single-LLM-vendor fallback / graceful-degradation queue (real availability risk, but heavy — decide explicitly).

**Exit criteria:** output sampling live; structured-summary surface shipped; injection handling beyond denylist; no stub on the support happy path; brand-voice scope decided.

---

## Phase 3 — Design seams for generality *(design only — no module #2 build)*

Since we're generalizing but **not** building order-ops yet, Phase 3 is lightweight: leave the right seams so module #2 is cheap when it comes, without speculative schema migration.

- **Don't add `channelType ===` branches you don't have to.** Every one is future tax against the closed Postgres enum. Note the constraint; don't migrate the schema yet.
- **Sketch (don't build) general memory entities** (merchant/supplier/product) reusing CustomerMemory's bound-on-write pattern, so a second memory system isn't bolted on later.
- **Decide agent-vs-playbook ownership of proactive work** before a module forces it — two automation mental models (the rules engine and the agent) will confuse the architecture otherwise.
- **The real test of generality** (does non-conversational, entity/monitoring work fit the generalized core?) is deferred to when order-ops is actually scheduled — by design, with the refactored chassis ready.

---

## Dependencies & sequencing rules

- **0 → everything.** No refactor merges without the baseline green.
- Within Phase 1: **1.1 (model) and 1.5 (prompt) are the two score-movers** — do them isolated, one at a time, baseline-diffed. 1.2/1.3/1.4/1.6 are lower-risk and can interleave.
- Phase 2 can start once Phase 1's chassis is stable; 2.1 (output sampling) is worth pulling early since it improves visibility for everything else.
- 2.5 (voice training) and the Phase-3 deferrals (semantic KB, vendor fallback) each need an explicit scope decision before they enter a sprint.
