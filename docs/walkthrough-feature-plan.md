# Hard-Ticket Walkthrough Plan

**Goal:** turn the home briefing's primary CTA into a conversational lane that walks the
merchant through only the tickets that need their judgment — the ones the agent flagged
(`needs_review`), plus high-priority ones (VIP repeat customers, refunds/returns). Routine
replies stay in the `NeedsYou` deck and never enter this lane. The agent leads with *why*
each ticket needs a human, recommends, and the merchant approves / skips / opens / asks back.

Written 2026-06-13.

---

## Why this shape

The merchant interacts from a chat surface (principle 2), the agent should feel like an
employee with judgment and the honesty to say "you handle this" (principle 1), and trust is
binary — one bad refund in a 20-item batch undoes months of goodwill (principle 3). Three
decisions fall out of that:

1. **Conversational *reasoning*, deterministic *execution*.** The LLM narrates, groups, and
   advises — it **never** calls a mutating tool in a loop. Every approval routes through the
   existing `executeCurrentCachedHomePlan` / `/api/agent/quick-approve` path, with the same
   policy backstops (`maxRefundAmount`, `blockCancellations`). The human taps to confirm.
2. **Hard subset only.** The routine clear-down is already solved by the `NeedsYou` swipe
   deck. Forcing routine replies through a conversation is overhead. The walkthrough is the
   small (usually 3–8) set of tickets that genuinely need a call.
3. **Dashboard-host, not the shared core.** "Pending approvals" is a *support* concept
   (cached support plans awaiting human sign-off). Putting a `list_pending_approvals` /
   `approve_pending_plan` tool into `packages/agent/`'s registry would couple the
   general-purpose core to the support module (violates principle 4). All new code lives in
   the dashboard host, next to the existing approval plumbing.

---

## Current state (what exists, what we replace)

A first pass wired the briefing button to *auto-send a free-text message* ("Walk me through
20 pending approvals") into the Concierge chat. That agent has no tool to see the approval
queue, so it correctly declined ("I don't have a tool to view pending approvals") — an honest
answer to a question we should never have routed there. This plan **replaces that approach**.

Already in place and reused:

- **The queue query** — `loadNeedsAttention()` in
  `apps/dashboard/src/lib/server/home-summary.ts` loads every open thread with a current
  cached plan, classified via `classifyHomePlan` into `quick_reply` vs `needs_review`, with
  per-item copy from `buildPlanPreview` (`headline`, `proposal`, `actionText`) and
  `planReplyText`. Returned as `HomeNeedsAttentionItem[]` on the home summary.
- **The execution path** — `/api/agent/quick-approve/route.ts` →
  `executeCurrentCachedHomePlan({ threadId, allowedKinds, ... })`. Policy-enforced. Same
  logic the deck's one-tap Approve already uses.
- **Approve-able message UI** — the `awaitingApproval` amber bubble + Approve / Not-now
  buttons in `apps/dashboard/src/components/agent/AgentChatView.tsx` (`AgentMessage`).
- **The panel open seam** — `useAgentPanel().open(context)` +
  `AgentPanelOpenContext` in `apps/dashboard/src/lib/agent/panel.ts`. The `autoPrompt`
  field added in the first pass is **repurposed** into a structured `walkthrough` payload.
- **Interrogation endpoint** — `/api/agent/chat/route.ts` (the Concierge session turn).
- **Bubble fix already shipped** — agent bubble padding `pl-4 → px-4` in `AgentMessage`.

Untouched by this plan: the `NeedsYou` deck (still the full clear-down), the core registry
(`packages/agent/src/tools/registry/`), and `tools/executor.ts`.

---

## The walkthrough set

Computed from the existing `needsAttention` items (all of which already have a cached plan,
so all are approvable). Include an item when **any** of:

- `kind === "needs_review"` — the agent's own "you handle this" flag (refunds, cancels,
  over-cap amounts, low-confidence drafts). *Already computed.*
- `isVip === true` — customer with ≥3 inbox tickets. **New per-item flag.**
- `tag === "Returns"` — money-touching. *Already on the item.*

