# Codebase Audit

Audit date: 2026-07-10

## Executive summary

The codebase is in better shape than its risk profile initially suggests: it has clear package boundaries, a canonical agent tool registry, strong tenant scoping in ordinary dashboard routes, encrypted integration tokens, signed webhooks, database-backed inbound idempotency, structured logging, and a large passing automated test suite. It is not a conventional helpdesk implementation; the architecture correctly centers customer channels and merchant-facing operator channels.

Overall health is **moderate, with a strong foundation but urgent distributed-action safety work**. The primary risks are not broad code quality or type failures. They are narrow but consequential gaps where two runtimes, multiple merchant devices, provider retries, or crashes can cross a non-atomic boundary. Those gaps can cause a stale plan to execute, the same irreversible action to run more than once, an outbound email to duplicate, or an acknowledged merchant instruction to be lost.

Two findings are Critical:

1. Dashboard and gateway approvals are not coordinated by one execution claim, and operator-device pending plans can remain independently approvable after one device runs them.
2. Plan generation can overwrite a newer cache with a stale plan and notify operators without rechecking the current customer message.

The safest first work is to add regression tests and observability around these workflows, then introduce a durable plan-execution claim before changing cleanup or structure. No production behavior was changed during this audit.

## Scope, method and confidence

The audit covered application and package source, API/webhook routes, Prisma schema and all migrations, queue/worker registration, shared agent execution, Shopify/email/messaging integrations, authentication/authorization wrappers, environment validation, scripts, deployment files, tests, and dependency metadata. Critical paths were traced through implementations rather than inferred from names.

The inspected worktree already contained substantial uncommitted changes. Findings describe that snapshot. Live Shopify/Meta/TikTok/Gmail/Telegram/Photon/Stripe calls, production Redis topology, production data consistency, and Clerk-authenticated browser tests were not exercised. Findings that depend on those external facts are marked accordingly.

Baseline verification:

- `npm run lint`: passed.
- `npm run typecheck`: passed in all six workspaces.
- `npm run test:unit`: 1,032 tests passed.
- `npm run test:node`: 29 tests passed.
- `npm run test:integration`: 806 tests passed (805 dashboard/gateway plus one agent integration test).
- `npm run test:e2e:smoke`: 8 Playwright tests passed.
- `npm audit --json`: 11 moderate, 0 high, 0 critical advisories.
- Repository secret-pattern and tracked-environment checks found no committed production secrets.

Severity reflects product impact; confidence reflects the evidence that the condition exists, not proof that it has already occurred in production.

## Repository architecture map

The detailed inventory is in `docs/codebase-inventory.md`. The responsibility map is:

```text
Customer providers ──signed webhooks──> Gateway HTTP
                                          │
                                          ▼
                                  BullMQ inbound queue
                                          │
                                          ▼
 Postgres <── inbound persistence ── Gateway workers ──> Anthropic / Shopify
    │                                     │
    │                                     ├── plan cache / auto-execution
    │                                     └── Telegram + Photon operator notify
    │
    ├── Next.js dashboard APIs ──> plan review / approval
    │          │
    │          └── provider dispatch or internal outbound-email queue hop
    │
    └── shared packages: agent core, database, email, analytics
```

Key boundaries:

- `apps/dashboard` owns Clerk-authenticated merchant UI/API behavior, OAuth and provider-coupled customer dispatch.
- `apps/gateway` owns public provider ingress, BullMQ work, scheduled jobs, and Telegram/iMessage merchant interaction.
- `packages/agent` owns planning, context, tool schemas, deterministic policy, execution and Shopify operations.
- `packages/db` owns the universal tenant data model and transparent integration-token encryption.
- Two Redis deployments are intentionally used: Upstash REST by the dashboard and dedicated TCP Redis by the gateway/BullMQ. This intentional topology becomes unsafe when both are treated as one distributed lock.

## Main runtime and data flows

### Inbound customer message

- Entry: channel route in `apps/gateway/src/routes/webhooks-*.ts`.
- Authentication: provider signature/secret validation is present for Meta, Shopify, TikTok, Gmail Pub/Sub, Postmark, Telegram and Photon/Spectrum.
- Tenant resolution: provider account/address maps to an `Integration.organizationId`; Telegram/iMessage merchant messages map through member bindings.
- Persistence: `processInboundMessage()` upserts a tenant-local customer, finds or creates an open channel thread, writes a message, atomically updates thread activity/clears its cached plan, and queues summary work.
- Idempotency: provider message IDs are unique per organization through raw migration `20260607000000_scope_message_idempotency_by_org`; the open-thread race has a database partial unique index and `P2002` recovery.
- Failure: inbound queue jobs retry three times with exponential backoff. Permanently failed jobs remain in Redis for seven days and are logged.

### Context, planning and approval

- `buildContext()` loads the tenant-checked thread, organization, customer, up to 50 messages, Shopify integration/recent orders, three knowledge articles and past tickets.
- `planAgent()` calls Anthropic, runs read tools, validates tool inputs and produces an `AgentPlan`.
- `generateThreadPlan()` caches the plan on the thread and the AI-summary flow decides whether to auto-execute, ask the merchant, or notify every bound operator device.
- Dashboard approval verifies the submitted call IDs/names/inputs against the current cache before execution.
- Operator-channel approval executes stored calls directly after resolving the organization/thread; it does not revalidate against the current cache or originating customer-message ID.

### Tool execution and Shopify mutation

- `executeAgentTurn()` acquires a per-thread Redis lock, rebuilds context, and calls the shared runtime.
- Every tool argument is reparsed by its canonical definition; static policy checks run independently of the model.
- Irreversible operations call the shared Shopify client. The client applies a 15-second timeout and one retry for 429/5xx responses to every HTTP method.
- `AgentAction` audit rows are written after tool completion. They are an audit trail, not a pre-execution idempotency/intent ledger.
- Per-day refund/goodwill spend is checked before the tool and incremented after the provider reports success.

### Customer response and merchant notification

- `send_reply` dispatches through the original thread channel. Email may enqueue a pending `Message` to the gateway worker; other channels use provider adapters.
- Agent plans/questions/results are fanned out to all bound Telegram/iMessage devices, with a per-device `OperatorContext` record.
- Realtime events publish thread changes to dashboard SSE clients; polling remains the fallback.

### Partial completion, retry and recovery

- BullMQ supplies at-least-once delivery, three attempts and retained failures.
- Inbound message insertion is database-idempotent.
- Outbound provider sends and Shopify mutations do not have one durable execution state spanning “intent created → provider accepted → local commit.” Several findings below are consequences of this missing boundary.

## Critical findings

