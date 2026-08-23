# Shopkeeper — Capability Expansion Plan (v2)

**Status:** spec for execution
**Last reconciled against the tree:** 2026-08-23
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

1. **Finish the internal audit's Phases 1–4 before capability expansion.** Phase A is read-only and may run in parallel. Phase 6 may run immediately before internal-audit task 5.2, after Phases 2 and 3 are complete; the remaining Phase 5 housekeeping does not block it.
2. **Verify before you build.** Locate code by symbol name, never by line number — line numbers in *this* document's source material are unverified and some were already proven stale. If the code contradicts this plan, **stop and report**. Do not silently adapt.
3. **Everything goes through deterministic CI, then an explicitly budgeted release gate.** `evals.yml` runs only free preflight checks on `pull_request`; paid model calls require `workflow_dispatch mode=release` with dollar and call ceilings. The dashboard and gateway run independently. Passing behavior assertions and preserved artifacts are the gate evidence; a diagnosed orchestration/reporting false negative does not require paying to rerun already-successful model behavior. See `docs/agent-eval-gates.md`.
4. **One phase per session.** Use `git worktree` for any parallel session. Never two sessions against one working tree.
5. **The classifier is non-deterministic.** The internal audit recorded two runs of an identical ticket producing materially different summaries. Any behavior routed off classifier output needs a working fallback path, and any before/after comparison needs more than one run.

### Architectural charter

> One reasoning core, one memory, one tool registry. Execution policy varies by *who is talking*, and only by that. Customer-facing input is attacker-controlled and stays behind capture-mode planning with deterministic adjudication. Merchant-facing input is authenticated and may run an iterative live-execution loop.

The internal audit's Phase 1 removed the warning-text substring gate, and Phase 3 implemented the single typed `decideAutonomy` owner while retaining execution-time policy as an authoritative temporal backstop. Local deterministic, unit, integration, typecheck, lint, build, and structure gates pass. The paid behavior evidence passed on 2026-08-22; its ANSI-sensitive summary-parser false negative was diagnosed and fixed, and the passing assertions/artifacts are accepted as conclusive without another paid run. **No capability in Phases 8–10 may bypass that owner or begin before the required preceding gates.**

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

**Implemented locally 2026-08-23; paid gate pending.** `planner-tool-selection.ts` uses aligned classifier intents, fails open to the full set for missing/stale/ambiguous classifications, and leaves operator/storefront/merchant-answer paths unchanged. Narrowed buckets carry the three required control tools. A planning-only typed widening signal plus empty/incomplete-plan detection permits one clean judgment-tier retry against the full set. Structured completion logs expose the original bucket and a `namespaceMiss` boolean/reason for rate aggregation. Deterministic schema measurements show −67% for order-status and −81% for policy buckets, including the widening tool. The internal-audit 5.2 checkbox remains open until the exact-SHA release workflow passes.

### Deferred

| v1 task | Until |
|---|---|
| **v1 1.3 — unify the two classification paths; rename `email-classification.ts`** | Deferred to Phase 11. Its Phase 4 dependency was satisfied on 2026-08-22. `CLASSIFIER_VERSION` is 5, the structured fixture migration is complete, and the existing-customer bypass was removed, so Phase 11 now unifies two orderings rather than three. |

### Superseded by prior work — check before re-running

v1 tasks 0.1–0.3 (Haiku speculative-planning discard rate, capture-mode read re-execution, per-model prompt-cache hit rates) may already be answered. The 2026-08-16 model-call audit at git `2cc9749c` covered the call-site census, token accounting, and prompt-cache behavior. **Read it first.** Only measure what it does not already answer.

Note also that the internal audit's numbers supersede the third-party summary's throughout: agent loop 117 LOC, planner 285, registry 175, 28 tool schemas shipped on every iteration. **The `~6,926 tokens` this line used to carry has no recorded method and is retired** — the audit re-derived it on 2026-08-22 as 21,818 serialized characters ≈ **5,455 tokens**. Do not quote the old figure; it sized Phase 6's argument.

---

## Phase A — Measurement

