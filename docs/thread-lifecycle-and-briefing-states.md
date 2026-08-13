# Thread Lifecycle & Briefing States

**Delete this file when every phase below is checked and its closing evidence is
recorded in the commit messages.** Nothing here is reference material — the
standing rules it relies on already live in `.claude/CLAUDE.md` and
`docs/product-truth.md`.

## The problem, in one sentence

The agent can report exactly two states — *plan ready* and *nothing to report* —
and an open thread is actually in one of five. Every symptom below falls out of
that single gap, so the phases are ordered to close it rather than to patch the
symptoms.

Diagnosed 2026-08-12 against the live `Palette` org (13 open threads, 5 genuine),
from a real 8:00am briefing that read:

> One thing's still waiting on your OK: • Reply · Storefront visitor…
> Also open: • Canary: Where's my order? • Storefront visitor: Unclear one-word
> message …and two more
> Want me to go ahead with it?

Five items, one pronoun, and the four in "Also open" all had `cachedPlan = NULL`:

| Thread | Age | Last conversational msg | Why no plan |
| --- | --- | --- | --- |
| Canary Shopkeeper · Order Status | 65h | none | no conversational message — `generateThreadPlan` bails at `apps/gateway/src/message-handlers/generate-thread-plan.ts:110` |
| Storefront visitor · Unclear one-word message | 93h | **agent** | agent answered, visitor never returned; cache actively cleared at `generate-thread-plan.ts:111-114` |
| Ayumu Hirano · Order Status | 131h | none | no conversational message — same as Canary |
| Walle Walson · Unclear one-word message | 186h | customer | seeded straight into the DB — **see P0** |

Corrections from the P0 dig, against org `9b81d9c8-9205-48da-90d1-66732f0f5dbd`
(the Palette with 14 open threads, not the 63-thread one): the two Order Status
threads are not empty. Each holds two `note` rows written by the Shopify order
webhook (`New order #1026 was placed.` / `Order #1026 has been updated.`), which
is why they read as zero — notes are not conversational. The storefront thread's
agent message is a real auto-executed reply, not an auto-ack.

All four were `escalatedAt = null`, because escalation is model-elected during a
run and none of these threads ever got a run. The one mechanism built for "you
handle this" is unreachable exactly when the agent is most stuck.

## Guidelines for this work

These are the constraints that make the difference between fixing this and
growing it. Read them before writing code.

1. **Derive the states, do not migrate for them.** Every state below is
   computable from rows that already exist (`Thread.status`, `cachedPlan`,
   `escalatedAt`, `Message.senderType`). No new column, no migration. Prod
   schema drift is a known hazard here (see the threads one-open-per-customer
   index note in agent memory) and this work does not need to touch it.
2. **Solve it deterministically, not in the prompt.** Closing a finished thread
   and naming a blocked one are sweep-and-render problems. Do not add prompt
   bullets or teach the planner new behavior — the storefront-chat plan already
   records five consecutive commits that tuned wording and none of them worked.
   Only P6 touches model-visible behavior, and it is eval-gated.
3. **Notification shape follows the decision the merchant actually has.** A
   state the merchant cannot act on is *reported*, never *asked*. A state they
   must act on gets one unambiguous ask, scoped to exactly the items it covers.
4. **The support-planner surface stays behind the eval gate.** P1–P5 must not
   change `packages/agent/src/planner.ts`, `prompt.ts`, or the shared tool
   registry. P6 does, and budgets one justified eval run for it.
5. **No phase closes on production traffic or merchant feedback.** Every closing
   condition below is a test, a seeded local run, or a code assertion. If a
   phase looks like it needs a soak, the phase is specified wrong.

## The state vocabulary

One pure function over an open, non-filtered thread. This is the whole
**briefing-state** abstraction; nothing else gets added to the digest renderer.
It is not the customer-memory or conversation-boundary abstraction. A `Thread`
is one bounded conversation episode, while persistent identity, request-scoped
planning, explicit obligations, and relevant prior memory are governed by
[conversation-context-and-cross-channel-memory-plan.md](conversation-context-and-cross-channel-memory-plan.md).

