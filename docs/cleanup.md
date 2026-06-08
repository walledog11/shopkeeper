# Gateway Cleanup Plan

## Overview (2026-06-07)

This plan replaces the completed cleanup tracker. It covers issues found in the gateway code audit (`apps/gateway/src`, ~6,200 LOC). The core inbound → classify → summarize → plan → notify pipeline is sound; the slop is mostly migration debt, copy-pasted helpers, partially built infrastructure, and Redis connection sprawl.

Audit baseline:

- Core worker bootstrap, env validation, webhook auth, and idempotency are in good shape.
- No critical production bugs identified.
- Main pain points: stale WhatsApp naming, layer violations, duplicate helpers, half-wired ops alerts, and connection proliferation.

Do not revert or rewrite unrelated user-owned work in the worktree.

## Phase 0: Keep The Cleanup Verifiable

Use this phase as the verification contract for every later phase.

- [ ] Keep cleanup changes scoped by phase — one PR per phase where practical.
- [ ] Run `npm run lint -w apps/gateway` after each cleanup batch.
- [ ] Run targeted gateway integration tests for every changed module and failure path.
- [ ] Run `npm run build -w apps/gateway` after shared config, Redis, or worker orchestration changes.
- [ ] Run `npm run lint` and `npm run test:node` after cross-package contract changes.
- [ ] Do not modify unrelated user-owned work.

Suggested per-phase verification:

```bash
npm run lint -w apps/gateway
npm run build -w apps/gateway
npm run test:integration -w apps/gateway -- <changed-test-files>
```

For Redis, worker bootstrap, or inbound path changes, also run:

```bash
npm run test:integration -w apps/gateway -- src/worker.test.ts src/workers/core.test.ts
```

---

## Phase 1: Quick Wins — Dedupe, Dead Code, and Config Consistency

Low-risk changes that reduce confusion without touching architecture.

### 1.1 Centralize internal API secret access

**Problem:** `getInternalApiSecret()` lives in `message-handlers/shared.ts`. Telegram routes read `process.env.INTERNAL_API_SECRET ?? ''`, bypassing rotation support via `INTERNAL_API_SECRET_PREV`.

**Files:**

- `apps/gateway/src/message-handlers/shared.ts`
- `apps/gateway/src/config/env.ts`
- `apps/gateway/src/routes/internal-auth.ts`
- `apps/gateway/src/routes/telegram/agent-execution.ts`
- `apps/gateway/src/routes/telegram/digest-commands.ts`
- `apps/gateway/src/routes/telegram/pending-plan-commands.ts`
- `apps/gateway/src/message-handlers/agent-thread-sink.ts`
- `apps/gateway/src/message-handlers/planning-dashboard-client.ts`

**Tasks:**

- [ ] Move `getInternalApiSecret()` to `config/env.ts` (alongside `validateGatewayEnv`).
- [ ] Update all callers to import from `config/env.ts`.
- [ ] Replace `process.env.INTERNAL_API_SECRET ?? ''` in Telegram routes with `getInternalApiSecret()`.
- [ ] Add a test that secret rotation (`INTERNAL_API_SECRET_PREV`) is honored by `authorizeInternalRequest`.

### 1.2 Extract duplicated crypto and typing helpers

**Problem:** `safeEqual` is copy-pasted in two route files. `isRecord` / JSON guards are duplicated across three modules.

**Files:**

- `apps/gateway/src/routes/webhooks-email.ts`
- `apps/gateway/src/routes/internal-auth.ts`
- `apps/gateway/src/operator-context.ts`
- `apps/gateway/src/maintenance/queue-health.ts`
- `apps/gateway/src/maintenance/voice-synthesis.ts`

**Tasks:**

- [ ] Add `apps/gateway/src/lib/crypto.ts` with `safeEqual(a, b)`.
- [ ] Add `apps/gateway/src/lib/typing.ts` with `isRecord`, `readString`, and other shared guards.
- [ ] Replace local copies in the files above.
- [ ] Add focused unit tests for the extracted helpers.

### 1.3 Canonical channel label formatting

**Problem:** Identical `channelType === CHANNEL.IG_DM ? 'Instagram DM' : capitalize` logic appears in three places.

**Files:**

