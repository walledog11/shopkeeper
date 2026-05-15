# Clerk — AI helpdesk for Shopify merchants

Solo merchants and small teams. Multi-channel support inbox + AI agent that reads/writes Shopify directly.

## Stack
- `apps/dashboard/` — Next.js 15 (app router), Tailwind, SWR, Clerk.com auth → Vercel
- `apps/gateway/` — Express + BullMQ worker → Railway
- `packages/db/` — Prisma + Neon Postgres, exported as `@clerk/db`
- Redis: `@upstash/redis` (REST) in dashboard; `ioredis` (`REDIS_URL`) in gateway
- AI: Anthropic SDK (agent, plan, summary); OpenAI (embeddings)
- Multi-tenant: every DB query is scoped by `organizationId`. `getOrCreateOrg()` maps Clerk org → DB `Organization`.
- Sentry inits in both apps if `SENTRY_DSN` is set.

## Inbound flow
External webhook → `apps/gateway/src/routes/webhooks.ts` (HMAC verify, enqueue BullMQ) → `apps/gateway/src/message-handlers/` (upsert customer/thread/message, sanitize prompt-injection, dedupe by `externalMessageId`, enqueue summary) → Claude tags + 1-sentence summary → `POST /api/agent/plan-internal` (gateway → dashboard, requires `INTERNAL_API_SECRET`) → WhatsApp notify verified org members. Dashboard polls `/api/threads?status=open` via SWR every 3s.

## Database (`packages/db/prisma/schema.prisma`)
- `Organization` — Stripe subscription fields + `settings` JSON (agent config)
- `Integration` — per platform per org (access token, expiry)
- `Customer` — unique `(organizationId, platformId)`; `platformId` = email / IG sender ID / phone
- `Thread` — `channelType`, `status` (open/pending/closed), `aiSummary`, `tag`, `shopifyCustomerId`, `cachedPlan`, soft-delete + archive
- `Message` — `senderType`: customer/agent/ai/note. **Agent action logs are `note` rows prefixed `__clerk_agent__`.**
- `SmsContext` — WhatsApp/SMS state per (org, phone): history, pendingPlan, lastOrderNumber. **DB-backed, not Redis.**
- `OrgMember` — extends Clerk org membership with verified phone (WhatsApp)
- `KnowledgeBase` (`source: "user" | "shopify"`) / `KbArticle` (tagged for context filtering)
- `CannedResponse`, `Feedback`

## Channels
Email (Postmark), Instagram DM (Meta OAuth), WhatsApp/SMS (Twilio), Shopify (OAuth + webhooks). TikTok: stubs only.

Internal-only `channelType` values (not user-facing): `dashboard_agent` (Concierge sessions), `sms_agent` (team-via-WhatsApp).

## Agent (`apps/dashboard/src/lib/agent/`)
- `context.ts` — `buildContext()` (loads thread, customer, recent messages, KB, recent orders)
- `planner.ts` — `planAgent()` (generates plan with no side effects, caches in `Thread.cachedPlan`)
- `run.ts` — `runAgent()` (executes approved plan or runs an instruction end-to-end)
- `runner.ts` — barrel re-export for the above
- `prompt.ts` — system prompt builder
- `intent.ts` — operator-channel intent classification + tool subset selection
- `order-status-fast-path.ts` — bypasses LLM for "where is X's order?" in operator channels
- `plan-preview.ts` — classifies plans as `quick_reply` vs `needs_review` for the dashboard home
- `tools/registry.ts` — all tool definitions (Anthropic format), `TOOL_CATEGORIES`, `PLAN_STEP_LABELS`, `TOOL_LABELS`, input types
- `tools/executor.ts` — tool dispatch + policy enforcement (`maxRefundAmount`, `blockCancellations`, etc.)
- `tools/thread.ts`, `shopify/*.ts` — implementations
- `settings.ts` — defaults + resolver. Settings live in `Organization.settings` JSON.
- `api/*` — glue between Next.js routes and the agent core (auth, validation, plan-cache, action-log, sessions)

Modes:
- **Support** — ticket threads. Auto-plan on open if last message is from the customer; plan cached in `Thread.cachedPlan`. `ActionPlanCard` → approve → `POST /api/agent`. Manual invoke via `@{agentName}` in Internal tab.
- **Operator** — `/dashboard/agent` (Concierge: each session opens a new `dashboard_agent` thread and closes the previous), and WhatsApp via `sms_agent`.
- **Composer-ask** — read-only Q&A inside the support composer (`POST /api/agent/ask`). Calls `runAgent(..., { readOnly: true })`, which filters tools to `read` category and never mutates anything.

Read tool list and exact behavior from `tools/registry.ts` — do not infer.

`Organization.settings` keys: `agentName`, `aiContext`, `brandVoice`, `autoPlanOnOpen`, `alwaysDraftReply`, `defaultInstruction`, `requireApprovalForActions`, `toolsEnabled` (action/communication/internal/read), `maxRefundAmount`, `blockCancellations`, `blockCustomLineItems`, `maxIterations` (default 10), `replyLanguage`.

## Key API routes (`apps/dashboard/src/app/api/`)
- `agent/route.ts` — execute run on a ticket
- `agent/plan/route.ts` — generate plan, no side effects
- `agent/plan-internal/route.ts` — gateway-only, requires `INTERNAL_API_SECRET`
- `agent/internal/route.ts` — gateway-only agent run (e.g. `sms_agent` from WhatsApp)
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
- `apps/dashboard/src/instrumentation.ts` — env validation + Sentry init

## Dashboard routes
`/dashboard/{tickets, canned-responses, agent, kb, playbooks, orders, customers, products, analytics, reports, team, integrations, feedback, settings}`

## Env (names only — values in Vercel/Railway)
**Dashboard:** `DATABASE_URL`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `INTERNAL_API_SECRET`, `POSTMARK_API_KEY`, `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`, `APP_URL`, `INBOUND_EMAIL_DOMAIN`, `GATEWAY_INTERNAL_URL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_WEBHOOK_URL`, `SHOPIFY_APP_SECRET`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PRICE_ID_STARTER`, `PRICE_ID_PRO`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SENTRY_DSN`

**Gateway:** `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`, `INTERNAL_API_SECRET`, `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, `TWILIO_WEBHOOK_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `SHOPIFY_APP_SECRET`, `DASHBOARD_URL`, `DASHBOARD_INTERNAL_URL`, `BLOB_READ_WRITE_TOKEN`, `SENTRY_DSN`

Both `DATABASE_URL`s append `?pgbouncer=true&connection_limit=1`.

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
