# Clerk — AI Helpdesk for Shopify Merchants

## What This Is
A SaaS helpdesk platform built for Shopify merchants — solo owners and small teams who need to handle customer support across multiple channels without a large support staff. Think Zendesk but AI-first, purpose-built for Shopify. The AI agent can read and act on Shopify data (orders, customers, refunds, etc.) directly inside the support workflow.

## Docs
- Production checklist: [`docs/production/checklist.md`](docs/production/checklist.md)
- Deployment guide: [`docs/production/deployment.md`](docs/production/deployment.md)
- Production runbook: [`docs/production/runbook.md`](docs/production/runbook.md)

## Repo Layout
```
clerk/
├── apps/dashboard/     # Next.js 15 — UI + API routes (Clerk.com auth, SWR, Tailwind)
├── apps/gateway/       # Express — webhook receiver + BullMQ worker
└── packages/db/        # Prisma schema + shared @clerk/db client (Neon PostgreSQL)
```

## Hosting (Production)
- **Dashboard** — Vercel (Next.js 15 serverless)
- **Gateway** — Railway (Express + BullMQ worker, single service)
- **Database** — Neon PostgreSQL (pooled via pgbouncer)
- **Redis** — Upstash (dashboard uses `@upstash/redis` REST client; gateway uses `ioredis` with `REDIS_URL`)
- **Error tracking** — Sentry (optional, both apps init if `SENTRY_DSN` is set)

## Request Flow (Inbound Message)
1. External platform POSTs to gateway webhook (Railway URL)
2. Gateway verifies signature (HMAC/Meta), resolves org, enqueues job to BullMQ
3. Worker upserts customer/thread/message, sanitizes input (prompt injection protection), deduplicates by `externalMessageId`
4. Worker enqueues AI summary job → Claude generates 1-sentence summary + tag (Shipping/Returns/Order Status/Product Inquiry/General)
5. After summarizing, worker calls `/api/agent/plan-internal` to generate an agent plan, then sends Telegram notification to all bound org members
6. Dashboard polls `/api/threads?status=open` via SWR every 3s and shows the new thread
7. Agent opens the ticket → auto-plan is shown → agent approves → `POST /api/agent` executes

## Auth & Multi-tenancy
- Clerk.com handles user auth and org management
- `getOrCreateOrg()` maps Clerk org ID → DB `Organization` row
- All DB queries are scoped by `organizationId`

## Channels
- **Email** — complete (Postmark inbound + outbound, reply threading, email quote stripping, AI spam filter on new senders)
- **Instagram DM** — complete (OAuth, inbound webhooks, outbound via page access token, daily token health cron, integrations UI)
- **Telegram** — complete (operator-only, single Clerk bot, inbound via `/webhooks/telegram`, outbound plan notifications to bound org members, yes/no/skip plan approval via reply)
- **Shopify** — complete (OAuth custom app, webhook ingestion for orders/created/fulfilled/updated/cancelled, HMAC verification, KB sync, Orders + Customers dashboard views)
- **TikTok** — not started (type stubs and UI placeholder only)

### Internal Channel Types (not user-facing)
- `dashboard_agent` — thread created for each standalone Concierge chat session on `/dashboard/agent`
- `sms_agent` — thread created when a team member interacts with the agent via Telegram (legacy name)

## Dashboard Navigation Structure
```
Inbox                    /dashboard/tickets       — main support queue
Conversations
  Saved Replies          /dashboard/canned-responses
Automation
  Concierge              /dashboard/agent         — standalone AI agent chat
  Memory                 /dashboard/kb            — knowledge base
  Playbooks              /dashboard/playbooks     — trigger-based automation rules
Storefront
  Orders                 /dashboard/orders        — Shopify order browser
  Customers              /dashboard/customers     — Shopify customer browser
  Products               /dashboard/products      — Shopify product browser with inventory
Insights
  Analytics              /dashboard/analytics
  Reports                /dashboard/reports       — exportable reports + GDPR data export
Workspace
  Team                   /dashboard/team
  Integrations           /dashboard/integrations
Footer
  Feedback               /dashboard/feedback
  Settings               /dashboard/settings
```

## AI Agent System
The agent is the core of the product. It operates in two modes:

### Support Mode (ticket threads: ig_dm, email, shopify)
Triggered from the tickets page. When a ticket is opened:
1. **Auto-plan** fires automatically if the last message is from the customer. Calls `/api/agent/plan`, which runs a 2–3 phase Claude tool-use call to generate a `PlanStep[]` without side effects. Plan is cached in `Thread.cachedPlan`.
2. **ActionPlanCard** is shown floating above the composer. Agent reviews proposed steps, can toggle individual steps, approve, dismiss, or regenerate.
3. **Approve** → `POST /api/agent` executes the approved tool calls, then runs the standard tool-use loop for follow-up steps.
4. Agent can also be invoked manually: type `@{agentName}` in the Internal tab composer.

### Operator Mode (dashboard_agent, sms_agent)
Direct interface for the merchant/team. No customer in context — the agent takes instructions and acts on Shopify directly.
- **Dashboard**: `/dashboard/agent` page has a persistent chat interface (session-based, one `dashboard_agent` thread per session).
- **Telegram**: new ticket notification sent to all bound org members. Reply `yes` to execute the plan, `no` to skip, or type freeform instructions.

### Agent Tools
All tools are defined in `apps/dashboard/src/lib/agent/tools.ts`.

**Read tools** (no side effects, executed in plan phase 1.5 to inform dependent writes):
- `search_kb` — full-text search of knowledge base articles
- `search_shopify_products` — search product catalog by name/keyword, returns variants + IDs
- `search_shopify_customers` — search by name or email to resolve customer ID
- `get_shopify_customer` — fetch full customer profile (name, email, phone, address, order count)
- `get_shopify_orders` — fetch up to 5 most recent orders for a customer
- `get_order_by_name` — look up order by human-readable number (e.g. `#1234`)

**Action tools** (write to Shopify):
- `update_shopify_customer_info` — update name, email, phone
- `update_shopify_order_address` — update shipping address on unfulfilled order + sync customer default address
- `add_shopify_customer_note` — append note to Shopify customer record
- `create_refund` — full or partial refund on an order
- `cancel_order` — cancel unfulfilled order with restock option
- `create_shopify_order` — create new order on behalf of customer
- `edit_shopify_order` — add/remove/swap line items using Shopify Order Editing API

**Communication tools**:
- `send_reply` — send message on the customer's channel (IG DM, email, etc.)
- `send_email` — send outbound email to any address (works from any channel type)

**Internal tools**:
- `add_internal_note` — add agent note to thread (not visible to customer)
- `update_thread_status` — set open/pending/closed
- `update_thread_tag` — update topic tag

### Agent Settings (stored as JSON on Organization.settings)
Configurable per org via Settings → Agent tab:
- `agentName` — display name and `@mention` trigger (default: "Clerk")
- `aiContext` — brand/store context prepended to system prompt
- `brandVoice` — tone brief appended to system prompt
- `autoPlanOnOpen` — auto-generate plan when ticket opens (default: true)
- `alwaysDraftReply` — always pre-fill a draft reply
- `defaultInstruction` — default agent instruction
- `requireApprovalForActions` — show plan card before executing (default: true)
- `toolsEnabled` — toggle tool categories: `action`, `communication`, `internal`, `read`
- `maxRefundAmount` — dollar cap on refunds (null = unlimited)
- `blockCancellations` — prevent cancel_order calls
- `blockCustomLineItems` — require variant_id on all create_shopify_order line items
- `maxIterations` — max tool-use loop iterations per run (default: 10)
- `replyLanguage` — force reply language ("auto" or ISO name like "Spanish")

### Agent Safety / Guardrails
- 20,000 token budget per run; stops and reports if exceeded
- Prompt injection patterns stripped from all inbound messages in gateway
- Inbound messages truncated at 4,000 chars in gateway
- Rate limiting on agent endpoints via Upstash Redis

## Key Features

### Tickets (Inbox)
- Thread list with SWR 3s polling, status tabs (open/closed), channel filter, search
- Conversation view with chat + internal notes tabs
- Presence tracking: heartbeat every 15s warns if multiple agents viewing same ticket
- Failed message retry UI
- Close/reopen thread, tag management

### Concierge (Standalone Agent)
- `/dashboard/agent` — direct chat interface with the AI agent
- Session-based: each new session creates a `dashboard_agent` thread, previous session is closed
- Activity log tab shows all past agent turns with actions performed

### Knowledge Base (Memory)
- Multi-base (named KBs), multi-article per base
- Articles have tags for context-filtered retrieval (agent gets KB articles matching thread tag)
- Shopify KB sync: imports products/policies from connected Shopify store

### Saved Replies (Canned Responses)
- Org-scoped, searchable via command palette
- Tagged for filtering

### Analytics
- Ticket volume chart, channel breakdown, top topics, overview stats, audit log

