# Mobile Tickets Overhaul Plan

**Goal:** make `/dashboard/tickets` on mobile feel like the home "Needs you" queue — agent
judgment first, one-tap actions, trust-first signaling — while keeping desktop usable and
reusing existing agent logic.

Written 2026-06-14. Last updated 2026-06-14.

### Progress summary

| Phase | Status | Notes |
|-------|--------|-------|
| 0 — Decisions + presentation layer | **Completed** | |
| 1 — Row IA | **Completed** | |
| 2 — Inline actions | **Mostly completed** | 2a + 2c done; 2b swipe-right send deferred |
| 3 — Tiered "For me" sections | Not started | |
| 4 — Mobile header + bulk hide | Not started | |
| 5 — Desktop alignment pass | Not started | Partial: desktop row uses `primaryStatus` (Phase 1b) |
| 6 — Agent policy hardening | Not started | UI trust rule shipped in Phase 0 |

---

## North-star UX (what "done" looks like)

On mobile, "For me" should answer one question: **"What does my agent need from me right
now?"**

Each row shows:

1. **Headline** — agent summary / issue type (not email subject)
2. **Customer context** — name if known, otherwise shortened sender + channel
3. **One primary status** — not 3 competing pills
4. **One primary action** — Send / Review / Swipe spam (derived from existing
   `resolveTicketCocoAction` + `classifyHomePlan`)

Desktop can keep a denser table-like row, but should share the same presentation model.

---

## Guiding principles for implementation

| Principle | Implementation rule |
|-----------|---------------------|
| Reuse agent brain | Don't invent new copy/classification; wire UI to `@shopkeeper/agent/plan-preview` + `resolve-ticket-coco-action.ts` |
| Home ↔ tickets parity | Same row semantics as `HomeNeedsAttentionItem`, different layout |
| Mobile-first scope | Phases 1–3 target `<md`; desktop gets shared data layer, lighter visual pass |
| Trust-first | `filterStatus: questionable` suppresses green "Send"; single amber "Review sender first" |
| Minimal API churn | Enrich client-side from existing thread payload (`cachedPlan`, `aiSummary`, `filterStatus`) |
| No big-bang | Ship behind responsive components; keep "All open" as browse fallback |

---

## Architecture: shared presentation layer

**Status:** ✅ Implemented (`ticket-list-presentation.ts`, `customer-display.ts`)

Introduce one canonical mapper used by home cards, ticket rows, and (later) Telegram digest
copy.

### New module (recommended)

`apps/dashboard/src/app/dashboard/tickets/_lib/ticket-list-presentation.ts`

```ts
export type TicketTriageTier =
  | "approve"      // quick_reply, safe sender
  | "review"       // needs_review or consequential plan
  | "waiting"      // customer waiting, no current plan
  | "noise"        // questionable/unverified, spam candidate
  | "closed"       // closed tab

export interface TicketListPresentation {
  tier: TicketTriageTier
  headline: string           // aiSummary headline or tag-based fallback
  subline: string            // customer message snippet or preview
  customerLabel: string      // real name or shortened email/handle
  channelName: string
  timeAgo: string
  primaryStatus: { label: string; tone: "send" | "caution" | "neutral" | "danger" }
  action: TicketCocoAction | null  // reuse existing type
  showSubject: boolean       // false on mobile for_me
}
```

**Inputs:** `Thread` (or `Ticket` + raw thread fields), `OrgSettings`, `agentName`

**Logic sources (already exist):**

- `buildPlanPreview()` — headline/proposal copy
- `classifyHomePlan()` — quick_reply vs needs_review
- `resolveTicketCocoAction()` — Send / Review / Draft handlers
- `realCustomerName()` pattern from `home-needs-attention.ts` (extract to shared util)

**Trust rule (new, small):**

```ts
if (thread.filterStatus === "questionable") {
  // Never surface tier "approve" even if plan classifies quick_reply
  tier = plan ? "review" : "noise"
  primaryStatus = { label: "Review sender", tone: "caution" }
  action.handler !== "quick-approve" // block list-level send
}
```

This is the single most important piece — everything else hangs off it.

---

## Phase 0 — Decisions & extraction (0.5–1 day)

