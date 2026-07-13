# Codebase Inventory

Audit snapshot: 2026-07-10; implementation status refreshed 2026-07-12. This inventory describes the repository as inspected, including the existing uncommitted worktree changes. It is a static/runtime-test inventory, not a statement about currently deployed environment values or provider configuration.

## System at a glance

Shopkeeper is an npm/Turborepo monorepo with two deployed applications and four shared packages:

| Area | Location | Runtime | Primary responsibility |
| --- | --- | --- | --- |
| Dashboard | `apps/dashboard` | Next.js 16 / React 19, typically Vercel | Merchant UI, Clerk-authenticated APIs, OAuth callbacks, customer-channel dispatch, billing, agent review and approval |
| Gateway | `apps/gateway` | Express, BullMQ workers, typically Railway | Provider webhooks, durable queues, background jobs, operator Telegram/iMessage channels, plan precomputation and notifications |
| Agent core | `packages/agent` | Shared TypeScript library | Context assembly, prompts, planning, tool schemas and policy, plan cache, execution, Shopify domain clients, audit records |
| Database | `packages/db` | Prisma/PostgreSQL | Schema, migrations, encrypted integration-token access, shared message writes, spend counters |
| Email | `packages/email` | Shared TypeScript library | Gmail OAuth/API/MIME handling, Postmark/Gmail senders, threading headers and error types |
| Analytics | `packages/analytics` | Shared TypeScript library | Product-event contracts, sanitization, PostHog delivery, stable insert IDs |

The product is channel-first rather than email-first. Customer conversations currently enter through Instagram, TikTok Shop, email, and Shopify events; provider dispatch also contains iMessage support for existing thread shapes. Merchant/operator interaction is implemented through the dashboard, Telegram, and Photon/Spectrum iMessage. `sms_agent` is the active persisted channel/discriminator for durable Telegram/iMessage operator threads; WhatsApp-named queue constants remain compatibility vocabulary, not a conventional shared-inbox architecture.

## Major directories

| Directory | Contents |
| --- | --- |
| `apps/dashboard/src/app` | App Router pages, layouts, loading/error states, marketing pages, and API routes |
| `apps/dashboard/src/app/dashboard` | Merchant shell: tickets, orders, review, knowledge/memory, integrations, settings, onboarding/help |
| `apps/dashboard/src/lib/agent` | Dashboard host adapters for agent execution, plan approval, thread tools, autonomy shadow mode |
| `apps/dashboard/src/lib/messaging` | Provider dispatch, async email handoff, thread filtering/query helpers, delivery failure recording |
| `apps/dashboard/src/lib/api` | Route wrappers, body parsing, typed API errors, internal-secret authentication |
| `apps/dashboard/src/lib/server` | Organization resolution, Redis, rate limits, logging, home summaries, analytics, observability |
| `apps/dashboard/src/hooks` and ticket `_hooks` | SWR fetching, pagination, realtime invalidation, composer and agent-review state |
| `apps/gateway/src/routes` | Provider webhook routes, internal routes, Telegram and iMessage operator routing |
| `apps/gateway/src/message-handlers` | Inbound persistence, classification, planning, execution, operator context, outbound email |
| `apps/gateway/src/workers` | BullMQ workers for inbound, AI summary, order review, Gmail sync, outbound email |
| `apps/gateway/src/maintenance` | Scheduled retention, token health, digests, queue health, Gmail watch, risk, voice, stale-send sweep |
| `apps/gateway/src/clients` | Redis/queue clients, Spectrum, Meta, Telegram, TikTok, Clerk approver, locks |
| `packages/agent/src/tools` | Tool registry, parsers, deterministic policy checks, executor, Shopify-backed operations |
| `packages/agent/src/shopify` | Normalized Shopify REST/GraphQL requests and order/customer/refund/return operations |
| `packages/db/prisma` | Current Prisma schema and 50 ordered SQL/Prisma migrations |
| `e2e` | Playwright auth-bypass, core workflow, onboarding, webhook and risk smoke tests |
| `scripts` | Test bootstrap, environment verification, production verification, backfills, Gmail setup, demo-film tooling |
| `docs` | Architecture notes, runbooks, production evidence and audit deliverables |

