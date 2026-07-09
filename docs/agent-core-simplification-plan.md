# Operator Channel: Model-Owned Interpretation Plan

Source: operator-channel audit of 2026-07-09 (freeform-conversation failures on
iMessage/Telegram). Governing rule, inherited from the completed simplification
plan: each concern goes to the layer that is good at it. Natural-language
understanding belongs to a model; the gateway's job is identity resolution and
deterministic execution of discrete state transitions. Every phase below removes
a place where a keyword grammar is doing NLU.

This plan replaces the Agent Core Simplification Plan (Phases 0–6, all
implemented; Phase 6 code landed but not deployed). The full prior text is in
git history for this file (last version at commit `737c1f1`).

Last reviewed: 2026-07-09.

## Carried-forward state from the superseded plan

Still-live obligations that must not be lost:

- **Phase 6 (sonnet-5 bump) is code-landed but MUST NOT DEPLOY until a full
  eval baseline is captured with sign-off.** The Phase 4 loop regression was
  fixed and pushed (`737c1f1`); targeted evals are clean (6/7, 1 known
  brand-voice flake), but the confirming full gate is still deferred.
- Eval gates for prior Phases 3/4/5 are stacked into that same deferred
  baseline. **Capture that baseline before Phase C of this plan lands** —
  Phase C changes the operator prompt and tool set, and stacking it into the
  same baseline would confound architecture and model deltas further.
- Sonnet-5 pricing in `packages/db/llm-spend.ts` was kept at sonnet-4-6 rates;
  verify against the current price list (undercounted spend bites the cap late).
- Design constraints from that plan remain in force and are restated at the
  bottom of this one.

## Problems being solved

Audit trace: see the conversation of 2026-07-09; all line references verified
against master at that date.

1. **Keyword front door.** Every operator text passes through
   `parseTelegramCommand` (`apps/gateway/src/routes/telegram/command-parser.ts:37-92`),
   which recognizes only exact strings (`yes`, `no`, `help`, `summary`,
   anchored `^#(\d+)$|^order[- #]*(\d+)$`, …). "Yes!", "yes please",
   "sure, send it" all fall through to free-form. The model — the one component
   that understands language — only sees text after this router has already
   misassigned it.
2. **Plan replies have no landing pad.** A plan notification parks
   `pendingPlan`, which accepts only literal `yes`/`no`/`skip N`
   (`routes/telegram/pending-plan-commands.ts:27-52`). A freeform answer to the
   notification ("It's a fixed size") runs as a standalone instruction on
   `lastThreadId` or a freshly fabricated thread, while the plan stays parked.
   Only `pendingQuestion` (set when the planner elected `ask_operator`) gets
   proper answer ingestion (`pending-question-commands.ts` → KB save → replan).
3. **Thread fragmentation.** `resolveInternalAgentThread`
   (`packages/agent/src/internal-thread.ts:14-99`) shards the merchant's one
   iMessage conversation across per-customer/per-order `sms_agent` threads.
   `OperatorContext.history` is written after every turn and read by nothing.
   Actual agent memory = last 4 messages of whichever thread was resolved
   (`packages/agent/src/run.ts:137`).
4. **Token budget miscounts cache traffic.** `TOKEN_BUDGET = 20_000`
   (`run-policy.ts:9`) is compared against `usageTotals.totalTokens`, which
   sums `cache_creation` and `cache_read` tokens at full weight
   (`usage.ts:40`). An operator turn ships all 28 tools (~6k tokens) plus the
   operator prompt every iteration, so the budget dies after ~2 model calls.
   Worse, the check runs **before** the end-turn check
   (`agent-loop.ts:209` vs `:213`) and the `token_budget` branch in
   `run.ts:204-208` discards `loop.finalText` — a finished answer is thrown
   away and replaced with "Agent stopped - this request required too many
   steps."
5. **Notifications are invisible to the agent.** Plan/question pushes go out
   over the channel and into the `OperatorContext` side table; they exist on no
   thread, so the model can never see what the merchant is replying to.
6. **Plan notifications hide the draft.** `formatOperatorPlanMessage`
   (`planning-notifications.ts:98-137`) renders `send_email` as "Email Rajbir"
   with no body — approval is sight-unseen without opening the dashboard.
7. **Docs drift.** CLAUDE.md still describes `intent.ts` as "operator-channel
   intent classification + tool subset selection" (it is customer-prose guard
   signals only) and still lists `order-status-fast-path.ts` (deleted in
   `a5884b6`).

## Target architecture