**Status:** **Completed** (2026-06-14)

### Locked product decisions

| # | Decision | Resolution |
|---|----------|------------|
| 1 | Questionable + draft: block auto-send from list? | **Yes** — `filterStatus: questionable` never surfaces `quick-approve`; tier forced to `review` or `noise` |
| 2 | "For me" composition | **Tiered sections on mobile** (Phase 3) |
| 3 | "All open" on mobile | **Keep tab**, lower visual priority vs "For me" |
| 4 | Swipe gestures | **Phase 2** — spam swipe first ✅ (existing), swipe-right send second for `approve` tier ⏳ deferred |

**Engineering prep:**

| Task | Files | Status |
|------|-------|--------|
| Extract `realCustomerName()` + `timeAgoShort()` to shared util | `lib/messaging/customer-display.ts` (new), update `home-needs-attention.ts` | ✅ completed |
| Add `ticket-list-presentation.ts` with unit tests | `_lib/ticket-list-presentation.ts` + `.unit.test.ts` | ✅ completed |
| Extend `Ticket` type or pass `Thread` alongside for row render | `types/index.ts`, `thread-to-ticket.ts` | ✅ completed |

**Tests:** ✅ Pure function tests for tier assignment — including questionable sender +
quick_reply plan (the screenshot case).

---

## Phase 1 — Row information architecture (2–3 days)

**Status:** **Completed** (2026-06-14)

Replace mobile row content; no new actions yet.

### 1a. New mobile row component ✅

`thread-list/TicketRowMobile.tsx` — used when `useIsMobile()` or `<md`.

**Layout:**

```
[Avatar+channel]  Headline (semibold, 1 line)
                  Customer label · channel · time
                  Subline (customer message or proposal snippet, 1–2 lines)
                  [Single status pill]                    [Chevron or action hint]
```

**Remove on mobile "For me" / "All open":** ✅

- Email subject line
- Raw preview when `aiSummary` or plan preview exists
- Multiple tag pills (`Draft ready` + `Unverified sender` + `Shipping`)

**Keep:** ✅

- Avatar + channel badge
- Swipe-to-spam (existing pointer logic in `TicketRow`)

### 1b. Refactor desktop row ✅

`TicketRow.tsx` → uses `TicketListPresentation` for tags/copy; keeps subject line on desktop only.

### 1c. Sort order for "For me" ✅

Client-side sort after fetch (or SQL later):

1. `approve`
2. `review`
3. `waiting`
4. `noise`

Within tier: `lastMessageAt` desc.

### Deliverable ✅

Mobile list reads like agent queue, not email client. Screenshot case shows **"Review
sender"** (amber), not green "Draft ready".

---

## Phase 2 — Inline list actions (2–3 days)

**Status:** **Mostly completed** (2026-06-14) — 2a + 2c done; 2b swipe-right send deferred

Bring home-page affordances into the list.

### 2a. Row action button ✅

For tiers `approve` / `review`:

| Tier | Button | Handler |
|------|--------|---------|
| `approve` | **Send** (green) | `quickApproveCachedPlan()` — already in `conversation-agent-requests.ts` |
| `review` | **Review** | `onSelectTicket(id)` + deep-link to plan (`?thread=id` opens `ActionPlanCard`) |
| `waiting` | none / subtle "Drafting…" | optional |
| `noise` | none (swipe only) | existing spam swipe |

Wire optimistic updates through `useThreadCacheCoordinator` (same as conversation approve). ✅
Implemented in `useTicketListRowActions.ts` + `TicketRowActions.tsx`.

### 2b. Optional swipe-right send (mobile) ⏳ deferred

Reuse swipe infrastructure from `TicketRow` for `approve` tier only:

- Swipe right → reveal green "Send"
- Swipe left → existing spam

Gate with `canSwipeSend = tier === "approve" && action?.handler === "quick-approve"`.

### 2c. Loading / error states ✅

Per-row approving spinner (match `NeedsYouCard` pattern). Toast on failure via existing
`useTicketActions` toast.

### Deliverable ✅ (2a + 2c)

Merchant can clear safe drafts without opening the thread — parity with home deck.

---

## Phase 3 — Tiered "For me" layout (1–2 days)