| State | Condition | Merchant reads it as |
| --- | --- | --- |
| `awaiting_approval` | a current cached or parked plan exists | "say yes and I'll send it" |
| `awaiting_customer` | last conversational message is `agent` / `ai` | "I answered; they've gone quiet" |
| `blocked_no_plan` | pending customer message, no current plan | "I couldn't work this one out — it's yours" |
| `empty_thread` | zero conversational messages | never surfaces; P4 stops creating these |
| `handled` | `status = closed` | out of the briefing entirely |

`awaiting_approval` covers `quick_reply`, `needs_review` and
`needs_merchant_input` alike — the current split between them is exactly the bug
in P1.

### The substance gate, which is not a state

A state says what a thread is waiting on. It does not say whether the thread is
worth the merchant's attention, and those are different questions: a bare
"hello" on the storefront is `blocked_no_plan` by every condition above and is
still nothing anyone should be asked about. A store gets a thousand of those a
week.

So one signal sits across the whole table: `classifierSignals.intents.no_request`
— the customer has not said what they want yet. A thread carrying it is reported
in **no** section, on any channel. Getting the customer to say more is the
agent's own work, and it only becomes the merchant's when there is a real
question the agent cannot answer.

It is the classifier's judgment rather than a rule over the message text, and
that is deliberate: no length or shape test separates "sweater ripped" from "yo",
and wrongly hiding a two-word complaint is the one failure here that costs a real
customer. The signal defaults false everywhere it is missing, so threads
classified before it existed keep reporting.

The **approval list is exempt**. A parked plan stays listed whatever prompted it,
because "yes" still approves it out of the operator ledger, and a briefing that
hides what "yes" would do is worse than a noisy one.

---

## P0 — Explain the 186-hour thread

- [x] **Find out why `Walle Walson · Unclear one-word message` has a pending
  customer message and no cached plan.** Answered 2026-08-12 against thread
  `78367d0b-619f-4184-b007-42f21e8d1084`.

**That thread is a seeding artifact, not a mechanism.** Its first message
("Test", 3 Aug) arrived through the email integration and was classified
`questionable`, so it correctly got no plan. The two messages on 5 Aug carry
`integrationId = null` and `externalMessageId = null`, which no inbound path
produces, and the row's `lastMessageAt` is 37ms *later* than the newest message's
`sentAt` — `processInboundMessage` copies `created.sentAt` verbatim and cannot
write that. `filterDecidedAt` equals `lastMessageAt` to the millisecond, so one
update wrote both from a shared `new Date()`, while `filterReason` still
describes the 3 Aug "Test". No product path writes that combination; nothing in
the dashboard PATCH or `digest-triage` touches `filterDecidedAt` alongside
`lastMessageAt`. Those messages went straight into the DB, so no summary job was
ever enqueued and no plan was ever attempted. There are no `AgentAction` or
`PlanExecution` rows on the thread.

**The state is still reachable, so `blocked_no_plan` is real and is a bug.** Plan
generation only ever runs off an inbound message, and two ordinary merchant
actions leave a thread genuine, open, holding a pending customer message, with no
plan and nothing that will ever make one:

- **Recovering** a filtered or questionable thread — `useTicketActions.ts:248`
  PATCHes `filterStatus: genuine` + `filterFeedback: confirmed_genuine`, and
  nothing re-plans. The classifier will not revisit it either: `filterDecidedAt`
  is a one-shot lock (`intelligence.ts:111`).
- **Reopening** a closed thread — the same PATCH clears `cachedPlan` and
  `cachedPlanMessageId` on any `status` write
  (`apps/dashboard/src/app/api/threads/[id]/route.ts`).

Both heal only if the customer happens to write again. Ruled out along the way:
the summary job never silently drops a plan outside business hours
(`ai-summary-flow.ts:159` still precomputes), and the classifier cannot flip a
verdict mid-job, because `filterDecidedAt` locks it.

**Closed:** the cause above is recorded in the P0 commit, "Pin the state a
recovered thread is left in".

The test that held this open asserted a plan appears after recovery, which no
phase here builds — P3 names `blocked_no_plan` as a handoff rather than
re-planning on a dashboard write, so it would have stayed red forever. Rewritten
to pin the state the PATCH actually leaves:
`apps/dashboard/src/app/api/threads/[id]/route.test.ts` — "leaves a recovered
thread blocked with no plan for the message it is holding" asserts the three
facts `blocked_no_plan` derives from (open, customer has the last word, no
cached plan). **A re-plan trigger on recover/reopen is deliberately not in this
file** — if it is ever wanted it is separate work, and P3 has to ship first so
the state is visible before anything tries to fix it.

