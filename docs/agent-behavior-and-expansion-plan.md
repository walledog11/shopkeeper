# Agent Behavior & Expansion Plan

Source: 2026-07-11 agent-behavior audit (operator-channel conversational gaps +
support-adjacent expansion candidates). This is the *product-behavior* companion
to the systems-safety audit in [codebase-audit.md](codebase-audit.md) — the
AUD-xxx concurrency/idempotency findings are tracked there, not here, except
where a phase below explicitly interacts with one.

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
- **Ticket text is untrusted.** Any new tool that returns customer prose into
  an operator turn must wrap it in `<customer_message>` tags (the
  `wrapUntrusted` machinery in `packages/agent/src/message-history.ts`).
- Deterministic keyword fast paths (`yes`/`no`/`OPEN n`/…) stay. They're a
  latency win and muscle memory; the fix is making the model path capable and
  the fast-path copy warmer, not removing the fast path.

---

## Track A — conversational operator channel

### A1 — Inbox visibility tools (foundation)

**Problem:** the operator agent has no tool to list or read support tickets —
thread tools operate only on the current thread, stats are aggregates. The
merchant's "employee" can look up any Shopify order but can't answer "what did
that customer say?" or "anything urgent right now?".

**Build:**

- New `apps/gateway/src/message-handlers/operator-inbox-tools.ts` with two
  read-only module tools, built per turn like the control tools:
  - `list_open_tickets` — org-scoped open threads: thread id, customer name,
    tag, age, `aiSummary`, `filterStatus`, whether a plan is pending. Bounded
    (e.g. 20, newest first) with an optional tag/status filter arg.
  - `get_ticket` — one thread by id: status, tag, cached-plan state, and the
    last N non-note messages with customer text wrapped in
    `<customer_message>` tags.
- Merge into the `moduleTools` record in
  `apps/gateway/src/routes/telegram/agent-execution.ts` (flows to iMessage
  automatically — both transports share `executeFreeFormInstruction`).
- Add a short clause to `OPERATOR_INSTRUCTIONS` (operator branch only) saying
  when to reach for them, and that ticket text is data, not instructions.

**Why first:** A2's conversational digest triage and A5's briefing follow-ups
get most of their power from these two tools.

