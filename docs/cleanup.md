# Project Cleanup Plan

This document tracks the major cleanup targets found during the repo audit on 2026-05-21. The current worktree already had many uncommitted changes, so these items are written as follow-up work rather than applied changes.

Validation at audit time:

- `npx turbo run typecheck --force` passed.
- `npx turbo run lint --force` passed.
- `npx turbo run test:unit --env-mode=loose --force` passed.

## 1. Remove Pre-Launch Demo UI

`apps/dashboard/src/app/dashboard/layout.tsx` still hardcodes demo notifications before adding real billing and integration notices.

Cleanup:

- [ ] Remove the hardwired demo trial notification.
- [ ] Remove the hardwired demo integration notification.
- [ ] If demo notifications are still useful, gate them behind an explicit fixture/demo mode.

## 2. Consolidate Duplicated Modules (Complete)

Several modules now duplicate the same concepts and should be collapsed to one canonical source.

Cleanup:

- [x] Merge `apps/dashboard/src/lib/channels.ts` into `apps/dashboard/src/lib/messaging/channels.ts`, then update the remaining import.
- [x] Remove unused `apps/dashboard/src/lib/constants.ts` in favor of `apps/dashboard/src/lib/messaging/thread-constants.ts`.
- [x] Replace `apps/dashboard/src/app/dashboard/analytics/_components/DateRangeSelector.tsx` with the shared `apps/dashboard/src/components/dashboard/DateRangeSelector.tsx`.

## 3. Split Oversized Client Modules (Complete)

Large client files mix data loading, state machines, formatting, and rendering, making them hard to review safely.

Cleanup candidates:

- [x] `apps/dashboard/src/app/dashboard/settings/_components/AgentTab.tsx`
- [x] `apps/dashboard/src/app/dashboard/kb/_components/KbPageClient.tsx`
- [x] `apps/dashboard/src/components/integrations/IntegrationCard.tsx`
- [x] `apps/dashboard/src/app/dashboard/products/_components/ProductsPageClient.tsx`
- [x] `apps/dashboard/src/app/dashboard/reports/page.tsx`
- [x] `apps/dashboard/src/app/dashboard/_components/DashboardSidebar.tsx`

Suggested direction:

- Move pure formatters and constants into colocated helper files.
- Extract large visual sections into smaller components.
- Move fetch/mutation state into focused hooks where it reduces repeated state wiring.

Progress:

- [x] Extracted `AgentTab.tsx` timezone constants, hydration, raw-input serialization, payload building, and reducer logic into `apps/dashboard/src/app/dashboard/settings/_components/agent-tab-helpers.ts`.
- [x] Moved the Agent settings timezone dropdown into `apps/dashboard/src/app/dashboard/settings/_components/TimezoneSelect.tsx`.
- [x] Added unit coverage for the Agent settings helper behavior.
- [x] `KbPageClient.tsx` (742 → 413): extracted `kb-helpers.ts` plus `KbCollectionRow`, `KbArticleCard`, `KbArticleDetail`, `KbCollectionsDropdown`.
- [x] `IntegrationCard.tsx` (732 → 394): extracted `integration-card-helpers.ts` plus `CopyButton`, `GreenToggle`, `StatusPill`, `PermissionToggleRow`, `EmailForwardingDisclosure`, `ShopifyPermissionsPanel`.
- [x] `ProductsPageClient.tsx` (637 → 244): extracted `products-helpers.ts` plus `ProductImage`, `ProductStatStrip`, `ProductListRow`, `ProductListSkeleton`, `ProductEmptyState`, `ProductDrawer`.
- [x] `reports/page.tsx` (647 → 62): extracted `_components/reports-helpers.ts`, `ExportButton`, `Skeleton`, and per-card files `SupportSummaryCard`, `AgentActivityCard`, `TopTopicsCard`, `CustomerContactCard`, `GdprExportSection`.
- [x] `DashboardSidebar.tsx` (681 → 93): extracted `sidebar/` directory with `useNavAuth`, `sidebar-helpers.ts`, `Logo`, `OpenCountBadge`, `OrgSwitcher`, `UserMenu`, `NavGroupList`, `FooterLinks`, `SidebarNavContent`, `MobileNavSheet`, `MobileBottomBar`.