```
inbound operator text
  → binding resolution (unchanged)
  → exact fast path: literal "yes" / "no" / "help"  (free, deterministic)
  → everything else: ONE agent turn on THE operator thread, with
      • system prompt: operator persona + pending-state ledger
        (pending plan incl. draft bodies, pending question, digest age)
      • history: last ~20 messages of the operator thread — which now
        includes the notifications the system itself sent
      • tools: full registry + 4 control-plane module tools
  → control tools effect state transitions deterministically:
      approve_pending_plan  → executes the STORED rawToolCalls verbatim
      reject_pending_plan   → clears the pending plan
      revise_pending_plan   → replans with the merchant's guidance folded in
      answer_operator_question → existing KB-ingest + replan machinery
```

The model interprets intent; it can never author the approved action.
`approve_pending_plan` takes no arguments that shape execution — it fires the
exact tool calls the human was shown, the same verbatim contract quick-approve
already has. The keyword grammar survives only as a cache in front of the
interpreter and can only shrink.

## Phase A — Token budget correctness (bug fixes, no architecture)

No prompt or tool changes. Unit tests only; no eval run.

1. `packages/agent/src/usage.ts`: add `budgetTokens` to `ModelUsageMetrics`
   and to `readModelUsage`/`recordModelUsage`, computed cost-weighted:
   `inputTokens + outputTokens + 1.25 * cacheCreationInputTokens +
   0.1 * cacheReadInputTokens` (rounded). Keep `totalTokens` as-is for
   logging/spend continuity.
2. `packages/agent/src/agent-loop.ts`: compare `usageTotals.budgetTokens`
   (not `totalTokens`) against `tokenBudget`, and move the check **after** the
   `end_turn` / no-tool-use handling — a turn that finished cleanly returns
   `end_turn` with its `finalText` even if the budget is exhausted. The budget
   stop only fires when the loop would otherwise continue iterating.
3. `packages/agent/src/run.ts` `token_budget` branch: return
   `loop.finalText?.trim() || "<current canned message>"` — never discard a
   generated answer.
4. `TOKEN_BUDGET` stays `20_000`: with cost weighting that now affords ~10+
   cached operator iterations while a genuinely runaway loop still trips.

Tests: extend `usage` unit tests for the weighting; add an `agent-loop` unit
test asserting (a) end_turn-with-answer over budget → `end_turn`, (b) continued
tool-looping over budget → `token_budget`.

Exit: typecheck + unit suites green. Behavior change is strictly "an artificial
stop fires later and no longer eats answers" — no eval gate (per eval-cost
policy, no prompt/tool-choice surface changed).

## Phase B — One operator thread per binding (plumbing, no model behavior change)

1. **Schema** (`packages/db/prisma/schema.prisma` + migration): add
   `operatorKey String? @map("operator_key")` to `Thread` with
   `@@unique([organizationId, operatorKey])`. The key is the binding ref
   already used as `senderRef`: `imessage:<senderId>` / `telegram:<chatId>`.
2. **Resolution**: new `resolveOperatorThread(orgId, operatorKey)` in
   `packages/agent/src/internal-thread.ts` — upsert a Customer with
   `platformId = operatorKey` (existing pattern), then find-or-create the
   single `sms_agent` thread by `(organizationId, operatorKey)`. The thread is
   never auto-closed by session logic. `channelType` stays `sms_agent` — no
   enum migration; `isOperatorChannel` already covers it.
3. **Turn wiring**: `executeOperatorAgentTurn`
   (`apps/gateway/src/message-handlers/execute-operator-agent-turn.ts`) gains
   `operatorKey` and uses it for freeform turns. The `threadId` param remains
   for plan approval, which targets the *ticket* thread. `orderNumber`-based
   resolution is no longer passed from `executeFreeFormInstruction`
   (`routes/telegram/agent-execution.ts:66,80-84`) — delete the
   `extractOrderNumber(body) || context.lastOrderNumber` thread-targeting;
   the model resolves orders via tools from the instruction text.
4. **Notifications become thread messages**: after a successful delivery gate
   in `notifyOperator` (`apps/gateway/src/operator-notify.ts:105`, inside the
   idempotency-checked path), mirror the sent body to that binding's operator
   thread as `senderType: "agent"`. Same for direct `reply(...)` sends on the
   command paths (wrap once where `OperatorMessageContext` is constructed).
   Freeform turns already persist both sides via
   `persistUserMessage`/`persistAgentMessage` (`turn.ts:79-112`) — do NOT
   double-write those; mirror inbound bodies only on non-turn command paths.
5. **History window**: `run.ts:137` — operator mode moves from
   `slice(-4)` to `slice(-20)`; `readOnly` stays at 4. Phase A's budget fix
   plus prompt caching absorbs the cost. (`buildContext` already supports
   `messageWindow`; the default 50 load is fine.)
6. `OperatorContext.lastThreadId` / `lastOrderNumber` / `history` stop being
   *consumed* but the columns stay until Phase D.

Tests: gateway integration tests on the real test DB (bootstrap per
`test-bootstrap.mjs`): two freeform texts from one binding land on one thread;
a plan notification appears as an agent message on that thread; two bindings
get two threads. No prompt changes → no eval run.

