# Production Alerting Evidence

Record sign-off evidence for ops-alert log routing and Better Stack Level 1
observability. Better Stack paid tier is deferred until paid beta — see
[to-do-list.md](../to-do-list.md). Do not mark Level 1 configuration complete
until every row below is filled.

**Procedure:** [runbook.md](runbook.md) (Ops Alert Log Routing, Controlled Alert Validation)  
**Implementation reference:** [runbook.md](runbook.md) (Ops Alert Log Routing, Triage By Alert Category)  
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

The dashboard host in this baseline is historical. Since 2026-08-02 the dashboard
origin is `https://app.useshopkeeper.com`; the trigger commands below use it.

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
| Uptime monitor: dashboard `/api/health` (keyword `{"status":"ok"`) | ☑ | Configured 2026-07-31, Better Stack free tier. Route became liveness-only 2026-08-03 — see the scale-to-zero note below |
| Uptime monitor: gateway `/health` (keyword `{"status":"ok"`) | ☑ | Configured 2026-07-31, Better Stack free tier. Repointed off `/health/deep` 2026-08-03 — see the scale-to-zero note below |
| Gateway ops-alert → Telegram push | ☑ | Verified in production 2026-07-31 via `emit-controlled-ops-alert.ts queue_health`; both test alerts delivered |
| Dashboard ops-alert → Sentry capture | ☑ | Deployed `agent_failure` trigger verified 2026-08-07 (`POST /api/agent`, Palette test org); Vercel log `opsAlert:true category:agent_failure` at `2026-08-07T08:40:11.883Z`; no `[OpsAlert] Sentry capture errored`. Spot-check Sentry UI for `Repeated agent route failure: route=/api/agent` (CLI tokens here are `org:ci` only — no `event:read`) |
| Better Stack test notification sent | ☐ | Recipient: ___ Time: ___ |

### Uptime monitors must not query Postgres

Both uptime monitors originally polled a route that ran `SELECT 1`. At Better Stack's
3-minute interval that resets Neon's 5-minute scale-to-zero timer before it can ever
expire, so the compute never suspends and bills as always-on — roughly $19/mo against
about $7 with scale-to-zero working. Point monitors at the liveness routes
(`/api/health`, `/health`), which touch no dependency. Dependency coverage lives on
`/api/health/deep` and `/health/deep`; if you monitor those, use an interval well above
5 minutes so a wake cannot be held open.

## Controlled ops-alert validation

Temporarily set `OPS_ALERT_WINDOW_SECS=60` and threshold `1` for the category under test. Restore defaults after each row.

| Category | Trigger method | Log timestamp (UTC) | Better Stack alert received | Routed owner | Validated by | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `webhook_signature` | Unsigned `POST /webhooks/shopify` or `npm run verify:production:alerts -- --execute webhook_signature` | | ☐ | | | |
| `agent_failure` | Authenticated `POST /api/agent` (no plan) or `emit-controlled-ops-alert.ts agent_failure` | 2026-08-07T08:40:11.883Z | ☐ | launch owner | agent (automated) | Deployed trigger: Clerk session JWT → `POST https://app.useshopkeeper.com/api/agent` (no `approvedToolCalls`) ×3 → `400`. Test used `AGENT_FAILURE_ALERT_THRESHOLD=1`, `OPS_ALERT_WINDOW_SECS=60`; restored to `3` / `300` on Vercel production and redeployed 2026-08-07. Vercel log drain confirmed; Better Stack rule not exercised in this pass |
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

> **Sentry caveat (dashboard).** The same split applies to the dashboard's
> Sentry capture, for a different reason: `emit-controlled-ops-alert.ts` is a
> standalone `tsx` process, so `instrumentation.ts` never runs and
> `Sentry.captureMessage` is a no-op against an uninitialized client. Only the
> **[drain ✓]** `agent_failure` trigger — the authenticated `POST /api/agent` —
> exercises the capture, because only it raises the alert inside the deployed
> Next runtime.

**`webhook_signature` — [drain ✓] (deployed gateway)**

1. On Railway (gateway): `WEBHOOK_SIGNATURE_ALERT_THRESHOLD=1`, `OPS_ALERT_WINDOW_SECS=60`.
2. Fire unsigned requests at the live endpoint:

```bash
WEBHOOK_SIGNATURE_ALERT_THRESHOLD=1 \
DASHBOARD_URL=https://app.useshopkeeper.com \
GATEWAY_URL=https://clerk-production-e37f.up.railway.app \
npm run verify:production:alerts -- --execute webhook_signature
```

3. Expect `401` per request; the deployed gateway emits the alert.
4. Better Stack search: `opsAlert:true AND category:webhook_signature AND service:gateway`
5. Restore `WEBHOOK_SIGNATURE_ALERT_THRESHOLD=5` on Railway.

**`agent_failure` — [drain ✓] (deployed dashboard, authenticated)**

1. On Vercel (dashboard): `AGENT_FAILURE_ALERT_THRESHOLD=1`, `OPS_ALERT_WINDOW_SECS=60`.
2. As an authenticated test-org user, `POST https://app.useshopkeeper.com/api/agent`
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
