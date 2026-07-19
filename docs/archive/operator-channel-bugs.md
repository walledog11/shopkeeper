# Operator Channel Bugs (Telegram / shared operator path)

Bugs discovered during iMessage Phase 1 dogfood (2026-07-07). These affect the
**operator channel** — Telegram today, and iMessage where it reuses the same
handlers — not the iMessage transport layer (Spectrum webhook, bind flow, gRPC
send). Track and fix here before beta.

Last updated: 2026-07-08.

**Related docs:** [imessage-production-readiness-plan.md](imessage-production-readiness-plan.md)
(iMessage-specific work only), [channel-roles.md](../channel-roles.md).

---

## Summary

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 1 | Plan notification retries duplicate Telegram sends | High | Fixed 2026-07-08 — partial fan-out + per-channel idempotency (Phase 3) |
| 2 | `skip N` customer email copy mentions skipped steps | High | Fixed 2026-07-07 — `refreshTerminalSendAfterSkip` |
| 8 | `skip N` — Shopify ok, `send_reply` logs success, customer gets no email | High | Resolved 2026-07-09 — Gmail collapsed duplicate sender; email delivered |
| 3 | Free-form ignores `pendingPlan`; uses stale `lastThreadId` | High | Open |
| 4 | `lastThreadId` not set when parking `pendingPlan` | Medium | Open |
| 5 | Natural-language skip not parsed (`skip step 2` → free-form) | Medium | Open |
| 6 | Plan push copy omits `skip N` syntax | Low | Open |
| 7 | Dashboard `send_reply` hop returned HTTP 500 | Medium | Open (investigate) |

---

## 1. Plan notification retries duplicate Telegram sends

**Severity:** High  
**Observed:** 2026-07-07 dogfood (org `10c25c34-7a92-4963-b9cd-537ef893f6c0`)  
**Status:** Fixed 2026-07-08 (iMessage Phase 3 — applies to all operator channels).

### Symptom

Merchant receives the **same plan notification 3× on Telegram** after a single
customer email opens a ticket.

### Root cause

1. `sendOperatorPlanNotification` fans out to every bound operator channel with
   `policy: 'critical'` ([`planning-notifications.ts`](../../apps/gateway/src/message-handlers/planning-notifications.ts)).
2. Bindings are ordered **Telegram first**, then iMessage
   ([`operator-notify.ts`](../../apps/gateway/src/operator-notify.ts) `listOperatorBindings`).
3. Telegram send succeeds; iMessage proactive send fails (`ECONNRESET` on gRPC).
4. `notifyOperator` throws → AISummary job fails → **BullMQ retries** (3 attempts).
5. Each retry re-sends to Telegram before failing again on iMessage.

### Fix (shipped)

- **`notifyCriticalToAllOperators`** — job fails only when **no** channel delivers;
  per-channel failures are logged and the loop continues.
- **Redis idempotency keys** per `(channel, contextKey, planHash)` in
  [`operator-notify-idempotency.ts`](../../apps/gateway/src/operator-notify-idempotency.ts) —
  BullMQ retries skip channels already marked delivered.
- Covered by [`planning-notifications.test.ts`](../../apps/gateway/src/message-handlers/planning-notifications.test.ts)
  and [`operator-notify.test.ts`](../../apps/gateway/src/operator-notify.test.ts).

### Impact (before fix)

- Operator spam on the channel that succeeded.
- AISummary job marked failed even though one channel delivered.
- `pendingPlan` context updated on Telegram; iMessage operator never sees the plan.

### Code pointers

- [`apps/gateway/src/operator-notify.ts`](../../apps/gateway/src/operator-notify.ts) — `notifyOperator`, critical policy
- [`apps/gateway/src/message-handlers/planning-notifications.ts`](../../apps/gateway/src/message-handlers/planning-notifications.ts) — `sendOperatorPlanNotification`, `notifyCriticalToAllOperators`
- [`apps/gateway/src/workers/ai-summary.ts`](../../apps/gateway/src/workers/ai-summary.ts) — job retry on throw

---

## 2. `skip N` customer email copy mentions skipped steps

**Severity:** High  
**Observed:** 2026-07-07 — merchant replied `skip 2` on a multi-step plan; Shopify
mutation was correct (item **not** added), but the customer email mentioned both
the address change **and** adding the item.

**Status:** Fixed 2026-07-07 — `skip N` now re-drafts `send_reply` / `send_email`
via `refreshTerminalSendAfterSkip` before approved execution. Re-test confirmed
redraft works (`[agent:plan] skip reply redrafted`).

### Symptom (original)

- Shopify side reflects only the **remaining** approved actions.
- Outbound `send_reply` text still described **skipped** actions.

### Fix

Gateway [`skipped-plan-terminal-send.ts`](../../apps/gateway/src/message-handlers/skipped-plan-terminal-send.ts)
calls agent [`planner-skip-reply.ts`](../../packages/agent/src/planner-skip-reply.ts)
`refreshTerminalSendAfterSkip`.

### Code pointers

- [`apps/gateway/src/routes/telegram/pending-plan-commands.ts`](../../apps/gateway/src/routes/telegram/pending-plan-commands.ts)
- [`packages/agent/src/planner-skip-reply.ts`](../../packages/agent/src/planner-skip-reply.ts)
- [`apps/gateway/src/message-handlers/skipped-plan-terminal-send.ts`](../../apps/gateway/src/message-handlers/skipped-plan-terminal-send.ts)

---

## 8. `skip N` — Shopify succeeds, `send_reply` reports success, customer receives nothing

**Severity:** High  
**Observed:** 2026-07-07 re-test (post-`e634e48` deploy) — org
`10c25c34-7a92-4963-b9cd-537ef893f6c0`, thread `8476f160-0580-4082-a610-9454d7c2ba0e`,
iMessage operator `+19096622741`.