### AUD-001 — Approval and execution are not globally single-use

**Implementation status (2026-07-12): In progress.** Deterministic reproductions
now cover the separate-lock duplicate and related stale/cap/post-provider
failure boundaries. An additive `PlanExecution` ledger, atomic claim service,
state constraint, shadow observation, and `AgentAction` linkage are present,
but claims are not yet enforced across execution entry points. The finding
therefore remains Critical until P1-02/P1-03 complete.

| Field | Value |
| --- | --- |
| Severity | Critical |
| Confidence | Confirmed |
| Category | Agent safety, concurrency, reliability |
| Disposition | Fix now |

**Locations and symbols:** `apps/dashboard/src/lib/server/agent-lock.ts:29-50` (`upstashLockProvider`); `apps/gateway/src/clients/agent-lock.ts:6-10` (`createGatewayLockProvider`); `packages/agent/src/lock/redis-lock.ts:56-115` (`createRedisLockProvider`); `packages/agent/src/turn.ts:71-86,143-146` (`executeAgentTurn`); `packages/agent/src/plan-execution.ts:144-192` (`executeCurrentCachedHomePlan`); `apps/gateway/src/message-handlers/pending-plan-actions.ts:10-26`; `execute-operator-agent-turn.ts:46-86`; `planning-notifications.ts:308-350`; `operator-context.ts:19-39,107-153`.

**Description and evidence:** The dashboard lock is stored in Upstash while the gateway lock is stored in the dedicated BullMQ Redis. The identical key therefore does not coordinate dashboard and gateway executions. Locks also expire after 90 seconds and have no renewal. Dashboard validation occurs before lock acquisition and cache consumption occurs after the action. Operator notification parks the same raw plan independently in every device context; approval clears only the approving device. The operator approval path executes those stored calls without checking the current thread cache, plan hash, or originating customer message.

**Why it matters:** A dashboard approval and Telegram/iMessage approval, two merchant devices, or a run exceeding the lock TTL can execute the same refund, cancellation, order edit, store credit, gift card, or customer reply more than once. A second device can also approve a plan after the customer has sent newer information.

**Recommended change and expected benefit:** Introduce a durable `PlanExecution`/action-intent record keyed by a stable plan ID and hash plus thread/customer-message ID. Claim it atomically in PostgreSQL before any tool runs, transition through `pending/claimed/committed/failed/unknown`, and reject any later claim. Revalidate current message/cache under that claim, clear/resolve all device contexts for the plan, and either move locks to one shared authority or make the database claim the correctness mechanism. Add lock renewal only as a latency guard, not the primary idempotency guarantee. This makes approval single-use across runtimes and devices.

**Change risk:** High. A faulty claim could block legitimate approvals or strand plans. Roll out initially in shadow/log-only mode, backfill no historical claims, and retain an admin recovery path for `unknown` executions.

**Validation/tests:** Concurrent dashboard/gateway approval; two-device approval; approval after a new customer message; action longer than 90 seconds; crash before and after provider response; only one external mutation and one customer reply; all device ledgers resolve consistently.

### AUD-002 — In-flight planning can publish and execute a stale plan

| Field | Value |
| --- | --- |
| Severity | Critical |
| Confidence | Confirmed |
| Category | Agent orchestration, race condition, AI cost |
| Disposition | Fix now |

**Locations and symbols:** `apps/gateway/src/message-handlers/inbound-persistence.ts:158-197` (`processInboundMessage`); `generate-thread-plan.ts:54-163` (`generateThreadPlan`); `ai-summary-flow.ts:33-156` (`processAiSummaryJob`); `planning-notifications.ts:308-350`.

**Description and evidence:** Every inbound message queues a summary job without a stable job ID or debounce. Planning snapshots `pendingCustomerMessageId`, performs context gathering/model work, then unconditionally updates `Thread.cachedPlanMessageId/cachedPlan`. If a newer inbound message clears the cache while the older planner is running, the older planner can write its stale result afterward. The summary flow then notifies operators without rechecking the latest message. Operator approvals in AUD-001 do not perform the dashboard’s current-cache validation.

**Why it matters:** The merchant can be shown and approve a response or Shopify mutation based on superseded customer instructions. Bursts also produce redundant classifier/planner calls and competing cache writes.

**Recommended change and expected benefit:** Carry the source customer-message ID in the AI-summary job, coalesce jobs per thread, and update the cache with a conditional `updateMany` that succeeds only if the thread still has the expected pending message/cache generation. Re-read before notification and before auto-execution. Treat a zero-row conditional update as a stale-plan cancellation. This contains stale actions and materially reduces AI cost during message bursts.

**Change risk:** Medium. Aggressive debounce can delay a response; use a short bounded window and always schedule a trailing job.

**Validation/tests:** Two inbound messages while the first planner is blocked; out-of-order job completion; multiple worker replicas; outside-business-hours flow; verify only the newest plan is cached/notified/executable and model-call count is bounded.

## High-priority findings

### AUD-003 — Shopify mutations are retried without durable idempotency

| Field | Value |
| --- | --- |
| Severity | High |
| Confidence | Confirmed |
| Category | External integration, irreversible actions, reliability |
| Disposition | Fix now |

**Locations and symbols:** `packages/agent/src/shopify/client.ts:1-4,223-260` (`shopifyRest`); `shopify/refunds.ts:108-170`; `shopify/order-cancellation.ts:7-29`; `shopify/order-address.ts:65-88`; `packages/agent/src/run-execution.ts:130-151`; `packages/agent/src/agent-actions.ts:110-135`.

**Description and evidence:** `shopifyRest()` defaults to one retry for 429 or any 5xx regardless of HTTP method. POST/PUT GraphQL and REST mutations therefore retry when Shopify may have committed but returned an ambiguous response. No durable action intent exists before the call; `AgentAction` records are best-effort and written afterward. Multi-step actions such as order address plus customer-default-address sync can partially succeed.

**Why it matters:** Ambiguous provider failures can create duplicate refunds/orders/gift cards or repeat edits. A process crash after Shopify commits but before local audit/cache consumption leaves no reliable state from which to reconcile.

**Recommended change and expected benefit:** Default automatic retries to safe reads only. For mutations, use provider-supported idempotency identifiers where available, query/reconcile state before retry, and tie calls to the execution ledger from AUD-001. Represent ambiguous outcomes as `unknown`, not generic failure. Persist redacted provider request/response identifiers for reconciliation. This prevents blind mutation replay and makes recovery auditable.

**Change risk:** High because retry behavior changes availability. Stage per tool, starting with refunds, cancellations, gift cards/store credit and order creation.

