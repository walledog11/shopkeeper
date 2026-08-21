# Shopkeeper — pipeline audit, 2026-08-21

**Scope:** the control flow and the merchant-facing output layer. What decides whether the agent acts on its own, who owns that decision, and what happens to the model's output between the model and the merchant's phone.

**Relationship to `AGENT_AUDIT.md` (2026-08-16):** that audit covered the model-call layer — call sites, token cost, determinism, bloat in `packages/agent`. It is good work and I am not repeating it. This one covers what it did not: the decision architecture, and the ~4,900 LOC that turn a plan into English. Where I disagree with it I say so.

**Method:** static read of the working tree at `fix/briefing-request-summary-and-verified-subject`, plus one live classifier probe against a real multi-intent ticket. Every claim below carries a `file:line`.

---

## Verdict

`packages/agent` is not bloated. The prior audit is right about that and I confirmed it independently: one agent loop of 117 lines, a tool registry that is a plain array, zero unused files per `knip`.

The problems are not in the agent. They are in the two layers on either side of it:

1. **Nothing owns the autonomy decision.** It is spread across four call sites in two packages, evaluated in two different orders, and its final gate is a substring match on English prose.
2. **The output layer is bigger than the agent that feeds it.** ~2,787 source LOC and ~2,069 test LOC of hand-written English generation, against a 117-line agent loop.

Both are the same failure in different clothes: the system does not trust the model's output, so it has grown a repair layer; and the repair layer has no schema, so it repairs prose with prose.

I would rebuild both. Details in "What I'd build instead."

---

## Prior work order — status after five days

| # | Item | Status |
|---|---|---|
| 1 | `temperature: 0` on Sonnet 5 kills voice synthesis | **Open** — `voice-synthesis.ts:123` unchanged |
| 2 | Shopify blip → confident wrong auto-sent reply | **Open** |
| 3 | Skipped-step re-draft executes without telling the customer | **Open** |
| 4 | No timeout/retry on the model client | **Done** — explicit policy now at `ai/anthropic.ts` |
| 5 | Classifier JSON parsed by hand, not schema-enforced | **Open** — no `output_config` in `email-classification.ts` |
| 6 | Money-path escalation gated by an English regex | **Open** — `planner-routing.ts:88-90` |
| 7 | Recapture eval baseline so the cost gate runs | **Open** |
| 8 | 51% of planner prompt is unusable tool schemas | **Open** |
| 9 | Two routing implementations, one a stale shadow | **Open** — `planner.ts:226` still calls `logRoutingShadow` |
| 10 | Housekeeping (dupes, `tool-inputs.ts`) | **Open** — `tool-inputs.ts` present, `fallbackTitleFromSummary` still ×2 |

One of ten. Items 2, 3 and 6 are merchant-visible correctness bugs on the money path.

---

## Findings

### 1 — Autonomy is gated on English prose

`plan-preview.ts:163-178`

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

It has already gone wrong once — the "No relevant KB articles" carve-out at line 172 exists because a benign warning was blocking auto-execute in production. That fix is itself a hardcoded string.

It is already drifting. The producer writes `"Couldn't find a Shopify customer - verify the correct account is linked before approving."` (`planner-read-tools.ts:68`, and again at `:160` — copy-pasted). A dashboard test asserts `"Couldn't find a Shopify customer linked to this thread."` (`resolve-ticket-coco-action.unit.test.ts:113`). Different sentences. They match only because both happen to contain the prefix being searched for.

And the warning text is known to be wrong: the 2026-08-20 run recorded `No matching product found - the order edit step may need a corrected product name` firing twice against a plan containing no order edit. That text is load-bearing for an autonomy decision.

**This is the most dangerous line of code in the pipeline.** The prior audit quotes this function and recommends *routing a new failure through it* (work order item 2). I disagree. It should not be extended; it should be deleted and replaced with a typed signal.

### 2 — The autonomy decision has no owner

