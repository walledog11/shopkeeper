# Concierge / Operator Unification Plan

Last reviewed: 2026-08-06. Status: **Phases 1–3 landed.**

Collapses the dashboard Concierge onto the gateway operator path. The Concierge
is not deleted — it stops being a second, weaker implementation of machinery the
operator channel already solved.

## Why

Three findings, all read off current code:

1. **The Concierge is the least capable agent surface.** `/api/agent/chat` passes
   no `moduleTools`. The Telegram path (`routes/telegram/agent-execution.ts:25`)
   gets `list_active_tickets`, `get_ticket`, `mark_ticket_spam`,
   `send_ticket_reply`, `approve/reject/revise_pending_plan`, and
   `answer_operator_question`. The merchant's phone can triage the inbox and clear
   pending plans; the panel docked beside the inbox cannot. `prompt.ts:299` says
   so in a comment: *"the dashboard Concierge has neither."*

2. **There are two approval ledgers.** `lib/agent/api/dashboard-approval.ts` (516
   lines) is a regex-owned approve/dismiss/revise path — the design the operator
   channel deliberately moved off in the 2026-07 conversational plan
   (model-owned interpretation via control tools, regex kept only as a fast path).
   The dashboard never got that migration. Its defects follow directly:
   - `DASHBOARD_APPROVAL_DISMISS_SUMMARY` is hardcoded to `"No problem. I won't
     create the order."` (`:32`) — dismiss a *refund* plan and it says that.
   - `buildDashboardApprovalSummary` (`:222`) hand-renders `create_shopify_order`
     only; refunds, cancellations, fulfillments and order edits fall to a flat
     `"I can run this action: …"` despite being higher-stakes.
   - `APPROVAL_RE` (`:27`) is a closed alternation. "sure", "ok", "yep do it",
     "sounds good" all miss and are classified `revise`, triggering a full replan
     — an extra model call, and it reads as broken.

3. **Operator memory is keyed to the transport, not the person.**
   `resolveOperatorThread` keys on `operatorKey` = `telegram:<chatId>` /
   `imessage:<senderId>` (`packages/agent/src/internal-thread.ts:22`), and
   `OperatorContext` is unique on `(organizationId, chatId)`
   (`schema.prisma:444`). A merchant with both transports bound therefore has
   **two operator threads, two memories, and two pending-plan ledgers.** Mirroring
   hides it — plans push to every bound channel — but approving on one leaves the
   other showing the plan as pending. The dashboard is a third orphan, and
   `createDashboardAgentSession` (`sessions.ts:95`) makes it worse by closing the
   previous thread on every new session, so the desk agent has no memory at all.

This is not primarily a Concierge problem. It is a keying and duplication problem
that the Concierge makes visible.

## Product framing

The panel stops being *a place to compose instructions* and becomes *the desk view
of one operator relationship*. Text an approval from the couch, open the laptop,
and the same conversation, same pending queue, and same ledger are there —
rendered richer. Continuity is a reason to open the panel; an empty composer is
not. This is consistent with the vision's framing of the dashboard as the setup
and review surface rather than the daily driver.

## Phases

### Phase 1 — one operator turn path (the whole LOC prize, lowest risk) — **done**

Moved Concierge turn execution to the gateway and deleted the dashboard's private
approval ledger.

- `POST /internal/operator/turn` on `apps/gateway/src/routes/internal-operator.ts`,
  alongside the escalate handler and behind the same `authorizeInternalRequest`.
  It maps `SpendCapError` → 429 and sub-500 `ApiError`s → their own status so the
  dashboard can pass a reached gateway's answer through verbatim.
- `message-handlers/operator-free-form-turn.ts` holds the transport-agnostic turn
  (ledger + `moduleTools` + `executeOperatorAgentTurn`);
  `executeFreeFormInstruction` is now the messaging-transport wrapper that
  delivers the summary as a message. `moduleTools` reach the Concierge for free.
- `/api/agent/chat/route.ts` is a thin hop: Clerk auth, billing gate, rate limit,
  validate, resolve the session thread, POST to the gateway, map errors.
- `executeOperatorAgentTurn` takes an optional pre-resolved `threadId`, re-checked
  against the org through `resolveInternalAgentThread`. The dashboard passes its
  session thread; messaging transports still resolve the durable operator thread
  from the binding key.
- `dashboard-approval.ts` and its test are gone, and `lib/agent/api/execution.ts`
  went with them — the Concierge was its last caller.

Two consequences worth naming:

- **The Concierge no longer plans-then-asks before a mutation it was told to
  make.** "Refund order 1234" typed into the panel now executes under the same
  policy caps as the same words texted from the phone. That is the point of the
  unification — one behavior — but it is a real change in what the panel does.
