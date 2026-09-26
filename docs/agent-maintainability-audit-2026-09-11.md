# Agent maintainability audit — 2026-09-11

Audited source: `bd25cf3a`. This is an analysis and proposed work order, not a claim that remediation has shipped. No application behavior was changed.

## Verdict

The agent has useful reliability infrastructure, but its supported behavior is wider than its contracts can reliably sustain. New capabilities participate in shared tool selection, shared instructions, prose-based completion checks, and host-specific execution paths. A feature therefore changes more than its own implementation. Passing the current tests does not establish that those interactions work.

The recommended revamp is subtractive: narrow the default product, preserve the execution safeguards, make outcomes structured end to end, and give every transport the same durable request lifecycle. A new agent framework, more agents, or a larger model would not resolve the demonstrated defects.

The product recommendation assumes the current support wedge remains the priority. Actual merchant tool usage, incident frequency, production latency, and cost per resolved request were not available in this audit. The code establishes complexity and concrete failure mechanisms; it cannot establish how often merchants encounter them or how widely gift cards are used.

## Evidence and limits

Reviewed the shared registry, planner, execution loop, context assembly, completion validation/rendering, spend enforcement, operator adapters, dashboard request path, eval harness, and historical audit. Ran `npm run test:unit -w packages/agent`: **85 files and 1,029 tests passed**. Also ran direct, local source-level probes of selection and completion functions without provider calls.

Measured at this revision:

| Surface | Observation |
| --- | --- |
| Shared registry | 29 active tools; 4 retired definitions |
| Active Shopify tools | 20; only `get_inventory_status` declares nonempty `requiredScopes` |
| General customer order-mutation selection | 23 executable tools plus `request_wider_tool_set` |
| Full active tool schema serialization | 25,447 characters, before system prompt and conversation; this is not a token count or a measurement of every turn |
| Gift-card surface | One active `create_gift_card`; `issue_store_credit` is retired |

No production queries, live model evals, integration suite, browser suite, external writes, or live merchant messages were performed. The passing unit suite is supporting evidence only, not launch certification.

## Findings

### 1. Completion checks are a language-dependent safety boundary

**Priority: immediate. Confirmed by executable probes.**

`detectUngroundedReplyText` and `unsupportedReplyCompletionClaims` in [plan-grounding.ts](../packages/agent/src/plan-grounding.ts) detect completion claims using English regular expressions. With no preceding action and no completion evidence:

| Reply | Planning grounding check | Execution grounding check |
| --- | --- | --- |
| “I've refunded your order.” | Rejects | Rejects |
| “Your refund is complete.” | Accepts | Accepts |

The planner check also accepts “You have been refunded,” “The money is back on your card,” and “He reembolsado tu pedido.” These are counterexamples to the grounding boundary, not evidence that the model produces them frequently. The execution renderer leaves “Your refund is complete” unchanged when no facts exist.

The desired invariant is sensible: never claim completion without evidence. Its implementation cannot guarantee that invariant by recognizing an expanding list of sentences. Brand voice, phrasing, or language changes can expose gaps without changing an action tool.

**Change:** make action confirmations explicit structured reply elements referencing successful execution records. Render the completion sentence from those records. Keep ordinary explanatory prose separate; do not claim that a free-text validator proves the truth of arbitrary text. Carry explicit dependencies from a confirmation to its action instead of inferring them from verbs. Extend the existing `CompletionFact` structure rather than adding a parallel subsystem. Retain the current checks during migration until replacement coverage exists.

### 2. Structured provider results are discarded and then reconstructed from prose

**Priority: immediate; address with finding 1. Confirmed by source and probes.**

[ToolResult](../packages/agent/src/tools/result.ts) has `status`, `message`, and optional `data`. But `executeToolWithStatus` in [executor.ts](../packages/agent/src/tools/executor.ts) returns the message and a reduced status, dropping data. [run-execution.ts](../packages/agent/src/run-execution.ts) stores that string in `ActionEntry`. [completion-facts.ts](../packages/agent/src/completion-facts.ts), `mutationFacts`, then parses it to recover facts.

