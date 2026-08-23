# Agent Phase A measurement report — 2026-08-22

**Status:** complete as a read-only evidence pass; A.1's requested resolution-rate table remains blocked by missing historical attribution.

**Repository basis:** `e40578837530fcdef34d8a99a00558464a64e9ae` plus the shared working tree at 2026-08-22T22:43:09Z.

**Prior audit basis:** `git show 2cc9749c:AGENT_AUDIT.md`.

**Production basis:** aggregate-only `SELECT` queries against the Railway production environment at 2026-08-22T22:43Z. No message content, customer identifiers, organization identifiers, credentials, or provider payloads were selected or printed. The queries did not mutate state.

## Executive answer

1. A faithful 30-day resolution rate by ticket type cannot be reconstructed from the current database or PostHog schema. Volume by the thread's current tag is available, but zero-merchant-touch, merely-needed-approval, and needed-merchant-input are not retained as historical ticket/episode outcomes.
2. No active organization has `autoExecuteMode = "live"`: **0 of 17 (0%)**. These rows include internal/test organizations; only 3 organizations have non-archived threads created in the last 30 days.
3. Partial refunds do not exist as an agent capability. This is intentional and enforced at the prompt, tool description, and Shopify execution layers. `create_refund` only permits the complete current refundable balance. A partial-refund tool therefore belongs in its own capability PR, as the plan says.
4. Of the three v1 measurement questions delegated to the audit at `2cc9749c`:
   - low-risk Haiku discard rate is currently **not applicable** because the tier is off in both Railway production services;
   - capture-mode read behavior is answered structurally, and production rows show that **2 of 13 (15.4%)** executed customer-support approval turns re-executed at least one read in the last 30 days;
   - real per-model prompt-cache hit rate remains open because it exists only in iteration logs, not durable spend rows, and the accessible current deployment contained no iteration-end samples.

## A.1 — Resolution rate by ticket type

### What production contains

The safe aggregate snapshot was:

| Current thread tag | Threads created in last 30 days | Threads with successful automatic `send_reply` | Threads with a human-approved execution | Threads with an executed escalation |
|---|---:|---:|---:|---:|
| Order Status | 38 | 1 | 2 | 0 |
| General | 15 | 1 | 1 | 0 |
| Support | 8 | 0 | 8 | 0 |
| Product Inquiry | 7 | 0 | 0 | 0 |
| Returns | 2 | 1 | 2 | 1 |
| Canary | 1 | 0 | 0 | 0 |
| **Total** | **71** | **3** | non-additive | non-additive |

This is an inventory snapshot, **not** the requested resolution table:

- The columns are non-exclusive. One thread can contain multiple customer bursts and both an automatic and an approved execution.
- Only 13 of 71 threads have a non-null `requestDisposition`; only 35 of 71 have `classifierSignals`.
- The 71 rows belong to only 3 organizations, and include an explicit `Canary` tag and internal/test activity.
- There were 523 failed automatic `send_reply` action rows across 24 threads and 3 organizations. These failures dominate action volume, so treating action count as customer resolution count would be materially wrong.
- `Thread.tag`, `requestDisposition`, and `classifierSignals` describe the thread's latest state, not a historical plan or customer-burst event. The schema itself calls disposition the newest unanswered burst (`packages/db/prisma/schema.prisma:53-61,486-508`), and inbound persistence overwrites those request fields (`apps/gateway/src/message-handlers/inbound-persistence.ts:239-259`).

### Why the requested columns cannot be recovered faithfully

| Requested field | What exists | Why it is insufficient |
|---|---|---|
| ticket type / volume | `Thread.tag`, `requestDisposition`, `classifierSignals` | Current mutable thread state, not the tag/disposition at each resolved customer episode; coverage is incomplete in the 30-day cohort. |
| resolved with zero merchant touch | `Message.senderType`, `AgentAction.mode`, PostHog `outbound_reply_sent.reply_source` | Both manual and agent-originated outbound messages persist as `SenderType.agent`; `Message` has no reply-source or action foreign key (`schema.prisma:64-69,549-576`; `dispatch-message-common.ts:21-52`). PostHog preserves manual/approved/automatic provenance, but not ticket type or thread/episode identity. |
| escalated | `Thread.escalatedAt`; executed `AgentAction(tool = 'escalate_to_human')` | Executed escalations can be counted, but this alone does not establish resolution or a mutually exclusive ticket outcome. |
| needed approval | current cached plan; `PlanExecution` and `AgentAction.mode = 'human_approved'` after execution | Durable execution rows prove approval was exercised, not every plan that was parked and merely needed approval. Cached plans are current state and are consumed/replaced. |
| needed merchant input | current cached `needs_merchant_input` plan / pending operator question | `ask_operator` plans are deliberately not executed, so they produce no historical `AgentAction`; the question lives in current cached/operator state (`agent-thread-sink.ts:173-178`). Answered or replaced questions are not a 30-day event ledger. |

