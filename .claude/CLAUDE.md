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

## Request Flow
1. External platform POSTs to gateway webhook
2. Gateway resolves org, enqueues job to Redis/BullMQ
3. Worker upserts customer/thread/message, generates AI summary
4. Dashboard polls `/api/threads?status=open` via SWR every 3s
5. Agent replies → `POST /api/messages` → dispatches to platform API

## Auth & Multi-tenancy
- Clerk.com handles user auth (`src/proxy.ts`)
- `getOrCreateOrg()` maps Clerk org → DB Organization row
- All DB queries are scoped by `organizationId`

## Channels
- **Email** — complete (Postmark, inbound + outbound, reply threading, quote stripping, AI spam filter)
- **Instagram DM** — complete (OAuth, inbound webhooks, outbound via page token, integrations UI)
- **Shopify** — not started
- **TikTok** — not started

## Key Files
- `apps/gateway/src/routes/webhooks.js` — webhook handlers
- `apps/gateway/src/worker.js` — BullMQ worker (email + ig_dm branches)
- `apps/dashboard/src/app/api/messages/route.ts` — outbound message dispatch
- `apps/dashboard/src/app/api/threads/route.ts` — GET threads
- `apps/dashboard/src/app/api/agent/plan/route.ts` — AI agent plan generation
- `packages/db/prisma/schema.prisma` — DB schema

## Dev Environment
- Uses ngrok for local webhook testing
- Postmark for email, Meta developer tools for Instagram
- `.env.local` (dashboard): CLERK keys, DATABASE_URL, OPENAI_API_KEY, POSTMARK_API_KEY, META_APP_ID, META_APP_SECRET, APP_URL, INBOUND_EMAIL_DOMAIN
- `.env` (gateway): DATABASE_URL, REDIS_URL, PORT, META_VERIFY_TOKEN, OPENAI_API_KEY, INBOUND_EMAIL_DOMAIN

## Coding Guidelines
- Don't add features, comments, error handling, or abstractions beyond what's asked
- Don't mock the DB in tests — use real DB connections
- Keep responses concise — skip summaries of what was just done
- Prefer editing existing files over creating new ones
- Read files before modifying them
