# Shopkeeper — Capability Expansion Plan (v2)

**Status:** spec for execution
**Last reconciled against the tree:** 2026-08-22
**Position:** downstream of the internal audit of 2026-08-21 ("Agent Pipeline Audit"). That document owns Phases 0–5. This one owns Phases A and 6–10.
**Intended consumer:** Claude Code, one phase per session
**Supersedes:** v1 of this document, which was written from a third-party architecture summary before the internal audit existed. Several v1 tasks were wrong and are formally retracted in §1.

---

## 0. How to use this document

There are now **two** plans in play. They are not alternatives.

| Document | Owns | Nature |
|---|---|---|
| **Agent Pipeline Audit** (2026-08-21) | Phases 0–5 | Remediation. Direct read of the working tree, `file:line` on every claim. |
| **This document** | Phase A, Phases 6–10 | Capability expansion. Written from a third-party summary; less reliable. |

**Precedence: where the two disagree, the internal audit wins.** It was produced by static analysis of the actual tree. This one was produced from a summary written by an agent whose claims could not be verified. Treat the internal audit as evidence and this document as intent.

### Rules for the executing agent

1. **Finish the internal audit's Phases 1–5 before starting Phase 6.** Do not interleave. The one exception is Phase A below, which is read-only and runs in parallel today.
2. **Verify before you build.** Locate code by symbol name, never by line number — line numbers in *this* document's source material are unverified and some were already proven stale. If the code contradicts this plan, **stop and report**. Do not silently adapt.
3. **Everything goes through a pull request.** `evals.yml` triggers on `pull_request`. A change pushed straight to `master` is never gated. Any task here that says "eval must pass" is a no-op if the work does not land as a PR.
4. **One phase per session.** Use `git worktree` for any parallel session. Never two sessions against one working tree.
5. **The classifier is non-deterministic.** The internal audit recorded two runs of an identical ticket producing materially different summaries. Any behavior routed off classifier output needs a working fallback path, and any before/after comparison needs more than one run.

### Architectural charter

> One reasoning core, one memory, one tool registry. Execution policy varies by *who is talking*, and only by that. Customer-facing input is attacker-controlled and stays behind capture-mode planning with deterministic adjudication. Merchant-facing input is authenticated and may run an iterative live-execution loop.

The internal audit's Phase 3 — collapsing four autonomy call sites into one `decideAutonomy` function — is what makes the first half of that charter real. Right now the final gate on whether the agent may act without a human is `lower.includes("no relevant kb articles found")`. **No capability in Phases 8–10 may be built on top of that.** That is the load-bearing reason for the sequencing in this document.

---

## 1. Conflict resolution against the internal audit

Recorded explicitly so no session has to guess.

### Retracted — do not build

| v1 task | Why |
|---|---|
| **v1 1.2 — trim "redundant" fields from the classifier contract** | Wrong. The internal audit's Phase 4 is deliberately *adding* structured fields (`RequestFacts`) so the 2,747-line prose-rewriting output layer can be deleted. Trimming classifier output to save tokens would strand the largest deletion in the plan. The classifier's job is to emit structure, not prose. |
| **v1 Phase 2 — classifier-selected tool namespaces** | Duplicate of internal audit **5.2**, which is better specified: it already knows `intents` sits on `ctx.classifierSignals`, and it correctly flags that per-intent tool sets change the cached prefix per bucket. Build 5.2. One idea survives — see §1.1. |

### Merged

**§1.1 — carry into internal audit task 5.2.** 5.2 is marked *high risk* because a wrongly-narrowed tool set produces "I can't help with that" instead of an action. Add a namespace-miss fallback:

- If the plan comes back empty, or the model signals it lacks a needed capability, permit **one** replan against the widened tool set.
- Log it as `namespace_miss` with the classifier's original intent bucket.
- Expose `namespace_miss` rate as a metric.

That rate is the tuning signal for the intent→tools map, and given classifier non-determinism it is also the thing that tells you whether 5.2 is safe to leave on. Also: escalate, ask-merchant, and `send_reply` must be present in **every** customer-facing bucket. The agent must never be unable to escalate or reply.

