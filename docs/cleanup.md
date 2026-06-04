# Project Cleanup Plan

## Current Cleanup Plan (2026-06-03)

This plan replaces the previous completed cleanup tracker. The prior plan is done; this list comes from a follow-up read-only audit looking for remaining cleanup outside that work.

Verification at audit time:

- `npm run lint` passed.
- No code changes were made during the audit.
- The worktree already had unrelated uncommitted changes. Treat existing uncommitted work as user-owned unless a task below explicitly needs the same file.

## Phase 0: Immediate Workflow Fixes

These are cleanup tasks with direct user-facing failure modes.

- [x] Fix `apps/dashboard/src/app/dashboard/customers/_components/CustomerDrawerContent.tsx`.
  - Avoid `data!` in the save path; editing can happen before the detail SWR request resolves.
  - Add visible error handling for failed customer save responses.
  - Add visible error handling for failed "Start Support Thread" responses.
- [x] Fix silent action failures in `apps/dashboard/src/app/dashboard/kb/_components/KbPageClient.tsx`.
  - Surface create/update/delete errors for knowledge bases and articles.
  - Keep draft/edit state coherent after failed writes.
  - Extract request helpers so the page component is not manually handling every fetch.
- [x] Fix pagination/request failure behavior in `apps/dashboard/src/app/dashboard/products/_components/ProductsPageClient.tsx`.
  - Check non-OK `loadMore` responses before appending products.
  - Surface failures to the UI instead of silently clearing the loading state.

## Phase 1: Shared API Helpers

These reduce repeated security and request-handling code.

- [x] Consolidate `timingSafeIncludes`.
  - Remove the duplicate implementation split between `apps/dashboard/src/lib/auth-utils.ts` and `apps/dashboard/src/lib/server/auth-utils.ts`.
  - Keep internal-secret helpers in a server-only module.
  - Update OAuth routes and internal routes to import from the right place.
- [x] Add a shared internal-route helper for `x-internal-secret` endpoints.
  - Cover `apps/dashboard/src/app/api/messages/internal/route.ts`.
  - Cover `apps/dashboard/src/app/api/messages/auto-ack/route.ts`.
  - Cover `apps/dashboard/src/app/api/agent/internal/route.ts`.
  - Cover `apps/dashboard/src/app/api/agent/plan-internal/route.ts`.
  - Cover `apps/dashboard/src/app/api/playbooks/trigger/route.ts`.
  - Preserve billing-write checks and route-specific error messages.
- [x] Extract OAuth session/cookie helpers for integration auth and callback routes.
  - Share state cookie creation, return-to handling, session validation, and cookie cleanup.
  - Start with Gmail and Outlook because their callback bodies are nearly identical.
  - Reuse the same primitives for Instagram and Shopify where provider-specific behavior allows it.
- [x] Extract email integration upsert logic.
  - Share the race-safe create/update flow used by Gmail and Outlook.
  - Keep the current behavior that removes other email rows for the org after the selected integration is saved.

## Phase 2: Tickets Workspace State

The tickets page has the highest frontend state complexity left after the completed cleanup.

- [x] Extract SWR cache coordination from `apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx`.
  - Move `patchThreadCaches`, `moveThreadStatus`, and `revalidateThreadCaches` into a focused hook.
  - Cover open, closed, filtered, search, and active-thread caches in one tested module.
- [x] Extract active-thread selection/query-param behavior.
  - Move `?thread=` application, active preview fallback, and conversation loading state into a dedicated hook.
  - Keep behavior for threads that are not in the currently loaded list page.
- [x] Extract summary refresh handling.
  - Replace the local `console.error` with UI-visible feedback or a shared logging/toast path.
  - Prevent concurrent refreshes per thread as the current ref-based guard does.
- [x] Add focused tests around the extracted cache coordinator.
  - Include close/reopen, filtered recovery, active thread mutation, and search cache updates.

## Phase 3: Settings UI Second Pass

The first cleanup split the settings page, but left one large section bucket.

- [x] Split `apps/dashboard/src/app/dashboard/settings/_components/agent-tab-sections.tsx`.
  - Move autonomy controls into their own module.
  - Move identity and voice proposal UI into their own module.
  - Move sample replies into their own module.
  - Move guardrails, response language, digest, business hours, spam filter, and sticky save bar into focused modules.
- [x] Extract repeated settings form primitives.
  - Shared labeled text input.
  - Shared money/number input.
  - Shared select field styling.
  - Shared character-count textarea.
- [x] Keep `AgentTab` imports stable or add a thin barrel only if it does not conflict with `scripts/check-module-structure.mjs`.

