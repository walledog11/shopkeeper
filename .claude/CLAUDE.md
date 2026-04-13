# Clerk — AI Helpdesk for E-Commerce

## What This Is
Multi-channel customer support helpdesk for Shopify/e-commerce brands (think Zendesk). Built as a monorepo.

## Repo Layout
```
clerk/
├── apps/dashboard/     # Next.js 15 — UI + API routes (Clerk auth, SWR, Tailwind)
├── apps/gateway/       # Express — webhook receiver + BullMQ worker
└── packages/db/        # Prisma schema + shared @clerk/db client (Neon PostgreSQL)
```

## Hosting (Production)
- **Dashboard** — Vercel (Next.js 15 serverless)
- **Gateway** — Railway (Express + BullMQ worker, single service)
- **Database** — Neon PostgreSQL (pooled via pgbouncer)
- **Redis** — Upstash (dashboard uses `@upstash/redis` REST client; gateway uses `ioredis` with `REDIS_URL`)
- **Error tracking** — Sentry (optional, both apps init if `SENTRY_DSN` is set)

## Request Flow
1. External platform POSTs to gateway webhook (Railway URL)
2. Gateway resolves org, enqueues job to Upstash Redis/BullMQ
3. Worker upserts customer/thread/message, generates AI summary
4. Dashboard polls `/api/threads?status=open` via SWR every 3s
5. Agent replies → `POST /api/messages` → dispatches to platform API

## Auth & Multi-tenancy
- Clerk.com handles user auth
- `getOrCreateOrg()` maps Clerk org → DB Organization row
- All DB queries are scoped by `organizationId`

## Channels
- **Email** — complete (Postmark, inbound + outbound, reply threading, quote stripping, AI spam filter)
- **Instagram DM** — complete (OAuth, inbound webhooks, outbound via page token, daily token health cron, integrations UI)
- **WhatsApp/SMS** — complete (Twilio, inbound via `/webhooks/twilio`, plan approval flow via yes/no/skip replies, outbound plan notifications to verified org members)
- **Shopify** — complete (webhook ingestion for orders/created, fulfilled, updated, cancelled; HMAC verification; dashboard customer API routes; KB sync from Shopify)
- **TikTok** — not started (type stubs and UI placeholder only)

## Key Features
- **AI Agent** — runs Anthropic Claude tool-use loop per thread; Shopify tool access; action log persisted as `note` messages
- **Knowledge Base** — multi-base, multi-article; Shopify KB sync; used as agent context
- **Canned Responses** — org-scoped; searchable via command palette
- **Billing** — Stripe subscriptions (starter/pro tiers); checkout, portal, webhook sync, invoice history
- **Analytics** — ticket volume chart, channel breakdown, top topics, overview stats, audit log
- **Team** — org member management with verified phone numbers for WhatsApp agent notifications
- **Feedback** — in-app NPS/survey stored in `Feedback` table

## Key Files
- `apps/gateway/src/routes/webhooks.ts` — webhook handlers (Meta, Email, Twilio, Shopify)
- `apps/gateway/src/worker.ts` — BullMQ inbound message worker (ig_dm, email, shopify branches)
- `apps/gateway/src/maintenance-workers.ts` — daily token health + archive/purge workers
- `apps/dashboard/src/app/api/messages/route.ts` — outbound message dispatch
- `apps/dashboard/src/app/api/threads/route.ts` — GET threads
- `apps/dashboard/src/app/api/agent/route.ts` — AI agent execution (Anthropic tool-use loop)
- `apps/dashboard/src/app/api/agent/plan/route.ts` — AI agent plan generation
- `apps/dashboard/src/app/api/billing/route.ts` — Stripe billing info
- `apps/dashboard/src/app/api/billing/webhook/route.ts` — Stripe webhook sync
- `apps/dashboard/src/lib/redis.ts` — Upstash Redis client (rate limiting, session state)
- `apps/dashboard/src/instrumentation.ts` — startup env validation + Sentry init
- `packages/db/prisma/schema.prisma` — DB schema

## Environment Variables

### Dashboard (Vercel)
- `DATABASE_URL` — Neon connection string with `?pgbouncer=true&connection_limit=1`
- `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — Clerk.com app keys
- `OPENAI_API_KEY` — OpenAI (used for embeddings/drafts)
- `ANTHROPIC_API_KEY` — Claude (used for agent tool-use loop)
- `INTERNAL_API_SECRET` — shared secret with gateway for internal API calls
- `POSTMARK_API_KEY` — outbound email dispatch
- `META_APP_ID`, `META_APP_SECRET` — Instagram OAuth + webhook verification
- `APP_URL` — production dashboard URL (e.g. `https://app.yourdomain.com`)
- `INBOUND_EMAIL_DOMAIN` — domain Postmark routes inbound mail to
- `GATEWAY_INTERNAL_URL` — Railway gateway URL (e.g. `https://gateway.up.railway.app`)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` — Twilio credentials
- `TWILIO_FROM_NUMBER` — E.164 number for OTP SMS
- `TWILIO_WEBHOOK_URL` — production Twilio webhook URL
- `SHOPIFY_APP_SECRET` — Shopify HMAC verification
- `STRIPE_SECRET_KEY` — Stripe secret key
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret
- `PRICE_ID_STARTER`, `PRICE_ID_PRO` — Stripe price IDs per plan tier
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis REST credentials
- `SENTRY_DSN` — (optional) Sentry error tracking

### Gateway (Railway)
- `DATABASE_URL` — Neon connection string with `?pgbouncer=true&connection_limit=1`
- `REDIS_URL` — Upstash Redis URL (ioredis-compatible, e.g. `rediss://...`)
- `PORT` — Railway sets this automatically
- `ANTHROPIC_API_KEY` — Claude (used for AI summaries in worker)
- `INTERNAL_API_SECRET` — must match dashboard value
- `META_APP_SECRET` — Instagram webhook signature verification
- `META_VERIFY_TOKEN` — Instagram webhook setup handshake
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` — Twilio credentials
- `TWILIO_WHATSAPP_NUMBER` — WhatsApp Business number (`whatsapp:+1xxxxxxxxxx`)
- `TWILIO_WEBHOOK_URL` — production Twilio webhook URL
- `SHOPIFY_APP_SECRET` — Shopify HMAC verification
- `DASHBOARD_INTERNAL_URL` — Vercel dashboard URL (for OAuth callback forwarding in dev)
- `SENTRY_DSN` — (optional) Sentry error tracking

## Coding Guidelines
- Don't add features, comments, error handling, or abstractions beyond what's asked
- Don't mock the DB in tests — use real DB connections
- Keep responses concise — skip summaries of what was just done
- Prefer editing existing files over creating new ones
- Read files before modifying them