**Validation/tests:** Simulate provider commit followed by 500/timeout; assert one mutation; crash after response; replay the same plan; multi-step partial failure; reconciliation resolves `unknown` without repeating the action.

### AUD-004 — Daily refund/goodwill caps are a check-then-act race

| Field | Value |
| --- | --- |
| Severity | High |
| Confidence | Confirmed |
| Category | Agent policy, data consistency, concurrency |
| Disposition | Fix now with AUD-001/003 |

**Locations and symbols:** `packages/agent/src/tools/executor.ts:64-89` (`enforceToolPolicy`); `packages/agent/src/tools/registry/order.ts:96-123,273-329`; `packages/db/refund-spend.ts:8-30`.

**Description and evidence:** Each tool reads `RefundDailySpend`, compares the requested amount, performs the external action, then increments the counter. Concurrent actions on different threads/runtimes can all pass the same remaining cap. If the external action succeeds but the counter increment fails, the tool returns an error path while the spend remains understated.

**Why it matters:** A merchant-configured safety limit can be exceeded, and a perceived failure can invite a manual retry of an already-completed refund, credit, or gift card.

**Recommended change and expected benefit:** Atomically reserve cents in PostgreSQL before the provider call using a conditional upsert/update under the daily cap. Link the reservation to the durable action intent; commit it on known success, release it on known no-op failure, and retain it for ambiguous outcomes until reconciliation. This makes the cap enforceable across all threads and runtimes.

**Change risk:** Medium-high. Incorrect release logic could leak capacity or allow overspend.

**Validation/tests:** Parallel reservations at the boundary; provider failure before commit; provider success plus DB failure; day rollover; store credit/gift card fallback; retry of an existing intent.

### AUD-005 — Outbound email's send-status gate is not crash- or concurrency-idempotent

| Field | Value |
| --- | --- |
| Severity | High |
| Confidence | Confirmed |
| Category | Messaging, queue semantics, tenant isolation |
| Disposition | Fix now |

**Locations and symbols:** `apps/dashboard/src/lib/messaging/email-dispatch.ts:25-55`; `enqueue-outbound-email.ts:20-56`; `apps/gateway/src/routes/internal-queue.ts:20-69`; `message-handlers/outbound-email.ts:14-141`; `workers/outbound-email.ts:12-36`.

**Description and evidence:** Enqueue does not use `messageId` as BullMQ `jobId`. The worker reads `sendStatus`, sends, and only then writes `sent`; concurrent duplicate jobs can both observe `pending`, and a crash after provider acceptance causes a retry to send again. The route and worker also trust the job's independent organization, message, thread and integration IDs without asserting that they belong to one tenant. The comment describing this as idempotent under at-least-once delivery is stronger than the implementation.

**Why it matters:** Customers can receive duplicate email. A malformed internal job or compromise of the global internal secret could combine one tenant's provider credentials with another tenant's message/customer.

**Recommended change and expected benefit:** Use a stable `jobId` derived from `messageId`; atomically claim `pending/failed -> processing` with a claim token; validate `message.organizationId`, `message.threadId`, `thread.organizationId`, and `integration.organizationId`; use provider idempotency/message identity if supported; and reconcile stale `processing` states. This narrows both duplicate-send and cross-tenant risk.

**Change risk:** Medium. Existing failed jobs and retry UI need compatible transitions.

**Validation/tests:** Two concurrent jobs; crash after provider send; stale-processing sweep; mismatched tenant IDs; repeated enqueue; final-attempt failure and manual retry.

### AUD-006 — Stripe deduplication is committed before subscription processing

| Field | Value |
| --- | --- |
| Severity | High |
| Confidence | Confirmed |
| Category | Billing webhook, reliability |
| Disposition | Fix now |

**Locations and symbols:** `apps/dashboard/src/app/api/billing/webhook/route.ts:52-161` (`POST`).

**Description and evidence:** The route claims `stripe:event:{id}` with Redis `NX` before the database update and analytics call. If any later operation throws, Stripe retries, finds the claim, and receives a successful duplicate response without reprocessing. The comment that handlers are idempotent only addresses Redis failure, not claim-before-work failure.

**Why it matters:** Subscription status can remain stale, potentially allowing or blocking writes incorrectly after payment or cancellation changes.

**Recommended change and expected benefit:** Store webhook events durably with `processing/completed/failed`, process in a transaction where possible, return failure for retryable failures, and only treat `completed` as duplicate. Make analytics post-commit/best-effort so it cannot prevent billing state completion.

**Change risk:** Medium. Event ordering must be handled using Stripe timestamps/version semantics so an older retry cannot overwrite a newer status.

**Validation/tests:** Failure after claim and before/after DB update; duplicate completed event; out-of-order updated/deleted/payment-failed events; Redis unavailable.

### AUD-007 — Merchant Telegram/iMessage instructions can be lost after acknowledgement

| Field | Value |
| --- | --- |
| Severity | High |
| Confidence | Confirmed |
| Category | Operator messaging, webhook reliability |
| Disposition | Fix now |

**Locations and symbols:** `apps/gateway/src/routes/telegram/webhook-validation.ts:111-146`; `webhooks-telegram.ts:6-22`; `webhooks-photon.ts:93-113,146-177,214-223`.

**Description and evidence:** Telegram returns HTTP 200 before `handleTelegramMessage()` completes and has no durable `message_id` inbox/dedupe record. A crash loses the merchant instruction; a partial action followed by the generic retry prompt can produce a duplicate. iMessage claims a Redis dedupe key before dispatch, catches dispatch errors inside Spectrum's callback, and still returns the provider result; the failed instruction remains claimed for five minutes. Redis errors fail open and can duplicate actions.

**Why it matters:** These are merchant control channels capable of approving refunds and customer messages. Losing or replaying instructions is materially more serious than losing a typing indicator.

**Recommended change and expected benefit:** Persist a signed, tenant-resolved operator event in a durable inbox/queue before acknowledgement. Deduplicate by provider/message ID, distinguish processing/completed/failed, and make handlers retry-safe through AUD-001. Send user-facing failure status from a worker when execution definitively fails.

**Change risk:** Medium-high because replies become asynchronous and presence behavior changes.

**Validation/tests:** Crash immediately after ack/persist; duplicate Telegram update; failed iMessage dispatch then provider retry; Redis outage; action partially succeeds; ordering of two merchant messages.

### AUD-008 — Meta batches beyond the first entry/event are dropped

| Field | Value |
| --- | --- |
| Severity | High |
| Confidence | Confirmed |
| Category | Instagram webhook correctness |
| Disposition | Fix now |

**Locations and symbols:** `apps/gateway/src/routes/webhooks-meta.ts:71-118` (`registerMetaWebhookRoutes`); `message-handlers/channels.ts:41-115` (`handleIgDmJob`).