- `apps/gateway/src/message-handlers/planning-notifications.ts`
- `apps/gateway/src/routes/internal-operator.ts`
- `apps/gateway/src/routes/telegram/format.ts` (preferred home)

**Tasks:**

- [ ] Add `formatChannelLabel(channelType: DbChannelType): string` to `routes/telegram/format.ts` or a shared format module.
- [ ] Replace duplicated label logic in planning notifications and operator escalation.
- [ ] Add a small unit test for each channel type.

### 1.4 Remove dead constants and shims

**Problem:** Unused exports and a 6-line re-export shim add noise.

**Files:**

- `apps/gateway/src/constants.ts`
- `apps/gateway/src/message-handlers/business-hours.ts`
- `apps/gateway/src/workers/ai-summary.ts`
- `apps/gateway/src/routes/webhooks-signature-alerts.ts`
- `apps/gateway/src/maintenance/workers.ts`

**Tasks:**

- [ ] Remove `CHANNEL.SMS` if still unused (only referenced in a comment).
- [ ] Remove `SHOPIFY_API_VERSION` if still unused.
- [ ] Remove unused `validation_failed` variant from webhook signature alerts if confirmed dead.
- [ ] Delete `business-hours.ts` shim; import directly from `@shopkeeper/agent/settings` in `ai-summary.ts`.
- [ ] Remove or document unused exports `closeMaintenanceWorkers` / `closeMaintenanceQueues` if production shutdown uses `workers/resources.ts` exclusively.

### 1.5 Fix boolean env parsing for order risk monitor

**Problem:** `ORDER_RISK_MONITOR_ENABLED` uses raw truthiness — any non-empty string (including `"false"`) enables the feature.

**Files:**

- `apps/gateway/src/config/runtime-config.ts`
- `apps/gateway/src/workers/order-review.ts`
- `apps/gateway/src/maintenance/order-risk-monitor.ts`
- `apps/gateway/src/routes/webhooks-shopify.ts`

**Tasks:**

- [ ] Add `isOrderRiskMonitorEnabled()` in `runtime-config.ts` using existing `parseBooleanEnv`.
- [ ] Replace all `process.env.ORDER_RISK_MONITOR_ENABLED` checks with the getter.
- [ ] Add a unit test for `"false"`, `"0"`, and unset values.

### 1.6 Fail loudly on unknown inbound platforms

**Problem:** `workers/inbound.ts` completes successfully when `job.data.platform` is unrecognized — misconfigured jobs vanish silently.

**Files:**

- `apps/gateway/src/workers/inbound.ts`

**Tasks:**

- [ ] Add an `else` branch that logs an error and throws (so BullMQ retry/failure semantics apply).
- [ ] Add a test case for an unknown platform value.

### 1.7 Consolidate duplicate time constants

**Problem:** `ONE_DAY_MS` / `ONE_HOUR_MS` are exported from `maintenance/registration.ts` but redefined locally in `digest.ts` and `purge.ts`.

**Files:**

- `apps/gateway/src/maintenance/registration.ts`
- `apps/gateway/src/maintenance/digest.ts`
- `apps/gateway/src/maintenance/purge.ts`

**Tasks:**

- [ ] Import shared time constants from `registration.ts` in digest and purge.
- [ ] Remove local redefinitions.

### 1.8 Remove dead digest parameter

**Problem:** `shouldSendDigest` accepts `_currentHourUtc` but never uses it.

**Files:**

- `apps/gateway/src/maintenance/digest.ts`
- `apps/gateway/src/maintenance/digest.test.ts`

**Tasks:**

- [ ] Remove the unused parameter and update callers/tests.

**Phase 1 verification:**

- [ ] `npm run lint -w apps/gateway`
- [ ] `npm run build -w apps/gateway`
- [ ] `npm run test:integration -w apps/gateway -- src/workers/core.test.ts src/maintenance/digest.test.ts src/config/runtime-config.test.ts src/routes/telegram/command-parser.test.ts`

---

## Phase 2: Rename WhatsApp Legacy Naming to Telegram

**Problem:** Operator notifications go through Telegram, but queue names, job IDs, failure labels, comments, and tests still say "WhatsApp." This misleads onboarding and runbooks.

