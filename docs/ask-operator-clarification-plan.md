# Ask-Operator / Needs-Merchant-Input Plan

**Goal:** give the support agent a way to **ask the merchant a clarifying question** when it hits a
knowledge or judgment gap, instead of guessing, deflecting, or doing a hard handoff. The agent
parks the ticket in a new `needs_merchant_input` state, surfaces a question on the dashboard (and
later Telegram), and once the merchant answers it **re-plans** and drafts the real customer reply
through the normal approval flow. Answers are captured to the knowledge base so the agent stops
re-asking — the ask-rate decays as the KB fills. Modeled as a **sibling of `escalate_to_human`** at
every layer.

Written 2026-06-18.

**Progress (2026-06-18).** Phase 1 agent core is done and **validated against `test:evals`**. Step 1
(tool + input type + seam + tool-selection) and step 2 (prompt rules + classification + cache
extractor) shipped as planned. **The planner-forcing backstop was reverted:** running `test:evals`
caught it over-firing — it converted every read-then-stop plan into a merchant question, reding the
gate at 83.9% vs 95.8% baseline (the "over-asking" risk below). The fix made `ask_operator`
**model-elective** (prompt rule + tool only; the terminal-reply guarantee stays as the fallback);
`shouldForcePlanningAskOperator`, `ASK_OPERATOR_DRAFT_PROMPT`, the forced-ask block, and its 8 unit
tests were removed. Re-run: aggregate **94.7% (within threshold)**, all over-ask regressions
recovered, and the `ask_operator` fixture passes model-electively (`calls=1`, nothing forcing it) —
so no prompt tone-down was needed. Agent unit tests 287 pass; both apps typecheck; agent lint clean.
Remaining Phase 1: dashboard surfaces and the answer route (the eval fixture + counter-fixture are
done). Two open items the run surfaced — see the Evals note. The `planner.ts`/`planner-safety.ts`
bullet below is now superseded; the other ✅-marked bullets still describe what shipped.

**Progress (2026-06-19).** Phase 1 is **functionally complete** — both dashboard surfaces are wired to
the answer route. On pickup, more had shipped than the 2026-06-18 note claimed: the answer route
(`app/api/agent/answer/route.ts`), the home data layer (`summary-contract.ts` +
`home-needs-attention.ts` already carrying `needs_merchant_input` + `question`), and
`parseAgentAnswerBody` were already done (uncommitted). The real gap was the **user-facing** surfaces —
the route was *dangling* (built, but called from nowhere). This session built them, all dashboard-only:
(a) a shared **`components/agent/MerchantAnswerForm.tsx`** (the question + answer textarea + save-to-KB
toggle defaulting on + submit; self-contained POST), used by both surfaces; (b) the **home deck** card
variant; (c) the **ticket-view** affordance. **The plan's dashboard file references were stale** — the
"Major Inbox Overhaul" replaced the flat `NeedsYouCards` list with a swipe deck
(`NeedsYou → NeedsYouDeck → SwipeCard + NeedsYouCard`), which forced the one real design call (below).
Detection in the ticket view **reuses the exported `classifyHomePlan`** rather than a new
`planQuestionText` helper, so there was **no agent-package/dist change** and no eval re-run needed.
Verified: dashboard `typecheck` + targeted `eslint` clean, `home-sections.unit.test` passes. This was
**later exercised live** (next note). Remaining: Phase 2 (Telegram) + the Evals follow-ups.