### Deferred

| v1 task | Until |
|---|---|
| **v1 1.3 — unify the two classification paths; rename `email-classification.ts`** | After internal audit 4.4 closes. `CLASSIFIER_VERSION` is at 5; the pre-v5 question is now settled (age out, 2026-08-22) but 4.4 itself is still open. Do not rename or reorder it mid-migration. Re-open as Phase 11 — noting that the *third* email classification path, the existing-customer bypass, was removed on 2026-08-22, so Phase 11 now unifies two orderings rather than three. |

### Superseded by prior work — check before re-running

v1 tasks 0.1–0.3 (Haiku speculative-planning discard rate, capture-mode read re-execution, per-model prompt-cache hit rates) may already be answered. The 2026-08-16 model-call audit at git `2cc9749c` covered the call-site census, token accounting, and prompt-cache behavior. **Read it first.** Only measure what it does not already answer.

Note also that the internal audit's numbers supersede the third-party summary's throughout: agent loop 117 LOC, planner 285, registry 175, 28 tool schemas shipped on every iteration. **The `~6,926 tokens` this line used to carry has no recorded method and is retired** — the audit re-derived it on 2026-08-22 as 21,818 serialized characters ≈ **5,455 tokens**. Do not quote the old figure; it sized Phase 6's argument.

---

## Phase A — Measurement (run in parallel, today)

Read-only. Touches nothing the remediation work touches. Can run in a separate worktree while Claude Code continues on internal audit phases.

**Why now:** internal audit Phases 1–5 total roughly 20 engineering days — closer to a month of calendar for one person, entirely internal. That month is correct regardless, because 2.1 is a trust-binary risk. But what happens on day 21 should be decided by data you gather now, not by the ordering in this document.

### A.1 — Resolution rate by ticket type

Using the classifier's existing support tag and disposition, over the last 30 days:

| ticket type | volume | resolved with zero merchant touch | escalated | needed approval | needed merchant input |
|---|---|---|---|---|---|

**Also report:** what fraction of organizations have `autoExecuteMode` live. Default is off. If most merchants never turn it on, the mutation and routing apparatus only ever produces approve/reject cards, and "autonomous" is not currently true in production — which changes what Phases 9 and 10 are actually worth.

**Decision rule:** if WISMO-class tickets are high-volume and low-autonomous-resolution, **promote Phase 9 (lost package) ahead of Phase 8 (preference memory)**, and implement 9.3's remedy policy from static org settings, backfilling preference-driven policy when Phase 8 lands.

### A.2 — Verify partial refund exists

The third-party summary lists "full refund" among the mutation tools. If there is no partial-refund path, that is a capability gap sitting underneath all of this remediation — most real compensation is partial.

**Verify.** If missing, implement as a first-class tool with its own cap, respecting the existing daily compensation limit, and escalating above cap through the structural `templated-reason` mechanism rather than prompt-only. Do not schedule this inside a remediation session; it is its own PR.

### A.3 — Read `2cc9749c`

Answer §1's "superseded" questions from the prior audit rather than re-measuring. Record which remain genuinely open.

**Acceptance for Phase A:** one committed report under `docs/`. No production code changed.

---

## Internal audit Phases 0–5 — not restated here

Execute as written in the Agent Pipeline Audit. Two notes only:

**4.4 is no longer blocked on a decision — it is blocked on time.** Both of its judgment calls were settled on 2026-08-22 and the code landed:

- *Pre-v5 threads:* let them age out. Do **not** render them from `aiTitle`. A version-4 row has no `order` field and an `aiSummary` that states the whole request, so a title line is strictly less than the prose it would replace; `digest-briefing.test.ts` guards this and caught the first attempt. Prod has no merchants, so the population is test threads.
- *`ask: "none"`:* rendered from fields. `no_request: true` prints a stalled-conversation line; a classifier miss prints person · order · `aiTitle`. The larger half of this was never a decision at all — the existing-customer email bypass was writing `emptyRequestFacts()` for every repeat customer and `skipSummary` meant nothing filled them in later. That was a bug and it is fixed.

