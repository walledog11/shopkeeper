# Project Cleanup Plan

## Current Cleanup Plan (2026-06-05)

This plan replaces the completed cleanup tracker. It covers issues found in the follow-up code audit and intentionally excludes the work already completed in the previous `docs/cleanup.md`.

Audit baseline:

- `npm run lint` passes.
- `npm run test:unit` passes from Turbo cache.
- `npm run test:node` passes.
- The worktree contains user-owned uncommitted changes. Do not revert or rewrite unrelated work.

## Phase 0: Keep The Cleanup Verifiable

Use this phase as the verification contract for the rest of the plan.

- [x] Keep cleanup changes scoped by phase.
- [x] Run `npm run lint` after each cleanup batch.
- [x] Run targeted tests for every changed module and failure path.
  - Phase 0 is doc-only, so no module-specific failure-path tests were required.
- [x] Run `npm run test:unit` and `npm run test:node` after shared package or API contract changes.
- [x] Run gateway and agent builds after shared package, logging, or worker orchestration changes.
- [x] Do not modify unrelated user-owned work.

Phase 0 verification completed on 2026-06-05:

- `npm run lint`
- `npm run test:unit`
- `npm run test:node`
- `npm run build -w packages/agent`
- `npm run build -w apps/gateway`

Keep this verification contract active for every later cleanup phase.

## Phase 1: Consolidate Agent Tool Definitions

Agent tool definitions are currently spread across Anthropic schemas, TypeScript input interfaces, metadata, policy checks, and executor switch branches. This creates drift risk and leaves runtime argument validation weak.

Relevant files:

- `packages/agent/src/tools/tool-schemas.ts`
- `packages/agent/src/tools/tool-inputs.ts`
- `packages/agent/src/tools/tool-metadata.ts`
- `packages/agent/src/tools/executor.ts`
- `packages/agent/src/tools/static-policy.ts`

Tasks:

- [x] Define a single tool-definition registry for every agent tool.
- [x] Store each tool's name, schema, runtime parser, category, group, labels, policy metadata, and executor binding in that registry.
- [x] Derive the Anthropic tool schema list from the registry.
- [x] Derive tool labels, tool categories, plan-step labels, and UI selectors from the registry.
- [x] Replace unsafe `cast<T>` argument handling with runtime validation before execution.
- [x] Fix known schema drift, including `create_refund` documentation versus required arguments.
- [x] Add parser and execution-routing tests for every tool.

Phase 1 verification completed on 2026-06-05:

- `npm run test:unit -w packages/agent`
- `npm run lint -w packages/agent`
- `npm run build -w packages/agent`
- `npm run lint`
- `npm run test:unit`
- `npm run test:node`
- `npm run build -w apps/gateway`

## Phase 2: Finish Agent Package Boundary Cleanup

The agent extraction left dashboard compatibility shims and split test ownership. Some files are real host adapters, while others are pure re-export shims.

Relevant files:

- `apps/dashboard/src/lib/agent/context.ts`
- `apps/dashboard/src/lib/agent/run.ts`
- `apps/dashboard/src/lib/agent/api/agent-actions.ts`
- `apps/dashboard/src/lib/agent/tools/executor.ts`
- `apps/dashboard/src/lib/ai/index.ts`
- `apps/dashboard/src/lib/agent/runner.test.ts`
- `packages/agent/package.json`

Tasks:

- [x] Classify each dashboard agent shim as a host adapter or compatibility re-export.
- [x] Migrate imports to `@clerk/agent` wherever no dashboard host dependency is required.
- [x] Keep dashboard wrappers only where they inject dashboard-specific runtime dependencies.
- [x] Move core agent behavior tests from `apps/dashboard` into `packages/agent`.
- [x] Leave only route, IO, and host-integration tests in dashboard.
- [x] Remove obsolete re-export files once imports and tests no longer need them.

Phase 2 classification:

- Host adapters kept in dashboard: `apps/dashboard/src/lib/agent/context.ts`, `apps/dashboard/src/lib/agent/run.ts`, `apps/dashboard/src/lib/agent/runner.ts`, and `apps/dashboard/src/lib/agent/tools/thread.ts`.
- Route, IO, eval, and host-integration ownership stayed in `apps/dashboard/src/lib/agent/api/*`, `apps/dashboard/src/lib/agent/tools/thread.test.ts`, `apps/dashboard/src/lib/agent/context.test.ts`, and `apps/dashboard/src/lib/agent/__evals__/*`.
- Pure re-export shims for agent core, tools, Shopify, AI, and thread constants were removed after imports moved to `@clerk/agent` subpaths.

Phase 2 verification completed on 2026-06-05:

- `npm run test:unit -w packages/agent`
- `npm run build -w packages/agent`
- `npm run test:unit -w apps/dashboard`
- `npm run test:integration -w apps/dashboard -- src/lib/agent/context.test.ts src/lib/agent/tools/thread.test.ts src/lib/agent/api/action-log.test.ts`
- `npm run lint:structure`
- `npm run lint -w packages/agent`
- `npm run lint -w apps/dashboard`
- `npm run build -w apps/gateway`
- `npm run build -w apps/dashboard` (rerun outside the sandbox after Turbopack hit a sandbox port-binding restriction)
- `npm run lint`
- `npm run test:unit`
- `npm run test:node`

## Phase 3: Centralize API Body Parsing And Validation

API routes still duplicate hand-written JSON parsing and request validation. Several direct `request.json()` calls can turn malformed JSON into generic server errors.

Relevant files:

- `apps/dashboard/src/lib/api/route.ts`
- `apps/dashboard/src/app/api/canned-responses/route.ts`
- `apps/dashboard/src/app/api/kb/[id]/route.ts`
- `apps/dashboard/src/app/api/agent/plan-internal/route.ts`
- `apps/dashboard/src/app/api/agent/order-risk-internal/route.ts`

Tasks:

- [x] Add a shared JSON body reader that maps malformed JSON to `BadRequestError`.
- [x] Add route-friendly helpers for required objects, optional objects, and empty-body handling.
- [x] Centralize validators for canned responses, KB articles, agent internals, threads, billing, and team routes.
- [x] Remove local duplicate helpers such as repeated `readJsonBody`, `requireNonEmptyString`, and tag normalizers.
- [x] Add failure-path tests for malformed JSON, invalid field types, empty bodies, and unknown fields where relevant.

Phase 3 verification completed on 2026-06-05:

- `npm run test:unit -w apps/dashboard -- src/lib/api/body.unit.test.ts src/lib/agent/api/validation.unit.test.ts src/app/api/threads/_lib/validation.unit.test.ts src/app/api/team/_lib/validation.unit.test.ts src/app/api/billing/_lib/validation.unit.test.ts`
- `npm run test:integration -w apps/dashboard -- src/app/api/canned-responses/route.test.ts src/app/api/kb/bases/route.test.ts 'src/app/api/threads/[id]/route.test.ts' src/app/api/billing/checkout/route.test.ts src/app/api/billing/portal/route.test.ts src/app/api/agent/plan-internal/route.test.ts`
- `npm run test:integration -w apps/dashboard -- src/app/api/agent/route.test.ts src/app/api/agent/chat/route.test.ts src/app/api/agent/internal/route.test.ts src/app/api/agent/plan/route.test.ts src/app/api/agent/quick-approve/route.test.ts src/app/api/org/route.test.ts src/lib/security/tenant-data-surfaces.test.ts`
- `npm run lint -w apps/dashboard`
- `npm run lint`
- `npm run test:unit`
- `npm run test:node`

## Phase 4: Split Gateway Core Worker Registration

The maintenance worker cleanup is complete, but `apps/gateway/src/worker.ts` still assembles inbound workers, AI summary workers, Redis resources, failure handlers, heartbeat, and shutdown wiring in one file.

