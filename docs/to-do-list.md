# Production Readiness To-Do List

This list comes from the production-readiness audit of the current dashboard,
gateway, Prisma, auth, DB, and agent/gateway integration setup.

Last reviewed: 2026-06-07.

## Pre-Release Priority (open items)

Do these before treating production as ready:

1. **Wire Sentry source-map upload into deploy/build** — script exists but is not invoked by build/deploy.
2. **Confirm production alerting is live** — verify Sentry/queue/webhook/agent alert paths and record evidence.
3. **Review Redis lock fail-open for mutating agent runs** — decide fail-closed vs fail-open for high-risk mutations.

Lower urgency (still valid): CSP enforcement, dependency audit triage, documentation cleanup.

## Release Blockers

- [X] Prevent approved agent-plan replay on `POST /api/agent`.
  - Clear or atomically consume `Thread.cachedPlan` after successful or failed execution, matching the `executeCurrentCachedHomePlan` behavior.
  - Add a regression test that a second identical approval request cannot re-run the same plan.
  - Consider provider-level/local idempotency keys for high-risk mutations such as refunds, cancellations, order creation, and outbound replies.

- [X] Add server-side role authorization to team management.
  - Require an org admin or explicit Clerk permission before creating invitations, revoking invitations, or removing members.
  - Prevent non-admin users from inviting `org:admin` members.
  - Hide or disable write controls in `/dashboard/team` for non-admins, but do not rely on UI checks.
  - Add route tests for member vs admin behavior on `GET`, `POST`, and `DELETE /api/team`.

- [X] Stop OAuth and provider token leakage in logs.
  - Remove full `pagesData` logging from the Instagram OAuth callback.
  - Avoid logging raw `tokenData` payloads for Instagram, Shopify, Gmail, and Outlook token exchanges.
  - Extend Pino redaction paths to include snake_case keys such as `access_token`, `refresh_token`, `id_token`, `client_secret`, and nested wildcard forms.
  - Add redaction tests that prove snake_case provider token fields are censored.

- [X] Fix Prisma production env contract drift.
  - Production deploys require `DIRECT_DATABASE_URL` (Prisma `directUrl` for migrations; both apps need it because the schema declares it).
  - Added to production env validation (`scripts/check-production-env.mjs`), dashboard/gateway runtime boot checks, example env files, and deployment/runbook migration commands.
  - Re-run root-level `npx prisma validate --schema=packages/db/prisma/schema.prisma`.

- [X] Make the integration suite green.
  - Gateway worker/maintenance tests cover the `order-review` queue and worker.
  - Verified 2026-06-07: `npm run test:integration` passes (648 tests across dashboard + gateway).

## Security And Data Hardening

- [X] Scope inbound message idempotency by tenant.
  - Added `organizationId` to `Message` with a partial unique index on `(organization_id, external_message_id)`.
  - Gateway duplicate checks and `createMessage` now scope inbound idempotency per org.

- [X] Require Postmark inbound Basic Auth in production.
  - Production rejects inbound email when `POSTMARK_INBOUND_USERNAME` or `POSTMARK_INBOUND_PASSWORD` is missing.
  - Gateway boot validation and production env contract require both vars at launch.

- [X] Revisit public attachment storage.
  - Inbound email attachments now upload to Vercel Blob with `access: "private"` and are stored as `blob:{pathname}` refs in `apps/gateway/src/storage/blob.ts`.
  - Dashboard serves attachments through authenticated `GET /api/attachments?ref=...`, scoped to `attachments/{organizationId}/...`.
  - Legacy public blob URLs still work via a public-read fallback while older messages remain in the database.

- [ ] Harden Content Security Policy.
  - Dashboard still sends `Content-Security-Policy-Report-Only` with `unsafe-inline` and `unsafe-eval` in `apps/dashboard/next.config.js`.
  - Move toward enforcement after reviewing report-only violations.
  - Reduce or justify `unsafe-inline` and `unsafe-eval`.
  - Keep Clerk, Sentry, and Cloudflare challenge requirements documented.

- [ ] Review Redis lock fail-open behavior for mutating agent runs. **(pre-release priority)**
  - `acquireThreadLock` in `apps/dashboard/src/lib/server/agent-lock.ts` proceeds with a no-op lock if Redis is unavailable.
  - Decide whether mutating agent execution should fail closed while lower-risk paths can fail open.
  - Risk: duplicate refunds, cancellations, or outbound replies during a Redis outage.

## Observability And Operations

- [ ] Wire Sentry source-map upload into deploy/build. **(pre-release priority)**
  - `scripts/sentry-upload-sourcemaps.mjs` exists and env validation requires `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`.
  - Not yet invoked from dashboard/gateway build scripts or Vercel/Railway deploy hooks.
  - Add the upload step after each app's build output is available.

- [ ] Triage dependency audit findings.
  - Verified 2026-06-07: `npm audit --audit-level=high` reports no high/critical issues; 11 moderate (e.g. `qs`, `turbo`, `uuid` via `@sentry/webpack-plugin`).
  - Prioritize framework/runtime dependencies and document accepted risk for dev-only/tooling findings.

- [ ] Confirm production alerting is live, not just implemented. **(pre-release priority)**
  - Verify Sentry projects, DSNs, alert rules, source maps, and queue/webhook/provider/agent failure alert paths in staging or production.
  - Record evidence in the production runbook.

## Documentation Cleanup

- [ ] Fix stale production checklist references.
  - README, `docs/production/deployment.md`, `docs/production/runbook.md`, and `docs/telegram-operator-channel.md` reference `docs/production/checklist.md`, but that file is missing.
  - Either recreate the checklist or update references to point at `docs/production/runbook.md` and this list.

- [ ] Fix stale env file references.
  - `docs/production/runbook.md` links to `apps/dashboard/src/lib/env.ts`, but the current file is `apps/dashboard/src/lib/env/index.ts`.

- [ ] Document the final production migration workflow.
  - Partially covered in `docs/production/deployment.md` (pooled `DATABASE_URL` vs direct `DIRECT_DATABASE_URL` for `npm run db:migrate:deploy`).
  - Still needed: one consolidated section with exact env vars for Vercel, Railway, local migration runs, and CI.

- [ ] Add a short release-gate checklist.
  - Root `npm run verify:pr` already runs lint, unit tests, integration tests, e2e smoke, coverage, and build.
  - Document the official pre-release command sequence, including `npx prisma validate`, `npm run verify:production:env`, and `npm run test:integration`.
  - Record known sandbox-only caveats, such as Next/Turbopack needing permission to bind an internal worker port during build.