## Runtime entry points

### Dashboard

- Next.js App Router root: `apps/dashboard/src/app`.
- Request access policy/proxy: `apps/dashboard/src/proxy.ts` and `apps/dashboard/src/lib/server/path-access-policy.ts`.
- Server and client instrumentation: `apps/dashboard/src/instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, and `sentry.edge.config.ts`.
- Authenticated route boundary: `apps/dashboard/src/lib/api/route.ts` calls `getOrCreateOrg()` and provides the database organization to handlers.
- Clerk-role boundary for explicitly administrative operations: `apps/dashboard/src/lib/api/clerk-route.ts`.
- Internal service boundary: `apps/dashboard/src/lib/api/internal-route.ts`, authenticated by rotating `INTERNAL_API_SECRET` values.

### Gateway

- Process launcher: `apps/gateway/src/start.ts` / `bootstrap.ts`, controlled by `GATEWAY_RUNTIME_ROLE`.
- HTTP server: `apps/gateway/src/index.ts`.
- Worker process: `apps/gateway/src/worker.ts` and `apps/gateway/src/workers/core.ts`.
- Webhook router: `apps/gateway/src/routes/webhooks.ts`.
- Queue factories: `apps/gateway/src/clients/gateway-queues.ts`.
- Maintenance registration: `apps/gateway/src/maintenance/workers.ts` and `registration.ts`.

## Primary runtime flows

### Customer inbound flow

1. A signed/authenticated provider route under `apps/gateway/src/routes/webhooks-*.ts` resolves an organization and queues a provider event.
2. `apps/gateway/src/workers/inbound.ts` dispatches to the channel handler in `message-handlers/channels.ts`.
3. `processInboundMessage()` in `message-handlers/inbound-persistence.ts` normalizes input, deduplicates by organization/provider message ID, upserts the customer, obtains the open channel thread, writes the message, clears the cached plan, and queues AI summary work.
4. `processAiSummaryJob()` in `message-handlers/ai-summary-flow.ts` runs classification/intelligence and plan precomputation, potentially in parallel.
5. The plan is cached on `Thread.cachedPlan`, auto-executed when policy permits, or sent to operator bindings for approval/question handling.

### Dashboard plan and action flow

1. Ticket UI requests `/api/agent/plan` or consumes a precomputed cached plan.
2. `packages/agent/src/context.ts` gathers tenant-scoped thread, organization, customer, recent messages, Shopify context, past tickets, and knowledge articles.
3. `packages/agent/src/planner.ts` and `planner-routing.ts` call Anthropic, validate tool inputs, execute read tools, and construct an `AgentPlan`.
4. `/api/agent` verifies that the submitted tool-call IDs, names, and serialized inputs are a subset of the current cached plan.
5. `executeAgentTurn()` obtains a thread lock and calls the agent runtime with the approved calls.
6. `packages/agent/src/tools/executor.ts` independently parses arguments and enforces deterministic static/daily-spend policy before calling the registered tool.
7. Host thread sinks send customer messages or update thread state; `AgentAction` rows and serialized audit notes are written after execution.

### Telegram/iMessage operator flow

1. Telegram secret-token validation or Spectrum signature validation resolves a bound merchant device.
2. `operator-message.ts` and channel handlers load the per-device `OperatorContext` ledger.
3. A free-form merchant message runs an operator agent with control tools, or an approval command directly executes stored `pendingPlan.rawToolCalls`.
4. Notifications are fanned out by `planning-notifications.ts` to all bound Telegram/iMessage devices and park pending state in each device context.

### Outbound customer flow

- `send_reply` routes through the originating thread channel using the dashboard thread sink and `lib/messaging/dispatch-message.ts`.
- Instagram/TikTok/iMessage use their channel adapters.
- Email can use the synchronous compatibility path or, when `OUTBOUND_EMAIL_ASYNC=true`, pre-create a pending `Message`, make an internal HTTP hop to the gateway, and send through the `outbound-email` BullMQ worker.
- `send_email` can start a new email thread; it uses the same provider/threading helpers.

## Database entities

Current entities in `packages/db/prisma/schema.prisma`:

| Entity | Ownership and responsibility |
| --- | --- |
| `Organization` | Tenant root, Clerk mapping, settings, Stripe state, voice proposal |
| `Integration` | Tenant provider connection, encrypted access/refresh tokens, provider metadata |
| `Customer` | Tenant-local customer identity keyed by `(organizationId, platformId)` |
| `Thread` | Channel conversation, customer link, status/filter state, cached agent plan and Shopify link |
| `Message` | Conversation/note record, provider ID, attachments, outbound delivery state |
| `OperatorContext` | Per-organization/per-device pending plan, digest, or question |
| `OrgMember` | Tenant/Clerk user bridge |
| `OrgMemberTelegramChat` | Globally unique Telegram chat binding to an organization member |
| `OrgMemberImessageBinding` | Globally unique merchant sender binding and Spectrum space |
| `OrgMemberBindToken` | Expiring, single-use operator-channel bind token |
| `KnowledgeBase`, `KbArticle`, `KbCitation` | Tenant knowledge corpus and usage trail |
| `AgentAction` | Per-tool execution audit with mode, status, approval hashes and duration; optionally linked to a durable plan execution |
| `PlanExecution` | Stable plan identity, source message/hashes, shadow observations, atomic claim token/state and terminal execution outcome |
| `AutonomyShadowDecision` | Per-plan shadow/canary decision and later human outcome |
| `LlmDailySpend` | Per-tenant/day/model cost backstop |
| `RefundDailySpend` | Per-tenant/day goodwill/refund total |
| `VoiceEdit` | Append-like corpus of merchant edits used for brand-voice proposals |

Important raw-SQL invariants not expressible in the Prisma schema are present in migrations:

- One open thread per `(organization_id, customer_id, channel_type)` in `20260405000000_add_idempotency_and_thread_uniqueness`.
- Organization-scoped uniqueness of non-null provider message IDs in `20260607000000_scope_message_idempotency_by_org`.

## API routes

### Agent and AI

- `/api/agent`, `/api/agent/plan`, `/api/agent/quick-approve`, `/api/agent/ask`, `/api/agent/chat`, `/api/agent/answer`, `/api/agent/voice`
- `/api/agent/actions`, `/api/agent/actions/feedback`, `/api/agent/autonomy-readiness`
- `/api/agent/sessions`, `/api/agent/sessions/[id]`
- `/api/agent/io-send-internal` (internal secret)
- `/api/ai/summary`, `/api/home-summary`

### Conversations, customers and search

- `/api/threads`, `/api/threads/[id]`, `/api/threads/[id]/presence`, `/api/threads/bulk`
- `/api/threads/customer/[customerId]`, `/api/threads/shopify`
- `/api/messages`, `/api/messages/internal`, `/api/messages/retry`, `/api/messages/auto-ack`
- `/api/search`, `/api/attachments`

### Shopify and orders

- `/api/orders`, `/api/orders/attention`
- `/api/shopify/customer`, `/api/shopify/customers`, `/api/shopify/customers/search`

### Knowledge

- `/api/kb`, `/api/kb/[id]`, `/api/kb/context`
- `/api/kb/bases`, `/api/kb/bases/[id]`, `/api/kb/bases/[id]/articles`

### Integrations

- `/api/integrations`, `/api/integrations/[id]`
- Instagram: `/auth`, `/callback`, `/connect`
- Shopify: `/auth`, `/callback`, `/kb-sync`, `/simulate`
- Gmail: `/auth`, `/callback`
- TikTok Shop: `/auth`, `/callback`
- Telegram configuration and iMessage binding routes

### Tenant, billing and operational

- `/api/org`, `/api/org/data`, `/api/org/gdpr-export`, `/api/team`
- `/api/billing`, `/api/billing/checkout`, `/api/billing/portal`, `/api/billing/webhook`
- `/api/realtime/token`, `/api/product-events`, `/api/health`
- Dashboard-side webhook compatibility routes for Clerk, email, Meta and TikTok Shop
- Feature-gated Sentry diagnostics: `/sentry-example-page` and `/api/sentry-example-api`

### Gateway HTTP routes

- Provider webhooks: `/webhooks/meta`, `/webhooks/email/inbound`, `/webhooks/gmail/push`, `/webhooks/shopify`, `/webhooks/tiktok-shop`, `/webhooks/telegram`, `/webhooks/photon`
- Internal service routes under `/internal`: operator execution, outbound-email enqueue and failed-job removal
- Realtime: `/events` when enabled
- Health: `/`, `/health/deep`, `/health/queues`

## Queues and background jobs

Defined in `apps/gateway/src/constants.ts` and registered by worker/maintenance modules:

| Queue | Jobs / purpose |
| --- | --- |
| `inbound-messages` | Instagram DM, TikTok Shop message, email, Shopify order event ingestion |
| `ai-summary` | Classification, title/summary/tag refresh, plan precomputation, auto-execution/operator notification |
| `outbound-email` | Asynchronous customer email sends with BullMQ retry |
| `gmail-sync` | Gmail history/mailbox synchronization |
| `order-review` | Per-order AI risk review |
| `order-risk-monitor` | Hourly order-risk scan, feature-gated |
| `token-health`, `email-token-health` | Provider credential health checks |
| `gmail-watch-maintenance` | Refresh Gmail `users.watch` registrations |
| `thread-archival`, `purge` | Archive old resolved threads and purge aged soft-deleted/filtered data |
| `whatsapp-digest` | Merchant digest; legacy queue name currently serves Telegram/operator delivery |
| `voice-synthesis` | Daily proposal generation from merchant voice edits |
| `queue-health` | Five-minute queue diagnostics/alerts |
| `outbound-email-sweep` | Channel-agnostic recovery sweep for stale pending email/iMessage sends; legacy string retained |

Processing queues default to three attempts, exponential five-second backoff, one-day completed retention, and seven-day failed retention. Maintenance scheduling is intended to be owned by one deployed instance via `GATEWAY_ENABLE_MAINTENANCE_WORKERS`.

## External integrations

| Integration | Main implementation |
| --- | --- |
| Shopify Admin REST/GraphQL and OAuth/webhooks | `packages/agent/src/shopify`, dashboard integration routes, gateway Shopify webhook |
| Instagram/Meta OAuth, Graph API and signed webhooks | dashboard Instagram routes, `apps/gateway/src/routes/webhooks-meta.ts`, `clients/meta-graph.ts` |
| TikTok Shop OAuth, webhooks and messaging | dashboard TikTok routes, gateway TikTok client/route, feature flag |
| Email/Postmark | `packages/email`, dashboard dispatch, gateway inbound and outbound worker |
| Gmail OAuth, API, Pub/Sub and sync | `packages/email/src/gmail`, dashboard OAuth, gateway Gmail webhook/worker/maintenance |
| Telegram merchant channel | gateway Telegram routes/client/bindings |
| Photon Spectrum/iMessage merchant and customer transport | gateway Spectrum client, Photon webhook and iMessage bindings |
| Clerk | dashboard authentication/organizations/team, gateway approver lookup, signed webhook |
| Stripe | dashboard checkout, portal, subscription state and signed webhook |
| Anthropic | agent planning/execution, classification, order review and voice synthesis |
| PostHog | `packages/analytics` server-side product analytics |
| Sentry | dashboard request/client/server error reporting |
| Redis | Dedicated TCP Redis for BullMQ/gateway coordination; Upstash REST for dashboard rate limits/cache/locks |
| Vercel Blob | inbound/customer attachments and demo assets |
| USPS | optional tracking enrichment |

## Agent tools

The canonical registry is `packages/agent/src/tools/registry/index.ts`; each tool owns its schema, category, capability requirements, labels and executor.

- Read: `search_kb`, `search_shopify_products`, `search_shopify_customers`, `get_shopify_customer`, `get_shopify_orders`, `get_order_by_name`, `get_order_tracking`, `get_support_stats`.
- Customer/order mutations: `update_shopify_customer_info`, `add_shopify_customer_note`, `update_shopify_order_address`, `create_refund`, `cancel_order`, `create_shopify_order`, `edit_shopify_order`, `issue_discount`, `create_return`, `create_exchange`, `issue_store_credit`, `create_gift_card`, `attach_return_label`.
- Customer communication: `send_reply`, `send_email`.
- Internal/escalation: `add_internal_note`, `update_thread_status`, `update_thread_tag`, `escalate_to_human`, `ask_operator`.
- Operator-only module tools: `approve_pending_plan`, `reject_pending_plan`, `revise_pending_plan`, `answer_operator_question`.
- Order-review module tool: `flag_order`.

## Shared utilities and boundaries

- Tenant thread authorization: `packages/agent/src/thread-auth.ts` and dashboard `withOrgRoute`/`assertEntityInOrg`.
- Agent action safety: registry parsers, `tools/static-policy.ts`, `plan-preview.ts`, `sender-trust.ts`, billing gates and lock providers.
- Shared email semantics: `packages/email/src/reply.ts`, provider/sender factories and typed errors.
- Token encryption: the Prisma extension in `packages/db/index.ts` transparently encrypts/decrypts `Integration.accessToken` and `refreshToken`.
- Logging/redaction: dashboard and gateway Pino loggers plus `packages/agent/src/observability/redaction.ts`.
- Realtime: gateway Redis publish/SSE and dashboard SWR invalidation.

## Environment variables

Canonical examples are `apps/dashboard/.env.example` and `apps/gateway/.env.example`; production validation also lives in `scripts/check-production-env.mjs`, dashboard `lib/env`, and gateway `config/env.ts` / `runtime-config.ts`.

| Group | Variables |
| --- | --- |
| Core/database | `NODE_ENV`, `DATABASE_URL`, `DIRECT_DATABASE_URL`, `NEON_SERVERLESS_HTTP`, `APP_URL`, `NEXT_PUBLIC_APP_URL`, `DASHBOARD_URL`, `DASHBOARD_INTERNAL_URL`, `GATEWAY_INTERNAL_URL`, deprecated `GATEWAY_PUBLIC_URL`, `PORT` |
| Authentication/secrets | `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SECRET`, `INTERNAL_API_SECRET`, `INTERNAL_API_SECRET_PREV`, `TOKEN_ENCRYPTION_KEY` |
| Redis/workers | `REDIS_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `GATEWAY_RUNTIME_ROLE`, `GATEWAY_ENABLE_MAINTENANCE_WORKERS`, BullMQ drain/stalled/heartbeat tuning variables |
| AI/analytics/observability | `ANTHROPIC_API_KEY`, `PRODUCT_ANALYTICS_ENABLED`, `POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST`, Sentry DSN/environment/auth/upload variables, `LOG_LEVEL`, `LOG_PRETTY` |
| Email/Gmail | `POSTMARK_API_KEY`, inbound Postmark credentials, `INBOUND_EMAIL_DOMAIN`, `EMAIL_INBOUND_MODE`, `GMAIL_NATIVE_INBOUND`, Google OAuth and Pub/Sub variables, optional Microsoft OAuth variables |
| Social/messaging | Meta app/config/verification variables, Telegram bot/secret variables, Spectrum project/webhook variables, `IMESSAGE_LINE_HANDLE`, TikTok Shop credentials/endpoints/signature variables |
| Shopify/shipping | Shopify client/app secret variables, `SHOPIFY_ONBOARDING_SIMULATOR_ENABLED`, USPS credentials |
| Billing/storage | Stripe secret/webhook/price variables, `BLOB_READ_WRITE_TOKEN`, `LANDING_BLOB_TOKEN` |
| Alerts/tuning | `OPS_ALERTS_ENABLED`, alert thresholds/windows, queue thresholds, provider/agent/webhook thresholds |
| Test/evaluation | `E2E_*`, `EVAL_*`, `RUN_JUDGE_EVALS`, `UPDATE_EVAL_BASELINE`, verification and demo-film variables |