**Description and evidence:** The route resolves and tests only `entry[0]` and its first `messaging`/`changes` element. The worker again extracts only the first element. The declared payload shape explicitly permits arrays.

**Why it matters:** Valid customer DMs delivered in a provider batch can be silently omitted, producing missing conversations and customer non-response.

**Recommended change and expected benefit:** Verify once, flatten all supported entry events, resolve the tenant for each entry, and enqueue one job per real message with a stable job ID/provider message ID. Skip echoes per event rather than per payload. This preserves every customer message and isolates failures.

**Change risk:** Low-medium; an incorrect flatten can ingest non-message changes.

**Validation/tests:** Multiple entries, multiple messages, mixed echo/real/change events, entries for different connected pages, duplicate `mid`, one malformed event among valid events.

### AUD-009 — A global 50 MB parser exposes every gateway route to oversized bodies

| Field | Value |
| --- | --- |
| Severity | High |
| Confidence | High confidence |
| Category | Security, availability, file handling |
| Disposition | Fix now |

**Locations and symbols:** `apps/gateway/src/index.ts:19-31` (`createGatewayApp`); `routes/webhooks-email.ts:36-125`; `message-handlers/channels.ts:185-189`.

**Description and evidence:** `express.json` and `urlencoded` parse and retain a raw copy of up to 50 MB before route-specific authentication, signature checks or rate limits. The size exists for Postmark attachment payloads but applies to health, internal and every other webhook route. Email accepts any count/type of base64 attachments and uploads all concurrently without an application-level decoded-size budget.

**Why it matters:** Unauthenticated requests can consume substantial memory/CPU before rejection. Valid but hostile inbound email can amplify memory, concurrency and blob-storage cost.

**Recommended change and expected benefit:** Install route-specific parsers: small defaults for internal/social routes, raw-body parsers sized to each signed provider, and a separately authenticated Postmark limit. Enforce attachment count, decoded bytes, filename/content-type policy and bounded upload concurrency; consider streaming/quarantine for large files.

**Change risk:** Medium. Provider payload limits must be measured so legitimate attachments are not rejected.

**Validation/tests:** Requests just below/above each route limit, invalid signature with large body, excessive attachment count/decoded bytes, malformed base64, upload partial failure.

### AUD-010 — Internal send boundaries do not enforce relational tenant ownership

| Field | Value |
| --- | --- |
| Severity | High |
| Confidence | Confirmed |
| Category | Tenant isolation, internal APIs |
| Disposition | Fix now |

**Locations and symbols:** `apps/dashboard/src/app/api/agent/io-send-internal/route.ts:31-84`; `apps/dashboard/src/lib/agent/tools/thread.ts:89-117` (`sendReply`); `apps/gateway/src/routes/internal-queue.ts:25-63`; `message-handlers/outbound-email.ts:32-100`; `packages/db/index.ts:141-160` (`resolveMessageOrganizationId`).

**Description and evidence:** Internal routes authenticate a global service secret and then accept independent tenant/object IDs. `sendReply()` loads a thread by ID without comparing `thread.organizationId` to `ctx.orgId`, then selects integrations using the supplied organization. Outbound-email jobs similarly load message and integration independently. `createMessage()` accepts a supplied `organizationId` without checking it against the thread.

**Why it matters:** These routes are not browser-public, but a programming error, malformed queued job, leaked internal secret, or compromised service could send one merchant's content/customer through another merchant's provider or persist inconsistent ownership.

**Recommended change and expected benefit:** Treat internal IDs as untrusted: load objects through composite tenant predicates, assert every relationship, derive organization from the root object where possible, and narrow/rotate secrets per service or use signed service identity. Make `createMessage()` verify an explicitly supplied organization against its thread. This turns tenant isolation into a boundary invariant rather than a caller convention.

**Change risk:** Low-medium; it may expose existing inconsistent rows/jobs.

**Validation/tests:** Every mismatched combination of org/thread/message/integration, rotated previous secret, valid same-tenant request, corrupt historical row diagnostics.

### AUD-011 — Sensitive workspace operations do not distinguish member from admin

| Field | Value |
| --- | --- |
| Severity | High |
| Confidence | High confidence |
| Category | Authorization, product policy |
| Disposition | Product decision, then fix |

**Locations and symbols:** `apps/dashboard/src/lib/api/route.ts:27-60`; `lib/api/clerk-route.ts:30-55`; `app/api/org/route.ts:41-109`; `app/api/org/data/route.ts:75-91`; `app/api/integrations/[id]/route.ts:10-75`; `app/api/billing/checkout/route.ts:9-41`; `billing/portal/route.ts:10-29`; integration OAuth auth routes.

**Description and evidence:** `withOrgRoute` verifies organization membership but does not expose/enforce role. Any member can change agent settings including auto-execution/refund policy, rename the workspace, archive all tickets, connect/disconnect integrations, and create billing sessions. Team administration and full workspace deletion correctly use `requireAdmin`, proving roles exist.

**Why it matters:** If `org:member` is intended to be a lower-privilege support/operator role, it can alter the safety envelope or disrupt integrations. If all members are intentionally trusted co-owners, this is not a defect but must be explicit.

**Recommended change and expected benefit:** Define a permission matrix. At minimum, consider admin-only integration lifecycle, billing, bulk data clearing, workspace identity, auto-execution mode, refund/goodwill caps and other irreversible policy settings. Keep routine support actions available to members as product requires.

**Change risk:** High product/UX risk; silently restricting existing team members could break workflows.

**Validation/tests:** Role matrix tests for every sensitive route, direct API requests by member/admin, audit log of setting/integration changes, migration/communication plan for existing teams.

### AUD-012 — The UI reports approval success before execution succeeds

| Field | Value |
| --- | --- |
| Severity | High |
| Confidence | Confirmed |
| Category | Frontend correctness, partial failure |
| Disposition | Fix now with action-safety work |

**Locations and symbols:** `apps/dashboard/src/app/dashboard/(shell)/tickets/_components/conversation/composer/useActionPlanReviewState.ts:130-149`; `tickets/_hooks/useConversationAgentFlow.ts:124-145`; `tickets/_hooks/conversation-agent-requests.ts:54-79`; `apps/dashboard/src/app/api/agent/route.ts:101-123`.

**Description and evidence:** `runApprovedSteps()` dispatches `sent` before invoking asynchronous approval. The parent schedules the plan card for removal after a fixed delay before the request resolves. On failure it adds an error turn, but the approved plan is already shown as sent/hidden. The API consumes the cached plan in `finally`, including thrown execution paths.