The same question — "may this run without a human?" — is answered in four places:

| Where | When | What it decides |
|---|---|---|
| `routePlan` (`planner-routing.ts:339`) | plan time, inside `planAgent` | `proceed` / `escalate` + a merchant question |
| `classifyHomePlan` (`plan-preview.ts:248`) | consume time | `quick_reply` / `auto_execute` / `needs_review` / `needs_merchant_input` |
| `checkStaticToolPolicy` (`plan-preview.ts:305`) | consume time | re-derives whether each mutative call is permitted |
| `checkParsedStaticToolPolicy` (`executor.ts:92`) | execute time | derives it again, authoritatively |

They are chained through a mutable field: `routePlan` writes `plan.routing`, and `classifyHomePlan` reads `plan.routing?.question` (`plan-preview.ts:273`) to decide `needs_merchant_input`. Static policy is evaluated twice against the same tool calls, once to classify and once to enforce, and the two calls take different entry points into the same module.

Nothing guarantees the four agree. There is no single function you can read to learn what the agent is allowed to do.

### 3 — Six sequential repair passes over the model's output

`planner.ts:135-192`, in order:

1. `stripCreateRefundForAlreadyRefundedOrders`
2. `stripEmptySendReplyToolCalls`
3. `stripInternalNotesWithoutActions`
4. `applyEscalationRouting` (rewrites the tool-call list)
5. `groundEscalationReasons` (rewrites `escalate_to_human.reason`)
6. `groundReplyText` (deletes sentences from `send_reply.text`)

Each was added after a specific bad output. Passes 5 and 6 are the tell: `stripUngroundedSentences` (`planner-routing.ts:560`) removes individual sentences from the reply the customer will read, because the model asserts actions it did not plan.

The system's response to "the model said something untrue" is to edit the sentence rather than reject the plan. A plan carrying a fabricated claim is not a plan with a bad sentence in it — it is evidence that the model misunderstood the situation, and shipping the remainder after excision is a worse failure mode than stopping.

This is the same pattern CLAUDE.md already names for prompts — *"a prompt growing situation-by-situation means a capability is missing"* — appearing on the code side, where nobody is watching for it.

### 4 — The output layer is bigger than the agent

| File | Source | Tests |
|---|---:|---:|
| `digest-briefing.ts` | 1,068 | 655 |
| `digest.ts` | 758 | 675 |
| `planning-notifications.ts` | 682 | 739 |
| `operator-ledger.ts` | 122 | — |
| `digest-shopify-garnish.ts` | 117 | — |
| **Total** | **2,747** | **2,069** |

Against that: the agent loop is 117 lines, the planner 285, the tool registry 175.

`digest-briefing.ts` is the largest file in the entire pipeline. It contains a hand-rolled natural-language engine: two near-duplicate reported-speech regexes (one capturing, one not), a 20-entry irregular-verb backshift table, a five-rule punctuation repairer that exists only to clean up damage done by the other transforms in the same file, and a truncation cascade with three different budgets. 27 regex/`replace`/`match` operations in one file.

It does not work reliably, and the file knows it — its own comments record that per-phrase fixes were tried and deleted because *"each was fitted to one morning's summaries and left the next morning's raw."* The bug that started this audit was `requests → asked` dropping a preposition, producing "asked a refund" on a merchant's phone.

**An LLM product is post-processing the LLM's output with a bespoke NLP layer larger than the agent itself.** That is backwards.

### 5 — Five copies of one naming rule, three diverged helpers

The question "what do we call this person" is answered independently in:

- `email-classification.ts:100` and `:115` — instructs the model
- `planning-notifications.ts:167` (`anonymousNoun`) and `:267` (`namelessNoun`) — two different fallbacks in one file
- `digest-briefing.ts` (`VISITOR_SUBJECT`), plus a fifth open-coded copy inside `formatApprovalItemLine`
- `customer-name.ts:1` in the dashboard

