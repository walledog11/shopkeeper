# Production Readiness To-Do List

This list comes from the production-readiness audit of the current dashboard,
gateway, Prisma, auth, DB, and agent/gateway integration setup.

Last reviewed: 2026-06-10.

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

Lower urgency (still valid): CSP enforcement.

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

- [X] Fail closed on Redis lock unavailability for mutating agent runs.
  - `executeAgentTurn` passes `failClosed: true` for all mutating turns (`auditMode !== "read_only"`); read-only paths still fail open.
  - `createRedisLockProvider` throws `ServiceUnavailableError` (503) when Redis is unavailable, times out, or errors under fail-closed acquire; lock contention still returns 409 Conflict.
  - Dashboard (Upstash) and gateway (ioredis) lock providers unchanged at the host layer; composer ask (`POST /api/agent/ask`) bypasses `executeAgentTurn` and is unaffected.
  - Tests: `packages/agent/src/lock/redis-lock.test.ts`, `packages/agent/src/turn.test.ts`, `apps/dashboard/src/lib/server/agent-lock.test.ts`, `apps/gateway/src/message-handlers/execute-operator-agent-turn.smoke.test.ts`.

## Observability And Operations

- [X] Triage dependency audit findings.
  - Cleanup audit resolved the moderate findings by upgrading `@anthropic-ai/sdk` to `0.104.1` and adding a narrow root override for Next's `postcss` dependency.
  - Verified 2026-06-14: `npm audit --audit-level=moderate` reports zero vulnerabilities.
  - Remove the Next/PostCSS override once a compatible stable Next release includes the patched dependency.

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

- [X] Fix stale production checklist references.
  - Recreated `docs/production/checklist.md` as the concise release gate.
  - Kept README, deployment, and runbook links pointed at the restored checklist.
  - Updated the Telegram operator-channel note so it no longer references a removed checklist section.
  - Remaining unchecked production items stay tracked separately and should be explicitly deferred by the launch owner before release.

- [X] Fix stale env file references.
  - `docs/production/runbook.md` now links to `apps/dashboard/src/lib/env/index.ts`.

- [ ] Document the final production migration workflow.
  - Partially covered in `docs/production/deployment.md` (pooled `DATABASE_URL` vs direct `DIRECT_DATABASE_URL` for `npm run db:migrate:deploy`).
  - Still needed: one consolidated section with exact env vars for Vercel, Railway, local migration runs, and CI.

- [X] Add a short release-gate checklist.
  - Root `npm run verify:pr` already runs lint, unit tests, integration tests, e2e smoke, coverage, and build.
  - `docs/production/checklist.md` documents the official pre-release command sequence, including `npx prisma validate`, `npm run verify:production:env`, `npm run test:integration`, and `npm run verify:pr`.
  - The checklist records the known sandbox-only Next/Turbopack worker-port caveat.

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
- [X] Drain/clear BullMQ queues `customer-memory` and `customer-memory-refresh` in Redis (one-time ops step after deploy)
  - Script: `cd apps/gateway && npm run drain-legacy-customer-memory-queues` (dry-run) then `-- --execute`
  - Removes repeatable job `customer-memory-stale-refresh-daily` / `refresh-stale-customer-memory` and obliterates both queues
  - Local dev Redis drained 2026-06-10; run the same script against production Redis after deploy

**Deploy order:** PR 3 before PR 4 (code must not reference columns before migration).

### Optional follow-up (not blocking)

If agent quality regresses after removal, add a read-only substitute at context build time: fetch last 3 closed threads for the customer and inject their `aiSummary` + `tag` into the prompt. No new queues, no editable UI, no LLM maintenance jobs.

### Verification checklist

- [X] Open a ticket — sidebar has no "WHAT WE KNOW"; main column still shows thread summary (`ContextPanel.tsx` has no memory panel)
- [X] Resolve a ticket — no calls to `/internal/customer-memory/*`; no jobs in `customer-memory` queue (code removed; thread PATCH tests pass)
- [X] Run agent on a returning customer — prompt has no `## What you know about this customer` section (`packages/agent/src/prompting.test.ts`)
- [X] Test suite: `packages/agent` (189), `apps/gateway` (298), dashboard thread routes (13) — all passed 2026-06-10
- [ ] E2E: `core-agent-flow.spec.ts` still passes
- [X] Redis: stale repeatable job `customer-memory-stale-refresh-daily` removed (local dev; production pending same script)
