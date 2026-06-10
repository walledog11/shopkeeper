# Gateway Cleanup Plan

## Overview (2026-06-09)

Covers issues from the gateway code audit (`apps/gateway/src`, ~6,200 LOC), re-verified against the current tree on 2026-06-09. The core inbound → classify → summarize → plan → notify pipeline is sound; the slop is mostly migration debt, copy-pasted helpers, partially built infrastructure, and Redis connection sprawl.

Removed from the original plan as already complete:

- `ORDER_RISK_MONITOR_ENABLED` boolean parsing — `runtime-config.ts` already uses `parseBooleanEnv`.
- `backfill-plans.ts` rewrite — already calls `generateThreadPlan()` in-process with env vars documented.
- Dashboard internal HTTP client — `clients/dashboard-internal.ts` centralizes auth headers; all outbound dashboard POSTs now go through `postDashboardInternal` (Phase 4).
- Telegram routes reading `process.env.INTERNAL_API_SECRET` directly — no longer true; all outbound calls go through `buildDashboardInternalHeaders()`.

**Progress (2026-06-09):** Phases 1–8 complete. Phase 4 unified Meta Graph (`fetchInstagramUserProfile`), routed the last raw dashboard fetches through `postDashboardInternal`, and moved `formatChannelLabel` to `lib/channel-format.ts` (closing the Phase 3 routes-import follow-up). Phase 5 wired gateway `provider_send` (Telegram) and `agent_failure` (thread-sink dispatch hop) alerts. Phase 6 added `OperatorNotifyPolicy` (`critical` vs `best-effort`), made `telegram-client.sendMessage` return a boolean, and wired critical paths (plan approval prompts, escalations) to throw so BullMQ jobs retry while `provider_send` ops alerts fire on each failed attempt. Phase 2 documented legacy `whatsapp-*` BullMQ names in `constants.ts`, updated stale WhatsApp comments/tests to "operator", and kept live queue keys unchanged. Phase 7 added Redis/BullMQ singletons (`getGatewayRedis`, producer/worker connections), cached BullMQ `Queue` instances in `gateway-queues.ts`, and consolidated server connections from 4+ down to 2 per process. Phase 8 split `message-handlers/shared.ts` into focused modules, grouped webhook env reads in `runtime-config.ts`, split `worker.test.ts` into per-concern files under `test-fixtures/`, collapsed internal queue-health types, and trimmed stale Track comments.

Do not revert or rewrite unrelated user-owned work in the worktree.

## Phase 0: Keep The Cleanup Verifiable

Use this as the verification contract for every later phase.

- [ ] Keep cleanup changes scoped by phase — one PR per phase where practical.
- [x] Run `npm run lint -w apps/gateway` and `npm run build -w apps/gateway` after each batch.
- [x] Run targeted gateway integration tests for every changed module and failure path:

```bash
npm run test:integration -w apps/gateway -- <changed-test-files>
```

For Redis, worker bootstrap, or inbound path changes, also run:

```bash
npm run test:integration -w apps/gateway -- src/worker.test.ts src/workers/core.test.ts
```

---

## Phase 1: Quick Wins — Dedupe, Dead Code, and Config Consistency

Low-risk changes that reduce confusion without touching architecture.

### 1.1 Fail loudly on unknown inbound platforms

**Problem:** `workers/inbound.ts` completes successfully when `job.data.platform` is unrecognized — misconfigured jobs vanish silently. Highest-value item in this phase.

**Files:**

- `apps/gateway/src/workers/inbound.ts`

**Tasks:**

- [x] Add an `else` branch that logs an error and throws (so BullMQ retry/failure semantics apply).
- [x] Add a test case for an unknown platform value.

### 1.2 Move internal API secret access to config

**Problem:** `getInternalApiSecret()` lives in `message-handlers/shared.ts` but is imported by `clients/dashboard-internal.ts` and `routes/internal-auth.ts` — a config concern living in the message-handler layer.

