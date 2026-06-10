# Production Alerting Evidence

Record sign-off evidence for ops-alert log routing and Better Stack Level 1 observability. Do not mark the production alerting to-do complete until every row below is filled.

**Procedure:** [runbook.md](runbook.md) (Ops Alert Log Routing, Controlled Alert Validation)  
**Implementation reference:** [operational-guardrails.md](operational-guardrails.md), [error-tracking-plan.md](error-tracking-plan.md)  
**Helper script:** `npm run verify:production:alerts`

## Baseline health (2026-06-09)

| Check | Result |
| --- | --- |
| `npm run verify:production` | Passed |
| Dashboard URL | `https://dashboard-shopkeeper.vercel.app` |
| Gateway URL | `https://clerk-production-e37f.up.railway.app` |
| Dashboard `/api/health` | `200`, `status=ok` |
| Gateway `/health/deep` | `200`, `status=ok` |
| Gateway `/health/queues` | `200`, `worker.healthy=true` |

## Better Stack Level 1 configuration

| Item | Status | Evidence |
| --- | --- | --- |
| Team + escalation policy for launch owner | ☐ | Policy name: ___ Owner: ___ |
| Vercel log drain → Better Stack (dashboard) | ☐ | Source name: ___ Configured at: ___ |
| Railway log drain → Better Stack (gateway) | ☐ | Source name: ___ Configured at: ___ |
| Log alert rule `queue_health` | ☐ | Rule id: ___ |
| Log alert rule `webhook_signature` | ☐ | Rule id: ___ |
| Log alert rule `provider_send` | ☐ | Rule id: ___ |
| Log alert rule `agent_failure` | ☐ | Rule id: ___ |
| Uptime monitor: dashboard `/api/health` | ☐ | Monitor id: ___ First pass: ___ |
| Uptime monitor: gateway `/health/deep` | ☐ | Monitor id: ___ First pass: ___ |
| Uptime monitor: gateway `/health/queues` | ☐ | Monitor id: ___ First pass: ___ |
| Better Stack test notification sent | ☐ | Recipient: ___ Time: ___ |

## Controlled ops-alert validation

Temporarily set `OPS_ALERT_WINDOW_SECS=60` and threshold `1` for the category under test. Restore defaults after each row.

| Category | Trigger method | Log timestamp (UTC) | Better Stack alert received | Routed owner | Validated by | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `webhook_signature` | Unsigned `POST /webhooks/shopify` or `npm run verify:production:alerts -- --execute webhook_signature` | | ☐ | | | |
| `agent_failure` | Authenticated `POST /api/agent` (no plan) or `emit-controlled-ops-alert.ts agent_failure` | | ☐ | | | |
| `provider_send` | `cd apps/dashboard && npx tsx src/scripts/emit-controlled-ops-alert.ts provider_send <test-org-id>` | | ☐ | | | |
| `queue_health` | `cd apps/gateway && npx tsx src/scripts/emit-controlled-ops-alert.ts queue_health` | | ☐ | | | |

### Expected log fields (all categories)

- `opsAlert: true`
- `category` — one of the four values above
- `service` — `dashboard` or `gateway`
- Category-specific tags (`route`, `provider`, `channel`, `queue`, `tool`) visible in Better Stack

## Kill switch verification

| Step | Result | Evidence |
| --- | --- | --- |
| Set `OPS_ALERTS_ENABLED=false` on dashboard | ☐ | Time: ___ |
| Threshold alert silenced; ordinary logs still flow | ☐ | |
| Restore `OPS_ALERTS_ENABLED=true` (or unset) | ☐ | Time: ___ |
| Repeat on gateway | ☐ | |

## Sign-off

- [ ] All four controlled alerts validated end-to-end (log drain → Better Stack rule → owner notification)
- [ ] Default thresholds restored on dashboard and gateway
- [ ] Evidence reviewed by launch owner

**Signed off by:** ___  
**Date:** ___