`closedReason = resolved` is also not a substitute for zero merchant touch: it says why a thread closed, not who performed the work (`schema.prisma:40-50`).

### `autoExecuteMode` result

Among active organization rows:

| active organizations | `autoExecuteMode = live` | fraction live |
|---:|---:|---:|
| 17 | 0 | 0% |

Both Railway services also had `AGENT_PLANNER_TIER_MODE` unset (therefore `off` by `planner-model-tier.ts:39-44`). This does not establish whether every organization is a real merchant, but it does establish that production currently has no organization opted into live mutative auto-execution.

### Decision-rule result

Do **not** apply A.1's WISMO decision rule from this cohort. Order Status is directionally large (38 of 71 current-tag rows), and automatic successes are directionally low (1 thread), but the cohort is small, internal/test-heavy, incomplete on classifier fields, and has no live auto-execute organizations. It is evidence that WISMO deserves measurement, not a valid autonomous-resolution rate.

To make the table measurable, persist one immutable outcome row/event per customer burst or plan with at least:

- `threadId`, `sourceMessageId`/episode identity, classifier version, tag, and disposition at plan time;
- plan classification (`quick_reply`, `needs_review`, `auto_execute`, `needs_merchant_input`, invalid/blocked);
- automatic attempt/result, escalation, approval requested/decided, and merchant-input requested/answered;
- reply provenance (`manual`, `agent_approved`, `agent_automatic`) linked to that same identity;
- terminal resolution and whether any merchant-originated action occurred before it.

Adding that instrumentation is a production-code change and was intentionally not included in this read-only phase.

## A.2 — Partial refund verification

**Answer: missing by design.** There is no agent partial-refund path.

Evidence:

- The `create_refund` registry description says exact full-order refund only and routes partial/item-only requests to escalation (`packages/agent/src/tools/registry/order.ts:115-133`).
- The planner prompt repeats the same explicit decision: partial or item-only refunds must escalate (`packages/agent/src/prompt.ts:165-169`).
- The executor fetches every refundable line item and Shopify's calculated complete refundable transactions (`packages/agent/src/shopify/refunds.ts:167-233`).
- It rejects any requested amount that differs from the complete refundable balance with `amount_mismatch` and states that partial/custom refunds require merchant handling (`packages/agent/src/shopify/refunds.ts:235-243`).
- The submitted Shopify mutation uses `shipping: { fullRefund: true }` and all refund line items/transactions (`packages/agent/src/shopify/refunds.ts:245-255`).
- Existing tests are named and shaped around full refunds (`packages/agent/src/shopify/refunds.test.ts:93,138`; `packages/agent/src/tools/shopify.test.ts:105`).

Therefore the next action is not a remediation edit: specify and implement partial refund as a separate first-class capability PR with item/quantity selection, Shopify-calculated amounts, a dedicated per-refund cap, the existing daily compensation reservation, idempotency/reconciliation, structural over-cap escalation, and eval coverage. Do not relax `create_refund`'s equality check to obtain partial refunds; that would erase the full-refund safety contract rather than add a distinct capability.

## A.3 — Questions delegated to audit `2cc9749c`

### 1. Low-risk Haiku speculative-plan discard rate

**Current answer: no production denominator; feature off.**

The prior audit established that the low-risk Haiku plan is discarded and re-planned on Sonnet when it proposes a mutative action (`2cc9749c:AGENT_AUDIT.md:202-218`). Current code still logs exactly that branch (`packages/agent/src/planner.ts:114-133`). The feature defaults off (`planner-model-tier.ts:39-44`), and direct reads of both Railway production services returned `AGENT_PLANNER_TIER_MODE = null`, which resolves to `off`.

Consequently there are no intended production low-tier attempts and the discard rate is undefined, not 0%. Measure it only during/after an explicit `low_risk_haiku` rollout by counting:

- denominator: plans with the start/tier decision `useLowTier = true`;
- numerator: `[agent:plan] low-tier plan proposed non-trivial work — re-planning on judgment tier`.

### 2. Capture-mode read re-execution

**Behavior answered: yes for customer-support approvals.**

