# Gateway message handlers layout

The gateway routes inbound jobs, support planning, operator turns, and outbound
email through modules under `apps/gateway/src/message-handlers/`. Each
subdirectory is a bounded context; keep new code in the folder that owns the
lifecycle, not at the tree root.

| Directory | Responsibility |
| --- | --- |
| `inbound/` | Channel workers, classification, persistence, attribution, AI summary enqueue |
| `support-plan/` | Customer-thread planning, plan notifications, agent thread sink |
| `operator/` | Merchant operator tools, free-form turns, pending-plan actions |
| `outbound/` | Async outbound email jobs |
| `shared/` | Cross-cutting display helpers (`request-display`, markdown stripping) |

Import from the subdirectory path, for example
`../message-handlers/inbound/inbound-persistence.js`.

Operator-channel durable state lives in `apps/gateway/src/operator-context/`
(serialization vs persistence), not under `message-handlers/`.