Exclude everything else (routine `quick_reply` → stays in the deck).

**Ordering** (priority first): money/`needs_review` → VIP → oldest (`timeAgo`). A small score
function, not an LLM call.

---

## Phase 1 — Data layer [COMPLETED]

**`apps/dashboard/src/lib/home/summary-contract.ts`**
- Add `isVip: boolean` to `HomeNeedsAttentionItem`.

**`apps/dashboard/src/lib/server/home-summary.ts`**
- In `loadNeedsAttention()`, after loading the threads, compute a ticket count per
  `customerId` for the loaded set (one grouped `COUNT(*)` over inbox threads, reusing the
  `canonicalInboxThreadWhere` scope and the same `>= 3` threshold the summary's
  `vips_in_queue` already uses). Set `isVip` on each item.
- No change to the `currentPlanPredicate` / selection — the set is still "open threads with a
  current cached plan"; we only enrich each item.

**`apps/dashboard/src/lib/home/walkthrough.ts`** *(new)*
- `selectWalkthroughItems(items: HomeNeedsAttentionItem[]): HomeNeedsAttentionItem[]` —
  filter (`needs_review || isVip || tag === "Returns"`) + priority sort.
- `walkthroughPriority(item): number` — money/`needs_review` highest, then VIP, then age.
- Pure functions, no I/O.

**Tests** — `apps/dashboard/src/lib/home/walkthrough.unit.test.ts`: filtering and ordering
across mixed fixtures (routine excluded; VIP routine included; needs_review first; Returns
included). Pure-function unit test, no DB.

---

## Phase 2 — Home wiring [COMPLETED]

**`apps/dashboard/src/app/dashboard/_components/home/useHomeData.ts`**
- Derive `walkthroughItems = selectWalkthroughItems(home.needsAttention)` and
  `walkthroughCount = walkthroughItems.length`; return both.

**`apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx`**
- Replace the `autoPrompt` open with a structured walkthrough open:
  `open({ source: "home", walkthrough: { items: walkthroughItems } })`.
- Button label: `walkthroughCount > 0`
  → `Walk me through ${walkthroughCount}` (consider a softer "the N that need your call"),
  else → `Ask ${agentName}` (free chat, no walkthrough payload).
- Keep `Browse all tickets` as the quiet secondary link.
- Pass `walkthroughItems` / `walkthroughCount` down from `DashboardHomeClient`.

---

## Phase 3 — Panel walkthrough mode [COMPLETED]

**`apps/dashboard/src/lib/agent/panel.ts`**
- Replace `autoPrompt?: string` with:
  ```ts
  walkthrough?: { items: WalkthroughItem[] }
  ```
  `WalkthroughItem` = the fields the panel needs (`threadId`, `kind`, `customerName`,
  `customerMessage`, `channelName`, `tag`, `isVip`, `headline`, `proposalSummary`,
  `actionText`, `replyText`, `orderRef`, `timeAgo`). Define it here or import the home item.

**`apps/dashboard/src/app/dashboard/_components/agent-panel/AgentPanelRoot.tsx`**
- `restoreSession={!openContext?.walkthrough}` (was `!autoPrompt`) — a walkthrough always
  starts a fresh session and clears `SESSION_KEY`, so the seeded sequence isn't clobbered by
  async session restore.

**`apps/dashboard/src/components/agent/AgentChatView.tsx`** (+ a new
`WalkthroughBriefing.tsx` helper to keep this file lean)
- When `openContext.walkthrough` is present, render a **deterministic spine** driven by the
  client (not the LLM):
  - **Opening message** in the agent's voice — templated summary of the set
    ("You've got 5 that need your call — 2 refunds over your cap, a VIP return, …").
    Counts derived from the items; no LLM call required for v1.
  - **Per-item briefing bubble** (current item only), built by
    `buildWalkthroughBriefing(item)`: a 1–2 sentence agent-voiced "why I flagged this +
    recommendation" templated from `proposalSummary` / `actionText` / `replyText`, the
    classification reason, and the VIP/Returns/age signals. Rendered with the agent avatar so
    it reads as conversation.
  - **Controls** per item: **Approve** (consequential `needs_review` items get the deck's
    double-confirm), **Skip**, **Open ticket** (`/dashboard/tickets?thread=${threadId}`).
  - **Approve** → `POST /api/agent/quick-approve { threadId }` → on success, append a "Done —
    sent." line and advance to the next item; on failure surface the error inline and stay.
  - **Skip** → advance without acting. When the list is exhausted, a closing "That's
    everything that needed you." message; the input stays live for free chat.