A successful partial refund with result `Refunded $12.00` yields a completion fact containing `amount: "12.00"`. The semantically equivalent `Issued refund of $12.00` loses the amount. Cancellation refund evidence similarly depends on a textual `financial_status` pattern. `not_found` also becomes `success` in the execution adapter, losing a distinction that is useful to recovery and reporting even if an empty read is not a transport failure.

**Change:** preserve a typed result payload through executor, action persistence, reconciliation, and reply rendering. Provider adapters should return canonical amount, currency, resource identity, and outcome directly. Human-readable wording must not be the storage format for machine facts. Keep historical decoding in a compatibility reader; new writes should not require it.

### 3. Dashboard request lifetime and execution lifetime disagree

**Priority: immediate. Confirmed architectural gap; production incidence unmeasured.**

[postGatewayOperatorTurn](../apps/dashboard/src/lib/agent/api/gateway-operator-turn.ts) has a 55-second timeout; the dashboard chat route allows 60 seconds. [The gateway endpoint](../apps/gateway/src/routes/internal-operator.ts) runs the instruction synchronously and supplies neither a durable inbound event ID nor a cancellation signal. [runAgent](../packages/agent/src/run.ts) starts its execution loop without an overall signal. Individual model requests have a 60-second timeout and one configured retry, and the default turn permits ten iterations.

The dashboard can therefore report failure while the gateway is still working. Its request body carries organization, user, and instruction, but no idempotency key. `executeAgentTurn` generates a new turn ID when one is absent. The thread lock prevents overlap while held; it does not deduplicate a later resubmission after the original turn finishes. Provider operation keys derived from the new turn cannot identify that resubmission as the original request.

**Change:** accept a stable client request ID, persist/claim the request before executing, return its identity promptly, and let the dashboard observe its durable status and transcript. Reuse the durable ingestion pattern already used for messaging. A retry must reconnect to the original run. Use an overall turn deadline and stop scheduling new work when it expires; a provider write already in flight still needs reconciliation, not an assumption that cancellation undid it.

**Acceptance:** a slow action, disconnected browser, refresh, and duplicate submission produce one execution and an eventually visible result.

### 4. Tool scope gating is largely unpopulated

**Priority: high. Confirmed by registry inspection and selection probe.**

`defineTool` defaults `requiredScopes` to `[]`. Of 20 active Shopify definitions, 19 inherit that default. Calling `selectAgentTools(undefined, null, [])` still exposes `create_refund`, `create_return`, and `create_gift_card`. The [capability backstop](../packages/agent/src/tools/registry/helpers.ts) also only checks scopes when the declaration is nonempty.

This is not proof of unauthorized Shopify access: the provider can refuse the operation. It means the application advertises capabilities that its connection may not support, despite the historical audit's broad statement that short grants withhold tools. Connection presence, scope grants, and provider-specific capability restrictions are different conditions.

**Change:** declare requirements for every retained Shopify tool and derive selection from actual connection capabilities. Enforce that retained provider tools have an explicit capability decision rather than silently defaulting to no requirements. Revalidate specific scope and provider requirements during implementation. Do not fill out metadata for tools the product elects to retire.

### 5. Narrowing still exposes a broad product surface

**Priority: high. Confirmed.**

[selectPlanningTools](../packages/agent/src/planner-tool-selection.ts) gives any aligned `mutative_request` the broad order-mutation bucket: refund, partial refund, cancellation, order edit, return, exchange, gift card, return label, reads, and control tools. That is 24 tools including the widening control. An address change inherits gift-card and exchange choices. Several conditions return the full available registry; widening can restart planning with it.

Operator turns also assemble session, inbox, history, product-help, shop-management, and sometimes navigation tools on every free-form turn in [operator-free-form-turn.ts](../apps/gateway/src/message-handlers/operator-free-form-turn.ts). These are distinct merchant jobs sharing one default option set.

**Change:** define a small number of explicit task tool sets for retained workflows. Load optional merchant operations when the request needs them. Keep selection separate from authorization: narrowing is an efficiency aid, never a security boundary. Do not replace individual tools with a giant generic `manage_shop` tool, which merely hides the same complexity inside arguments. Do not promote renderer-only `RequestFacts` into a trusted routing contract without evaluating that change; the existing selector explicitly keeps them separate.