**Progress (2026-06-19, live verification).** Phase 1 was **exercised live end-to-end** against the real
production e2e dashboard (`serve:e2e`; `next start` keeps `NODE_ENV=test`, so the auth bypass stays on)
on the local test DB with **real Anthropic** calls, driving the real HTTP routes. Confirmed: (1) on the
shipping-coverage gap the live planner emits `search_kb → ask_operator` (no deflect/escalate) →
`classifyHomePlan` = `needs_merchant_input`; (2) `POST /api/agent/answer {saveToKb:true}` records the Q/A
note, writes the `KbArticle` (title=question, body=answer, tags=[thread.tag]), re-plans to `quick_reply`
with a real draft that uses the answer, and re-caches under the base instruction; (3) the dashboard's
normal `POST /api/agent/plan` then serves the `send_reply` plan on a **cache hit** (no LLM) — the card
flips from ask to approve; (4) **KB self-decay** holds live — re-asking the same question after the
answer is saved returns `send_reply` (it re-enters via the `search_kb` door), not a re-ask. The render
switch (`MerchantAnswerForm` vs `ActionPlanCard`) is confirmed **in source** against this live `kind`
contract on both surfaces (`ConversationComposerArea.tsx:80-83,158,192`; `NeedsYouCards.tsx:95`); the
**browser pixel render was not exercised** — the shell gates on onboarding + a client Clerk session, so
the bypass path 307s and the ticket detail is client-SWR-rendered, and a real screenshot needs the
real-Clerk browser e2e (`core-agent-flow.spec.ts` style). **One ⚠️ surfaced** — a terminal-less plan on a
refund-mention policy gap; see Evals item (3).