- **The Approve button stays inert until Phase 2.** `notifyOperator` fans parked
  plans out per Telegram/iMessage binding, so `dashboard:<clerkUserId>` receives
  none and the Concierge's ledger reads "nothing pending". Wiring the button to
  `executeOperatorApprovedCachedPlan` needs the shared pending queue, which is the
  re-keying in Phase 2.

No schema change. No shared-registry change. The support planner is untouched, so
**no eval gate**; per the standing invariant, operator behavior is verified by
live round-trip.

### Phase 2 — key the operator thread to the person — **done**

The operator key is now `member:<orgMemberId>`. One person, one durable thread,
one pending queue, whatever they text from.

- `resolveOperatorThread` takes that key; `memberOperatorKey()` builds it and
  `resolveOperatorMemberKey()` (gateway) resolves Clerk user → `OrgMember`,
  upserting so a merchant can use the Concierge before binding a phone. Every
  transport calls it once at the top of its turn. The customer upsert moved after
  the thread lookup so a re-keyed thread stops minting a stray customer per turn,
  and the pre-Phase-B legacy-adoption branch is gone — the backfill covers it.
- `OperatorContext.chatId` → `memberKey` (`member_key`), unique
  `(organizationId, memberKey)`.
- **Delivery key and state key are now separate concepts.** `notifyOperator`
  sends and dedupes per *device* (`bindingDeliveryKey`) but persists per *person*,
  so both of a merchant's bound transports show the same card and either can
  resolve it. `OperatorNotificationExclude` carries a `deliveryKey`, so answering
  on the phone still pushes the re-draft to iMessage but not back to that chat.
- Migration `20260806000000_key_operator_state_to_member` renames the column and
  runs a per-member backfill: elect the most recently active operator thread, fold
  the siblings' messages into it, archive them, re-key the winner, then merge every
  ledger row (queues deduped by ticket thread, newest wins; legacy single slots
  folded in; the orphan `dashboard:<clerkUserId>` row absorbed).
- The dashboard session concept is deleted — `lib/agent/api/sessions.ts`,
  `api/agent/sessions/[id]/`, and the session plumbing in `agent-chat-session.ts`.
  `POST /api/agent/chat` takes `{ instruction }` and nothing else; a new `GET`
  returns the operator thread's tail so the panel opens on the conversation the
  merchant's phone is having. "Start fresh" clears the panel and only the panel.
- `DASHBOARD_OPERATOR_INSTRUCTIONS` is gone. Every operator turn now gets the
  ledger, the control tools, and the operator untrusted-content guardrails.
- The Approve button is live: `/internal/operator/turn` returns `awaitingApproval`
  off the post-turn queue, so the panel offers the affordance instead of guessing.

Two things deliberately left alone:

- **The `dashboard_agent` enum value stays.** Nothing writes it any more, but
  production rows reference it and a Postgres enum value cannot be dropped while
  they do. The display mappings stay so that history still renders.
- **Audit rows keep their original thread.** The backfill moves messages but not
  `AgentAction` / `PlanExecution` rows — those record where the work actually
  happened.

No eval gate: the support planner is untouched. Operator behavior wants a live
phone round-trip per the standing invariant, and specifically the case this phase
exists for — park a plan from a ticket, approve it on the laptop, confirm the
Telegram card stops being actionable (and the reverse).

Deploy order matters: the migration must run before the new app build, since the
code reads `member_key`.

### Phase 3 — interaction design — **done**