Relevant files:

- `apps/gateway/src/worker.ts`
- `apps/gateway/src/maintenance/workers.ts`

Tasks:

- [x] Extract inbound worker registration into a focused module.
- [x] Extract AI summary worker registration into a focused module.
- [x] Create a shared gateway worker resource contract for queues, workers, heartbeat, and shutdown resources.
- [x] Centralize job failure logging and shutdown registration.
- [x] Keep queue names, concurrency, retry behavior, and telemetry unchanged.
- [x] Add registration and shutdown tests for the core workers.

Phase 4 verification completed on 2026-06-05:

- `npm run test:integration -w apps/gateway -- src/worker.test.ts src/workers/core.test.ts src/maintenance/workers.test.ts`
- `npm run lint -w apps/gateway`
- `npm run build -w apps/gateway`
- `npm run lint`
- `npm run test:unit`
- `npm run test:node`
- `npm run build -w packages/agent`

## Phase 5: Inject Host Logging Into `packages/agent`

`packages/agent` currently logs directly through `console`, bypassing dashboard and gateway logging behavior.

Relevant files:

- `packages/agent/src/logger.ts`
- `packages/agent/src/run.ts`
- `packages/agent/src/planner.ts`
- `packages/agent/src/spend.ts`

Tasks:

- [x] Define a small logger interface for the agent package.
- [x] Let dashboard and gateway install or pass their host logger.
- [x] Preserve log levels, redaction behavior, and request or job correlation metadata.
- [x] Keep a minimal console fallback for tests and standalone package usage.
- [x] Add tests that verify injected logging is used for planner, runner, and spend paths.

Phase 5 verification completed on 2026-06-05:

- `npm run test:unit -w packages/agent -- src/run.test.ts src/planner.test.ts src/spend.test.ts`
- `npm run test:unit -w packages/agent`
- `npm run build -w packages/agent`
- `npm run lint -w packages/agent`
- `npm run lint -w apps/gateway`
- `npm run build -w apps/gateway`
- `npm run lint -w apps/dashboard`
- `npm run lint`
- `npm run test:unit`
- `npm run test:node`

Additional verification note:

- `npm run build -w apps/dashboard` was attempted in the sandbox and rerun outside the sandbox after Turbopack hit the known port-binding restriction. The elevated build reached type checking and failed on an unrelated pre-existing issue in `apps/dashboard/src/app/api/threads/_lib/validation.ts` where `ThreadFilterStatus` is used as a type.

## Phase 6: Decompose Large Client Components

Several client files combine workflow state, mutation orchestration, local effects, and rendering. These are hard to test and risky to change.

Relevant files:

- `apps/dashboard/src/app/dashboard/kb/_components/KbPageClient.tsx`
- `apps/dashboard/src/app/dashboard/settings/_components/workspace/WorkspaceTab.tsx`
- `apps/dashboard/src/components/agent/AgentChatClient.tsx`
- `apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx`
- `apps/dashboard/src/app/dashboard/customers/_components/CustomerDrawerContent.tsx`

Tasks:

- [x] Split KB page workflow state, mutation helpers, and view components.
- [x] Split Workspace tab logo upload, export, clear tickets, delete workspace, and save flows.
- [x] Split Agent chat session restoration, send/retry logic, and rendering.
- [x] Extract focused hooks or reducers only where they reduce real state complexity.
- [x] Add targeted tests around destructive actions and failed mutations.
- [x] Preserve current visual behavior while reducing component size and prop churn.

Phase 6 implementation notes:

- KB page state moved to `useKbPageState`, rendering moved to `KbPageView`, and request helpers remain in `kb-page-requests`.
- Workspace API helpers moved to `workspace-requests`; logo, export, clear tickets, delete workspace, and save flows are composed by `useWorkspaceTabState`; section rendering moved to `WorkspaceSections`.
- Agent chat session restoration and stale-session retry behavior moved to `agent-chat-session` and `useAgentChatState`; rendering moved to `AgentChatView`.
- Composer slash-command state moved to `composer-state`, with canned-response filtering, template replacement, Instagram window checks, and placeholder formatting in `composer-utils`.
- The customer drawer target is the existing `dashboard/customers` drawer path; edit/save and start-thread requests moved to `customer-drawer-requests`, state moved to `useCustomerDrawerState`, and rendering moved to `CustomerDrawerSections`.

Phase 6 verification completed on 2026-06-06:

- `npm run test:unit -w apps/dashboard -- src/app/dashboard/settings/_components/workspace/workspace-requests.unit.test.ts src/components/agent/agent-chat-session.unit.test.ts src/app/dashboard/tickets/_components/conversation/composer/composer-utils.unit.test.ts src/app/dashboard/customers/_components/customer-drawer-requests.unit.test.ts src/app/dashboard/kb/_components/kb-page-requests.unit.test.ts`
- `npm run lint -w apps/dashboard`
- `npm run test:unit -w apps/dashboard`
- `npm run lint`

Additional verification note:

- `./node_modules/.bin/tsc -p apps/dashboard/tsconfig.json --noEmit --pretty false` was attempted after the refactor. It failed on unrelated pre-existing dashboard typecheck issues in billing and Clerk webhook route tests using `Request` where `NextRequest` is expected, `apps/dashboard/src/app/api/threads/_lib/validation.ts` enum value/type usage, server test `NODE_ENV` assignment types, and related existing test helper typings. The rerun no longer reported Phase 6 files after fixing the extracted composer and customer drawer test type issues.

## Phase 7: Make Date And Channel Formatting Canonical

Date, relative-time, and channel labels still duplicate across dashboard surfaces, even after the Activity and Review cleanup.

Relevant files:

- `apps/dashboard/src/lib/format/date.ts`
- `apps/dashboard/src/lib/messaging/channels.ts`
- `apps/dashboard/src/app/dashboard/agent/_components/ActionLog.tsx`
- `apps/dashboard/src/app/dashboard/orders/_components/OrdersPageClient.tsx`
- `apps/dashboard/src/components/integrations/integration-card-helpers.ts`

Tasks:

- [x] Expand the shared date-formatting utilities to cover current local helpers.
- [x] Expand channel metadata helpers to cover dashboard labels consistently.
- [x] Remove local channel label maps where shared metadata is sufficient.
- [x] Remove local relative-time helpers from orders, integrations, and action log views.
- [x] Add focused tests for channel label and date formatting edge cases.

Phase 7 implementation notes:

- Shared date formatting now covers full dates, short dates, month-year labels, Unix timestamps, clock times, relative timestamps, sync labels, and activity labels with fallback and timezone options.
- Orders, KB, customers, billing, Telegram, agent chat, home briefing, reports, analytics, and context-panel date call sites now use the shared date helpers instead of local date wrappers.
- Reports channel labels now use shared channel metadata, including the report-specific internal operator grouping. Reports tool labels now use the agent tool registry instead of a local map.
- Integration token alert counting now uses the existing integration-card token helpers instead of duplicating expiry thresholds in the integrations page.

Phase 7 verification completed on 2026-06-06:

- `npm run test:unit -w apps/dashboard -- src/lib/format/date.unit.test.ts src/lib/messaging/channels.unit.test.ts`
- `npm run lint -w apps/dashboard`
- `npm run test:unit -w apps/dashboard`
- `npm run lint`

## Phase 8: Clarify Dashboard Types And DB Package Surface

Dashboard types manually mirror Prisma and DB package types. The DB package also exposes newer modules through the root export while its package surface and build contract are not very explicit.

Relevant files:

- `apps/dashboard/src/types/index.ts`
- `packages/db/index.ts`
- `packages/db/package.json`
- `packages/db/tsconfig.json`

Tasks:

- [x] Replace manually mirrored enum-like dashboard types with generated DB types or shared constants where practical.
- [x] Keep API DTO types explicit and separate from persistence model types.
- [x] Document which DB modules are public root exports and which are private implementation details.
- [x] Add subpath exports only for DB modules that should be imported directly.
- [x] Align `packages/db` TypeScript include patterns with the intended package surface.
- [x] Add type-level or compile-time tests for important shared DTO boundaries where useful.

Phase 8 implementation notes:

- `@clerk/db` now exports the `ThreadStatus` Prisma enum runtime and value type alongside the existing channel, sender, and filter enum exports.
- Dashboard enum-like types and `VoiceProposal` now alias `@clerk/db` contracts while keeping dashboard API DTO object shapes explicit with string dates.
- `packages/db/README.md` documents the public root surface, the only direct public subpaths (`customer-memory` and `test-helpers`), and the private implementation modules that should stay behind the root export.
- `packages/db/tsconfig.json` now includes every intentional root package module used by the public root surface. No new subpath exports were added because no callers import those narrower modules directly.
- `apps/dashboard/src/types/db-types.unit.test.ts` adds compile-time assertions for the DB enum aliases and important dashboard DTO boundaries.

Phase 8 verification completed on 2026-06-06:

- `npm run build -w @clerk/db`
- `npm run test:unit -w apps/dashboard -- src/types/db-types.unit.test.ts`
- `npm run lint -w @clerk/db`
- `npm run lint -w apps/dashboard`
- `npm run test:unit -w apps/dashboard`
- `npm run test:unit` (rerun with network access after the sandbox blocked the configured test database)
- `npm run test:node`
- `npm run build -w packages/agent`
- `npm run build -w apps/gateway`
- `npm run lint`

Additional verification note:

- `./node_modules/.bin/tsc -p apps/dashboard/tsconfig.json --noEmit --pretty false` was attempted after the type cleanup. It still fails on unrelated existing dashboard typecheck issues: missing `@/lib/agent/order-ops/*` modules referenced by `order-risk-internal`, route tests passing `Request` where `NextRequest` is expected, a Clerk ServerClient mock constructor type, `GetRedisFn` value/type usage in server tests, and readonly or widened `NODE_ENV` test assignments. The rerun did not report Phase 7 or Phase 8 files after fixing the initial `Ticket["filterFeedback"]` assertion in the new type-boundary test.

## Phase 9: Review Inbound Idempotency Fallbacks

Some inbound message paths synthesize an idempotency key from organization, platform, message text, and a minute bucket when no provider external message ID is available. This can collapse distinct repeated messages.

Relevant files:

- `apps/gateway/src/message-handlers/shared.ts`

Tasks:

- [x] Audit every caller that can omit `externalMessageId`.
- [x] Decide the correct fallback behavior for Shopify and other provider events.
- [x] Replace minute-bucket text fallback with a safer provider-specific key where available.
- [x] Add tests for repeated identical inbound events that should remain distinct.
- [x] Add tests for duplicate provider events that should still be deduplicated.

Phase 9 implementation notes:

- `processInboundMessage` now deduplicates only when a real provider message or webhook ID is present. Missing IDs are persisted as `NULL` so repeated identical customer messages are not collapsed by a synthetic minute bucket.
- Email uses Postmark `Message-ID` when present; IG uses Meta `mid` when present; Shopify order webhook jobs now carry `x-shopify-webhook-id` as `shopify:{shopDomain}:{webhookId}`.
- Duplicate provider retries are still skipped by the existing partial unique index on non-null `messages.external_message_id`, with an extra create-time `P2002` guard for concurrent retries.

Phase 9 verification completed on 2026-06-06:

- `npm run test:integration -w apps/gateway -- src/worker.test.ts src/routes/webhooks.test.ts`
- `npm run lint -w apps/gateway`
- `npm run build -w apps/gateway`
- `npm run lint`