### Orders / Customers / Products (Storefront)
- `/dashboard/orders` — Shopify order browser with fulfillment/payment status filters, stat strip, search, pagination
- `/dashboard/customers` — Shopify customer browser
- `/dashboard/products` — Shopify product browser with search, status filters (active/draft/archived), stat strip (total/active/out-of-stock), per-product drawer showing variants/SKUs/pricing/inventory, Shopify admin deep-link, load-more pagination
- Orders page has "New thread" action that finds/creates a support thread for a Shopify customer (`POST /api/threads/shopify`)

### Playbooks (Automation)
- `/dashboard/playbooks` — trigger-based automation rules; create/edit via slide-over drawer, enable/disable toggle per playbook
- Triggers: `new_ticket`, `tag_applied` (with specific tag selector), `ticket_closed`
- Actions (chainable): `send_reply`, `apply_tag`, `close_ticket`, `add_note`
- Pre-built templates: WISMO Auto-Reply, Returns & Refunds, Auto-close Resolved
- Active/inactive grouping in list view

### Reports
- `/dashboard/reports` — exportable reports with date range selector (7d / 30d / 90d / all time / custom range)
- **Support Summary** — total tickets, resolved count, resolution rate, avg first reply time, breakdown by channel; CSV export
- **Agent Activity** — agent runs, replies sent, refunds issued, cancellations, order edits, orders created, address updates, top tools used; CSV export
- **Top Topics** — ticket distribution by AI-assigned tag with percentage bars; CSV export
- **Customer Contact** — unique customers, repeat customers (3+ tickets), most active customers list; CSV export
- **GDPR / CCPA Data Export** — enter customer email → download all their data as JSON (Art. 15 compliance)

### Billing
- Stripe subscriptions (starter/pro tiers)
- Checkout, portal, webhook sync, invoice history

### Team
- Org member management via Clerk.com
- Bound Telegram chats per org member for agent notifications

### Settings
- Workspace tab: org name, branding
- Agent tab: all agent settings (see above)
- Integrations tab: connect/disconnect Instagram, Shopify, Telegram, email
- Account tab: personal settings
- Billing tab: Stripe portal
- Audit log tab

## Database Models (packages/db/prisma/schema.prisma)

- **Organization** — one per merchant. Stores Stripe subscription fields + `settings` JSON (agent config).
- **Integration** — one per connected platform per org. Stores access token, external account ID, token expiry.
- **Customer** — unique by `(organizationId, platformId)`. `platformId` is email for email channel, IG sender ID for DMs.
- **Thread** — belongs to org + customer. Has `channelType`, `status` (open/pending/closed), `aiSummary`, `tag`, `shopifyCustomerId`, `cachedPlan` (agent plan cache), soft-delete + archive fields.
- **Message** — belongs to thread. `senderType`: customer/agent/ai/note. Agent action logs are stored as `note` messages prefixed with `__clerk_agent__`.
- **OperatorContext** — persists Telegram operator conversation state per (org, chatId) (history, pendingPlan, pendingDigest, lastOrderNumber). DB-backed, not Redis.
- **OrgMember** — extends Clerk org membership with a bound Telegram chat for operator notifications.
- **CannedResponse** — org-scoped saved replies with tags.
- **KnowledgeBase** — named KB container. `source`: "user" | "shopify".
- **KbArticle** — belongs to org + KB. Has tags for context filtering.
- **Feedback** — in-app NPS/survey (rating + comment + categories).

