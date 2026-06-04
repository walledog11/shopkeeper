# Project Cleanup Plan

## Current Cleanup Plan (2026-06-04)

This plan replaces the completed cleanup tracker. It covers issues found in a follow-up audit and intentionally excludes work from the previous plan.

Audit baseline:

- `npm run lint` fails because `packages/agent/src` is ignored by the ESLint configuration.
- Dashboard, gateway, and DB workspace lint commands pass, but DB lint coverage is incomplete.
- `npm run test:unit` passes: 15 files and 101 tests.
- `npm run test:node` passes: 23 tests.
- Agent and gateway builds pass.
- Integration and end-to-end tests were not run during the audit.
- The worktree contains user-owned uncommitted changes. Do not revert or rewrite unrelated work.

## Phase 0: Restore Trustworthy Lint Coverage

Complete this phase before broad cleanup work so later verification covers the files being changed.

- [x] Fix the root lint failure for `packages/agent`.
  - Add `packages/agent/src/**/*.ts` to the ESLint flat configuration.
  - Ensure the package lint script targets files covered by that configuration.
- [x] Expand `packages/db` lint coverage.
  - Replace the explicit four-file list with globs covering all intended source and script files.
  - Include `crypto.ts`, `llm-spend.ts`, `spend-store.ts`, and `scripts/*.ts`.
- [x] Make lint fail when a package script targets ignored source files.
- [x] Verify the root and workspace lint commands all pass and inspect their resolved file coverage.

## Phase 1: Replace Dashboard Home Full-Inbox Fetches

The home page currently fetches and polls the full open and closed inbox. Its reply metrics are also derived from only the latest message in each thread, which undercounts replies.

- [ ] Define a server-side home summary contract.
  - Return aggregate metrics directly from the database.
  - Return small, bounded lists for needs-attention, overnight, and repeat-customer sections.
  - Reuse the canonical inbox filters, including deleted and filtered thread behavior.
- [ ] Implement a home summary query service and API endpoint.
  - Calculate replies sent from messages or actions instead of one preview message per thread.
  - Calculate daily series and comparison-period metrics in the database.
  - Avoid loading complete thread collections into application memory.
- [ ] Update the dashboard home page and `useHomeData` to consume the summary contract.
  - Remove full open/closed thread polling from the home page.
  - Keep refresh intervals bounded to the summary endpoint.
- [ ] Add query and UI tests for metric correctness, filtering, limits, and empty states.

## Phase 2: Standardize Client Request And Mutation Failures

Several dashboard actions ignore non-OK responses, parse error payloads as success data, or update local state after failed writes.

- [ ] Adopt one shared client request/error contract.
  - Extend or consistently use `apps/dashboard/src/lib/api/fetcher.ts`.
  - Standardize typed success payloads, API error extraction, and visible action errors.
  - Decide on a shared mutation helper only if it removes repeated loading/error state.
- [ ] Migrate canned response create, update, duplicate, and delete actions.
- [ ] Migrate playbook toggle, save, and delete actions.
- [ ] Migrate team member and invitation deletion actions.
  - Do not remove local state until the server confirms success.
- [ ] Migrate order and customer pagination.
  - Check response status before appending data.
  - Preserve the current list when loading another page fails.
- [ ] Migrate the order-page "Start Support Thread" action.
- [ ] Add focused failure-path tests for each migrated workflow.

## Phase 3: Enforce A Shared Organization Settings Contract

Organization settings are currently cast from arbitrary request JSON and merged into persisted data without runtime validation. Dashboard and gateway behavior has already drifted for overnight business hours.

- [ ] Define one runtime settings parser and normalizer shared by dashboard and gateway.
  - Reject unknown keys and invalid field types at the API boundary.
  - Apply defaults and migration behavior for historical persisted settings.
  - Remove unsafe settings casts from gateway business-hours handling.
- [ ] Validate `PATCH /api/org` before persisting settings.
- [ ] Decide and document whether overnight business-hour windows are supported.
  - Align dashboard validation with gateway evaluation.
  - Add shared contract tests for normal, overnight, closed, and malformed schedules.
