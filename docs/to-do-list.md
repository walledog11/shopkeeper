# Production Readiness To-Do List

This list comes from the production-readiness audit of the current dashboard,
gateway, Prisma, auth, DB, and agent/gateway integration setup.

Last reviewed: 2026-06-09.

## Pre-Release Priority (open items)

Do these before treating production as ready:

1. **Confirm production alerting is live** — ops-alert code is done; finish Better Stack Level 1 sign-off (see [error-tracking-plan.md](production/error-tracking-plan.md), [runbook.md](production/runbook.md), [alerting-evidence.md](production/alerting-evidence.md)):
   - Better Stack team + escalation policy for launch owner
   - Vercel and Railway log drains → Better Stack Logs
   - Keyword alert rules for all four categories (`queue_health`, `webhook_signature`, `provider_send`, `agent_failure`)
   - Three uptime keyword monitors (dashboard `/api/health`, gateway `/health/deep`, gateway `/health/queues`)
   - One controlled alert per category; record evidence in `alerting-evidence.md`
   - Verify `OPS_ALERTS_ENABLED=false` silences threshold alerts on dashboard and gateway
   - Deploy with default thresholds; tune only after observing real traffic
2. **Review Redis lock fail-open for mutating agent runs** — decide fail-closed vs fail-open for high-risk mutations.

Lower urgency (still valid): CSP enforcement, dependency audit triage, documentation cleanup.

## Release Blockers

- [X] Prevent approved agent-plan replay on `POST /api/agent`.
  - Clear or atomically consume `Thread.cachedPlan` after successful or failed execution, matching the `executeCurrentCachedHomePlan` behavior.
  - Add a regression test that a second identical approval request cannot re-run the same plan.
  - Consider provider-level/local idempotency keys for high-risk mutations such as refunds, cancellations, order creation, and outbound replies.

- [X] Add server-side role authorization to team management.
  - Require an org admin or explicit Clerk permission before creating invitations, revoking invitations, or removing members.
  - Prevent non-admin users from inviting `org:admin` members.
  - Hide or disable write controls in `/dashboard/team` for non-admins, but do not rely on UI checks.
  - Add route tests for member vs admin behavior on `GET`, `POST`, and `DELETE /api/team`.

- [X] Stop OAuth and provider token leakage in logs.
  - Remove full `pagesData` logging from the Instagram OAuth callback.
  - Avoid logging raw `tokenData` payloads for Instagram, Shopify, Gmail, and Outlook token exchanges.
  - Extend Pino redaction paths to include snake_case keys such as `access_token`, `refresh_token`, `id_token`, `client_secret`, and nested wildcard forms.
  - Add redaction tests that prove snake_case provider token fields are censored.

- [X] Fix Prisma production env contract drift.
  - Production deploys require `DIRECT_DATABASE_URL` (Prisma `directUrl` for migrations; both apps need it because the schema declares it).
  - Added to production env validation (`scripts/check-production-env.mjs`), dashboard/gateway runtime boot checks, example env files, and deployment/runbook migration commands.
  - Re-run root-level `npx prisma validate --schema=packages/db/prisma/schema.prisma`.

- [X] Make the integration suite green.
  - Gateway worker/maintenance tests cover the `order-review` queue and worker.
  - Verified 2026-06-07: `npm run test:integration` passes (648 tests across dashboard + gateway).

## Security And Data Hardening

- [X] Scope inbound message idempotency by tenant.
  - Added `organizationId` to `Message` with a partial unique index on `(organization_id, external_message_id)`.
  - Gateway duplicate checks and `createMessage` now scope inbound idempotency per org.

- [X] Require Postmark inbound Basic Auth in production.
  - Production rejects inbound email when `POSTMARK_INBOUND_USERNAME` or `POSTMARK_INBOUND_PASSWORD` is missing.
  - Gateway boot validation and production env contract require both vars at launch.

- [X] Revisit public attachment storage.
  - Inbound email attachments now upload to Vercel Blob with `access: "private"` and are stored as `blob:{pathname}` refs in `apps/gateway/src/storage/blob.ts`.
  - Dashboard serves attachments through authenticated `GET /api/attachments?ref=...`, scoped to `attachments/{organizationId}/...`.
  - Legacy public blob URLs still work via a public-read fallback while older messages remain in the database.

- [ ] Harden Content Security Policy.
  - Dashboard still sends `Content-Security-Policy-Report-Only` with `unsafe-inline` and `unsafe-eval` in `apps/dashboard/next.config.js`.
  - Move toward enforcement after reviewing report-only violations.
  - Reduce or justify `unsafe-inline` and `unsafe-eval`.
  - Keep Clerk and Cloudflare challenge requirements documented.