**Files:**

- `apps/gateway/src/message-handlers/shared.ts`
- `apps/gateway/src/config/env.ts`
- `apps/gateway/src/clients/dashboard-internal.ts`
- `apps/gateway/src/routes/internal-auth.ts`

**Tasks:**

- [x] Move `getInternalApiSecret()` to `config/env.ts` (alongside `validateGatewayEnv`).
- [x] Update all callers to import from `config/env.ts`.

### 1.3 Extract duplicated crypto and typing helpers

**Problem:** `safeEqual` is copy-pasted in two route files. `isRecord` is duplicated across four modules (`health.ts`, `operator-context.ts`, `queue-health.ts`, `voice-synthesis.ts`).

**Files:**

- `apps/gateway/src/routes/webhooks-email.ts`
- `apps/gateway/src/routes/internal-auth.ts`
- `apps/gateway/src/health.ts`
- `apps/gateway/src/operator-context.ts`
- `apps/gateway/src/maintenance/queue-health.ts`
- `apps/gateway/src/maintenance/voice-synthesis.ts`

**Tasks:**

- [x] Add `apps/gateway/src/lib/crypto.ts` with `safeEqual(a, b)`.
- [x] Add `apps/gateway/src/lib/typing.ts` with `isRecord`, `readString`, and other shared guards.
- [x] Replace local copies in the files above.
- [x] Add focused unit tests for the extracted helpers.

### 1.4 Canonical channel label formatting

**Problem:** Identical `channelType === CHANNEL.IG_DM ? 'Instagram DM' : capitalize` logic appears three times across `planning-notifications.ts` (twice) and `internal-operator.ts`.

**Tasks:**

- [x] Add `formatChannelLabel(channelType: DbChannelType): string` to a shared format module (`lib/channel-format.ts`; moved out of `routes/telegram/format.ts` in Phase 4).
- [x] Replace the duplicated label logic in both files.
- [x] Add a small unit test for each channel type.

### 1.5 Remove dead constants and shims

**Problem:** Unused exports and a 6-line re-export shim add noise.

**Files:**

- `apps/gateway/src/constants.ts`
- `apps/gateway/src/message-handlers/business-hours.ts`
- `apps/gateway/src/workers/ai-summary.ts`
- `apps/gateway/src/routes/webhooks-signature-alerts.ts`
- `apps/gateway/src/maintenance/registration.ts`

**Tasks:**

- [x] Remove `CHANNEL.SMS` (unused).
- [x] Remove `SHOPIFY_API_VERSION` (unused).
- [x] Remove the `validation_failed` variant from `WebhookSignatureFailureReason` — never passed by any caller.
- [x] Delete the `business-hours.ts` shim; import directly from `@shopkeeper/agent/settings` in `ai-summary.ts`.
- [x] `closeMaintenanceWorkers` / `closeMaintenanceQueues`: these **are** used by `maintenance/workers.test.ts` — verify whether production shutdown uses them before touching; if only tests use them, keep and document, don't delete blindly. *(Verified: re-exported from `maintenance/workers.ts` but only called in tests — kept, not deleted.)*

### 1.6 Minor trivia (do opportunistically, not as dedicated work)

- [x] Import `ONE_DAY_MS` / `ONE_HOUR_MS` from `maintenance/registration.ts` in `digest.ts` and `purge.ts` instead of redefining locally.
- [x] Remove the unused `_currentHourUtc` parameter from `shouldSendDigest` (`digest.ts`) and update callers/tests.

**Phase 1 verification:**

- [x] `npm run lint -w apps/gateway`
- [x] `npm run build -w apps/gateway`
- [x] `npm run test:integration -w apps/gateway -- src/workers/core.test.ts src/maintenance/digest.test.ts src/routes/webhooks-signature-alerts.test.ts`

---

## Phase 2: WhatsApp Legacy Naming

**Problem:** Operator notifications go through Telegram, but queue names (`whatsapp-digest`), job IDs, failure labels, comments, and tests still say "WhatsApp."

