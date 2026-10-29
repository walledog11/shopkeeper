# Audit commands (when to run)

Production audits live in the root `package.json` scripts. Use them as **gates**
for retirements and rollouts — not as daily lint. The deferred compatibility
retirements each audit still blocks are in [ROADMAP.md](./ROADMAP.md): BullMQ
names and the synchronous email rail under *Decisions on record*, the
identity-less operator queue reader under *Later → Production leftovers*.

## Operator and channel compatibility

| Command | Run when |
| --- | --- |
| `npm run audit:operator-context-compatibility` | Before removing identity-less queue handling or the legacy tool-call shape, or changing `operator_contexts` shape. A queued plan is identity-less exactly when the queue's own liveness check would drop it as `identity_incomplete`. `--strict` fails while either reader still has a row to read. |
| `npm run audit:retired-channel-types` | After channel enum migrations: confirms no rows reference retired values and the live Postgres enum matches. Use `--strict` before `db:migrate:deploy` when a migration recreates `ChannelType`. |

**Production channel migrations:** run
`SHOPKEEPER_DB_TARGET=prod npm run audit:retired-channel-types -- --strict`, then
`npm run db:migrate:deploy` with production credentials (Migrations in the
[runbook](./production/runbook.md)); repeat after each pending migration that
recreates `ChannelType`.

`audit:retired-channel-types` queries raw SQL against `::text` on purpose. Retired
members are gone from the Prisma client, so filtering on a removed enum member
through Prisma reads `undefined` as no filter and silently counts every row. Any
audit that gates a channel retirement must cast to text the same way.

## Platform and messaging infrastructure

| Command | Run when |
| --- | --- |
| `npm run audit:bullmq-compatibility-names` | Before renaming BullMQ queue or repeatable job IDs. |
| `npm run audit:agent-action-operation-keys` | Before `migrate deploy` on any database carrying `agent_actions` history. Gates `20260912160000_add_agent_action_dispatch_lifecycle`, whose duplicate-key `RAISE` is data-dependent — a schema-only migration replay cannot surface it. Use `--strict`. |
| `npm run audit:outbound-email-mode` | Before dropping the synchronous outbound email rollback path. |
| `npm run audit:email-inbound-transport` | Email inbound steady-state: dual Gmail+Postmark integrations and dual-delivery risk. Use `--strict` after integration changes. |

## Agent and product rollouts

| Command | Run when |
| --- | --- |
| `npm run audit:plan-executions` | During agent execution or ledger rollouts. |
| `npm run audit:agent-runtime-retirement -- --strict` | Before removing a retained runtime-compatibility reader. Read-only aggregate inventory of task versions, proposals, unknown operations, stored cache versions and current cards; `--strict` fails unless every `licenses` flag holds (no actionable non-v2 work, no approvable card without a durable proposal). |

## Repo hygiene

| Command | Run when |
| --- | --- |
| `npm run lint:structure` | Any PR that adds modules under `packages/agent/src` or `apps/dashboard/src/lib` (file/directory shadow check) or edits docs: it also fails when a `path:LINE` citation in `docs/`, `.claude/CLAUDE.md` or `README.md` no longer resolves, and checks test-config overlap and coverage workspaces. |
| `npm run lint:knip` | After removing exports or dead code. Fails on unused files, dependencies, unlisted imports, binaries and duplicate exports, which in CI skips Build, Integration and E2E; unused export and type counts are printed, not enforced. |
| `npm run verify:pr` | The aggregate CI gate. Leave it to CI; run it locally only when a failure or a broad change justifies it ([TESTING.md](../TESTING.md)). |

## Agent cost

| Command | Run when |
| --- | --- |
| `railway run npx tsx apps/gateway/src/scripts/inspect-turn-usage.ts` | Before changing capability discovery or operator tool sets, or when turns stop on `token_budget`. Reads `agent_turn_usage`; filter with `ORG_ID=<uuid>`, `HOURS` (default 24), `PURPOSE` (`agent_plan`, `operator_turn`, `agent_run`, `composer_ask`) and `LIMIT` (default 50). |

`rebuilt` is the part of the 1h cache write made after the first model call: the
stable prefix rewritten mid-turn because the tool set changed, which on
`agent_plan` turns is capability discovery. A cold cache shows only in the first
call's share. Read `1h-write` against `cache-read`, never on its own: a warm turn
shows `1h-write 0` beside a large `cache-read`. `first` near the budget means a
cold cache; a small `first` with a large `total` means a loop.

Retire an audit script only when the **last** deferred candidate it measures is
removed from the roadmap — never because the list looks empty.