- The client owns `currentIndex` / advance / done — control flow never depends on the LLM, so
  the agent can't lose its place or mis-target a thread.

The `autoSentRef` / `handleSendText(autoPrompt)` effect added in the first pass is removed
(superseded by the seeded sequence).

---

## Phase 4 — Interrogation (the conversational payoff)

While a walkthrough item is on screen, the chat input stays live. If the merchant types
instead of tapping a control:

- Send to the existing `/api/agent/chat` turn, **prepending the current item's context** to
  the instruction (customer, their message, the agent's draft, why it was flagged, order
  ref). No new endpoint, no cross-thread executor plumbing — the agent reasons/advises about
  the ticket in plain text.
- The agent can advise but not *act* on the other thread (its session tools are its own);
  acting stays the deterministic Approve button. This keeps "why is this over cap?" / "what
  would you do?" working without widening the agent's mutation surface.

Build the context-prefix helper next to the briefing builder so the wording stays in one
place.

---

## Phase 5 — Verify & ship

- `npm run typecheck`, lint, and the home unit suite green.
- `walkthrough.unit.test.ts` covers selection/ordering (real logic, pure functions).
- Manual: a seeded org with a mix (routine, needs_review refund, VIP routine reply, Returns)
  → button shows the right count → walkthrough lists only the hard subset in priority order →
  Approve executes via quick-approve and advances → Skip advances → typing advises on the
  current ticket → empty set falls back to `Ask {agentName}`.
- Local prerequisite (already configured): `UPSTASH_REDIS_REST_URL` / `_TOKEN` in
  `apps/dashboard/.env.local` so the approval path's thread mutex can be acquired.

---

## Reused vs. new

| Concern | Reused | New |
| --- | --- | --- |
| Queue data | `loadNeedsAttention`, `buildPlanPreview`, `classifyHomePlan`, `planReplyText` | `isVip` flag; `selectWalkthroughItems` + priority sort |
| Execution | `/api/agent/quick-approve` → `executeCurrentCachedHomePlan` (policy-enforced) | — |
| Approve UI | `awaitingApproval` bubble + Approve/Not-now pattern | per-item Skip / Open controls, deterministic spine |
| Narration | agent avatar / bubble styling | `buildWalkthroughBriefing` (templated, agent-voiced) |
| Interrogation | `/api/agent/chat` turn | current-item context prefix |
| Open seam | `useAgentPanel().open`, `AgentPanelOpenContext` | `walkthrough` payload (replaces `autoPrompt`) |

---

## Out of scope / future

- **LLM-written per-item narration.** v1 briefings are templated (specific, cheap,
  predictable). If they read flat, upgrade `buildWalkthroughBriefing` to a single batched
  summary call returning one line per item — control flow and execution stay deterministic.
- **Full risk triage** (the broader option): scoring *all* open threads, including escalated
  / no-confident-plan tickets (no cached plan, invisible to `needsAttention` today) and aging
  unanswered ones. That's a new prioritization query and a triage engine — a later module, not
  this feature.
- **Acting on the current ticket from chat** (vs. the Approve button). Deliberately deferred:
  it reopens the cross-thread mutation surface this plan keeps closed.

---

## Decisions log

- Walkthrough set = **Flagged + VIP** (`needs_review || isVip || tag === "Returns"`), not
  agent-flagged-only and not full risk triage. Chosen 2026-06-13.
- Execution deterministic + policy-enforced; LLM narrates/advises only. Chosen 2026-06-13.
- Lives in the dashboard host; core registry untouched. Chosen 2026-06-13.
- Interrogation included in v1 via context-prefixed `/api/agent/chat`. Chosen 2026-06-13.