**Status:** Resolved 2026-07-09 — email was delivered; Gmail hid it because two
emails from the same sender arrived in a short window (Gmail conversation
collapse / threading behavior). Not a Shopkeeper send failure.

### Symptom (original)

- Plan delivered on **iMessage**; merchant replied `skip 2`.
- **Shopify** address update completed correctly (skipped step not executed).
- Gateway logs show **`send_reply` success** and `outcome: "approved_plan_actions"`.
- **Customer appeared to receive no email reply** (later found in Gmail, collapsed).

### Log evidence

```
[agent:plan] skip reply redrafted
  terminalToolName: "send_reply"
  remainingStepCount: 1

[Operator] Approving plan
  toolCallCount: 2

[agent] tool call  update_shopify_order_address  → success
[agent] tool call  send_reply  inputChars: 161  → success, resultChars: 33

[agent] run complete
  outcome: "approved_plan_actions"
  executedToolCalls: ["update_shopify_order_address", "send_reply"]
```

Concurrent (likely unrelated): `[Webhook] Shopify signature mismatch — rejecting.`
×2 during the `send_reply` window.

### Resolution

- **Email was sent** — provider delivery succeeded on the sync path.
- **NULL `send_status`** on the agent message row is expected when
  `OUTBOUND_EMAIL_ASYNC` is off (sync send); dashboard shows timestamp only, not
  a delivery failure.
- **Gmail app** hid the second outbound because two emails from the same sender
  arrived close together — merchant/customer had to expand the thread to see it.
- **No code change required** for this incident; skip redraft (#2) and approved
  execution behaved correctly.

### Follow-up (optional product hardening)

- Surface `pending` / `failed` send status when async outbound is enabled.
- Integration test: `skip N` → execute → assert outbound message row exists with
  redrafted copy (not just `toolOk` with 33-char ack).

### Code pointers

- [`apps/dashboard/src/lib/agent/tools/thread.ts`](../../apps/dashboard/src/lib/agent/tools/thread.ts) — `sendReply`
- [`apps/dashboard/src/lib/messaging/email-dispatch.ts`](../../apps/dashboard/src/lib/messaging/email-dispatch.ts) — async queue
- [`apps/gateway/src/message-handlers/agent-thread-sink.ts`](../../apps/gateway/src/message-handlers/agent-thread-sink.ts) — hop, no delivery verify
- [`packages/agent/src/order-status-fast-path.ts`](../../packages/agent/src/order-status-fast-path.ts) — operator summary = last tool result

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

Message routing in [`telegram/message-handler.ts`](../../apps/gateway/src/routes/telegram/message-handler.ts):

1. Only exact `yes` / `no` / `skip N` match `handlePendingPlanCommand`.
2. Everything else falls through to `executeFreeFormInstruction`.
3. Free-form passes `context.lastThreadId`, **not** `context.pendingPlan.threadId`
   ([`agent-execution.ts`](../../apps/gateway/src/routes/telegram/agent-execution.ts)).

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

- [`apps/gateway/src/routes/telegram/message-handler.ts`](../../apps/gateway/src/routes/telegram/message-handler.ts)
- [`apps/gateway/src/routes/telegram/agent-execution.ts`](../../apps/gateway/src/routes/telegram/agent-execution.ts)
- [`apps/gateway/src/routes/imessage/message-handler.ts`](../../apps/gateway/src/routes/imessage/message-handler.ts) — same routing (shared handlers)

---

## 4. `lastThreadId` not set when parking `pendingPlan`

**Severity:** Medium  
**Observed:** 2026-07-07 (contributes to #3)

### Symptom

After a plan push, `pendingPlan.threadId` is correct but `lastThreadId` may still
reference a prior ticket.

### Root cause

`sendOperatorPlanNotification` patches context with only `pendingPlan`, not
`lastThreadId` ([`planning-notifications.ts`](../../apps/gateway/src/message-handlers/planning-notifications.ts)).
`lastThreadId` is updated only after plan **approval** completes
([`pending-plan-commands.ts`](../../apps/gateway/src/routes/telegram/pending-plan-commands.ts)).

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

[`command-parser.ts`](../../apps/gateway/src/routes/telegram/command-parser.ts) only
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

[`formatPlanMessage`](../../apps/gateway/src/message-handlers/planning-notifications.ts)
and [`HELP_TEXT`](../../apps/gateway/src/routes/telegram/format.ts) do not document
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
([`agent-thread-sink.ts`](../../apps/gateway/src/message-handlers/agent-thread-sink.ts)).
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
[`webhooks-telegram-plan-digest.test.ts`](../../apps/gateway/src/routes/webhooks-telegram-plan-digest.test.ts)
`"skip 1" drops the first actionable tool call`.

---

## Suggested fix order

1. **#1** — Retry duplicate notifications (operator spam + job failure).
2. **#3 + #4** — Pending-plan / thread routing (wrong-ticket safety).
3. **#5 + #6** — Parser + copy (operator UX).
4. **#7** — Investigate dashboard 500 / async outbound failures with correlated logs.

~~**#2** copy mismatch — fixed via redraft.~~  
~~**#8** apparent non-delivery after skip — resolved; Gmail collapsed duplicate sender.~~

---

## Test gaps

- No integration test: `skip N` end-to-end — redraft copy **and** outbound message
  reaches `sent` / provider (not just `toolOk` with 33-char ack).
- No test: multi-binding fan-out partial success / retry idempotency.
- No test: free-form with active `pendingPlan` + stale `lastThreadId`.
- No test: async email queue failure after operator `yes` / `skip N` approve.
