# Project Cleanup Plan

## Current Cleanup Plan (2026-06-03)

This plan comes from the current read-only cleanup audit. `npm run lint` passed, so the work is primarily maintainability, separation of concerns, stale documentation, and local artifact cleanup rather than fixing a broken build.

Current worktree note: the repo already has unrelated uncommitted changes in `apps/dashboard/src/app/dashboard/layout.tsx`, `docs/autonomy-and-generality-plan.md`, and several untracked agent eval fixtures. Treat those as user-owned unless a cleanup task explicitly needs to touch them.

## Phase 0: Hygiene

- [x] Keep this cleanup tracker aligned with the current repo state.
- [x] Ran `npm run clean` on 2026-06-03 to remove generated artifacts. The cleanup removed `.turbo`, `apps/dashboard/.next`, coverage outputs, gateway/db `dist`, `test-results`, and `apps/dashboard/tsconfig.tsbuildinfo`.
- [x] Kept dependency cleanup separate; `npm run clean:deps` was not run, so `node_modules` directories were left intact.

## Phase 1: Frontend Splits

- [x] Split `apps/dashboard/src/app/dashboard/settings/_components/AgentTab.tsx` into a `useAgentTabState` hook plus focused section components for autonomy, voice proposal, guardrails, response, WhatsApp digest, business hours, spam filter, and sticky save bar.
- [x] Split `apps/dashboard/src/app/dashboard/_components/DashboardSidebar.tsx` into the existing `sidebar/` folder: auth hook, org switcher, user menu, nav lists, mobile sheet, and mobile bottom bar.
- [x] Split `apps/dashboard/src/app/dashboard/reports/page.tsx` into `_components`: helpers, export button, skeleton, report cards, and GDPR export section.
- [x] Split `apps/dashboard/src/components/integrations/IntegrationCard.tsx` into copy button, email forwarding disclosure, Shopify permissions panel, connected accounts, and per-platform connect body components.
- [x] Split `apps/dashboard/src/app/dashboard/customers/_components/CustomersPageClient.tsx` by moving drawer detail/edit/start-thread behavior into a dedicated `CustomerDrawerContent` component/module.
- [x] Split `apps/dashboard/src/app/dashboard/playbooks/page.tsx` into constants/helpers, drawer editor, templates modal, card, empty state, and the page shell.

## Phase 2: API Cleanup

- [x] Extract settings patch, version-conflict, and delete helpers from `apps/dashboard/src/app/api/org/route.ts`.
- [x] Move Shopify customer route internals from `apps/dashboard/src/app/api/shopify/customer/route.ts` into a service module covering lookup, update, local customer-name persistence, and product image enrichment.
- [x] Review manual API routes that intentionally skipped `withOrgRoute`; migrate only routes that now match the shared helper shape without changing auth, webhook, OAuth, billing, or internal-secret semantics.

## Phase 3: Agent Tool Registry

- [x] Split `apps/dashboard/src/lib/agent/tools/registry.ts` into focused modules: `tool-metadata.ts`, `tool-schemas.ts`, `tool-inputs.ts`, and `tool-selection.ts`.
- [x] Keep `registry.ts` as a thin compatibility export so existing agent imports do not churn.

## Phase 4: Type Casts

- [ ] Replace production `as unknown as` casts where practical with typed adapters, validators, or narrower shared types.
- [ ] Prioritize `apps/dashboard/src/app/api/threads/_lib/playbook-runner.ts`, gateway Redis/BullMQ connection casts, and gateway operator-context JSON decoding.
- [ ] Leave test-only casts for a later pass unless they obscure real production behavior.

## Phase 5: Verification

- [ ] After each cleanup batch, run `npm run lint`.
- [ ] Run targeted tests for touched modules.
- [ ] Run broader test coverage after the large frontend and API splits are complete.