**Status:** complete 2026-08-22. See `docs/agent-phase-a-measurement-2026-08-22.md`. The requested resolution-rate table is not reconstructable from current historical data; the report records the missing immutable attribution needed to make it measurable.

Read-only. Touches nothing the remediation work touches. Can run in a separate worktree while Claude Code continues on internal audit phases.

**Why now:** internal audit Phases 1–5 total roughly 20 engineering days — closer to a month of calendar for one person, entirely internal. That month is correct regardless, because 2.1 is a trust-binary risk. But what happens on day 21 should be decided by data you gather now, not by the ordering in this document.

### A.1 — Resolution rate by ticket type

Using the classifier's existing support tag and disposition, over the last 30 days:

| ticket type | volume | resolved with zero merchant touch | escalated | needed approval | needed merchant input |
|---|---|---|---|---|---|

**Also report:** what fraction of organizations have `autoExecuteMode` live. Default is off. If most merchants never turn it on, the mutation and routing apparatus only ever produces approve/reject cards, and "autonomous" is not currently true in production — which changes what Phases 9 and 10 are actually worth.

**Original decision rule:** if WISMO-class tickets were high-volume and low-autonomous-resolution, promote Phase 9 ahead of Phase 8. **Not applied:** A.1 was not reconstructable from current historical data, so Phase 9 remains behind Phase 8.

### A.1a — Instrument the missing attribution

- [ ] Persist immutable customer-episode/source-message, plan verdict, execution outcome, and merchant-touch attribution so A.1 can be rerun without reconstructing history from mutable thread fields.

### A.2 — Verify partial refund exists

The third-party summary lists "full refund" among the mutation tools. If there is no partial-refund path, that is a capability gap sitting underneath all of this remediation — most real compensation is partial.

**Verify.** If missing, implement as a first-class tool with its own cap, respecting the existing daily compensation limit, and escalating above cap through the structural `templated-reason` mechanism rather than prompt-only. Do not schedule this inside a remediation session; it is its own PR.

### A.3 — Read `2cc9749c`

Answer §1's "superseded" questions from the prior audit rather than re-measuring. Record which remain genuinely open.

**Acceptance for Phase A:** one committed report under `docs/`. No production code changed.

**Decision outcome:** do not apply the WISMO reordering trigger from the current cohort. Production has 0/17 active organization rows with `autoExecuteMode = "live"`, and the 30-day cohort is small, internal/test-heavy, and incomplete on classifier history. Partial refunds are confirmed absent by design and remain a separate capability PR. Low-risk Haiku is off; approved support turns re-executed reads in 2/13 observed executions; real per-model cache-hit rate remains unmeasured because the usage detail is not durable.

---

## Internal audit Phases 0–5 — not restated here

Execute as written in the Agent Pipeline Audit. Two notes only:

**Phase 4 completed 2026-08-22.** The operator card now consumes immutable `RequestDisplay`, pre-v5 fixtures were migrated intentionally, and the prose/tense fallback is deleted. Production iMessage delivery and recipient review were confirmed; the two copy defects found by that review were corrected and covered by deterministic renderer tests. Both earlier judgment calls are settled:

- *Pre-v5 threads:* do **not** render them from `aiTitle`. The test fixtures were migrated to v5/structured-unavailable states and the prose fallback was removed; legacy actionable cache/pending state is pruned.
- *`ask: "none"`:* rendered from fields. `no_request: true` prints a stalled-conversation line; a classifier miss prints person · order · `aiTitle`. The larger half of this was never a decision at all — the existing-customer email bypass was writing `emptyRequestFacts()` for every repeat customer and `skipSummary` meant nothing filled them in later. That was a bug and it is fixed.

The renderer decisions are closed: `classifyPerson` splits verified and unverified visitor wording. The first live phone receipt reversed the earlier postal-redaction decision: authenticated operator cards now retain the complete actionable address, while unrelated contact-detail protections remain. Resolved deadlines identify themselves and include a full calendar date, for example `Customer deadline: Fri, Aug 28, 2026`, rather than the ambiguous `By Friday`.