**Files:**

- `apps/gateway/src/constants.ts`
- `apps/gateway/src/maintenance/digest.ts`
- `apps/gateway/src/maintenance/registration.ts`
- `apps/gateway/src/types.ts`
- `apps/gateway/src/workers/ai-summary.ts`
- `apps/gateway/src/message-handlers/shared.ts`
- `apps/gateway/src/worker.test.ts`
- `docs/telegram-operator-channel.md`
- `docs/production/runbook.md` (if queue names are referenced)

**Tasks:**

- [ ] Document legacy BullMQ queue names in `constants.ts` if a full rename is deferred.
- [ ] Rename `QUEUE.DIGEST`, `JOB.DIGEST`, and `JOB.DIGEST_ID` to telegram-oriented names (e.g. `operator-digest`, `send-operator-digest`, `operator-digest-hourly`).
- [ ] Update `failureQueue` label in `maintenance/digest.ts`.
- [ ] Migrate repeatable job registration: remove old repeatable jobs and register new IDs (one-time deploy step — document in runbook).
- [ ] Update comments in `types.ts`, `ai-summary.ts`, and `shared.ts`.
- [ ] Update stale "WhatsApp notification" language in `worker.test.ts`.
- [ ] Cross-check production runbook and operational guardrails for stale queue names.

**Phase 2 verification:**

- [ ] `npm run lint -w apps/gateway`
- [ ] `npm run build -w apps/gateway`
- [ ] `npm run test:integration -w apps/gateway -- src/maintenance/digest.test.ts src/worker.test.ts`
- [ ] Manual check: repeatable digest job re-registers cleanly on worker startup.

---

## Phase 3: Fix Layer Violations and Stale Scripts

**Problem:** Worker-layer code imports from HTTP routes. A maintenance script still calls a removed HTTP endpoint.

### 3.1 Move operator escalation out of routes

**Files:**

- `apps/gateway/src/routes/internal-operator.ts`
- `apps/gateway/src/message-handlers/agent-thread-sink.ts`
- `apps/gateway/src/operator-notify.ts` (or new `services/operator-escalation.ts`)

**Tasks:**

- [ ] Extract `pushOperatorEscalation` and `formatEscalationMessage` into `operator-notify.ts` or a dedicated service module.
- [ ] Keep `routes/internal-operator.ts` as a thin HTTP wrapper that delegates to the service.
- [ ] Update `agent-thread-sink.ts` to import from the service layer, not routes.
- [ ] Add or extend tests for escalation formatting and notification dispatch.

### 3.2 Rewrite or delete stale backfill script

**Files:**

- `apps/gateway/src/scripts/backfill-plans.ts`
- `apps/gateway/src/message-handlers/generate-thread-plan.ts`
- `apps/gateway/src/scripts/rebuild-bad-summaries.ts` (reference implementation)

**Tasks:**

- [ ] Rewrite `backfill-plans.ts` to call `generateThreadPlan()` in-process (mirror `rebuild-bad-summaries.ts`), **or** delete the script if no longer needed.
- [ ] Remove references to `/api/agent/plan-internal` from script header comments.
- [ ] If kept, document required env vars and usage in the script header.

**Phase 3 verification:**

- [ ] `npm run lint -w apps/gateway`
- [ ] `npm run build -w apps/gateway`
- [ ] `npm run test:integration -w apps/gateway -- src/routes/internal-operator.test.ts src/worker.test.ts`
- [ ] Confirm no production import from `routes/` in `message-handlers/` or `workers/`.

---

## Phase 4: Consolidate Redis and BullMQ Connections

**Problem:** Lazy singletons across webhooks, health, worker, agent locks, and queue diagnostics can open 7+ Redis connections per process on combined server+worker deploys.

**Files:**

- `apps/gateway/src/clients/redis-client.ts`
- `apps/gateway/src/routes/webhooks-shared.ts`
- `apps/gateway/src/index.ts`
- `apps/gateway/src/worker.ts`
- `apps/gateway/src/clients/agent-runtime.ts`
- `apps/gateway/src/health.ts`
- `apps/gateway/src/maintenance/queue-health.ts`
- `apps/gateway/src/rate-limit.ts`

**Tasks:**