---

## P1 — Stop losing drafted plans

- [x] **`loadStaleThreadWaitingItems` must not skip `quick_reply`.**
  `apps/gateway/src/maintenance/digest-briefing.ts:746` continued past any
  classification that was not `needs_review` or `needs_merchant_input`.

Shipped as a removal of the classification filter, not an extra allowed kind. A
plan still cached three hours after its thread last moved was not executed,
whatever shape it is, so it is waiting on the merchant by definition — and the
filter was wrong in the other direction too: it called `classifyHomePlan(plan)`
with no settings, so it judged every plan at the default `guarded` tier instead
of the org's own.

This is the smallest change here and the most immediately wrong behavior.
`OPERATOR_PLAN_QUEUE_MAX` defaults to 1 and `appendPendingPlan` keeps only the
newest (`apps/gateway/src/operator-context.ts:317`), so a second ticket evicts
the first from the phone's approval slot. If the evicted plan was a
`quick_reply`, the stale scan then refuses to re-surface it — the drafted reply
sits in `cachedPlan` forever, unsent and never mentioned again.

The live `Palette` org is one ticket away from this: its only pending plan is a
`quick_reply`.

**Closed:** `digest-briefing.test.ts` — "re-surfaces a quick reply the operator
queue evicted" parks two plans at a queue max of one and asserts the evicted
`quick_reply` comes back from `loadWaitingOnYouItems`. Verified red against the
unfixed source (it returned only the kept thread). `OPERATOR_PLAN_QUEUE_MAX` was
not raised — that cap is gated on separate work (see agent memory on the
A6-step-2 queue).

---

## P2 — Derive the lifecycle state

- [x] **One exported pure function returning the state table above**, unit-tested
  per row, living beside the briefing helpers it serves. It takes the thread plus
  its last conversational message and the plan classification — no queries of its
  own, so the tests need no fixtures beyond plain objects.
- [x] **Wire it into the digest's thread load** so `buildOrgDigest` carries a
  state per open thread instead of one undifferentiated `genuine` bucket.

Reuse `getCurrentPlanForThread` and `classifyHomePlan`; do not re-derive "is
there a current plan" a second way. `SENDER_TYPE.NOTE` rows are not
conversational and must not count as the agent answering.

**Closed:** `deriveThreadLifecycleState` in `digest-briefing.ts`, eight unit
tests in `digest-briefing.test.ts`. It takes `planKind: HomePlanKind | null` —
null carries "no current plan", so the caller derives that once through
`getCurrentPlanForThread` and nothing re-spells it. Every kind collapses to
`awaiting_approval`, including `auto_execute`, which stays cached and unexecuted
under `autoExecuteMode` off and shadow.

`buildOrgDigest` returns `lifecycleStates` for every open non-filtered thread;
`digest.test.ts` — "carries a lifecycle state per open thread without changing
the message" — rebuilds the four threads from the table above, asserts a
distinct state for each, and asserts the message is unchanged. The parked-plan
input is the existing `waitingThreadIds` set, so the operator ledger is read
once rather than queried a second way. Two notes for P3:

- The thread select in `digest.ts` now carries `cachedPlan`,
  `cachedPlanMessageId`, and the newest non-note message, in the same descending
  `take: 1` shape `loadStaleThreadWaitingItems` uses.
- `classifyHomePlan` is called with `resolveAgentSettings(settings)` and the
  thread's `filterStatus`, not bare — the org's own tier, which is the bug P1
  found in the call it deleted.

---

## P3 — The briefing says which state each thread is in

- [x] **Render `awaiting_customer` and `blocked_no_plan` as their own sections**,
  distinct from the approval list. `blocked_no_plan` reads as a handoff, in the
  agent's voice, naming what it could not do — this is the honesty principle the
  screenshot is missing.
- [x] **Scope the closing ask.** `formatWaitingAsk` returned "Want me to go ahead
  with it?" whenever exactly one plan was waiting, regardless of how many other
  items the message listed. The ask must name what it covers or not appear.
- [x] **Delete the `WAITING_HIDE_OTHER_OPEN_AT` suppression.** The roll-up
  disappeared once three approvals were queued, so the briefing showed *less* of
  the inbox as the backlog grew. With the sections separated there is no reason
  to hide it.