**Phase 4 gate evidence, 2026-08-22:** exact SHA `4cd07169b57d1c13ed024536418ab649abfa0409` passed 44/44 dashboard fixtures and gateway clear-fraud 1/1 for $0.5108 and 86 calls. [The workflow](https://github.com/walledog11/shopkeeper/actions/runs/32618869853) remained red only because ANSI bytes preceded the gateway summary marker expected at byte zero; the validator is fixed, and the passing assertions/artifacts are accepted without another paid run. The production iMessage provider delivered the structured card and the recipient confirmed receipt. That live review found the address masking and relative deadline unusable; commit `3b4f3089` corrects both across operator surfaces and passed 379 gateway unit tests plus 846 gateway integration tests locally. The model behavior and provider delivery were already demonstrated, so deterministic copy corrections do not require repeating either external gate.

**Scheduling recommendation: move Phase 6 of this document to just before 5.2.** See Phase 6.

---

## Phase 6 — Tool registry consolidation

**Status 2026-08-23: 6.2 and 6.3 complete; 6.1 deferred, and the reason is a correction to this document.**

**Depends on:** internal audit Phases 1–3 complete.
**Recommended slot:** immediately **before** internal audit 5.2, not after.

**Why that slot:** 5.2 buckets 28 tool schemas (~5,455 tokens/iteration — re-derived 2026-08-22) by intent. Several of those schemas are near-duplicates of each other. Bucketing a redundant registry means encoding the redundancy into the intent map and paying for it twice. Consolidating first is roughly a day, and it makes 5.2's job smaller and its buckets cleaner. It is a scheduling suggestion, not a correctness requirement — if it disrupts an in-flight session, do it after and accept the rework.

### 6.1 — Consolidate order-read tools

**Deferred 2026-08-23.** This section's premise is wrong about one of its four tools, which is enough to change the shape of the work, so per rule 2 it is reported rather than adapted around.

*"Fulfillment status and tracking are fields on the order object"* holds for two of the four and not for the others. `get_shopify_orders` and `get_order_by_name` genuinely are one endpoint — both call `orders.json` through the same `orderFields()` projection (`packages/agent/src/shopify/orders.ts`), differing only in query parameter, and those two do consolidate. `get_order_fulfillment_status` is the same endpoint under a deliberately narrower field allowlist plus an email-match guard: a security projection, which is why this section already says to keep it for guests. But `get_order_tracking` calls a **different** endpoint, `orders/{id}/fulfillments.json` (`packages/agent/src/shopify/tracking.ts`) — and, when this was written, the live USPS API after it. It is not a projection on the order record, and folding it in behind an `include` flag would turn a call the model visibly did not make into a field it silently omitted — a worse failure mode than the one being fixed. *(The USPS half was removed later the same day; the endpoint argument stands on its own, since `fulfillments.json` was never part of the order record either.)*

The second constraint is one this section half-anticipates in its point 3: `get_order_by_name` and `get_order_tracking` are the *entire* verified-storefront capability (`VERIFIED_ORDER_TOOL_NAMES` in `packages/agent/src/guest-policy.ts`), so neither can be retired. They would have to survive as storefront-only tools excluded from the support set the way `get_order_fulfillment_status` already is (`planner.ts`, via `isGuestOnlyTool`). That is buildable, but it buys support **one** fewer schema in exchange for a new exclusion mechanism plus the full guest/verified policy-matrix coverage this section demands — and `buildContext` already prefetches recent orders for a linked customer, so the round-trip saving is smaller than the "three round trips" framing implies.

**Revisit when 5.2 shows whether order-read redundancy costs anything in practice.** If it does, build `get_order { by: 'name' | 'id' | 'customer', value, limit?, fields? }` over `orders.json` only, leave `get_order_tracking` as its own tool, and do not expose `by: 'customer'` to either storefront state.

Original text follows, for the record: `get_shopify_orders`, `get_order_by_name`, `get_order_fulfillment_status`, `get_order_tracking`. Fulfillment status and tracking are fields on the order object; three round trips reconstruct one record against a 10-iteration cap. Separately, `buildContext` already prefetches recent orders when the customer is linked.

**Do:** preserve three security states explicitly:

1. Normal authenticated support may consolidate its reads into one `get_order` tool with a discriminated lookup (`{ by: 'name' | 'id' | 'customer', value, limit? }`) and a trimmed `fields` projection.
2. Anonymous storefront guests keep the deliberately guest-only `get_order_fulfillment_status` surface, which returns no identifying order, customer, item, amount, or address data.
3. Verified-order storefront sessions keep their order-scoped `get_order_by_name` / `get_order_tracking` capability, or move to a separate verified-order projection that cannot perform customer-wide lookup.

Do not expose `{ by: 'customer' }` to either storefront state. Before retiring names, add acceptance coverage for `VERIFIED_TOOL_NAMES`, `ORDER_SCOPED_TOOL_SET`, static scope enforcement, and the guest/verified policy matrix. A future consolidation across these boundaries is a separate security-reviewed change.

The prompt currently restates the `get_order_tracking` rule three times (internal audit 5.5). Those three restatements delete with this task — fold the guidance into the single tool's description.

**Acceptance:** median tool-calls-per-WISMO-ticket drops measurably. Retired names remain resolvable for historical `AgentAction` rendering but are not newly executable — mirror the existing pattern used for `issue_discount` and the retired store-credit operation.

### 6.2 — Consolidate customer lookup

**Complete 2026-08-23.** `find_customer { by: 'query' | 'id', value, limit? }` replaces `search_shopify_customers` and `get_shopify_customer`. Both old names keep their definitions at `availability: "retired"` so historical `AgentAction` rows still render, and both return a policy block if a cached plan names one — the `issue_discount` pattern, now covered by a single `RETIRED_TOOL_NAMES` list in `registry.test.ts` that proves every retirement non-executable. The two Shopify implementations are unchanged and became module-private; `findCustomer` dispatches to them. Neither tool was ever in the guest or verified sets, so there was no policy matrix to re-prove — only the forbidden-lists in `guest-policy.test.ts` and `verified-policy.test.ts` to extend.

Merge `search_shopify_customers` and `get_shopify_customer` into `find_customer`, same discriminated-lookup shape, same retirement pattern.

### 6.3 — Disambiguate the mutation surface

**Complete 2026-08-23.** Descriptions for `create_refund`, `cancel_order`, `create_return`, `create_exchange` and `edit_shopify_order` now open with the situation each one owns and name the tool that owns the adjacent case. Four hard-gated `core` fixtures were added, one per adjacent pair, each phrased in the *other* tool's vocabulary so the decision cannot be made on wording alone: `adjacent-refund-vs-return`, `adjacent-return-vs-exchange`, `adjacent-cancel-vs-refund`, `adjacent-edit-order-vs-cancel`. The release profile is 48 fixtures rather than 44; the budget preflight estimates $0.66/87 calls against the standing $0.75/120 ceiling. No policy metadata, cap, or executor logic changed.

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

**Dependency satisfied 2026-08-22:** that dependency is on the *operator card*, not only the briefing — a merchant confirms a proposed preference from Telegram/iMessage (8.2), and `record_preference` is an operator-turn tool. The card consumes immutable structured `RequestDisplay`; digest cleanup, live provider delivery, recipient review, feedback corrections, deterministic coverage, and paid model behavior are complete. Phase 8 is unblocked.

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

## Phase 9 — Multi-carrier shipment resolution

**Depends on:** Phase 8 for remedy policy. Phase A.1 did not produce decision-grade evidence to promote this phase.

**Why — restated 2026-08-22, because the premise changed.** This section used to open by saying the USPS path was "implemented and tested" and that the gap was *broader* carrier coverage. **The USPS API does not work, and the client was removed.** There is now no carrier provider at all, so this phase is not an expansion from one carrier to several; it is the first working one.

What survived the removal, and why it was kept: the shipment-watch dedupe, `classifyShipmentAlert` (stall and exception classification, provider-agnostic by shape), thread resolution, and the approval-plan push. What went: the USPS OAuth client, the tracking fetch, and the USPS-only carrier filter on the shipment list. `runDeliveryExceptionMonitor` now takes a `CarrierTrackingProvider` whose production default is `null`; with no provider it refuses to scan and the hourly job is not scheduled, so the monitor cannot sit in the queue looking alive. That null is the seam 9.1 fills.

`get_order_tracking` still works — it returns what Shopify's fulfillment record holds (tracking number, carrier, shipment status, tracking URL) and no longer promises scan events.

### 9.1 — Implement the first carrier provider

~~Extract USPS as provider one, then add exactly one second provider.~~ **Rewritten 2026-08-22:** there is nothing to extract. Available capability types are hard-coded to Shopify, thread I/O, KB, and stats; add `carrier`, and implement one provider against the `CarrierTrackingProvider` shape already declared in `apps/gateway/src/maintenance/delivery-exception-monitor.ts`. There is no working USPS path left to regress, which makes this simpler than the extraction it replaces.

Implement one provider behind that interface. **AfterShip** if you want exception classification (stalled, misrouted, delivery-attempted, returned-to-sender) done for you; **EasyPost** for raw events you classify yourself. AfterShip is the faster path; the interface keeps it reversible. Org-scoped credentials, same authorization pattern as Shopify. **Verify the current API surface against live provider docs — do not code from memory.**

### 9.2 — Normalize the existing tracking tool

Evolve or replace `get_order_tracking` with `get_shipment_status`: full event history, normalized exception classification, and days-since-last-scan across supported carriers. Preserve historical tool-name rendering and the verified-order scope check. It lands in the order-status intent bucket from 5.2.

**Acceptance:** fixture — package with no scan for 6 days produces a reply naming the stall, not a link.

### 9.3 — Extend proactive detection into remedy selection

The hourly shipment-exception monitor still holds its detection, dedupe, and approval-plan machinery; only its carrier lookup is gone. **Extend it once 9.1 gives it a provider; do not build new.**

For proactive carrier evidence, keep stall, exception, and returned-to-sender detection and make the existing approval plan propose a remedy (reship / refund / wait-and-notify) informed by Phase 8 preferences. Merchant approval continues through the existing pending-plan mechanism.

Treat delivered-but-disputed as a reactive resolution flow: a carrier feed can establish “delivered,” but only inbound customer evidence establishes the dispute. Reuse normalized shipment status when a customer reports non-receipt; do not pretend the carrier monitor can infer the complaint.

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

**Re-opened 2026-08-22:** Phase 4 is complete. The structured fixture migration, prose-fallback deletion, provider-delivery verification, recipient review, and feedback corrections are complete.

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
| A | Measurement | this doc | — | **complete** — A.1 attribution blocked; A.2/A.3 recorded in the Phase A report |
| 0 | Live bugs | internal audit | — | closed |
| 1 | Typed signals | internal audit | — | **closed** — `plan-signals.ts`; no `.includes(` over warning text remains |
| 2 | Validate, don't repair | internal audit | 1 | **complete** — implementation and paid behavior gate passed |
| 3 | One autonomy function | internal audit | 1 | **complete** — implementation and paid behavior gate passed |
| 4 | Structured rendering | internal audit | — | **complete** — live delivery/review and feedback corrections passed |
| 6 | Tool consolidation | this doc | 1–3 | **6.2/6.3 complete 2026-08-23; 6.1 deferred** — premise wrong on tracking, revisit with 5.2 |
| 5 | Cost & housekeeping | internal audit | 6 recommended | **5.2 implemented locally; exact-SHA paid gate pending.** Includes §1.1 typed namespace-miss fallback; 5.3 remains open. |
| 7 | Bounded replan | this doc | 2, 3 | required before 10 |
| 8 | Preference memory | this doc | 4 | **unblocked** — Phase 4 complete; the moat; blocks 9.3 |
| 9 | Multi-carrier shipment resolution | this doc | 5.2 for tool bucketing/9.2; 8 for remedy policy | A.1 did not authorize promotion |
| 10 | Shop management | this doc | 6, 7, 3 | 10.1 is a migration |
| 11 | Classification unification | this doc | 4.4 | **unblocked/re-opened** — deferred from v1 |

**Current ordering:** Phase 9 remains behind Phase 8. Reconsider only after A.1a makes the attribution table decision-grade.
