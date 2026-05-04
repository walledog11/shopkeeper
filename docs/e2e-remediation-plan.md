# E2E Remediation Plan

This document is the single source of truth for making the E2E suite reliable enough to support a production launch decision.

## Goal

Prove at least one complete support workflow in CI:

```text
provider webhook -> gateway queue -> worker -> dashboard ticket -> merchant action -> outbound send recorded -> DB persisted
```

The suite must stay deterministic, avoid real provider sends, fail with actionable setup errors, and keep test-only behavior guarded by `NODE_ENV=test` plus explicit E2E flags.

## Current Status

- Request-level E2E smoke tests pass with the guarded auth bypass.
- The core browser E2E in `e2e/core-agent-flow.spec.ts` passes locally with real Clerk E2E credentials.
- Local E2E infrastructure now prepares Postgres, Redis, migrations, seed data, and outbound recording before tests run.
- Server-side provider calls are tested through test-only outbound recording, not browser `page.route()`.
- Clerk browser auth uses `@clerk/testing`, with active organization selection verified against the seeded DB organization.
- Browser E2E runs the dashboard through `next build` + `next start`, not `next dev`.
- Dashboard E2E builds no longer depend on remote font fetches and clean `.next-e2e` before each build.
- The E2E env harness loads repo/app `.env` and `.env.e2e*` files for credentials while preserving deterministic test DB, Redis, ports, and provider fakes.
- E2E is not launch-ready until `npm run test:e2e` passes in CI.

## Commands

```bash
npm run test:services:up
npm run test:e2e:smoke
npm run test:e2e:browser
npm run test:e2e
```

- `test:e2e:smoke`: request-level dashboard/gateway smoke tests with `E2E_AUTH_BYPASS=true`.
- `test:e2e:browser`: real browser flow with `@clerk/testing` and `E2E_AUTH_BYPASS=false`.
- `test:e2e`: runs smoke first, then browser.

## Required Browser E2E Env

Set these to real Clerk development-instance values before running `npm run test:e2e:browser`:

- `CLERK_SECRET_KEY`
- `CLERK_PUBLISHABLE_KEY` or `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_E2E_EMAIL`
- `E2E_CLERK_ORG_ID`

The user identified by `CLERK_E2E_EMAIL` must already belong to the Clerk organization identified by `E2E_CLERK_ORG_ID`. The DB seed uses `E2E_CLERK_ORG_ID` as `Organization.clerkOrgId`.

`scripts/with-test-env.mjs` loads `.env`, `.env.local`, `.env.e2e`, `.env.e2e.local`, plus app-level dashboard/gateway `.env*` and `.env.e2e*` files before applying E2E defaults. Shell variables still win. Deterministic E2E infrastructure values (`DATABASE_URL`, `REDIS_URL`, ports, local URLs, outbound recording, fake provider credentials) are owned by the harness unless explicitly overridden through the shell-supported E2E variables such as `TEST_DATABASE_URL`.

Current local env note: `.env.e2e.local` provides the required Clerk browser E2E values, and `npm run test:e2e` passes locally with that file present.

Current CI env note: GitHub repository secrets include the required Clerk browser E2E values. The E2E workflow now runs `npm run test:e2e` directly, so browser E2E can no longer be skipped when Clerk env is missing.

Latest local launch-gate verification: `npm run lint`, `npm run test:unit`, `npm run test:integration`, and `npm run test:e2e` passed in this workspace. CI proof is still pending until the workflow runs on GitHub.

## Completed Work

### Infrastructure

- [x] Map test Postgres and Redis to non-default host ports: `55432:5432` and `56379:6379`.
- [x] Default E2E env to the test service ports.
- [x] Add Playwright global setup and teardown.
- [x] Build `packages/db` before E2E.
- [x] Wait for Postgres and Redis before running migrations.
- [x] Run `prisma migrate deploy`.
- [x] Reset app tables deterministically.
- [x] Seed the E2E organization, membership, and email integration.
- [x] Clear outbound recording before/after runs.
- [x] Load repo/app env and `.env.e2e*` files for credentials while keeping E2E DB, Redis, ports, URLs, and provider fakes deterministic.

### Playwright Startup

- [x] Use dedicated dashboard and gateway E2E ports: `3100` and `8180`.
- [x] Disable Playwright server reuse to avoid contaminated local dev state.
- [x] Start the gateway with an E2E-only command that runs server and worker without ngrok.
- [x] Wait for gateway `/health/deep`.
- [x] Use a public dashboard route for dashboard readiness.
- [x] Add a dedicated browser E2E config for the Clerk-authenticated core flow.
- [x] Run dashboard browser E2E against `next build` + `next start` instead of `next dev`.
- [x] Remove build-time remote font fetches from dashboard E2E builds.
- [x] Clean the dashboard `.next-e2e` output before each E2E build.

### Auth

- [x] Add `@clerk/testing`.
- [x] Add a Clerk setup project for browser E2E.
- [x] Implement Clerk sign-in and active organization selection in the browser E2E.
- [x] Validate required Clerk E2E env and fail clearly when missing.
- [x] Keep the server-side auth bypass narrow and guarded by `NODE_ENV=test && E2E_AUTH_BYPASS=true`.
- [x] Add a request-level smoke test proving the dashboard can load with the bypass and no Clerk browser session.

