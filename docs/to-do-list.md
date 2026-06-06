# Production Readiness To-Do List

This list comes from the production-readiness audit of the current dashboard,
gateway, Prisma, auth, DB, and agent/gateway integration setup.

## Release Blockers

- [ ] Prevent approved agent-plan replay on `POST /api/agent`.
  - Clear or atomically consume `Thread.cachedPlan` after successful or failed execution, matching the `executeCurrentCachedHomePlan` behavior.
  - Add a regression test that a second identical approval request cannot re-run the same plan.
  - Consider provider-level/local idempotency keys for high-risk mutations such as refunds, cancellations, order creation, and outbound replies.

- [ ] Add server-side role authorization to team management.
  - Require an org admin or explicit Clerk permission before creating invitations, revoking invitations, or removing members.
  - Prevent non-admin users from inviting `org:admin` members.
  - Hide or disable write controls in `/dashboard/team` for non-admins, but do not rely on UI checks.
  - Add route tests for member vs admin behavior on `GET`, `POST`, and `DELETE /api/team`.

- [ ] Stop OAuth and provider token leakage in logs.
  - Remove full `pagesData` logging from the Instagram OAuth callback.
  - Avoid logging raw `tokenData` payloads for Instagram, Shopify, Gmail, and Outlook token exchanges.
  - Extend Pino redaction paths to include snake_case keys such as `access_token`, `refresh_token`, `id_token`, `client_secret`, and nested wildcard forms.
  - Add redaction tests that prove snake_case provider token fields are censored.

- [ ] Fix Prisma production env contract drift.
  - Decide whether production deploys require `DIRECT_DATABASE_URL`.
  - If yes, add it to production env validation, example env files, deployment docs, and migration commands.
  - If no, remove `directUrl` from the Prisma datasource or make the deploy path not require it.
  - Re-run root-level `npx prisma validate --schema=packages/db/prisma/schema.prisma`.

- [ ] Make the integration suite green.
  - Update gateway worker/maintenance tests for the added `order-review` queue and worker.
  - Run `npm run test:integration` successfully before treating the release gate as healthy.

## Security And Data Hardening

- [ ] Scope inbound message idempotency by tenant.
  - The current unique index is global on `external_message_id`.
  - Add an org-aware idempotency strategy, likely by adding `organizationId` to `Message` or using a dedicated inbound idempotency table.
  - Update gateway duplicate checks to include org/channel/provider scope.

- [ ] Require Postmark inbound Basic Auth in production.
  - Current behavior accepts inbound email without auth if `POSTMARK_INBOUND_USERNAME` or `POSTMARK_INBOUND_PASSWORD` is missing.
  - Make missing credentials a production misconfiguration and fail closed.
  - Update env validation and docs.

- [ ] Revisit public attachment storage.
  - Inbound attachments are uploaded to Vercel Blob with `access: "public"`.
  - Decide whether support attachments need signed URLs, shorter retention, malware scanning, or stricter MIME allowlists.

- [ ] Harden Content Security Policy.
  - Move from `Content-Security-Policy-Report-Only` toward enforcement.
  - Reduce or justify `unsafe-inline` and `unsafe-eval`.
  - Keep Clerk, Sentry, and Cloudflare challenge requirements documented.

- [ ] Review Redis lock fail-open behavior for mutating agent runs.
  - `acquireThreadLock` proceeds with a no-op lock if Redis is unavailable or slow.
  - Decide whether mutating agent execution should fail closed while lower-risk paths can fail open.

## Observability And Operations

- [ ] Wire Sentry source-map upload into deploy/build.
  - Env validation requires `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`, and a source-map upload script exists.
  - Add the upload step to the relevant dashboard/gateway build or deployment flow.

- [ ] Triage dependency audit findings.
  - `npm audit --audit-level=high` found no high/critical issues, but reported moderate vulnerabilities.
  - Prioritize framework/runtime dependencies and document accepted risk for dev-only/tooling findings.

- [ ] Confirm production alerting is live, not just implemented.
  - Verify Sentry projects, DSNs, alert rules, source maps, and queue/webhook/provider/agent failure alert paths in staging or production.
  - Record evidence in the production runbook.

## Documentation Cleanup

- [ ] Fix stale production checklist references.
  - README and production docs reference `docs/production/checklist.md`, but that file is missing.
  - Either recreate the checklist or update references to the current runbook/checklist docs.

- [ ] Fix stale env file references.
  - Production docs refer to `apps/dashboard/src/lib/env.ts`, but the current file is `apps/dashboard/src/lib/env/index.ts`.

- [ ] Document the final production migration workflow.
  - Include whether migrations use pooled or direct DB URLs.
  - Include exact env vars required for Vercel, Railway, local migration runs, and CI.

- [ ] Add a short release-gate checklist.
  - Required commands should include lint, unit tests, integration tests, Prisma validation, env validation, and production build.
  - Record known sandbox-only caveats, such as Next/Turbopack needing permission to bind an internal worker port during build.