The ~1,500-line deletion is downstream of nothing but those threads aging out. **Of the two renderer decisions this note paired with it, one is closed** (verified vs. unverified visitor wording — `classifyPerson` splits them) and one is still open: unredacted postal addresses in `redactBriefingContacts`.

**Read the audit's 4.6 before scheduling any Phase 4 session.** It was re-scoped on 2026-08-22 and now records that `planning-notifications.ts` — the operator card — was never converted to structured rendering at all. That has a direct consequence for Phase 8 below.

**Scheduling recommendation: move Phase 6 of this document to just before 5.2.** See Phase 6.

---

## Phase 6 — Tool registry consolidation

**Depends on:** internal audit Phases 1–3 complete.
**Recommended slot:** immediately **before** internal audit 5.2, not after.

**Why that slot:** 5.2 buckets 28 tool schemas (~5,455 tokens/iteration — re-derived 2026-08-22) by intent. Several of those schemas are near-duplicates of each other. Bucketing a redundant registry means encoding the redundancy into the intent map and paying for it twice. Consolidating first is roughly a day, and it makes 5.2's job smaller and its buckets cleaner. It is a scheduling suggestion, not a correctness requirement — if it disrupts an in-flight session, do it after and accept the rework.

### 6.1 — Consolidate order-read tools

`get_shopify_orders`, `get_order_by_name`, `get_order_fulfillment_status`, `get_order_tracking`. Fulfillment status and tracking are fields on the order object; three round trips reconstruct one record against a 10-iteration cap. Separately, `buildContext` already prefetches recent orders when the customer is linked.

**Do:** one `get_order` tool with a discriminated lookup (`{ by: 'name' | 'id' | 'customer', value, limit? }`) returning order, fulfillment status, and tracking in one response. Include a `fields` parameter so a trimmed payload is possible.

The prompt currently restates the `get_order_tracking` rule three times (internal audit 5.5). Those three restatements delete with this task — fold the guidance into the single tool's description.

**Acceptance:** median tool-calls-per-WISMO-ticket drops measurably. Retired names remain resolvable for historical `AgentAction` rendering but are not newly executable — mirror the existing pattern used for `issue_discount` and the retired store-credit operation.

### 6.2 — Consolidate customer lookup

Merge `search_shopify_customers` and `get_shopify_customer` into `find_customer`, same discriminated-lookup shape, same retirement pattern.

### 6.3 — Disambiguate the mutation surface

Refund / return / exchange / cancel / edit-order / gift-card overlap in outcome space. An exchange is a return plus an order.

**Do not merge them** — distinct policy metadata, distinct caps, distinct audit semantics; merging increases blast radius. Instead rewrite each **description** to state its exclusive precondition and name the tool handling the adjacent case: *"Use when the customer keeps the item and wants money back. If the item is being sent back, use `create_return`."*

Add an eval fixture per adjacent pair (refund↔return, return↔exchange, cancel↔refund, edit-order↔cancel) presenting the ambiguous phrasing and asserting correct selection. These fixtures are also the regression net for 5.2 — a wrongly-narrowed bucket shows up here first.

**Acceptance:** new fixtures pass. No change to policy metadata, caps, or executor logic in this task.

---

## Phase 7 — Bounded re-planning on definite write failure

