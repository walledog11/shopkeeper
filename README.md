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
nvm use
npm ci
npm run dev:setup                     # Docker Desktop must be running
# Fill in development provider credentials in the generated app env files.
npm run dev:doctor
npm run dev                          # package watchers, dashboard, gateway + worker
```

Open **http://localhost:3000** for everyday development. The gateway runs on 8080.
`dev:setup` creates missing env files without replacing existing ones, starts the
Postgres/Redis containers, creates `shopkeeper_dev` if needed, applies committed
migrations, and builds shared packages. Re-run it after pulling schema changes;
it preserves development data. It never resets or seeds the test database.

Both apps use the gitignored root `.env.development.local` for shared service URLs
and secrets. It overrides legacy app env settings; shell variables take precedence.
The dev commands enforce local database/backend targets and development mode.
Scheduled maintenance workers and product analytics start disabled.

| Service | Development | Automated tests |
| --- | --- | --- |
| PostgreSQL | `127.0.0.1:55432/shopkeeper_dev` | `127.0.0.1:55432/clerk_test` |
| Gateway Redis | `127.0.0.1:56379/1` | `127.0.0.1:56379/0` |
| Dashboard / gateway | `3000` / `8080` | `3100` / `8180` |

Development and tests share the Docker containers but use separate databases.
`test:services:down` stops those shared containers; `dev:setup` starts them again.
Dashboard locks/caching still require a separate **development Upstash REST instance**;
the gateway's TCP Redis does not supply the REST API. Use Clerk development keys in
the dashboard env file and an Anthropic key for agent work. Provider calls with real
credentials are live; use your development Shopify store and messaging accounts.

Sign in, complete onboarding, and connect the built-in demo store, then run
`npm run demo:seed` for sample customers, tickets and order-attention rows.
`dev:doctor` checks configuration, database migrations, Redis and running app health
without printing credentials. It can also run before either app is started.

For provider webhooks, install/authenticate ngrok and use two terminals:

```sh
npm run dev -- --filter='!shopkeeper-gateway'
npm run dev:tunnel -w apps/gateway
```

Use dedicated development webhook registrations. `NGROK_DOMAIN` selects a reserved
domain; `GATEWAY_PORT` controls the tunnel target (default 8080) and must match `PORT`.
For OAuth testing, set `APP_URL` and `NEXT_PUBLIC_APP_URL` to the registered public
callback origin when needed; keep `DASHBOARD_URL` and internal URLs local.

## From local development to a release

Work on a feature branch, try the change locally, and run typecheck plus relevant tests.
Push that branch for a Vercel preview and open a PR. Use a separate staging gateway,
worker, database and provider accounts when checking backend changes, OAuth or messaging;
a dashboard preview alone does not deploy the gateway. Configure preview/staging URLs
and credentials in the hosting platforms, independently of local env files.

Merge into `master` after CI and the relevant preview checks pass, then check the
deployed feature. Keep production for releases. The repo's local setup command does
not provision cloud staging or change the production deployment branch settings.

Useful commands:

```sh
npm run typecheck
npm run lint
npm run dev:doctor                # local configuration and service health
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