**Recommended scope:** rename comments, test names, and the `failureQueue` label only. Renaming the live BullMQ repeatable queue requires a one-time job-migration deploy step — real risk for cosmetic payoff. Document the legacy queue names in `constants.ts` and defer the queue rename until a deploy already touches the digest worker.

**Files:**

- `apps/gateway/src/constants.ts`
- `apps/gateway/src/maintenance/digest.ts`
- `apps/gateway/src/types.ts`
- `apps/gateway/src/workers/ai-summary.ts`
- `apps/gateway/src/message-handlers/shared.ts`
- `apps/gateway/src/message-handlers/intelligence.ts`
- `apps/gateway/src/worker.test.ts`

**Tasks:**

- [x] Document legacy BullMQ queue names (`whatsapp-digest`, `send-whatsapp-digest`, `whatsapp-digest-hourly`) in `constants.ts` with a comment explaining the deferred rename.
- [x] Update `failureQueue` in `maintenance/digest.ts` — confirmed it is the live queue key (`QUEUE.DIGEST`), not a free-form label; switched to the constant instead of renaming.
- [x] Update "WhatsApp" comments in `types.ts`, `ai-summary.ts`, `shared.ts`, `intelligence.ts`.
- [x] Update stale "WhatsApp notification" test names in `worker.test.ts`.
- [x] If/when the queue rename happens: remove old repeatable jobs and register new IDs (one-time deploy step — documented in `constants.ts` comment).

**Phase 2 verification:**

- [x] `npm run lint -w apps/gateway`
- [x] `npm run test:integration -w apps/gateway -- src/maintenance/digest.test.ts src/worker.test.ts`

---

## Phase 3: Fix the Last Layer Violation

**Problem:** `message-handlers/agent-thread-sink.ts` imports `pushOperatorEscalation` from `routes/internal-operator.js` — the only remaining routes import from non-route code.

**Files:**

- `apps/gateway/src/operator-escalation.ts` *(new service module)*
- `apps/gateway/src/routes/internal-operator.ts`
- `apps/gateway/src/message-handlers/agent-thread-sink.ts`

**Tasks:**

- [x] Extract `pushOperatorEscalation` and `formatEscalationMessage` into `operator-escalation.ts` (dedicated service module alongside `operator-notify.ts`).
- [x] Keep `routes/internal-operator.ts` as a thin HTTP wrapper that delegates to the service.
- [x] Update `agent-thread-sink.ts` to import from the service layer.
- [x] Add or extend tests for escalation formatting and notification dispatch (`operator-escalation.test.ts`).

**Phase 3 verification:**

- [x] `npm run lint -w apps/gateway`
- [x] `npm run test:integration -w apps/gateway -- src/routes/internal-operator.test.ts src/worker.test.ts` *(also ran `src/operator-escalation.test.ts`)*
- [x] Confirm no production import from `routes/` in `message-handlers/` or `workers/`. *(Completed in Phase 4: `formatChannelLabel` moved to `lib/channel-format.ts`.)*

---

## Phase 4: Finish External API Client Consolidation

### 4.1 Unify Meta Graph client

**Problem:** `channels.ts` hardcodes `FB_GRAPH = 'https://graph.facebook.com/v22.0'` while `clients/meta-graph.ts` already centralizes the base URL + version — version-drift risk.

**Tasks:**

- [x] Add `fetchInstagramUserProfile(senderId, accessToken)` to `meta-graph.ts`.
- [x] Remove the hardcoded `FB_GRAPH` constant from `channels.ts`; call the shared client from `handleIgDmJob`.
- [x] Extend `clients/meta-graph.test.ts` for the new helper.

### 4.2 Route the last two raw fetches through `dashboard-internal.ts`

**Problem:** Two call sites still use raw `fetch` (already with shared headers) instead of `postDashboardInternal`:

- `apps/gateway/src/routes/telegram/digest-commands.ts` (`/api/messages/internal`)
- `apps/gateway/src/message-handlers/agent-thread-sink.ts` (`/api/agent/io-send-internal`)

**Tasks:**

- [x] Convert both to `postDashboardInternal` (or a typed wrapper alongside the existing ones).

### 4.3 Move `formatChannelLabel` out of routes *(Phase 3 follow-up)*

**Tasks:**

- [x] Move `formatChannelLabel` to `lib/channel-format.ts`; update `operator-escalation.ts` and `planning-notifications.ts` imports.
- [x] Add `lib/channel-format.test.ts`; remove from `routes/telegram/format.ts`.

**Phase 4 verification:**

- [x] `npm run lint -w apps/gateway`
- [x] `npm run test:integration -w apps/gateway -- src/clients/meta-graph.test.ts src/lib/channel-format.test.ts src/routes/webhooks-telegram.test.ts src/worker.test.ts src/operator-escalation.test.ts`

---

## Phase 5: Wire or Remove Half-Built Ops Alerts

**Problem:** `ops-alerts.ts` defines `provider_send` and `agent_failure` categories with config thresholds, but only `queue_health` and `webhook_signature` are emitted in production. Overlaps with `docs/production/error-tracking-plan.md`.

**Files:**

- `apps/gateway/src/ops-alerts.ts`
- `apps/gateway/src/config/runtime-config.ts`
- `apps/gateway/src/message-handlers/agent-thread-sink.ts`
- `apps/gateway/src/clients/telegram-client.ts`

**Tasks:**

- [x] Decide policy: wire alerts now (matches Level 1 Better Stack log-drain contract in `error-tracking-plan.md`; dashboard already emits both categories).
- [x] Emit `provider_send` on Telegram send failures (`clients/telegram-client.ts` → `provider-send-alerts.ts`) and `agent_failure` on thread-sink dashboard dispatch hop failures (`agent-thread-sink.ts` → `agent-failure-alerts.ts`); thresholds documented in operational guardrails.
- [x] Align with `docs/production/error-tracking-plan.md`: Pino `opsAlert: true` logs remain the sole paging channel; no Better Stack Errors dual-write (Level 2 triage only, when added).

**Phase 5 verification:**

- [x] `npm run lint -w apps/gateway`
- [x] `npm run test:integration -w apps/gateway -- src/ops-alerts.test.ts src/routes/webhooks-signature-alerts.test.ts src/maintenance/queue-health.test.ts src/provider-send-alerts.test.ts src/agent-failure-alerts.test.ts`

---

## Phase 6: Notification Failure Policy

**Problem:** `telegram-client.sendMessage` returns `void` and only logs on failure — jobs complete even when operators were not notified. Acceptable for digests; bad for escalations (a silently dropped escalation is the trust-breaking failure mode).

**Policy (implemented in `operator-notify.ts`):**

- **critical** — plan approval prompts (`sendOperatorPlanNotification`) and escalations (`pushOperatorEscalation`). Send failures throw `OperatorNotifyError` so BullMQ jobs retry; each failed attempt also emits `provider_send` via `telegram-client`.
- **best-effort** — digests, auto-execution summaries, webhook replies, and customer auto-ack (`sendAutoAck`). Failures are logged; callers continue without throwing.

**Files:**

- `apps/gateway/src/message-handlers/planning-notifications.ts`
- `apps/gateway/src/message-handlers/planning.ts`
- `apps/gateway/src/operator-notify.ts`
- `apps/gateway/src/operator-escalation.ts`
- `apps/gateway/src/clients/telegram-client.ts`

**Tasks:**

- [x] Document intentional vs. critical notification paths (plan alerts vs. auto-ack vs. escalation).
- [x] For critical paths (escalation, plan approval prompts): fail the job (retry) and emit an ops alert on failure (Phase 5 `provider_send`).
- [x] Change `telegram-client.sendMessage` to return a boolean or throw; let callers decide policy.
- [x] Update `planning-notifications.ts` and `planning.ts` `sendAutoAck` to match the documented policy.
- [x] Add tests for notification failure behavior (`operator-notify.test.ts`, `telegram-client.test.ts`, `planning-notifications.test.ts`; extended escalation and internal-operator tests).