### 6. Gift cards are overrepresented in shared behavior, not numerous active tools

**Priority: product scope decision. Confirmed coupling; adoption unmeasured.**

There is one active gift-card tool, not a large collection of active gift-card tools. `issue_store_credit` survives as a retired historical definition. Nevertheless, gift cards participate in the broad mutation bucket, support compensation instructions, operator instructions, cap descriptions, completion facts, and core fixtures. [gift-card-goodwill.json](../apps/dashboard/src/lib/agent/__evals__/fixtures/gift-card-goodwill.json) is explicitly in the core suite.

The support prompt also maps all explicit “store credit” language to gift cards. That is a product interpretation with maintenance and semantic costs, not simply a provider adapter detail.

**Recommendation:** remove gift-card issuance from the default customer-support surface. Retain historical records and reconciliation. Keep issuance available only as an isolated merchant-requested capability if actual demand justifies supporting it; otherwise retire new issuance. Treat unsupported credit requests as a merchant handoff. Change prompt, selection, fixtures, and availability together. Deleting only the implementation would reproduce the contradictory-contract incidents in the historical audit.

### 7. Context loading makes irrelevant work part of a turn's critical path

**Priority: medium. Confirmed; latency savings require measurement.**

[buildContext](../packages/agent/src/context.ts) loads preferences, integration state, KB, open-thread count, and—when a customer is linked—recent orders before the model operates. KB queries run for operator contexts too, although the operator prompt does not preload that KB section. KB failures are captured and then rethrown; open-thread count failures also reject context assembly. The preference load has its own degradation path, but this does not extend to every ancillary dependency.

Consequently, a store-help question can wait on order reads, and an unrelated context dependency can prevent a useful turn. This is more consequential than shaving words from a prompt.

**Change:** establish required context by task and trust mode. Authentication, tenant ownership, execution policy, and relevant provider evidence remain mandatory. Load preferences, counts, and unrelated data only where needed. Missing policy evidence must block policy-dependent action while still permitting unrelated work. Avoid both blanket fail-open handling and blanket aborts for optional context.

### 8. Execution and planning enforce different model-call budgets

**Priority: medium. Confirmed.**

[planAgent](../packages/agent/src/planner.ts) passes a 120-second signal and a per-call `enforceSpendCap` callback into the shared loop. The execute/read-only path in `runAgent` checks daily spend before entering the loop and supplies neither option. [spend.ts](../packages/agent/src/spend.ts) describes overshoot as about one call per parallel run; an executing run can continue making calls after its initial check.

There is a token budget and iteration limit, so this is bounded, not an infinite-spend claim. But the budget semantics depend on entry point. Low-tier escalation and namespace widening also restart planner attempts; their frequency and cost should determine whether the optimization is worthwhile.

**Change:** one run budget for time, calls, and accumulated usage, shared across attempts and checked before every model request. Keep approved deterministic execution independent of model budget. Compare total cost and latency per resolved task before retaining tier-selection or widening complexity.

### 9. Existing evidence is easier to overinterpret than to use as a release guarantee

**Priority: high. Confirmed limits, not a claim that testing is absent.**

The unit suite passed despite the counterexamples above. The [eval runner](../apps/dashboard/src/lib/agent/__evals__/runner.ts) supports simulated tool results keyed by tool name, deriving failure from an `Error:` prefix. That simulation cannot by itself establish provider behavior, timeout recovery, identity continuity, or the full structured outcome vocabulary. Integration and browser tests do exist; they were not run here and must not be represented as missing or passing.

An earlier August 2026 pipeline audit records prior premature completion claims: approval-path replanning failures, a missing migration stopping all planning, and fixture/prompt disagreements. Its closed milestone ledger is historical evidence, not current product certification. The operating instructions also admit prompt growth while prohibiting special-case growth. More rules in a document have not eliminated this failure mode.