Notable rollout flags:

- `OUTBOUND_EMAIL_ASYNC`
- `GMAIL_NATIVE_INBOUND`
- `TIKTOK_SHOP_ENABLED`
- `ORDER_RISK_MONITOR_ENABLED`
- `GATEWAY_REALTIME_ENABLED` / `NEXT_PUBLIC_GATEWAY_EVENTS_URL`
- `PRODUCT_ANALYTICS_ENABLED`
- `SHOPIFY_ONBOARDING_SIMULATOR_ENABLED`
- `SENTRY_EXAMPLE_PAGE_ENABLED`
- `GATEWAY_ENABLE_MAINTENANCE_WORKERS`

## Tests and quality gates

- Unit tests are colocated as `*.unit.test.*` or package-specific test files and run through Vitest/Turbo.
- Database-backed integration tests cover dashboard, gateway and agent behavior using `docker-compose.test.yml` services.
- Playwright smoke tests cover auth bypass, manual reply/plan approval, onboarding, KB mutation, billing gating, email/Instagram ingestion and spam filtering.
- Browser-with-Clerk tests use `playwright.browser.config.ts` and require external test credentials; they were not run during this audit.
- Agent evaluations and fixtures live under `packages/agent` and scripts, with optional judge runs.
- Structure checks enforce package boundaries and test-config separation.