- [x] **`empty_thread` never appears** in any section.

Keep the existing composition discipline: no em-dashes, counts under ten spelled
out, blank lines between items that wrap on a phone. The `filedSince` scoping in
`bucketDigestThreads` is correct and stays — do not turn any new section into a
running total (see the digest stock-vs-flow note in agent memory).

**Closed.** Four section builders in `digest-briefing.ts` over one
`formatTicketRollup`: the approval list, `formatBlockedSection`,
`formatAwaitingCustomerSection`, and `formatOtherOpenSection`. `buildOrgDigest`
partitions the genuine threads that are not already in the waiting list by their
lifecycle state, so what is left in "Also open" is `awaiting_approval` threads
whose plan is not yet stale enough to be parked, and `empty_thread` matches
nothing and is rendered nowhere. The ask names its own list back
("…the one waiting on your OK?"), which is the header `formatWaitingList` writes.

`digest.test.ts` — "gives each lifecycle state its own section and scopes the ask
to the approval" rebuilds the `Palette` state plus one fresh-plan thread for the
residual case, and asserts each thread sits under the heading that describes it
rather than merely appearing somewhere. Verified red against the unfixed source,
which put Walle and Ravi in one "Also open" roll-up reading "…and three more" —
the three being the two message-less Shopify threads and the answered visitor.

Two things the staged read (`stage-digest.ts`, seeded local org) caught that the
bullets above did not:

- The open count restated the section above it. "One I couldn't work out a next
  step on, so it's yours: Priya" was followed by "You've got one open ticket",
  which counts the same ticket again in a neutral voice directly under the
  sentence handing it over. The approval list had always suppressed that line;
  every section that names tickets now does. The spam disclosure is not a
  restatement and still lands.
- Sections were separated by a double blank line whenever the briefing had no
  approvals, because the roll-up pushed a separator that the handled block had
  already written.

`stage-digest.ts` now prints the message it builds before the operator-binding
check bails, since composition can only be judged by reading it and that
otherwise needed a bound phone.

**Reopened once and closed again**, on two objections to the first render that
the phase as written would not have caught:

- **A handoff has to carry everything needed to answer it.** The first version
  rendered `Walle: Unclear One Word Message` — the classifier's `title`, which is
  a topic label and never states the request. The second quoted the customer but
  cut at 80 characters, which is the same dead end from the other side: the
  merchant learns a sentence existed. Either way they have to ask what the
  message said, the agent explains, and only then can they act — one round trip
  the briefing exists to remove.

  `formatBlockedSection` now quotes the message whole whenever it fits in 120
  characters, because exact words beat any paraphrase and that is the case where
  nothing is lost. Past that it uses `aiSummary`, a complete one-sentence
  statement of the request. Only one branch can still elide: a long message with
  no summary ever written, and it cuts at the summary budget rather than the
  quote budget. `DIGEST_SUMMARY_TRUNC` went 90 to 140 for the same reason, since
  a normal summary was losing its last clause in the flagged block.

  The short-message branch is also what passes a bare "yo" through verbatim if
  one ever reaches a handoff, rather than as someone's description of it.
  Reading `Walle: "Test"` is what made the second objection below obvious.

  **And it has to sound like a person wrote it.** `aiSummary` is third-person
  present for a dashboard field, so under a name it read `Dana: Customer asks to
  move order #1043…` — the noun repeats what the line just said, and the present
  tense narrates something hours old as though it were happening now.
  `humanizeReportedSummary` makes the person the subject and the verb past:
  `Dana asked to move order #1043…`. It rewrites the opener only, over the closed
  verb set the classifier prompt offers, and returns null on prose that never
  opened in reported speech so nothing is invented around it. Rewording the body
  stays the classifier's job — per-phrase fixes here have been tried and deleted
  once already. The quote branch matches: `Priya asked: "…"` on any message
  containing a question, `wrote` otherwise. The flagged block got the same
  treatment, since it carried the identical tell two sections down.
- **An unclear message is not escalate-worthy at all.** The briefing was naming
  both a one-word "Test" and a storefront "hello" the agent had already answered.
  Neither is a decision the merchant owes. The substance gate above now drops
  them, and the closing test asserts that Walle and the storefront visitor appear
  nowhere while a substantive unplanned question still lands in the handoff.

