# Agent Core Simplification Plan

Source: backend/agent audit of 2026-07-07. Governing rule: each concern goes to
the layer that is good at it — natural-language understanding to a model,
safety invariants to deterministic checks on structured data (tool calls,
amounts, order state), behavioral steering to the system prompt, hard limits to
the executor. Every phase below removes a place where the current code violates
that rule.

Last reviewed: 2026-07-07.

## Problems being solved

1. ~750 lines of English-only regex heuristics (`intent.ts`, `planner-safety/`,
   fast paths, `merchant-answer-kb.ts`) do NLU without a model while the same
   pipeline runs 3+ model calls per message. They silently no-op for non-English
   customers and duplicate instructions already in the system prompt.
2. Guards mutate plans (strip `send_reply`, inject synthetic `ask_operator`,
   forced-`tool_choice` escalation drafts). This breaks the core guarantee that
   what the merchant approves is what the model actually proposed.
3. The planner is five phases with retries (`planner-initial-phase`,
   `planner-read-skip`, `planner-replan`, `planner-terminal`) — one idea
   ("a complete plan, cheaply, with no side effects") implemented as patches
   around Haiku's phase-1 behavior.
4. Four agent-loop implementations: `run.ts` (mutative + read-only variants),
   the phased planner, and the `order-ops/run.ts` fork forced by the executor's
   eager thread coupling.
5. Dead or near-dead surface: `OPENAI_API_KEY` (zero code references),
   `requireApprovalForActions` (single consumer is a tautology under tier
   defaults), plan-side order-status fast path (skipped for any org with
   brandVoice/sampleReplies), duplicated regex sets and helpers.
6. Minor efficiency: spend-cap DB read before every model call; `buildContext`
   always loads 50 messages when operator/read-only paths use 4.

Out of scope for now: non-English eval fixtures (tracked separately; required
before the guard swap can be *proven* language-safe, but deliberately excluded
from this plan).

## Phase 0 — Mechanical cleanup (no behavior change) [COMPLETED]

No model-facing changes; unit tests only, no eval gate.

1. Deduplicate: `SHIPPING_COVERAGE_QUESTION_RES` / `DISCOUNT_POLICY_QUESTION_RES`
   (in both `intent.ts` and `merchant-answer-kb.ts`), `planningIntentTexts`
   (`intent.ts`, `planner-read-skip.ts`), `customerMessageTexts`
   (`planner-safety/mutative.ts`, `planner-safety/policy-gap.ts`). Single home:
   `intent.ts` until Phase 3 deletes them.
2. Remove `OPENAI_API_KEY` from both `.env.example`s and the CLAUDE.md env list
   ("OpenAI (embeddings)" line — KB search is Prisma `contains`).
3. Fold `requireApprovalForActions` into the tier system: its one consumer
   (`dashboard-approval.ts:39`) evaluates true for every tier under defaults.
   Remove from defaults, `TIER_DEFAULTS`, `AUTONOMY_OVERRIDE_PATHS`,
   settings-parser, and the migration path. Keep parsing tolerance for stored
   JSON that still contains the key.
4. Spend cap: check once per run/plan (entry of `planAgent` / `runAgent` /
   `runOrderOps`) instead of before every model call. `recordSpend` stays
   per-call. Consistent with the cap's own documented contract (backstop, not
   billing meter).
5. `buildContext`: accept a message-window option so operator/read-only callers
   fetch 4 messages instead of 50 and slicing after.

Exit: typecheck + unit tests green. No eval run needed.

## Phase 1 — Extend the intelligence classifier (additive) [COMPLETED]

Extend `generateThreadIntelligence` / `email-classification.ts` JSON schema
with structured intent signals, alongside the existing title/summary/tag/filter:

