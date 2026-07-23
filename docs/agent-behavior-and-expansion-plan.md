# Agent Behavior & Expansion Plan

Source: 2026-07-11 agent-behavior audit (operator-channel conversational gaps +
support-adjacent expansion candidates). This is the *product-behavior* companion
to the systems-safety audit in [codebase-audit.md](codebase-audit.md) — the
AUD-xxx concurrency/idempotency findings are tracked there, not here, except
where a phase below explicitly interacts with one.

Safety alignment amended: 2026-07-12, after revalidation against the current
durable operator-thread and model-owned control-tool structure.

Two tracks:

- **Track A — make the operator channel conversational.** The Phases A–D work
  (commit 13641e2) gave pending-plan replies model-owned interpretation. These
  phases extend that same design to the places still running on command syntax
  and canned strings.
- **Track B — support-adjacent expansions.** Six candidates that make the agent
  proactive about the same orders and customers support already touches. All
  reuse the existing core (Shopify reads, plan-approval loop, operator-channel
  pushes); none add a new external integration.

## Ground rules

- **Don't touch the support-planner surface without the eval gate.** The full
  gate is currently blocked on API credits. Every Track A phase is therefore
  scoped to operator-mode-only changes: new tools ship as gateway
  `moduleTools` (the control-tool pattern in
  `apps/gateway/src/message-handlers/operator-session-tools.ts`), **not** the
  shared registry, and prompt edits stay inside the `isOperatorMode` branch of
  `packages/agent/src/prompt.ts`. Operator prompt changes are verified by live
  phone round-trip (the waiver precedent from Phases A–D), not evals.
- **Justify every eval run**; single-fixture probes for diagnosis. Track B
  phases that eventually need fixtures (B6) say so explicitly.
- **Ticket text is untrusted.** Any customer-derived prose placed into an
  operator turn must be explicitly marked as data using `<customer_message>`
  tags (the `wrapUntrusted` machinery in
  `packages/agent/src/message-history.ts`). This includes tool results,
  `aiSummary` values, digest/briefing blurbs, and pending-state ledger text —
  not only raw message bodies.
- Deterministic keyword fast paths (`yes`/`no`/`OPEN n`/…) stay. They're a
  latency win and muscle memory; the fix is making the model path capable and
  the fast-path copy warmer, not removing the fast path.

## Systems-safety gates

The tracks below describe product behavior, but they must not bypass the
correctness work in [codebase-cleanup-plan.md](codebase-cleanup-plan.md). These
are shipping dependencies, not suggestions:

| Behavior work | Required cleanup work before broad rollout |
| --- | --- |
| Pending-plan approval, dismissal, revision, or a future queue | P1-01 through P1-03; P2-01 for stale-plan rejection |
| Natural-language ticket sends from the operator channel | P4-03 durable operator events; P5-01 tenant ownership; P4-01 for asynchronous email delivery |
| Briefing claims about completed actions | P1/P3 committed execution outcomes; P1-03 stable plan identity for deduplication |
| New mutative/proactive modules (B3–B6) | P1 execution claims, applicable P3 mutation/cap work, P4 delivery durability, and P6-02 queue monitoring |
| Any behavior that depends on `open` versus `pending` | P5-04 active-thread/escalation state decision |

Until a required gate lands, a phase may ship only the read-only or copy-only
portion that does not widen the unsafe action surface.

**Cleanup gate status (2026-07-20):** P1-01 through P1-03 and P2-01 are
implementation-complete. Reviewed plans now have durable one-winner claims,
stable cross-device identity/resolution, and stale-plan rejection. Their
production migration and initial shadow deployment are complete; representative
traffic observation and staged ledger enforcement remain release checks.
P3-01's shared retry/`unknown` contract plus refund,
cancellation, order creation/editing, multi-step order-address handling, gift
cards, and store credit have complete local implementations and deterministic
coverage. **Durable follow-up recovery landed 2026-07-21** (the
`unknown-outcome-sweep` reconciliation owner); only their Shopify
sandbox/canary checks remain open. P3-02 atomic goodwill reservations are also locally complete and
their additive migration is applied; provider canaries and stale/unknown recovery
remain open. P4-01 outbound-email claims and P5-01 tenant ownership are deployed
with their required migration and deterministic/cross-tenant coverage; provider
canary and production mismatch observation remain open. **P4-03 durable operator
events are complete (2026-07-20)** — durable ingestion is the only path for
Telegram and iMessage; the synchronous webhook fallback is removed. P4-06's
repository-wide deadline implementation is locally complete and awaits deployment
observation. **P5-04 landed on 2026-07-16** (escalation is an orthogonal
`escalated_at` flag; the additive migration ships with it), which unblocks A1's
active-ticket semantics. P6-02 queue monitoring and protected diagnostics are
complete; the safe failed-job replay runbook remains blocked on idempotent replay.

