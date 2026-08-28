# Shopkeeper — Agent Pipeline Audit and Remediation Record (Historical)

**Status:** historical record; not an execution plan. No open work.

**Covers:** the 2026-08-21 pipeline audit (re-verified 2026-08-22) and the seven-milestone
remediation programme it produced, which closed on 2026-08-27.

**Supersedes `docs/agent-remediation-plan.md`.** That file was the canonical execution plan from
2026-08-21 until its last to-do closed on 2026-08-27; it was then deleted and its record merged
here. Read it in full at `git show 5303309d:docs/agent-remediation-plan.md`.

**The operative rules live in `.claude/CLAUDE.md`, not here.** The non-negotiable invariants, the
completion gate, and the pre-user engineering rules are design law that applies to new work, and
`CLAUDE.md` is the file loaded into context every session. This document records *why* each rule
exists and what it cost to learn; `CLAUDE.md` states the rule itself. If the two ever disagree,
`CLAUDE.md` is what to follow and this file is what to correct.

---

## 1. The original audit

The audit originally combined findings, implementation work, status updates, and future capability
planning. That made it compete with the execution plan, allowed the two documents to carry
contradictory completion claims, and obscured the user-visible guarantees behind a long
implementation history.

### Findings that remain valid

- Autonomy policy must never depend on matching English warning text.
- One function must own the planning/preview autonomy verdict.
- Invalid model plans must be rejected, not repaired sentence by sentence and partially shipped.
- Merchant notifications should render from structured, source-aligned data instead of rewriting
  model prose.
- Naming, sentence helpers, and policy descriptions need one owner to prevent surface drift.
- File references and passing component tests do not prove an end-to-end product claim.

### Foundations delivered from the audit

- Typed plan signals.
- One `decideAutonomy` owner with execution-time current-state enforcement.
- Plan validation without sequential output repair passes.
- Schema-enforced classifier v5 `RequestFacts`.
- Structured request displays across operator surfaces.
- Shared person naming and text helpers.
- Intent-driven tool selection with a bounded widening fallback.
- Tools declare the Shopify scopes they need; a short grant withholds the tool with an explanation
  rather than failing at the provider.

### The superseded conclusion, and why it was wrong

The audit marked structured rendering complete after deleting prose-repair machinery, migrating
fixtures to v5, passing model evals, and delivering a new structured operator card to a phone.

That conclusion was wrong. It assumed open pre-v5 production state was only test data and treated
legacy plan-cache pruning as sufficient compatibility coverage. On 2026-08-23 a scheduled
production briefing rendered a real v4 escalation as *"Request details unavailable — open the
thread for the original message. I flagged it for you."* and then asked *"What do you want to
do?"* The thread still had a request-source message and conversation history. The failure was in
persisted-schema rollout and end-to-end notification coverage, not missing source data.

That reopening became Milestone 1 below, and is closed.

---

## 2. The remediation programme

All seven milestones are complete. Each was closed against the completion gate now recorded in
`CLAUDE.md`, under the relaxed pre-user standard described there.

| # | Milestone | Outcome | Evidence |
|---|---|---|---|
| 1 | Actionable merchant briefings | Every briefing item that asks for a decision carries grounded context, or asks the merchant to open the thread instead of deciding | [agent-m1-briefing-evidence-2026-08-23.md](docs/agent-m1-briefing-evidence-2026-08-23.md) |
| 2 | Classification lifecycle and compatibility | One versioned request contract across every inbound channel; classifier versions 2–5 all still render | [agent-m2-evidence-2026-08-25.md](docs/agent-m2-evidence-2026-08-25.md) |
| 3 | Immutable outcome attribution | One row per plan attempt keyed on `source_message_id`; resolution measurable without replaying thread history | [agent-m3-evidence-2026-08-25.md](docs/agent-m3-evidence-2026-08-25.md) |
| 4 | Bounded replanning after definite failure | One child plan after a definite failure; unknown outcomes escalate and never replan | [agent-m4-evidence-2026-08-25.md](docs/agent-m4-evidence-2026-08-25.md) |
| 5 | Merchant preference memory | Explicit merchant judgment applied as guidance only, never overriding caps or policy | [agent-m5-evidence-2026-08-25.md](docs/agent-m5-evidence-2026-08-25.md) |
| 6 | Attachment vision | Damage photos reach the model on email, TikTok and Instagram; image text is untrusted | [agent-m6-evidence-2026-08-26.md](docs/agent-m6-evidence-2026-08-26.md) |
| 7 | Shop-management capabilities | Operator-only promotions and repricing with bounded, previewable, reversible blast radius | This file, §5–6; PR #71, merge `4d69d40c` |