## 4. Extract Agent Chat Approval Logic (Complete)

`apps/dashboard/src/app/api/agent/chat/route.ts` contains approval regexes, plan summarization, pending-approval persistence, and the HTTP handler in one route file.

Cleanup:

- [x] Move approval parsing and pending-approval helpers into a tested library module, for example `apps/dashboard/src/lib/agent/api/dashboard-approval.ts`.
- [x] Keep the route focused on auth, rate limit, request parsing, and response mapping.
- [x] Add focused tests for approval/dismiss/revision behavior outside the route.

## 5. Normalize API Route Plumbing (Complete)

Dashboard API routes repeated the same ceremony: `getOrCreateOrg`, billing checks, rate limits, request parsing, `NextResponse.json({ error })`, and `handleApiError`.

Cleanup:

- [x] Added `withOrgRoute` + `assertEntityInOrg` in `apps/dashboard/src/lib/api/route.ts` (org auth, optional billing write-gate, optional rate limit, awaited dynamic params, `ApiError` mapping, optional `onError` hook for failure side effects).
- [x] Standardized response shapes via the `ApiError` hierarchy in `apps/dashboard/src/lib/api/errors.ts` (`BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `NoActiveOrganizationError`).
- [x] Migrated 35+ org-scoped routes onto the helper: canned-responses, playbooks, kb, org/data, org/audit-log, shopify/{customer,customers,customers/search,products}, integrations/shopify/kb-sync, search, integrations CRUD, threads (list, [id], bulk, customer/[customerId], shopify), agent (run, plan, ask, quick-approve, chat, sessions, sessions/[id], actions), messages, ai/summary, analytics, orders, reports, reports/gdpr, integrations/telegram.
- Intentionally skipped (different shape): webhooks (HMAC verify), internal-secret routes (`messages/internal`, `messages/auto-ack`, `agent/internal`, `agent/plan-internal`, `playbooks/trigger`), OAuth auth/callback flows, billing/* (Stripe-specific shapes), feedback + health (no org), team (Clerk-org-only), threads/[id]/presence (clerkOrgId-keyed Redis), instagram/connect (redirect flow).

## 6. Refresh Docs And Env Contracts (Complete)

Docs and env examples have drifted from the current code.

Cleanup:

- [x] Update `README.md` references from Next.js 15 to the current Next.js 16 setup.
- [x] Update README key-file paths that now point to moved or deleted files.
- [x] Add production-required variables missing from example env files, including `TOKEN_ENCRYPTION_KEY`, `CLERK_WEBHOOK_SECRET`, `BLOB_READ_WRITE_TOKEN`, and Sentry source-map upload vars.
- [x] Document optional integration variables used by code paths, including Google, Microsoft, USPS, Postmark inbound auth, and `INTERNAL_API_SECRET_PREV`.

## 7. Tighten Type Escapes (Complete)

The remaining explicit `any` escapes found during audit have been removed.

Cleanup:

- [x] Replace Redis/BullMQ connection casts in `apps/gateway/src/worker.ts`.
- [x] Replace Redis/BullMQ connection parameter `any` types in `apps/gateway/src/maintenance/workers.ts`.
- [x] Remove the Stripe proxy `any` escape in `apps/dashboard/src/lib/billing/stripe.ts` if a typed lazy wrapper can preserve behavior.
- [x] Replace the settings JSON `as any` in `apps/dashboard/src/app/api/org/route.ts` with a typed Prisma JSON cast or helper.

## 8. Add A Safe Repo Clean Script (Complete)

Ignored local artifacts are large and easy to leave behind. During audit, `.turbo`, `.next`, `.next-e2e`, coverage, dist, and workspace-local `node_modules` directories accounted for significant local disk usage.

Cleanup:

- [x] Add a non-destructive `clean` script that removes ignored build/cache artifacts.
- [x] Keep dependency removal separate, for example `clean:deps`, so normal cleanup does not delete installed packages unexpectedly.
- [x] Document what each clean command deletes before running it.
