# E2E Remediation Plan

This plan covers the work needed to make the end-to-end test suite reliable enough to support a production launch decision.

## Current State

- The main browser E2E in `e2e/core-agent-flow.spec.ts` is skipped and mostly commented out.
- The existing webhook E2E covers part of inbound ingestion, but not the full merchant workflow.
- Integration and E2E tests depend on local Postgres and Redis being available before Playwright starts.
- Server-side provider calls, such as Postmark, Twilio, Meta, Anthropic, and Shopify, are not cleanly intercepted by browser-level `page.route()`.
- Clerk auth is not fully wired for E2E.

## Goals

- Prove the core product flow in CI:
  inbound message -> worker processing -> dashboard ticket visible -> reply or approved plan -> outbound provider call recorded -> DB state persisted.
- Keep E2E deterministic without real provider credentials.
- Make failures actionable with Playwright traces and clear setup errors.
- Avoid test-only behavior in production by guarding any bypasses with `NODE_ENV=test` and explicit E2E env flags.

## Plan

### 1. Stabilize Test Infrastructure

- [x] Update `docker-compose.test.yml` to avoid common local port conflicts by mapping Postgres and Redis to non-default host ports: `55432:5432` and `56379:6379`.
- [x] Update `scripts/with-test-env.mjs` defaults to match the test service ports.
- [x] Add a Playwright `globalSetup` that:
  - builds `packages/db`
  - waits for Postgres and Redis
  - runs `prisma migrate deploy`
  - seeds the E2E organization/test data
- [x] Make test data cleanup deterministic by truncating app tables.
- [x] Keep `npm run test:e2e` as the supported entrypoint.
- [x] Split auth modes so request-level smoke tests can run with the guarded bypass while browser E2E runs through Clerk's supported test auth path.

### 2. Correct Playwright Server Startup

- [x] Update `playwright.config.ts` with global setup so DB/Redis preparation completes before tests execute.
- [x] Increase web server startup timeouts to tolerate cold Next.js and gateway starts.
- [x] Pass explicit test env to both web servers:
  - `DATABASE_URL`
  - `REDIS_URL`
  - `INTERNAL_API_SECRET`
  - fake provider keys
  - `E2E_OUTBOUND_MODE=record`
- [x] Use dedicated E2E ports (`3100` dashboard, `8180` gateway) and disable Playwright server reuse so local dev servers cannot contaminate E2E.
- [x] Start the gateway with an E2E-only server + worker command and no ngrok tunnel.
- [x] Wait for `/health/deep` so Playwright does not start tests until DB, Redis, queue diagnostics, and worker heartbeat are healthy.
- [x] Add a dedicated browser E2E Playwright config for the Clerk-authenticated core flow.

### 3. Solve Clerk Auth

Preferred path:

- [x] Install and configure `@clerk/testing`.
- Use a real Clerk test user and test organization.
- Require these env vars in E2E:
  - `CLERK_E2E_EMAIL`
  - `E2E_CLERK_ORG_ID`
  - test Clerk keys
- Sign in, select the test org, and ensure the Clerk org maps to the seeded DB organization.

Fallback path:

- [x] Add an explicit auth bypass guarded by `NODE_ENV=test && E2E_AUTH_BYPASS=true`.
- [x] Keep the bypass narrow and unavailable in production builds.
- [x] Add an E2E smoke test proving the dashboard can load with the bypass and no Clerk browser session.

### 4. Add Test-Only Outbound Recording

- [x] Do not rely on `page.route()` for server-side provider calls.
- [x] Add a test-only outbound recording layer used only when `NODE_ENV=test && E2E_OUTBOUND_MODE=record`.
- [x] Record intended sends for:
  - email
  - Instagram DM
  - SMS/WhatsApp
  - agent replies
- [x] Expose a test-only way to inspect recorded outbound calls.
- [x] Ensure production code paths still call real providers by default.

### 5. Replace The Skipped Core E2E

Replace `e2e/core-agent-flow.spec.ts` with a real browser test:

- [x] Add stable `data-testid` selectors for the ticket list, ticket rows, chat messages, composer textarea, and send button.
- [x] Add E2E DB and outbound-record helpers for the manual inbound-email-to-reply flow.
- [x] Install and configure `@clerk/testing` for the core browser flow.
- [x] Replace the skipped placeholder in `e2e/core-agent-flow.spec.ts` with a real Clerk-authenticated browser test implementation.