Four different strings for one person. Only two consulted verification state, which is why a shopper who had proved they owned order #1024 was reported to the merchant as an unidentified visitor while the operator card for the same thread said the opposite. (Collapsed to one helper on the current branch.)

Three text helpers are duplicated and have drifted:

- `customerFirstName` — `digest-briefing.ts:92` trims and splits on any whitespace; `planning-notifications.ts:154` splits on a single space with no trim. A leading space yields `""` on the operator card.
- `endSentence` — `planning-notifications.ts:160` trims first; `digest.ts:237` does not, producing `"text ."`.
- `lowerFirst` — duplicated verbatim.

Plus the prior audit's `fallbackTitleFromSummary` (×2, drifted) and `isDeterministicE2EAIEnabled` (×2, different `NODE_ENV` semantics), both still open.

### 6 — Four overlapping description fields, no rule about which to use

`Thread` carries `aiSummary` (whole episode), `requestSummary` (current ask), `aiTitle` (3–6 word topic), and the classifier also emits `requestDisposition`. The choice between them is re-derived at every call site rather than owned anywhere — `generate-thread-plan.ts:82` explains the rule in a comment, `delivery-exception-plan.ts:215` and `return-arrival-plan.ts:107` each restate it, and the digest simply never selected the column, which is the bug that produced the incoherent briefing.

### 7 — The prompt is 27 prohibitions

`SUPPORT_INSTRUCTIONS` is 10,924 characters, 38 bullets, **27 of which contain a prohibition** — measured, not estimated. It ships on every iteration of every ticket. Three bullets restate the same `get_order_tracking` rule.

A prompt that is 71% "don't" is a specification written as a plea. Most of those bullets are describing invariants that a schema or the executor could enforce structurally.

### 8 — Context is unbounded in production

`resolveContextBudgetMode` returns `"off"` when `AGENT_CONTEXT_BUDGET_MODE` is unset (`context-budget.ts:44`). The bounded paths exist, are tested, and are switched off; the runbook explicitly pauses the `enforce` rollout. In the `off` branch the classifier loads the entire thread with no `take` (`intelligence.ts:44-47`).

A long-running thread grows the classifier prompt without limit until it fails. The mitigation is written and disabled.

---

## What I'd build instead

Four changes. They are independent, and each one deletes more than it adds.

### A. A typed plan verdict, replacing warning strings

Warnings become structured signals:

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

This is the big one, and it is what has been costing you a month.

Today: the classifier writes an English sentence, and 2,747 lines of code try to rewrite that sentence into a different English sentence — changing tense, swapping subjects, repairing punctuation the rewriting broke, and truncating the result to fit a phone.

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

It also fixes the product problem the probe exposed: with `deadline` as a field, the briefing can lead with *"Needs an answer by Friday"* instead of burying it 180 characters into a sentence. Right now the briefing cannot know which part of the sentence matters, because it only has a sentence.

**Estimated size:** A is ~1 day. B is ~3 days with the eval gate. C is ~2 days. D is the real project — call it 1–2 weeks including a classifier schema change and re-doing the notification tests — and it removes on the order of 1,500–2,000 lines.

### Sequence

Do A first: it is small, it removes the worst safety property, and B depends on it. Then C, because validation-not-repair changes what signals exist and B should consume the final set. Then B. Then D, which is independent of all three and is the one that needs your product judgment about what a briefing should say.

Before any of it, close prior items 2, 3 and 6 — those are live money-path bugs and none of this work fixes them.

---

## What I did not audit

The dashboard UI (58k LOC), the channel adapters (Gmail, Postmark, Meta, Photon, TikTok), billing and subscription code, the Shopify API wrappers beyond their policy surface, and the queue/worker infrastructure. Also: I ran one classifier probe, not a statistical sample — the classifier is non-deterministic and two runs of the identical ticket produced materially different summaries, so no claim here rests on a single generation.