```
intents: {
  mutative_request: boolean,      // asks to cancel/refund/return/exchange/edit
  policy_question: boolean,       // shipping coverage, returns policy, discounts
  order_status: boolean,
  fraud_signals: boolean,         // chargeback, alternate-card refund, urgency+non-receipt
  contradiction: boolean,         // mutually exclusive asks in one message
  out_of_scope_commercial: boolean, // wholesale/bulk/B2B
  forwarded_injection: boolean,   // forwarded "owner authorized refund" pattern
},
language: string                  // ISO 639-1 of the customer's message
```

- Persist on `Thread` (new JSON column or inside an existing JSON field) with a
  `classifierVersion`.
- Nothing consumes it yet. Prompt-only change to an existing Haiku call;
  verify with the existing classifier unit tests plus a handful of fixture
  transcripts run as single-fixture probes (not the full gate).

Exit: intents populated on new inbound threads in production; spot-checked.

## Phase 2 — Shadow the guard swap [COMPLETED]

Reuse the `AutonomyShadowDecision` pattern: compute the new classifier-based
routing decision next to the live regex guards without changing behavior.

1. Build the replacement routing function: inputs are classifier intents +
   plan raw tool calls + order state from context. Output is
   `auto_execute | needs_review | escalate` plus warning strings. It never
   adds, removes, or edits tool calls.
2. At the end of `planAgent`, log (or persist a shadow row for) both decisions:
   what the regex guards did to the plan vs. what the routing function would
   have decided. Include which signal fired on each side.
3. Run on production traffic until disagreements are explained. Expected
   classes of disagreement: non-English messages (regex misses, classifier
   catches — the point of the change) and regex false positives on
   informational questions.

Exit: disagreement rate understood and each class dispositioned (fix classifier
prompt, accept, or adjust routing thresholds).

## Phase 3 — Guards route, never author [COMPLETED]

Swap in the routing function and delete the plan-mutation machinery.

1. Structural checks stay (they are the correct kind — tool calls vs. Shopify
   state, no prose): already-refunded refund strip, fulfilled-order cancel
   escalation, static policy caps, `stripEmptySendReplyToolCalls`,
   `classifyHomePlan` and its warning tiers.
2. Regex-driven guards are replaced by routing outcomes:
   - mutative intent without action/escalation → `needs_review` + warning
     (today: strips the reply and forces a replan).
   - fraud / forwarded-injection / contradiction / out-of-scope → `escalate`,
     created deterministically by the system with the classifier's reason
     (today: forced-`tool_choice` model call to author `escalate_to_human`).
     Escalation is a routing decision, not content generation.
   - policy gap with no KB coverage → `needs_review` surfaced as a merchant
     question (today: synthetic `ask_operator` injection with id
     `tu_policy_gap_ask`).
   - channel-deflection reply → `needs_review` + warning (today: reply
     stripped).
3. Delete: `intent.ts` regex families and their consumers in
   `planner-safety/mutative.ts` and `planner-safety/policy-gap.ts`,
   `draftRequiredTerminalTool` + `ESCALATION_DRAFT_PROMPT`,
   `buildPolicyGapAskOperatorCall`, the brand-voice order-status guard,
   the KB keyword-coverage checker (`kbArticlesCoverQuery`) where it backs
   guard decisions. `merchant-answer-kb.ts` topic tagging switches to
   classifier intents.
4. Update `plan-preview.ts` / dashboard to render the new warning strings and
   the `needs_review` reasons; `classifyHomePlan` consumes routing output
   instead of scanning for the synthetic ask_operator call.

Exit: full eval gate run (baseline comparison; sign-off before the run per
eval-cost policy). Shadow logging from Phase 2 stays on for one more release
as the rollback signal; revert = flip back to the regex path, which remains in
git history.

## Phase 4 — One loop: planner becomes capture-mode run

Collapse the five-phase planner into the run loop with an execution strategy.

1. Add a tool-execution mode to the shared loop:
   - `execute` — current `runAgent` behavior.
   - `capture` — read tools execute for real; mutative and terminal tools
     (`send_reply`, `send_email`, `escalate_to_human`, `ask_operator`,
     thread-status/tag) are recorded as plan steps, not executed.
   - `read_only` — existing composer-ask filter, expressed as the same
     mechanism.