Two corrections are worth carrying forward because they were found after the milestone was first
marked complete:

- **Milestone 4** closed on coverage that only exercised `executionIntent: "automatic"`. On both
  merchant-approval routes the replan threw instead of recovering, because the recursive child call
  re-passed the parent's `approvedToolCalls`, which the child plan shares none of. The approver got
  an exception after a half-executed plan. Fixed 2026-08-26: the child no longer inherits the
  parent's approval envelope, and a child that cannot clear autonomy on its own is cached for
  approval rather than executed or thrown.
- **Milestone 5** shipped `loadActiveMerchantPreferences` to production ahead of its migration.
  The `P2021` threw out of an uncaught `Promise.all` in `buildContext` and production generated no
  plans at all until the migration landed a day later. Fixed in `f47b5f85`.

---

## 3. Removed capabilities

Deleted from the product on 2026-08-26, **not deferred**. Restoring any of them is new work with a
new gate, not the resumption of a parked item. This section exists so the next reader does not
find `ShipmentWatch` in the git history and rebuild a capability that was removed for external
reasons which still hold.

- **Carrier shipment tracking, both tiers.** USPS access is closed by Package Tracking Access
  Controls; UPS/FedEx/DHL full-tier access needed a paid aggregator that was not worth its cost and
  compliance overhead here. Removed: `shipment-tracking.ts`, `shipment-alerts.ts`,
  `listRecentShippedOrderShipments`, `extractShipmentsFromOrders`, and the
  `FullTierCarrierTrackingProvider` seam.
- **Proactive delivery-exception monitoring.** The gateway `delivery-exception-monitor` and
  `delivery-exception-plan`, the hourly job, `DELIVERY_EXCEPTION_MONITOR_ENABLED`, and the
  `ShipmentWatch` table plus its two enums (dropped in `20260826120000_drop_shipment_watches`).
  Stall and exception detection no longer exist on any tier.
- **Historical `request_episode_outcomes` backfill.** There is no pre-deploy traffic worth
  recovering; outcome reporting covers post-deploy requests only.

What survives: the agent still answers "where is my order" from Shopify order and fulfillment data
through `get_order_tracking`. It makes no carrier call, and its tool description states that it
cannot retrieve scan history, delivery events, or delivery exceptions.

### Standing constraints (not work items)

- Customer and operator execution policies remain separate.
- Storefront guest and verified-order projections remain separate.
- Proactive visitor conversion is out of scope.

---

## 4. What a paid eval run actually costs

Measured, so the trade-off can be made without re-deriving it. Cost per fixture-run is **~$0.011**,
stable across the 2026-08-17 baseline ($2.77 / 252 runs) and the 2026-08-27 capture ($2.64 / 252).
Short runs cost more per run because they amortise less prompt cache.

| Run | Fixture-runs | Cost |
|---|---:|---:|
| One fixture, 1 repeat (canary) | 1 | ~$0.05 |
| Targeted, 3 fixtures × 3 repeats | 9 | $0.07–0.21 |
| `release` gate, 48 fixtures × 1 | 48 | ~$0.51 |
| Full `baseline`, 84 × 3, judges on | 252 | ~$2.80 |

The shape to keep in mind: **diagnosis is nearly free and captures are not.** A session that runs a
dozen targeted probes spends less than one capture. The operating model for paid runs lives in
[docs/agent-eval-gates.md](docs/agent-eval-gates.md); the rules for when one is owed are in
`CLAUDE.md`.

### Why `baseline.json` is still the 2026-08-17 capture

Deliberately deferred, not unfinished — the harness bugs that blocked it are fixed and a capture
would now succeed. It is deferred because **nothing consumes what it would produce.** It has two
readers: `drift` mode, which nobody runs, and `eval-budget-preflight.mjs`, which derives
cost-per-run from recorded usage and is served fine by the stale file ($0.011 measured in the old
capture, $0.0105 in the new attempt).

