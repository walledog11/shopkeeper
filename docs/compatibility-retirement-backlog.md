# Compatibility Retirement Backlog (P9-02)

Evidence-gated removal of compatibility surfaces identified in
[codebase-audit.md](codebase-audit.md). One candidate per pull request; never
batch unrelated retirements.

Last reviewed: 2026-07-30.

## Completed

| Candidate | Owner | Evidence | Removed |
| --- | --- | --- | --- |
| Sentry example page/API (`/sentry-example-page`, `/api/sentry-example-api`, `SENTRY_EXAMPLE_PAGE_ENABLED`) | Product engineering | Not referenced in production runbooks or error-tracking plan; gated outside development; zero production env usage expected | 2026-07-30 |

## Open — awaiting evidence or product decision

| Candidate | Owner | Evidence required before removal | Status |
| --- | --- | --- | --- |
| Deprecated `GATEWAY_PUBLIC_URL` alias | Platform / dashboard | Query deployed Vercel env: confirm no host sets `GATEWAY_PUBLIC_URL` without matching `GATEWAY_INTERNAL_URL`; one release after clearing env | Open — alias still read in `gateway-url.ts` with mismatch guard |
| Legacy iMessage purge module | Operator / iMessage | Production data audit: no pending purge jobs; runbook no longer references manual purge | Open — operational migration tooling |
| Legacy operator tool-call shape normalization | Agent core | Count persisted `OperatorContext` rows with old JSON shape; migrate or backfill before dropping reader | Open |
| Synchronous outbound email path | Email / messaging | `OUTBOUND_EMAIL_ASYNC` enabled in production; P4-01 recovery exercises complete; explicit async-only date from launch owner | Open — sync path is documented rollback rail |
| Old operator-context pending-plan JSON parsing | Operator channels | Audit production `PendingPlan` JSON; confirm no legacy-only rows after `20260723000000_add_operator_pending_plans` backfill | Open — tied to P1-03 compatibility window |
| WhatsApp-named BullMQ queue IDs | Gateway / platform | Repeatable-job listing in production Redis; explicit old-job removal + recreation plan if renamed | Open — storage compatibility names per AUD-021 |
| `OUTBOUND_SEND_SWEEP` legacy string | Gateway maintenance | Confirm job name is channel-agnostic in ops docs and no external automation keys off the old label | Open — cosmetic unless renamed |

## Product decisions blocking retirement

| Decision | Owner | Blocks |
| --- | --- | --- |
| Whether Sentry diagnostic routes remain operational tooling | Launch owner | ~~Sentry example routes~~ (resolved — removed) |
| Completion criteria/date for async-email-only operation | Launch owner / email | Sync outbound email path |
| Merchant UX for `unknown` external actions | Product | None of the above candidates directly, but affects recovery runbook ownership |

## Procedure per candidate

1. Assign owner in this table.
2. Gather positive non-use evidence (env scan, row counts, job listing, runbook review).
3. Remove one surface with tests and config/docs updates.
4. Record completion in this file with evidence summary and date.
