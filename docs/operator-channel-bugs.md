# Operator Channel Bugs (Telegram / shared operator path)

Bugs discovered during iMessage Phase 1 dogfood (2026-07-07). These affect the
**operator channel** — Telegram today, and iMessage where it reuses the same
handlers — not the iMessage transport layer (Spectrum webhook, bind flow, gRPC
send). Track and fix here before beta.

Last updated: 2026-07-07.

**Related docs:** [imessage-production-readiness-plan.md](imessage-production-readiness-plan.md)
(iMessage-specific work only), [channel-roles.md](channel-roles.md).

---

## Summary

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 1 | Plan notification retries duplicate Telegram sends | High | Open |
| 2 | `skip N` drops Shopify action but not `send_reply` copy | High | Fixed 2026-07-07 — `refreshTerminalSendAfterSkip` |
| 3 | Free-form ignores `pendingPlan`; uses stale `lastThreadId` | High | Open |
| 4 | `lastThreadId` not set when parking `pendingPlan` | Medium | Open |
| 5 | Natural-language skip not parsed (`skip step 2` → free-form) | Medium | Open |
| 6 | Plan push copy omits `skip N` syntax | Low | Open |
| 7 | Dashboard `send_reply` hop returned HTTP 500 | Medium | Open (investigate) |

---

## 1. Plan notification retries duplicate Telegram sends

**Severity:** High  
**Observed:** 2026-07-07 dogfood (org `10c25c34-7a92-4963-b9cd-537ef893f6c0`)

### Symptom

Merchant receives the **same plan notification 3× on Telegram** after a single
customer email opens a ticket.

### Root cause

1. `sendOperatorPlanNotification` fans out to every bound operator channel with
   `policy: 'critical'` ([`planning-notifications.ts`](../apps/gateway/src/message-handlers/planning-notifications.ts)).
2. Bindings are ordered **Telegram first**, then iMessage
   ([`operator-notify.ts`](../apps/gateway/src/operator-notify.ts) `listOperatorBindings`).
3. Telegram send succeeds; iMessage proactive send fails (`ECONNRESET` on gRPC).
4. `notifyOperator` throws → AISummary job fails → **BullMQ retries** (3 attempts).
5. Each retry re-sends to Telegram before failing again on iMessage.

### Impact

- Operator spam on the channel that succeeded.
- AISummary job marked failed even though one channel delivered.
- `pendingPlan` context updated on Telegram; iMessage operator never sees the plan.

### Suggested fix

- **Fan-out partial success:** fail the job only if **no** channel delivered; log
  per-channel failures.
- **Idempotent plan notify:** stable `clientGuid` / dedupe key per
  `(orgId, threadId, planHash)` so retries do not re-text (Phase 3 item in
  iMessage plan — applies to all operator channels).
- Optional: unlink secondary channels during single-channel testing.

### Code pointers

- [`apps/gateway/src/operator-notify.ts`](../apps/gateway/src/operator-notify.ts) — `notifyOperator`, critical policy
- [`apps/gateway/src/message-handlers/planning-notifications.ts`](../apps/gateway/src/message-handlers/planning-notifications.ts) — `sendOperatorPlanNotification`
- [`apps/gateway/src/workers/ai-summary.ts`](../apps/gateway/src/workers/ai-summary.ts) — job retry on throw

---

## 2. `skip N` executes correct Shopify actions but customer email mentions skipped steps

**Severity:** High  
**Observed:** 2026-07-07 — merchant replied `skip 2` on a multi-step plan; Shopify
mutation was correct (item **not** added), but the customer email mentioned both
the address change **and** adding the item.

**Status:** Fixed 2026-07-07 — `skip N` now re-drafts `send_reply` / `send_email`
via `refreshTerminalSendAfterSkip` before approved execution.

### Symptom

- Operator receives a summary like “sending email to customer” (last tool result).
- Shopify side reflects only the **remaining** approved actions.
- Outbound `send_reply` / `send_email` text still describes **skipped** actions.

### Root cause

`handlePendingPlanCommand` removes the skipped **mutative** tool call by id but
keeps the rest of `rawToolCalls` unchanged, including a pre-drafted terminal
`send_reply` whose `input.text` was generated for the **full** plan
([`pending-plan-commands.ts`](../apps/gateway/src/routes/telegram/pending-plan-commands.ts)).

