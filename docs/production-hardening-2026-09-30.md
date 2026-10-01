# Production hardening verification — 2026-09-30

These changes are local and have not been deployed. Existing unrelated work in
the checkout was preserved. No paid model evaluations or live provider mutations
were run.

## Implemented

- Postmark Basic authentication runs before the large inbound/bounce body parsers.
- Customer-facing Shopify tools require the conversation's linked customer and
  verify order ownership using a minimal provider read. Unverified ownership
  fails closed. Operator access and the existing storefront verification policy
  retain their separate authorization paths.
- Workspace deletion persists a recovery operation before removing anything.
  Billing cancellation, provider disconnects, attachment deletion, Clerk deletion,
  and local deletion are recorded in order. Active tasks are canceled and their
  live leases/recent execution claims drain before credentials disappear. A
  gateway maintenance worker retries pending/stale operations every minute.
- Settings writes compare the database version atomically; competing saves of
  the same version produce one success and one conflict.
- New storefront sessions have a per-store admission limit. Session authorization
  checks the signed shop, integration, expiry, and active workspace/integration.
  Bounded shopper transcripts return the newest messages rather than freezing
  after the first page.
- Uploads are capped at 4 MiB with an immediate composer error, leaving room for
  multipart overhead under the hosting request-body limit.
- Agent-task backlog/failure/stuck-job monitoring is included in queue diagnostics.
- Inbox lists enforce per-thread message limits in SQL; Prisma's nested `take`
  was fetching full histories before trimming multi-thread results in memory.
  Conversation detail uses
  pages of 100 messages with a stable timestamp/UUID cursor, and the browser can
  load earlier pages without jumping to the bottom.
- Dashboard summaries cache for 15 seconds and coalesce concurrent requests within
  a process. Read limits belong to each authenticated teammate rather than sharing
  one workspace allowance. Write/financial allowances remain workspace scoped.
- Native Prisma and the Neon adapter receive explicit pool size and deadlines.
  Defaults are `DB_POOL_MAX=5`, `DB_CONNECT_TIMEOUT_MS=5000`,
  `DB_POOL_WAIT_TIMEOUT_MS=5000`, and `DB_QUERY_TIMEOUT_MS=15000`. These are per
  application process; URL-only pool parameters are superseded by this configuration.
  Turbo passes these runtime database settings into build processes so route
  collection can initialize the client without depending on local env files.
- Patched dependencies are locked: Next 16.3.8, Axios 1.20.0, gRPC 1.14.5,
  Nodemailer 10.0.12, fast-uri 3.1.8, and compatible brace-expansion fixes.

## Evidence and limits

The reconciled branch passes the canonical static checks, 2,135 workspace unit
tests, 49 Node script tests, and 3,836 coverage/integration tests. Three
coverage tests skip without live-model evaluation enabled. Browser smoke checks
pass 11 tests; the real Blob-upload check skips because no Blob credential was
provided. Workspace and E2E TypeScript checks pass after updating existing
fixtures for lifecycle and customer ownership. Shared packages, gateway, and
dashboard pass the canonical production build. No new browser tests were added.

All 94 migrations applied to a disposable local database, including the new
chronology index, which is valid and ready. Production dependency audit reports
zero vulnerabilities. The original checkout's 153 saved file fingerprints and
Git index are unchanged by isolation and verification.

Earlier validation before upstream reconciliation also established the following:

Focused database/route tests cover ownership refusals, concurrent settings saves,
equal-time message pagination, cleanup retries, cancellation/draining, storefront
admission/session fencing, and attachment limits.

Browser checks exercised manual replies, reviewed-plan approval with recorded
delivery, billing refusals, KB creation, and loading all 205 seeded conversation
messages. Before the final SQL correction, a one-time history check issued 100
concurrent local HTTP reads: 50 inbox
previews and 50 conversation-detail requests. All returned 200. Observed latency
was median 177 ms, 95th percentile 285 ms, maximum 289 ms.

