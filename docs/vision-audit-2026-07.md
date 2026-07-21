# Vision-Alignment Audit — 2026-07-18

Full-codebase read-only audit judged against the product vision (AI operating
layer for solo Shopify merchants; V1 wedge = customer support; messaging-first;
trust is binary; one general-purpose agent core). This is the *vision/product*
companion to the systems-safety audit in [codebase-audit.md](codebase-audit.md)
— AUD-xxx concurrency/idempotency findings live there and in
[codebase-cleanup-plan.md](codebase-cleanup-plan.md), not here.

Evidence base: full read of the schema, agent core, both operator channel
surfaces, escalation/approval path, Shopify layer, and notification fan-out;
root typecheck green; all 1,052 unit tests passing (458 agent, 164 gateway,
430 dashboard); eval baseline 97.3% (216/222, captured 2026-07-10).

**TL;DR:** The trust-critical paths — approval, escalation, execution-claiming —
are the strongest code in the repo; no live bugs found in them. The
messaging-first architecture holds: plans, questions, escalations, and digests
all fan out to every bound operator channel through one channel-agnostic layer.
What stands between this and a real merchant is not construction, it's
verification: an unverified operator-turn model, a half-finished durable-queue
rollout, and zero real traffic.

---

## 1. What's working

**Working end to end** (verified by reading the full path, backed by the
passing suites and the production rollout notes in
[codebase-cleanup-plan.md](codebase-cleanup-plan.md)):

- **Support inbound loop.** Webhook → HMAC verify → BullMQ
  (`apps/gateway/src/routes/webhooks.ts` fan-in, per-provider routes) →
  `workers/inbound.ts` → channel handlers → persistence with per-org
  `externalMessageId` dedupe → AI summary → in-process plan generation
  (`message-handlers/generate-thread-plan.ts`) → operator notification. Email
  via Postmark forwarding is the workhorse; Shopify webhooks and OAuth are
  live; Instagram is complete but org-allowlist-gated pending Meta review
  (`api/integrations/instagram/auth/route.ts:28`).
- **The plan/approve/execute spine.** `planAgent` (capture mode, no side
  effects) → `plan-preview.ts` classification (`quick_reply` / `needs_review` /
  `auto_execute` / `needs_merchant_input`) → approval from **any** surface
  (dashboard quick-approve, Telegram, iMessage) converges on
  `executeCurrentCachedHomePlan` (`packages/agent/src/plan-execution.ts:215`),
  which validates plan-hash/instruction-hash identity, claims a durable
  `PlanExecution` row before any side effect, executes the approved tool calls
  verbatim with zero model calls, and preserves ambiguity as `unknown` rather
  than retrying. Genuinely good trust engineering.
- **Escalation.** `escalate_to_human` on both hosts sets the orthogonal
  `escalatedAt` flag, keeps the thread open, writes the audit note, and pushes
  to every bound operator channel with `critical` policy (throw → BullMQ retry)
  and idempotency keys (`operator-escalation.ts`, both thread sinks).
  Auto-execute is suppressed on escalated threads
  (`generate-thread-plan.ts:126`).
- **Operator conversational layer.** Pending-state ledger rendered into the
  prompt, model-driven control tools (approve/reject/revise/answer) that effect
  transitions without authoring them, keyword fast path for literal yes/no,
  read-only inbox tools, compare-and-clear plan resolution by `planId` across
  devices (`operator-context.ts:176`). The stale-plan race is fixed —
  `notifyOperator` persists the slot before sending the card
  (`operator-notify.ts:145-153`).
- **Durable operator events (P4-03).** Completed 2026-07-20 — durable ingestion
  is the only path for Telegram and iMessage; synchronous webhook fallback removed.
- **Digest/briefing.** Timezone-aware scheduler, first-night welcome briefing,
  fan-out to all bindings on both channels (`maintenance/digest.ts`).
