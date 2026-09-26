# Gateway operational scripts

One-off and production-adjacent utilities for the Railway gateway service. They are
**not** imported by the running server. Repo-wide audit gates live under
`scripts/` at the repository root — see
[docs/audit-commands.md](../../../../docs/audit-commands.md).

Run with production credentials only when the script header or runbook says so.
Prefer `railway run` (or the env file noted in each file) over copying secrets locally.

## npm wrappers (preferred entry points)

These are wired in the root `package.json` and are the supported way to invoke
the matching script:

| npm script | Script |
| --- | --- |
| `npm run audit:shopify-webhooks` | `inspect-shopify-webhooks.ts` |
| `npm run audit:classification-recovery` | `audit-classification-recovery.ts` |
| `npm run canary:agent-rollout` | `canary-agent-rollout.ts` |
| `npm run canary:agent-briefings` | `canary-agent-briefing.ts` |
| `npm run canary:classification` | `canary-classification-write.ts` |
| `npm run canary:lock-renewal` | `canary-lock-renewal.ts` |

## Categories

**Canaries** — bounded production checks with dry-run defaults where possible.
Examples: `canary-*`, `verify-briefing-reply.ts`, `verify-digest-ordinal.ts`,
`verify-digest-copy.ts`, `realtime-smoke.ts`, `exercise-queue-recovery.ts`.

**Staging / fixtures** — seed or stage state for a manual exercise. Examples:
`stage-pending-plan.ts`, `stage-digest.ts`, `stage-order-flag-notification.ts`,
`episode-run-preflight.ts`.

**Inspect / diagnose** — read-only dumps of threads, plans, queues, or usage.
Examples: `inspect-*`, `peek-operator-state.ts`, `diagnose-operator-thread.ts`,
`find-operator-org.ts`, `measure-agent-prompt.ts`.

**Backfills** — data migrations with explicit `CONFIRM=1` or similar guards.
Examples: `backfill-thread-titles.ts`, `backfill-operator-keys.ts`,
`rebuild-bad-summaries.ts`, `backdate-episode-clock.ts`.

**Probes** — narrow live experiments (typing, complex tickets, iMessage).
Examples: `probe-complex-ticket.ts`, `probe-imessage-typing.ts`.

**Queue maintenance** — failed job inspection and removal.
Examples: `inspect-failed-queue-jobs.ts`, `remove-failed-queue-job.ts`.

**Integrations** — `set-telegram-webhook.ts`, `canary-outbound-gmail.ts`.

**Cleanup** — dev or livetest data only unless documented otherwise.
Example: `cleanup-livetest-data.ts`.

## Adding a script

Pick a prefix (`canary-`, `inspect-`, `stage-`, `backfill-`, `probe-`) that matches
the lifecycle. Document required env vars in the file header. If operators will run
it repeatedly, add an `npm run` alias in the root `package.json` and a row in
[docs/audit-commands.md](../../../../docs/audit-commands.md) when it is a retirement
or rollout gate.
