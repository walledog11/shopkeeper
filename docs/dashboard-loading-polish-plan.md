# Dashboard Loading Polish Plan

**Goal:** Finish the loading work started in the shared skeleton kit (2026-08-05) so
every major dashboard route paints once — no second-pass briefing updates, no
column-by-column board fills, and no blank flashes inside modals.

**Done already (baseline):** Shared skeletons under
`apps/dashboard/src/app/dashboard/_components/skeletons/`, route `loading.tsx`
files for the main shell pages, unified home loading gate, KB library skeleton,
orders board initial skeleton, agent configure integration flags from the server,
and billing section skeleton.

**How to use this doc:** One item per PR. Mark completed rows in the table
below with date and PR link. Skip or defer anything that needs product sign-off.

Last reviewed: 2026-08-05.

## Success criteria

- [ ] Home first paint shows real briefing content without a client skeleton
      flash on cold load (server-prefetched summary).
- [ ] Briefing ops notes (`ordersToShip`, etc.) do not update in a visible
      second pass after the card appears.
- [ ] Orders board columns appear together, not one at a time.
- [ ] Ticket conversation modal never shows an empty body while the thread loads.
- [ ] No route relies on a lone `Loader2` spinner for its primary layout
      (spinners OK for button/action in-flight states).

## Remaining work (quick wins first)

| # | Task | Why | Touch | Est. |
| --- | --- | --- | --- | --- |
| 1 | **Server-prefetch home summary** — fetch `HomeSummary` in `(shell)/page.tsx` (reuse `getHomeSummary` server helper or extract one from `/api/home-summary`) and pass as SWR `fallbackData` into `useHomeData` | Removes the client-only skeleton flash on `/dashboard` after hydration | `page.tsx`, `useHomeData.ts`, maybe `lib/server/home-summary.ts` | ~1h |
| 2 | **Fold `ordersToShip` into home summary** — extend `/api/home-summary` (and the server fetch from #1) to include the paid-unfulfilled count instead of a separate `/api/orders?limit=10` in `useHomeData` | Stops ConciergeBriefing ops links from popping in after the greeting card | `useHomeData.ts`, home summary API route + contract | ~1h |
| 3 | **Ticket dialog conversation skeleton** — when `activeTicketId` is set but `conversationTicket` is null, render `TimelineSkeleton` + `ComposerSkeleton` in the dialog instead of `ConversationLoadState` with `compact` only | Modal no longer feels empty on slow thread fetches | `TicketsPageLayout.tsx` | ~45m |
| 4 | **Integrations Telegram status** — include `telegramStatus` in `/api/integrations` (or initial server props on integrations page) so the Telegram card does not resolve after the grid skeleton clears | Integrations grid stops “settling” after load | `integrations/page.tsx`, API route or `IntegrationsPageClient` | ~1h |
| 5 | **Migrate team `loading.tsx` to shared kit** — replace bespoke pulse markup in `team/loading.tsx` with a `TeamPageSkeleton` exported from `skeletons/` | One visual language across routes | `team/loading.tsx`, `page-skeletons.tsx` | ~30m |
| 6 | **Customers tab skeleton** — match `CustomersPanel` list layout when `isLoading && allCustomers.length === 0` (reuse `ThreadListLoading` or a thin variant) | Orders → Customers tab no longer shows “Searching…” in an empty list | `CustomersPanel.tsx` | ~45m |

## Remaining work (slightly larger, still one PR each)

| # | Task | Why | Touch | Est. |
| --- | --- | --- | --- | --- |
| 7 | **Orders board single fetch** — one `/api/orders/board` (or batched handler) returning all three column pages; replace three `useOrderColumn` SWR keys with one | Columns always hydrate together; fewer Shopify round-trips | `OrdersPageClient.tsx`, new API route, `order-requests.ts` | ~2–3h |
| 8 | **Sidebar link prefetch** — `router.prefetch(href)` on dashboard nav link hover/focus in `DashboardSidebar` | Repeat navigations feel instant; pairs with route `loading.tsx` | `DashboardSidebar` or nav item component | ~1h |
| 9 | **Home `agentName` from server** — pass resolved `agentName` from `(shell)/page.tsx` (org already loaded in layout) instead of waiting on `useOrg` in `useHomeData` | Removes rare default-name flash in briefing | `page.tsx`, `DashboardHomeClient`, `useHomeData` | ~45m |

## Explicitly out of scope (do not batch here)

- Merging `/api/integrations` polling with realtime (separate perf project).
- Rewriting orders search to share the board endpoint.
- Tightening knip to fail on unused exports (tracked separately; kit already
  errors on orphan **files**).
- Animation changes to `WorkflowSetupBanner` (layout shift is acceptable once
  the home gate from #1–2 is done).

## Suggested PR order

1. #1 → #2 (home feels done in one shot)
2. #3 (tickets modal)
3. #4 → #5 → #6 (polish pass on remaining routes)
4. #7 when orders latency is noticed in profiling
5. #8–#9 as idle-time wins

## Test plan (every PR)

```bash
npm run typecheck -w apps/dashboard
npm run test:unit -w apps/dashboard
npm run lint -w apps/dashboard
```

Manual smoke:

1. Hard refresh `/dashboard` — briefing and Needs You appear together.
2. Navigate Home → Tickets → Orders → KB → Integrations — each route shows its
   skeleton immediately, then content in one pass.
3. Open a ticket from the queue — modal shows conversation skeleton, then thread.
4. Orders board (connected Shopify) — columns do not trickle in one by one after
   #7.

## Completed

| Task | PR | Date |
| --- | --- | --- |
| Shared skeleton kit + route `loading.tsx` files | — | 2026-08-05 |
| Home unified loading gate | — | 2026-08-05 |
| KB `MemoryLibrarySkeleton` | — | 2026-08-05 |
| Orders board initial skeleton + integrations guard | — | 2026-08-05 |
| Agent configure server integration flags | — | 2026-08-05 |
| Billing tab section skeleton | — | 2026-08-05 |