## Phase 4: Messaging And Agent Tool Dispatch

The dashboard has a shared dispatch path, but agent tools still duplicate provider-send behavior.

- [ ] Align agent reply sending with `apps/dashboard/src/lib/messaging/dispatch-message.ts`.
  - Remove duplicated Instagram dispatch logic from `apps/dashboard/src/lib/agent/tools/thread.ts`.
  - Remove duplicated email reply dispatch logic where the shared dispatcher can preserve behavior.
  - Preserve agent-specific tool result messages.
- [ ] Extract shared email header/subject helpers.
  - Centralize synthetic message IDs, `In-Reply-To`, `References`, and `Re:` subject formatting.
  - Use the helper from dashboard sends and agent sends.
- [ ] Extract provider failure recording helpers.
  - Keep current provider-specific failure details.
  - Avoid divergent behavior between dashboard sends and agent sends.
- [ ] Add targeted tests for dispatch behavior before broad refactors.
  - Email success/failure.
  - Instagram token/window failures.
  - Outbound recorder short-circuit behavior.

## Phase 5: Shopify Agent Order Modules

`apps/dashboard/src/lib/agent/shopify/orders.ts` mixes read, update, cancel, create, and GraphQL edit flows.

- [ ] Split read-only order lookup functions from mutating order functions.
- [ ] Move order address update and customer-address sync into a focused module.
- [ ] Move order creation and line-item validation into a focused module.
- [ ] Move GraphQL order-edit begin/add/remove/commit flow into a focused module.
- [ ] Keep user-facing tool result text behavior stable.
- [ ] Add or expand targeted tests before moving the GraphQL edit flow.

## Phase 6: Gateway Route And Worker Cleanup

Gateway behavior is correct enough to pass lint, but several files mix parsing, side effects, and formatting.

- [ ] Split `apps/gateway/src/routes/webhooks-telegram.ts`.
  - Extract webhook signature/rate-limit validation from message handling.
  - Extract `/start` binding.
  - Extract command parsing into a typed parser.
  - Extract digest commands: `REVIEW`, `OPEN`, `SPAM`, `REPLY`.
  - Extract pending-plan commands: `yes`, `no`, `skip`.
  - Extract order lookup and free-form agent execution.
- [ ] Add parser tests for Telegram commands.
  - Include malformed indexes, mixed casing, empty reply text, and free-form fallback.
- [ ] Split `apps/gateway/src/message-handlers/planning.ts`.
  - Move dashboard internal API calls into a small client helper.
  - Move operator notification formatting/sending into its own module.
  - Move business-hours settings and evaluation into its own module.
  - Keep auto-ack dispatch behavior unchanged.

## Phase 7: Component Naming And Hook Boundaries

Several components use hook-like names for functions that return JSX. This passes lint but blurs component/hook boundaries.

- [ ] Rename `use*View` functions that return JSX into regular component names.
  - `apps/dashboard/src/app/dashboard/kb/_components/KbPageClient.tsx`
  - `apps/dashboard/src/app/dashboard/products/_components/ProductsPageClient.tsx`
  - `apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx`
  - `apps/dashboard/src/components/agent/AgentChatClient.tsx`
  - `apps/dashboard/src/app/dashboard/settings/_components/workspace/WorkspaceTab.tsx`
  - `apps/dashboard/src/app/dashboard/canned-responses/page.tsx`
  - `apps/dashboard/src/app/dashboard/orders/_components/OrdersPageClient.tsx`
  - `apps/dashboard/src/app/dashboard/team/_components/TeamPageClient.tsx`
  - `apps/dashboard/src/app/dashboard/feedback/page.tsx`
- [ ] Where state logic is substantial, extract actual hooks that return state/actions instead of JSX.

## Phase 8: Packaging And Artifact Hygiene

- [ ] Clean ignored local artifacts when appropriate.
  - `packages/db/dist`
  - `apps/gateway/coverage`
  - Other ignored build/test outputs found by `npm run clean`
- [ ] Review `@clerk/db` type exports.
  - Current package exports point runtime code at `dist/*.js` but type entries at source-level `.d.ts` stubs.
  - Decide whether to keep the stubs intentionally or switch exports to generated `dist/*.d.ts`.
  - If keeping source-level stubs, document why and ensure new exported modules get matching stubs.

## Verification Policy

- [ ] Run `npm run lint` after each cleanup batch.
- [ ] Run targeted tests for each touched module.
- [ ] Run broader coverage after phases that touch shared API helpers, dispatch behavior, or gateway message handling.
- [ ] Avoid unrelated refactors in files already modified by user-owned work.
