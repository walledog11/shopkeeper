# Shopkeeper — AI operating layer for solo & small e-commerce businesses

**Vision:** a general-purpose AI agent that runs the operational work of a small Shopify business and is reachable from wherever the merchant is (Telegram now; iMessage and WhatsApp next; the dashboard is one surface, not *the* surface). Over time the same agent core (memory, approval/autonomy, multi-channel interaction, tool use) extends across workflow modules: support → order operations → inventory & supplier → marketing → finance.

**V1 wedge = customer support.** Only the support module is built today. The architecture assumes more modules will share one *general-purpose* core, not a support-coupled one — support remains the V1 focus and the thing that must ship. Solo merchants and small teams. Multi-channel support inbox + AI agent that reads/writes Shopify directly.

**Product principles** (the rubric for agent work):
1. The agent should feel like an employee, not a chatbot — real memory, judgment, brand-voice consistency, and the honesty to say "you handle this" instead of hallucinating confidence.
2. The merchant interacts from wherever they are (mobile, messaging), not just the dashboard.
3. Trust is binary — one bad refund undoes months of goodwill. Bias toward escalation over confident wrong action; failure modes matter more than success modes.
4. Every workflow module shares one general-purpose agent core. The core must not couple to support specifically.

**Direction & roadmap:** `docs/core-extraction-and-module-expansion-plan.md` (agent-core extraction into a shared package, durable gateway-worker runtime, module #2 order-ops). Read it before assuming the support-only framing when touching agent architecture. The agent core now lives in `packages/agent/` (`@shopkeeper/agent`) and is consumed by both apps (extraction Track 2 complete); the remaining roadmap direction is moving more execution into the gateway worker.

## Stack
- `apps/dashboard/` — Next.js 15 (app router), Tailwind, SWR, Clerk.com auth → Vercel
- `apps/gateway/` — Express + BullMQ worker → Railway
- `packages/db/` — Prisma + Neon Postgres, exported as `@shopkeeper/db`
- Redis: `@upstash/redis` (REST) in dashboard; `ioredis` (`REDIS_URL`) in gateway — **separate instances** (gateway needs a dedicated per-instance Redis for BullMQ, not Upstash). Daily LLM spend cap is shared across both apps via Postgres (`llm_daily_spend`), not Redis.
- AI: Anthropic SDK (agent, plan, summary); OpenAI (embeddings)
- Multi-tenant: every DB query is scoped by `organizationId`. `getOrCreateOrg()` maps Clerk org → DB `Organization`.
- Ops alerts emit structured Pino logs (`opsAlert: true`) when thresholds are crossed; no external error-tracking vendor.

## Inbound flow
External webhook → `apps/gateway/src/routes/webhooks.ts` (HMAC verify, enqueue BullMQ) → `apps/gateway/src/message-handlers/` (upsert customer/thread/message, sanitize prompt-injection, dedupe by `externalMessageId`, enqueue summary) → Claude tags + 1-sentence summary → gateway generates the agent plan in-process (`@shopkeeper/agent` planner, `message-handlers/generate-thread-plan.ts`) and caches it on the thread → Telegram notify bound org members. Dashboard polls `/api/threads?status=open` via SWR every 3s.

## Database (`packages/db/prisma/schema.prisma`)
- `Organization` — Stripe subscription fields + `settings` JSON (agent config)
- `Integration` — per platform per org (access token, expiry)
- `Customer` — unique `(organizationId, platformId)`; `platformId` = email / IG sender ID / phone
- `Thread` — `channelType`, `status` (open/pending/closed), `aiSummary`, `tag`, `shopifyCustomerId`, `cachedPlan`, soft-delete + archive
- `Message` — `senderType`: customer/agent/ai/note. Agent turn transcripts in threads are `note` rows prefixed `__shopkeeper_agent__`; the audit trail is `AgentAction`, not note-row parsing.
- `AgentAction` — first-class audit record per agent tool call (tool, category, status, mode, approver); backs `/api/agent/actions` and the Review page
- `AutonomyShadowDecision` — per-plan shadow record while `autoExecuteMode: "shadow"`: what the agent would have auto-executed vs. what the human decided
- `OperatorContext` — Telegram operator state per (org, chatId): history, pendingPlan, pendingDigest, lastOrderNumber. **DB-backed, not Redis.**
- `OrgMember` — extends Clerk org membership; Telegram chats bound via `OrgMemberTelegramChat`
- `KnowledgeBase` (`source: "user" | "shopify"`) / `KbArticle` (tagged for context filtering) / `KbCitation` (per-thread article citation events)
- `VoiceEdit` — merchant edits to AI drafts, consumed by gateway voice synthesis to refine the brand-voice brief

## Channels
Email (Postmark), Instagram DM (Meta OAuth), Telegram (operator-only, single Shopkeeper bot), iMessage (operator-only, single platform-wide Photon Spectrum line for all orgs — no per-org credentials; merchants link a handle by texting a single-use code, routed by the sender→member binding), Shopify (OAuth + webhooks). TikTok: stubs only.

Internal-only `channelType` values (not user-facing): `dashboard_agent` (Concierge sessions), `sms_agent` (operator threads via Telegram — legacy name).

## Agent core (`packages/agent/`, imported as `@shopkeeper/agent/*`)
Canonical location for all agent logic; both apps import it via subpath exports.
- `context.ts` — `buildContext()` (loads thread, customer, recent messages, KB, recent orders)
- `planner.ts` — `planAgent()` (generates plan with no side effects, caches in `Thread.cachedPlan`)
- `run.ts` — `runAgent()` (executes approved plan or runs an instruction end-to-end)
- `prompt.ts` — system prompt builder
- `intent.ts` — operator-channel intent classification + tool subset selection
- `order-status-fast-path.ts` — bypasses LLM for "where is X's order?" in operator channels
- `plan-preview.ts` — classifies plans as `quick_reply` vs `needs_review` for the dashboard home
- `tools/registry/` — all tool definitions (Anthropic format), `TOOL_CATEGORIES`, `PLAN_STEP_LABELS`, `TOOL_LABELS`, input types
- `tools/executor.ts` — tool dispatch + policy enforcement (`maxRefundAmount`, `blockCancellations`, etc.)
- `shopify/*.ts` — Shopify API implementations
- `settings.ts` — defaults + resolver. Settings live in `Organization.settings` JSON.
- `thread-auth.ts`, `plan-cache.ts`, `plan-cache-shape.ts`, `turns.ts`, `turn.ts`, `plan-execution.ts` — route-facing helpers

### Dashboard host adapters (`apps/dashboard/src/lib/agent/`)
Not a copy of the core — these inject dashboard infrastructure into it:
- `context.ts` / `run.ts` — wrap core `buildContext`/`runAgent` with the thread I/O sink and ops-alert recorder
- `tools/thread.ts` — the actual thread I/O sink (send reply/email, escalate)
- `runner.ts` — barrel composing core + wrapper exports
- `api/*` — Next.js route glue (validation, sessions, action-log, dashboard approval, turn seams)
- `__evals__/` — agent eval harness, wired to `test:evals` / `test:evals:baseline`

Modes:
- **Support** — ticket threads. Auto-plan on open if last message is from the customer; plan cached in `Thread.cachedPlan`. `ActionPlanCard` → approve → `POST /api/agent`. Manual invoke via `@{agentName}` in Internal tab.
- **Operator** — `/dashboard/agent` (Concierge: each session opens a new `dashboard_agent` thread and closes the previous), and Telegram via `sms_agent`.
- **Composer-ask** — read-only Q&A inside the support composer (`POST /api/agent/ask`). Calls `runAgent(..., { readOnly: true })`, which filters tools to `read` category and never mutates anything.

Read tool list and exact behavior from `packages/agent/src/tools/registry/` — do not infer.

`Organization.settings` keys: `agentName`, `aiContext`, `brandVoice`, `autoPlanOnOpen`, `defaultInstruction`, `requireApprovalForActions`, `autonomyTier` (watch/guarded/trusted/broad/full), `autoExecuteMode` (off/shadow/live; legacy boolean `autoExecuteEnabled` is migrated), `toolsEnabled` (action/communication/internal/read), `maxRefundAmount`, `blockCancellations`, `blockCustomLineItems`, `maxIterations` (default 10), `replyLanguage`.

## Key API routes (`apps/dashboard/src/app/api/`)
- `agent/route.ts` — execute run on a ticket
- `agent/plan/route.ts` — generate plan, no side effects
- `agent/internal/route.ts` — gateway-only agent run (e.g. `sms_agent` from Telegram), requires `INTERNAL_API_SECRET`
- `agent/io-send-internal/route.ts` — gateway-only provider send hop (send_reply/send_email delivery), requires `INTERNAL_API_SECRET`
- `agent/chat/route.ts` — Concierge sessions
- `agent/sessions/route.ts`, `agent/sessions/[id]/route.ts` — Concierge session list/detail
- `agent/ask/route.ts` — composer read-only Q&A (`runAgent` with `readOnly: true`)
- `agent/quick-approve/route.ts` — one-tap approval of a cached plan
- `agent/actions/route.ts` — agent action audit log feed
- `messages/route.ts` — outbound dispatch
- `threads/route.ts`, `threads/shopify/route.ts` (create thread from Shopify customer)
- `integrations/shopify/{auth,callback}/route.ts`
- `billing/route.ts`, `billing/webhook/route.ts`

## Other entry points
- `apps/gateway/src/start.ts` — gateway process bootstrap (role-aware: `server`, `worker`, or both)
- `apps/gateway/src/worker.ts` — BullMQ worker entrypoint
- `apps/gateway/src/maintenance/workers.ts` — daily IG token health + refresh, 90-day archive + purge, queue health monitor
- `apps/gateway/src/health.ts` — `/health` and `/health/queues` diagnostic endpoints
- `apps/dashboard/src/lib/redis.ts` — Upstash REST client + rate limiting
- `apps/dashboard/src/instrumentation.ts` — env validation on server boot

## Dashboard routes
`/dashboard/{tickets, agent, kb, orders, customers, review, team, integrations, settings}`

## Env (names only — values in Vercel/Railway; see each app's `.env.example` for the full list)
**Dashboard:** `DATABASE_URL`, `DIRECT_DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `INTERNAL_API_SECRET`, `POSTMARK_API_KEY`, `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`, `APP_URL`, `NEXT_PUBLIC_APP_URL`, `INBOUND_EMAIL_DOMAIN`, `GATEWAY_INTERNAL_URL`, `SHOPIFY_APP_SECRET`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PRICE_ID`, `PRICE_ID_STARTER`, `PRICE_ID_PRO`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `TELEGRAM_BOT_USERNAME`, `IMESSAGE_LINE_HANDLE` (fixed iMessage handle merchants text; presence makes iMessage available), `TOKEN_ENCRYPTION_KEY`, `BLOB_READ_WRITE_TOKEN`, `GOOGLE_CLIENT_ID`/`SECRET` + `MICROSOFT_CLIENT_ID`/`SECRET` (email OAuth), `USPS_CLIENT_ID`/`SECRET` (tracking)

**Gateway:** `DATABASE_URL`, `DIRECT_DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`, `INTERNAL_API_SECRET`, `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `SPECTRUM_PROJECT_ID`/`SPECTRUM_PROJECT_SECRET`/`SPECTRUM_WEBHOOK_SECRET` (platform iMessage line), `SHOPIFY_APP_SECRET`, `DASHBOARD_URL`, `DASHBOARD_INTERNAL_URL`, `BLOB_READ_WRITE_TOKEN`, `TOKEN_ENCRYPTION_KEY`, `POSTMARK_INBOUND_USERNAME`/`PASSWORD`, `GATEWAY_RUNTIME_ROLE`, plus tuning vars (`LOG_LEVEL`, `LOG_PRETTY`, `PORT`, `GATEWAY_*`, `ORDER_RISK_MONITOR_ENABLED`)

Both `DATABASE_URL`s append `?pgbouncer=true&connection_limit=1`. `TOKEN_ENCRYPTION_KEY` (AES-256-GCM, 32 raw bytes — hex64, base64, or 32 ASCII chars) encrypts `Integration.accessToken`/`refreshToken` at rest, applied transparently via Prisma `$extends`; same value in both apps; required in production.

## Coding
- Don't add features, comments, error handling, or abstractions beyond what's asked.
- Read the file before editing it.
- Edit existing files. Don't create new ones unless necessary.
- Tailwind classes, not inline `style`.
- Real DB in tests; never mock the DB.
- Target user is a solo merchant / small team — optimize for simplicity, not power-user features.
- Skip end-of-task summaries. The diff speaks.

## Debugging discipline
- Read source, not build artifacts. `.next/`, `dist/`, and compiled chunks are off-limits for diagnosing UI/runtime bugs. Reaching for them means you've run out of real hypotheses — say so and stop.
- When something you just edited broke, `git diff` is the first move. Read your own changes before forming any theory.
- Never propose "clear the cache" / `rm -rf .next` / restart the dev server as a fix. Dev mode invalidates on file change. If you genuinely think an artifact is stale, prove it by diffing file contents — not mtimes.
- User-reported evidence is load-bearing. If they say "no console errors," do not propose causes that would produce console errors (missing imports, render crashes, undefined components). Rule those out and move on.
- Two failed hypotheses = stop. Summarize what's been ruled out and ask what they see (DOM tree, computed styles, network tab) before pivoting to a third theory.
- For "element doesn't render / isn't clickable" bugs, the cause lives in: the component source, parent layout, CSS (display/visibility/pointer-events/z-index/overflow), or a wrapping conditional. Not the build system.