---

## Track A — conversational operator channel

### A1 — Inbox visibility tools (foundation)

**Status (2026-07-20): Complete.** `apps/gateway/src/message-handlers/operator-inbox-tools.ts` ships
`list_active_tickets` and `get_ticket` as read-only gateway module tools, merged
into `moduleTools` in `agent-execution.ts` (so both Telegram and iMessage get
them), with an inbox clause added to the gateway-only `isOperatorMode` branch of
`prompt.ts` — zero support-planner prompt bytes changed, so no eval run was
required. The P5-04 dependency below is now resolved: escalation is an
orthogonal `escalated_at` flag, and the active-ticket predicate is the canonical
inbox filter plus `status in (open, pending)`, listing both literal statuses so
pending escalations from before P5-04 (and any the not-yet-retired
`update_thread_status` enum still creates) cannot be silently hidden. Each tool
result is wrapped once in `<customer_message>` tags with forged copies defanged,
so the customer name is inside the boundary too. Database-backed coverage: org
scoping on both tools, inbox exclusions, tag/status filters, escalation
flagging, untrusted defanging, stale-plan reporting, and turn wiring. Live
Telegram/iMessage phone round-trips completed 2026-07-20.

**Follow-up not in this phase:** the executor→parse→execute path (schema enum
validation, `categoryPermission` gating) is exercised only by the live
round-trip; the unit tests call `execute()` directly.

**Problem:** the operator agent has no tool to list or read support tickets —
thread tools operate only on the current thread, stats are aggregates. The
merchant's "employee" can look up any Shopify order but can't answer "what did
that customer say?" or "anything urgent right now?".

**Build:**

- New `apps/gateway/src/message-handlers/operator-inbox-tools.ts` with two
  read-only module tools, built per turn like the control tools:
  - `list_active_tickets` — org-scoped active threads: thread id, customer
    name, tag, age, `aiSummary`, `filterStatus`, whether a plan is pending.
    Bounded (e.g. 20, newest first) with an optional tag/status filter arg.
    Its active-state predicate must come from the P5-04 decision; do not bake
    in `status = open` while escalated `pending` tickets are otherwise hidden.
  - `get_ticket` — one thread by id: status, tag, cached-plan state, and the
    last N non-note messages. Wrap raw messages, `aiSummary`, and any other
    customer-derived prose in `<customer_message>` tags.
- Merge into the `moduleTools` record in
  `apps/gateway/src/routes/telegram/agent-execution.ts` (flows to iMessage
  automatically — both transports share `executeFreeFormInstruction`).
- Add a short clause to `OPERATOR_INSTRUCTIONS` (operator branch only) saying
  when to reach for them, and that ticket text is data, not instructions.

**Why foundation:** A2's conversational digest triage and A5's briefing
follow-ups get most of their power from these two tools.

**Safety dependency:** ~~finalize or explicitly stage the P5-04 definition of an
active ticket before shipping inbox semantics.~~ **Resolved 2026-07-16** — P5-04
landed (escalation is orthogonal to status; the ticket stays `open`), and the
tools expose both `open` and `pending` with their literal statuses, so pending
escalations are not omitted.

