# Shopkeeper — Agent Pipeline Audit

**Scope:** the control flow and the merchant-facing output layer. What decides whether the agent acts on its own, who owns that decision, and what happens to the model's output between the model and the merchant's phone. Plus the work order that comes out of it.

**Date:** 2026-08-21, re-verified 2026-08-22. Static read of the working tree, plus one live classifier probe against a real multi-intent ticket.

This file used to claim "every claim carries a `file:line`" as though that were the same as being checked. It is not, and §4b records what that cost. Where a number appears below, the command that produced it is stated or the number is marked unmeasured.

**History.** This file previously held the 2026-08-16 audit of the *model-call* layer — LLM call-site census, token accounting, prompt-cache analysis, and ~2,600 lines of appendices with verbatim prompts and per-tool schema sizes. That material was not wrong and is not superseded; it is preserved in git at `2cc9749c` and worth reading when the question is cost or determinism. Every still-open item from its work order is carried forward in [§4 To-do](#4--to-do) with its original evidence. What replaced it is an audit of the layers that one deliberately did not cover.

---

## 1 — Verdict

`packages/agent` is not bloated. The 2026-08-16 audit concluded this and I confirmed it independently: one agent loop of 118 lines, a tool registry that is a plain array, no unused *files* per `knip` — though the same run carries a reviewed baseline of 139 unused exports and 121 unused types repo-wide, so "clean" here means clean of dead files, not of dead surface.

The problems are on either side of it.

**Nothing owns the autonomy decision.** It is spread across four call sites in two packages, evaluated in two different orders, and its final gate was, until Phase 1, a substring match on English prose.

**The output layer is bigger than the agent that feeds it.** 2,790 source LOC and 2,289 test LOC of hand-written English generation, against a 118-line agent loop.

Both are the same failure in different clothes: the system does not trust the model's output, so it grew a repair layer — and the repair layer has no schema, so it repairs prose with prose.

---

## 2 — Findings

### 2.1 Autonomy is gated on English prose

`packages/agent/src/plan-preview.ts:163-178`

```ts
function warningBlocksQuickReply(warning: string, plan: AgentPlan): boolean {
  const lower = warning.toLowerCase()
  if (lower.includes("couldn't find a shopify customer") || ...) {
    return usesCustomerOrOrderContext(plan)
  }
  if (lower.includes("no relevant kb articles found")) {
    return false
  }
  return true
}
```

This is the last gate before `auto_execute` and `quick_reply` (`plan-preview.ts:290`). **Whether the agent may act without a human is decided by substring-matching a sentence another part of the system wrote.** There is no code, no enum, no type. Rewording a warning silently changes what the agent is allowed to do.

It has already gone wrong once — the `"no relevant kb articles found"` carve-out at line 172 exists because a benign warning was blocking auto-execute in production. That fix is itself a hardcoded string.

It is already drifting. The producer writes `"Couldn't find a Shopify customer - verify the correct account is linked before approving."` (`planner-read-tools.ts:68`, and again at `:160` — copy-pasted). A dashboard test asserts `"Couldn't find a Shopify customer linked to this thread."` (`resolve-ticket-coco-action.unit.test.ts:113`). Different sentences. They match only because both happen to contain the prefix being searched for.

And the warning text is known to be wrong: the 2026-08-20 run recorded `No matching product found - the order edit step may need a corrected product name` firing twice against a plan containing no order edit. That text is load-bearing for an autonomy decision.

**This is the most dangerous line of code in the pipeline.** The prior audit quotes this function and recommends routing a new failure *through* it (its work order item 2). I disagree. It should not be extended; it should be deleted and replaced with a typed signal. *(Done in Phase 1: the function, `isShopifyCustomerWarning` and `planWarningTiers` are deleted, and producers emit `PlanSignal { code, severity, message }` instead.)*

### 2.2 The autonomy decision has no owner

The same question — "may this run without a human?" — is answered in four places:

| Where | When | What it decides |
|---|---|---|
| `routePlan` (`planner-routing.ts:337`) | plan time, inside `planAgent` | `proceed` / `escalate` + a merchant question |
| `classifyHomePlan` (`plan-preview.ts:198`) | consume time | `quick_reply` / `auto_execute` / `needs_review` / `needs_merchant_input` |
| `checkStaticToolPolicy` (`plan-preview.ts:255`) | consume time | re-derives whether each mutative call is permitted |
| `checkParsedStaticToolPolicy` (`executor.ts:92`) | execute time | derives it again, authoritatively |

They are chained through a mutable field: `routePlan` writes `plan.routing`, and `classifyHomePlan` reads `plan.routing?.question` (`plan-preview.ts:223`) to decide `needs_merchant_input`. Static policy is evaluated twice against the same tool calls, once to classify and once to enforce, through two different entry points into the same module.

Nothing guarantees the four agree. There is no single function you can read to learn what the agent is allowed to do.

### 2.3 Six sequential repair passes over the model's output

`packages/agent/src/planner.ts:135-192`, in order:

1. `stripCreateRefundForAlreadyRefundedOrders`
2. `stripEmptySendReplyToolCalls`
3. `stripInternalNotesWithoutActions`
4. `applyEscalationRouting` — rewrites the tool-call list
5. `groundEscalationReasons` — rewrites `escalate_to_human.reason`
6. `groundReplyText` — deletes sentences from `send_reply.text`

Each was added after a specific bad output. Passes 5 and 6 are the tell: `stripUngroundedSentences` (`planner-routing.ts:558`) removes individual sentences from the reply the customer will read, because the model asserts actions it did not plan.

The system's response to "the model said something untrue" is to edit the sentence rather than reject the plan. A plan carrying a fabricated claim is not a plan with a bad sentence in it — it is evidence that the model misunderstood the situation, and shipping the remainder after excision is a worse failure mode than stopping.

This is the same pattern CLAUDE.md already names for prompts — *"a prompt growing situation-by-situation means a capability is missing"* — appearing on the code side, where nobody is watching for it.

### 2.4 The output layer is bigger than the agent

Measured at the audit's own commit (`0f396f50~1`), with the tree as of 2026-08-22 beside it:

| File | Source (then → now) | Tests (then → now) |
|---|---:|---:|
| `digest-briefing.ts` | 1,068 → 1,100 | 655 → 789 |
| `digest.ts` | 758 → 762 | 675 → 712 |
| `planning-notifications.ts` | 682 → 689 | 739 → 788 |
| `operator-ledger.ts` | 122 → 122 | — |
| `digest-shopify-garnish.ts` | 117 → 117 | — |
| **Total** | **2,747 → 2,790** | **2,069 → 2,289** |

Against that: the agent loop is 118 lines (`runAgentLoop`, `agent-loop.ts:144-261`), the planner 253, the tool registry 175.

`digest-briefing.ts` is the largest file in the entire pipeline. It contains a hand-rolled natural-language engine: two near-duplicate reported-speech regexes (one capturing, one not), a **29**-entry irregular-verb backshift table, a **six**-rule punctuation repairer that exists only to clean up damage done by the other transforms in the same file, and a truncation cascade with **four** budgets (`BRIEFING_TOPIC_MAX`, `HANDOFF_VERBATIM_MAX`, `HANDOFF_SUMMARY_MAX`, `BRIEFING_RECITE_MAX`). **28** `replace`/`match`/`test` calls in one file (29 at the audit's commit).

It does not work reliably, and the file knows it — its own comments record that per-phrase fixes were tried and deleted because *"each was fitted to one morning's summaries and left the next morning's raw."* The bug that started this audit was `requests → asked` dropping a preposition, producing "asked a refund" on a merchant's phone.

**An LLM product is post-processing the LLM's output with a bespoke NLP layer larger than the agent itself.** That is backwards.

### 2.5 Five copies of one naming rule, three diverged helpers

The question "what do we call this person" is answered independently in:

- `email-classification.ts:100` and `:115` — instructs the model
- `planning-notifications.ts:167` (`anonymousNoun`) and `:267` (`namelessNoun`) — two different fallbacks in one file
- `digest-briefing.ts` (`VISITOR_SUBJECT`), plus a fifth open-coded copy inside `formatApprovalItemLine`
- `customer-name.ts:1` in the dashboard

Four different strings for one person. Only two consulted verification state, which is why a shopper who had proved they owned order #1024 was reported to the merchant as an unidentified visitor while the operator card for the same thread said the opposite. *(Closed in Phase 4.5: `classifyPerson` in `packages/agent/src/person-name.ts` answers this once, and three renderers print it in the registers English needs. The prompt-side copies at `email-classification.ts:100`/`:115` stay — they instruct the model rather than render for the merchant.)*

Three text helpers are duplicated and have drifted:

- `customerFirstName` — `digest-briefing.ts:92` trims and splits on any whitespace; `planning-notifications.ts:154` splits on a single space with no trim. A leading space yields `""` on the operator card. *(One implementation now, the trimming one — Phase 4.5.)*
- `endSentence` — `planning-notifications.ts:163` trims first; `digest.ts:238` does not, producing `"text ."`.
- `lowerFirst` — **not duplicated verbatim, which this list had backwards.** `digest-briefing.ts:930` lowercases unconditionally; `planning-notifications.ts:157` only lowercases when the string matches `/^[A-Z][a-z]/`. So an acronym opener diverges by surface: "URL expired" stays itself on the operator card and reaches the briefing as "uRL expired". It is the most drifted of the three, not the safe one.

Plus the prior audit's `fallbackTitleFromSummary` (×2, drifted) and `isDeterministicE2EAIEnabled` (×2, different `NODE_ENV` semantics), both still open.

### 2.6 Four overlapping description fields, no rule about which to use

`Thread` carries `aiSummary` (whole episode), `requestSummary` (current ask), `aiTitle` (3–6 word topic), and the classifier also emits `requestDisposition`. The choice between them is re-derived at every call site rather than owned anywhere — `generate-thread-plan.ts:82` explains the rule in a comment, `delivery-exception-plan.ts:215` and `return-arrival-plan.ts:107` each restate it, and the digest simply never selected the column, which is the bug that produced the incoherent briefing.

### 2.7 The prompt is mostly prohibitions

`SUPPORT_INSTRUCTIONS` is 10,924 characters over 38 bullets, and three of them restate the same `get_order_tracking` rule. It ships on every iteration of every ticket. Those three numbers reproduce exactly.

The fourth did not. This section claimed **27 bullets contain a prohibition, "measured, not estimated"** — but no method was recorded, and none obvious returns 27: counting `never`/`do not`/`don't`/`avoid` gives **22**, and admitting bare `no`/`not` gives **30**. A number defended as measured has to carry the measurement. Read it as "most of them", which is the part that survives either count.

A prompt written mostly as "don't" is a specification written as a plea. Most of those bullets describe invariants that a schema or the executor could enforce structurally.

### 2.8 The context budget is off — and this section was wrong about what that costs

`resolveContextBudgetMode` returns `"off"` when `AGENT_CONTEXT_BUDGET_MODE` is unset (`context-budget.ts:44`). The bounded paths exist, are tested, and are switched off; the runbook explicitly pauses the `enforce` rollout. In the `off` branch the classifier query loads every non-note message on the thread with no `take` (`intelligence.ts:44-47`).

**What this section then concluded — "a long-running thread grows the classifier prompt without limit until it fails" — is false.** Those rows never reach the prompt unbounded. `generateThreadIntelligence` passes them through `buildBoundedClassifierConversation` on *both* branches (`intelligence.ts:39-42`), and that function bounds unconditionally: last 20 messages, 4,000 characters each, 16,000 total, then an 18,000-character cap on the assembled text (`context-budget.ts:162-188`, `CONTEXT_BUDGETS` at `:14-17`). `enforce` only moves the same bound into the Prisma query. The real cost of `off` here is a fetch that reads a whole thread and discards most of it — worker memory and DB IO, not prompt growth.

There *is* an unbounded-by-size path, and it is not the one this section named. In non-`enforce`, `buildContext` fetches a 50-message window and hands it to the planner unbudgeted (`context.ts:131-133`, `:344-346`); the per-message and total character caps apply only under `enforce`. Fifty long messages make a large planner prompt. So: bounded in count, uncapped in size, on the agent path — not the classifier.

The error is worth keeping visible because of how it was made. The citation was exact, the code at it said what the section claimed, and the conclusion still did not follow — the next four lines, where the rows get budgeted, were never read. A `file:line` proves someone looked at that line. It proves nothing about the line after it.

---

## 3 — Target architecture

Four changes. They are independent, and each one deletes more than it adds.

### A. A typed plan verdict, replacing warning strings

```ts
type PlanSignal = {
  code: "shopify_customer_unresolved" | "kb_no_match" | "order_fetch_failed" | ...
  severity: "blocking" | "advisory"
  message: string   // for humans only — never matched on
}
```

`warningBlocksQuickReply` becomes `signal.severity === "blocking"`. The prose becomes display-only. This alone removes the substring gate, the drift between producer and consumer, and the class of bug where rewording changes behaviour.

### B. One autonomy function

```ts
decideAutonomy(plan, signals, settings, context) → Verdict
```

One place, one return type. `routePlan` and `classifyHomePlan` collapse into it. The executor enforces the verdict rather than re-deriving policy; static policy is evaluated once. The chained mutable `plan.routing` field disappears.

This is the change that makes the system explainable — you can answer "why did it send that?" by reading one function.

### C. Validate plans, don't repair them

Replace the six repair passes with one validation pass returning `valid | invalid(signals)`. Move what the strip-passes enforce into tool schemas where possible (an empty `send_reply.text` should fail schema validation, not be silently dropped later). A plan that fails validation goes to the merchant with the reason — it does not get edited and shipped.

Keep `groundEscalationReasons` / `groundReplyText` as *detectors*, not editors: an ungrounded claim marks the plan invalid instead of having the sentence excised.

### D. Render notifications from structured data, not from prose

Today the classifier writes an English sentence, and 2,747 lines of code try to rewrite that sentence into a different English sentence — changing tense, swapping subjects, repairing punctuation the rewriting broke, and truncating the result to fit a phone.

Instead, have the classifier emit fields:

```ts
{
  actor: { kind: "customer" | "visitor" | "verified", orders: ["#1024"] },
  ask: "refund" | "replace" | "address_change" | ...,
  subject: "Hydrogen snowboard",
  order: "#1024",
  deadline: "2026-08-23",
  alternative: "refund"
}
```

and compose the sentence from fields. The tense engine, the punctuation repairer, the truncation cascade, the five naming copies and the subject-substitution regex all delete at once — because none of them have anything left to do. Length is controlled by choosing which fields to render, not by cutting a string mid-word.

It also fixes the product problem the live probe exposed: with `deadline` as a field, the briefing can lead with *"Needs an answer by Friday"* instead of burying it 180 characters into a sentence. Right now the briefing cannot know which part of the sentence matters, because it only has a sentence.

---

## 4 — To-do

Six phases. Phase 0 is independent of the rest and goes first: those are live bugs, and none of the architecture work touches them.

Estimates are engineering days for one person, and they are estimates. "Gate" means the eval suite must run on the PR — `evals.yml` triggers on `pull_request`, so a change pushed straight to `master` is never gated.

| Phase | Theme | Est. | Net LOC | Gate | Status |
|---|---|---:|---:|---|---|
| 0 | Live bugs | ~1.5 d | ~0 | none owed | **Closed** — 0.1 (#54), 0.3 (#55); 0.2 was already fixed, 0.4 dropped |
| 1 | Typed signals (A) | ~1 d | −40 | No | **Closed** — 1.1–1.5 |
| 2 | Validate, don't repair (C) | ~2 d | −150 | Yes | Open |
| 3 | One autonomy function (B) | ~3 d | −400 | Yes | Open — absorbs the 0.4 regex deletion |
| 4 | Structured rendering (D) | 8–10 d | −1,500 | Yes + phone | **In progress** — 4.1–4.3 (#56, #57) and 4.5 done; 4.4 blocked on two decisions |
| 5 | Cost & housekeeping | ~3 d | −350 (unmeasured) | 5.2 only | Open — 5.1 closed, 5.1a struck; 5.2 and 5.3 re-sized after re-verification. Nothing here gates Phase 3 |

---

### Phase 0 — Live bugs

Carried forward from the 2026-08-16 work order. **Closed 2026-08-21.** Two were real and are fixed; one was already fixed before this audit was written, and one was miscategorised.

Line references in *closed* items describe the code as it was when the bug was found; the fix moved or deleted most of them. Re-derived 2026-08-22: the substance of all four holds, and 0.2's four citations (`context.ts:263`, `:407`, `planner-read-tools.ts:61`, `planner.ts:141`) are still exact.

- [x] **0.1 — `temperature: 0` breaks brand-voice synthesis, silently.** `voice-synthesis.ts:123` + `constants.ts:7`. Sonnet 5 rejects non-default sampling parameters with a 400. The daily job catches it per-org (`voice-synthesis.ts:236-241`), reports success, and the only test mocks the SDK, so nothing has ever validated the parameter. `VoiceEdit` rows accumulate and the brief never improves. **Fix:** delete the line; add a test asserting the request body rather than mocking it. **~15 min.** Confirm the 400 first so you fix the real cause. *(PR #54. The 400 was confirmed against the current API contract before the line came out. Only live instance in the repo — `ai/index.ts:73` and the dashboard summary route also pass `temperature`, but both run on Haiku 4.5, where it is still accepted.)*

- [x] **0.2 — A Shopify blip becomes a confident wrong reply, auto-sent.** ~~`context.ts:259`~~ **Already fixed when this audit was written; the finding was stale.** `recentOrdersFetchFailed` is set at `context.ts:263`, carried on the context at `:407`, and produces a blocking warning at `planner-read-tools.ts:61` via `planner.ts:141`. It lands in `warningBlocksQuickReply`'s default-`true` branch, so quick-reply auto-send is already blocked. It was implemented as a prose warning, which made it a **Phase 1.2 conversion target** rather than a live bug; it is now the `recent_orders_fetch_failed` signal, still blocking.

- [x] **0.3 — Skipped-step re-draft executes without telling the customer.** `planner-skip-reply.ts:218-228`. After two failed forced-tool attempts the function returns `withoutTerminal` — the mutative actions minus the customer notification. The refund happens; the customer is never told. **Fix:** on re-draft failure, do not execute — return the plan to the merchant. **1–2 h.** *(PR #55. `refreshTerminalSendAfterSkip` now returns `{ status: "ok", toolCalls } | { status: "redraft_failed" }`; the operator handler runs nothing, leaves the plan pending, and says why.)*

- [x] **0.4 — Money-path escalation is English-regex-gated on a multilingual product.** **Dropped as a standalone item 2026-08-21 — it is not a live bug, and this list overstated it.** The guard only fires when the plan has no action and no escalation (`planner-routing.ts:317`), so a missed match degrades `escalate` to `needs_review`. Both stop at a human; neither auto-sends and neither moves money. The delta is which surface the merchant sees on a reply-only plan — polish, not a trust-binary failure, and it did not belong in a list headed "live bugs" beside 0.3. The part worth keeping — deleting the prose regex, driving off `intents` plus plan shape — falls out of **Phase 3** for free when `routePlan` and `classifyHomePlan` collapse into `decideAutonomy`. Doing it alone buys a paid eval run and a set of non-English fixtures to turn `needs_review` into `escalate`.

---

### Phase 1 — Typed signals

Smallest change with the largest safety return. Phase 3 depends on it.

**Closed 2026-08-21.** `packages/agent/src/plan-signals.ts` is the new owner: one message table, one severity resolver, one reader.

- [x] **1.1** Define `PlanSignal { code, severity, message }` and the `code` union. Codes come from the existing warning producers, one code per distinct condition. *(Nine `ProducedPlanSignalCode`s in `types.ts`, plus `legacy_warning`, which only ever appears when reading a plan cached before signals existed.)*
- [x] **1.2** Convert producers to emit signals: `planner-read-tools.ts:68`, `:160`, `:171`, and the pre-fetch-failure warning at `:61` carried over from 0.2. *(Producers now push codes; `planner-safety`'s two exported warning strings are deleted and `RoutingOutcome.warnings` became `signalCodes`. `PLAN_SIGNAL_MESSAGES` is the only place the English lives, so the producer/test drift at `resolve-ticket-coco-action.unit.test.ts:113` cannot recur — that test builds its signal from the real resolver.)*
- [x] **1.3** Replace `warningBlocksQuickReply` with `signal.severity === "blocking"`. Delete `isShopifyCustomerWarning` and `planWarningTiers`. *(Severity is resolved once in `planAgent`, against the finished tool calls, and stored. `kb_no_match` is advisory; `shopify_customer_unresolved` is the one plan-dependent case and keeps its old rule — blocking only when the plan used a customer/order read.)*
- [x] **1.4** Update dashboard consumers to render `message` and branch on `code` — never on text. *(`planSignalTiers` replaces `planWarningTiers` in `useActionPlanReviewState` and `resolve-ticket-coco-action`; `ActionPlanBody` branches on `code` and severity.)*
- [x] **1.5** Keep `AgentPlan.warnings` as a derived `string[]` for one release so stored plans stay readable, then drop it. *(Derived in `planner.ts` and marked `@deprecated`. A cached plan with warnings and no signals reads as one `legacy_warning` per warning, severity `blocking` — fail closed rather than guess a code from the text. Both drop out together.)*

**Done when:** no `.includes(` over warning text exists anywhere in the repo. **Met** — the only remaining `.includes(` on this path tests a `ProducedPlanSignalCode[]`.

---

### Phase 2 — Validate, don't repair

- [ ] **2.1** Move what the strip-passes enforce into tool schemas where the schema can express it — an empty `send_reply.text` should fail validation, not be silently dropped three passes later.
- [ ] **2.2** Convert `groundEscalationReasons` and `groundReplyText` from editors to detectors: emit a `blocking` signal instead of rewriting the text.
- [ ] **2.3** Collapse the remaining strip-passes into one validation pass returning `valid | invalid(signals)`.
- [ ] **2.4** Route `invalid` plans to the merchant with the reason. Nothing is edited and shipped.
- [ ] **2.5 Gate.** This changes what reaches the customer on plans the model got wrong — exactly what the fixtures grade.

**Done when:** `planner.ts` contains one validation call, not six mutation passes.

---

### Phase 3 — One autonomy function

- [ ] **3.1** Write `decideAutonomy(plan, signals, settings, context) → Verdict` with a single return type covering escalate / needs_merchant_input / needs_review / quick_reply / auto_execute.
- [ ] **3.2** Move `routePlan`'s decision and `classifyHomePlan`'s classification into it. Delete both.
- [ ] **3.3** Remove the `plan.routing` mutable-field chaining; the verdict carries the merchant question.
- [ ] **3.4** Evaluate static policy once. The executor enforces the verdict rather than re-deriving it.
- [ ] **3.5** Delete `computeLegacyRouting` + `logRoutingShadow` (prior work order item 9). **The ~340 LOC figure this item carried is not supported** — the two functions are ~72 lines together (`planner-routing.ts:130-172` and `:179-209`). Any larger number has to come from helpers only they reach, and nothing here established which. Measure before quoting a size. Decide the no-signals fallback explicitly first: missing signals is a real state (classifier outage, `channels.ts:296-311` fast path).
- [ ] **3.6 Gate.** Full suite, not the core gate.

**Done when:** "why did the agent send that?" is answerable by reading one function.

---

### Phase 4 — Structured notification rendering

The real project, and the one that needs product judgment rather than only engineering.

- [x] **4.1** Design the field schema. Start from what the briefing and the operator card actually need to say, not from what the classifier currently emits. *(PR #56. `RequestFacts { ask, subject, order, deadline, deadlineText, alternative }` in `packages/agent/src/classifier-signals.ts`; `ask` is a closed vocabulary so consumers branch on a value, never on prose.)*
- [x] **4.2** Move the classifier to schema-enforced structured output (`output_config` + `json_schema`) — this also closes prior work order item 5, which flagged that the one call on every inbound message's critical path asks for JSON in prose. `voice-synthesis.ts:129-134` already demonstrates the pattern in this codebase. *(PR #56. `CLASSIFIER_OUTPUT_SCHEMA` covers every field the prompt asks for, not just the new ones. `CLASSIFIER_VERSION` → 5. A `Today:` line goes in the user message — not the system prompt — so "by Friday" can resolve to a date without moving the cached prefix.)*
- [x] **4.3** Write the renderer: compose sentences from fields, with explicit field priority so the load-bearing fact leads. *(PR #56 built `briefing-fields.ts` — deadline → who → ask — and wired `formatTicketLine`. `byDeadlineFirst` was built and left uncalled for a day — the line-level lead landed in #56 and the list-level ordering only on 2026-08-22. See the Decisions note below. PR #57 wired the four remaining lines: `formatEscalatedTicketLine`, `formatBlockedTicketLine`, `formatApprovalItemLine` (both call sites; the operator select never read `classifierSignals` at all) and the flagged line in `digest.ts`. Deadlines render from the date, never by rewording the customer: `deadlineText` prints verbatim or not at all, so there is nothing to repair afterwards.)*
- [ ] **4.4** Delete the tense engine (`humanizeReportedSummary`, `REPORTED_VERB_PAST`, `REPORTED_SPEECH`, `SUMMARY_PREAMBLE`), `tidyPunctuation`, and the truncation cascade. **No longer blocked on 4.3 — blocked on two decisions instead**, and the second is the larger one:
  - *Pre-v5 threads.* Every line prefers fields, but the prose path is still the fallback for threads classified before version 5, so deleting it strands them. Backfill `requestFacts` onto open pre-v5 threads, or keep the fallback until they age out. v5 shipped 2026-08-21 in #56 and prod has no merchants, so the stranded population is test threads — "let them age out" is close to free.
  - *`ask: "none"`.* `formatFactsBriefingLine` returns null when `!parts.ask && !parts.deadline` (`briefing-fields.ts:121`), and `ask: "none"` is a legitimate **v5** output. Not a rare one either: the existing-customer email fast path at `channels.ts:296-311` skips the classifier entirely and writes `requestFacts: emptyRequestFacts()`, so **every repeat customer emailing in gets `ask: "none"`** — the prose path is the normal path for them, not an edge case. So the prose path serves current-version threads too, not only old ones — `rowRequestFacts` says so in its own doc comment at `digest-briefing.ts:443-447` ("null for every thread classified before version 5 **and for any the classifier could not read an ask off**, which is what keeps the prose fallbacks below reachable"). The `:559-561` this item cited was never that comment; at the commit it was written against, those lines were `getPlanExecution` and `IRREGULAR_PAST`. The deletion cannot happen at all until a field-based rendering exists for the ask-less case. Backfilling does not touch this.

  This is where the ~1,500-line deletion actually lands.
- [x] **4.5** Collapse the remaining naming copies — `anonymousNoun`, `namelessNoun`, `customer-name.ts` — onto the one helper. *(`packages/agent/src/person-name.ts`: `classifyPerson` answers who this is once, and `personLabel` / `personSubject` / `personObject` render it in the three registers English needs — a list row, the start of a sentence, after a preposition. The six copies are gone, `customerFirstName`'s two implementations with them. It also closes the §2.5 bug at its remaining end: the operator card never read verification, so it opened "Someone on your storefront replied" one line above its own "They confirmed the email on #1024" — it now says "The customer", and drops the order number because the next line already prints it. The dashboard's `getCustomerName` stays: it derives a row label from a `platformId`, which is a different question, and now shares only the constant.)*
- [ ] **4.6** Rewrite the notification tests against fields. They currently assert exact English strings, which is why they pass while the output is wrong.
- [ ] **4.7 Gate**, plus a live phone round-trip: operator copy is verified by phone, not by evals.

**Done when:** `digest-briefing.ts` contains no regex over model-written prose.

**Decisions:**
- ~~What does a briefing line lead with when a ticket has several asks?~~ **Decided 2026-08-21: the deadline.** Implemented in `formatDeadlineLead` and wired into all five renderers.
- ~~Ordering the briefing list by deadline is decided but not shipped.~~ **Wired 2026-08-22.** `byDeadlineFirst` was built, exported, unit-tested, and called by nothing — a decision that read as done for a day. *(Found while re-deriving §4 — by reading, not by tooling. `knip` treats the unit test as an entry point, so the export read as used: the count was 139/151 with it dead and 139/151 with it wired.)* It now orders all three groups in `buildOrgDigest` (`digest.ts:434`, `:440`, `:446`), and the facts ride to the approval group on `WaitingItem.requestFacts` rather than being re-read.

  Two constraints the decision had not accounted for, both found in the code it had to touch:
  - **Within a group, not across.** `formatNeedsYouProse` renders by `KIND_ORDER`, so a cross-group order is one nobody reads. Sorting within each group also keeps `needsYou`'s raw order equal to its rendered order, which is what `pendingDigest.items` stores and what a typed digit resolves against.
  - **`loadWaitingOnYouItems` carried a "do not re-sort" comment**, on the grounds that the briefing numbered its list and the operator ledger numbered `pendingPlans` in the same order. Neither still held: the briefing is prose now, and `selectPendingPlan` resolves a digit against `pendingDigest.items` — the order the merchant read — before it ever looks at the queue. The comment was rewritten rather than obeyed; a stale invariant left in place is how the next change gets talked out of being correct.

  The flagged group is ordered *after* `DIGEST_QUESTIONABLE_LIMIT` cuts it, so the deadline decides which of the ten leads, never which ten there are.
- ~~Should an unverified storefront visitor and a verified one read differently, and how?~~ **Decided 2026-08-22, in code.** `classifyPerson` splits `visitor` from `verified` (`person-name.ts`), and the three renderers print the split: a visitor is "Someone on your storefront" as a sentence subject and "the visitor" after a preposition; a verified shopper is "The customer on #1024", scoped to the orders they proved and never to an account.
- [ ] Postal addresses currently reach the merchant's phone unredacted — `redactBriefingContacts` handles emails and links only. Redact, or keep? **Still open.**

---

### Phase 5 — Cost & housekeeping

- [x] **5.1** ~~Recapture the eval baseline so the cost gate turns on (prior item 7).~~ **Already done; the item was carried forward stale.** The baseline was regenerated in `e9345501` on 2026-08-17 — the day after the prior audit was written — at 3 repeats / 252 runs / 99.2%, and it carries the `usage` key. `index.test.ts:187` guards the cost line on `summary.usage && baseline.usage`, so `formatUsageDelta` has been running on every run since. **No spend owed.** One correction to the wording: it is reported, never gated ("a tuning change is allowed to cost more if it scores better, and that call is the merchant's, not CI's"), so 5.2 gets a cost *comparison*, not a cost gate.

- [x] **5.1a** ~~Put `classifierSignals` in the fixtures; 0 of 84 carry it.~~ **Struck — the claim was false.** 79 of the 84 declare `classifierIntents`, which `fixture-runtime.ts:78-89` turns into a v5 `classifierSignals` object on the context `planAgent` receives, so `planner-routing.ts:350` has been graded since `013e4f47`. The five without it are the three operator fixtures and `routing-order-create` / `routing-support-stats`, none of which run the inbound classifier in production either. **Phase 3 has no fixture prerequisite.** The one real gap — fixtures always write `emptyRequestFacts()` — buys nothing here, because only the gateway's renderers read `requestFacts` and the judge never sees them.
- [ ] **5.2** Intent-driven tool selection (prior item 8). **28 schemas ship on every iteration, not 30** — `TOOL_DEFINITIONS` holds 30, but `AGENT_TOOLS` filters to `availability === "active"` (`registry/index.ts:115-116`) and `AGENT_TOOLS` is what reaches the API. The "(28 when this was written)" parenthetical this item used to carry had it exactly backwards: 28 was right, and re-counting the wrong array turned it into 30. Serialized, those 28 are 21,818 characters ≈ **5,455 tokens** at 4 chars/token; the `~6,926` quoted before has no recorded method. Verified: nothing in `run.ts`, `planner.ts`, or `prompt.ts` reads `classifierSignals` for tool selection, and the classifier's `intents` are already on `ctx.classifierSignals` (`classifier-signals.ts:194`). **1–2 days. High risk** — a wrongly-narrowed set produces "I can't help with that" instead of an action, and it changes the cached prefix per intent bucket. Measure before committing. **Gate on the full suite.**
- [ ] **5.3** Decide the `AGENT_CONTEXT_BUDGET_MODE` rollout. It is `off` by default and `enforce` is paused in the runbook, so both paths ship and only one is ever exercised. **The urgency this item used to carry was false** — see §2.8: `off` does not feed unbounded history to the classifier, because `buildBoundedClassifierConversation` bounds the prompt either way. What `off` actually costs is a whole-thread row fetch in the classifier (`intelligence.ts:44-47`) and an uncapped *character* budget on the agent's 50-message window (`context.ts:344-346`). That makes this an efficiency-and-consistency call, not a reliability one — and it makes "delete the dual paths" the cheaper option rather than the riskier one. Size it before deciding: `context-budget.ts` is 195 lines and 23 files reference the mode. The `~280 LOC` this item quoted was never measured.
- [ ] **5.4** Deduplicate: ~~`customerFirstName`~~ (done in 4.5), `endSentence`, `lowerFirst`, `fallbackTitleFromSummary` (×2, drifted), `isDeterministicE2EAIEnabled` (×2, different `NODE_ENV` semantics). ~~Delete `tools/tool-inputs.ts` (23 LOC, unimported).~~ **Wrong — it is imported**, type-only, by `agent-context.ts:9` for five tool input types. Nothing to delete. **~2 h.**
- [ ] **5.5** ~~Remove the two prompt lines that duplicate code-enforced rules (`prompt.ts:195`, `:200`)~~ — **one of the two, not both.** Collapse the three restatements of the `get_order_tracking` rule (verified: 3 bullets).
  - `:200` ("if send_reply errors, do not change thread status") **is** code-enforced — `run-execution.ts:53` detects the failure and `:243` returns "skipped status update because send_reply failed." Safe to delete.
  - `:195` is **not**, and deleting it would remove a live guard on the order-mutation path. The schema requires `address1`/`city`/`province`/`zip`/`country` (`registry/order.ts:46-51`), so the *complete* half is enforced — but the line's second half, "do NOT call the tool with placeholders or guessed values", is enforced nowhere. JSON Schema `required` makes a key present; it cannot stop `city: "Unknown"`. Nothing in `static-policy.ts`, `executor.ts`, or `shopify/order-address.ts` checks values. **Keep the line until a validator exists** — and note the irony: this is a case where §3C's "put it in the schema" genuinely cannot, which is the test any prompt-line deletion should have to pass.

---

## 4b — Verification log

**2026-08-22.** Every checkable claim in this file was re-derived from the tree, after
the user pointed out that corrections kept landing on a document that was still wrong.
The previous pass had concluded that "every claim anchored to a `file:line` survived;
every claim asserted without one failed," and had written a *new* wrong item (5.1a) into
the middle of that conclusion. Both halves of the rule were false.

**What the second pass found.**

*Wrong in a way that changes a decision or buys work:*

| Claim | Reality |
|---|---|
| §2.8 / 5.3 — "the classifier prompt grows without limit" | Bounded on both branches by `buildBoundedClassifierConversation`. The unbounded-by-size path is the agent context, not the classifier. |
| 5.2 — "all 30 schemas ship on every iteration" | 28 ship; `AGENT_TOOLS` filters on `availability`. The prior text had 28 and a correction pass changed it to 30. |
| 5.1a — "0 of 84 fixtures carry `classifierSignals`" | 79 carry it as `classifierIntents`. Struck; Phase 3 never had a fixture prerequisite. |
| §2.5 — "`lowerFirst` — duplicated verbatim" | The two differ by a guard, and the difference is visible in merchant-facing output. Listed as the safe one; it is the drifted one. |

*Wrong and cheap:* the irregular-verb table is 29 entries (this file said 20, then 30 — it
was 29 both times); `tidyPunctuation` has six rules, not five; the truncation cascade has
four budgets, not three; the regex-operation count was 29 at the audit's commit, not 27;
the planner is 253 lines, not 247; §2.2's line numbers had drifted ~50 lines since Phase 1
deleted code above them; 4.4 cited `digest-briefing.ts:559-561` for a comment that has
never been at those lines.

*Held on re-derivation:* §2.1, §2.2's four call sites, §2.3's six passes, §2.4's LOC table
(exact at the audit's commit), §2.4's two near-duplicate reported-speech regexes, §2.6's
three citations, §2.7's character and bullet counts, 3.5's ~72 lines, 4.4's `ask: "none"`
chain end to end, all of 5.4, and every citation in 5.5.

**The rule that actually falls out**, replacing the one the last pass invented:

- A `file:line` proves someone read *that line*. §2.8's citation was exact, the code at it
  said what the finding claimed, and the conclusion was still false — because the four
  lines after it budget the rows the finding said were unbounded. Cite the line; verify the
  claim.
- A number defended as "measured, not estimated" has to carry its measurement, or it is an
  estimate wearing a badge. §2.7's 27 is not reproducible under any obvious definition.
- Re-counting is not verifying. Two of these errors were introduced *by* a correction pass,
  by counting a different wrong thing (`TOOL_DEFINITIONS` for `AGENT_TOOLS`, a line-based
  grep for a table with several entries per line).
- The expensive errors are the ones that size work: 5.2's premise, 5.3's urgency, 5.1a's
  prerequisite. All three would have bought effort, and one of them a paid eval run,
  against a fact nobody had checked.

**Second sweep, same day — Phases 0 through 4.** The first sweep corrected §1, §2 and
Phase 5 and stopped there, which left most of the plan carried on the old footing. Phases
0–3 and 4.1–4.3/4.6 were then re-derived too:

- *Phase 0* — substance holds on all four. 0.2's four citations are still exact; 0.1's
  `temperature` line is gone from `voice-synthesis.ts` and the surviving instance at
  `ai/index.ts:73` is on Haiku, as claimed; 0.3's `refreshTerminalSendAfterSkip` returns
  the two-case union; 0.4's guard is at `:317`, not `:319`.
- *Phase 1* — holds exactly. Nine `ProducedPlanSignalCode`s plus `legacy_warning`, and
  `warningBlocksQuickReply` / `isShopifyCustomerWarning` / `planWarningTiers` return zero
  hits repo-wide.
- *Phases 2 and 3* — open, no factual claims beyond 3.5, which held on the first sweep.
- *Phase 4* — 4.1, 4.2 and 4.6 hold (`CLASSIFIER_VERSION = 5`, `CLASSIFIER_OUTPUT_SCHEMA`
  wired at `email-classification.ts:410`; 118 exact-English assertions across the two
  notification test files, which is what 4.6 exists to fix). **4.3 did not.**

**`byDeadlineFirst` is built, tested, and never called.** It was recorded twice as shipped
— once in 4.3's note and once as a closed decision — and it has no production call site.
The line-level lead shipped; the list-level ordering did not. This is the tenth correction,
and the only one so far where the audit claimed *code* was doing something it does not do,
rather than miscounting something it does.

It also names the gap that let it through, and the first explanation of that gap — that
`knip` counts unused exports against a 139-of-151 warning baseline rather than failing on
them — was **wrong**. Wiring `byDeadlineFirst` into production on 2026-08-22 moved the
count by zero: 139/151 before, 139/151 after. It was never in the unused set. `knip`
treats a vitest file as an entry point, so an export imported only by its own unit test
reads as used, and a production-dead export with a test beside it is indistinguishable
from a live one. The toolchain was not configured not to say; it cannot say. Everything
else in this file was checkable by reading, and so, it turns out, was this.

Still unmeasured and marked as such: the LOC-delta column in the phase table.

---

## 5 — What this audit did not cover

The dashboard UI (58k LOC), the channel adapters (Gmail, Postmark, Meta, Photon, TikTok), billing and subscription code, the Shopify API wrappers beyond their policy surface, and the queue/worker infrastructure.

For the model-call layer — call-site census, token accounting per component, prompt-cache behaviour, and verbatim prompt appendices — read the 2026-08-16 audit at git `2cc9749c`.

One classifier probe was run, not a statistical sample. The classifier is non-deterministic and two runs of the identical ticket produced materially different summaries, so no claim here rests on a single generation.
