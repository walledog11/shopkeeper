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

## Phase 1 — Generalize the core + pay down the load-bearing debt [COMPLETED]

**Goal:** the engine becomes module-agnostic; the support-specific bits compose onto it; the integration seam is finished and rate-safe; the model is tiered. Re-run Phase 0 evals after **each** item.

### 1.1 — Model tiering: Sonnet on judgment/mutative paths *(M, medium risk)* [COMPLETED]
Today `AI_MODEL` is one constant. Introduce a model-selection seam so the *decision-making* calls that can lead to mutations run on Sonnet, while reads/drafts/summaries/classification-tagging stay on Haiku.
- Concretely: the **planner's re-plan call** (the one that decides whether to refund/cancel/edit) and the **`classifyHomePlan` auto-execute gate** → Sonnet; read-tool execution, `send_reply` drafting, composer-ask, gateway summaries → Haiku.
- Keep it a single function (`pickModel(context)`) threaded through, mirroring the existing `AI_MODEL` discipline so it stays one place.
- **Measure the delta against the 0.1 baseline** — this is exactly why Phase 0 comes first. If Sonnet doesn't move the score on mutative fixtures, don't pay for it.
- Files: `lib/ai/index.ts`, `lib/agent/planner.ts`, `lib/agent/run.ts`, `plan-preview.ts`.

**Done (2026-06-01).** `pickModel(task)` added in `lib/ai/index.ts` (`HAIKU_MODEL`/`SONNET_MODEL`; `AI_MODEL` kept as a Haiku alias for non-agent calls). Threaded through the planner (`response1`/`response2` Haiku, **`response15` re-plan Sonnet**) and `run.ts` (mutative loop Sonnet, read-only composer-ask Haiku). `recordSpend` and the per-call logs now carry the actual model. `plan-preview.ts` needed no model change — `classifyHomePlan` is a pure gate with no LLM call, and the auto-execute path runs approved tool calls with no further model decision, so its "→ Sonnet" requirement is satisfied transitively by the Sonnet re-plan that produced the plan.

**Eval delta (one judge-off run vs the committed baseline): aggregate 30/39 → 32/39.** Gains: `escalate` 0/3 → 2/3, `memory` 2/3 → 3/3. Regression: `order-status` 5/5 → 4/5 (`order-status-unresolved-customer` now *over*-escalates — searches then escalates where a reply-for-more-info was expected). `refund`/`tier`/`sample-reply` unchanged. The aggregate regression gate stays green (score rose); the `order-status` category drop is a non-blocking WARN. The escalate gains come from fixtures that read first (decision lands in the Sonnet `response15`); the spend is justified per the "must move the score" rule.

**Left alone (deliberate, not yet done):**
- **`response1` stays on Haiku.** So no-read judgment calls — notably `escalate-out-of-scope`, which decides without a lookup — still land on Haiku and under-escalate. Promoting `response1` to Sonnet would likely fix it but taxes *every* quick-reply (the dominant path); deferred pending a cost/score decision.
- **`baseline.json` not re-committed.** A single LLM-nondeterministic run with a fresh `order-status` regression isn't a safe basis to move the gate. Re-run to confirm before `UPDATE_EVAL_BASELINE=1`.
- **`order-status-unresolved-customer` regression unaddressed.** Watch whether it's a genuine over-escalation tendency or run-to-run flap on the next eval pass.
- **Prompt-cache eval test repaired as a side effect.** Tiering split the planner's two same-model calls, which the old test relied on; replaced with a standalone single-model `probeSystemPromptCacheRead` in `runner.ts`. (Aside: `claude-haiku-4-5` doesn't cache a ~4k-token prefix but does at ~8k.)

### 1.2 — Finish the Shopify integration seam + make it rate-safe *(M, medium risk — top scale concern)* [COMPLETED]
- Route the **7 dashboard CRUD routes** + `context.ts` + `api/internal.ts` through `shopify/client.ts`. Kill the inline `admin/api/${SHOPIFY_API_VERSION}` literals and raw `fetch`.
- Add the missing piece the client *doesn't* have: **cross-call throttling**. Per-call single-retry doesn't stop concurrent auto-pilot runs from stampeding the 2 req/s leaky bucket. Add a per-shop concurrency limiter / token-bucket in the client (or a small queue) so parallel runs back off cooperatively, not just individually on 429.
- Files: `shopify/client.ts`, `context.ts`, `api/internal.ts`, `app/api/shopify/*`, `app/api/orders/route.ts`, `app/api/integrations/shopify/*`.