Typical plan shape:

1. `get_shopify_orders` (read — retained on skip)
2. `add_line_item` / similar (actionable — **removed** by `skip 2`)
3. `update_shopify_order_address` (actionable — retained)
4. `send_reply` (actionable — retained with **original** copy covering steps 2 + 3)

Approved execution runs the filtered tool list verbatim
([`packages/agent/src/run.ts`](../packages/agent/src/run.ts)); there is no
re-draft of `send_reply` after a skip.

### Impact

Customer receives misleading email content. Merchant trust erodes even when
backend actions are correct.

### Suggested fix

~~After computing `approvedToolCalls` post-skip:~~ **Implemented:** gateway
[`skipped-plan-terminal-send.ts`](../apps/gateway/src/message-handlers/skipped-plan-terminal-send.ts)
calls agent [`planner-skip-reply.ts`](../packages/agent/src/planner-skip-reply.ts)
`refreshTerminalSendAfterSkip` to re-draft terminal send copy for remaining steps.

### Code pointers

- [`apps/gateway/src/routes/telegram/pending-plan-commands.ts`](../apps/gateway/src/routes/telegram/pending-plan-commands.ts) — skip filters `rawToolCalls`
- [`packages/agent/src/planner-skip-reply.ts`](../packages/agent/src/planner-skip-reply.ts) — skip reply redraft
- [`apps/gateway/src/message-handlers/skipped-plan-terminal-send.ts`](../apps/gateway/src/message-handlers/skipped-plan-terminal-send.ts) — gateway wrapper
- [`packages/agent/src/run.ts`](../packages/agent/src/run.ts) — approved tool execution path

### Reproduction

1. Trigger a ticket whose cached plan has **2+ actionable mutative steps** plus a
   terminal `send_reply`.
2. On operator channel, reply exactly `skip 2` (or appropriate index).
3. Compare Shopify mutations vs text in the outbound customer message.

---

## 3. Free-form ignores `pendingPlan`; routes to stale `lastThreadId`

**Severity:** High  
**Observed:** 2026-07-07 — merchant texted “skip step 2 and proceed with the
address change” on Telegram; agent ran on an **unrelated** email thread and hit
token budget (“too many steps”).

### Symptom

- Log: `[Operator] Free-form agent instruction` with `orderNumber: null`.
- Agent operates on `threadId` from `context.lastThreadId`, not the ticket in
  `pendingPlan`.
- Risk of wrong-thread `send_reply` (observed `send_reply` hop 500 in one run;
  wrong-thread attempt either way).

### Root cause

Message routing in [`telegram/message-handler.ts`](../apps/gateway/src/routes/telegram/message-handler.ts):

1. Only exact `yes` / `no` / `skip N` match `handlePendingPlanCommand`.
2. Everything else falls through to `executeFreeFormInstruction`.
3. Free-form passes `context.lastThreadId`, **not** `context.pendingPlan.threadId`
   ([`agent-execution.ts`](../apps/gateway/src/routes/telegram/agent-execution.ts)).

`pendingPlan` can be set while `lastThreadId` still points at an older ticket.

### Impact

Wrong-ticket agent turns; possible erroneous customer outreach; operator confusion
when a plan is clearly pending.

### Suggested fix

When `context.pendingPlan` is set and the message is not a recognized plan
command:

- **Reject** with “Reply `yes`, `no`, or `skip N` for the pending plan”, **or**
- Route free-form to `pendingPlan.threadId` with explicit intent (riskier).