Runtime proof still required:

- [ ] Verify `e2e/core-agent-flow.spec.ts` passes in a browser-capable local or CI environment.
- [ ] Seed/verify the real Clerk test user and organization.
- [x] Seed the matching DB organization and email integration.
- [ ] Sign in through Clerk testing.
- [ ] POST inbound email to `${GATEWAY_INTERNAL_URL}/webhooks/email/inbound`.
- [ ] Wait for the worker to create `Customer`, `Thread`, and `Message`.
- [ ] Open `/dashboard/tickets`.
- [ ] Assert the ticket appears.
- [ ] Open the ticket.
- [ ] Assert customer message and composer render.
- [ ] Send a manual reply.
- [ ] Assert outbound recording captured the email send.
- [ ] Assert the agent message is persisted in DB and visible in the UI.

Verification note: a browser-flow implementation that relied on the server-side E2E auth bypass was removed because it was the wrong abstraction. The bypass is acceptable for request-level smoke tests, but the full browser flow now uses Clerk's supported testing package so dashboard client components run under real Clerk context.

Current command split:

- `npm run test:e2e:smoke`: request-level gateway/dashboard smoke tests with `E2E_AUTH_BYPASS=true`.
- `npm run test:e2e:browser`: real browser flow with `@clerk/testing` and `E2E_AUTH_BYPASS=false`.
- `npm run test:e2e`: runs smoke first, then browser. This should be the CI launch gate once Clerk E2E credentials are configured.

Required browser E2E env:

- `CLERK_SECRET_KEY`
- `CLERK_PUBLISHABLE_KEY` or `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_E2E_EMAIL`
- `E2E_CLERK_ORG_ID`

The Clerk user identified by `CLERK_E2E_EMAIL` must already belong to the Clerk organization identified by `E2E_CLERK_ORG_ID`. The DB seed uses that same `E2E_CLERK_ORG_ID` as `Organization.clerkOrgId`.

### 6. Add AI Plan Approval E2E

- Seed or deterministically generate a thread with a customer message.
- Avoid real Anthropic calls in E2E by using deterministic test-mode AI behavior.
- Generate or seed `Thread.cachedPlan`.
- Open the ticket in the dashboard.
- Assert the action plan card appears.
- Approve the plan.
- Assert approved tool calls execute.
- Assert outbound recording captured the customer reply.
- Assert action/audit notes are persisted.

### 7. Strengthen Webhook E2E Coverage

Extend `e2e/webhook-ingest.spec.ts` to cover:

- [x] Email inbound creates customer/thread/message.
- [x] Instagram webhook verifies HMAC and enqueues.
- [ ] Shopify webhook verifies HMAC and enqueues.
- [ ] Duplicate inbound message does not create a duplicate message.
- [ ] Invalid signatures return 401/403.
- [ ] Unknown integrations return 200 and create no thread.

### 8. Add Safety Regression E2Es

Minimum safety tests:

- Cross-org isolation: a user from Org A cannot access Org B thread API/UI.
- Unsupported channel dispatch returns an error and does not persist a fake sent message.
- Filtered spam email does not auto-plan or notify.
- High-cost agent endpoint rate limiting behaves as expected.

### 9. CI Requirements

The CI launch gate should run:

```bash
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e
```

CI should:

- Start Docker test services before integration/E2E tests.
- Upload Playwright traces and screenshots on failure.
- Avoid real Postmark, Twilio, Meta, Anthropic, Shopify, or Stripe credentials.
- Fail clearly if Postgres, Redis, Clerk test credentials, or browser binaries are missing.

## Priority Order

1. [x] Infrastructure/global setup and DB/Redis reliability.
2. [x] Auth strategy.
3. [x] Test-only outbound provider recording.
4. [ ] Manual inbound-email-to-reply E2E.
5. [ ] AI plan approval E2E.
6. [ ] Webhook/signature/idempotency E2Es.
7. [ ] Cross-org and safety regressions.

## Launch Gate

Do not treat E2E as launch-ready until CI proves at least one complete support flow:

```text
provider webhook -> gateway queue -> worker -> dashboard ticket -> merchant action -> outbound send recorded -> DB persisted
```