Exit: merchant's chat ≡ one DB thread; notifications visible in its history.

## Phase C — State ledger + control-plane tools (the core change)

### C1. Control tools (gateway module tools)

New file `apps/gateway/src/message-handlers/operator-session-tools.ts`, built
with `defineTool` and passed as `moduleTools` — the exact pattern
`order-ops/run.ts` (`FLAG_ORDER_TOOL`, `MODULE_TOOLS`) already proves out.
`category: "action"`, `policy: { categoryPermission: false }` (a workspace tool
toggle must not hide approval), empty `capabilities`.

- `approve_pending_plan` — no meaningful args. Executes the pending plan's
  **stored** `rawToolCalls` verbatim through the existing approved-execution
  path (`executeOperatorAgentTurn` with `approvedToolCalls`, zero model calls),
  then clears `pendingPlan`. Tool result: the run summary, so the model can
  report "Sent — refund issued."
- `reject_pending_plan` — clears `pendingPlan`; result "Plan dismissed."
- `revise_pending_plan({ guidance: string })` — replan the pending plan's
  thread with the merchant's words folded in. Reuse the
  `handlePendingQuestionAnswer` machinery generalized: persist a merchant note,
  save the guidance to KB when it is a reusable fact (existing
  `saveMerchantAnswerToKb` heuristics), replan via `planAgent` with the
  guidance pinned, update `pendingPlan` + re-push the new plan text. Result:
  the new draft summary.
- `answer_operator_question({ answer: string })` — the current
  `handlePendingQuestionAnswer` body, verbatim, as a tool executor.

To thread these into a support-context run: `RunAgentOptions`
(`packages/agent/src/run.ts:32`) gains optional
`moduleTools?: Record<string, AgentToolDefinition>`; `runAgent` appends their
Anthropic definitions to the selected tool list and forwards `moduleTools` to
`executeAgentToolCalls` → executor (the executor already resolves
`moduleTools?.[name] ?? getToolDefinition(name)`, `tools/executor.ts:49-51`).
This is a host-agnostic seam, consistent with the module-tools design.

Re-entrancy note: `approve_pending_plan` acquires the *ticket* thread's lock
while the operator turn holds the *operator* thread's lock — different
threadIds, no deadlock. Guard anyway: if the pending plan's threadId equals the
current thread (cannot happen in practice), return a clean tool error.

### C2. Ledger

- `BuildContextOptions` (`packages/agent/src/context.ts:71`) gains
  `operatorLedger?: string`; `buildContext` copies it onto the context.
- `prompt.ts` operator branch (`buildSystemPromptParts`, `:202-222`): when
  `ctx.operatorLedger` is set, insert a `## Pending state` section between the
  integrations block and the instructions. The core treats the ledger as an
  opaque host-rendered string — no gateway concepts leak into the package.
- The gateway renders the ledger from `OperatorContext` before each turn
  (`executeFreeFormInstruction`): pending plan → ticket id, customer name,
  one-line summary, actionable steps, and the full `message`/`body` input of
  any `send_reply`/`send_email` in `rawToolCalls` (truncate at ~600 chars);
  pending question → the question text; pending digest → age + item count.
  When nothing is pending: "Nothing is awaiting the merchant's decision."

### C3. Prompt

Append to `OPERATOR_INSTRUCTIONS` (`prompt.ts:171`):

- When a pending plan exists and the operator's message clearly approves it
  (yes / send it / go ahead / looks good), call `approve_pending_plan`. When
  they clearly decline, call `reject_pending_plan`. When the message supplies
  facts, corrections, or changes for it, call `revise_pending_plan` with their
  guidance. When assent is ambiguous ("ok", "hmm fine"), ask one short
  confirming question instead of calling a tool.
- When a pending question exists and the message plausibly answers it, call
  `answer_operator_question` with the answer.
- A message about something else entirely (an order lookup, a new instruction)
  is handled normally and MUST NOT touch the pending plan.
- After a control tool runs, state plainly what happened, quoting the concrete
  action (e.g. "Sent — Sarah gets the $12 refund.").

### C4. Dispatch collapse

Both handlers (`routes/imessage/message-handler.ts:72-115`,
`routes/telegram/message-handler.ts`):

- Extract `approvePendingPlan(...)`/`rejectPendingPlan(...)` helpers from
  `handlePendingPlanCommand` so the fast path and the control tools share one
  implementation (including the `skip N` refresh logic, which stays
  keyword-only for now).
- Keyword fast path keeps: `help`, `summary`/`status`, the digest arms
  (`review`, `open N`, `spam N`, `reply N …`), and — against a pending plan —
  literal `yes`/`run`/`no`/`dismiss`/`skip N` after `body.trim().toLowerCase()`
  (fixes the untrimmed-match bug in passing).