The behavior half of that second objection — the agent should reply asking what
the customer needs, and escalate only once there is a real question it cannot
answer — is **P7**, because it edits `prompt.ts`.

---

## P4 — Close what is finished; stop creating what cannot start

- [ ] **A maintenance sweep closes `awaiting_customer` threads after 7 days of
  customer silence.** Fixed window, no new settings key — the target user is a
  solo merchant. The thread is visible in the briefing's `awaiting_customer`
  section for every one of those days first, so closing is never a surprise.
- [ ] **Keep cleanup separate from conversational rollover.** The seven-day
  sweep controls inbox retention; it must not be the boundary that decides what
  the agent reads. On a new inbound message, the shared episode resolver closes
  and rolls a hard-idle episode according to its channel policy before
  persistence, even if this maintenance sweep has not run. Open obligations
  survive as structured person-level state; old transcripts and cached plans do
  not follow the shopper into the new episode.
- [ ] **Stop creating message-less threads, or close them on the same sweep.**
  Two paths make them, and the two in the table above came from the first:
  `handleShopifyJob` (`message-handlers/channels.ts:375`) calls
  `processInboundMessage` with `synthetic: true`, which creates a `shopify`
  thread whose only rows are `note`s and which skips the summary job outright
  (`inbound-persistence.ts:268`); and `POST /api/threads/shopify` creates an
  `email` thread from a Shopify customer record with no messages at all. Neither
  can ever be planned or closed by the agent.

Nothing currently closes a thread except a human. `update_thread_status` exists
with a bare one-line description
(`packages/agent/src/tools/registry/thread.ts:30-31`) and
`SUPPORT_INSTRUCTIONS` never tells the agent when to use it;
`apps/gateway/src/maintenance/retention.ts:22` only archives threads that are
*already* closed. So the open count is monotonic — eight of `Palette`'s thirteen
open threads are filtered newsletters that will sit until the 90-day purge.

Do not fix this by adding a "close the ticket when you're done" prompt bullet.
Guideline 2.

**Closes when:** the sweep has a test that closes a 7-day-silent thread and
leaves a 6-day one open, and a test proving a thread with a newer customer
message is never closed. Separate episode-resolver tests must prove that a
returning customer gets a fresh context before seven days when the channel hard
boundary has elapsed. Run the sweep against a seeded local DB and confirm the
open count drops to the threads that genuinely need someone.

---

## P5 — Noise filtering beyond email

- [ ] **Scope the classifier's filter past email.**
  `apps/gateway/src/message-handlers/intelligence.ts:108` records the current
  scope: "Spam filter scope is email only — IG/Shopify/SMS threads stay genuine."
  Storefront chat is the newest channel, the one most exposed to anonymous
  traffic, and the one with no filter — which is why a one-word message from an
  unidentified visitor is a permanent ticket in the morning briefing.

Prefer `questionable` over `filtered` for any live customer-origin channel. A
`questionable` thread surfaces in the digest's flagged block where the merchant
can act on it; a `filtered` one is binned with no un-filter path on the operator
channel. Getting this wrong on storefront chat means silently binning a real
shopper.

**This is spam scope, not noise scope — do not conflate them.** A one-word
"hello" from a real shopper is not spam, and P3's `no_request` gate already keeps
it out of every briefing section. What P5 decides is whether an *unsolicited
pitch* arriving over storefront chat gets filtered the way the same pitch would
by email. Check the interaction while doing it: a thread that is both
`questionable` and `no_request` still renders in the flagged block, which asks
"want me to do anything with those?" — decide deliberately whether the substance
gate should reach that block too, rather than discovering it on a phone.

**Closes when:** tests cover a one-word storefront message landing
`questionable`, and a substantive storefront question still landing `genuine`.

---

## P6 — Align auto-execute with what the prompt already promises

- [ ] **A pure `send_reply` plan must be eligible for auto-execute at the tiers
  whose prompt says it is.**

`classifyHomePlan` only reaches `auto_execute` inside
`if (mutativeCalls.length > 0)` (`packages/agent/src/plan-preview.ts:225`), so a
plan whose only action is `send_reply` has zero mutative calls and falls through
to `quick_reply` — and `maybeAutoExecuteCurrentCachedHomePlan` runs
`allowedKinds: ["auto_execute"]` only
(`packages/agent/src/plan-execution.ts:400`). Meanwhile the tier bodies at
`packages/agent/src/prompt.ts:108-117` tell the agent "Auto-reply to information
questions" at guarded, trusted, broad *and* full.