Always set `lastThreadId` when parking `pendingPlan` (see #4).

### Code pointers

- [`apps/gateway/src/routes/telegram/message-handler.ts`](../apps/gateway/src/routes/telegram/message-handler.ts)
- [`apps/gateway/src/routes/telegram/agent-execution.ts`](../apps/gateway/src/routes/telegram/agent-execution.ts)
- [`apps/gateway/src/routes/imessage/message-handler.ts`](../apps/gateway/src/routes/imessage/message-handler.ts) — same routing (shared handlers)

---

## 4. `lastThreadId` not set when parking `pendingPlan`

**Severity:** Medium  
**Observed:** 2026-07-07 (contributes to #3)

### Symptom

After a plan push, `pendingPlan.threadId` is correct but `lastThreadId` may still
reference a prior ticket.

### Root cause

`sendOperatorPlanNotification` patches context with only `pendingPlan`, not
`lastThreadId` ([`planning-notifications.ts`](../apps/gateway/src/message-handlers/planning-notifications.ts)).
`lastThreadId` is updated only after plan **approval** completes
([`pending-plan-commands.ts`](../apps/gateway/src/routes/telegram/pending-plan-commands.ts)).

### Suggested fix

Include `lastThreadId: threadId` in the `notifyOperator` context patch for plan
(and question) notifications.

---

## 5. Natural-language skip not parsed

**Severity:** Medium  
**Observed:** 2026-07-07

### Symptom

`skip step 2 and proceed with the address change` is treated as free-form, not
`plan-skip`.

### Root cause

[`command-parser.ts`](../apps/gateway/src/routes/telegram/command-parser.ts) only
accepts `^skip\s+(\d+)$` (e.g. `skip 2`). No variants (`skip step 2`, etc.).

### Suggested fix

- Expand parser for common variants, **or**
- Document exact syntax in plan footer and HELP (see #6) and reject ambiguous text
  when `pendingPlan` is set (#3).

---

## 6. Plan push copy omits `skip N` syntax

**Severity:** Low  
**Observed:** 2026-07-07

### Symptom

Plan notification ends with “Reply yes to go ahead or no to skip.” — no mention
of `skip 1`, `skip 2`, etc., despite Phase 1 checklist requiring skip support.

### Root cause

[`formatPlanMessage`](../apps/gateway/src/message-handlers/planning-notifications.ts)
and [`HELP_TEXT`](../apps/gateway/src/routes/telegram/format.ts) do not document
skip commands.

### Suggested fix

Add footer: `yes · no · skip 1` (and dashboard deep link per Phase 4 UX plan).

---

## 7. Dashboard `send_reply` internal hop returned HTTP 500

**Severity:** Medium (transient vs systemic — TBD)  
**Observed:** 2026-07-07 free-form operator turn on thread `3867acd3-…`

### Symptom

```
[agent-sink] dashboard send hop failed
  op: "send_reply"
  status: 500
  threadId: "3867acd3-3d06-4688-92b7-ccc908528443"
```

Agent continued, hit token budget, returned “too many steps” to operator.

### Root cause

Gateway worker `ThreadSink` posts to dashboard `/api/agent/io-send-internal`
([`agent-thread-sink.ts`](../apps/gateway/src/message-handlers/agent-thread-sink.ts)).
500 indicates dashboard-side failure; exact cause not captured in gateway logs
(body redacted).

### Suggested fix

- Pull dashboard/Vercel logs for the matching request window.
- Ensure gateway logs include a correlation id for cross-service triage.
- Operator path should surface send failures clearly to merchant (not token-budget
  generic message).

---

## Operator command reference (current behavior)

Exact strings only unless noted:

| Command | Effect |
|---------|--------|
| `yes` / `run` | Execute full `pendingPlan` |
| `no` / `dismiss` | Clear `pendingPlan` |
| `skip N` | Drop Nth **actionable** step (1-based; read tools don't count) |
| `SUMMARY` | Inbox digest |
| `#1234` | Order lookup |
| Anything else | Free-form agent turn on `lastThreadId` |

**Skip index:** `skip 1` drops the first actionable (non-read) tool in
`rawToolCalls` order. See
[`webhooks-telegram-plan-digest.test.ts`](../apps/gateway/src/routes/webhooks-telegram-plan-digest.test.ts)
`"skip 1" drops the first actionable tool call`.

---

## Suggested fix order

1. ~~**#2** — Skipped-step email copy wrong (customer-facing correctness).~~ Done.
2. **#1** — Retry duplicate notifications (operator spam + job failure).
3. **#3 + #4** — Pending-plan / thread routing (wrong-ticket safety).
4. **#5 + #6** — Parser + copy (operator UX).
5. **#7** — Investigate dashboard 500 with correlated logs.

---

## Test gaps

- No integration test: `skip N` with terminal `send_reply` whose text covers
  skipped actions (expect re-draft or aligned copy).
- No test: multi-binding fan-out partial success / retry idempotency.
- No test: free-form with active `pendingPlan` + stale `lastThreadId`.