**Phase 6 verification:**

- [x] `npm run lint -w apps/gateway`
- [x] `npm run test:integration -w apps/gateway -- src/worker.test.ts src/routes/webhooks-telegram.test.ts` *(also ran `src/operator-notify.test.ts`, `src/clients/telegram-client.test.ts`, `src/message-handlers/planning-notifications.test.ts`, `src/operator-escalation.test.ts`, `src/routes/internal-operator.test.ts`, `src/message-handlers/planning.test.ts`)*

---

## Phase 7: Consolidate Redis and BullMQ Connections

**Problem:** `clients/redis-client.ts` is a pure factory (`new IORedis` per call) with call sites in `index.ts`, `worker.ts`, `webhooks-shared.ts`, `agent-runtime.ts`, `internal-queue.ts`, `health.ts`, and `queue-maintenance.ts` — 7+ connections per process on combined server+worker deploys.

**Note:** do not collapse to a single connection. BullMQ Workers require their own blocking connections; the correct shape is three singletons: shared Redis client, BullMQ producer connection, BullMQ worker connection. Only worth doing if Railway Redis connection limits are actually a concern.

**Tasks:**

- [x] Introduce `getGatewayRedis()`, `getGatewayBullMqProducerConnection()`, `getGatewayBullMqWorkerConnection()` module-level singletons (`clients/redis-client.ts`).
- [x] Refactor `webhooks-shared.ts` to reuse one producer connection for inbound and order-review queues via `getGatewayBullMqQueue`; rate limiting uses `getGatewayRedis()`.
- [x] Refactor `index.ts` health checks, `agent-runtime.ts` lock Redis, and `ops-alert-counter.ts` to reuse `getGatewayRedis()`.
- [x] Refactor `health.ts` and `queue-maintenance.ts` to reuse cached `Queue` instances from `clients/gateway-queues.ts`.
- [x] Align worker bootstrap (`worker.ts`) with the same connection module.
- [x] Document expected connection count per runtime role (`server`, `worker`, `all`) in `redis-client.ts`.
- [x] Add tests that verify singleton behavior (`redis-client.test.ts`, `gateway-queues.test.ts`).

**Phase 7 verification:**

- [x] `npm run lint -w apps/gateway`
- [x] `npm run build -w apps/gateway`
- [x] `npm run test:integration -w apps/gateway -- src/worker.test.ts src/maintenance/queue-health.test.ts src/routes/webhooks.test.ts` *(also ran `src/clients/redis-client.test.ts`, `src/clients/gateway-queues.test.ts`, `src/routes/internal-queue.test.ts`)*
- [x] Smoke test: webhook enqueue covered by `src/routes/webhooks.test.ts`; `/health/deep` queue diagnostics covered by cached-queue refactor and existing health module tests.

---

## Phase 8: Slim God Files, Config Sprawl, and Test Debt

Lowest priority. Do only where a natural boundary exists — LOC targets are not goals in themselves.

### 8.1 Slim `queue-health.ts` (383 LOC) and `message-handlers/shared.ts` (316 LOC)

- [x] Move shared guards (`isRecord`, `readString`, normalizers) to `lib/typing.ts` (Phase 1).
- [x] Collapse internal-only interfaces in `queue-health.ts` that are not part of the public contract; keep exported surface (`checkGatewayQueueHealth`, registration helpers, DI types).
- [x] After Phase 1 moves `getInternalApiSecret` out of `shared.ts`, split remaining responsibilities (email classification, Shopify customer lookup, inbound persistence) only if a natural boundary exists. Avoid one-line helper files. *(Split into `email-classification.ts` and `inbound-persistence.ts`; deleted `shared.ts`.)*

