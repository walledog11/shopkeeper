# Shopkeeper

An AI operating layer for solo and small Shopify businesses. Customers message the store
on Instagram, email or storefront chat; the agent reads Shopify context and drafts a
reply and any actions (refund, cancellation, address change…); the merchant approves from
their phone over iMessage, or from the dashboard; Shopkeeper executes and replies.

Customer support is the V1 wedge. Later modules (order ops, inventory, marketing,
finance) share the same agent core. The channel model is in
[docs/product-truth.md](docs/product-truth.md).

- What to work on: [docs/ROADMAP.md](docs/ROADMAP.md)
- How the agent works: [docs/agent-runtime.md](docs/agent-runtime.md)
- Deploys, env, migrations, incidents: [docs/production/runbook.md](docs/production/runbook.md)
- Tests: [TESTING.md](TESTING.md)
- Working rules for Claude sessions: [.claude/CLAUDE.md](.claude/CLAUDE.md)

## Layout

```
apps/
  dashboard/   Next.js 16 — marketing site, merchant UI, API routes (Clerk, SWR, Tailwind)
  gateway/     Express + BullMQ — webhooks, durable inbound, planning, operator channels
packages/
  agent/       @shopkeeper/agent — planner, tools, Shopify client, execution, policy
  db/          Prisma schema and shared client (Neon Postgres)
  email/       Gmail and Postmark helpers
  integrations/ Instagram, SocialAPI, TikTok Shop clients
  analytics/   product analytics helpers
  shared/      small cross-package utilities
extensions/
  shopkeeper-chat/  Shopify theme app extension (storefront chat widget)
scripts/       repo checks, test harnesses, production audits and canaries
e2e/           Playwright specs
```

Node 22.x and npm 10.x (`nvm use` reads `.nvmrc`).

## Run it locally

```sh
npm ci
cp apps/dashboard/.env.example apps/dashboard/.env.local   # fill in values
cp apps/gateway/.env.example apps/gateway/.env             # fill in values
npm run dev                          # builds packages, then runs both apps
```

The dashboard runs on port 3000 and the gateway on 8080 (`PORT` in `apps/gateway/.env`).
To receive provider webhooks locally, run the gateway with
`npm run dev:tunnel -w apps/gateway` *instead of* the gateway half of `npm run dev` — it
starts the same server and worker plus ngrok, on the same port. ngrok forwards to
`GATEWAY_PORT` from the shell (default 8080), so set both if you change the port; set
`NGROK_DOMAIN` for a reserved domain.

Useful commands:

```sh
npm run typecheck
npm run lint
npm run test:unit                 # no services needed
npm run test:services:up          # local Postgres + Redis for integration tests
npm run test:integration
npm run verify:pr                 # CI's test and build stages
npm run clean                     # remove build/test artifacts (--dry-run to preview)
```

## Hosting

- Dashboard on Vercel; gateway (server + worker) on Railway.
- Neon Postgres through pgbouncer.
- Redis: Upstash REST for the dashboard; a dedicated Redis (`REDIS_URL`) for the
  gateway's BullMQ. They are separate instances.

Env var names live in each app's `.env.example`; which ones production requires is the
runbook's env matrix.

## Where things are

- Inbound webhooks: `apps/gateway/src/routes/`
- Inbound processing, support planning, operator turns: `apps/gateway/src/message-handlers/`
- Agent tools and their exact behavior: `packages/agent/src/tools/registry/`
- Agent settings: `SETTINGS_KEYS` in `packages/agent/src/settings-parser.ts`, defaults
  in `packages/agent/src/settings.ts`
- Dashboard host adapters for the agent: `apps/dashboard/src/lib/agent/`
- Database schema: `packages/db/prisma/schema.prisma`