**Change:** acceptance follows merchant journeys across boundaries: inbound request → relevant evidence → decision → approval if required → provider effect → delivered reply → persisted outcome. Test missing scopes, paraphrases, partial completion, unknown provider outcomes, duplicate delivery, concurrent approval, stale plans, and optional dependency outages. Use typed simulated outcomes; reserve a small live provider/model set for things simulation cannot establish. Record exactly which boundaries each result proves. Never summarize all of that as “everything is good.”

## Smaller product and architecture

Default customer support should prioritize order/shipping questions, policy/product questions, missing-information collection, address changes before fulfillment, cancellations, refunds, basic returns, and clear merchant handoff. Preserve currently working behavior while deciding which of those actions may run automatically.

| Treatment | Capabilities |
| --- | --- |
| Core | Answer, look up relevant order/product/policy, propose supported order action, ask merchant/customer, deliver reply |
| Isolate from default support | Gift cards, complex exchanges, replacement-order creation, merchant fulfillment, outbound campaigns/contact, promotions, repricing, broad analytics |
| Runtime-owned | Audit notes, action journaling, completion facts, execution status, delivery retries |
| Preserve | Tenant/identity checks, approval binding, live policy enforcement, operation keys, unknown-outcome reconciliation, delivery records |

“Isolate” is a recommendation to remove default coupling, not evidence that all listed features are currently exposed to customers. Promotions and repricing are already operator-only; keep that boundary. Do not delete a functioning operator feature solely to simplify support.

Use the existing shared core and gateway. Its conceptual path should be:

`Durable request → task context and allowed tools → typed proposal → policy/approval → recorded execution → result-based reply and delivery`

The model interprets requests, asks for missing information, and drafts explanations. Application code owns permissions, action dependencies, exact financial facts, audit notes, and completion confirmations. Channels own transport and presentation. Historical plan compatibility belongs at the persistence boundary.

This is a consolidation of existing pieces, not a proposal for a plugin framework or a second orchestration engine. Support planning and operator execution legitimately differ; they should share lifecycle, policy, budgets, and outcome contracts without forcing identical user interactions.

## Proposed work order and completion gates

1. **Freeze expansion and set the supported surface.** Inventory actual request/tool usage and unresolved persisted operations. Agree the core journey set; remove optional tools from default selection and their shared instructions/fixtures together. Keep historical readers. Gate: excluded tools are absent from default turns, and retained core journeys still work.
2. **Fix truth and request identity.** Preserve typed results through persistence; replace inferred action confirmations with explicit fact references. Add durable dashboard request IDs and status recovery. Gate: paraphrases cannot bypass the structured confirmation path; slow/disconnected/repeated requests neither disappear nor repeat writes.
3. **Complete capability and budget contracts.** Populate requirements for retained tools, make optional context task-specific, and share run budgets across paths. Gate: missing integrations/scopes never become executable proposals; optional failures do not stop unrelated tasks; all model paths obey the same budget.
4. **Consolidate after the replacement works.** Remove redundant prompt branches, result-string parsers, model-generated audit notes, and obsolete adapters from active paths. Inventory persisted state before removing compatibility. Gate: each concept has one owner and old actionable state remains recoverable.
5. **Certify the narrow product and hold the line.** Validate representative end-to-end journeys and failure cases; roll out gradually with an explicit rollback path. Gate: evidence includes delivery and durable outcome, not just a selected tool or plausible draft.

Each step should be a reviewable change with its own evidence. Do not combine tool retirement, an execution rewrite, and a model change into one release; that would make regressions difficult to attribute.

Measure successful resolution without correction, appropriate versus avoidable handoffs, delivered replies, duplicate effects, unknown outcomes, p50/p95 request-to-response time, and model/provider cost per resolved request. Use the existing action, execution, usage, and request-outcome records before building new analytics infrastructure. Baseline first; this audit does not invent performance improvements or adoption thresholds.

For future features, require a named merchant job and evidence of demand, a reason the existing workflow cannot handle it, an isolated tool/context boundary, an owner, and explicit failure behavior. Optional features must not expand the default support prompt or tool list just because they are implemented. A feature that causes unrelated support journeys to regress is incomplete even when its own tests pass.