- **Safety rails.** Postgres-backed LLM spend cap, refund-spend reservation
  ledger with commit/release/unknown states (`tools/executor.ts:170-260`),
  static policy caps, sender-trust filtering, prompt-injection segregation of
  customer text, billing write-gate.

**Built but dark (flag-off, real code behind it):** order-risk monitor
(`ORDER_RISK_MONITOR_ENABLED`), Gmail native inbound (`GMAIL_NATIVE_INBOUND`),
async outbound email (`OUTBOUND_EMAIL_ASYNC` — never enabled in prod, zero
async sends in the strict audit baseline).

**Scaffolded only:** TikTok Shop (webhook route, signature verify, client,
OAuth callback exist but the webhook 404s unless configured; no prod config),
WhatsApp (a `comingSoon` catalog card and nothing else — correct for "next").

## 2. What's broken

**In the escalation/approval path: nothing live.** This audit looked hardest
here and came up empty — identity hashes, durable claims, compare-and-clear,
persist-before-send are all in place and consistent across the three approval
surfaces.

Ranked findings elsewhere:

1. **Telegram-only nudges misfire for iMessage merchants** — **Fixed 2026-07-20.**
   `useOperatorChannels` and updated home/agent-panel nudges now treat Telegram
   or iMessage binding as equivalent; iMessage-only merchants no longer see
   Telegram-only connect prompts.
2. **`updateContext` is a non-transactional read-modify-write**
   (`operator-context.ts:151-170`). A plan-card fan-out writing `pendingPlan`
   concurrent with an operator turn clearing `pendingQuestion` can clobber one
   slot with the other's stale snapshot. Consequences are bounded — the
   identity checks mean a wrong plan can never *execute* — worst case a parked
   plan silently vanishes or a cleared question resurrects. Theoretical-to-rare,
   but it is in the approval path's backing store.
3. **Gateway thread sink drops the org-scoping invariant.**
   `agent-thread-sink.ts` mutates threads by bare `id`
   (`updateThreadStatus`/`updateThreadTag`/`escalateToHuman`, lines 113-137)
   where the dashboard sink scopes every write by `organizationId`
   (`lib/agent/tools/thread.ts:318,388`). Not exploitable today — thread ids
   are org-validated upstream — but "every DB query is scoped by
   organizationId" is the stated invariant, and this is exactly the drift a
   future refactor turns into a cross-tenant bug.
4. **Dead customer-iMessage branch in the dashboard sink.** `sendReply`
   allowlists `CHANNEL_TYPE.IMESSAGE` and has "Reply queued via iMessage"
   success copy (`thread.ts:107,132-134`) plus a "No inbound iMessage
   conversation to reply into" error mapping (line 62), but `dispatchMessage`
   has no iMessage dispatcher anymore — the call falls through to "Unsupported
   channel." Vestige of the pre-rewire customer iMessage channel the purge job
   exists for. Dead path, not a live bug.

**Unverified rather than broken:** ~~the operator-turn model interpretation~~
**Verified 2026-07-20** via live Telegram/iMessage phone round-trips (approve,
reject, revise, ambiguous replies, multi-device plan dismissal). Async email
path (never enabled) remains unverified in production.

## 3. Core coupling check

**Verdict: the bet is holding, and order-ops proved it.** The seams are real,
not aspirational: `BaseAgentContext` vs `SupportContext` split with injected
`escalate`/`io` sinks (`agent-context.ts`), capability-filtered tool selection
so thread-less modules can never surface thread tools
(`registry/index.ts:161`), `moduleTools` injection through the shared executor,
and a host-opaque ledger string. Order-ops shipped as a second module — own
context builder, own prompt, shared loop/executor/audit — **without touching a
line of support code**.

Where support has leaked into nominally-shared space — naming and file
placement, not structure:

- `intent.ts` — ~200 lines of customer-support regexes (refund fraud,
  return-policy questions, shipping coverage) under a generic name in the core
  package. Support-only consumers.
