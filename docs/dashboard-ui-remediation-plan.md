# Dashboard UI remediation plan

**Status: every phase is done.** Phase 1 merged and pushed to `master`
2026-07-31 (`9b47cdb7`, `6dcbdcf4`, `e3424b83`, `218570db`) and Phase 3 as
`651bfa9d` — pushed straight to master at the merchant's request, no PR.
Phase 0 merged and pushed 2026-08-01 (`9777bed7`). All three open
decisions are resolved.

**Committed locally, not yet pushed:** Phase 2 (`dd2e5d1b`, `0b7f9088`),
Phase 4 (`c508b2c7`, `ce847240`, `f7445a5b`, `9f8f369e`, `32713113`), and
Phase 5 (`d5f8702e`), plus the harness (`01e299bb`, `b995bd82`).

**Verification debt cleared.** The preview harness is checked in at
`scripts/seed-preview-store.mjs` (`01e299bb`), every Phase 4 change was
judged on its own screenshot at 1440 and 390, and the Phase 1–3 output was
verified against the live dashboard in the same pass.

**Last updated:** 2026-08-01

**Scope:** `apps/dashboard` plus the presentation half of
`packages/agent/src/plan-preview.ts`. No gateway work.

## Goal

The dashboard's core loop already reads as human-centric: the Needs-You card
shows "{agentName} responds via Email" over the real draft text, the ticket
drawer offers "Approve & send" beside "Edit & send myself", and the tier copy
speaks as the agent ("I plan each reply and action, then wait for your OK").
That framing is right and this plan does not touch it.

What undercuts it is the connective tissue — the strings, counters, and section
chrome *between* those cards. Internal tool-step text, gateway environment
variable names, an invented time-saved constant, five disagreeing counters, and
nine settings sections whose headings silently do not render. Individually
cosmetic; together they are what makes the product read as machine-assembled.

This plan removes that texture and fixes the correctness bugs found alongside
it. Findings come from a walkthrough of the running dashboard (local Next dev
on `:3100`, auth bypass, seeded solo-merchant store) at desktop and mobile,
2026-07-31 — not from reading the code.

## Ordering logic

1. **Structure before copy.** Wording cannot be judged on a page whose section
   headings do not render.
2. **Correctness before polish.** Wrong numbers and invisible escalations
   contradict product principle 3 ("trust is binary"). Dead space does not.
3. **Cheap and isolated before broad and risky.**
4. **The one gated package last in its band.**
5. **Redesign last** — it is a different kind of work from the fixes.

---

## Phase 0 — Unblock the settings page — DONE 2026-07-31, MERGED 2026-08-01

Shipped as `9777bed7`: the `showHeader` gate is gone and `SectionCard`
always renders its title and description.