**Why it matters:** The merchant can reasonably believe a reply/refund/order edit succeeded when it failed or is ambiguous. Hiding the exact plan also makes safe recovery harder and encourages free-form retry.

**Recommended change and expected benefit:** Make approval return a promise and model `idle/submitting/succeeded/failed/partial/unknown`. Show “Running” until the server returns committed action states; only show “Sent/Done” for confirmed success. Retain/reload the plan on known no-op failure, and show action-by-action recovery for partial/unknown outcomes. Align cache consumption with the durable ledger.

**Change risk:** Medium; requires an API response contract change and careful handling of already-consumed plans.

**Validation/tests:** Network failure, policy block, provider failure, partial multi-tool plan, unknown provider outcome, success, double click, navigation/reload during execution, accessible status announcements.

### AUD-023 — Escalated `pending` threads fall out of inbox correlation

| Field | Value |
| --- | --- |
| Severity | High |
| Confidence | High confidence |
| Category | Product state model, conversation continuity |
| Disposition | Product decision, then fix |

**Locations and symbols:** `apps/gateway/src/message-handlers/agent-thread-sink.ts:131-149` and `apps/dashboard/src/lib/agent/tools/thread.ts:358-377` (`escalateToHuman`); `apps/gateway/src/message-handlers/inbound-persistence.ts:108-148`; `apps/dashboard/src/app/api/threads/route.ts:29-39,102-145`; raw uniqueness migration `packages/db/prisma/migrations/20260405000000_add_idempotency_and_thread_uniqueness/migration.sql`.

**Description and evidence:** Escalation changes the thread status to `pending`. Inbound correlation searches only for `status='open'`, and the unique active-thread index also covers only open rows. The primary thread-list API casts/defaults status to `open` or `closed`, so pending threads are not returned by the ordinary inbox queries. A customer follow-up after escalation therefore creates or reuses a separate open thread rather than continuing the pending one. No separate pending inbox/view was found.

**Why it matters:** The merchant can lose the escalated conversation from the main work surface, while the agent handles the same customer in a new thread without the most recent escalation context. This can generate inconsistent replies or actions. The code behavior is confirmed; whether “pending means intentionally parked outside the inbox” is a product decision that needs verification.

**Recommended change and expected benefit:** Define the thread state machine explicitly. If pending means “active, awaiting merchant,” include it in inbox presentation and inbound correlation, and enforce at most one active (`open` or `pending`) thread per tenant/customer/channel. Alternatively, retain `open` and represent escalation with a separate escalation/assignment state or tag. Audit existing open+pending pairs before any constraint migration. This restores conversation continuity without imposing a traditional ticketing model.

**Change risk:** High. Merging/reopening the wrong historical threads or changing what merchants see can alter workflow; do not silently coerce statuses.

**Validation/tests:** Escalate then receive customer follow-up; direct/dashboard/operator navigation; open+pending historical pair; merchant resolves/reopens; uniqueness race; plan context includes the complete conversation.

## Medium-priority findings

### AUD-013 — Filtered thread pagination uses a cursor unrelated to its sort

| Field | Value |
| --- | --- |
| Severity | Medium |
| Confidence | Confirmed |
| Category | Backend query correctness, performance |
| Disposition | Fix soon |

**Locations and symbols:** `apps/dashboard/src/lib/messaging/thread-list-query.ts:152-178`; `app/api/threads/route.ts:22-145`; `tickets/_hooks/usePaginatedThreads.ts:34-99`.

**Description and evidence:** SQL-filtered lists order by `last_message_at DESC, id DESC` but page with `id < cursor`. UUID order is unrelated to `last_message_at`, so later pages can skip or repeat rows. The general API also permits no `limit`; with `preview=false` it returns every message for every matching thread.

**Why it matters:** “For me,” draft, tag and channel filters can show an incomplete/duplicated inbox. Unbounded internal/API use can create large queries and responses.

**Recommended change and expected benefit:** Encode `(lastMessageAt,id)` in the cursor and use the matching lexicographic predicate. Apply a default maximum page size and require explicit detail endpoints for full message histories. This fixes correctness now and bounds query cost as data grows.

**Change risk:** Low-medium; existing clients/cursors need a compatibility window.

**Validation/tests:** Equal timestamps, random UUID ordering, insertion between page loads, all filter combinations, invalid/old cursor, default limit and detail loading.

### AUD-014 — AI summary context grows without a bound and classifier tags are not validated

| Field | Value |
| --- | --- |
| Severity | Medium |
| Confidence | Confirmed |
| Category | AI cost, structured output validation |
| Disposition | Fix soon |

**Locations and symbols:** `apps/gateway/src/message-handlers/intelligence.ts:27-46`; `email-classification.ts:47-67,109-134`; `packages/agent/src/context.ts:114-135,260-323`; `packages/agent/src/spend.ts:11-55`.

**Description and evidence:** Intelligence loads every non-note message and sends the complete concatenated thread on every refresh. Agent context is bounded to 50 messages but includes full bodies of up to three KB articles. The classifier validates classification enum but accepts any non-empty tag even though the prompt specifies five values. Spend enforcement intentionally allows concurrent overshoot and fails open on accounting errors; this is documented as a runaway backstop, not a strict meter.

**Why it matters:** Long threads cause monotonically increasing tokens/cost/latency, and arbitrary tags create inconsistent filters/UI. The cost impact is meaningful immediately for long or bursty threads; KB truncation is more likely a later-scale optimization.

**Recommended change and expected benefit:** Summarize incrementally or use a bounded recent window plus prior summary; cap per-message and KB-body characters/tokens; validate tag/title/summary/language lengths and allowed tag values with a shared schema. Preserve the documented LLM cap semantics unless product requires strict billing enforcement.

**Change risk:** Medium. Truncation can remove decisive context; measure agent quality and pin critical recent/customer/order facts.

**Validation/tests:** Very long thread, huge KB article, multilingual response, invalid tag, missing fields, token/cost telemetry before/after, quality eval regression.

### AUD-015 — Several external HTTP clients have no deadline

| Field | Value |
| --- | --- |
| Severity | Medium |
| Confidence | Confirmed |
| Category | Integration reliability, resource use |
| Disposition | Fix soon |

**Locations and symbols:** `packages/email/src/gmail/client.ts:416-454`; `apps/gateway/src/clients/meta-graph.ts:14-23`; dashboard OAuth token-exchange fetches; `apps/dashboard/src/lib/messaging/enqueue-outbound-email.ts:35-55`. Shopify's `fetchWithTimeout` at `packages/agent/src/shopify/client.ts:154-171` is the positive counterexample.