**Status:** Not started

Replace flat list with sections on mobile when `activeView === "for_me"`.

### Structure

```
Needs your OK (N)
  [approve rows]
Needs review (N)
  [review rows]
Waiting on agent (N)        ← optional, collapsed by default
  [waiting rows]
Likely spam (N)             ← collapsed by default
  [noise rows]
```

`ThreadList.tsx` groups `filteredTickets` by `presentation.tier`.

**Empty section behavior:** Hide empty tiers. If all empty → existing `EmptyState` ("You're
caught up").

**"All open" tab:** Flat list, lighter styling, no action buttons (browse mode). Sort by date
only.

### Deliverable

"For me" feels curated; spam doesn't compete with real customers.

---

## Phase 4 — Mobile header simplification (1 day)

**Status:** Not started

`ThreadListHeader.tsx` mobile branch overhaul.

### Default header (`<md`, not searching)

```
[ Needs you (N) | All | Closed ]     [ ··· ]
```

- Merge visual weight: emphasize active tab label + count for "For me"
- Move **Search** and **Filters** into a single overflow menu (`···`) or bottom sheet
- Remove filter dot + separate filter button from primary bar

### Search mode

Unchanged: full-width search replaces header (already works).

### Bulk selection

`BulkActions` + row checkboxes: **`hidden md:flex` / `hidden md:block`**

- Remove checkbox column from `TicketRowMobile`
- Bulk handlers stay in codebase for desktop

### Deliverable

Header fits small screens; list content starts higher.

---

## Phase 5 — Desktop alignment pass (1 day, optional in v1)

**Status:** Not started (partial overlap: Phase 1b already uses single `primaryStatus` on desktop)

Not a full overhaul — share presentation layer:

- Replace multi-pill tag row with `primaryStatus` + secondary tag on hover
- Show plan snippet on hover (tooltip) for rows with `cachedPlan`
- Keep bulk/select

---

## Phase 6 — Agent policy hardening (parallel, 1–2 days)

**Status:** Not started (UI trust rule from Phase 0 blocks send in list; backend policy still open)

UI alone won't fix "Draft ready on spam." Coordinate with agent/planner:

| Change | Where |
|--------|-------|
| Skip auto-plan for `filterStatus: questionable` | gateway message handler or `plan-internal` route |
| Or: plan but force `needs_review` classification | `plan-preview.ts` if sender unverified |
| Suppress Telegram "draft ready" notify for questionable | gateway notify path |

**Recommendation:** UI blocks send immediately (Phase 0 rule); agent policy follows so drafts
aren't generated for obvious noise.

---

## File change map

| Area | Files | Status |
|------|-------|--------|
| Presentation core | `_lib/ticket-list-presentation.ts`, `_lib/ticket-list-presentation.unit.test.ts`, `lib/messaging/customer-display.ts` | ✅ |
| Rows | `TicketRow.tsx`, `TicketRowMobile.tsx`, `TicketRowActions.tsx`, `ticket-row-status-pill.tsx` | ✅ |
| List | `ThreadList.tsx` (grouping ⏳), `ThreadListHeader.tsx` (mobile header ⏳) | Partial |
| Data | `thread-to-ticket.ts`, `useTicketsPageView.ts` (sort ✅, action callbacks ✅) | ✅ |
| Actions | `conversation-agent-requests.ts`, `useThreadCacheCoordinator.ts`, `useTicketListRowActions.ts`, `useTicketActions.ts` | ✅ |
| Home parity | `home-needs-attention.ts` (shared util ✅), `NeedsYouCards.tsx` (shared subcomponents later) | Partial |
| Tests | presentation unit tests ✅, `TicketRowActions` unit tests ✅, API tests unchanged | Partial |

**Do not create** a second home page — extend tickets to consume the same presentation model.

---

## Suggested PR sequence

Split for reviewability:

| PR | Scope | Risk | Status |
|----|-------|------|--------|
| **PR1** | Presentation layer + tests + questionable-sender rules | Low | ✅ Shipped |
| **PR2** | Mobile row IA (Phase 1) | Medium — visual | ✅ Shipped |
| **PR3** | Inline Send/Review actions (Phase 2) | Medium — touches cache/approve | ✅ Shipped (swipe-right send ⏳) |
| **PR4** | Tiered For me sections (Phase 3) | Low | Not started |
| **PR5** | Mobile header + hide bulk (Phase 4) | Low | Not started |
| **PR6** | Agent policy for questionable senders (Phase 6) | Medium — backend | Not started |

Each PR should be shippable independently. PR1 is the foundation.

---

## Testing plan

### Unit ✅

- `ticket-list-presentation`: tier + status for combinations:
  - quick_reply + clean sender → `approve` ✅
  - quick_reply + questionable → `review` (not approve) ✅
  - needs_review + refund tool → `review`, caution ✅
  - awaiting reply, no plan → `waiting` ✅
  - questionable, no plan → `noise` ✅
- `TicketRowActions`: send/review visibility helpers ✅

### Integration (existing DB test pattern) ⏳

- Thread with cached plan + `filterStatus: questionable` appears in for_me but action is not
  quick-approve

### Manual mobile checklist

- [ ] "For me" shows tier sections with sane counts (Phase 3)
- [ ] Send from list works for real customer draft; fails gracefully offline
- [ ] Swipe spam removes row, toast confirms
- [x] Questionable sender never shows green Send
- [ ] No checkboxes / bulk bar on mobile (Phase 4)
- [ ] Search + filters reachable from overflow (Phase 4)
- [x] Open thread → plan still visible in conversation (no regression)
- [x] "All open" still browsable, flat, date-sorted
- [x] Mobile row shows headline + single status pill (not subject + competing tags)
- [x] Review button opens thread for `review` tier

---

## Metrics to watch post-ship

- **Time-to-first-action** on mobile (tap Send vs open thread)
- **For me tab bounce rate** (do merchants switch to All open immediately?)
- **Quick-approve from list vs conversation** ratio
- **Spam mark rate** on questionable senders (are we surfacing noise less?)
- **Bad send reports** / refund reversals (trust metric)

---

## Out of scope (explicitly defer)

- Replacing `/dashboard` home with tickets (home stays primary triage surface)
- WhatsApp / Telegram inbox UI
- New API endpoints (unless perf forces plan preview server-side)
- Full desktop inbox redesign
- AI-generated display names for unknown senders (nice follow-up)
- Push notifications redesign

---

## Effort estimate

| Phase | Days | Status |
|-------|------|--------|
| 0 — Decisions + presentation layer | 1 | ✅ Completed |
| 1 — Row IA | 2–3 | ✅ Completed |
| 2 — Inline actions | 2–3 | ✅ Mostly completed (swipe-right send ⏳) |
| 3 — Tiered sections | 1–2 | Not started |
| 4 — Header + bulk hide | 1 | Not started |
| 5 — Desktop pass | 1 | Not started |
| 6 — Agent policy | 1–2 | Not started |
| **Total** | **~9–13 days** | **~3 phases done** |

Critical path: **Phase 0 → 1 → 2** ✅. **Next:** Phase 3 (tiered sections) or Phase 4 (header). Phase 6 can run in parallel.

---

## Next concrete step

**Phase 3:** group `filteredTickets` by `presentation.tier` in `ThreadList.tsx` for mobile
"For me" — tiered sections with collapsed noise/waiting.

~~Start with PR1: `ticket-list-presentation.ts`~~ ✅ Done.

---

## Background: UX review summary

This plan addresses findings from a mobile tickets UX review (2026-06-14):

**What works:** three-tab model, swipe-to-spam, visual polish, master–detail on mobile,
"Draft ready" badge, empty states aligned with agent narrative.

**What contradicts product goals:** helpdesk inbox layout vs agent handoff queue; desktop
patterns on mobile; conflicting tag pills on questionable senders; "For me" not feeling
curated; email-as-identity on narrow screens; bulk/power-user affordances on mobile.

**What needs overhaul:** row information architecture, unification with home "Needs you"
experience, triage tiers, mobile bulk/select removal, "Draft ready" policy for questionable
senders, header simplification, agent action preview in rows.

See product principles in `.claude/CLAUDE.md` — agent as employee, mobile/messaging-first,
trust is binary, solo merchant simplicity.