- The whole planner pipeline (`planner.ts`, `planner-routing.ts`,
  `planner-safety/`, `plan-preview.ts`) is support's approval machinery, not a
  general capability — fine, but it lives undifferentiated next to the
  genuinely shared loop.
- Dashboard-ism in core names: `classifyHomePlan`,
  `executeCurrentCachedHomePlan` — "home" is the dashboard home page, and the
  gateway calls these too.
- The legacy `sms_agent` name is load-bearing in core (`run.ts:81`,
  `prompt.ts:259`, `context.ts:187` all special-case it).
- The "shared" tool registry is really the *support* registry (`send_reply`,
  `ask_operator`, `get_support_stats`) — workable since modules inject their
  own tools, but the name oversells it.

**No action needed now.** None of this blocked module #2 and none will block
module #3. Rename when a rename pays for itself; flagged so the labels aren't
mistaken for the structure.

## 4. Channel parity check

**The layers that matter are genuinely shared, not copied.** One
channel-neutral inbound shape (`OperatorMessageContext`), one command parser,
one digest handler, one pending-plan handler, one free-form turn executor, one
durable-event worker lifecycle, one bind-token system, and one notification
fan-out (`notifyOperator` over `OperatorBinding`) through which plans,
questions, escalations, digests, and auto-execution summaries reach **both**
channels with identical copy, identical parked state, and identical
idempotency. Approval and memory behave the same from either channel because
both converge on the same shared handlers.

**The WhatsApp tax — what would be written a third time:**

- `runImessageOperatorTurn` (`routes/imessage/message-handler.ts:102-156`) is
  a ~55-line near-verbatim copy of `runTelegramOperatorTurn`
  (`routes/telegram/message-handler.ts:56-109`) — its own comment says
  "Mirrors runTelegramOperatorTurn." Same
  help/summary/digest/pending-plan/free-form sequence, differing only in
  context-key derivation and presence.
- Plus per channel: a binding resolver, sync + durable webhook ingestion
  adapters (`webhooks-telegram.ts` / `webhooks-photon.ts`), and a
  `processXOperatorEvent` branch in `workers/operator-event.ts:97-131`.

Total per-channel surface is roughly 250-300 lines; everything below it is
shared. For two channels the duplication is tolerable; **extract the
turn-runner when WhatsApp starts, not before** — a premature abstraction over
two instances would guess wrong about what WhatsApp needs.

**Behavior drift found:** (a) durable queue on for Telegram, off for iMessage
in prod — deliberate canary sequencing, not drift; (b) presence differs
(typing indicator + 👀 vs. delayed "still working" text) — transport-justified
and properly abstracted behind `OperatorPresence`; (c) iMessage strips markdown
on notify — correct; (d) the Telegram-only dashboard nudges from §2 are the one
place a channel silently gets less; (e) cosmetic: the iMessage handler imports
`parseTelegramCommand` and `HELP_TEXT` from `routes/telegram/` — shared logic
filed under one channel's directory.

## 5. What should be removed

- **The dead customer-iMessage branch** in `lib/agent/tools/thread.ts` (§2.4),
  and — once a prod dry-run of `purge-legacy-imessage` counts zero — the purge
  job and its script.
- **The `sms` ChannelType enum value** — nothing ever creates a thread with
  it; it survives only in enum lists (`thread-constants.ts:7`,
  `channels.ts:84`, analytics event lists). Dropping it needs a migration, so
  it is cheap to leave — but it is noise in every channel switch.
- **`channel-roles.md` TikTok rows are factually stale** — they say "no real
  adapter, OAuth flow, webhook handler" and "no implementation found" while
  `webhooks-tiktok-shop.ts`, `clients/tiktok-shop.ts`, the dispatch path, and
  OAuth callback routes all exist (with active test work on them). Fix the doc
  or it will mislead the next planning pass.