The execution layer cannot honor that at any tier, while a $250 refund at `broad`
*can* auto-execute. The product will move money on its own before it will answer
"where's my order?" on its own — inverted against the principle that failure
modes matter more than success modes.

Two defensible resolutions. Pick one and record why in the commit:

- **Make information replies auto-executable** at `TIERS_THAT_AUTO_EXECUTE`,
  keeping every existing static-policy and questionable-sender check. This is
  what the prompt already claims and what makes the briefing quieter.
- **Correct the prompt** so no tier claims an autonomy the executor does not
  grant, and leave every reply on approval.

Do not ship both halves of the first option at once. Route it through
`autoExecuteMode: "shadow"`, which already exists as this rail and writes
`AutonomyShadowDecision` rows — seed the fixtures, read the decisions, then
enable.

This phase changes the support-planner surface, so it owes the eval gate
(guideline 4). Budget **one** full run, after the change is otherwise complete —
no tune-then-rerun loop. Justify it in the commit as: classification routing
changed for the most common plan shape in the product.

**Land P7 first and share the run.** Both phases edit the same eval-gated
surface, and one gate run covering both costs half of two.

**Closes when:** the eval gate is green, shadow decisions on seeded fixtures show
the intended classification for information replies and no change for mutative
plans, and `guarded` (the onboarding default) still auto-executes nothing. If the
second resolution is chosen, it closes on the prompt diff plus a test asserting
no tier string promises auto-reply.

---

## P7 — The agent asks the customer to clarify instead of escalating

- [ ] **A message with no identifiable request is not an escalation.** The agent
  replies asking what the customer needs. Escalation is for a *real* question it
  cannot answer.

`SUPPORT_INSTRUCTIONS` has no rule for this, and its escalation guidance points
the wrong way: "When you are uncertain about the right action ... call
escalate_to_human instead of guessing" (`packages/agent/src/prompt.ts`). A bare
"yo" is maximal uncertainty about the right action, so the rule as written argues
for escalating it. The one send-the-customer-a-question rule that does exist is
scoped to a single case — an order-status question from someone the agent cannot
identify — and does not generalize.

P3's `no_request` gate stops these reaching the merchant through the *briefing*.
It does nothing about the agent escalating one mid-run, which puts it on the
merchant by a different road, and nothing about the drafted plan an unclear
message produces.

The rule to add, near the existing `ask_operator` / `escalate_to_human` /
`send_reply` triage block:

> A message with no identifiable request — a bare greeting or a stray fragment —
> is not an escalation and not a question for the merchant. Reply asking what
> they need. Escalate only once there is a real request you cannot answer.

Note the ordering constraint: the agent decides this from the message in front of
it, not from `no_request`, which is written by the classifier *after* the same
message and is not in the planner's context. Do not plumb the signal into the
prompt to make the two agree — one is a rendering gate, the other is behavior,
and coupling them makes the classifier's verdict load-bearing for what the agent
says to a customer.

**Closes when:** the eval gate is green and a fixture covering a contentless
message plans `send_reply`, not `escalate_to_human`. Shares its gate run with P6
(land this first) — both edit the same surface, and one run covers both.

---

## Out of scope

Named so nobody widens this file into them. Each is real and separately filed or
separately worth filing:

- Conversation episodes, request summaries, cross-channel identity, obligations,
  and relevance-gated memory. These are separately specified in
  [conversation-context-and-cross-channel-memory-plan.md](conversation-context-and-cross-channel-memory-plan.md).

- The brand-voice cold start (`brandVoice: ""` by default, `VoiceEdit` captured
  only from `POST /api/messages`, proposals approvable only in the dashboard).
- `saveMerchantAnswerToKb` firing on `revise_pending_plan` when there is no
  pending question, titling a KB article with the merchant's revision guidance.
- The org-wide `updatedAt desc take 3` KB preload in
  `packages/agent/src/context.ts:138`.
- Integration health never reaching an operator channel (a dead Gmail refresh
  token logs and flags the dashboard only).
- Storefront chat inheriting an approval latency built for email.