2. Planning contract is structural: the loop ends when the model emits a
   terminal tool or hits the iteration cap. If it stops without one, re-prompt
   once with the terminal-tool contract — this replaces the regex-triggered
   reply-draft and replan-retry phases.
3. Planner runs on the judgment tier (`pickModel("agent_run")`) for all
   iterations; `plan_initial` / `plan_replan` / `reply_draft` task types
   disappear.
4. Delete: `planner-initial-phase.ts`, `planner-replan.ts`,
   `planner-terminal.ts`, `planner-read-skip.ts` (skip partitioning, synthetic
   read results, all-reads-skipped retry, `synthesizeMutativeReplanContext`),
   `planner-tools.ts` phase prompts. `planAgent` becomes a thin wrapper:
   build context → capture-mode loop → Phase 3 routing → plan record
   (steps, rawToolCalls, readResults, warnings — cache shape unchanged).
5. Delete both order-status fast paths (`order-status-fast-path.ts`): the
   plan-side template path is already dead for any org with brand voice or
   sample replies; the operator-side path (hand-rolled `extractCustomerQuery`
   parsing and customer-match scoring) is subsumed by one loop iteration.
   `selectToolNamesForInstruction` operator tool-subsetting goes with it; the
   full registry rides every call.
6. `plan-cache`, `plan-execution`, quick-approve, and verbatim approved
   execution are unchanged — approved plans still execute with zero model
   calls.

Exit: full eval gate + judge run (sign-off first). Compare per-plan model-call
counts and token usage in the plan logs before/after; expect fewer calls,
similar or slightly higher cost per call, no regression in gate score.

## Phase 5 — Executor capability injection; order-ops rejoins

1. Tool definitions declare required capabilities (`thread-io`, `shopify`,
   `kb`, `stats`). `tools/executor.ts` stops eagerly building thread context;
   it takes injected capability deps and returns a clean error when a required
   capability is absent from the context.
2. `order-ops/run.ts` drops its forked dispatcher and loop; the module becomes
   configuration over the shared loop: `{ system prompt, tool subset
   (+ flag_order as a module tool), context builder, escalate sink, terminal
   tools }`. The deterministic risk-signal pre-filter stays in front of the
   loop.
3. `run.ts`'s "thread-less module loops are not wired until Track 3" throw is
   removed; a `BaseAgentContext` with no thread runs any module whose tools
   don't require `thread-io`.

Exit: order-ops smoke + unit tests; support eval gate unaffected (support-path
diff should be executor-internal only — verify with a single-fixture probe
before deciding whether a full gate run is warranted).

## Phase 6 — Model refresh (last, isolated)

Bump `HAIKU_MODEL` / `SONNET_MODEL` pins to the current generation as a
standalone change after the architecture is stable, so model deltas are never
confounded with architecture deltas. Requires its own baseline capture
(sign-off first).

## Design constraints

- Guards classify and route; they never author or edit tool calls.
- Deterministic checks operate on structured data only — tool-call inputs,
  amounts, order state, plan shape. No regex over customer prose survives.
- Approved plans execute verbatim, with zero model calls, throughout.
- The executor and loop stay host-agnostic and thread-optional; modules are
  configuration, not forks.
- Each phase lands independently and is revertible on its own; eval-gate runs
  happen at the two model-behavior boundaries (Phase 3, Phase 4) and for the
  model bump (Phase 6), with sign-off before each run.
- `settings-parser.ts` stays as-is (works, tested) but must not grow; if it
  needs new field types, that is the trigger to adopt a schema library.

## Explicitly deferred

- Non-English eval fixtures (needed to prove the language-safety win of
  Phases 2–3; tracked separately, not part of this plan).
- WhatsApp adapter and other roadmap module work
  (`core-extraction-and-module-expansion-plan.md`).