- **Housekeeping:** 4 stale stashes (including a "Security Fixes" WIP from an
  old commit) and ~20 merged local branches. Risk is losing something real in
  the noise.

**Deliberately not on the removal list:** the analytics package (operational
product telemetry, not merchant-facing analytics dashboards — it earns its
weight), the team page (thin Clerk-membership + device-binding management, not
multi-seat scope creep), the Review page + `AutonomyShadowDecision` (the
autonomy-graduation rig — load-bearing for principle 3), and the gateway
scripts directory (ops tooling with a track record of being needed).

**Open question (needs a decision, not a guess):** TikTok Shop.
[channel-roles.md](channel-roles.md) frames it as a *feasibility spike to
investigate*
([tiktok-shop-customer-service-api-spike.md](tiktok-shop-customer-service-api-spike.md)),
but the repo contains a built (gated, unconfigured) integration with active
test work. Is the current code the feasibility spike in progress, or does it
predate the doc's decision? If the latter, it is the one sizable cut
candidate; if the former, carry on and update both docs.

## 6. What drifted from the vision

- **The big feared drift didn't happen.** Messaging-first is structurally
  real: the operator channel is the primary approval surface, the notification
  layer is channel-agnostic, and the dashboard poll loop is the fallback.
- **Order-ops exists** (`packages/agent/src/order-ops/`,
  `workers/order-review.ts`, ~420 lines) despite "none of it gets built now."
  It is flag-off, tiny, and was the vehicle for proving the core seams — drift
  by the letter, defensible in spirit. Keeping it dark costs nothing; just
  don't grow it.
- **TikTok Shop** — see the open question above. Building ahead of the
  feasibility answer is the drift pattern, whichever way it happened.
- **Dashboard weight.** The dashboard is ~400 source files against the
  gateway's ~140. Much is the legitimate setup/review surface, but the command
  palette, nine help-content files, and the swipe-deck/animation layer are
  dashboard-first polish the vision explicitly de-prioritizes. Not harmful —
  but it is where hours went that the merchant on the phone never sees.
- **The `pending` thread status** survives (its retirement is eval-gated and
  was blocked on API credits) — known, in-progress vestige, not new drift.

## 7. What's next

The smallest path to a real merchant is a design partner and closing the
remaining rollout windows — not more operator-channel construction:

1. ~~**Live-phone verification of the operator turn.**~~ **Completed 2026-07-20.**
2. ~~**Finish the P4-03 window.**~~ **Completed 2026-07-20** — durable ingestion
   is the only path; synchronous fallback removed.
3. **Get the design partner.** Every remaining rollout item in
   [codebase-cleanup-plan.md](codebase-cleanup-plan.md) (ledger enforce mode,
   email async canary, Shopify mutation canaries, representative traffic) is
   blocked on real traffic. A design partner *is* the canary. Constraint to
   plan around: with Instagram behind the Meta-review allowlist, the first
   merchant is realistically email-forwarding + Shopify + phone.
4. ~~**Fix the Telegram-only nudges** (§2.1).~~ **Completed 2026-07-20.**

Explicitly *not* needed first: the coupling renames, the turn-runner
extraction, TikTok, `sms` removal, or any new capability.

## 8. Progress

Honest read: **late-beta, and closer than the roadmap docs' tone suggests.**
The hard, trust-critical engineering — durable approval claims,
identity-checked execution, escalation-over-confidence, channel-agnostic
operator UX, spend/refund caps, audit trails, durable operator ingestion — is
done and tested to a standard most launched products don't meet. Prod is on
current master with all migrations applied; P4-03 is complete. The remaining
risk is concentrated in rollout evidence without a real merchant (ledger
enforce mode, Shopify/email canaries) and product expansion (A2 digest triage,
design partner). The failure mode to guard against now isn't a bad refund;
it's spending another month hardening rails nobody has ridden. Get merchant #1.
