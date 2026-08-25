# Compatibility Retirement Backlog (P9-02)

Evidence-gated removal of compatibility surfaces identified in the 2026-07-10
codebase audit (in git history). One candidate per pull request; never
batch unrelated retirements.

Last reviewed: 2026-08-25.

## Completed

| Candidate | Owner | Evidence | Removed |
| --- | --- | --- | --- |
| Sentry example page/API (`/sentry-example-page`, `/api/sentry-example-api`, `SENTRY_EXAMPLE_PAGE_ENABLED`) | Product engineering | Not referenced in production runbooks; gated outside development; zero production env usage expected | 2026-07-30 |
| Deprecated `GATEWAY_PUBLIC_URL` alias | Platform / dashboard | Dashboard reads only `GATEWAY_INTERNAL_URL`; legacy alias removed from `gateway-url.ts`, test harness, and production env checker | 2026-07-30 |
| Legacy `pending_plan` dual-read fallback | Operator channels | `npm run audit:operator-context-compatibility` reports zero `legacyPendingPlanColumn` and zero `dualReadFallbackRows` in production | 2026-07-30 |
| Legacy operator tool-call inline-input normalization | Agent core | Same audit reports zero `legacyToolCalls`; `normalizeApprovedToolCalls` now maps `input` only | 2026-07-30 |
| Legacy iMessage purge module | Operator / iMessage | `npm run audit:legacy-imessage-threads` reports zero active/soft-deleted `channel_type = imessage` rows; operator iMessage (`sms_agent` + bindings) unchanged | 2026-07-30 |
| `operator_contexts.pending_plan` column | Operator channels | Dual-read retired 2026-07-30; audit showed zero live rows in the column; migration `20260806120000_drop_operator_pending_plan_column` | 2026-08-06 |
| `AGENT_CONTEXT_BUDGET_MODE` and the legacy unbounded context branch | Agent core | Both hosts held `shadow`, which `6c6d79a5` aliased to `enforce`, so production was already on the bounded path; full 3-repeat eval baseline run on bounded context showed no regression attributable to the change. Flag, branch, gateway startup requirement, production env contract entry, P2-02 canary, and mode-comparison eval removed in `d0f76f2a`. Evidence: [agent-m2-evidence-2026-08-25.md](agent-m2-evidence-2026-08-25.md) | 2026-08-25 |

## Deferred — do not rename or remove without explicit migration / product sign-off

These remain in code on purpose. Renaming BullMQ queue/job strings orphans live
repeatable schedulers and can break operator digests and async outbound recovery
(including iMessage).

| Candidate | Owner | Gate | Status |
| --- | --- | --- | --- |
| Synchronous outbound email path | Email / messaging | `npm run audit:outbound-email-mode` shows `asyncEnabled=false` until P4-01 recovery exercises complete and launch owner sets an async-only date | Deferred — documented rollback rail |
| WhatsApp-named BullMQ queue IDs | Gateway / platform | `npm run audit:bullmq-compatibility-names` inventories live repeatable jobs; rename only after old Redis entries are removed and recreated | Deferred — storage compatibility names per AUD-021 |
| `OUTBOUND_SEND_SWEEP` legacy string | Gateway maintenance | Same BullMQ audit; sweep is channel-agnostic (email + iMessage) | Deferred — cosmetic rename blocked on Redis migration |
| `dashboard_agent` ChannelType enum value | Operator channels | Nothing has written it since the Concierge moved onto `sms_agent` operator threads (2026-08-06), but a Postgres enum value cannot be dropped while rows reference it — and historical rows do. Needs those rows re-channelled or purged first; the display mappings stay meanwhile so history still renders | Deferred — live rows reference it |

## Product decisions blocking retirement

| Decision | Owner | Blocks |
| --- | --- | --- |
| Completion criteria/date for async-email-only operation | Launch owner / email | Sync outbound email path |
| Merchant UX for `unknown` external actions | Product | None of the deferred candidates directly, but affects recovery runbook ownership |

## Procedure per candidate

1. Assign owner in this table.
2. Gather positive non-use evidence (env scan, row counts, job listing, runbook review).
3. Remove one surface with tests and config/docs updates.
4. Record completion in this file with evidence summary and date.

## Audit commands

```bash
npm run audit:operator-context-compatibility
npm run audit:legacy-imessage-threads
npm run audit:bullmq-compatibility-names
npm run audit:outbound-email-mode
```

Add `--strict` to any audit that supports it when gating a retirement PR.