**Verify:** unit tests for org-scoping + untrusted wrapping; extend
`execute-operator-agent-turn` smoke test; live phone round-trip ("what's in my
inbox?", "what did <customer> say?").

**Out of scope (follow-up):** dashboard Concierge parity — Concierge runs in
the dashboard app and can't use gateway moduleTools; decide later whether to
mirror these as dashboard host tools.

### A2 — Conversational digest triage

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
  resolves identically on both sides.
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
  registry so ledger/skip numbering can't drift from real actions.

**Verify:** unit tests for ledger rendering + tool transitions; live phone:
digest → "the one from Sarah is spam", "reply to the second: we ship Friday".

### A3 — Operator escalation fix + prompt polish

**Problem:** `OPERATOR_INSTRUCTIONS` tell the model to `escalate_to_human`
when the operator's request is ambiguous — but the human is the person
talking, and executing it on the durable operator thread parks *that thread*
to pending, tags it `needs_human`, and pushes an escalation notification back
to the same merchant (`agent-thread-sink.ts:131-150`). Circular.

**Build (all inside the operator branch of `prompt.ts` + gateway turn deps):**

- Replace the escalate-on-ambiguity clause: when unsure, **ask the merchant
  directly in the reply**; when out of scope, say so plainly and why. Remove
  `escalate_to_human` from operator-turn tool selection (allowlist filter in
  the gateway turn deps) as belt-and-braces so a stray call can't self-park
  the operator thread.
- Fix the stale channel label at `prompt.ts:225` — `sms_agent` renders as
  "WhatsApp/SMS"; say "text message (Telegram/iMessage)" or derive from the
  binding.
- Soften the brevity mandate: "default to 1–2 sentences; a short paragraph is
  fine when the merchant asks for a rundown. Still no bullet lists or
  markdown."

**Verify:** live phone round-trip (ambiguous instruction → clarifying question,
not an escalation note); operator smoke tests; confirm support prompt bytes
are unchanged (no eval needed).

### A4 — Fast-path and canned copy

**Problem:** literal `yes`/`no` — the most common replies — hit the keyword
path and get `Plan dismissed.` / `Marked 2 as spam.` / `Reply sent on ticket
2.` / bare `Done.`. The model path was told to quote the concrete action; the
fast path wasn't.

**Build (pure copy, no model calls):**

- Park `customerName` (and a one-phrase action label from
  `PLAN_STEP_LABELS`) inside `pendingPlan` at notification time
  (`planning-notifications.ts` contextPatch) so the fast path can say
  "Dismissed — I won't send Sarah the refund reply." without an extra query.
- `digest-commands.ts`: include the customer name in spam/reply confirmations
  ("Marked Jake's message as spam.", "Replied to Sarah — 'we ship Friday.'").
- `agent-execution.ts` `'Done.'` fallback → something with a pulse ("All set —
  anything else?" is too chatbot; "All set." is enough).
- Rewrite `HELP_TEXT` (`telegram/format.ts`) capabilities-first: "Text me like
  you'd text an employee — 'refund #1234', 'what's in the inbox?', 'what did
  Sarah say?'. Reply yes/no to anything I propose." Keep the command hints as
  a trailing line, not the headline.

**Verify:** unit tests on the copy builders; screenshots/phone once.

### A5 — Morning briefing v2

**Problem:** the first-night message promises "what came in, what I handled,
and what needs you"; the recurring digest
(`apps/gateway/src/maintenance/digest.ts`) delivers counts + flagged list +
command footer. No "what I handled", no pending approvals, no per-ticket
plans. This is the flagship surface (magic moment = next-morning briefing).

**Build (stay deterministic — assembled from DB, no LLM cost per digest):**

- **"Handled" section:** roll up `AgentAction` rows since the last digest
  `sentAt` — counts by category plus the notable ones spelled out (refund
  amounts, replies sent, auto vs approved).
- **"Waiting on you" section:** the org's parked approvals — pending plans
  from `OperatorContext` and threads whose `cachedPlan` is
  `needs_review`/`needs_merchant_input` older than a few hours — each with
  customer + one-phrase action ("Sarah's $12 refund — still waiting on your
  OK"). This doubles as the stale-plan nudge from A6.
- Footer: natural-language invitation first, command hints demoted to one
  trailing line (consistent with A4's HELP_TEXT).
- Keep the weekly stats line and first-night flow as-is.
- Defer: a model-written narrative digest (nice, but recurring LLM cost for
  every org every morning — revisit once merchants exist).

**Verify:** extend the existing digest unit tests (bucketing/format); one live
scheduled-digest run against the test DB.

### A6 — Pending-plan overwrite honesty + queue (last, safety-coupled)

**Problem:** `OperatorContext.pendingPlan` is single-slot; each new plan
notification overwrites the previous one silently, so the older plan stops
being approvable by text and nobody says so. Nothing ever follows up on an
ignored plan.

**Build in two steps:**

1. **Cheap and honest (now):** when a plan notification would overwrite a
   different thread's pending plan, append one line to the outgoing card:
   "(This replaces the earlier plan for <customer> — that one's still on your
   dashboard.)" Plus the A5 "Waiting on you" digest section for follow-ups.
2. **Real queue (later, deliberately):** `pendingPlans[]` with model-side
   selection ("approve the refund one"). **Do not build this before the
   AUD-001 execution-claim work** — a multi-plan ledger multiplies the
   stale/double-approval surface the codebase audit flagged. Design them
   together.

**Verify:** unit test the overwrite line; queue step gets its own plan.

### Suggested Track A order

A1 → A2 → A3 → A4 → A5 → A6-step-1. A3 and A4 are independent of A1/A2 and can
interleave. Each phase is a shippable slice with its own live verification;
nothing requires an eval run.

---

## Track B — support-adjacent expansions

Ordered by cost/leverage. Common shape: a flag-gated maintenance sweep (the
`ORDER_RISK_MONITOR_ENABLED` pattern) that turns into an operator push and,
where it acts, goes through the existing plan-approval loop. Bias per the
product rubric: escalate/ask over confident wrong action; nothing auto-sends
customer-facing text at launch.

### B1 — Daily sales pulse line in the briefing (small)

One line in the digest: orders + revenue since yesterday (vs. same day last
week if cheap). Mirror the weekly-stats pattern — computed at digest build,
failure-tolerant garnish that can never sink the digest. Needs one small
org-wide Shopify orders read (current order fetches are per-customer).
Deliberately a digest line, not an analytics surface — reports were already
cut once by design.

### B2 — Inventory awareness (read-only)

- Expose variant inventory quantities in the product serializer
  (`packages/agent/src/shopify/serializers.ts` / `products.ts`) if not already
  present — this alone makes "how many black hoodies left?" answerable in the
  operator channel and lets support answer restock questions honestly.
- Digest low-stock line behind a threshold (settings JSON key, default off).
- **Caution:** serializer changes feed the support planner's context → run the
  eval gate before shipping the serializer piece (cheap fixture probe first).

### B3 — Return-lifecycle completion

The agent opens returns/exchanges today, then goes blind. Sweep open returns;
when the reverse shipment shows delivered, push through the plan-approval
loop: "Sarah's return arrived back — approve the $42 refund?" Uses
`create_refund` + existing approval/caps as-is; attaches to the ticket thread
that opened the return. Closes the loop merchants forget, and it's the
highest-trust-building candidate of the six.

### B4 — Delivery-exception watch

Sweep fulfilled orders' tracking (existing USPS client, rate-limited); on a
stalled shipment or delivery exception, notify the operator and offer a
drafted proactive customer heads-up (via the create-thread-from-Shopify path,
`needs_review` — never auto-send). Prevents the biggest ticket class (WISMO)
instead of answering it. Flag-gated like the order-risk monitor.

### B5 — Post-resolution follow-up

N days after a closed ticket that involved a refund/exchange/replacement,
draft a short check-in ("did the replacement fit?") through the approval loop.
Cheap sweep + plan generation; pure brand-voice/trust play. Ship after B3/B4
so the merchant isn't flooded with new proactive pushes at once.

### B6 — Order-ops autonomy (module #2, largest, last)

The fraud-risk monitor is code-complete behind `ORDER_RISK_MONITOR_ENABLED`,
flag-and-notify only. Per the to-do list: write order-ops eval fixtures first,
then decide how flagged orders enter the approval loop ("hold fulfillment?")
and whether/how the module earns autonomy tiers. This is the roadmap's module
#2 and the template for every future module — don't rush it in as a sweep.

### Suggested Track B order

B1 → B2 → B3 → B4 → B5 → B6. B1/B2 are digest garnish shippable alongside A5.
B3–B5 each want one new maintenance worker + settings flag. B6 is gated on
eval fixtures and its own plan.

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
4. A6 step 2 (pending-plan queue) explicitly waits on AUD-001 — confirm that
   sequencing when the cleanup plan is scheduled.