## Key Files
- `apps/gateway/src/routes/webhooks.ts` — webhook handlers (Meta/Instagram, Email, Telegram, Shopify)
- `apps/gateway/src/worker.ts` — BullMQ worker: inbound message processing + AI summary + maintenance workers
- `apps/gateway/src/message-handlers/` — per-channel job handlers (`channels.ts`), AI summary generation (`intelligence.ts`), Telegram plan notification (`planning.ts`)
- `apps/gateway/src/maintenance/workers.ts` — daily IG token health check, 90-day archive + 90-day purge workers
- `apps/dashboard/src/lib/agent/runner.ts` — core agent: `buildContext()`, `planAgent()`, `runAgent()`
- `apps/dashboard/src/lib/agent/tools.ts` — all tool definitions + TOOL_CATEGORIES + PLAN_STEP_LABELS
- `apps/dashboard/src/lib/agent/shopify-tools.ts` — Shopify API implementations for each tool
- `apps/dashboard/src/lib/agent/thread-tools.ts` — thread/message tool implementations
- `apps/dashboard/src/lib/agent/settings.ts` — agent settings defaults + resolver
- `apps/dashboard/src/app/api/agent/route.ts` — POST: execute agent run on a ticket thread
- `apps/dashboard/src/app/api/agent/plan/route.ts` — POST: generate plan (no side effects)
- `apps/dashboard/src/app/api/agent/plan-internal/route.ts` — internal-only plan endpoint called by gateway
- `apps/dashboard/src/app/api/agent/chat/route.ts` — standalone Concierge chat sessions
- `apps/dashboard/src/app/api/messages/route.ts` — outbound message dispatch
- `apps/dashboard/src/app/api/threads/route.ts` — GET threads list
- `apps/dashboard/src/app/api/threads/shopify/route.ts` — POST: create thread from Shopify customer
- `apps/dashboard/src/app/api/integrations/shopify/auth/route.ts` — Shopify OAuth initiation
- `apps/dashboard/src/app/api/integrations/shopify/callback/route.ts` — Shopify OAuth callback
- `apps/dashboard/src/app/api/billing/route.ts` — Stripe billing info
- `apps/dashboard/src/app/api/billing/webhook/route.ts` — Stripe webhook sync
- `apps/dashboard/src/lib/redis.ts` — Upstash Redis client (rate limiting)
- `apps/dashboard/src/instrumentation.ts` — startup env validation + Sentry init
- `packages/db/prisma/schema.prisma` — DB schema

## Environment Variables

### Dashboard (Vercel)
- `DATABASE_URL` — Neon connection string with `?pgbouncer=true&connection_limit=1`
- `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — Clerk.com app keys
- `OPENAI_API_KEY` — OpenAI (used for embeddings/AI drafts)
- `ANTHROPIC_API_KEY` — Claude (used for agent tool-use loop and AI plan generation)
- `INTERNAL_API_SECRET` — shared secret with gateway for internal API calls (e.g. plan-internal)
- `POSTMARK_API_KEY` — outbound email dispatch
- `META_APP_ID`, `META_APP_SECRET` — Instagram OAuth + webhook verification
- `APP_URL` — production dashboard URL (e.g. `https://app.yourdomain.com`)
- `INBOUND_EMAIL_DOMAIN` — domain Postmark routes inbound mail to
- `GATEWAY_INTERNAL_URL` — Railway gateway URL (e.g. `https://gateway.up.railway.app`)
- `TELEGRAM_BOT_USERNAME` — Telegram bot username for the operator-channel deep link
- `SHOPIFY_APP_SECRET` — Shopify HMAC webhook verification secret
- `SHOPIFY_CLIENT_ID` — Shopify OAuth app client ID
- `SHOPIFY_CLIENT_SECRET` — Shopify OAuth app client secret
- `STRIPE_SECRET_KEY` — Stripe secret key
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret
- `PRICE_ID_STARTER`, `PRICE_ID_PRO` — Stripe price IDs per plan tier
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis REST credentials
- `SENTRY_DSN` — (optional) Sentry error tracking

### Gateway (Railway)
- `DATABASE_URL` — Neon connection string with `?pgbouncer=true&connection_limit=1`
- `REDIS_URL` — Upstash Redis URL (ioredis-compatible, e.g. `rediss://...`)
- `PORT` — Railway sets this automatically
- `ANTHROPIC_API_KEY` — Claude (used for AI summary + spam filter in worker)
- `INTERNAL_API_SECRET` — must match dashboard value
- `META_APP_SECRET` — Instagram webhook signature verification
- `META_VERIFY_TOKEN` — Instagram webhook setup handshake
- `TELEGRAM_BOT_TOKEN` — Telegram bot token (single Clerk bot for the operator channel)
- `TELEGRAM_WEBHOOK_SECRET` — shared secret header for `/webhooks/telegram` verification
- `SHOPIFY_APP_SECRET` — Shopify HMAC webhook verification secret
- `DASHBOARD_URL` — production dashboard URL used by the gateway for internal API calls
- `DASHBOARD_INTERNAL_URL` — local dashboard URL used only for dev callback forwarding / local gateway-to-dashboard calls
- `SENTRY_DSN` — (optional) Sentry error tracking

## Coding Guidelines
- Don't add features, comments, error handling, or abstractions beyond what's asked
- Don't mock the DB in tests — use real DB connections
- Keep responses concise — skip summaries of what was just done
- Prefer editing existing files over creating new ones
- Read files before modifying them
- Target user is a solo Shopify merchant or small team — UI and features should optimize for simplicity and speed, not power-user complexity