### 8.2 Group scattered env reads

- [x] Add grouped getters in `runtime-config.ts` where env is read in more than one place: `getMetaWebhookConfig()`, `getTelegramConfig()`, `getPostmarkWebhookConfig()`.
- [x] Replace ad-hoc `process.env` reads in route handlers with the getters; extend `runtime-config.test.ts`.

### 8.3 Trim stale migration comments

- [x] Replace "Track 4.x" narration with brief "why" comments — **selectively**: several of these comments genuinely explain injection seams and should be kept or shortened, not deleted. Link to `docs/core-extraction-and-module-expansion-plan.md` where historical context is still useful.
- Files: `generate-thread-plan.ts`, `agent-turn-deps.ts`, `agent-thread-sink.ts`, `internal-operator.ts`, `agent-runtime.ts`, `execute-operator-agent-turn.ts`, `agent-lock.ts`. *(Last "Track 4.x" reference removed from `scripts/backfill-plans.ts`; listed handler files already clean.)*

### 8.4 Split `worker.test.ts` (826 LOC)

- [x] Extract shared fixtures into `src/test-fixtures/` or a `worker-test-helpers.ts`.
- [x] Split by worker concern: inbound, ai-summary, order-review. *(Split into `worker-inbound-*.test.ts` and `worker-ai-summary.test.ts`; original monolith had no order-review coverage.)*
- [x] Add focused tests for the `generateThreadPlan` auto-execute path if not covered after split. *(Covered in `generate-thread-plan.test.ts`.)*

**Phase 8 verification:**

- [x] `npm run lint -w apps/gateway`
- [x] `npm run build -w apps/gateway`
- [x] `npm run test:integration -w apps/gateway` *(44 files, 280 tests)*
- [x] Confirm total test count and coverage are unchanged or improved.

---

## Suggested PR Order

| Order | Phase | Effort | Risk | Status |
|-------|-------|--------|------|--------|
| 1 | Phase 1 — Quick wins | 0.5–1 day | Low | Done |
| 2 | Phase 3 — Layer violation | 0.5 day | Low | Done |
| 3 | Phase 4 — API client consolidation | 0.5 day | Low | Done |
| 4 | Phase 5 — Ops alerts decision | 0.5–1 day | Low | Done |
| 5 | Phase 6 — Notification failure policy | 1 day | Medium | Done |
| 6 | Phase 2 — WhatsApp naming (comments/labels only) | 0.5 day | Low | Done |
| 7 | Phase 7 — Redis singletons | 2–3 days | Medium | Done |
| 8 | Phase 8 — God files, config, test split | 1–2 days | Low | Done |

Phase 5 should align with the error-tracking plan before Sentry work begins; Phase 6 depends on the Phase 5 decision.

---

## Out of Scope

- Dashboard or agent package cleanup (covered by the previous cleanup tracker, now complete).
- New features or error-tracking implementation (see `docs/production/error-tracking-plan.md`).
- Renaming live BullMQ queue names (deferred — see Phase 2 note).
- SMS channel support (no implementation exists; remove dead constant only).
- The `free-form` discriminant in `routes/telegram/command-parser.ts` — technically unread at the call site, but it keeps the union total and self-documenting; leave it.

---

## Completion Criteria

The gateway cleanup is done when:

- [x] No worker or message-handler module imports from `routes/`.
- [x] All dashboard internal API calls go through `clients/dashboard-internal.ts`.
- [x] Redis connection count is documented and bounded per runtime role (`clients/redis-client.ts`).
- [x] No stale WhatsApp naming in gateway comments, labels, or tests (live BullMQ queue-name rename explicitly deferred and documented in `constants.ts`).
- [x] Ops alert categories are either wired or removed — no half-built config.
- [x] Unknown inbound platforms fail loudly.
- [x] `npm run lint`, `npm run build -w apps/gateway`, and `npm run test:integration -w apps/gateway` all pass.