**Verify:** unit tests for org-scoping + untrusted wrapping; extend
`execute-operator-agent-turn` smoke test; live phone round-trip ("what's in my
inbox?", "what did <customer> say?").

**Out of scope (follow-up):** dashboard Concierge parity — Concierge runs in
the dashboard app and can't use gateway moduleTools; decide later whether to
mirror these as dashboard host tools.

### A2 — Conversational digest triage

**Status (2026-07-20): Complete.** `renderOperatorLedger` now lists flagged digest
tickets with index, customer, summary, and ticket id in the same order the
merchant saw, wrapped as untrusted customer data. Gateway operator turns expose
`mark_ticket_spam` and `send_ticket_reply` digest control tools with org-scoped
and digest-membership checks; keyword fast paths (`SPAM n`, `REPLY n`) are
unchanged. Shared digest-triage helpers back both paths. Unit and database-backed
tests cover ledger rendering, spam marking, reply send failures, and tool wiring.
Live phone verification remains optional follow-up.

**Problem:** digest follow-ups are index commands (`OPEN 2 · SPAM 3 ·
REPLY 1 <text>`) parsed before the model
(`apps/gateway/src/routes/telegram/{command-parser,digest-commands}.ts`); the
model's ledger only says "a digest was sent covering N tickets"
(`operator-ledger.ts`). "The one from Sarah is spam, tell the second we ship
Friday" goes nowhere.

**Build:**

- `renderOperatorLedger`: when `pendingDigest` is set, render the flagged list
  — index, customer, one-line summary, thread id — using the same
  `pendingDigest.threadIds` ordering the merchant saw, so "the second one"
  resolves identically on both sides. Wrap customer-derived summaries as
  untrusted data.
- Two new digest control tools (same file or alongside the session tools),
  mirroring the approve/reject/revise design:
  - `mark_ticket_spam` (thread id) — the `digest-spam` transition.
  - `send_ticket_reply` (thread id, text) — the `digest-reply` path via
    `postDashboardInternal('/api/messages/internal', …)`.
  - "Open" needs no tool — `get_ticket` (A1) covers it.
- Extend `OPERATOR_CONTROL_TOOL_INSTRUCTIONS`: clear intent → tool; ambiguous
  ("that first one seems off") → ask a short confirming question before
  marking spam. Multiple items in one message are allowed (unlike plan
  approval, these are independent per-ticket actions).
- Keyword fast path stays untouched.
- **Drive-by (AUD-020):** while in `operator-ledger.ts`, replace the gateway's
  hard-coded `READ_TOOLS` with the canonical read-category predicate from the
  registry so ledger/skip numbering can't drift from real actions. This is
  cleanup P8-01 and may ship independently before A2.

**Safety dependencies:** both new tools must re-load the target through an
organization-scoped predicate at execution time rather than trusting a thread
id parked in JSON. `send_ticket_reply` must use the P5-01-hardened internal send
boundary and participate in P4-03 durable operator-event processing; email
delivery inherits P4-01. Do not broaden natural-language sending before those
boundaries are in place. Spam updates must likewise include organization
ownership in the write predicate.

**Verify:** unit tests for ledger rendering + tool transitions; live phone:
digest → "the one from Sarah is spam", "reply to the second: we ship Friday".

### A3 — Operator escalation fix + prompt polish

**Status (2026-07-20): Complete.** Gateway `sms_agent` turns now hide
`escalate_to_human`, `send_reply`, and `add_internal_note`; deterministic
policy blocks return to the model for a direct merchant explanation; the
context has a defensive no-side-effect escalation sink; operator guardrails,
channel copy, and response-length guidance are corrected. Dashboard Concierge
keeps its existing escalation semantics. Unit and database-backed operator
smoke coverage pass. Live Telegram/iMessage phone round-trips completed 2026-07-20.

**Problem:** `OPERATOR_INSTRUCTIONS` tell the model to `escalate_to_human`
when the operator's request is ambiguous — but the human is the person
talking, and executing it on the durable operator thread parks *that thread*
to pending, tags it `needs_human`, and pushes an escalation notification back
to the same merchant (`agent-thread-sink.ts:131-150`). Circular.

**Build (operator prompt + tool selection + operator-safe execution deps):**

- Replace the escalate-on-ambiguity clause: when unsure, **ask the merchant
  directly in the reply**; when out of scope, say so plainly and why. Remove
  `escalate_to_human` from operator-turn tool selection (allowlist filter in
  the gateway turn deps) as belt-and-braces so a stray call can't self-park
  the operator thread.
- Give operator turns an escalation sink that returns a plain explanation or
  clarification request without changing the durable operator thread to
  `pending`, tagging it `needs_human`, or pushing an escalation notification.
  This is required because deterministic policy-block handling calls
  `ctx.escalate()` directly even when the `escalate_to_human` tool is hidden.
- Make shared guardrail clauses operator-aware: on a blocked refund,
  cancellation, discount, or other policy limit, tell the merchant why it was
  blocked and ask what they want to do. Do not leave operator prompt text
  instructing a hidden escalation tool.
- Fix the stale channel label at `prompt.ts:225` — `sms_agent` renders as
  "WhatsApp/SMS"; say "text message (Telegram/iMessage)" or derive from the
  binding.
- Soften the brevity mandate: "default to 1–2 sentences; a short paragraph is
  fine when the merchant asks for a rundown. Still no bullet lists or
  markdown."

**Verify:** live phone round-trip (ambiguous instruction → clarifying question,
not an escalation note); policy-blocked refund/cancellation → explanation with
the operator thread still open and no self-notification; operator smoke tests;
confirm support prompt bytes are unchanged (no eval needed).

**Safety dependency:** coordinate the durable operator-thread exception with
P5-04 so support-ticket escalation semantics can still be decided separately.

### A4 — Fast-path and canned copy

**Status (2026-07-20): Complete (commit `de0e9edd`).** All five build items shipped:
`customerName`/`actionLabel` are parked in `pendingPlan`
(`planning-notifications.ts`); the fast-path dismissal names the action
(`pending-plan-commands.ts` — "Dismissed — I won't …"); digest spam/reply
confirmations carry the customer name (`digest-commands.ts`); the bare `'Done.'`
fallback is now `'All set.'` (`agent-execution.ts`); and `HELP_TEXT`
(`telegram/format.ts`) leads capabilities-first with command hints trailing.
Old/new pending-plan JSON shapes are unit-covered.

**Problem:** literal `yes`/`no` — the most common replies — hit the keyword
path and get `Plan dismissed.` / `Marked 2 as spam.` / `Reply sent on ticket
2.` / bare `Done.`. The model path was told to quote the concrete action; the
fast path wasn't.

**Build (pure copy, no model calls):**

- Park `customerName` (and a one-phrase action label from
  `PLAN_STEP_LABELS`) inside `pendingPlan` at notification time
  (`planning-notifications.ts` contextPatch) so the fast path can say
  "Dismissed — I won't send Sarah the refund reply." without an extra query.
  Treat these as optional display fields: readers must remain compatible with
  legacy JSON, and preserve the stable plan ID, source-message ID, and hashes
  now supplied by P1-03.
- `digest-commands.ts`: include the customer name in spam/reply confirmations
  ("Marked Jake's message as spam.", "Replied to Sarah — 'we ship Friday.'").
- `agent-execution.ts` `'Done.'` fallback → something with a pulse ("All set —
  anything else?" is too chatbot; "All set." is enough).
- Rewrite `HELP_TEXT` (`telegram/format.ts`) capabilities-first: "Text me like
  you'd text an employee — 'refund #1234', 'what's in the inbox?', 'what did
  Sarah say?'. Reply yes/no to anything I propose." Keep the command hints as
  a trailing line, not the headline.

**Verify:** unit tests on the copy builders and old/new pending-plan JSON
shapes; screenshots/phone once.

### A5 — Morning briefing v2

**Status (2026-07-20): Complete.** Recurring digests now include a deterministic
"Since your last briefing" handled rollup from committed `PlanExecution` rows
since an org-level `lastSuccessfulDigestAt` cursor, plus a deduplicated
"Waiting on you" section from operator pending plans and stale
`needs_review`/`needs_merchant_input` thread plans. Footer copy leads with a
natural-language invite and demotes command shortcuts. Weekly stats and the
first-night flow are unchanged. Unit and database-backed tests cover handled
rollups, waiting dedupe, digest formatting, and cursor behavior.

**Build (stay deterministic — assembled from DB, no LLM cost per digest):**

- **"Handled" section:** the P1 committed execution outcome model now exists;
  after the applicable P3 provider reconciliation lands, roll up committed
  execution/tool outcomes since one organization-level last-successful-digest
  cursor — counts by category plus the notable ones spelled out (refund
  amounts, replies sent, auto vs approved). `AgentAction` is currently a
  best-effort post-action audit trail and must not be presented as authoritative
  completion truth. A pre-ledger prototype may show explicitly labeled
  best-effort activity, but not claim an action definitely completed.
- **"Waiting on you" section:** the org's parked approvals — pending plans
  from `OperatorContext` and threads whose `cachedPlan` is
  `needs_review`/`needs_merchant_input` older than a few hours — each with
  customer + one-phrase action ("Sarah's $12 refund — still waiting on your
  OK"). Deduplicate the same fan-out plan across devices by P1-03's stable plan
  identity, exclude resolved/stale claims, and never infer uniqueness from
  thread id alone. This doubles as the stale-plan nudge from A6.
- Footer: natural-language invitation first, command hints demoted to one
  trailing line (consistent with A4's HELP_TEXT).
- Keep the weekly stats line and first-night flow as-is.
- Defer: a model-written narrative digest (nice, but recurring LLM cost for
  every org every morning — revisit once merchants exist).

**Safety dependencies:** P1-01 through P1-03 committed outcomes and stable plan
identity are implementation-complete. P3-01 refund, cancellation, order creation
and editing, order-address reconciliation, gift cards, and store credit are
locally complete; the durable recovery owner landed 2026-07-21
(`unknown-outcome-sweep`), so only their Shopify sandbox/canary checks remain
before the briefing can claim ambiguous actions were
handled. Store a single
org-level digest cursor or use a fixed,
documented reporting window — do not choose an arbitrary device context's
`pendingDigest.sentAt`.

**Verify:** extend the existing digest unit tests (bucketing/format), including
per-device duplicate plans, stale/resolved plans, failed/partial/unknown
executions, and digest-cursor behavior; one live scheduled-digest run against
the test DB.

### A6 — Pending-plan overwrite honesty + queue (last, safety-coupled)

**Status (2026-07-23): Step 1 complete (2026-07-20); Step 2 (real queue)
implemented on branch `a6-step2-operator-plan-queue`, flag-gated OFF by default —
live phone verification pending.** Step 1: `sendOperatorPlanNotification` reads
each operator context before parking and, at cap 1, appends the disclosure line
naming the earlier customer.

Step 2 replaces the single `OperatorContext.pendingPlan` slot with a
`pending_plans` JSONB queue (additive migration `20260723000000` + backfill;
legacy column kept one release for rollback and dual-read):
- **Storage** (`operator-context.ts`): `appendPendingPlan` parks via a row-lock
  transaction that upserts by `threadId` (one pending plan per thread), trims to
  the cap, and is idempotent under BullMQ retry; `resolvePendingPlanContexts`
  removes one element atomically (cross-device by `planId`, acting-device by full
  match for legacy), preserving P1-03 predicates. `selectPendingPlan`
  (ordinal/`planId`/customer-name) and `mostRecentPendingPlan` back selection.
- **Selection**: approve/reject/revise gained an optional `plan_ref`; several
  pending + no/ambiguous ref → the model is told to ask which one, never guesses.
  The ledger renders a numbered list in the same order the selector uses.
- **Fast path**: literal yes/no/skip act on the most-recent plan; the reply names
  what's still waiting. Revise re-parks by `threadId` upsert (no sibling wipe).
- **Question path**: a question notification clears only its own thread's queued
  plan (`removePendingPlanForThread`), not the whole queue — a whole-queue clear
  would silently drop unrelated threads' plans (the exact A6 harm) once the cap
  is raised. At cap 1 this is behaviourally identical to the old single-slot clear.
- **Recovery**: `loadLivePendingPlans` prunes entries whose execution is terminal
  (approved elsewhere) once per turn before the ledger/tools read the context.
- **Rollout**: `OPERATOR_PLAN_QUEUE_MAX` (default **1** = today's single-slot
  overwrite exactly). Raise to >1 only after P1 execution-ledger rollout
  verification. No support-planner bytes changed, so no eval run required.
- **Coverage**: gateway suite green (198 unit + 558 integration); new tests cover
  append/cap-trim, concurrent-append serialization, retry idempotency, per-plan
  resolve leaving siblings, selection, and terminal-execution pruning.

The A5 "Waiting on you" digest follow-up now iterates the whole queue.

**Problem:** `OperatorContext.pendingPlan` is single-slot; each new plan
notification overwrites the previous one silently, so the older plan stops
being approvable by text and nobody says so. Nothing ever follows up on an
ignored plan.

**Build in two steps:**

1. **Cheap and honest (copy can ship now) — card line done 2026-07-20:** when a
   plan notification would overwrite a
   different thread's pending plan, append one line to the outgoing card:
   "(This replaces the earlier plan for <customer> — that one's still on your
   dashboard.)" The A5 "Waiting on you" digest section for follow-ups remains
   with A5.
   This is disclosure, not a concurrency fix. P1-03 now supplies stable identity
   and conditional all-device resolution, so the accompanying context update
   must retain those exact-plan predicates and cannot regress to an unconditional
   clear that erases a newer notification.
2. **Real queue — implemented 2026-07-23 (branch `a6-step2-operator-plan-queue`),
   flag-gated OFF:** `pendingPlans[]` with model-side selection ("approve the
   refund one"). Built on P1-01/P1-02 execution claims, P1-03 all-device
   resolution, and P2-01 stale-plan rejection (all implementation-complete). It is
   a separate data-model phase with its own selection, claim, resolution, and
   recovery design — see the A6 status block above for the full breakdown. The cap
   defaults to 1 (single-slot parity); raise `OPERATOR_PLAN_QUEUE_MAX` above 1 only
   after the P1 execution-ledger rollout checks.

**Verify:** unit test the overwrite line. With P1-03, also test the race where
plan B arrives while a model turn still holds a snapshot of plan A; approving,
rejecting, or revising A must not erase or execute B. The queue step gets its
own plan.

### Suggested Track A order

A3 shipped first because it stops operator-thread self-escalation, and P8-01
landed as a standalone quick win. **A1 is implementation-complete as of
2026-07-16** (P5-04 unblocked it). **A4 and A6-step-1 are implementation-complete
as of 2026-07-20** (live phone verification complete). **A6-step-2 (the real
pending-plan queue) is implemented as of 2026-07-23** on branch
`a6-step2-operator-plan-queue`, flag-gated OFF (`OPERATOR_PLAN_QUEUE_MAX=1`) —
live phone verification pending. Subject to the safety gates above, the behavior
order is complete for Track A operator expansion (A5 shipped 2026-07-20).
A5's deduplicated "Waiting on you" foundation now has P1 identity support; its
authoritative "Handled" section still waits for P3. Each operator-only phase has its own live verification; none needs
an eval run unless it changes the support-planner surface.

---

## Track B — support-adjacent expansions

Ordered by cost/leverage. Common shape: a flag-gated maintenance sweep (the
`ORDER_RISK_MONITOR_ENABLED` pattern) that turns into an operator push and,
where it acts, goes through the existing plan-approval loop. Bias per the
product rubric: escalate/ask over confident wrong action; nothing auto-sends
customer-facing text at launch.

Every new sweep must use a stable job/event identity, be safe to replay, have
an explicit external-call deadline, and be included in P6-02 queue health and
failed-job recovery. "Uses the existing approval loop" is not a safety waiver:
P1 execution claims are implementation-complete but require rollout verification;
mutative phases still wait for the applicable P3 provider outcome/cap work,
while customer delivery waits for P4 durability.

### B1 — Daily sales pulse line in the briefing (small)

**Status (2026-07-20): Complete.** Recurring digests include a failure-tolerant
sales line built from an org-wide Shopify orders read since the org-level
`lastSuccessfulDigestAt` window, with a prior-week comparison when the follow-up
fetch succeeds. Opt out via `salesPulseEnabled: false` in org settings or the
**Morning briefing extras** panel on Agent settings (Shopify-connected orgs).

One line in the digest: orders + revenue since yesterday (vs. same day last
week if cheap). Mirror the weekly-stats pattern — computed at digest build,
failure-tolerant garnish that can never sink the digest. Needs one small
org-wide Shopify orders read (current order fetches are per-customer).
Deliberately a digest line, not an analytics surface — reports were already
cut once by design. Use the P4-06 deadline/timeout conventions for the new
org-wide read and the same org-level digest reporting window chosen in A5.

### B2 — Inventory awareness (read-only)

**Status (2026-07-20): Complete (serializer + digest line + settings UI).** Variant
`inventory_quantity` is already exposed in the product serializer and returned by
`search_shopify_products`. Low-stock digest lines are behind
`lowStockThreshold` in org settings (default off), configurable from **Morning
briefing extras** on Agent settings when Shopify is connected.

- Expose variant inventory quantities in the product serializer
  (`packages/agent/src/shopify/serializers.ts` / `products.ts`) if not already
  present — this alone makes "how many black hoodies left?" answerable in the
  operator channel and lets support answer restock questions honestly.
- Digest low-stock line behind a threshold (settings JSON key, default off).
- **Caution:** serializer changes feed the support planner's context → run the
  eval gate before shipping the serializer piece (cheap fixture probe first),
  and account for the added fields in P2-02's hard context/token budget.

### B3 — Return-lifecycle completion

**Prod migration note (2026-07-22):** `20260720100000_add_return_watches` had
never been applied to production despite the code shipping 2026-07-20, so
`recordReturnWatch` was failing-and-warning (caught) on every return/exchange in
prod for two days. Applied 2026-07-22 alongside B4/B5's watch tables; the
`RETURN_LIFECYCLE_MONITOR_ENABLED` flag remains **off**.

**Status (2026-07-20): Complete.** Shipped behind `RETURN_LIFECYCLE_MONITOR_ENABLED`.
Hourly sweep reads durable `ReturnWatch` rows (recorded when `create_return` /
`create_exchange` succeed) plus a legacy backfill from recent audit rows, checks
Shopify reverse-delivery status, and on delivery pushes a `needs_review` plan
through the existing approval loop (`generateThreadPlan` +
`sendOperatorPlanNotification`). Notify-only fallback remains when there is no
open thread or the planner produces no actionable steps.

- Durable return↔ticket association: `return_watches` table + migration
  `20260720100000_add_return_watches`; watches are upserted at tool success
  time with `shopifyReturnId`, `threadId`, and `orderId`.
- Arrival handling: `return-arrival-plan.ts` builds a return-arrival instruction,
  caches a fresh plan on the source thread, and fans out the operator approval
  card with P1-03 stable plan identity.
- Idempotent delivery detection: per-org/order/return idempotency keys; watch
  status moves `open` → `plan_pushed` (or `skipped` when no operators are bound).

Broad rollout still follows the same cleanup gates as other mutative sweeps:
P1 execution-claim rollout verification, applicable P3 refund reconciliation
canaries, and P6-02 queue monitoring. Enabling the flag does not bypass those
gates — it only exposes the completed monitor + approval path.

### B4 — Delivery-exception watch

**Prod migration note (2026-07-22):** `20260720110000_add_shipment_watches` had
likewise never reached production (same two-day gap as B3). Applied 2026-07-22;
the `DELIVERY_EXCEPTION_MONITOR_ENABLED` flag remains **off**.

**Status (2026-07-20): Complete.** Shipped behind `DELIVERY_EXCEPTION_MONITOR_ENABLED`
with per-org opt-out via `deliveryExceptionWatchEnabled` on Agent settings
(Shopify-connected orgs). Hourly sweep reads recent fulfilled USPS shipments,
classifies stalled in-transit and carrier-exception tracking via the existing
USPS client (P4-06 deadlines), correlates to the customer's open ticket by
`thread.shopifyCustomerId` (P5-04 — no split thread), or creates an email
thread through the same shape as `POST /api/threads/shopify` when an address is
available. Detected issues push a `needs_review` plan through the existing
approval loop (`generateThreadPlan` + `sendOperatorPlanNotification`); notify-only
fallback remains when there is no customer message to plan against or no operators
are bound.

- Durable idempotency: `shipment_watches` table + migration
  `20260720110000_add_shipment_watches`; one row per org/tracking number moves
  `open` → `plan_pushed` or `skipped`.
- Exception handling: `delivery-exception-plan.ts` builds the proactive heads-up
  instruction and fans out the operator approval card with P1-03 stable plan identity.
- Rate limiting: bounded org scan (`25` shipments) plus `150ms` delay between USPS
  lookups.
- Settings: per-org opt-out via `deliveryExceptionWatchEnabled` on **Proactive
  shipping alerts** (`/dashboard/agent/configure`); gateway env flag remains the
  rollout gate.

Broad rollout still follows the same cleanup gates as other mutative sweeps.
Enabling the flag does not bypass P1 execution-claim rollout verification,
P4 delivery durability before customer send, or P6-02 queue monitoring.

### B5 — Post-resolution follow-up

**Deployed + enabled in prod (2026-07-22).** Commit `9a686639` on master; gateway
auto-deployed on push (Railway `proud-dream`/production/`shopkeeper`, deploy
`aa714b89`), then redeployed `733e7023` (SUCCESS) after setting
`POST_RESOLUTION_FOLLOWUP_MONITOR_ENABLED=1` — so the hourly sweep is **live**.
Three additive watch-table migrations (`add_return_watches`,
`add_shipment_watches`, `add_follow_up_watches`) were applied together via
`railway run npm run db:migrate:deploy`; `prisma migrate status` = up to date.
Dashboard shipped via Vercel's GitHub integration on the same push. Blast radius
is near-zero at enablement: `follow_up_watches` started empty, so the first
possible nudge is ~5 days out (default window) and only for genuinely new
refund/exchange resolutions. Roll back with
`railway variable set POST_RESOLUTION_FOLLOWUP_MONITOR_ENABLED=0` (recording
continues regardless).

**Status (2026-07-22): Complete (nudge variant) behind `POST_RESOLUTION_FOLLOWUP_MONITOR_ENABLED`.**
Shipped as an operator *nudge*, not a pre-drafted plan, after a design finding:
the B3/B4 template (`generateThreadPlan` → `sendOperatorPlanNotification`)
hard-requires a *pending customer message* (`getPendingCustomerMessageId`), and a
closed/resolved ticket's last message is the agent's reply — so a proactive draft
would be rejected at approval by the P1-02/P1-03 claim path
(`loadCurrentCachedHomePlan` re-derives `pendingCustomerMessageId` and keys the
durable claim on a real `Message` id). Rather than modify trust-critical
approval/claim machinery for the lowest-priority Track B item, B5 nudges the
operator ("worth a quick check-in? Sarah's exchange wrapped up 5 days ago") and
leans on the conversational operator loop (A1/A2) to draft the actual reply.
Implemented:
- `FollowUpWatch` table + migration `20260722120000_add_follow_up_watches`; one row
  per (org, order), recorded at tool success via `maybeRecordFollowUpWatch` on
  `create_refund`/`create_exchange` (injected `recordFollowUpWatch` dep — never a
  static `@shopkeeper/db` import in `registry/*`).
- Hourly `post-resolution-followup-monitor.ts`: open watches whose source ticket is
  closed on a customer channel and older than the org window get a notify-only
  operator push; org opt-out / no-operators retire the watch (`skipped`).
- Settings: `postResolutionFollowUpEnabled` (default on when the flag is on) +
  `postResolutionFollowUpDays` (default 5), with a **Post-resolution check-ins**
  toggle on `/dashboard/agent/configure`.
- **Deliberately excluded:** `create_shopify_order`-as-replacement (can't be
  distinguished from an ordinary new order and carries no structured order id) — an
  exchange already covers the "replacement" case.
- Unit + DB-backed coverage: config, nudge copy/idempotency, and the sweep
  (window/closed/channel gating, org opt-out, terminal idempotency, no-operators).

The full "draft through the approval loop" version remains possible but needs a
proactive-planner seam that changes P1-02/P1-03 identity semantics; deferred.

N days after a closed ticket that involved a refund/exchange/replacement,
draft a short check-in ("did the replacement fit?") through the approval loop.
Cheap sweep + plan generation; pure brand-voice/trust play. Ship after B3/B4
so the merchant isn't flooded with new proactive pushes at once. Key the
follow-up durably to the source ticket/action and follow-up window so retries
cannot create duplicate drafts. P1/P2 approval freshness is
implementation-complete but needs rollout verification; P4 operator/customer
delivery durability, P5-04 thread correlation, and P6-02 queue monitoring remain.

### B6 — Order-ops autonomy (module #2, largest, last)

The fraud-risk monitor is code-complete behind `ORDER_RISK_MONITOR_ENABLED`,
flag-and-notify only. **Eval fixtures landed 2026-07-22**
(`apps/gateway/src/order-ops.eval.test.ts`: real-key-gated flag/no-flag judgment
fixtures + an always-on deterministic no-signal skip; `npm run test:evals` in the
gateway). Remaining: decide how flagged orders enter the approval loop ("hold
fulfillment?") and whether/how the module earns autonomy tiers. This is the
roadmap's module #2 and the template for every future module — don't rush it in
as a sweep.
Keep it flag-and-notify-only until the completed P1 claim implementation is
rollout-verified, the applicable P3 mutation outcome model/cap enforcement,
P4-03 durable operator instructions, and P6-02 monitored
replay are proven. Any actionable autonomy gets a separate plan, fixtures, and
staged rollout; enabling the existing monitor does not authorize actions.

### Suggested Track B order

B1 → B2 → B3 → B4 → B5 → B6. **B1–B4 complete as of 2026-07-20; B5 (nudge
variant) complete 2026-07-22** behind `POST_RESOLUTION_FOLLOWUP_MONITOR_ENABLED`
(off by default) — broad rollout still follows the shared cleanup gates. B6's eval
fixtures landed 2026-07-22; it remains gated on the safety program and its own
actionable-autonomy plan.

---

## Open questions

1. Digest spam via the model (A2): trust clear intent, or always confirm
   before marking spam? (Plan approval trusts clear intent; spam is
   lower-stakes and reversible — recommend trusting it.)
2. Concierge parity for A1's inbox tools — worth mirroring as dashboard host
   tools, or is the dashboard inbox UI enough there?
3. ~~B2/B1 settings surface: new `Organization.settings` keys
   (`lowStockThreshold`, `salesPulseEnabled`?) — dashboard settings UI or
   settings-JSON-only at first?~~ **Decided and shipped 2026-07-20:**
   **Morning briefing extras** on Agent settings (`/dashboard/agent/configure`)
   for Shopify-connected orgs; JSON keys remain the API surface.
4. ~~A5 reporting boundary: persist one organization-level last-successful-
   digest cursor, or use a fixed rolling window?~~ **Decided and shipped
   2026-07-20:** durable org-level `lastSuccessfulDigestAt` cursor (see A5).
5. ~~P5-04 active-ticket semantics: should `pending` remain an active inbox
   state, or should escalation become orthogonal to thread status?~~
   **Decided and shipped 2026-07-16:** escalation is orthogonal — an escalated
   ticket stays `open` and carries `escalated_at`. `pending` remains listable
   until the eval-gated retirement of the `update_thread_status` enum value.
6. ~~B4 settings surface: org opt-out for delivery-exception watch?~~
   **Decided and shipped 2026-07-20:** `deliveryExceptionWatchEnabled` on Agent
   settings (`/dashboard/agent/configure` → **Proactive shipping alerts**) for
   Shopify-connected orgs; gateway `DELIVERY_EXCEPTION_MONITOR_ENABLED` remains
   the rollout gate.