- **The panel leads with the ledger.** `AgentPanelPendingLedger` renders the
  merchant's pending queue above the transcript and the briefing, polling
  `GET /api/agent/pending` every 10s — so a plan approved on the phone stops being
  offered on an already-open panel, which is the read side the Phase 2 tradeoff
  note left open. `getOperatorPendingPlans` reads the per-person queue directly and
  filters entries whose `PlanExecution` already reached a terminal status, without
  mutating the row (resolving it stays the gateway's job on the next turn).
- **Approve and Dismiss are deterministic.** `POST /internal/operator/plan-decision`
  runs the same `runApprovedPendingPlan` / `clearPendingPlan` the control tools
  run, with no model call — the desk's equivalent of the messaging channels'
  keyword fast path, and a correction to Phase 2's Approve button, which sent
  `"Yes, do it"` as a model turn. Plans are addressed by `planId`, so a stale panel
  gets a 409 instead of acting on whatever now sits in that queue slot. Note this
  path resolves the *operator queue* entry across devices, which
  `/api/agent/quick-approve` (the walkthrough card's route) does not.
- **Channel-aware plan rendering.** The turn already knows the surface —
  `deliveryRef` is absent exactly on the dashboard — so `renderOperatorLedger`
  takes `'desk' | 'messaging'` and names the affordance the merchant actually has.
  `formatOperatorDraftSummary` follows. The one `"reply yes"` example in
  `prompt.ts`'s operator control-tool instructions is now surface-neutral and defers
  to the pending-state section.
- **The walkthrough left the message stream.** `appendAgentLine` is gone from
  `useAgentChatState`; the hook derives its opening and closing from where the list
  stands and keeps decision notes in its own state, rendered by `WalkthroughNote`
  inside the walkthrough region. Two effects and their `openedRef`/`closedRef`
  double-fire guards went with it — they existed only because the transcript is
  append-only.
- **`⌘K` instructs.** Typing a known intent offers an "Ask {agent}: …" row that
  opens the panel with the text seeded in the composer, unsent. Deliberately not
  auto-sent: since Phase 1 the panel executes mutations under policy caps without
  planning first, and "refund 1234" from a palette should still be the merchant's
  send to make.

No eval gate — the support planner is untouched. Live round-trip to run: park a
plan from a ticket, approve it in the panel's ledger, and confirm the Telegram card
stops being actionable; then the reverse, with the panel left open.

## Line-count accounting

Measured against current `wc -l`, with added code estimated.

| | Removed | Added | Net |
|---|---|---|---|
| Phase 1 | 1,181 | ~290 | **−891** |
| Phase 2 | 863 | 612 | **−251** |
| Phase 3 | ~130 | ~130 | ~0 |
| **Total** | **~2,174** | **~1,032** | **≈ −1,142** |

Phases 1 and 2 measured together came to 2,044 removed against 902 added
(**−1,142**) across `apps/` and `packages/`. Phase 2 beat its ~0 estimate mainly
because deleting the session concept took more with it than the plan credited —
the route, its test, the transcript endpoint, and the localStorage/stale-session
retry machinery in the client. Its 612 added includes the 190-line throwaway
backfill migration, so steady state is nearer **−1,330**.

Phase 1 detail — deleted outright: `dashboard-approval.ts` (516) and its test
(306). Shrunk: `api/agent/chat/route.ts` 212 → ~55, `route.test.ts` 322 → ~120
(its approval-branch cases move onto the gateway's existing operator tests).
Added: gateway turn endpoint ~70, shared free-form extraction ~40, dashboard
gateway client ~60, tests ~120.

Three honest caveats:

- **Essentially all of the reduction is Phase 1.** Phases 2 and 3 are roughly
  LOC-neutral; they buy correctness and UX, not smaller code. If the goal is less
  code, Phase 1 is the entire prize and it is also the least risky.
- ~120 lines of Phase 2 are a throwaway backfill, so steady state after it runs is
  nearer **−1,000**.
- Test line counts are the softest figure here. The deletions are measured; the
  additions are estimated.

For scale: the Concierge surface as it stands is ~2,500 lines across the panel,
chat components, chat route, and approval ledger. This is roughly a 35% cut.

## Tradeoffs to accept knowingly

**Merging threads pollutes context.** A phone thread is terse; desk work is
exploratory. One thread means desk noise inside the window the SMS turn reads —
and `planDashboardApproval` already notes that operator history is sliced to the
last 4 messages. Recency windowing mitigates it but does not erase it. The
alternative — two disconnected memories for one employee — is worse against the
"employee, not chatbot" principle, so take the merge and watch the window.

**Two live views of one thread.** The queue is now concurrently mutable from two
transports, and `operator-thread-consolidation.test.ts` covers the park side: two
bindings of one person fan out two cards but park one plan. The read side is still
open — the panel loads the transcript once on mount, so a plan approved on the
phone thirty seconds ago does not disappear from an already-open panel until it is
reopened. Dashboard SWR polls threads on a 3s interval, so the machinery exists;
wiring it is Phase 3's ledger rendering.

## Open question before Phase 3

Whether a merchant would habitually use the Concierge at all is unresolved, and
this plan does not settle it — it makes the surface cheaper and correct either
way. But the way to measure it has now changed twice:

- Phase 1 removed the dashboard's own planning path, so
  `captureAgentPlanGenerated` / `captureAgentPlanDecided` no longer fire with
  `channel: dashboard_agent` for the Concierge.
- Phase 2 put Concierge turns on `sms_agent` threads, so **the channel-type split
  the earlier plan proposed no longer separates the two surfaces at all.**

What still distinguishes them is the audit note each turn writes: `senderPhone`
carries the delivery ref (`telegram:…` / `imessage:…`) for a phone turn and is
null for a desk turn. So the query is over `__shopkeeper_agent__` turn records on
`sms_agent` threads, grouped by whether `senderPhone` is null, per org — and the
thing to look for is decay in the null bucket after a merchant's first week.
Early-adopter merchants will poke a chat box; that is not validation. Run that
query before committing to Phase 3.