- [ ] Review Redis lock fail-open behavior for mutating agent runs. **(pre-release priority)**
  - `acquireThreadLock` in `apps/dashboard/src/lib/server/agent-lock.ts` proceeds with a no-op lock if Redis is unavailable.
  - Decide whether mutating agent execution should fail closed while lower-risk paths can fail open.
  - Risk: duplicate refunds, cancellations, or outbound replies during a Redis outage.

## Observability And Operations

- [ ] Triage dependency audit findings.
  - Verified 2026-06-07: `npm audit --audit-level=high` reports no high/critical issues; moderate findings remain in dev tooling deps.
  - Prioritize framework/runtime dependencies and document accepted risk for dev-only/tooling findings.

- [ ] Confirm production alerting is live, not just implemented. **(pre-release priority)**
  - Ops-alert instrumentation is complete ([operational-guardrails.md](production/operational-guardrails.md) Phases 0–4). Remaining work is Phase 5 / Better Stack Level 1:
    - [ ] Better Stack team + escalation policy
    - [ ] Vercel log drain → Better Stack (dashboard)
    - [ ] Railway log drain → Better Stack (gateway)
    - [ ] Log alert rules: `opsAlert` + each of the four `category` values
    - [ ] Uptime monitors for dashboard health, gateway deep health, gateway queue health
    - [ ] Controlled alert validation per category (`npm run verify:production:alerts` or runbook steps)
    - [ ] Kill switch: `OPS_ALERTS_ENABLED=false` on dashboard and gateway
    - [ ] Sign-off recorded in [alerting-evidence.md](production/alerting-evidence.md)
  - Procedure: [runbook.md](production/runbook.md) (External Monitors, Ops Alert Log Routing, Controlled Alert Validation).

## Billing Enforcement

Shared write-gate for `past_due` and `canceled` orgs is implemented in `apps/dashboard/src/lib/billing/write-gate.ts` and `apps/gateway/src/billing/write-gate.ts`.

- [ ] Finish the billing write-gate route sweep.
  - Already gated: outbound messaging, internal outbound messaging, auto-ack, agent plan/execution/chat/quick-approve/voice, and org settings writes.
  - Still need review: integrations connect/disconnect, thread mutations, KB and canned-response writes, `POST /api/agent/ask`, Shopify customer mutations, and other dashboard `POST`/`PATCH`/`DELETE` routes that create outbound or state-changing work.
- [ ] Add a dashboard banner for `canceled` billing state.
  - `past_due` already surfaces in `apps/dashboard/src/app/dashboard/layout.tsx`; `canceled` does not.
- [ ] Broaden billing gate route tests after the sweep.
  - Covered today: blocked writes on `/api/messages` and read-vs-write behavior on `/api/org`.
  - Add regression tests for each newly gated route.

## Onboarding Polish

- [ ] Refocus first-run flow around v1: connect Shopify, configure email forwarding, see first agent reply.
  - Onboarding still presents Gmail/Outlook OAuth as the primary email path instead of forwarding-first setup.
- [ ] De-emphasize post-launch channels during onboarding.
  - Instagram DM is still a first-class channel card in `apps/dashboard/src/app/(onboarding)/onboarding/_components/step-channels.tsx`.
- [ ] Add a lightweight completion/progress state.
  - Local step index is persisted in `concierge-onboarding-v1` localStorage; still need a clearer v1 completion signal tied to Shopify + forwarding + first reply.

## Documentation Cleanup

- [ ] Fix stale production checklist references.
  - README, `docs/production/deployment.md`, `docs/production/runbook.md`, and `docs/telegram-operator-channel.md` reference `docs/production/checklist.md`, but that file is missing.
  - Either recreate the checklist or update references to point at `docs/production/runbook.md` and this list.
  - Validate any recreated or replacement checklist against code and docs before launch.
  - Confirm remaining unchecked production items are truly external or intentionally deferred.

- [ ] Fix stale env file references.
  - `docs/production/runbook.md` links to `apps/dashboard/src/lib/env.ts`, but the current file is `apps/dashboard/src/lib/env/index.ts`.

- [ ] Document the final production migration workflow.
  - Partially covered in `docs/production/deployment.md` (pooled `DATABASE_URL` vs direct `DIRECT_DATABASE_URL` for `npm run db:migrate:deploy`).
  - Still needed: one consolidated section with exact env vars for Vercel, Railway, local migration runs, and CI.