### Outbound Recording

- [x] Add test-only outbound recording gated by `NODE_ENV=test && E2E_OUTBOUND_MODE=record`.
- [x] Record intended email, Instagram DM, SMS/WhatsApp, and agent reply sends.
- [x] Add helpers to inspect recorded outbound calls from E2E.
- [x] Keep production code paths using real providers by default.
- [x] Add a guarded deterministic E2E AI mode so browser E2E does not call real Anthropic.

### Core Browser Flow Implementation

- [x] Add stable `data-testid` hooks for tickets list, ticket rows, chat messages, composer textarea, and send button.
- [x] Add DB helpers for the manual inbound-email-to-reply flow.
- [x] Add outbound-record helpers for browser E2E assertions.
- [x] Replace the skipped/commented core browser spec with a real implementation.

### Existing E2E Coverage

- [x] Email inbound creates customer/thread/message.
- [x] Instagram webhook accepts a valid HMAC request and returns `EVENT_RECEIVED`.
- [x] Request-level dashboard auth-bypass smoke test passes.

## Remaining Work

### Priority 1: Runtime-Prove The Core Browser E2E

- [x] Create or choose a real Clerk development-instance test organization.
- [x] Create or choose a Clerk test user and add that user to the test organization.
- [x] Configure local env with the required Clerk browser E2E values.
- [x] Run `npm run test:e2e:browser`.
- [x] Verify Clerk testing token setup succeeds.
- [x] Verify `clerk.signIn()` succeeds.
- [x] Verify active organization selection succeeds.
- [x] Verify the Clerk organization maps to the seeded DB organization.
- [x] Verify the inbound email POST succeeds.
- [x] Verify the worker creates `Customer`, `Thread`, and customer `Message`.
- [x] Verify `/dashboard/tickets` opens in the authenticated browser session.
- [x] Verify the ticket appears and opens.
- [x] Verify the customer message and composer render.
- [x] Verify a manual reply can be sent.
- [x] Verify outbound recording captures the email send.
- [x] Verify the agent message is persisted in DB and visible in the UI.
- [x] Once passing locally, run through `npm run test:e2e`.
- [x] Add `CLERK_E2E_EMAIL` and a real non-placeholder `E2E_CLERK_ORG_ID` to env visible to Playwright in this workspace.
- [x] Configure CI env with the required Clerk browser E2E values.

Expected failure order to debug:

1. Clerk setup/sign-in.
2. Active organization selection.
3. DB org mapping.
4. Inbound email processing.
5. Dashboard rendering/selectors.
6. Manual reply/outbound recording.

### Priority 2: Strengthen Webhook Coverage

- [ ] Add Shopify webhook HMAC success coverage.
- [ ] Add invalid signature coverage for Meta.
- [ ] Add invalid signature coverage for Shopify.
- [ ] Add duplicate email inbound idempotency coverage.
- [ ] Add duplicate Meta inbound idempotency coverage.
- [ ] Add unknown integration coverage that returns safely and creates no thread.
- [ ] Tighten the Instagram test so it proves queue enqueue or downstream processing, not just `EVENT_RECEIVED`.

### Priority 3: Add AI Plan Approval E2E

- [ ] Seed a deterministic email thread with a customer message.
- [x] Avoid real Anthropic calls by seeding `Thread.cachedPlan` or adding a tightly guarded deterministic E2E AI mode.
- [ ] Open the ticket in a Clerk-authenticated browser session.
- [ ] Assert the action plan card renders.
- [ ] Approve the plan.
- [ ] Assert approved tool calls execute through outbound recording.
- [ ] Assert action/audit state is persisted.

### Priority 4: Add Safety Regression E2Es

- [ ] Cross-org isolation: Org A cannot access Org B thread API.
- [ ] Cross-org isolation: Org A cannot access Org B thread UI.
- [ ] Unsupported channel dispatch returns an error.
- [ ] Unsupported channel dispatch does not persist a fake sent message.
- [ ] Filtered spam email does not auto-plan.
- [ ] Filtered spam email does not notify/send outbound messages.
- [ ] High-cost agent endpoint rate limiting behaves as expected.

### Priority 5: CI Launch Gate

- [x] Start Docker test services before integration/E2E tests.
- [x] Configure Clerk E2E values as CI secrets.
- [ ] Run `npm run lint`.
- [ ] Run `npm run test:unit`.
- [ ] Run `npm run test:integration`.
- [ ] Run `npm run test:e2e`.
- [ ] Upload Playwright traces/screenshots on failure.
- [ ] Keep fake Postmark, Twilio, Meta, Anthropic, Shopify, and Stripe provider credentials in CI.
- [ ] Rely on outbound recording for provider assertions.
- [ ] Fail clearly if Postgres, Redis, Clerk credentials, or browser binaries are missing.

## Launch Gate

Do not call E2E launch-ready until CI proves:

- `npm run lint` passes.
- `npm run test:unit` passes.
- `npm run test:integration` passes.
- `npm run test:e2e` passes.
- The core browser E2E proves a complete inbound-email-to-manual-reply workflow.
- Provider sends are asserted through outbound recording, not real provider calls.
