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

### Re-verified (2026-06-24)

| Check | Result |
| --- | --- |
| Dashboard `/api/health` | `200`, `status=ok` (env/db/redis all `ok`) |
| Gateway `/health/deep` | `200`, `status=ok`, `worker.status=ok` |
| Gateway `/health/queues` | `200`, `worker.healthy=true`; `inbound` clean |
| `verify:production:alerts -- --dry-run` | Runs clean against both live URLs |

Note: gateway `aiSummary` queue carries one stale `failed` job (`id=6`,
`summarize-thread`, finished 2026-06-17) whose `failedReason` is an Anthropic
"credit balance too low" `400` from a prior credit lapse — not a current
incident, and below `QUEUE_ALERT_FAILED_THRESHOLD`. Clear it before controlled
`queue_health` validation if using the natural-emission path.

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

### Controlled trigger commands

Run in a safe production window with test org/user data only. URLs below are the
current production hosts.

> **Drain caveat.** Only logs emitted by the *deployed* app reach the
> Vercel/Railway → Better Stack drain. The `emit-controlled-ops-alert.ts` helpers
> run locally and log to *your terminal's stdout*, so they validate the
> threshold/counter logic but **do not** prove the drain path. For each category
> below, the **[drain ✓]** trigger is the one that fires from the deployed
> process and lands in Better Stack; **[counter-only]** triggers verify emit/TTL
> logic locally.

**`webhook_signature` — [drain ✓] (deployed gateway)**

1. On Railway (gateway): `WEBHOOK_SIGNATURE_ALERT_THRESHOLD=1`, `OPS_ALERT_WINDOW_SECS=60`.
2. Fire unsigned requests at the live endpoint:

```bash
WEBHOOK_SIGNATURE_ALERT_THRESHOLD=1 \
DASHBOARD_URL=https://dashboard-shopkeeper.vercel.app \
GATEWAY_URL=https://clerk-production-e37f.up.railway.app \
npm run verify:production:alerts -- --execute webhook_signature
```

3. Expect `401` per request; the deployed gateway emits the alert.
4. Better Stack search: `opsAlert:true AND category:webhook_signature AND service:gateway`
5. Restore `WEBHOOK_SIGNATURE_ALERT_THRESHOLD=5` on Railway.

**`agent_failure` — [drain ✓] (deployed dashboard, authenticated)**

1. On Vercel (dashboard): `AGENT_FAILURE_ALERT_THRESHOLD=1`, `OPS_ALERT_WINDOW_SECS=60`.
2. As an authenticated test-org user, `POST https://dashboard-shopkeeper.vercel.app/api/agent`
   with a valid test `threadId` and no approved plan → controlled `400`.
3. Better Stack search: `opsAlert:true AND category:agent_failure AND service:dashboard`
4. Restore `AGENT_FAILURE_ALERT_THRESHOLD=3` on Vercel.

  - [counter-only] alternative (local stdout, won't reach drain):
    `cd apps/dashboard && npx tsx src/scripts/emit-controlled-ops-alert.ts agent_failure <test-org-id>`

**`queue_health` — [drain ✓] (natural, deployed gateway maintenance worker)**

1. On Railway (gateway): `QUEUE_ALERT_FAILED_THRESHOLD=1`.
2. The existing stale `aiSummary` failed job (`id=6`) makes the next maintenance
   sweep emit `queue_health` from the deployed worker — no manual trigger needed.
   (Do this *before* clearing that job; clear it afterward.)
3. Better Stack search: `opsAlert:true AND category:queue_health AND service:gateway`
4. Restore `QUEUE_ALERT_FAILED_THRESHOLD=10` on Railway.

  - [counter-only] alternative (local stdout, won't reach drain):
    `cd apps/gateway && npx tsx src/scripts/emit-controlled-ops-alert.ts queue_health`

**`provider_send` — [counter-only] (no safe deployed trigger)**

No deployed-path trigger exists without breaking live provider credentials, which
the runbook forbids. Validate emit/counter logic locally; accept that this one
log won't transit the drain, and note that in the table.

```bash
cd apps/dashboard
npx tsx src/scripts/emit-controlled-ops-alert.ts provider_send <test-org-id>
```

Expect `provider=postmark channel=email`. Better Stack search (deployed
provider failures, when they occur naturally):
`opsAlert:true AND category:provider_send AND service:dashboard`

After validation: restore default thresholds, set `OPS_ALERTS_ENABLED=false` on
each app to confirm threshold alerts go silent while ordinary logs still flow,
then unset it.

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