- Delete: the anchored `order-lookup` arm + `handleOrderLookup`
  (`agent-execution.ts:9-57`), and the pre-agent `handlePendingQuestionAnswer`
  dispatch (its body now lives in the `answer_operator_question` tool).
- Everything else → the single operator agent turn (ledger + module tools).

### C5. Notification copy

`formatOperatorPlanMessage`: include the draft body excerpt under the step
list, and replace the `yes · no · skip 1` footer with
`Reply "yes" to send, or tell me what to change.` (keep the dashboard link).

### Verification (eval-cost policy applies: sign-off before any run)

- Unit/integration (real DB, no model): ledger rendering; each control tool's
  executor; fast-path/turn dispatch matrix; approve executes stored calls
  byte-identically (assert the `AgentAction` rows match the parked
  `rawToolCalls`).
- New **operator-turn fixture set** (~12 fixtures, deterministic tool-choice
  assertions — which control tool fired, or none — no prose judging, 1 model
  call each): assent phrasings ×3 → `approve_pending_plan`; decline ×2 →
  `reject`; fact-supply ("It's a fixed size") and change-request ("make it
  friendlier, add 10%") → `revise`; pending-question answer → `answer`;
  order-status question with a plan parked → order tools only, plan untouched;
  ambiguous "ok" → no control tool, asks; no-pending freeform → normal turn.
  Home: `apps/gateway/src/__evals__/operator-turns/`, mirroring the dashboard
  harness's env-gated runner. Single-fixture probes during development; one
  full set run at the end.
- The support-ticket planner path is untouched by C (operator prompt branch,
  optional moduleTools, notification copy only) — no full support gate needed;
  justify any extra run against that.

Exit: fixture set green with sign-off; dispatch matrix covered by unit tests.
Rollback: revert the dispatch commit — the keyword handlers remain in git
history; Phases A/B stand alone.

## Phase D — Delete the vestiges + docs

1. Migration: drop `OperatorContext.history`, `lastOrderNumber`,
   `lastThreadId` (keep `pendingPlan`/`pendingQuestion`/`pendingDigest` as the
   ledger's backing store). Delete their read/write plumbing
   (`operator-context.ts`, `agent-execution.ts`).
2. Delete `resolveInternalAgentThread`'s `orderNumber` Shopify-fabrication
   branch if the dashboard `agent/internal` route no longer passes it — verify
   callers first; if still used there, leave with a comment scoping it to that
   route.
3. `progress-copy.ts`: drop the order-lookup variant ("Looking into #X…") if
   its trigger is gone; keep the generic working copy.
4. CLAUDE.md: fix the `intent.ts` description (customer-prose guard signals
   only), remove the `order-status-fast-path.ts` line, describe the operator
   channel as "one durable operator thread per binding; pending approvals are
   agent state + control tools, keyword fast path for literal yes/no/help",
   and note `OperatorContext` is now pending-state only.
5. Re-audit `parseTelegramCommand`: what remains should be `help`, `summary`,
   digest arms, and pending-plan literals only.

Exit: typecheck + unit suites green; grep confirms no consumer of the dropped
columns. No eval run (no model-facing change).

## Design constraints

- The model interprets intent; deterministic code executes transitions.
  Approved plans execute verbatim from stored `rawToolCalls`, zero model calls,
  throughout — control tools cannot pass arguments that alter what runs.
- The keyword grammar is a fast-path cache in front of the interpreter. It may
  only shrink; adding a synonym to it is the tell that interpretation is
  leaking back into regexes.
- The agent core stays host-agnostic and module-agnostic: the ledger is an
  opaque string the host renders; control tools are host `moduleTools`; no
  gateway import enters `packages/agent`.
- Notifications the system sends are part of the conversation and must be
  persisted where the agent can see them.
- Each phase lands independently and is revertible on its own. Eval runs only
  at the model-behavior boundary (Phase C) with sign-off first, per the
  eval-cost policy.

## Explicitly deferred

- Digest arms (`review`, `open N`, `spam N`, `reply N …`) moving into the
  model. Keyword digest UX works; fold it into control tools only if merchants
  demonstrably phrase digest actions naturally and miss.
- `Message.senderType` for operator-authored texts is stored as `"customer"`
  on operator threads (legacy). Renaming means an enum migration touching every
  consumer — out of scope; known wart.
- Operator-side tool subsetting (28 tools ride every turn). Phase A's budget
  fix removes the cost pressure; revisit only with data, and never via regex
  intent classification.
- The stacked full-gate baseline for prior Phases 3/4/5/6 — tracked in
  "Carried-forward state" above; a prerequisite ordering constraint on Phase C,
  not part of this plan's work.
- Non-English eval fixtures; WhatsApp adapter and module #2 work
  (`core-extraction-and-module-expansion-plan.md`).