**Description and evidence:** Gmail authenticated requests, Meta Graph calls, several OAuth exchanges and internal HTTP hops use `fetch` without an `AbortSignal`. A stalled socket can occupy a request/worker past the 90-second agent-lock TTL or queue lock window.

**Why it matters:** Provider degradation can exhaust concurrency, delay webhook acknowledgement and undermine the lock assumptions. It becomes more meaningful as worker concurrency grows.

**Recommended change and expected benefit:** Provide shared integration-specific fetch wrappers with deadlines, typed timeout errors and redacted logging. Retry only classified safe/idempotent operations; never blanket-retry mutations. This bounds resource occupancy and improves alert classification.

**Change risk:** Low-medium; deadlines set too low create false failures.

**Validation/tests:** Hanging fetch, abort cleanup, slow success near deadline, retry-after parsing, OAuth timeout, worker retry classification.

### AUD-016 — Redundant tenant IDs are not protected by compound relational constraints

| Field | Value |
| --- | --- |
| Severity | Medium |
| Confidence | High confidence |
| Category | Data model, tenant consistency |
| Disposition | Investigate, then migrate |

**Locations and symbols:** `packages/db/prisma/schema.prisma:168-260,354-445`; `packages/db/index.ts:141-185`.

**Description and evidence:** `Thread` stores organization and customer IDs with independent foreign keys; `Message`, `KbArticle`, `KbCitation`, `AgentAction` and related models store both a tenant ID and a parent ID without a compound constraint that they belong to the same tenant. Most application writes are scoped, but the database allows mismatched combinations and `createMessage()` trusts an explicitly supplied organization.

**Why it matters:** One malformed internal write can create data that ordinary tenant filters hide inconsistently or expose through a relation. No corrupt row was confirmed in the test database or production.

**Recommended change and expected benefit:** First run read-only consistency queries in production. Centralize write helpers immediately. Where practical, add compound unique keys and compound foreign keys/check triggers in staged migrations, or remove redundant tenant columns only when query/isolation needs permit. This makes tenant ownership enforceable at rest.

**Change risk:** High migration risk if historical inconsistencies exist; do not add constraints before an audit/backfill.

**Validation/tests:** Cross-tenant insert rejection, delete/cascade behavior, migration on a copied production dataset, query-plan checks for tenant indexes.

### AUD-017 — Queue health covers only two processing queues and has no explicit DLQ workflow

| Field | Value |
| --- | --- |
| Severity | Medium |
| Confidence | Confirmed |
| Category | Observability, operations |
| Disposition | Fix soon |

**Locations and symbols:** `apps/gateway/src/maintenance/queue-health.ts:167-189`; `workers/failure.ts:22-31`; `constants.ts:14-69`; `index.ts:49-121`.

**Description and evidence:** Scheduled queue health checks monitor only inbound and AI-summary queues. Outbound email, Gmail sync, order review and maintenance queues can accumulate/stall without threshold alerts. Permanent failures are retained and logged, but there is no explicit dead-letter/replay state or ownership workflow. Public deep-health endpoints expose queue counts and worker PID/timestamps.

**Why it matters:** A silent outbound/Gmail backlog directly delays customer response, while log-only failures are easy to miss without guaranteed log-alert routing. Detailed public health data is a low-grade information leak.

**Recommended change and expected benefit:** Monitor all business-critical queues, alert by queue-specific SLO, expose liveness publicly but protect detailed diagnostics, and define a failed-job triage/replay procedure with stable idempotency. Confirm hosted log alerts in production evidence.

**Change risk:** Low; alert thresholds can be noisy and should be tuned.

**Validation/tests:** Synthetic stalled/failed/waiting jobs in every queue, alert suppression windows, protected diagnostics, safe replay of an idempotent fixture.

### AUD-018 — Security headers remain report-only and permit unsafe script modes

| Field | Value |
| --- | --- |
| Severity | Medium |
| Confidence | Confirmed |
| Category | Browser security hardening |
| Disposition | Fix later after telemetry |

**Locations and symbols:** `apps/dashboard/next.config.js:4-45`; `app/sentry-example-page/page.tsx`; `app/api/sentry-example-api/route.ts`.

**Description and evidence:** CSP is emitted as `Content-Security-Policy-Report-Only` and includes `'unsafe-inline'` and `'unsafe-eval'`. Other security headers are present. Sentry example routes are gated outside development unless explicitly enabled, so they are not an always-public production defect, but remain operational scaffolding.

**Why it matters:** Report-only CSP does not block an XSS payload. This is defense in depth; no exploitable XSS was confirmed.

**Recommended change and expected benefit:** Collect/report violations, remove `unsafe-eval` in production, migrate inline scripts/styles to nonces or hashes, then enforce CSP in staged mode. Keep or remove Sentry diagnostics based on an explicit runbook decision.

**Change risk:** Medium-high frontend breakage if enforcement precedes nonce compatibility.

**Validation/tests:** Production-like build with CSP violation collection, Clerk/Sentry/PostHog flows, OAuth redirects, Playwright coverage under enforced policy.

### AUD-019 — The installed Spectrum dependency carries moderate transitive advisories

| Field | Value |
| --- | --- |
| Severity | Medium |
| Confidence | Confirmed |
| Category | Dependencies, availability security |
| Disposition | Fix soon, staged |

**Locations and symbols:** `apps/gateway/package.json` (`spectrum-ts: ^4.2.0`); `package-lock.json`; `apps/gateway/src/clients/spectrum.ts`; Photon/iMessage routes.

**Description and evidence:** `npm audit` reports 11 moderate advisories rooted in an OpenTelemetry baggage unbounded-memory issue through `@photon-ai/otel` and `spectrum-ts`. The proposed automated fix is `spectrum-ts` 9.3.1, a semver-major upgrade. No high or critical advisory is present.

**Why it matters:** Crafted or excessive baggage propagation can cause availability pressure. A blind major upgrade could break iMessage webhook/send behavior.

**Recommended change and expected benefit:** Test a Spectrum 9.x upgrade on a branch with Photon signature, content-normalization, binding, send and webhook contract tests; inspect its migration notes; stage deployment and monitor. If upgrade cannot proceed, determine whether baggage can be disabled/limited in the current stack.

**Change risk:** Medium-high integration compatibility risk.

**Validation/tests:** Full iMessage unit/integration suite, real sandbox webhook/send, memory test with oversized baggage, rollback to locked prior package/lockfile.

### AUD-020 — Gateway read-tool classification duplicates and has drifted from the canonical registry

**Implementation status (2026-07-12): Resolved.** Gateway ledger/skip behavior
now uses the registry-derived `isReadToolName` predicate; the duplicated
`READ_TOOLS` set is removed and mixed-plan coverage includes the previously
omitted read tools.