- [ ] Introduce shared module-level singletons: `getGatewayRedis()`, `getGatewayBullMqProducerConnection()`, `getGatewayBullMqWorkerConnection()`.
- [ ] Refactor `webhooks-shared.ts` to reuse one BullMQ connection for `_messageQueue` and `_orderReviewQueue`; reuse the shared Redis client for rate limiting.
- [ ] Refactor `index.ts` health checks to reuse the shared Redis client.
- [ ] Refactor `agent-runtime.ts` lock Redis to reuse the shared client (or document why a separate connection is required).
- [ ] Refactor `health.ts` queue diagnostics to reuse cached Queue instances instead of creating/closing per request.
- [ ] Align worker bootstrap (`worker.ts`) with the same connection module.
- [ ] Document expected connection count per runtime role (`server`, `worker`, `all`) in a code comment or README.
- [ ] Add tests that verify singleton behavior (same instance returned on repeated calls).

**Phase 4 verification:**

- [ ] `npm run lint -w apps/gateway`
- [ ] `npm run build -w apps/gateway`
- [ ] `npm run test:integration -w apps/gateway -- src/worker.test.ts src/maintenance/queue-health.test.ts src/routes/webhooks.test.ts`
- [ ] Smoke test: `/health/deep` and webhook enqueue both work after refactor.

---

## Phase 5: Consolidate External API Clients

**Problem:** Meta Graph, dashboard internal APIs, and provider sends are accessed through parallel ad-hoc patterns.

### 5.1 Unify Meta Graph client

**Files:**

- `apps/gateway/src/clients/meta-graph.ts`
- `apps/gateway/src/message-handlers/channels.ts`

**Tasks:**

- [ ] Add `fetchInstagramUserProfile(senderId, accessToken)` to `meta-graph.ts`.
- [ ] Remove hardcoded `FB_GRAPH = 'https://graph.facebook.com/v22.0'` from `channels.ts`.
- [ ] Call the shared client from `handleIgDmJob`.
- [ ] Extend `clients/meta-graph.test.ts` for the new helper.

### 5.2 Unify dashboard internal HTTP client

**Files:**

- `apps/gateway/src/message-handlers/planning-dashboard-client.ts`
- `apps/gateway/src/routes/telegram/agent-execution.ts`
- `apps/gateway/src/routes/telegram/digest-commands.ts`
- `apps/gateway/src/routes/telegram/pending-plan-commands.ts`
- `apps/gateway/src/message-handlers/agent-thread-sink.ts`

**Tasks:**

- [ ] Extend `planning-dashboard-client.ts` into a small `dashboard-internal-client.ts` with typed helpers for:
  - `/api/agent/internal`
  - `/api/messages/internal`
  - `/api/agent/io-send-internal`
  - Any other raw `fetch` calls to dashboard internal routes
- [ ] Replace raw `fetch` + header boilerplate in Telegram routes and `agent-thread-sink.ts`.
- [ ] Centralize auth headers (`x-internal-secret`) in the client.
- [ ] Add unit tests for request construction and error handling.

**Phase 5 verification:**

- [ ] `npm run lint -w apps/gateway`
- [ ] `npm run build -w apps/gateway`
- [ ] `npm run test:integration -w apps/gateway -- src/clients/meta-graph.test.ts src/routes/webhooks-telegram.test.ts src/worker.test.ts`

---

## Phase 6: Wire or Remove Half-Built Ops Alerts

**Problem:** `ops-alerts.ts` defines `provider_send` and `agent_failure` categories with config thresholds, but only `queue_health` and `webhook_signature` are emitted in production. This overlaps with the error-tracking plan in `docs/production/error-tracking-plan.md`.

**Files:**

- `apps/gateway/src/ops-alerts.ts`
- `apps/gateway/src/config/runtime-config.ts`
- `apps/gateway/src/message-handlers/agent-thread-sink.ts`
- `apps/gateway/src/clients/telegram-client.ts`
- `apps/gateway/src/message-handlers/planning-notifications.ts`
- `docs/production/error-tracking-plan.md`

**Tasks:**