Capture mode executes read blocks during planning and also appends every block, including reads, to `rawToolCalls` (`packages/agent/src/agent-loop.ts:100-125`). On approval, the support path returns the complete approved list; only `dashboard_agent` filters down to action calls (`packages/agent/src/run-approved-actions.ts:15-21`). The prior audit observed both facts, although it described replay as verbatim without isolating the read consequence (`2cc9749c:AGENT_AUDIT.md:100-122,202-216`).

Production aggregate over the last 30 days, excluding `dashboard_agent` and `sms_agent` operator channels:

| executed approved support turns | turns that executed a read | fraction | read action rows |
|---:|---:|---:|---:|
| 13 | 2 | 15.4% | 2 |

The two read actions were one `get_order_by_name` and one `search_shopify_products`. This measures execution-time reads recorded as `human_approved`; it does not count the earlier planning read, which is logged but not persisted as `AgentAction`. The static path proves those approved reads were a second execution.

### 3. Per-model prompt-cache hit rates

**Still genuinely open.**

The audit answered cache eligibility and prompt layout statically: the Sonnet planner prefix is large enough to cache, while the composer-ask and voice-synthesis markers were estimated below their model minimums (`2cc9749c:AGENT_AUDIT.md:384-415`). It explicitly left the real production hit ratio to runtime measurement (`2cc9749c:AGENT_AUDIT.md:1151-1166`).

The necessary fields already exist on `[agent] iteration end`: model plus `usage.cacheReadInputTokens` (`2cc9749c:AGENT_AUDIT.md:951-971`). They are not retained in `llm_daily_spend`; that table stores only total priced spend and call count per org/day/model (`packages/db/prisma/schema.prisma:272-286`). Current Railway deployment logs had no iteration-end samples, and removed deployments' logs were not available through the CLI, so no defensible 30-day rate could be calculated.

Required aggregation when log retention is available:

```text
group [agent] iteration end by model
hit  := usage.cacheReadInputTokens > 0
miss := usage.cacheReadInputTokens = 0
report calls, hits, misses, hit_rate, and cache-read tokens
```

Keep classifier calls separate: they carry no cache marker and are not planner cache misses.

## Commands and query method

Repository evidence:

```bash
git show 2cc9749c:AGENT_AUDIT.md
rg -n "autoExecuteMode|requestDisposition|classifierSignals|create_refund|partial refund|cacheReadInputTokens" apps packages docs
```

Deployment and non-secret rollout state:

```bash
railway status
railway run --service shopkeeper --environment production -- node -e '<print only AGENT_PLANNER_TIER_MODE>'
railway run --service "Gateway Worker" --environment production -- node -e '<print only AGENT_PLANNER_TIER_MODE>'
```

Production database work used `railway run --service shopkeeper --environment production -- node ...` with `@shopkeeper/db` and aggregate-only SQL. The query shapes were:

```sql
SELECT count(*) AS total,
       count(*) FILTER (WHERE settings->>'autoExecuteMode' = 'live') AS live
FROM organizations
WHERE lifecycle_status = 'active';

SELECT coalesce(tag, '(null)') AS tag,
       request_disposition,
       count(*) AS volume
FROM threads
WHERE created_at >= now() - interval '30 days'
  AND deleted_at IS NULL
  AND archived_at IS NULL
GROUP BY 1, 2;

-- The report's directional tag table used correlated EXISTS checks over
-- agent_actions for successful automatic send_reply, human_approved mode,
-- and executed escalation. These are deliberately reported as non-exclusive.

SELECT count(DISTINCT a.turn_id) AS approved_support_turns,
       count(DISTINCT a.turn_id) FILTER (WHERE a.category = 'read')
         AS support_turns_reexecuting_reads,
       count(*) FILTER (WHERE a.category = 'read') AS read_actions
FROM agent_actions a
JOIN threads t ON t.id = a.thread_id
WHERE a.executed_at >= now() - interval '30 days'
  AND a.mode = 'human_approved'
  AND t.channel_type NOT IN ('dashboard_agent', 'sms_agent');
```

Log inspection attempted:

```bash
railway logs --service "Gateway Worker" --environment production \
  --since 30d --filter 'iteration' --json
```

The current deployment returned no matching iteration rows. Deployment listing confirmed frequent replacement deployments; removed deployments did not return usable historical iteration logs.

## Phase A acceptance

- [x] One report under `docs/`.
- [x] No production code changed.
- [x] A.2 answered conclusively.
- [x] Prior-audit questions separated into answered, not-applicable, and genuinely open.
- [ ] A.1 resolution-rate table populated. Blocked on absent immutable plan/episode outcome and merchant-touch attribution, not on query access.