| Field | Value |
| --- | --- |
| Severity | Medium |
| Confidence | Confirmed |
| Category | Redundancy, consistency, operator UX |
| Disposition | Quick win |

**Locations and symbols:** `apps/gateway/src/constants.ts:63` (`READ_TOOLS`); `routes/telegram/pending-plan-commands.ts:25-39`; `message-handlers/operator-ledger.ts:27-35`; canonical `packages/agent/src/tools/registry/index.ts:58-80`; `packages/agent/src/run-policy.ts:11-13`.

**Description and evidence:** Gateway hard-codes four read tools while the canonical registry also includes `search_shopify_products`, `search_shopify_customers`, `get_order_tracking`, and `get_support_stats`. “Skip N” and the operator ledger treat omitted read tools as actionable, so numbering/display can differ from actual executable actions. Agent core already derives `READ_TOOL_NAMES` from `TOOL_CATEGORIES`.

**Why it matters:** A merchant can skip the wrong displayed step or see harmless reads represented as actions. It is also a proven duplicate source of truth.

**Recommended change and expected benefit:** Export/use the canonical category predicate or `READ_TOOL_NAMES` in the gateway and add a registry completeness test. This is a low-risk consolidation that prevents future drift.

**Change risk:** Low; stored legacy/unknown tools should remain visibly non-read rather than silently ignored.

**Validation/tests:** Every registered read tool in ledger/skip numbering, unknown tool behavior, mixed read/action/communication plans.

## Low-priority findings

### AUD-021 — Compatibility vocabulary and documentation have drifted

| Field | Value |
| --- | --- |
| Severity | Low |
| Confidence | Confirmed |
| Category | Naming, configuration, documentation |
| Disposition | Fix later, no blind deletion |

**Locations and symbols:** `apps/gateway/src/constants.ts:9-31`; dashboard/gateway environment examples; `scripts/check-production-env.mjs`; root `README.md`; `apps/gateway/src/operator-context.ts:1-6`.

**Description and evidence:** WhatsApp-named queues now serve Telegram/operator behavior, `OUTBOUND_SEND_SWEEP` retains an email legacy string despite being channel-agnostic, `OperatorContext` comments still describe only Telegram, and `GATEWAY_PUBLIC_URL` remains a deprecated alias. README product-status statements lag implemented TikTok/iMessage/Gmail paths.

**Why it matters:** New engineers can misunderstand ownership and deployments; renaming live queue IDs without migration would be worse than the current naming.

**Recommended change and expected benefit:** Update comments/docs immediately where safe. Inventory deployed env use before removing aliases. Rename repeatable queue/job IDs only with an explicit remove-old/deploy-new migration and rollback plan.

**Change risk:** Low for docs; high for live queue renames.

**Validation/tests:** Production env inventory, Redis repeatable-job listing, deployment rehearsal, updated runbooks.

### AUD-022 — Several frontend/orchestration modules are large, but extraction should be evidence-led

| Field | Value |
| --- | --- |
| Severity | Low |
| Confidence | Moderate confidence |
| Category | Maintainability, architecture |
| Disposition | Later |

**Locations and symbols:** `apps/dashboard/src/app/(onboarding)/onboarding/_hooks/useOnboardingFlow.ts`; ticket `ConversationView.tsx`; orders `OrdersBoard.tsx`; ticket cache coordinator; `apps/dashboard/src/app/(marketing)/_components/Features.tsx`.

**Description and evidence:** Several components/hooks exceed roughly 350–550 lines and mix request orchestration, state transitions and presentation. Many neighboring ticket/KB modules have already been responsibly decomposed, and the demo/marketing film components are inherently visual. No broad runtime defect follows from size alone.

**Why it matters:** High-change modules become harder to reason about and test, but premature extraction would add indirection without reducing risk.

**Recommended change and expected benefit:** Refactor only when touching a module for behavior: extract pure state machines/request adapters first, preserve UI composition, and require focused tests. Do not initiate a standalone “small files” rewrite.

**Change risk:** Low-to-medium regression risk with little immediate product benefit.

**Validation/tests:** Preserve existing component/integration tests; add reducer/state-transition tests for extracted logic; visual smoke tests where presentation changes.

## Dead-code candidates

No file was proven dead enough to delete during the audit. Verified candidates requiring an owner/deployment check are:

| Candidate | Evidence | Recommendation |
| --- | --- | --- |
| Sentry example page/API | Only self-referenced; gated outside development by `SENTRY_EXAMPLE_PAGE_ENABLED` | Keep if part of monitoring runbook; otherwise remove page, API and flag together |
| Deprecated `GATEWAY_PUBLIC_URL` alias | Production checker emits a deprecation warning and has explicit tests | Query deployed env first; remove only in a later release |
| Legacy iMessage purge module | Clearly migration-oriented but still tested and referenced operationally | Verify production cleanup completion and runbook ownership |
| Legacy operator tool-call shape normalization | Reads old JSON representation from persisted `OperatorContext` | Count/migrate old rows before removal |
| Synchronous outbound email | Async path is feature-flagged and sync remains rollback compatibility | Remove only after async rollout and provider recovery behavior is proven |

Commented-out application code was not a material pattern. Direct production dependencies all had observable import/use sites; no direct dependency is recommended for deletion based only on static scanning.

## Redundant-code candidates

- Confirmed duplication: gateway `READ_TOOLS` versus agent registry (AUD-020).
- Host-adapter overlap: dashboard `lib/agent/tools/thread.ts` and gateway `agent-thread-sink.ts` repeat deterministic note/status/tag/escalation behavior. Consolidate only the provider-independent database operations; keep provider delivery as host-specific adapters.
- Email sync/async paths repeat some orchestration while sharing subject/header/provider utilities. Do not merge until the async rollout decision is final.
- Dashboard and gateway environment parsers repeat boolean/positive-integer parsing. A tiny shared config package is optional and lower value than keeping runtime-specific required-variable policy local.
- Gateway plan types and `agent-plan-adapter.ts` duplicate shape at a deliberate package boundary. Prefer importing a shared serialized contract over removing the boundary.

## Consistency problems

The material consistency issues are the tool-category drift (AUD-020), relational tenant IDs (AUD-016), role semantics (AUD-011), compatibility naming/docs (AUD-021), and mixed outbound-email state semantics (AUD-005). Additional low-risk observations:

- `/api/threads` casts `status` and `channelType` query values instead of validating them; invalid values can become database 500s. Return a typed 400 using the shared body/query validation conventions.
- Thread/message/action status fields are partly Prisma enums and partly free-form strings (`sendStatus`, `AgentAction.status/mode/category`). Shared runtime schemas exist but database constraints do not; migrate only after enumerating historical values.
- `null` is the persisted optional-state convention, while some API/TypeScript types use `undefined`. Current adapters generally normalize this correctly; document rather than mass-rewrite.

## Performance and cost opportunities

| Opportunity | Current impact | Recommendation |
| --- | --- | --- |
| Coalesce per-thread AI-summary jobs and reject stale writes | Meaningful now during burst messages; also a safety fix | AUD-002, first phase |
| Bound incremental intelligence prompts | Meaningful for long threads; cost grows per message | AUD-014 |
| Correct/default thread pagination | Correctness now, load reduction as data grows | AUD-013 |
| Bound attachment concurrency and body sizes | Availability/storage cost now for hostile/large email | AUD-009 |
| Shared Shopify rate limiting | Current per-process token bucket is adequate at small scale; replicas do not coordinate | Add provider response-aware distributed throttling only when 429/queue telemetry shows pressure |
| Cache Shopify/customer context | Context already stores `shopifyCustomerId` and fetches limited recent orders | Avoid premature caching; measure external-call latency/volume first |
| Product analytics inbound count | `captureInboundMessageProcessed()` counts all customer messages per event to determine first activation | Replace with an existence query or persisted activation marker if query telemetry shows cost; not urgent at present scale |

## Security and tenant-isolation findings

- High: relational checks missing at internal service boundaries (AUD-010).
- High, product-dependent: ordinary member versus admin permissions (AUD-011).
- High availability/file risk: global 50 MB parsing and unbounded attachment fan-out (AUD-009).
- Medium: database permits cross-tenant parent/tenant mismatches (AUD-016).
- Medium defense-in-depth: report-only CSP (AUD-018).
- No committed credentials were found. Integration access and refresh tokens are transparently encrypted in `packages/db/index.ts`; token fields are redacted from structured logs.
- Ordinary dashboard entity routes generally scope through the authenticated organization and use `assertEntityInOrg`. Dedicated cross-organization test suites are present.
- Webhook signature verification is present across supported providers. The major webhook defects are post-verification processing semantics, not missing signatures.

## Reliability findings

The dominant reliability issues are single-use execution (AUD-001), stale planning (AUD-002), mutation ambiguity (AUD-003), non-atomic caps (AUD-004), outbound email (AUD-005), claim/ack timing (AUD-006/007), Meta batch loss (AUD-008), timeouts (AUD-015), and incomplete queue monitoring (AUD-017).

Positive controls already present:

- Database-backed open-thread uniqueness with race recovery.
- Organization-scoped external-message uniqueness and duplicate insertion handling.
- BullMQ retry/backoff and failure retention.
- Shopify request timeout and domain normalization.
- Fail-closed agent locks for mutating turns when the configured Redis itself is unavailable.
- Billing write gates and sender-trust/spam-filter gates before automation.

## Testing gaps

The suite is broad and fast, but it is strongest at single-process/single-attempt behavior. Highest-value missing tests are:

1. Concurrent approval across dashboard and gateway Redis authorities.
2. Two-device/stale operator plan approval and all-device resolution.
3. In-flight old plan completing after a newer customer message.
4. Provider mutation commits then returns 500/times out; process crashes after provider acceptance.
5. Atomic daily-cap reservation under concurrent threads.
6. Duplicate outbound-email jobs and crash between send and `sent` update.
7. Stripe failure after event claim and out-of-order events.
8. Telegram/iMessage durable ack, retry and dedupe behavior.
9. Multi-entry/multi-event Meta payloads.
10. Internal org/thread/message/integration mismatch rejection.
11. Compound timestamp/ID pagination.
12. UI states for known failure, partial success and ambiguous external outcome.
13. Escalate a thread, then ingest a customer follow-up without splitting or hiding the active conversation.

Coverage percentage should not be the target; these concurrency/failure-injection cases reduce actual merchant and customer risk.

## Areas inspected and found acceptable

- Repository/package boundaries are enforced by structure checks and are mostly coherent.
- Canonical agent tool definitions include input parsers, categories, capability requirements, labels and deterministic policy metadata.
- Model-generated tool arguments are reparsed at execution; unknown/invalid tools fail rather than being passed through.
- Dashboard approval compares approved calls to the current reviewed plan, including serialized inputs.
- Sensitive auto-execution has sender-trust, billing, static-policy and business-hours gates.
- Inbound message and open-thread uniqueness are enforced in PostgreSQL, not only application code.
- OAuth state/cookies and provider webhook signatures use appropriate verification and timing-safe comparisons in the inspected paths.
- Integration secrets are encrypted at the database access layer, and no tracked environment files or production secrets were found.
- API error/body/rate-limit helpers are widely reused; most dashboard routes are thin enough and tenant-scoped.
- Email threading logic is centralized in `packages/email`; Gmail error classification/token refresh is more mature than a raw provider wrapper.
- Logging uses structured redaction, trace IDs in key gateway paths, failure counters and Sentry in the dashboard.
- Environment validation is unusually strong, including launch-contract tests and production scripts.
- Compatibility paths are documented in code; none should be deleted merely because its name is old.

## Open questions and uncertainties

1. Are all `org:member` users intended to be trusted co-owners, or should integrations, billing and automation policy be admin-only?
2. Are dashboard Upstash and gateway Redis guaranteed to be distinct in every production environment, as the documented architecture says? If any deployment shares them, AUD-001 remains because multi-device stale approvals and TTL expiry still exist.
3. Has any duplicate refund/email/customer reply incident occurred? Production provider IDs and logs would help prioritize reconciliation/backfill.
4. Which Shopify operations expose provider-supported idempotency keys or safe lookup/reconciliation identifiers in the exact API versions/scopes used?
5. Does the outbound email provider supply a stable idempotency mechanism, or must reconciliation rely on a generated `Message-ID` and provider search/logs?
6. Is `OUTBOUND_EMAIL_ASYNC` enabled for all tenants/environments, and what is the intended date for removing the sync fallback?
7. Are there historical tenant-parent mismatches in production tables? Read-only consistency queries are required before AUD-016 migrations.
8. Are old operator-context tool-call shapes or legacy iMessage rows still present?
9. Is the Sentry example route part of an operational verification runbook?
10. Are gateway structured `opsAlert` logs connected to paging, or merely retained?
11. What customer attachment sizes/types are part of the supported product contract?
12. Clerk-authenticated Playwright tests and live provider sandbox tests were not run; those remain release-validation inputs.
13. Is `pending` intended to remain an active inbox state awaiting the merchant, or intentionally parked outside the main inbox? No separate pending surface was found.