- [ ] Add tests for invalid patches and malformed historical settings.

## Phase 4: Use The Defensive Customer-Memory Parser

Agent context currently casts persisted customer-memory JSON directly even though the DB package provides a parser that repairs and bounds historical data.

- [ ] Replace the raw customer-memory cast in agent context with `parseStoredMemory`.
- [ ] Convert parsed empty memory to `null` before prompt rendering.
- [ ] Ensure oversized strings, arrays, and malformed policy flags cannot enter prompts unbounded.
- [ ] Add context tests for malformed, oversized, empty, and valid stored memory.

## Phase 5: Split And Correct The Action-Log Read Model

The action-log reader drops threadless actions, report generation silently caps reads at 50,000 rows, and four dashboard views duplicate pagination and error handling.

- [ ] Make the action-log read model support threadless actions.
  - Update `ActionLogEntry` so `threadId` and thread metadata can be absent.
  - Preserve module and order-operation audit records without inventing a thread.
  - Add tests covering threadless order-operation actions.
- [ ] Move report aggregation into database queries.
  - Remove the silent 50,000-row reporting cap.
  - Keep report results correct for large date ranges.
- [ ] Extract a shared action-log query hook for Activity, Review, Audit Log, and Agent views.
  - Centralize pagination, loading, error, and refresh behavior.
  - Keep each view's filters and presentation separate.
- [ ] Review `GET /api/org/audit-log`.
  - Remove it if there is no external compatibility requirement.
  - Otherwise, route it through the canonical action-log query and streaming CSV implementation.

## Phase 6: Consolidate Analytics And Reporting Queries

Analytics and reports duplicate date parsing and several expensive status, channel, tag, and first-reply queries.

- [ ] Extract a shared, validated reporting date-range parser.
- [ ] Extract shared query primitives for status, channel, tag, and first-reply metrics.
- [ ] Keep intentional differences, such as result limits, explicit and parameterized.
- [ ] Add query-level tests that compare analytics and report results for the same range.
- [ ] Inspect query plans and add indexes only where measured queries require them.

## Phase 7: Modularize Gateway Maintenance Workers

`apps/gateway/src/maintenance/workers.ts` manually assembles queues, repeat schedules, workers, failure handlers, and shutdown resources for every maintenance job.

- [ ] Define a small job registration contract returning its workers and queues.
- [ ] Move token-health, retention, digest, and other job orchestration into focused modules.
- [ ] Build maintenance resources from one composition registry.
  - Ensure newly registered resources are automatically included in shutdown handling.
  - Preserve existing queue names, schedules, concurrency, and failure logging.
- [ ] Add registration and shutdown tests.

## Phase 8: Consolidate Race-Safe Integration Upserts

The same find/update/create/P2002/re-fetch/update flow is duplicated across generic integrations, email, Instagram, and Shopify.

- [ ] Extract a typed race-safe integration upsert primitive.
- [ ] Add a focused Prisma unique-constraint guard instead of broad error casting.
- [ ] Migrate the generic integration route and provider callbacks.
- [ ] Preserve provider-specific cleanup and post-save behavior.
- [ ] Add concurrency and provider-specific behavior tests.

## Phase 9: Small Consistency Cleanup

Complete these after the higher-risk behavioral work.

- [ ] Fix the Activity feed approver label so missing approvers cannot render as `By ,`.
- [ ] Consolidate duplicated relative-time formatting in Activity and Review with the shared date-formatting utilities.
- [ ] Remove `useOpenThreads` if it remains unused after the dashboard home changes.

## Verification Policy

- [ ] Run `npm run lint` after each cleanup batch.
- [ ] Run targeted tests for every changed module and failure path.
- [ ] Run `npm run test:unit` and `npm run test:node` after shared contract changes.
- [ ] Run integration or end-to-end coverage for dashboard workflows, action logs, settings, and integration callbacks before completing their phases.
- [ ] Run agent and gateway builds after shared package, settings, or gateway worker changes.
- [ ] Keep cleanup commits scoped by phase and do not modify unrelated user-owned work.