Against that, a capture costs ~$2.80 and forty minutes; two attempts on 2026-08-27 spent **$4.66
and committed nothing.** Recapture when there is a reader: before a `drift` run, before first
customer as launch certification, or when a change lands that plausibly moves many fixtures at once
and "variance or regression?" needs a better answer than a guess.

---

## 5. Incidents worth not repeating

Each of these cost real money or real production time. The rule each one produced is in
`CLAUDE.md`; the story is here.

### A tool shipped into the registry that the prompt forbade

`create_partial_refund` reached the shared registry in `0780cb34` while `SUPPORT_INSTRUCTIONS`
still listed "partial or item-only refunds" among the things that must call `escalate_to_human`.
The compensation decision tree had three branches — exact full refund, fixed-value gift card,
escalate-everything-else — and the new tool landed in the third. The model was handed a tool
description saying *use me for item-only refunds* and a system prompt saying *item-only refunds
must escalate*, and split: `refund-partial` came back 2/3 in the 2026-08-27 baseline run, the
failing repeat quoting the tree back.

**A targeted run of that same fixture had passed 3/3 an hour earlier.** Three samples of a
coin-flip is not evidence. Fixed in `dbe3c089` by giving the tree a third allowed branch whose
preconditions are the ones `createPartialRefund` actually enforces.

*Standing consequence:* a new financial tool needs a prompt branch, not just a registry entry. The
decision tree enumerates what is allowed and escalates the rest, so a tool absent from it is
unreachable-to-unreliable no matter what its description says.

### A fixture that agreed with the prompt and disagreed with the tool

The same contradiction had a second face. `refund-partial` — core, hard-gated — asserted
`mustEscalate` on the grounds that "partial refunds are merchant-only", and its scenario is
verbatim the case the new tool's description claims. The plan first recorded this as "the fixture
was asserting against the product"; that was half wrong, and the correction is the useful part.
The fixture agreed with the prompt and disagreed with the tool — the product contradicted itself,
and the fixture faithfully encoded one side of it. Reconciled in `36896c72`.

*Standing consequence:* a tool added to the shared registry is added to every support fixture's
option set. Grep the fixtures whose scenario the new tool's own description claims, before the gate
runs — a stale assertion spends the budget proving something reading would have shown for free.

### A capture that could not record what it existed to measure

Run 33120836618 ran all 84 fixtures three times, spent **$2.71 and committed nothing.** Neither
cause was a model regression; both were harness bugs that only bite in `baseline`/`drift` mode.

- **The capture was circular.** `index.test.ts` asserted `passes === repeats` for every
  non-`advisory` fixture *including during a capture* — so a three-repeat baseline, whose purpose
  is recording flap rates, could only be written in a run where nothing flapped. The comment
  directly above that line already said flappy fixtures clear the bar; the code had drifted from
  its own comment. Fixed in `22d22aa6`.
- **The gateway got a hardcoded call budget.** `eval-budget-preflight.mjs` set
  `gatewayMaxCalls = mode === 'release' ? 6 : 24`, ignoring both the caller's ceiling and
  `repeats`. Five order-ops fixtures needed ~30 calls at three repeats, got 24, and died on a run
  that had authorised 700. Fixed in `93be611e`.

The second attempt (33129019610) then spent **$1.95 and also committed nothing**, because the
Anthropic account ran out of credit partway through and nineteen fixtures reported 0/3 with
`calls=0`. Its tell is worth recognising: fixtures failing in alphabetical order with `calls=0`,
because a model regression does not respect sort order but an account running dry mid-run does.
That surfaced a hole the relaxed capture bar had opened — a capture writes after every fixture and
would have recorded an outage as a pass-rate. Closed in `19b3ee70`: `infrastructure` and `budget`
results are refused before the write, in every mode.

### Neither flapper was variance

Two fixtures flapped at 2/3 in that capture. The plan initially recorded that their rate "could
only be settled by a recapture" — about to spend ~$2.80 recording two rates. Both were diagnosed
from the logs of runs already paid for, **with no new model call**, and both turned out to be
deterministic bugs firing on a phrasing coin-flip. Recording a "rate" for either would have been
recording a bug as a statistic.