**Correction to the table below:** only **seven** of the nine call sites are
reachable. `AgentSampleRepliesSection:128` and `AgentResponseSection:56` are the
non-`embedded` branches of those components, and `AgentAdvancedSection` always
passes `embedded` — so those two `SectionCard`s never render at all. Their
headings ("Sample replies", "Reply language") come from the `embedded` branch
and were always visible. The duplicate-heading risk did not materialise:
sub-headings under the two container sections are distinct from their parents
("After-hours away message" / "Spam filter" under "When {agentName} is on
duty").

Verified at 1440 and 390 against the local harness, before/after: the seven
headings appear, nothing else moves, Advanced-open is unchanged. Root typecheck
10/10, dashboard lint clean, dashboard unit 501/501.

One line, its own PR, first and alone.

`apps/dashboard/src/components/settings-form/shared.tsx:86`:

```ts
const showHeader = variant !== "board"
```

`SectionCard` computes `titleClassName` and `descriptionClassName` for the
`board` variant and then never renders them. All **nine** `variant="board"`
call sites drop their title and description:

| File | Suppressed heading |
| --- | --- |
| `AgentAutonomySection.tsx:20` | **Trust level** |
| `AgentIdentitySection.tsx:12` | Your store |
| `AgentDefaultBehaviorSection.tsx:10` | Default Behavior |
| `WhenOnDutySection.tsx:19` | When {agentName} is on duty |
| `MorningBriefingSection.tsx:25` | Morning briefing extras |
| `ProactiveMonitoringSection.tsx:18` | Proactive shipping alerts |
| `ProactiveMonitoringSection.tsx:35` | Post-resolution check-ins |
| `AgentSampleRepliesSection.tsx:128` | Sample replies |
| `AgentResponseSection.tsx:56` | Response |

Consequence: the most consequential control in the product — Trust level —
renders as three unlabeled floating cards between "Brand voice" and "Auto-plan
on ticket open", and the page as a whole reads as a flat stack of ungrouped
toggles.

**Alone because** the risk is *duplicate* headings: `WhenOnDutySection` and
`AgentSampleRepliesSection` render their own `embedded` sub-headings
underneath. Screenshot all nine before and after.

---

## Phase 1 — Trust correctness — DONE 2026-07-31

The failures that contradict "trust is binary." Cheapest first so the small
wins land while 1.3 takes a review cycle.

Verified per branch: root typecheck 10/10, dashboard lint clean, dashboard
unit and integration suites green. **Not screenshot-judged** — the seeded
preview harness described under Verification was never checked in, so it
would have to be rebuilt. The visible changes are text and one new list
section; judge them before merge.

Two corrections to the sections below, found while implementing:

- **1.3 needed a query change the plan did not list.** `forMeThreadSql`
  (`src/lib/messaging/thread-list-query.ts`) filters the default queue
  *server-side* to threads whose last message is the customer's or that carry
  a live draft. An escalated ticket where the agent replied before handing
  over satisfies neither, so it never reached the client and no amount of
  `resolveTier` work could have shown it. Added `t.escalated_at IS NOT NULL`
  to that disjunction; the regression test fails without it.
- **`escalatedAt` is set and never cleared.** Nothing in either app resets it,
  so an escalated ticket stays in the "Flagged for you" section until it is
  closed — correct under "the agent handed this to you", but it means the
  section does not drain on reply. Worth a product call before Phase 5.

### 1.1 The refund cap on screen is not the one in force — DONE

Shipped as `9b47cdb7`. `effectiveRefundCap` wired into the tier cards, tier
default demoted to a secondary line. One deviation: the Draft-only card keeps
`$0` rather than showing the override, because that tier disables action tools
outright — showing "$75" under "never acts on Shopify" would be a new lie.

`AgentAutonomySection.tsx:60` renders `Refund cap ${option.cap}` — the static
tier default. With `maxRefundAmount: 75` set, the card reads **$50** while the
Advanced panel below it admits "Default for Ask first: $50 · You set: $75".

`effectiveRefundCap()` at `apps/dashboard/src/lib/agent/autonomy-tiers.ts:66`
already does the right thing and is **dead code — called from nowhere**. Wire
it in; demote the tier default to secondary text. ~10 lines plus a unit test.

### 1.2 Five disagreeing counters on one screen — DONE

On `/dashboard/agent`, simultaneously:

| Element | Value | Source |
| --- | --- | --- |
| Nav badge "Inbox" | 6 | org open-thread count |
| Greeting prose | "5 still need your eye" | `needsAttention.length` |
| "Walk me through 4" | 4 | `lib/home/walkthrough.ts:32` filter |
| Deck pager | "1 of 5" | `needsAttention.length` |
| Agent panel suggestion | "5 pending approvals" | `lib/agent/panel-briefing.ts:148` |

The nav badge also **changes meaning by route**
(`_components/DashboardSidebar.tsx:15-21`): the org count everywhere, the
current list's local override on `/tickets`. Home → Inbox drops 6 → 5 with no
explanation.

Shipped as `87e6ab61`. Decision 1 resolved: the badge counts what needs you.
`useOpenThreadCountQuery` → `useInboxBadgeCountQuery`, now polling
`?status=open&forMe=true&count=true`, so the polled value and the ticket
list's override are the same number and the route-dependent meaning is gone.

Note the greeting/deck/panel trio share one source (`metrics.needsYouCount`,
the draft-ready count) and were never in disagreement with each other. "Walk
me through 4" is a deliberate subset — only tickets needing a human call
(`lib/home/walkthrough.ts`) — so it was relabelled ("4 judgment calls")
rather than reconciled. The badge (for-me) and the greeting (draft-ready) can
still differ while the agent is mid-draft; unifying them means changing what
Home counts, which belongs with decisions 2 and 3.

### 1.3 Escalated tickets are invisible in the inbox — DONE

`escalatedAt` is written by the escalate tool
(`src/lib/agent/tools/thread.ts:389`) and **read nowhere in the dashboard** —
no badge, no filter, no sort, no tier. `resolveTier`
(`(shell)/tickets/_lib/ticket-list-presentation.ts:173`) does not consider it,
so an escalated ticket with no cached plan falls to `waiting_customer` and is
**excluded from the default queue entirely**. Verified live: a seeded
chargeback-threat ticket the agent had explicitly handed off ("above my line")
did not appear until "All conversations" was clicked.

It also loses its tag pill — the tool sets `tag: "needs_human"`, which is not
in the five-tag whitelist at `_lib/ticket-tags.ts`.

Full chain (~6 files): Prisma select → `/api/threads` serializer →
`Thread` type (`src/types/index.ts:138`) → `Ticket` mapper → `resolveTier` →
a new `escalated` tier across `TRIAGE_TIER_SORT_ORDER`,
`TRIAGE_TIER_SECTION_LABELS`, `NEEDS_YOU_TIER_SECTIONS`,
`ALL_OPEN_TIER_SECTIONS`, and `primaryStatusForTier`. Ranks above "Needs your
answer"; never filterable out.

Shipped as `988c7c6c`, plus the `forMeThreadSql` predicate noted above. The
tier is labelled "Flagged for you" (matching the gateway's operator inbox
wording), ranks above "Needs your answer", is not collapsible, survives the
questionable-sender downgrade, and still yields to `closed`. `needs_human` now
has a tag style ("Needs a human"); the tag pill is suppressed on escalated
rows so it does not restate the status pill.

---

## Phase 2 — Copy sweep — DONE 2026-08-01

Shipped as `dd2e5d1b` (everything unblocked) and `0b7f9088` (the two items
that were waiting on decisions 2 and 3). Root typecheck 10/10, dashboard
lint clean, unit 510/510, integration 510 passed/3 skipped. **Not
screenshot-judged.**

Corrections and deviations found while implementing:

- **Every file path in the findings below is stale.** The settings sections
  moved to `(shell)/agent/configure/_components/`;
  `components/settings-form/` now holds only `shared.tsx`. Same for
  `memory-books.ts` and `MemoryLibrary.tsx`, which live under
  `(shell)/kb/_components/`.
- **"No layout" was wrong.** Collapsing the cleared-overnight tiles removes
  a whole visual block from Home. It belongs to Phase 4's standing rule, and
  it is the main reason the harness needs rebuilding before anything else
  ships.
- **The duplicated descriptions needed a type change.** `ToggleRow` required
  `description`, so it is now optional and the after-hours and spam-filter
  toggles omit it rather than restating their own group heading.
- **`BusinessHoursSection` and `SpamFilterSection` have dead non-`embedded`
  branches** — same class as the Phase 0 finding. `WhenOnDutySection` is the
  only caller and always passes `embedded`. Left in place; not in scope.
- **New finding, fixed:** the greeting called `overnightClearedCount`
  "drafted" while the line ~100px below called it "cleared". The query counts
  closed threads, so `panel-briefing.ts` now says cleared.
- **New finding, not fixed:** `_components/help/content/*` is a whole
  separate merchant-facing surface with the same violations — "AI drafts",
  the product name used as the agent's name, and a reference to a
  "Shopkeeper Context summary" that may no longer exist. Out of scope here;
  worth its own pass.
- Marketing pages (`(marketing)/`, `signup/`) still say "AI drafts"
  deliberately — that copy explains the product to strangers and is not
  governed by the agent-name convention.

### Original findings

One PR. Pure string and constant edits, no behavior, no layout — batchable.

**Internal infrastructure in merchant-facing copy**

- `ProactiveMonitoringSection.tsx:22` — "Requires the gateway
  `DELIVERY_EXCEPTION_MONITOR_ENABLED` flag."
- `ProactiveMonitoringSection.tsx:39` — "Requires the gateway
  `POST_RESOLUTION_FOLLOWUP_MONITOR_ENABLED` flag."

A solo merchant cannot set an env var and does not know what "the gateway" is.
State what they get, not what the gateway needs.

- Integrations, TikTok Shop card: "Configure Partner Center credentials to
  enable OAuth" sits under a **disabled "Coming soon"** button — an
  unactionable instruction contradicting the control beside it.

**Invented vocabulary**

- `AgentAutonomyAdvancedSection.tsx:96` "Max per gesture" → "Largest single
  refund".
- `AgentAutonomyAdvancedSection.tsx:139` "Daily goodwill cap" → "Daily refund
  limit".
- `(shell)/kb/_components/memory-books.ts:174` "A collection of notes
  maintained by your team" — "collection" clashes with Shopify collections per
  the dashboard vocabulary convention.
- `MemoryLibrary.tsx` — "context" is used as the user-facing noun ~8 times
  ("View context", "Saved context", "Core context", "No context saved yet").
  That is the developer's word for the prompt payload; the item is a **note**.

**Voice violations**

- "Business name · shown in support emails and **AI drafts**" — convention is
  never "AI", always the agent's name.
- `ProactiveMonitoringSection` says "**Shopkeeper** drafts…" (product name)
  while the page header says "How **{agentName}**…" (agent name).

**Duplicated descriptions** — each settings group states its behavior, then the
toggle inside restates the same sentence. Affects After-hours away message and
Spam filter.

**Canned and invented metrics** (blocked on decisions 2 and 3)

- `src/lib/server/home-summary.ts:13` `TAG_SUBTITLES` — a lookup table
  presented as insight: `Shipping → "WISMO replies sent"`,
  `Returns → "size swaps + refunds"`, `Product Inquiry → "answered from KB"`.
  "WISMO" is call-center jargon; "KB" is the internal noun (convention says
  "memory"). Verified live that "size swaps + refunds" rendered over a bucket
  containing no size swaps.
- `src/lib/home/summary-view.ts:3` `MINUTES_SAVED_PER_AUTO_TICKET = 14`,
  rendered as "**Saved you ~1.6 hours**" with a decimal point. It is
  `count × 14` presented as a measurement, sitting beside real numbers.

---

## Phase 3 — Preview strings in `packages/agent` — DONE 2026-07-31

Shipped as `651bfa9d`. `buildProposal` returns `""` instead of the status
string, so callers fall through to the conversation. `summarizeActionChain`
joins with `", then "`. `actionPhraseFor` uses the registry label **only for
read steps** — the first attempt preferred the label everywhere and turned
"Ask whether framed prints ship to Canada" into a useless "Ask merchant";
caught by screenshot, not by tests.

The home card's fallback bubble consumed the removed string, so it now falls
back to the context line or the customer's message, and only says "flagged
this" (amber) when the plan is consequential.

No eval run, as scoped. Verified: root typecheck 10/10; agent 616/616;
dashboard unit 509/509 and integration 510 passed/3 skipped; gateway 889
passed/1 skipped; dashboard + agent lint clean.

**Follow-up found while verifying:** the ticket list loads `messages: take 1`,
so an escalated thread's preview falls through to the *agent's* handoff reply
rather than the customer's complaint — the customer's message is not in the
payload. Honest and readable, but not what this phase intended. Fixing it
means loading more messages per row, which is a list-query cost decision.

### Original findings


Separate PR — crosses the package boundary, both apps consume it.

- `src/plan-preview.ts:317` — `summarizeActionChain` joins tool-step
  descriptions with `" + "`, surfacing internal step lists as the merchant's
  preview text: *"Check the carrier scan history for order #1042 + reply"*,
  *"Confirm #1051 is still unfulfilled + reply"*. Also feeds the home card's
  fallback bubble, labelled "{agentName} flagged this" with an amber eyebrow —
  on benign lookups.
- `src/plan-preview.ts:321,328` — `"No plan generated — open ticket to draft
  reply"` renders in the ticket list *where the customer's message preview
  goes*. Verified live: it replaced a chargeback threat with a status message
  about the agent's own internals. Fall through to the customer's message.

### Eval gate boundary — verified

`apps/dashboard/src/lib/agent/__evals__/assertions.ts:122` asserts on
`classifyHomePlan` only. No eval references `buildPlanPreview`,
`buildProposal`, or `summarizeActionChain`.

- Presentation half (this phase) → **unit tests only, no eval run, no credits.**
- `classifyHomePlan` → eval gate required. **Explicitly out of scope here.**

Run each package's full `vitest.config.ts` plus both apps' — `test:unit` misses
plain `*.test.ts`, which has broken cross-package export changes before.

---

## Phase 4 — Layout — DONE 2026-08-01

Five commits, `c508b2c7` / `ce847240` / `f7445a5b` / `9f8f369e` /
`32713113`, each judged on its own screenshot at 1440 and 390. Root
typecheck 10/10, dashboard lint clean, unit 510/510, integration 510
passed/3 skipped.

**The harness is checked in now** (`01e299bb`,
`scripts/seed-preview-store.mjs`), so the next phase does not pay to
rebuild it. This also retired the Phase 1–3 screenshot debt: their output
was verified against the live dashboard while judging these five.

What each item turned out to be:

1. **Switch tone** — dead-branch removal, not a visual change. Both call
   sites already passed `amber`; the `green` default was unreachable. The
   `tone` prop is gone. Verified pixel-identical.
2. **Memory cards** — as described. `h-72` + `mt-auto` gone.
3. **Integrations cards** — two causes, not one: `h-52` on `CARD_SHELL`
   *and* `min-h-[3.375rem]` on `CARD_DESCRIPTION` reserving three lines
   for a one-line string. Both removed; eight cards now fit where six did.
4. **Ticket detail** — the plan's prescription ("top-anchor short
   conversations") did not match the observed bug. The timeline was
   *already* top-anchored; the void sat between the last message and the
   composer, because the drawer is pinned at `sm:h-[86vh]` whatever it
   holds. Bottom-anchoring the timeline was tried first and only moved
   the void above the messages, orphaning the context bar — reverted. The
   fix is `sm:h-auto` under the same max-height. Verified at both ends,
   including that a 26-message thread still caps at 86vh, auto-scrolls to
   the newest message, and scrolls back to the first.
5. **Home / Tickets** — the mobile half was real and is fixed: the two
   banners now follow the deck, and the deck's top gap relaxes under
   `sm`, so Approve clears the fold on a 390×844 phone (and the full card
   clears it at 1440). The desktop half — "40–60% of the viewport empty
   below the fold" — was **not** fixed and should be struck: with the
   banners moved, what remains is a store with five tickets. Filling it
   would mean inventing content, which is what this plan exists to remove.

### Original findings

Standing rule: never batch visual changes without judging each. Cheapest first.

1. **Switch tone.** `src/components/ui/switch.tsx` defaults to `tone="green"`,
   but green is never used — both call sites pass `tone="amber"`
   (`settings-form/shared.tsx:62`, `agent/MerchantAnswerForm.tsx:118`). Amber
   is the convention's "review a consequential action" colour and is currently
   the on-state for "Sales pulse" and "Low-stock alerts". One token.
2. **Memory cards.** `MemoryLibrary.tsx:34,82,87` — `h-72` fixed height with
   `mt-auto` footers leaves ~200px of blank space mid-card. Reads as a
   rendering bug. Let content size the cards.
3. **Integrations cards.** ~100px gap between description and Connect button,
   on all eight.
4. **Ticket detail.** ~550px void between a single customer message and the
   draft card; top-anchor short conversations.
5. **Home / Tickets.** 40–60% of the viewport empty below the fold.

Mobile (390px) note: two dismissible banners plus the greeting card push
**Approve** — the product's primary action — below the fold on an 844px phone.
Worth resolving as part of item 5 given product principle 2.

---

## Phase 5 — Review page rebuild — DONE 2026-08-01

Shipped as `d5f8702e` (plus `b995bd82`, which fixed the seed). Screenshot-
judged at 1440 and 390. Root typecheck 10/10, dashboard lint clean, unit
508/508, integration 510 passed/3 skipped.

All three findings held, and one more surfaced underneath them:

- **The four decks are gone**, replaced by one reverse-chronological list
  plus a filter row. Nine seeded entries now render at once; the board
  showed four and needed seven clicks across four carousels.
- **The filters query the server.** The board ran four overlapping
  queries and then re-filtered each result client-side with
  `classifyReviewItem`, so an entry could be fetched and silently
  dropped. That mechanism is deleted, not reimplemented. Verified live:
  Needs review returns 4, Store actions 3.
- **The pill pairs are deduped by rule, not by deletion.** Both badges
  rendered unconditionally. A row now carries one status pill, and the
  authorisation appears as quiet prose only when the pill does not
  already imply it — so "Policy block · you approved" survives (the
  merchant approved a plan the policy engine then stopped) while "Read
  only · Read only" cannot occur.
- **"Approved / read-only" was two things.** Splitting it revealed that
  read-only lookups were filed under approvals purely because they were
  neither auto nor store. They are now separate.
- **New, fixed:** an errored turn previewed the body of the email that
  never sent, because `primaryPreviewText` preferred the output block
  over the error. On a failure the failure is the story.

**Harness note.** The stale-compile trap is real here: after the preview
fix the browser still rendered the old text while the file on disk was
correct. Proved it by grepping the *served* chunk for the new branch
(absent), not by assuming — a dev-server restart flipped it to present.
Worth checking the served bundle before believing a screenshot that
disagrees with a passing unit test.

### Original findings

Last: a redesign, not a fix, and independent of everything above.

Four side-by-side independently-paginated card decks mean seeing 7 audit
entries takes 7 clicks across 4 carousels. An audit trail's job is scanning.

- Replace with one reverse-chronological list plus filters.
- Dedupe the status/mode pill pairs — observed "Policy block" + "Approved",
  "Auto reply" + "Auto-sent", and one card reading **"Approved" "Approved"**.
- Rename the columns, which mix registers: "NEEDS YOUR EYES" / "AUTO-SENT" /
  "STORE ACTIONS" / "APPROVED / READ-ONLY". The last is two `mode` enum values
  slashed together (`(shell)/review/_components/quality-panel-model.ts:59`).

---

## Open decisions

1. ~~**What should the Inbox badge count**~~ — **resolved 2026-07-31: only
   those needing you.** Implemented in 1.2.
2. ~~**"Saved you ~1.6 hours"**~~ — **resolved 2026-08-01: deleted.**
   `MINUTES_SAVED_PER_AUTO_TICKET` and `timeSavedHours` are gone.
3. ~~**The four "cleared overnight" tiles**~~ — **resolved 2026-08-01:
   collapsed to one line.** The counts were real but `TAG_SUBTITLES` was a
   static tag→phrase map, so each tile carried a true number under a
   fabricated caption. The tag split — the only fact the tiles added over the
   greeting — moved into the heading, with any remainder past the 4-tag query
   cap folded into "other" so the parts sum to the stated total.

## Follow-ups raised by this plan — DONE 2026-08-01

Both were surfaced while working the phases above and closed after Phase 5.

- **`escalatedAt` never cleared** (`113b7e91`). Raised under Phase 1: an
  escalated ticket sat in "Flagged for you" until close, so the section did
  not drain on the merchant replying. Now cleared on a merchant reply
  through one helper shared by the composer and `REPLY <n>` from the
  operator digest — not by the agent's own sends, which cannot be told
  apart by `senderType` (every outbound message is written as `agent`).
  Verified live: the section disappears and the Inbox badge follows.
- **Help content described a product that does not exist** (`4eeb7628`).
  Raised under Phase 2. It documented "Draft with Shopkeeper" and a
  right-hand "Shopkeeper Context" panel, neither of which is in the app,
  plus Open/Closed tabs and a Home page of counters. Rewritten against the
  real UI, and the register fixed with it: help copy now writes `{agent}`
  and each render point substitutes the merchant's agent name.
  - **New finding, not fixed — the help panel has no trigger.** `openHelp`
    is called from nowhere, so none of it is reachable. That is a product
    call, logged under Known Bugs in [to-do-list.md](to-do-list.md).

## Deferred — product calls, not code

- Remove the `Auto-plan on ticket open` toggle entirely? It exposes internal
  machinery as a preference and there is no user who wants it off.
- Hide flag-gated monitor toggles when the gateway flag is off, versus showing
  a real "not available" state?
- The Customers page cannot show the people in the inbox — it is Shopify-only.
  Still the open item from the June 2026 cleanup.

## Standing rules this plan obeys

- One PR per change; root typecheck before each push.
- Screenshot-judge every visual change individually (Phase 4), never batched.
- No eval run anywhere in this plan — Phase 3 is deliberately scoped to stay
  off the gate.
- Operator-channel behavior is untouched; nothing here needs live phone
  verification.

## Verification

A local preview harness reproduces every finding: `npm run test:services:up`,
then the dashboard under `scripts/with-test-env.mjs` with `E2E_AUTH_BYPASS=true`
on `:3100`, seeded with a solo-merchant store (7 customers, 6 open tickets
across email and Instagram, cached plans covering quick-reply / needs-review /
needs-merchant-input, an escalated ticket, KB articles, and an agent-action
audit trail). Drive it with headless Playwright at 1440 and 390.