A separate check against the production build sent 12 simultaneous summary
requests. All returned 200 with one shared generation timestamp, and the next
request reused that cached result.

The history walkthrough and read benchmark were one-time checks; their temporary
browser spec was removed after review. The database pagination regression remains.

That burst used local Postgres, one seeded workspace, auth/rate-limit bypass, and
no model/provider work. It demonstrates bounded local read handling. It does not
establish production capacity for 100 simultaneous AI conversations or validate
real Shopify/Clerk/Stripe/Blob behavior. The agent models were mocked or
deterministic, and dummy model keys were supplied explicitly to avoid loading paid
credentials from environment files.

## Deployment and remaining work

The isolated branch is based on upstream `135626c3`; earlier marketing, operator,
and testing-policy edits are excluded from its diff. The dependency lockfile was
regenerated against that base. This preparation does not push, merge, migrate
production, or deploy either service.

Use isolated staging credentials before creating a Preview deployment: its
database, Redis, Clerk, Stripe, and Blob configuration must not point at production.
The existing eval workflow runs free deterministic checks on pushes/PRs; paid
evaluations require manual dispatch and remain outside this validation.

1. Check migration status against staging using explicitly supplied URLs. The
   expected new migration is `20260930120000_add_message_chronology_index`; inspect
   any other pending migrations before applying them.

   ```sh
   DATABASE_URL="${STAGING_DATABASE_URL:?set staging pooled URL}" \
   DIRECT_DATABASE_URL="${STAGING_DIRECT_DATABASE_URL:?set staging direct URL}" \
   npx prisma migrate status --schema=packages/db/prisma/schema.prisma

   DATABASE_URL="${STAGING_DATABASE_URL:?set staging pooled URL}" \
   DIRECT_DATABASE_URL="${STAGING_DIRECT_DATABASE_URL:?set staging direct URL}" \
   npm run db:migrate:deploy
   ```

   This additive index does not rewrite application data, but ordinary
   `CREATE INDEX` blocks table writes while building. Schedule it during low
   traffic and inspect table size and long-running transactions first. Confirm
   `messages_org_thread_chronology_idx` is valid and migration status is current.
2. Deploy the dashboard from the reviewed commit first. It adds the authenticated
   cleanup endpoint and records deletion requests durably. Requests can remain
   pending while the gateway is updated; retain their recovery records.
3. Deploy the gateway from the same commit. Confirm the
   `workspace-deletion-sweep-1min` scheduler is registered and internal calls reach
   `/api/org/internal/delete`. Both services need matching internal secrets;
   protected dashboard deployments also need the existing protection-bypass setting.
   Keep pool limits per process, with aggregate connections below the database
   connection budget; begin with the documented defaults.
4. Verify inbox preview/history, competing settings saves, ownership refusals,
   upload limits, and storefront resume/admission on staging. Delete a disposable
   workspace and confirm billing cancellation, integration cleanup, Blob removal,
   Clerk removal, and the completed local ledger. Inspect queue diagnostics and
   pending deletion errors before enabling real-user traffic.
5. Repeat the migration and dashboard-then-gateway sequence in production using
   explicitly supplied production URLs and the same reviewed commit. Production
   changes have not been executed in this session.

For a cleanup regression, roll back the gateway first to stop new sweeps and keep
the dashboard's deletion fences in place. Preserve the additive index and durable
ledgers. External cancellation/deletion cannot be undone by reverting code;
inspect pending/processing operations before any dashboard rollback. Provider
failures retain identifiers for retry, so do not manually erase their ledger rows.

Production database privileges, Preview/Development credential isolation, exposed
secret rotation, Redis AOF/persistence and memory budgeting, and deployment region
alignment remain operational changes. Inbound jobs still retain attachment bytes
in Redis; replacing them with durable payload references and addressing the
acknowledgment/durability gap remains a separate implementation.

Run representative staging load across tenants, polling, worker queues, and actual
provider quotas before promising 100 concurrent users. Live-model evaluations
would consume paid tokens and were deliberately not run.