- [ ] Decide policy: wire alerts now, or remove unused categories until error tracking lands.
- [ ] If wiring:
  - [ ] Emit `provider_send` on Telegram send failures (`telegram-client.ts`, `operator-notify.ts`).
  - [ ] Emit `agent_failure` on tool dispatch failures in `agent-thread-sink.ts`.
  - [ ] Document alert thresholds in operational guardrails.
- [ ] If deferring:
  - [ ] Remove `provider_send` and `agent_failure` from `OPS_ALERT_CATEGORIES` and runtime config.
  - [ ] Remove associated tests or mark them as skipped with a link to the error-tracking plan.
- [ ] Align with `docs/production/error-tracking-plan.md` so ops alerts and future Sentry integration do not duplicate.

**Phase 6 verification:**

- [ ] `npm run lint -w apps/gateway`
- [ ] `npm run test:integration -w apps/gateway -- src/ops-alerts.test.ts src/routes/webhooks-signature-alerts.test.ts src/maintenance/queue-health.test.ts`

---

## Phase 7: Notification Failure Policy

**Problem:** Operator notification failures are swallowed — jobs complete even when operators were not notified. Failures are invisible to BullMQ retry semantics.

**Files:**

- `apps/gateway/src/message-handlers/planning-notifications.ts`
- `apps/gateway/src/message-handlers/planning.ts`
- `apps/gateway/src/operator-notify.ts`
- `apps/gateway/src/clients/telegram-client.ts`

**Tasks:**

- [ ] Document intentional vs. critical notification paths (plan alerts vs. auto-ack vs. escalation).
- [ ] For critical paths (escalation, plan approval prompts): either fail the job (retry) or emit an ops alert on failure.
- [ ] Change `telegram-client.sendMessage` to return a boolean or throw; let callers decide policy.
- [ ] Update `planning-notifications.ts` and `planning.ts` `sendAutoAck` to match the documented policy.
- [ ] Add tests for notification failure behavior.

**Phase 7 verification:**

- [ ] `npm run lint -w apps/gateway`
- [ ] `npm run test:integration -w apps/gateway -- src/worker.test.ts src/routes/webhooks-telegram.test.ts`

---

## Phase 8: Slim Down God Files and Config Sprawl

**Problem:** `queue-health.ts` (383 LOC) and `shared.ts` (316 LOC) carry type scaffolding and mixed concerns. Config reads are scattered across routes.

### 8.1 Slim `queue-health.ts`

**Files:**

- `apps/gateway/src/maintenance/queue-health.ts`
- `apps/gateway/src/lib/typing.ts` (from Phase 1)

**Tasks:**

- [ ] Move shared guards (`isRecord`, `readString`, normalizers) to `lib/typing.ts`.
- [ ] Collapse internal-only interfaces that are not part of the public contract.
- [ ] Keep exported surface: `checkGatewayQueueHealth`, registration helpers, and DI types needed for tests.
- [ ] Target ~250 LOC or less without losing test coverage.

### 8.2 Slim `message-handlers/shared.ts`

**Files:**

- `apps/gateway/src/message-handlers/shared.ts`

**Tasks:**

- [ ] After Phase 1 moves `getInternalApiSecret` out, evaluate remaining responsibilities:
  - Email classification / summarization
  - Shopify customer lookup
  - Inbound message persistence
- [ ] Split into focused modules if a natural boundary exists (e.g. `inbound-persistence.ts`, `email-classifier.ts`) without over-abstracting.
- [ ] Avoid creating one-line helper files.

### 8.3 Group scattered env reads

**Files:**

- `apps/gateway/src/config/runtime-config.ts`
- Route files reading Meta, Telegram, Postmark secrets inline

**Tasks:**

- [ ] Add grouped getters where env is read in more than one place: `getMetaWebhookConfig()`, `getTelegramConfig()`, `getPostmarkWebhookConfig()`.
- [ ] Replace ad-hoc `process.env` reads in route handlers with config getters.
- [ ] Extend `runtime-config.test.ts` for new getters.

**Phase 8 verification:**

- [ ] `npm run lint -w apps/gateway`
- [ ] `npm run build -w apps/gateway`
- [ ] `npm run test:integration -w apps/gateway -- src/maintenance/queue-health.test.ts src/worker.test.ts src/config/runtime-config.test.ts`

---

## Phase 9: Trim Migration Narration and Test Debt