**Progress (2026-06-19, item-3 fix).** The ⚠️ terminal-less-plan-on-refund-mention gap (Evals item 3) is
**fixed and validated.** Took **option (b)** (tighten intent), not the forced backstop: added
`isInformationalReturnQuestion` + `hasMutativeRequestIntent` to `intent.ts` — a policy/eligibility
*question* that merely mentions refund/return/cancel (no order reference, no imperative directive) is no
longer read as a mutative *request* — and swapped **only** the two no-action guards
(`shouldForceMutativeReplan`, `shouldSkipReplyDraftForMutativeIntent`) to the narrower predicate.
Escalation/watch/brand-voice keep the broad `hasActionableMutativeIntent` (erring toward escalation stays
safe — principle #3). This does two things at once: (a) the terminal-reply guarantee re-engages so the
model elects `ask_operator` on the gap — the old `shouldForceMutativeReplan` was injecting
`REPLAN_INCLUDE_REPLY_PROMPT`, which actively suppressed the ask; and (b) the guard no longer strips a
legit `send_reply`, **restoring KB self-decay** for refund/return questions (the corollary in item 3).
Two fixtures added (`ask-operator-returns-policy-gap`, `quick-reply-returns-policy-kb`) — both **pass
live** (real Anthropic, real routes). **Regression surface proven inert without a full-suite run:**
`hasMutativeRequestIntent` ⊆ `hasActionableMutativeIntent`, so any change is true→false only, and
enumerating all 59 fixtures flags *exactly these two* — every existing fixture's guard input is
unchanged. Agent unit 296 pass (+9), typecheck + lint clean, agent `dist` rebuilt (the dashboard/evals
consume built dist, not src). Option (a) (a narrow forced backstop) was **not** needed and deliberately
avoided. Remaining: Phase 2 (Telegram) + Evals follow-ups (1) the 400 flake and (2) retiring
`kb-policy-no-article`.

> **Swipe-deck design call (2026-06-19).** A card carrying a textarea can't live cleanly inside a
> swipe-to-navigate deck. Resolution: the `needs_merchant_input` card **opts out of the drag gesture**
> (`draggable={n > 1 && kind !== "needs_merchant_input"}`, still reachable via the chevrons/dots), and
> on submit it **flips in place via a data refresh rather than dismissing**. The deck's local
> `dismissed` set permanently filters a `threadId`, so dismissing would hide the re-planned reply;
> instead the answer flow calls the refresh callback (home: SWR `mutate`; ticket: `onTicketRefresh`) so
> the same card re-renders as the normal `quick_reply` / `needs_review` approve card. This realizes the
> plan's "card flips immediately" intent and Locked Decision #1 (re-route through the approval card).

> **Why this exists.** A customer asked "do you ship globally?"; with no shipping-coverage policy in
> the KB, the agent was *forced* by the terminal-reply guarantee (`planner.ts:481-548`) to draft a
> customer reply, so it manufactured a deflection: "email support@… or DM @…on Instagram." Those
> channels funnel back into this same inbox — the agent told the customer to contact itself. The
> deflection is the only legal move the planner left it. The right move on a knowledge gap is to
> **ask the merchant**, not guess at the customer.

---

## Diagnosis (two stacked failures)

1. **Self-deflection.** Nothing tells the agent that email / Instagram / etc. all funnel back to it,
   so "go contact the store another way" looks like a valid escape hatch. It is circular and breaks
   the one-inbox-across-all-channels promise. Pure prompt bug.
2. **Forced guess on a knowledge gap (root cause).** The terminal-reply guarantee requires every
   customer-channel plan to end in `send_reply` or `escalate`. On a benign info question with no KB
   answer, no escalation trigger fires (`shouldForcePlanningEscalation`, `planner-safety.ts:150`),
   so it falls through to the forced reply draft (`planner.ts:519-526`, `tool_choice` forced to
   `send_reply`). The model is compelled to produce customer text with nothing real to say.

`escalate_to_human` (`tools/registry/thread.ts:56`) already does the right plumbing — parks the
thread `pending`/`needs_human`, writes a note, pushes a Telegram ping
(`notifyGatewayOfEscalation` → gateway `/internal/operator/escalate` → `pushOperatorEscalation`).
But escalation is a **terminal hard-handoff**: the merchant owns the whole ticket, the agent learns
nothing, and the next identical question escalates again.

## Core idea: split "I can't proceed" into two primitives

- **Hard handoff — `escalate_to_human` (unchanged).** Out-of-scope, fraud, contradictory request,
  money/identity uncertainty, tool failure. The merchant must own the ticket.
- **Soft question — `ask_operator` (new).** The agent knows what it would do *given one missing
  fact or decision*. The merchant supplies the piece; the agent finishes and remembers.

The test for which one: **would the merchant's one-line answer let the agent complete the ticket?**
Yes → ask. No → escalate.

## Locked decisions

1. **After the answer, re-route through the normal approval card — no auto-send.** The merchant
   supplied a *fact*, not sign-off on the customer-facing wording. The re-draft becomes a normal
   `quick_reply` / `needs_review` and rides the existing `quick-approve` path. (High autonomy tiers
   could auto-send in a later iteration; not in v1.)
2. **KB capture via a toggle, default ON.** This is the *primary* re-plan mechanism, not an add-on:
   the answer is written to the KB and re-enters planning through the normal `search_kb` door. The
   answer card has a "save this for next time" toggle; flipping it off treats the answer as a
   one-off (injected as a transient planning note, never written to KB) — for judgment calls like
   "comp this person" that should not become policy.
3. **Dashboard first; Telegram is a fast follow.** Phase 1 ships every web surface plus KB capture.
   Phase 2 adds the Telegram round-trip.

---

## State & data model

**Thread lifecycle** gains one branch. Today: `open` (awaiting reply, has plan) → approve →
executed. New: `open` + plan whose terminal tool is `ask_operator` → surfaced as
`needs_merchant_input` → merchant answers → re-plan → back to a normal `open` plan → approve.

**Where the question lives — no new Thread column.** `ask_operator` is a `RawToolCall` with
`input.question`, so it rides inside the existing `cachedPlan` JSON, keyed to the pending customer
message via `cachedPlanMessageId` (`plan-cache-shape.ts:124`). Add `extractCachedQuestion(cachedPlan)`
mirroring `extractCachedDraftReply` (`plan-cache-shape.ts:87`).

**Telegram pending state (Phase 2).** Add `pendingQuestion` JSONB to `OperatorContext`
(`schema.prisma:256`) — exact sibling of `pendingPlan` / `pendingDigest`. One nullable column.

**KB capture target.** `KnowledgeBase` (`source: "user"`) + `KbArticle` (title/body/tags) already
exist (`schema.prisma:307-338`). Resolve-or-create the org's user KB, write
`{ title: question, body: answer, tags: [thread.tag] }`.

---

## Phase 1 — core + dashboard + KB capture

### Agent core (`packages/agent/`)
- ✅ **`tools/registry/thread.ts` (done, step 1)** — `ask_operator` tool added (category `internal`),
  `execute` calls a new `ctx.askOperator(question)` seam; input type `AskOperatorInput` in
  `tools/registry/types.ts`; description draws the ask-vs-escalate line. **Seam scope was wider than
  one file:** declared on `BaseAgentContext` (`agent-context.ts`) → required `ThreadSink.askOperator`
  (`context.ts`, wired in `buildContext`) → implemented in **both** sinks — dashboard
  `lib/agent/tools/thread.ts` *and* gateway `message-handlers/agent-thread-sink.ts` (the second sink
  was easy to miss). **Deviations from this plan:** (a) the seam is **optional** on `BaseAgentContext`
  (`askOperator?:`), parallel to the thread-coupled `io?` sink rather than the required cross-module
  `escalate` — so order-ops and the planner test stubs stay untouched; (b) Phase-1 sink writes an
  audit note but does **not** park the thread (soft ask ≠ hard handoff) and pushes no Telegram (that's
  Phase 2); (c) the run-path `execute` returns `toolEscalated(question)` as a safe placeholder (halts
  the loop if ever run — Phase 1 never runs an `ask_operator` plan, classification intercepts it); a
  distinct "asked" status for the Review/audit trail is deferred to the executor step.
- ✅ **Tool selection (done, step 1)** — **no change needed** to `selectInitialPlanningTools` (it
  already offers every tool except `send_reply`) or `selectAgentTools` (support threads pass a `null`
  allow-list, so the internal-category `ask_operator` is offered by default; operator channels
  correctly exclude it). ⚠️ The original premise here was **stale**: phase-1 is *not* limited to reads
  + `send_reply` + `escalate`. The one real change was adding `ask_operator` to `keepPhase1ToolCall`
  (`planner-tools.ts`) so a phase-1 emission survives the replan merge, exactly like
  `escalate_to_human`.
- ✅ **`prompt.ts` (done)** — two rules added to `SUPPORT_INSTRUCTIONS` (placed after the escalate
  cluster, before the general task rules): (a) prefer `ask_operator` over guessing/deflecting when one
  merchant-only fact would unblock the ticket, carrying the ask-vs-escalate test; (b) "you ARE the
  support channel … never tell a customer to contact the store another way; those reach you."
  **Deviation:** rule (a) also spells out "`ask_operator` asks the MERCHANT (a policy/judgment gap) vs
  `send_reply` asks the CUSTOMER (e.g. their own order number)" so it doesn't collide with the existing
  identity/order-lookup rule that legitimately asks the customer for details.
- ❌ **`planner.ts` + `planner-safety.ts` — SUPERSEDED (forced backstop removed 2026-06-18; it over-fired and red the eval gate — `ask_operator` is now model-elective, see Progress + Evals).** Original design, kept for history: `shouldForcePlanningAskOperator` detector +
  `ASK_OPERATOR_DRAFT_PROMPT` + a forced-`ask_operator` draft block (mirrors the escalation-draft
  block) inserted between the forced-escalate backstop and the terminal-reply guarantee; the
  terminal-reply guarantee now stands down when an ask was produced (no double terminal), and the
  completion log gains `askOperatorDrafted`. Unit-tested in `planner-safety.test.ts` (+8 cases).
  **Deviations:** (a) the detector also stands down when a mutative action is already planned
  (`planHasActionTool`) — a planned refund only needs the reply *notification*, not a merchant
  question; the first cut omitted this and broke the existing `planner.test.ts` reply-draft case, which
  is what caught it. (b) ⚠️ **Not yet validated against `test:evals`** (no fixture exists, suite not
  run) — this is the regression-prone change flagged in the Evals note; that run remains the gate.
- ✅ **`plan-preview.ts` (done)** — `needs_merchant_input` added to `HomePlanKind`; `classifyHomePlan`
  returns it when the plan's terminal tool is `ask_operator`. Unit-tested in `plan-preview.test.ts`
  (+3 cases). **Deviations:** (a) added a `question: string | null` field to `HomePlanClassification`
  (flows the question to the dashboard beside `replyText`), updating all return sites; (b) the
  `ask_operator` branch short-circuits *before* the blocking-warning and questionable-sender checks —
  an explicit ask is a terminal decision (like escalate in the planner) and there is no customer-facing
  send to gate.
- ✅ **`plan-cache-shape.ts` (done)** — `extractCachedQuestion()` added, mirroring
  `extractCachedDraftReply` (pulls `input.question` from the cached `ask_operator` call). Exported for
  half B; no deviation.

### Dashboard (`apps/dashboard/`)
- ✅ **`lib/home/summary-contract.ts`** + **`lib/server/home-needs-attention.ts`** (done) — carry the
  new kind through and add `question` to `HomeNeedsAttentionItem`. `loadNeedsAttention` maps the
  classifier's `needs_merchant_input` straight through instead of collapsing it to `needs_review`.
- ✅ **Home deck card variant** (done, 2026-06-19) — **plan reference was stale** (pre-overhaul): the
  variant now spans `NeedsYouCards.tsx` *and* `NeedsYouDeck.tsx`. `NeedsYouCard` early-returns a
  `needs_merchant_input` body (headline + customer message + the shared answer form + View Ticket);
  `NeedsYouDeck` disables drag on the input card and wires the refresh callback as `onAnswered`;
  `NeedsYouCardPeek` previews the question on the card behind. The form itself is the new shared
  **`components/agent/MerchantAnswerForm.tsx`** (question + textarea + save-to-KB toggle default-on +
  submit, POST `/api/agent/answer`). **Deviation:** submit **flips in place via refresh, not dismiss** —
  see the 2026-06-19 swipe-deck design call above.
- ✅ **Ticket conversation view** (done, 2026-06-19) — `ConversationComposerArea.tsx` renders a
  `MerchantAnswerCard` (the shared form in plan-card chrome) **in place of** `ActionPlanCard` when the
  pending plan is an `ask_operator` plan, on both the desktop and mobile-sticky surfaces; `threadId`
  and an `onAnswered` (→ `onTicketRefresh`, which reloads the re-cached plan so `ActionPlanCard` returns
  for approval) are threaded through `ConversationView`. **Deviation:** detection reuses the exported
  `classifyHomePlan(plan, null)` rather than a bespoke `ask_operator` check — no agent-package change.
- ✅ **`app/api/agent/answer/route.ts`** (done; pre-existing this session) — `{ threadId, answer,
  saveToKb }`: records the answer as a note; if `saveToKb`, resolve-or-creates the org's `source:"user"`
  KB and writes a `KbArticle`; re-invokes `planAgent`; re-caches; returns the new classification. If not
  saved, the answer rides as a transient planning note for that single re-plan. **The clean trick:** a
  saved answer re-enters planning through the normal KB door (`search_kb` / pre-loaded `ctx.kbArticles`)
  — no bespoke context injection. (Already built when this session started; the gap was that nothing
  called it.)

### Evals
- ✅ **Done (the merge gate, 2026-06-18).** Added `ask-operator-shipping-coverage-gap` (knowledge-gap
  → `ask_operator`, asserts `needs_merchant_input`) and its counter-fixture
  `quick-reply-shipping-coverage-kb` (same "ship to Canada?" question but a KB article answers it →
  must `send_reply`, must NOT ask), both under `apps/dashboard/src/lib/agent/__evals__/fixtures/`.
  Running `test:evals` caught the forced backstop over-firing (83.9% vs 95.8%); removing it restored
  the gate to **94.7% aggregate (within threshold)** with every over-ask regression recovered, and
  the ask fixture passing model-electively. **Three open items the run surfaced:** (1) an intermittent
  `400 tool_use without tool_result` planner-transcript bug — pre-existing (predates this work),
  lands on ~1 random fixture per repeats=1 run, passes on re-run; worth a separate fix. (2) advisory
  `kb-policy-no-article` now legitimately flips to `ask_operator` (a real policy gap) — consider
  retiring or converting it. (3) **Terminal-less plan on a refund-mention policy gap (⚠️ live
  2026-06-19).** A returns question ("what's your return policy… can I send it back for a refund, who
  pays return shipping?") planned `[search_kb, search_kb]` with **no terminal tool** — empty `steps` +
  warning "Customer requested a refund/cancel but no action was planned — review before sending".
  **Root-caused (code-confirmed, pre-existing — not this change):** the bare substring "refund" in the
  customer text trips `hasCustomerMutativeIntent` (`intent.ts` `CUSTOMER_MUTATIVE_PHRASES`), so the
  pre-existing `shouldSkipReplyDraftForMutativeIntent` guard (`planner-safety.ts:259`) both strips any
  `send_reply` (`applyMutativeIntentNoActionGuard`) and stands the terminal-reply guarantee down
  (`planner.ts:490`). The ask-operator diff left that path untouched (it only added `!hasAskOperator` to
  the terminal condition); `ask_operator` *survives* the guard, so when the model elects it the plan is a
  clean `needs_merchant_input` — but the ask is model-elective and didn't fire on this run, exposing the
  pre-existing empty-plan outcome. **Notable corollary:** because the guard strips a pure `send_reply`
  whenever a mutative keyword appears with no order-action/escalation planned, the KB self-decay loop does
  **not** apply to refund/return/cancel-mention questions the way it does to the shipping gap — even with
  a KB answer a reply-only plan gets stripped; the only surviving terminals are `ask_operator`,
  `escalate`, or an actual action. Fix options: (a) a *narrow* forced-`ask_operator` backstop fired only
  in this mutative-intent-with-no-terminal corner (far tighter than the reverted global backstop, so it
  can't re-trigger the over-ask regression); and/or (b) tighten `CUSTOMER_MUTATIVE_PHRASES`/intent so a
  policy *question* ("what's your return policy") isn't read as a refund *request*. Add a fixture either way.

> ⚠️ The planner-forcing change is the same class of change that regressed the support eval gate in
> June 2026 (64.8% vs 93.1% on master). Treat eval coverage as a merge gate, not an afterthought.

---

## Phase 2 — Telegram round-trip

- **`OperatorContext.pendingQuestion`** migration (one nullable JSONB column).
- **`pushOperatorQuestion(orgId, threadId, question)`** mirroring `pushOperatorEscalation`
  (`operator-escalation.ts:34`); sets `pendingQuestion`.
- **`/internal/operator/question`** internal route — the dashboard sink hops here, exactly like
  `/operator/escalate` (`internal-operator.ts:7`).
- **Inbound ingest** — when `pendingQuestion` is set, a free-text Telegram reply is the answer →
  call the same answer-ingestion logic (re-plan + KB) → confirm "Got it — drafted a reply for
  {customer}." Mirrors `handlePendingPlanCommand` (`telegram/pending-plan-commands.ts:26`).

---

## Risks

- **Over-asking** is the main failure mode — a cheap "ask" tool invites trivial pings. Defenses: the
  prompt gate (only stable, reusable facts; never "what should I say in this reply"), the autonomy
  tier, and — most importantly — KB-persistence making the ask-rate self-decay.
- **Latency** — the customer now waits on the merchant. Correct, and no worse than today's
  escalation, which also waits.
- **New plan state threads through many surfaces** (classification, home card, ticket view, cache,
  and later Telegram) — hence the phasing.

## Out of scope (for now)

- Auto-sending the re-draft on high autonomy tiers.
- Batching multiple open questions into one merchant prompt.
- A dedicated "questions" inbox view separate from the home deck.