Audit baseline results were 1,032 unit and 806 integration tests. Current 2026-07-12 verification is 1,040 unit, 29 Node script, 816 integration, and 8 Playwright smoke tests; lint and type-checking pass. `npm audit` reports 11 moderate transitive OpenTelemetry advisories through `spectrum-ts`; no high or critical advisory was reported.

## Deployment and operations

- `vercel.json`: dashboard deployment configuration.
- `railway.json` and `nixpacks.toml`: gateway deployment/build configuration.
- `turbo.json`: package task graph and environment pass-through.
- `docker-compose.test.yml`: local PostgreSQL/Redis integration-test services.
- `scripts/check-production-env.mjs`, `verify-production.mjs`, and `verify-production-alerts.mjs`: production launch and alert verification.
- Runbooks under `docs/production` and channel-specific documentation cover provider setup and maintenance.

## Suspected deprecated or compatibility modules

These are candidates for verification, not deletion recommendations:

- `apps/dashboard/src/app/sentry-example-page` and `api/sentry-example-api`: diagnostic scaffolding, correctly gated outside development; remove only if the operational Sentry test is no longer used.
- `GATEWAY_PUBLIC_URL`: explicitly deprecated alias still accepted and tested by production checks; inspect deployed environments before removal.
- WhatsApp-named digest queue/job constants and the email-named outbound sweep constant: intentionally retained to avoid orphaning live BullMQ repeatable jobs.
- `apps/gateway/src/maintenance/purge-legacy-imessage.ts`: legacy-data cleanup, still referenced by tests/runbooks; verify production migration completion before retiring.
- Operator-context legacy tool-call normalization in `apps/gateway/src/operator-context.ts`: supports stored rows written in the prior shape; retire only after a data migration proves no old rows remain.
- Synchronous outbound-email path: compatibility/rollback path behind `OUTBOUND_EMAIL_ASYNC`, not dead until rollout is complete.