**Depends on:** internal audit Phase 2 (validate, don't repair) and Phase 3 (`decideAutonomy`). **Both, strictly.** This phase adds a second entry into the planning path; it must not be built while that path has four owners and six mutation passes.

**Why:** in capture mode the model proposes once and never sees the result of a write. If step 2 of a 3-step plan fails, execution goes partial/unknown and lands on the merchant. This is separable from at-most-once: reads are idempotent, and *failed* is a known state distinct from *unknown*. The gap gets worse as tasks lengthen, which is why it precedes Phase 10's multi-step campaign work.

**Relationship to internal audit Phase 2:** that phase decides what happens to a plan the model got wrong *before* execution. This one decides what happens to a valid plan the *provider* rejected mid-execution. Different failure, adjacent machinery — build it as a second consumer of the same validation pass, not a parallel path.

### 7.1 — Distinguish failed from unknown at the plan level

Ensure the execution ledger separates:
- `failed` — provider definitively rejected; no side effect occurred
- `unknown` — outcome indeterminate; a side effect may have occurred

Every executor error path maps to exactly one. Anything ambiguous maps to `unknown`. Prove by test, not inspection.

### 7.2 — Replan on definite failure only

When execution halts with all completed steps committed and the halting step `failed`:

- Model receives the original request, the tool results of successful steps, and the failure reason.
- Model proposes a **new** frozen plan for the remainder.
- The new plan goes through the **full** path — validation, `decideAutonomy`, static policy, caps, plan hash, instruction hash, row-locked atomic claim. No shortcuts because it is a continuation.
- **One replan maximum per original plan.** A second failure escalates.
- Recorded as a distinct plan linked to its parent.

**Hard constraints:**
- **Never replan after `unknown`.** Escalate. This is what preserves at-most-once.
- Never re-execute a committed step.
- A replan never raises the autonomy tier. If the original needed approval, so does the replan.

**Acceptance:** fixture — 3-step plan, step 2 fails definitively → remaining work completes via one replan, merchant notified once, no duplicate side effects. Fixture — step 2 returns unknown → no replan, escalation. Both in the eval suite, landed via PR.

---

## Phase 8 — Merchant preference memory

**Depends on:** internal audit Phase 4 complete (the classifier's structured output and the field renderer are the surface preferences will be displayed through).

**Sharpened 2026-08-22:** that dependency is on the *operator card*, not the briefing — a merchant confirms a proposed preference from Telegram/iMessage (8.2), and `record_preference` is an operator-turn tool. `planning-notifications.ts` was found to read no `requestFacts` or `classifierSignals` whatsoever, so the surface 8.2 and 8.4 render through is still prose end to end. Phase 4 is not "complete" for Phase 8's purposes until the card is converted, whatever the briefing-side items say.

**Why:** this is the wedge. Rep teams need macros because reps need consistency; a solo operator's differentiator is that the agent absorbs *their* judgment. Today there is no mechanism to learn that a merchant always comps shipping past day 10, or never argues over $15. Without it the product is a macro engine with better prose. It is also a hard dependency for Phase 9.3.

### 8.1 — Preference store

Org-scoped `MerchantPreference`:

```
id, organizationId, scope, statement, sourceType, sourceRef,
confidence, status ('proposed' | 'active' | 'retired'),
createdAt, confirmedAt, lastAppliedAt, timesApplied
```

`scope` is a coarse category (`refunds`, `shipping`, `returns`, `tone`, `escalation`) used for retrieval — and it should align with 5.2's intent buckets so preference injection can be filtered the same way tools are. `sourceType` separates `merchant_stated` from `observed`. Index on `(organizationId, scope, status)`.

### 8.2 — Capture

**Explicit (build first):** operator-turn tool `record_preference`. Merchant states a rule in Telegram/iMessage → recorded → confirmed in the reply. Status `active`.

**Observed (build second, behind a flag):** when a merchant **rejects or revises** a plan, a low-cost Haiku call proposes a candidate from the delta. Status `proposed`. **A proposed preference is never applied.** It surfaces in the digest as one-tap confirm/dismiss. Only merchant confirmation promotes it.

**Do not auto-promote observed preferences.** Ever. A wrong self-learned refund policy is a trust-ending event for a solo merchant.

### 8.3 — Apply

Inject `active` preferences into `buildContext`, filtered by scope. Cap count (start at 10) and token budget. Increment `timesApplied` / `lastAppliedAt` on injection into a turn that produces a plan.

**Critical:** preferences are **model guidance only**. They must not modify caps, autonomy tier, or any input to `decideAutonomy`. A preference saying "always refund up to $200" does not raise a $100 cap — the cap fires and escalates. State this in a comment at the injection site; it will be tempting to violate later.

**Acceptance:** fixture — active preference changes the drafted reply. Fixture — preference attempting to exceed a hard cap still escalates structurally.

### 8.4 — Close the operator/support memory split

The operator agent knows about pending plans and nothing else — no visibility into what the support agent did overnight. Add `get_recent_activity` (volume by tag, recent escalations, recent autonomous resolutions) to operator turns. Preferences already flow the other direction via 8.3.

**Acceptance:** merchant asks "what happened overnight" in Telegram and gets a real answer from thread state.

---

## Phase 9 — Lost package resolution

**Depends on:** Phase 8 (remedy policy is a preference question) — unless Phase A.1 promotes this ahead, in which case implement remedy policy from static org settings and backfill later.

**Why:** WISMO is typically 40–60% of ecommerce ticket volume. Today the ceiling is "here's your tracking link," which the order confirmation email already delivered.

### 9.1 — Carrier capability type

Available capability types are hard-coded to Shopify, thread I/O, KB, and stats. Add `carrier`.

Implement one provider behind an interface. **AfterShip** if you want exception classification (stalled, misrouted, delivery-attempted, returned-to-sender) done for you; **EasyPost** for raw events you classify yourself. AfterShip is the faster path; the interface keeps it reversible. Org-scoped credentials, same authorization pattern as Shopify. **Verify the current API surface against live provider docs — do not code from memory.**

### 9.2 — Tracking tool

`get_shipment_status` — full event history, normalized exception classification, days-since-last-scan. Lands in the order-status intent bucket from 5.2.

**Acceptance:** fixture — package with no scan for 6 days produces a reply naming the stall, not a link.

### 9.3 — Proactive stall detection

An hourly shipment-exception monitor already exists in `apps/gateway/src/maintenance/workers.ts`. **Extend it; do not build new.**

Detect no scan in N days, exception status, or delivered-but-disputed. On detection, create an **approval plan** — the existing pattern — proposing a remedy (reship / refund / wait-and-notify) informed by Phase 8 preferences. Merchant approves from Telegram/iMessage via the existing pending-plan mechanism.

Deduplicate per shipment. Do not build this as a reactive tool the customer triggers — proactive detection is the differentiated behavior and it reuses machinery you already have.

### 9.4 — Vision hydration for email and TikTok attachments

Hydration currently runs only for Instagram DM images. Email and TikTok attachment references are persisted but never passed as image blocks. Damaged-goods claims arrive as email photos — the agent is structurally blind to the ticket type where accuracy matters most.

Extend hydration. Respect existing attachment budgeting; cap images per turn and enforce a size limit. Treat image content as **untrusted data**, identically to customer text.

**Acceptance:** emailed damaged-item photo reaches the model as an image block. Adversarial fixture: an image containing instruction-shaped text does not alter tool selection.

---

## Phase 10 — Shop management

**Depends on:** Phases 6 and 7, and internal audit Phase 3. Technically the easiest phase; highest blast radius. Operator turns only — never exposed in any customer-facing intent bucket.

### 10.1 — OAuth scope migration (first, and not a code task)

Determine which scopes are needed (expect `read_inventory`, `write_products`, `write_discounts`; **verify against the current Admin API version**). Then write the merchant re-authorization flow, the in-app explanation, and the degradation path for merchants who don't re-authorize.

**Acceptance:** existing merchants keep working without re-auth. Shop-management tools are unavailable-with-explanation, not broken, for un-migrated orgs.

This forces re-authorization across the entire merchant base. It is a migration and a support burden, not a code change. Budget accordingly.

### 10.2 — Inventory reads (ship immediately)

`get_inventory` — stock by product/variant/location, low-stock query, incoming inventory if available. Read-only, near-zero risk, ships independently of everything below.

### 10.3 — Value-at-risk guard (before any write tool)

Every existing guard — compensation caps, refund limits, verified-order scope — is scoped to **single-order** blast radius. A bad flash sale is unbounded.

Reusable pre-execution guard for catalog-scope mutations: compute affected SKU count and estimated revenue at risk; above an org-configurable threshold require explicit confirmation with a **rendered preview** (affected products, old value, new value, duration), not a yes/no; enforce a maximum discount percentage ceiling; enforce a mandatory TTL on any time-bounded change.

**Acceptance:** fixture — attempt to discount the entire catalog by 90% is blocked by the ceiling.

### 10.4 — Flash sales via discount primitives

Implement as **automatic discounts** (`discountAutomaticBasicCreate` or the current equivalent — verify against the live API version), **not** variant price mutations.

**Enforce this; do not let it drift.** A flash sale is not a first-class Shopify object. Direct price edits make you responsible for storing and restoring original prices; if that state is lost mid-sale the catalog is permanently repriced with no recovery path. Automatic discounts are reversible by construction, have native start and end times, and fail safe — worst case the discount expires on its own.

Tools: `create_discount` (mandatory `endsAt`), `list_active_discounts`, `end_discount`.

**Acceptance:** every created discount has an end time. Killing a sale is one command. Fixture: multi-step campaign where step 2 fails recovers via Phase 7's replan path.

### 10.5 — Direct price changes (last, most constrained)

`update_variant_price`, single-variant or explicitly-enumerated-variant only. No wildcard or collection-wide targeting. Full value-at-risk guard. Original price recorded in the `AgentAction` payload for manual recovery.

**Acceptance:** bulk repricing is impossible through this tool by construction. Every change individually auditable and reversible from the audit record.

---

## Phase 11 — Deferred from v1

Re-open only after internal audit 4.4 closes. The pre-v5 question is settled (age out, 2026-08-22); 4.4 now waits on those threads actually aging out.

- Unify the two classification paths: email is classified pre-persistence, all other channels persist-then-classify. Same contract, two orderings.
- Rename `email-classification.ts` → `message-classification.ts`.
- Preserve the existing staleness guard: after the model returns, re-read the newest message and refuse to save request fields if a newer customer message arrived mid-call.
- Verify a multi-message email burst still produces one classification, not several.

---

## Explicitly out of scope

**Proactive visitor conversion.** Deferred indefinitely. Different product — threadless, anonymous session identity, outbound-initiated, revenue-attributed — and almost none of the existing safety apparatus applies. Off-site channels carry a different legal risk class (CAN-SPAM, CASL, TCPA depending on medium). Build no part of it while executing this plan.

**Merging the customer and operator execution policies.** The split is correct.

**Removing capture mode for customer channels.** No.

**Extending `warningBlocksQuickReply` rather than deleting it.** The third-party summary and the earlier work order both suggested routing new failures *through* the substring gate. The internal audit is right: it should be deleted and replaced with a typed signal.

**Auto-promoting observed merchant preferences.** No.

**Replanning after an `unknown` provider outcome.** No.

---

## Sequencing summary

| # | Phase | Owner | Blocked by | Notes |
|---|---|---|---|---|
| A | Measurement | this doc | — | read-only, parallel, today |
| 0 | Live bugs | internal audit | — | closed |
| 1 | Typed signals | internal audit | — | **closed** — `plan-signals.ts`; no `.includes(` over warning text remains |
| 2 | Validate, don't repair | internal audit | 1 | |
| 3 | One autonomy function | internal audit | 1 | **gate for everything in Phases 8–10** |
| 4 | Structured rendering | internal audit | — | in progress; 4.4 waits on pre-v5 threads aging out. **4.6 re-scoped: the operator card was never converted** |
| 6 | Tool consolidation | this doc | 1–3 | **slot before 5.2** |
| 5 | Cost & housekeeping | internal audit | 6 recommended | 5.1 before 5.2; 5.2 takes §1.1 |
| 7 | Bounded replan | this doc | 2, 3 | required before 10 |
| 8 | Preference memory | this doc | 4 | the moat; blocks 9.3 |
| 9 | Lost package | this doc | 5.2, 8 | promote per A.1 |
| 10 | Shop management | this doc | 6, 7, 3 | 10.1 is a migration |
| 11 | Classification unification | this doc | 4.4 | deferred from v1 |

**Reordering trigger:** if A.1 shows WISMO is high-volume and low-autonomous-resolution, Phase 9 moves ahead of Phase 8 and takes its remedy policy from static org settings until Phase 8 lands.