- **`tier-guarded-store-credit-approval` — a prose matcher invalidating a correct plan.**
  `plan-grounding.ts` scrubbed three negation phrasings before scanning for grounding claims, and
  the model wrote a fourth: *"I've issued a $15 store credit (gift card) … **instead of a refund**,
  as requested."* The bare word "refund" demanded `create_refund`, found only `create_gift_card`,
  and raised `ungrounded_customer_reply` — making the plan **invalid**, so it could not execute and
  the customer got no reply. In a fixture themed *store credit over refund*, "instead of a refund"
  is the most natural sentence the model can write, which is why it flapped rather than failed
  outright.
- **`adjacent-cancel-vs-refund` — an unanswered question about what the cap governs.** The prompt
  capped "compensation" and enumerated two forms, neither of which is a cancellation, while
  separately telling the model to call `cancel_order` because Shopify refunds the payment itself.
  Whether that Shopify-side refund counted against the cap was never stated, so the model picked
  one reading per run.

### A validator rewrite that loosened a safety check while reading as a pure fix

The first fix for the grounding matcher (`f69ab6e0`) replaced the three deleted-phrase rules with a
claim-span bound — the right move — but collected only the first match per pattern. Any second
claim joined by punctuation rather than `and` became invisible, so
`"I've refunded your order, I've cancelled the shipment"` with only `create_refund` in the plan
went from correctly refused to silently accepted. That is the inverse of the bug being fixed: one
invalidated a correct plan, the other passes an incorrect one. Its own new tests agreed with it.
Caught for free by diffing old against new verdicts on the same inputs, before the paid run was
booked, and fixed in `c8d33d37`.

*Standing consequence:* a validator rewrite that narrows what it inspects can loosen a safety check
while looking like a pure fix. Compare old and new verdicts on the same inputs; it costs nothing.

---

## 6. The to-do ledger, closed 2026-08-27

| # | To-do | Resolution |
|---|---|---|
| 1 | Eval gate for the two new shared-registry tools | Done on `36896c72`, merged in `4d69d40c`. 9/9 hard-gated at three repeats, $0.21 |
| 2 | Regenerate `baseline.json` at three repeats | **Deferred by decision** — see §4. Not blocked; nothing reads what it would produce |
| 3 | Gate `master` | Done. `evals.yml` gained `push: branches: [master]` with the same paths filter, so a direct push runs the free preflight. All paid jobs stay guarded on `workflow_dispatch` and are unreachable from a push. `master` is left unprotected on purpose — the check reports, it does not block |
| 4 | Fix the grounding prose matcher | Done on `c8d33d37` (PR #72). Targeted eval 3 × 3, 9/9 hard-gated, $0.1133 — `tier-guarded-store-credit-approval` 3/3 against the 2/3 it flapped at |
| 5 | Does the compensation cap govern `cancel_order`? | **Answered: it does not.** `cancel_order` carries neither `refundAmountLimits` nor `dailyRefundSpendLimit`, so the cap was never consulted and the model's escalation cited a limit that would not have fired. Ratified rather than changed — a cap on compensation caps giving money away, while cancelling an unfulfilled order undoes a sale and leaves the merchant whole; `blockCancellations` is the control for cancellations. One sentence added to the cap clause in both variants (`6f19dee8`, PR #73), verified 9/9 hard-gated at $0.0665 with the two over-cap fixtures proving the cap still bites |

---

## Historical sources

- Superseded execution plan, in full: `git show 5303309d:docs/agent-remediation-plan.md`
- Full pre-consolidation audit: `git show 32dcc391:AGENT_AUDIT.md`
- Earlier model-call audit: `git show 2cc9749c:AGENT_AUDIT.md`
- Measurement report: [docs/agent-phase-a-measurement-2026-08-22.md](docs/agent-phase-a-measurement-2026-08-22.md)
- Eval operating model: [docs/agent-eval-gates.md](docs/agent-eval-gates.md)
- Milestone evidence reports: `docs/agent-m1-briefing-evidence-2026-08-23.md` through
  `docs/agent-m6-evidence-2026-08-26.md`

These sources are evidence, not current status. If they conflict with `CLAUDE.md` or the working
tree, re-derive the claim from the code and correct this file.