**Done (2026-06-01).** Every raw Shopify `fetch` and inline `admin/api/${SHOPIFY_API_VERSION}` literal outside `client.ts` is gone (verified by grep). Migrated: `orders`, `shopify/products`, `shopify/customers` (GET list + POST), `shopify/customers/search`, `shopify/customer` (GET + PATCH + product-image enrichment), `integrations/shopify/kb-sync`, `integrations/shopify/callback` (`shop.json` + webhook registration; the OAuth `access_token` exchange stays raw — it's not an Admin-API call), plus `context.ts` and `api/internal.ts`.
- **Cross-call throttling added.** `client.ts` now holds a per-shop in-process **token bucket** (40 burst, 2 req/s refill, FIFO queue) acquired before every request, so concurrent agent/autopilot runs against one shop pace their request *starts* under the leak rate cooperatively — not just each backing off its own 429. Bucket is per process/instance (serverless: shared across concurrent runs on the same warm instance, which is the stampede case the plan named).
- **Seam mechanics.** Split the core into `shopifyRest<T>()` (returns `{ data, headers }`) with `shopifyRestJson<T>()` as a thin wrapper, so the three list routes that need Shopify's cursor `Link` header keep working via a new exported `parseNextPageInfo(headers)`. Added `cache: "no-store"` to the client (correct for a live-data Admin API; the raw routes set it, the agent tools never did — now uniform).
- **Behavior preserved deliberately.** Migrated call sites pass `maxRetries: 0` to keep their prior no-retry semantics: the GET browse routes never retried (and their tests assert single-call 429/503 passthrough), and skipping retry on the POST/PUT mutations avoids a new double-write/double-register risk the client's default single-retry would have introduced. The token bucket is the universal rate-safety addition; per-call retry stays opt-in for the original agent-tool callers. Route error responses still surface as `{ error: 'shopify_error', details }` with the upstream status (mapped from `ShopifyRequestError.payload`/`.status`).
- **Tests:** affected route + agent-tool + context suites green; no test rewrites needed beyond aligning one callback assertion (the soft-fail webhook log now records `err.payload` instead of the whole error). `tsc` adds zero new errors.

### 1.3 — De-string-key the control flow *(S, medium risk)* [COMPLETED]
Brittle today: `executor.ts` infers status via `result.toLowerCase().startsWith("error:")`; the planner derives warnings via regexes on lowercased tool output. A wording change silently breaks spend accounting / warning suppression.
- Have tool implementations return a structured result (`{ status, message, data }`) and let the executor/planner branch on `status`, keeping the string only for the model-facing text.
- Files: `tools/executor.ts`, `tools/thread.ts`, `shopify/*.ts`, `planner.ts`.

### 1.4 — `BaseAgentContext` extraction *(M, medium risk)* [COMPLETE]
Split `AgentContext` into a base (`org`, `settings`, `memory`, `channel`, `tools`) + a composed `SupportContext` (thread, customer, recentOrders, kbArticles, shopify linkage). `buildContext()` becomes "build base, then compose support." No behavior change — pure shape refactor that unblocks future modules.
- Files: `lib/agent/types.ts`, `context.ts`, consumers in `planner.ts`/`run.ts`/`prompt.ts`.

### 1.5 — Prompt skeleton + module blocks *(M, highest regression risk)* [COMPLETE]
`prompt.ts` already has helpers; add the structural split: a shared skeleton (identity, autonomy, guardrails, voice, memory) + a **support instruction block** injected as a module. This is the change most likely to move eval scores — do it last in Phase 1, isolated, and diff the baseline before/after.
- Files: `prompt.ts`.

### 1.6 — Tool registry grouping *(S, low risk)* [COMPLETED]
Group the 20 tools by capability/module and formalize per-module subsets through the existing `selectAgentTools` allow-list. The seam exists; this is organization, not new machinery.
- Files: `tools/registry.ts`.

**Done (2026-06-01).** Added the **module axis** to `registry.ts`, orthogonal to the existing capability axis (`TOOL_CATEGORIES` = read/action/communication/internal). New `ToolGroup` type + `TOOL_GROUPS` record partitions all 20 tools into six domain modules — `knowledge` (1), `product` (1), `customer` (4), `order` (8), `thread` (4), `messaging` (2) — and a one-line `toolNamesForGroups(...groups)` flattener so a module subset feeds straight into the existing `selectAgentTools(settings, allowList)` arg with no new selection machinery. No production behavior change: `AGENT_TOOLS` order, `TOOL_CATEGORIES`, and `intent.ts`'s curated cross-module allow-lists are untouched (the model-facing tool set is byte-identical), so no eval re-run needed for this item. A unit test in `prompting.unit.test.ts` asserts `TOOL_GROUPS` partitions `AGENT_TOOLS` exactly (no missing/duplicate/orphan tools), so adding a tool without grouping it now fails CI. Unit suite green (14/14); `tsc` clean.

**Exit criteria:** eval baseline ≥ pre-Phase-1 score; zero raw Shopify `fetch` outside `client.ts`; Shopify calls throttle under concurrency; tool results structured; support context composes on a base; prompt split with no score regression.

---

## Phase 2 — Ship V1 support [COMPLETE]

**Goal:** a support product solid enough to depend on. Generalization is done; now finish the user-facing surface and the safety gaps.

| # | Workstream | Effort | Notes |
|---|---|---|---|
| 2.1 | **Production output-sampling surface.** A way to eyeball real agent outputs (drafts sent, actions taken) — you're flying on evals alone. Pipe from the existing `AgentAction` audit table into a review view. | M | Highest-leverage quality gap. Reuses audit infra. | [COMPLETED]
| 2.2 | **Structured-command texting / daily-summary.** Telegram operator + digests exist; make the SMS/structured-command summary a first-class V1 deliverable. | M | Builds on `OperatorContext` + maintenance digests. | [COMPLETED]
| 2.3 | **Prompt-injection strategy, not a denylist.** `sanitizeUserInput` is a regex denylist feeding an agent that can refund/cancel. Autonomy caps are the real backstop (keep), but as supplier email / social DMs feed the agent, harden input handling (structural quoting/segregation of untrusted text in the prompt, not pattern-matching). | M | Caps already mitigate; this reduces blast radius. | [COMPLETED]
| 2.4 | **Close V1-path stub pages.** Audit the 18 dashboard routes; finish the ones on the support critical path. | M | Scope depends on how stubby — needs a sizing pass. | [COMPLETED — audit found no stubs]
| 2.5 | **Brand-voice correction loop (decision needed).** Today: free-text + tagged sample replies, prompt-injected. If "training" means "you edited my draft → I learn," that's net-new and needs a scope call. | S–L | Flag for decision before building. | [COMPLETED — scoped to full learning loop]

**2.1 done (2026-06-01).** New **Review** surface at `/dashboard/review` (nav: Insights → Review, `ScanEye` icon) for quality spot-checking. The gap it closes: the existing `/dashboard/activity` feed is an *audit* view — it shows tool chips, modes, durations, and approver, but the agent's actual prose is only reachable as redacted raw JSON behind a per-action expander, because `send_reply`'s result string is just `"Reply sent to customer…"` — the drafted text lives in `AgentAction.input.text` (likewise `send_email.body`, `escalate_to_human.reason`, `add_internal_note.text`). The Review view reuses the existing `GET /api/agent/actions` feed + `ActionLogEntry` type verbatim (zero backend/schema change) and renders that prose readably: each turn is a card showing the actual reply/email/escalation/note text in a tone-coded block, with side-effecting outcomes (refund/cancel/edit) listed compactly underneath from their result strings. A server-side focus lens (Replies / Escalations / All) drives the API's existing `tool` filter so the sample is built in-query, not client-side. Files: `app/dashboard/review/page.tsx`, `app/dashboard/review/_components/ReviewFeed.tsx`, `_components/nav-items.ts`. `tsc`/eslint clean (the 23 pre-existing `*.test.ts` type errors are untouched and unrelated).

**2.2 done (2026-06-01).** The digest existed only as a **scheduled push** — the operator could read it and run the structured follow-ups (`OPEN`/`SPAM`/`REPLY`/`REVIEW`), but had no way to *pull* it, and the command vocabulary was undiscoverable. Made the summary first-class on both axes: (1) **on-demand `SUMMARY`** (alias `STATUS`) texts back the live inbox digest and seeds `OperatorContext.pendingDigest`, so the existing flagged-ticket commands work identically off a pulled summary as off a pushed one; (2) **`HELP`** (alias `/help`) lists the command set; (3) the `/start` connect message now advertises both. The digest build (open-thread query → bucket → format → `pendingDigest`) was extracted into one shared `buildOrgDigest(orgId, now)` in `maintenance/digest.ts` and is now the single source for both the scheduled worker and the `SUMMARY` command — the worker's old batched cross-org query + inline bucketing/`threadsByOrg` map collapsed into a per-eligible-org call (eligible orgs per hour are few, so N small queries is fine and removes the duplication). No schema change, no new push cadence. Files: `maintenance/digest.ts`, `maintenance/workers.ts`, `routes/webhooks-telegram.ts` (+ 3 webhook tests). `tsc` clean; telegram + digest suites green (34/34).

**2.4 done (2026-06-01) — audit, no build.** The sizing pass the row called for: audited all 18 dashboard routes (+ the `learn/[articleId]` dynamic route). **No stub pages exist on the support critical path.** Every thin `page.tsx` delegates to a substantial client component (Products/Customers/KB/Orders drawers + tables, Home at 1144 LOC of wired widgets, Playbooks full CRUD via `/api/playbooks`, Tickets at 29 components); grep across `*.tsx`/`*.ts` found no mock/fake/hardcoded data, no no-op handlers (`onClick={()=>{}}`, `href="#"`, `alert()`), and no stub API responses (`501`/"not implemented") outside test files. Each route is backed by a live `/api/*` data layer (SWR/server fetch) with working actions and real empty/loading states. Nav ↔ route mapping is total — every `nav-items.ts` entry resolves to a real page; no dead links, no orphan routes. The only "incomplete" surfaces are **deliberate future-feature markers, all out of 2.4 scope**: the TikTok integration tile (`connectType: 'coming-soon'` in `integrations/catalog.ts` — CLAUDE.md mandates "TikTok: stubs only", and the plan's framing forbids building module #2), one disabled "Coming soon" autonomy tier in `settings/AgentTab.tsx`, and a "Coming soon" channel note in the help docs (`_components/help/content/reference.ts`). Conclusion: by the time Phases 0–2.3 matured the surface, the "stub pages" premise the original analysis was written against was already stale; the exit criterion below was satisfied without a code change. No files modified.

**2.5 done (2026-06-02) — scope decided: full draft→edit learning loop.** The scope call landed on the heaviest option (not the lightweight "promote a reply to a sample"): the agent *learns* from operator edits and rewrites its own brand-voice brief, gated by human approval. Built as four decoupled layers:
- **Corpus.** New `VoiceEdit` model (`packages/db`) records one row per case where the operator sent a customer reply that meaningfully diverged from the agent's drafted reply. The "draft" side is the reply already persisted server-side in `Thread.cachedPlan` (the auto-plan's `send_reply` step) — so capture needs **no composer/UI plumbing**, which would have been high-regression. `/api/messages` POST compares the sent text against `extractCachedDraftReply(cachedPlan)` and, when `isMeaningfulVoiceEdit` holds (non-trivial, not the draft re-sent modulo whitespace/case), writes a `VoiceEdit`. Best-effort, wrapped — never blocks or fails a send.
- **Synthesis.** Daily gateway maintenance worker (`maintenance/voice-synthesis.ts`, mirroring the `customer-memory-summarizer` pattern: `getAnthropic` + `recordSpend` + `enforceSpendCap`) groups unconsumed edits by org; for each org with ≥ `VOICE_SYNTHESIS_MIN_EDITS` (5) **and no proposal already awaiting approval**, it feeds the current brief + up to 30 newest edit pairs to Sonnet (`MODEL.VOICE_SYNTHESIS` — judgment-grade, low-frequency, human-gated), gets back `{ brief ≤200 chars, rationale }`, writes it to `Organization.voiceProposal`, and marks those edits consumed in one transaction. Spend-capped and Sentry-wrapped per org.
- **Approval.** `Organization.voiceProposal` is a dedicated JSONB column (deliberately **not** in `settings`, to stay clear of the AgentTab version-gated save/reducer flow). `GET/POST /api/agent/voice` serves the proposal and approves (adopt `brief` → `settings.brandVoice`, clear proposal, billing-gated) or dismisses (clear only). Approve returns fresh settings+version so the editor re-baselines without a phantom dirty state.
- **UI.** A `VoiceProposal` card in Settings → Agent (brand-voice section): shows the proposed brief, the "what changed" rationale, and the edit count; "Use this voice" / "Dismiss" call the route, then `applyBaseline()` + version-ref update keep the open editor consistent. Threaded as a server-fetched prop through `page.tsx → SettingsPageClient → AgentTab` (no extra client fetch).
- Shared shape/thresholds live in `@clerk/db`'s `voice.ts` (`VoiceProposal`, caps, `isMeaningfulVoiceEdit`, `parseVoiceProposal`) so both apps agree. **Tests:** real-DB capture (3/3) + real-DB synthesis with mocked Anthropic covering eligible/under-threshold/already-pending (3/3); messages-route suite still green (14/14). `tsc` clean (both apps), eslint + structure checks clean, migration applied. Files: `packages/db/{schema.prisma,voice.ts,index.ts}` + migration; dashboard `lib/agent/{voice-capture.ts,plan-cache-shape.ts}`, `api/messages/route.ts`, `api/agent/voice/route.ts`, `settings/{page.tsx,_components/SettingsPageClient.tsx,_components/AgentTab.tsx}`, `types/index.ts`; gateway `maintenance/{voice-synthesis.ts,workers.ts}`, `constants.ts`.

**Deferred out of V1 (Phase 3 candidates):** KB semantic retrieval (real feature: needs embeddings + pgvector/store + retrieval — defer unless support quality on policy questions demands it); single-LLM-vendor fallback / graceful-degradation queue (real availability risk, but heavy — decide explicitly).

**Exit criteria:** output sampling live ✅ (2.1); structured-summary surface shipped ✅ (2.2); injection handling beyond denylist ✅ (2.3); no stub on the support happy path ✅ (2.4 — audit confirms none); brand-voice scope decided ✅ (2.5 — scoped to the full draft→edit learning loop and shipped).

---

## Phase 3 — Design seams for generality *(design only — no module #2 build)*

Since we're generalizing but **not** building order-ops yet, Phase 3 is lightweight: leave the right seams so module #2 is cheap when it comes, without speculative schema migration. These are **design/decision tasks, not builds** — each produces a documented decision or a noted constraint, not a migration.

### 3.1 — Hold the line on `channelType` branching *(S, low risk)* [COMPLETED]
Don't add `channelType ===` branches you don't have to. Every one is future tax against the closed Postgres enum. Note the constraint; don't migrate the schema yet.

**The constraint (recorded, not migrated).** `ChannelType` is a closed Postgres enum (`schema.prisma:14` — `ig_dm, email, tiktok, shopify, sms, sms_agent, dashboard_agent`). Adding a value is a migration; *removing or renaming* one is a destructive migration against live rows. So every `channelType === "x"` comparison scattered through the code is a point that must be revisited when the enum grows (e.g. module #2 / new channels), and the cost scales with how many *spellings* of the same classification exist. The decision: **no schema change, no new enum value, no `channelType` mapping table.** Instead, branching must go through a *named predicate*, never a re-spelled literal comparison, so the enum's blast radius stays countable.

**Two kinds of branch — keep them distinct:**
- **Class predicates** (membership in a *set* of channels, e.g. "is this operator-facing?"). These are the ones that duplicate and rot. They get exactly one home.
- **Single-channel specifics** (genuinely "this one channel behaves differently" — e.g. `=== "email"` for email-reply formatting, the lone `=== "dashboard_agent"` Concierge branches in `run.ts`, `=== IG_DM` in the gateway). These are *not* duplications and were left alone — folding them into a predicate would invent abstraction the plan forbids.

**Consolidation done (2026-06-02).** The operator-class predicate had drifted to **four spellings**: the canonical `isOperatorChannel` (`intent.ts`), a re-inlined twin in `context.ts`/`prompt.ts`/`tools/thread.ts`/`api/agent/internal/route.ts`, and an inline `OPERATOR_CHANNELS = new Set([...])` copy-pasted into three UI files (`ActivityFeed`, `ReviewFeed`, `AuditLogTab`). Collapsed all of them to a single source of truth in `lib/messaging/thread-constants.ts` (`OPERATOR_CHANNEL_TYPES` + `isOperatorChannel`) — chosen because it's the one pure-constants module already imported by UI, API routes, agent core, and tools alike, so no agent/server code leaks into client bundles. `intent.ts` now re-exports it, so the agent-core importers (`planner`, `run`, `order-status-fast-path`) are untouched. **No behavior change** — same set membership, just one definition; 86 dashboard unit tests green, `tsc`/eslint clean on touched files. The gateway was left as-is: it only handles inbound customer channels and has no operator-class duplication (its `=== CHANNEL.IG_DM` checks are single-channel specifics).

**Standing guideline for module #2:** new cross-channel classification → add a named predicate next to `isOperatorChannel` in `thread-constants.ts`, never an inline literal comparison. Reserve a *new enum value* for a genuinely new transport, and treat that as the one migration worth paying for — not a per-feature reflex.

### 3.2 — Sketch general memory entities *(S, design only)* [COMPLETED]
Sketch (don't build) general memory entities (merchant/supplier/product) reusing CustomerMemory's bound-on-write pattern, so a second memory system isn't bolted on later.

**The pattern, named (verified in code).** `CustomerMemory` is not "an LLM writes to a table." It's five invariants that together make durable memory safe to add per entity. A second memory system is only "bolted on" if it breaks one of them:

1. **Storage is a JSONB blob on the owning entity row, not a side table.** `customers.memory` (`Json? @default("{}")`) + `customers.memory_updated_at` (`schema.prisma:137-138`), indexed `(organizationId, memoryUpdatedAt)` for the stale sweep. Org scoping is *transitive* — memory inherits the row's `organizationId`, so no memory query is independently org-scoped and none can leak across tenants. (`Organization.voiceProposal`, added in 2.5, is the same move for org-level state.)
2. **One shared contract module in `@clerk/db`, imported by both apps.** `customer-memory.ts` exports the typed shape (`CustomerMemory`), a `CUSTOMER_MEMORY_VERSION` constant, per-field size caps (`SUMMARY_MAX_CHARS`, `KEY_FACTS_MAX`, …), and the four primitives below. Gateway (writer) and dashboard (reader/editor) agree because they import the same file, never re-spell the shape.
3. **Bound-on-write, permissive-on-read.** `boundMemory()` clamps every field to its cap *before* persist (`customer-memory.ts:71`), so one bad summarizer call can't poison future requests; `parseStoredMemory()` (`:134`) never throws — a malformed historical row degrades to `EMPTY_MEMORY` rather than crashing the request. `isEmptyMemory()` + the JSON launder (`toCustomerMemoryJson`) round it out.
4. **Synthesis is an event-triggered + swept gateway job, model-tiered and spend-capped.** A BullMQ job on the binding event (`updateCustomerMemoryOnThreadClose`, idempotent via `jobId = customer-memory:<threadId>:<closedAt>`) plus a daily stale-refresh sweep (`refreshStaleCustomerMemory`, 30-day cutoff, per-org batch, concurrency 5). The LLM call runs on `MODEL.CUSTOMER_MEMORY` with JSON-schema output, `temperature: 0`, `enforceSpendCap` before + `recordSpend` after, the whole thing Sentry-wrapped so a failure never blocks the close.
5. **Consumption is read-only and graceful.** `context.ts:readCustomerMemory` loads it into `AgentContext.customerMemory`; `prompt.ts:buildCustomerMemorySection` renders it; the dashboard memory route edits it. A null/empty blob just omits the section.

**The binding event is the one real design variable per entity.** Customer memory binds on *thread close* because that's when a customer interaction completes. Each new entity needs its own answer to "what event means there's something durable worth re-summarizing?" — and that, not the storage, is what to decide before building:
- **Merchant (= `Organization`).** Owning row exists; this is org-level memory about the *merchant's own* operation (policies they keep restating, recurring seasonal patterns, store-wide preferences). Binding event: low-frequency — a daily/weekly sweep over recently-closed threads + settings changes, not a per-event trigger. Storage: a `memory`/`memory_updated_at` JSONB pair on `Organization`, exactly like `voiceProposal`. **Closest to free** — no new model, the org row and the sweep cadence already exist.
- **Supplier.** *No owning row exists today* (no `Supplier` model; vendor data is Shopify-side or in supplier emails). Building this means first deciding whether a supplier is a first-class entity at all — likely deferred until module #2 (order-ops) needs it. When it lands: a `Supplier` row per `(organizationId, externalId)` carrying the same JSONB pair; binding event = a supplier-related thread/PO closing.
- **Product.** *No owning row exists* — products are read live from Shopify through `shopify/*` tools, never persisted. Per-product durable memory (recurring defect reports, sizing-runs-small notes) would need a thin local `Product` shadow row keyed `(organizationId, shopifyProductId)` to hang the JSONB on. Binding event = a product-tagged thread closing. This is the heaviest of the three and the least justified until support volume proves the need.

**What to reuse vs. parameterize when the second one is built.** Don't copy `customer-memory.ts` wholesale per entity (five near-identical files rot independently). Two options, decide at build time:
- **(a) Per-entity contract module, shared bounding core.** Lift the generic mechanics — a `boundMemory<T>(value, fieldSpec)` driven by a declarative `{ field: cap }` spec, plus `parseStored`/`isEmpty`/`toJson` — into a `memory-core.ts` in `@clerk/db`; each entity declares only its shape + caps. Lowest risk; keeps `CustomerMemory`'s explicit per-field types.
- **(b) Generic `EntityMemory<TPolicyFlags>`** with a shared `{ summary, keyFacts, recentInteractions, policyFlags, version }` skeleton and an entity-specific `policyFlags` type. Less boilerplate, but forces every entity into the customer-shaped skeleton — wrong if e.g. product memory has no "interactions."

Lean (a): the skeleton fields (`summary`/`keyFacts`/`recentInteractions`) are customer-conversation-shaped and shouldn't be presumed universal.

**The anti-pattern to refuse.** A central polymorphic `Memory(entityType, entityId, blob)` table. It breaks invariant #1 (transitive org scoping → every memory query needs its own `organizationId` filter and a tenant-leak audit), adds a join to every read, and turns a typed-per-entity contract into a stringly-typed `entityType` switch — exactly the kind of re-spelled branching 3.1 just consolidated away. Memory stays denormalized onto the entity row it describes.

**Standing guideline for module #2 / new memory.** New durable memory → new JSONB pair (`memory` + `memory_updated_at`) on the entity's *own* org-scoped row + a contract module in `@clerk/db` reusing the shared bounding core; synthesis is a spend-capped, Sentry-wrapped, idempotent gateway job on a named binding event + a stale sweep. **No schema change, no `Supplier`/`Product` model, no migration now** — Customer and Organization already carry the seam; Supplier/Product memory waits for the module that needs the owning row, and that owning row is the migration worth paying for then.

### 3.3 — Decide agent-vs-playbook ownership of proactive work *(S, decision)* [COMPLETED]
Decide who owns proactive work before a module forces it — two automation mental models (the rules engine and the agent) will confuse the architecture otherwise.

**The two models, named (verified in code).** They are not "two ways to do the same thing" — they sit at opposite ends of a determinism/judgment axis, with different safety stacks:

1. **Playbook = deterministic rules engine.** A merchant-authored `condition → action` row. **Triggers** are a closed enum of events — `new_ticket | tag_applied | ticket_closed` (`types/index.ts:284`), fired fire-and-forget from the gateway (`channels.ts` → `triggerPlaybooks(new_ticket)`) and the dashboard thread route (`threads/[id]/route.ts:105,112`). **Actions** are four fixed, model-free operations — `apply_tag | close_ticket | add_note | send_reply` with a **literal** canned message (`playbook-runner.ts:59-101`). No LLM, no context read, no judgment, **no autonomy tier, no spend cap, no policy check, no escalation, no audit row** — just dedup by unique `(playbookId, threadId)` (`PlaybookRun`) and a `runCount` bump. Its entire value is that it is *predictable and free*: the merchant states an explicit rule and it runs verbatim.
2. **Agent = LLM judgment engine.** Reads context, plans/re-plans on Sonnet, and every mutation flows through the run loop's safety stack — autonomy tier (`autonomy-tiers.ts`: watch/guarded/trusted + caps), spend cap, policy (`maxRefundAmount`/`blockCancellations`), human approval, `AgentAction` audit, and `escalate_to_human`. Its proactive entry today is **auto-plan-on-open** (`planning.ts:precomputeThreadPlan` → `/api/agent/plan-internal` → `Thread.cachedPlan`), surfaced for approval — or auto-executed only behind the hidden `autoExecuteEnabled` + `allowAutoExecute` gate.

**The overlap that forces the decision (verified).** The `new_ticket` event *already* fans out to **both** systems against the same thread — the gateway fires `triggerPlaybooks(new_ticket)` **and** the worker calls `precomputeThreadPlan`. Today they don't collide only because playbook actions are coarse and the agent's plan is advisory (cached, human-approved). The moment "proactive work" (follow-ups, SLA chasing, re-engagement, scheduled monitoring) is built, that fork stops being harmless: the same capability could be authored as a playbook action *or* as an agent behavior, and if both grow toward the middle you get two ungoverned automation engines with divergent safety guarantees. That is the architecture confusion this task exists to prevent.

**There is already a third proactive surface — don't invent a fourth.** Scheduled proactive work lives in the **gateway maintenance workers** (`maintenance/workers.ts`), and it already demonstrates *both* flavors safely: deterministic, model-free jobs (archival, purge, token-health, queue-health) and **judgment jobs that call a model under the full agent-grade discipline** (`customer-memory`, `voice-synthesis` — each spend-capped via `enforceSpendCap`/`recordSpend`, Sentry-wrapped, idempotent by `jobId`, model-tiered via `MODEL.*`). So the architecture already has three homes for proactive work: **event→playbook** (deterministic), **event→agent** (auto-plan), **schedule→maintenance worker** (either flavor). The decision places future work *into* this taxonomy, not beside it.

**The decision.** Ownership is determined by **two orthogonal questions, never by "which subsystem is handy":**
- **What fires it?** *Event* → a playbook trigger (or the existing auto-plan hook). *Schedule / time / monitoring condition* → a maintenance worker. Triggers are cheap and deterministic by definition; they belong to the rules/cadence layer regardless of what they ultimately invoke. (A new recurring trigger is a `PlaybookTriggerType` addition or a new repeatable maintenance job — not a new framework.)
- **What does the response require?** *Deterministic* (tag, close, fixed canned text, archive) → it stays in the rules/worker layer as a model-free action. *Judgment or mutation* (read context, choose among actions, draft prose, refund/cancel/edit Shopify) → it **must** run as an agent run through the autonomy/spend/policy/audit/escalation stack. Judgment never executes inside the playbook executor or a bare worker.

**The one sanctioned bridge: a playbook may *invoke* the agent, never *be* the agent.** When a deterministic trigger needs a judgment response, the playbook's job is to supply the *trigger and a framing instruction* and enqueue a **governed agent run** — i.e. a future `run_agent` / `ask_agent` playbook action that hands off to the run loop (which then applies every guardrail). The playbook never gets its own model call, and never gains write authority beyond its four deterministic actions. Symmetrically, the maintenance layer's judgment jobs already follow this rule (they call the model under the agent-grade spend/Sentry discipline); new ones must too.

**The anti-patterns to refuse:**
- **A model call inside `playbook-runner.ts`.** Turns the deterministic rules engine into a *second, ungoverned agent* that bypasses autonomy tier, spend cap, policy, and audit — the exact divergence this decision prevents.
- **A hardcoded `condition → action` business rule inside the agent prompt/loop.** Makes behavior that should be predictable and free instead nondeterministic, paid-per-token, and un-auditable as a discrete "rule" the merchant can see and toggle.
- **A fourth proactive subsystem.** New proactive triggers reuse the playbook trigger taxonomy or the maintenance-worker cadence; new proactive actions reuse the four playbook actions or a governed agent run. Nothing else.

**Standing guideline for module #2.** Before building any proactive capability, answer the two questions above. Deterministic response → playbook action or maintenance job. Judgment/mutative response → an agent run behind the autonomy stack, *triggered by* (never *implemented inside*) the rules/cadence layer. The only cross-over is a playbook action that enqueues a governed agent run. Keep the rules engine dumb on purpose and the agent the sole home of judgment — that boundary, not a shared "automation" abstraction, is what keeps the safety guarantees countable as modules multiply. **No code change for this item** — the seam already exists (playbook triggers fire-and-forget; the agent owns judgment; maintenance workers host scheduled judgment under spend caps); 3.3 records the ownership rule so module #2 doesn't blur it.

### 3.4 — Defer the real generality test *(deferred)*
The real test of generality — does non-conversational, entity/monitoring work fit the generalized core? — is deferred to when order-ops is actually scheduled. By design, with the refactored chassis ready.

---

## Dependencies & sequencing rules

- **0 → everything.** No refactor merges without the baseline green.
- Within Phase 1: **1.1 (model) and 1.5 (prompt) are the two score-movers** — do them isolated, one at a time, baseline-diffed. 1.2/1.3/1.4/1.6 are lower-risk and can interleave.
- Phase 2 can start once Phase 1's chassis is stable; 2.1 (output sampling) is worth pulling early since it improves visibility for everything else.
- 2.5 (voice training) and the Phase-3 deferrals (semantic KB, vendor fallback) each need an explicit scope decision before they enter a sprint.