**Problem:** "Track 4.2" migration comments, stale test language, and a monolithic `worker.test.ts` (826 LOC) add maintenance cost.

### 9.1 Trim stale comments

**Files:**

- `apps/gateway/src/message-handlers/generate-thread-plan.ts`
- `apps/gateway/src/message-handlers/agent-turn-deps.ts`
- `apps/gateway/src/message-handlers/agent-thread-sink.ts`
- `apps/gateway/src/routes/internal-operator.ts`
- `apps/gateway/src/clients/agent-runtime.ts`
- `apps/gateway/src/workers/order-review.ts`
- `apps/gateway/src/maintenance/order-risk-monitor.ts`
- `apps/gateway/src/routes/webhooks-shopify.ts`

**Tasks:**

- [ ] Replace long "Track 4.2" migration narration with brief "why" comments.
- [ ] Link to `docs/core-extraction-and-module-expansion-plan.md` where historical context is still useful.
- [ ] Remove references to replaced HTTP hops (`plan-internal`, dashboard sink) from inline comments.

### 9.2 Simplify Telegram command parser dead path

**Files:**

- `apps/gateway/src/routes/telegram/command-parser.ts`
- `apps/gateway/src/routes/telegram/message-handler.ts`

**Tasks:**

- [ ] Remove unused `free-form` discriminant from `parseTelegramCommand` return type, or use it explicitly in the handler.
- [ ] Add/update tests in `command-parser.test.ts`.

### 9.3 Split `worker.test.ts`

**Files:**

- `apps/gateway/src/worker.test.ts`

**Tasks:**

- [ ] Extract shared fixtures into `src/test-fixtures/` or a `worker-test-helpers.ts`.
- [ ] Split by worker concern: inbound, ai-summary, order-review.
- [ ] Add focused tests for `generateThreadPlan` auto-execute path if not covered after split.
- [ ] Add shared `makeTestOpsAlertConfig()` helper for ops-alert test files.

**Phase 9 verification:**

- [ ] `npm run lint -w apps/gateway`
- [ ] `npm run test:integration -w apps/gateway`
- [ ] Confirm total test count and coverage are unchanged or improved.

---

## Suggested PR Order

| Order | Phase | Effort | Risk |
|-------|-------|--------|------|
| 1 | Phase 1 — Quick wins | 1–2 days | Low |
| 2 | Phase 2 — WhatsApp → Telegram naming | 0.5–1 day | Medium (BullMQ job migration) |
| 3 | Phase 3 — Layer fixes and stale script | 0.5–1 day | Low |
| 4 | Phase 5 — API client consolidation | 1–2 days | Low |
| 5 | Phase 4 — Redis singleton | 2–3 days | Medium |
| 6 | Phase 6 — Ops alerts decision | 0.5–1 day | Low |
| 7 | Phase 7 — Notification failure policy | 1 day | Medium |
| 8 | Phase 8 — Slim god files and config | 1–2 days | Low |
| 9 | Phase 9 — Comments and test split | 1–2 days | Low |

Phases 4 and 5 can run in parallel if different owners; Phase 6 should align with the error-tracking plan before Sentry work begins.

---

## Out of Scope

These items were reviewed and are **not** part of this plan:

- Dashboard or agent package cleanup (covered by the previous cleanup tracker, now complete).
- New features or error-tracking implementation (see `docs/production/error-tracking-plan.md`).
- Renaming BullMQ queue names beyond the digest queue (inbound, ai-summary, etc. are correctly named).
- SMS channel support (no implementation exists; remove dead constant only).

---

## Completion Criteria

The gateway cleanup is done when:

- [ ] No worker or message-handler module imports from `routes/`.
- [ ] All dashboard internal API calls go through a shared client with centralized auth.
- [ ] Redis connection count is documented and bounded per runtime role.
- [ ] No stale WhatsApp naming in code, tests, or runbooks.
- [ ] Ops alert categories are either wired or removed — no half-built config.
- [ ] Unknown inbound platforms fail loudly.
- [ ] `backfill-plans.ts` is rewritten or deleted.
- [ ] `npm run lint`, `npm run build -w apps/gateway`, and `npm run test:integration -w apps/gateway` all pass.