- [ ] Add a short release-gate checklist.
  - Root `npm run verify:pr` already runs lint, unit tests, integration tests, e2e smoke, coverage, and build.
  - Document the official pre-release command sequence, including `npx prisma validate`, `npm run verify:production:env`, and `npm run test:integration`.
  - Record known sandbox-only caveats, such as Next/Turbopack needing permission to bind an internal worker port during build.

## Customer Memory Removal

Remove the customer memory feature end-to-end. Ticket view should have **one summary** — the per-ticket `aiSummary` in the main conversation column. The context sidebar keeps customer identity, Shopify data, and recent tickets only.

Two concepts exist today:

| | Thread summary | Customer memory |
|---|---|---|
| Field | `threads.aiSummary` | `customers.memory` |
| Scope | This ticket | Cross-ticket |
| User-visible | Yes (main column) | Yes (sidebar, editable) |
| Auto-generated | Yes | Yes (on close + daily refresh) |
| Manual edit | No | Yes (PATCH API) |

### PR 1 — Remove UI and dashboard API (user-facing)

- [X] Delete `CustomerMemoryPanel.tsx`
- [X] Delete `GET` + `PATCH` at `apps/dashboard/src/app/api/customers/[id]/memory/route.ts` (+ its test)
- [X] Delete memory validation in `apps/dashboard/src/app/api/customers/_lib/validation.ts`
- [X] Remove `<CustomerMemoryPanel />` from `ContextPanel.tsx`

**Result:** Sidebar no longer shows "WHAT WE KNOW." Only thread summary remains in the main column.

### PR 2 — Stop triggering memory updates

- [X] Delete `apps/dashboard/src/lib/server/customer-memory.ts` (+ test)
- [X] Remove enqueue calls from `threads/[id]/route.ts`, `threads/bulk/route.ts`, `lib/agent/tools/thread.ts`, and `gateway/message-handlers/agent-thread-sink.ts`
- [X] Delete `apps/gateway/src/routes/internal-customer-memory.ts` (+ test) and unregister from `apps/gateway/src/index.ts`

**Result:** Closing tickets no longer fires memory jobs.

### PR 3 — Remove gateway workers and agent integration

- [X] Delete gateway maintenance module: `customer-memory.ts`, `customer-memory-summarizer.ts` (+ tests)
- [X] Remove `registerCustomerMemoryMaintenanceJob` from `maintenance/workers.ts`
- [X] Remove `QUEUE.CUSTOMER_MEMORY*`, `JOB.UPDATE_CUSTOMER_MEMORY*`, `MODEL.CUSTOMER_MEMORY` from gateway constants
- [X] Remove `customerMemory` from agent runtime: `agent-context.ts`, `context.ts`, `prompt.ts`, `order-ops/context.ts`
- [X] Update agent and dashboard agent tests/evals that stub `customerMemory`

**Result:** No LLM spend on background customer summarization. Agent relies on `thread.aiSummary`, messages, Shopify orders, KB, and open thread count.

### PR 4 — Database cleanup

- [X] Delete `packages/db/customer-memory.ts` and exports from `packages/db/index.ts`
- [X] Prisma migration: drop `customers.memory`, `customers.memoryUpdatedAt`, and the `(organizationId, memoryUpdatedAt)` index
- [ ] Drain/clear BullMQ queues `customer-memory` and `customer-memory-refresh` in Redis (one-time ops step after deploy)
  - Remove repeatable job `customer-memory-stale-refresh-daily` from queue `customer-memory-refresh`
  - Obliterate both queues so no stale jobs remain

**Deploy order:** PR 3 before PR 4 (code must not reference columns before migration).

### Optional follow-up (not blocking)

If agent quality regresses after removal, add a read-only substitute at context build time: fetch last 3 closed threads for the customer and inject their `aiSummary` + `tag` into the prompt. No new queues, no editable UI, no LLM maintenance jobs.

### Verification checklist

- [ ] Open a ticket — sidebar has no "WHAT WE KNOW"; main column still shows thread summary
- [ ] Resolve a ticket — no calls to `/internal/customer-memory/*`; no jobs in `customer-memory` queue
- [ ] Run agent on a returning customer — prompt has no `## What you know about this customer` section
- [ ] Test suite: `packages/agent`, `apps/gateway`, `apps/dashboard` (especially thread close/resolution paths)
- [ ] E2E: `core-agent-flow.spec.ts` still passes
- [ ] Redis: stale repeatable job `customer-memory-stale-refresh-daily` removed
