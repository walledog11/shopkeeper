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
coverage. Their Shopify sandbox/canary checks and durable follow-up recovery
remain open. P3-02 atomic goodwill reservations are also locally complete and
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

**Status (2026-07-12): In progress.** The independent AUD-020/P8-01 drive-by is
complete; conversational digest ledger rendering and control tools have not
started and remain gated by the send/tenant durability work below.

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

**Problem:** the first-night message promises "what came in, what I handled,
and what needs you"; the recurring digest
(`apps/gateway/src/maintenance/digest.ts`) delivers counts + flagged list +
command footer. No "what I handled", no pending approvals, no per-ticket
plans. This is the flagship surface (magic moment = next-morning briefing).

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
locally complete but still require their Shopify sandbox/canary checks and a
durable recovery owner before the briefing can claim ambiguous actions were
handled. Store a single
org-level digest cursor or use a fixed,
documented reporting window — do not choose an arbitrary device context's
`pendingDigest.sentAt`.

**Verify:** extend the existing digest unit tests (bucketing/format), including
per-device duplicate plans, stale/resolved plans, failed/partial/unknown
executions, and digest-cursor behavior; one live scheduled-digest run against
the test DB.

### A6 — Pending-plan overwrite honesty + queue (last, safety-coupled)

**Status (2026-07-20): Step 1 (overwrite disclosure) complete; live verification
completed 2026-07-20. Step 2
(real queue) still deferred.** `sendOperatorPlanNotification` now reads each
operator context before `notifyOperator` parks the new plan and, when the card
is about to overwrite a *different* thread's still-pending plan, appends the
disclosure line naming the earlier customer. The read is best-effort — a failure
drops the line, never the critical push — and the context write is unchanged, so
P1-03's exact-plan resolution predicates are preserved. Unit + DB-backed tests
cover the different-thread, same-thread, and no-earlier-name cases. The A5
"Waiting on you" digest follow-up (step 1's second half) rides with A5.

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
2. **Real queue (later, deliberately):** `pendingPlans[]` with model-side
   selection ("approve the refund one"). P1-01/P1-02 execution claims, P1-03
   all-device resolution, and P2-01 stale-plan rejection are now
   implementation-complete. Start the queue only after their rollout checks;
   it remains a separate data-model phase with its own selection, claim,
   resolution, and recovery design.

**Verify:** unit test the overwrite line. With P1-03, also test the race where
plan B arrives while a model turn still holds a snapshot of plan A; approving,
rejecting, or revising A must not erase or execute B. The queue step gets its
own plan.

### Suggested Track A order

A3 shipped first because it stops operator-thread self-escalation, and P8-01
landed as a standalone quick win. **A1 is implementation-complete as of
2026-07-16** (P5-04 unblocked it). **A4 and A6-step-1 are implementation-complete
as of 2026-07-20** (live phone verification complete). Subject to the safety
gates above, the remaining behavior order is A2 → A5. A2 can now assume
`get_ticket` exists — its "open" case needs no tool.
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

One line in the digest: orders + revenue since yesterday (vs. same day last
week if cheap). Mirror the weekly-stats pattern — computed at digest build,
failure-tolerant garnish that can never sink the digest. Needs one small
org-wide Shopify orders read (current order fetches are per-customer).
Deliberately a digest line, not an analytics surface — reports were already
cut once by design. Use the P4-06 deadline/timeout conventions for the new
org-wide read and the same org-level digest reporting window chosen in A5.

### B2 — Inventory awareness (read-only)

- Expose variant inventory quantities in the product serializer
  (`packages/agent/src/shopify/serializers.ts` / `products.ts`) if not already
  present — this alone makes "how many black hoodies left?" answerable in the
  operator channel and lets support answer restock questions honestly.
- Digest low-stock line behind a threshold (settings JSON key, default off).
- **Caution:** serializer changes feed the support planner's context → run the
  eval gate before shipping the serializer piece (cheap fixture probe first),
  and account for the added fields in P2-02's hard context/token budget.

### B3 — Return-lifecycle completion

The agent opens returns/exchanges today, then goes blind. Sweep open returns;
when the reverse shipment shows delivered, push through the plan-approval
loop: "Sarah's return arrived back — approve the $42 refund?" Attach it through
a durable return/action-to-ticket association rather than inferring from
best-effort audit text. The eventual refund uses `create_refund`. P1-01/P1-02
single-use execution is implementation-complete. P3-01 refund reconciliation is
locally complete but still waits for Shopify sandbox/canary verification; this
phase also waits for P1 rollout verification and P3-02's migration/canary
rollout of the locally complete atomic cap reservation.
The sweep also needs stable delivery-event
deduplication and P6-02 monitoring. This closes the loop merchants forget, and
it's the highest-trust-building candidate of the six.

### B4 — Delivery-exception watch

Sweep fulfilled orders' tracking (existing USPS client, rate-limited); on a
stalled shipment or delivery exception, notify the operator and offer a
drafted proactive customer heads-up (via the create-thread-from-Shopify path,
`needs_review` — never auto-send). Prevents the biggest ticket class (WISMO)
instead of answering it. Flag-gated like the order-risk monitor. Require
P4-06 deadlines/rate-limit classification for tracking, P5-04 active-thread
correlation so the proactive draft cannot split an escalated conversation.
P1/P2 single-use and stale-plan protection is implementation-complete but still
needs rollout verification before approval; P4 delivery
durability before customer send, and P6-02 monitoring/replay ownership.

### B5 — Post-resolution follow-up

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
flag-and-notify only. Per the to-do list: write order-ops eval fixtures first,
then decide how flagged orders enter the approval loop ("hold fulfillment?")
and whether/how the module earns autonomy tiers. This is the roadmap's module
#2 and the template for every future module — don't rush it in as a sweep.
Keep it flag-and-notify-only until the completed P1 claim implementation is
rollout-verified, the applicable P3 mutation outcome model/cap enforcement,
P4-03 durable operator instructions, and P6-02 monitored
replay are proven. Any actionable autonomy gets a separate plan, fixtures, and
staged rollout; enabling the existing monitor does not authorize actions.

### Suggested Track B order

B1 → B2 → B3 → B4 → B5 → B6. B1/B2 are digest garnish shippable alongside A5.
B3–B5 each want one new maintenance worker + settings flag and do not start
broad rollout until their cleanup dependencies above are satisfied. B6 is
gated on eval fixtures, the safety program, and its own actionable-autonomy
plan.

---

## Open questions

1. Digest spam via the model (A2): trust clear intent, or always confirm
   before marking spam? (Plan approval trusts clear intent; spam is
   lower-stakes and reversible — recommend trusting it.)
2. Concierge parity for A1's inbox tools — worth mirroring as dashboard host
   tools, or is the dashboard inbox UI enough there?
3. B2/B1 settings surface: new `Organization.settings` keys
   (`lowStockThreshold`, `salesPulseEnabled`?) — dashboard settings UI or
   settings-JSON-only at first?
4. A5 reporting boundary: persist one organization-level last-successful-
   digest cursor, or use a fixed rolling window? (Recommend the durable cursor
   so retries and delayed digests do not overlap or omit activity.)
5. ~~P5-04 active-ticket semantics: should `pending` remain an active inbox
   state, or should escalation become orthogonal to thread status?~~
   **Decided and shipped 2026-07-16:** escalation is orthogonal — an escalated
   ticket stays `open` and carries `escalated_at`. `pending` remains listable
   until the eval-gated retirement of the `update_thread_status` enum value.
