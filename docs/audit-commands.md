# Audit commands (when to run)

Production audits live in the root `package.json` scripts. Use them as **gates**
for retirements and rollouts — not as daily lint. Pair with
[compatibility-retirement-backlog.md](./compatibility-retirement-backlog.md) for
what each audit still blocks.

## Operator and channel compatibility

| Command | Run when |
| --- | --- |
| `npm run audit:operator-context-compatibility` | Before removing identity-less queue handling or changing `operator_contexts` shape. Use `--strict` on retirement PRs. |
| `npm run audit:retired-channel-types` | After channel enum migrations: confirms no rows reference retired values and the live Postgres enum matches. Use `--strict` before `db:migrate:deploy` when a migration recreates `ChannelType`. |

## Platform and messaging infrastructure

| Command | Run when |
| --- | --- |
| `npm run audit:bullmq-compatibility-names` | Before renaming BullMQ queue or repeatable job IDs. |
| `npm run audit:agent-action-operation-keys` | Before `migrate deploy` on any database carrying `agent_actions` history. Gates `20260912160000_add_agent_action_dispatch_lifecycle`, whose duplicate-key `RAISE` is the only data-dependent abort in the pending queue — a schema-only migration replay cannot surface it. Use `--strict`. |
| `npm run audit:outbound-email-mode` | Before dropping the synchronous outbound email rollback path. |

## Agent and product rollouts

| Command | Run when |
| --- | --- |
| `npm run audit:plan-executions` | During agent execution or ledger rollouts. |
| `npm run audit:conversational-overhaul-p0` | During agent runtime v1 retirement and Package 6 rollout (cached-plan / pending-plan inventory). |
| `npm run audit:classification-alignment` | After classifier contract or routing changes. |

## Repo hygiene

| Command | Run when |
| --- | --- |
| `npm run lint:structure` | Any PR that adds modules under `packages/agent/src` or `apps/dashboard/src/lib` (file/directory shadow check). |
| `npm run lint:knip` | After removing exports or dead code; baseline is enforced in CI. |
| `npm run verify:pr` | Before opening or updating a pull request (full local gate). |

Retire an audit script only when the **last** deferred candidate it measures is
removed from the compatibility backlog — never because the completed table looks
empty.
