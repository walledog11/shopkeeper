# Production Observability Plan — Better Stack

**Vendor:** [Better Stack](https://betterstack.com/) (Telemetry, Uptime, Incidents, Errors).

**Launch (Level 1):** Better Stack Telemetry + log alert rules + uptime monitors — **required before production sign-off**.

**Post-launch (Level 2):** Better Stack Errors via Sentry-compatible SDK — **optional**, typically 2–4 weeks after launch.

Ops alerts emit `opsAlert: true` structured Pino log lines. This plan standardizes on Better Stack for production observability.

> **Vendor naming (corrected 2026-07-30).** Better Stack renamed the **Logs**
> product to **Telemetry**. Where this document said "Logs" it means the
> Telemetry product; log sources, drains and alert rules all live there now.

> **Sentry status (corrected 2026-07-30).** The claim that "Sentry was removed on
> 2026-06-07 in favor of structured Pino logs only" is stale. Sentry was removed
> in commit `d5f9b7a`, then **sentry.io was later re-added for the dashboard
> only**: `@sentry/nextjs` in `apps/dashboard/package.json`,
> `src/sentry.server.config.ts`, `src/sentry.edge.config.ts`,
> `src/instrumentation-client.ts`, `onRequestError` in `src/instrumentation.ts`,
> and `withSentryConfig` in `next.config.js` — pointed at a hardcoded default
> `ingest.us.sentry.io` DSN, not a Better Stack ingestion endpoint. The gateway
> still has no error SDK.
>
> This partly supersedes Level 2 below, which was written assuming a clean slate
> and no sentry.io account. **Needs an owner call before Level 2 is implemented:**
> keep dashboard errors on sentry.io and scope Level 2 to the gateway, or
> re-point the dashboard DSN at Better Stack for one vendor. Until that call,
> read Level 2 as the gateway plan plus a dashboard migration, and note that the
> hardcoded fallback DSN means the dashboard ships errors to sentry.io whether or
> not `SENTRY_DSN` is configured.

## Summary

| Layer | Level | Required for launch? | Better Stack product |
|-------|-------|---------------------|----------------------|
| Structured Pino logs + `opsAlert: true` | — | Yes (code done) | Telemetry (via drains) |
| Log alert rules (4 categories) | 1 | **Yes — launch gate** | Telemetry → alert rules |
| HTTP health uptime monitors | 1 | **Yes — launch gate** | Uptime |
| Error grouping + source-mapped stacks | 2 | No — post-launch | Errors |
| Client/browser error capture | 2 | No — post-launch | Errors (Sentry-compatible SDK) |

| Service | Platform | Level 2 SDK | Source maps |
|---------|----------|-------------|-------------|
| `apps/dashboard` (Next.js 16) | Vercel | `@sentry/nextjs` → Better Stack DSN | `withSentryConfig` → Better Stack upload URL |
| `apps/gateway` (Express + BullMQ) | Railway | `@sentry/node` → Better Stack DSN | `sentry-cli` → Better Stack upload URL |

Use **two Better Stack Error applications** (`shopkeeper-dashboard`, `shopkeeper-gateway`) so BullMQ worker noise does not drown out dashboard regressions. Tag both with `service: dashboard | gateway`.

## Launch vs post-launch

### Launch gate (Level 1 — complete before sign-off)

Do **not** block launch on Level 2. Block launch only if Better Stack Level 1 is incomplete:

- [ ] Better Stack team and escalation policy configured for launch owner (**paid tier** — see cost gates below)
- [ ] Vercel log drain → Better Stack Telemetry HTTP source (Production + Preview) (**requires Vercel Pro/Enterprise**)
- [ ] Railway logs → Better Stack Telemetry HTTP source via a forwarder service (**Railway has no native log drain**)
- [ ] Log alert rules for all four categories: `opsAlert` + `category=queue_health|webhook_signature|provider_send|agent_failure`
- [ ] Three uptime keyword monitors (dashboard health, gateway deep health, gateway queue health) — see [runbook.md](runbook.md)
- [ ] One controlled alert validated per ops-alert category
- [ ] `OPS_ALERTS_ENABLED=false` kill switch verified

**Cost gates (recorded 2026-06-26).** Three of the items above are behind
paywalls, which is why this whole gate is deferred until the first real merchant
or paid beta:

- Custom Vercel log drains require a **Vercel Pro or Enterprise** plan.
- Railway has **no native log drain** — forwarding gateway logs needs a forwarder
  service (e.g. the Locomotive template), not a settings toggle.
- Better Stack's **free tier excludes escalation policies, sub-3-minute check
  frequency, and phone/SMS paging** (escalation and on-call start at the paid
  tier). Free gives email and Slack alerts with 3-day / 3 GB retention.

**Free interim option (~15 min, no paywall):** create only the three uptime
monitors as HTTP keyword checks at 3-minute frequency with email alerts. That
answers "is production up?" without a Vercel upgrade or a Better Stack paid plan.
Log drains, alert rules, controlled validation and kill-switch sign-off all wait.

See Phase 5 in [operational-guardrails.md](operational-guardrails.md) and the External Monitors / Ops Alert Log Routing sections in [runbook.md](runbook.md).

**Go/no-go:** Production is safe to launch when Level 1 is done. Better Stack Errors (Level 2) is not part of this gate.

### When to implement Level 2 (Better Stack Errors)

Implement **after** Level 1 is validated — typically 2–4 weeks post-launch.

**Implement sooner if:**

- An incident occurred but no ops alert fired (gap outside the four categories)
- Triage routinely takes >15–30 minutes searching logs in Better Stack
- Users report client-side errors invisible in server logs
- Deploy regressions are hard to correlate without release grouping

**Can defer longer if:**

- Log alert rules catch every production incident
- Runbook steps resolve issues from structured logs alone
- Traffic is low and log search in Better Stack is sufficient

## Level 1 — Launch observability (Better Stack Telemetry + Uptime)

No application code changes. Configure in the Better Stack console and platform log drains.

### 1. Better Stack Telemetry — HTTP sources

Create two HTTP log sources (or one shared source with distinct tags if you prefer):

- `shopkeeper-dashboard` — Vercel stdout/stderr
- `shopkeeper-gateway` — Railway stdout/stderr

From each source's **Configure** page, copy the ingesting host and source token.

### 2. Vercel log drain

Per [Better Stack Vercel docs](https://betterstack.com/docs/logs/vercel/log-drain/):

1. Vercel → Team Settings → Log Drains → Add → Custom Log Drain
2. Select the dashboard project; sources: Functions, Builds (optional), Edge
3. Delivery format: **NDJSON**
4. Endpoint: `https://$INGESTING_HOST`
5. Custom header: `Authorization: Bearer $SOURCE_TOKEN`

**Note:** Custom Vercel log drains require Vercel Pro or Enterprise. Alternatively, use Better Stack's Vercel marketplace integration for simpler setup if available on your plan.

### 3. Railway logs → Better Stack

**Railway has no native log-drain setting.** There is no Railway → service →
Settings toggle that forwards logs to an HTTP source; earlier revisions of this
document described one that does not exist. Forwarding gateway logs requires
deploying a **forwarder service** into the Railway project — e.g. the Locomotive
template — which subscribes to the project's logs and POSTs them to the Better
Stack HTTP source using the same `Authorization: Bearer $SOURCE_TOKEN` header
pattern.

Budget for this as a deployed service with its own cost and failure mode, not a
settings change. Until it exists, gateway logs are readable only in the Railway
log view.

### 4. Log alert rules (ops-alert paging)

Better Stack log alerting is **query/threshold-based on a saved Telemetry chart**,
not keyword matching on raw lines. For each category: build a chart that filters
the structured fields, save it, then attach an alert rule that fires when the
result count crosses a threshold over a window (e.g. `> 0` in 5 minutes).

| Rule | Chart filter |
|------|--------------|
| Queue health | `opsAlert` AND `category=queue_health` |
| Webhook signature | `opsAlert` AND `category=webhook_signature` |
| Provider send | `opsAlert` AND `category=provider_send` |
| Agent failure | `opsAlert` AND `category=agent_failure` |

This is why the ops-alert logs carry stable `category` / `service` / `fingerprint`
fields — the alert rule filters on parsed structure, so a phrasing change in a log
message must not change those field values.

Route all four to the same launch escalation policy. Do **not** route by `orgId` — it fragments platform-wide incidents.

**Log alert rules remain the sole paging channel** at launch and after Level 2 is added, unless explicitly changed later.

### 5. Uptime monitors

Configure the three HTTP keyword monitors documented in [runbook.md](runbook.md) under External Monitors:

- `Shopkeeper Dashboard Health` → `/api/health` → `"status":"ok"`
- `Shopkeeper Gateway Deep Health` → `/health/deep` → `"status":"ok"`
- `Shopkeeper Gateway Queue Health` → `/health/queues` → `"healthy":true`

Use 60s check frequency, 60s confirmation period, US region, same escalation policy as log alerts.

### What Level 1 does not cover

- Unhandled exceptions that never log at `error` level or cross an ops-alert threshold
- Client-side / browser React errors (server log drains only see stdout)
- Automatic issue grouping across similar stack traces (log search only)

These gaps are acceptable at launch. Level 2 closes them if needed.

## Level 2 — Better Stack Errors (post-launch)

Better Stack accepts events from Sentry-compatible SDKs. Point the DSN and source-map upload config at Better Stack — not sentry.io.

Docs:

- [Sentry SDK → Better Stack](https://betterstack.com/docs/errors/collecting-errors/sentry-sdk/)
- [Source map upload](https://betterstack.com/docs/errors/collecting-errors/upload-source-maps/)

### Prior setup to restore

The repo previously had a working Sentry integration (removed in commit `d5f9b7a`). Note the correction at the top of this document: the **dashboard** has since been re-wired to sentry.io directly, so the list below is now accurate for the **gateway** and describes a re-pointing job for the dashboard. Restore these patterns with Better Stack endpoints:

- Opt-in init when `SENTRY_DSN` is set — local dev, CI, and e2e work without error tracking
- Shared `resolveRelease()` using `RAILWAY_GIT_COMMIT_SHA` / `VERCEL_GIT_COMMIT_SHA`
- Shared `scrubErrorEvent()` in `packages/agent/observability` to strip tokens, emails, bodies, and cookies
- Ops alerts stay Pino-only for paging; optional dual-write to Better Stack Errors for triage grouping only (no duplicate alert rules)
- Gateway source maps uploaded post-`tsc` via build script

### Prior gap (gateway ESM boot)

Sentry SDK initialization must load **before** other modules via `node --import`. `start.ts` spawns server + worker children — both must load the instrument module first:

```typescript
spawn(process.execPath, [
  '--import', resolve(distDir, 'instrument.js'),
  resolve(distDir, entryFile),
], { stdio: 'inherit', env: process.env });
```

Also update `start:server` / `start:worker` scripts for split Railway services (`GATEWAY_RUNTIME_ROLE=server|worker`).

### Better Stack application setup

1. Better Stack → Errors → Applications
2. Create `shopkeeper-dashboard` and `shopkeeper-gateway`
3. From each application's **Data ingestion** tab, copy:
   - Application token
   - Ingesting host
   - Application ID
4. Build DSN: `https://$APPLICATION_TOKEN@$INGESTING_HOST/$APPLICATION_ID`
5. For source maps, copy team ID (org), application ID (project), source-map upload URL, and create a Telemetry API token

### Dashboard (Vercel)

Do **not** run `npx @sentry/wizard -i nextjs` at the monorepo root — it will not understand the `apps/dashboard` layout.

#### Env vars (Vercel project settings)

| Variable | Environments | Scope | Notes |
|----------|--------------|-------|-------|
| `SENTRY_DSN` | Production, Preview | Runtime | Better Stack DSN; server and edge |
| `NEXT_PUBLIC_SENTRY_DSN` | Production, Preview | Runtime | Same DSN; browser SDK |
| `SENTRY_AUTH_TOKEN` | Production, Preview | Build | Better Stack Telemetry API token |
| `SENTRY_ORG` | Production, Preview | Build | Better Stack team ID |
| `SENTRY_PROJECT` | Production, Preview | Build | Better Stack application ID |
| `SENTRY_URL` | Production, Preview | Build | Better Stack source-map upload URL (e.g. `https://us-east-9-sourcemaps.betterstackdata.com`) |

Release tracking uses `VERCEL_GIT_COMMIT_SHA` via `resolveRelease()`.

#### Code files

Add under `apps/dashboard`:

```
apps/dashboard/
  sentry.server.config.ts
  sentry.edge.config.ts
  instrumentation-client.ts      # browser init (Next 15+ pattern)
  src/instrumentation.ts         # extend existing file
  src/lib/observability/errors.ts
```

Wrap `next.config.js` with `withSentryConfig`:

```js
const { withSentryConfig } = require('@sentry/nextjs');

module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sentryUrl: process.env.SENTRY_URL,
  silent: !process.env.CI,
  // tunnelRoute: '/monitoring',  // optional; see CSP note below
});
```

Extend the existing `instrumentation.ts`:

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.SENTRY_DSN) {
      await import('../sentry.server.config');
    }
    validateDashboardEnv();
    // ... existing DNS setup
  }
  if (process.env.NEXT_RUNTIME === 'edge' && process.env.SENTRY_DSN) {
    await import('../sentry.edge.config');
  }
}
```

Shared server/edge config:

- `dsn: process.env.SENTRY_DSN`
- `release: resolveRelease()`
- `sendDefaultPii: false`
- `beforeSend: errorBeforeSend`

#### CSP (if using `tunnelRoute`)

Dashboard CSP is report-only today. If a tunnel route is added to avoid ad-blockers, add `connect-src` entries for the Better Stack ingest host and the tunnel path before moving to enforcement.

### Gateway (Railway)

#### Instrument module

```typescript
// apps/gateway/src/instrument.ts
import * as Sentry from '@sentry/node';
import { resolveRelease, errorBeforeSend } from '@shopkeeper/agent/observability';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'production',
    release: resolveRelease(),
    sendDefaultPii: false,
    beforeSend: errorBeforeSend,
    enableLogs: true,
    integrations: [Sentry.pinoIntegration({ log: { levels: ['warn', 'error'] } })],
    tracesSampleRate: 0.1,
  });
}
```

#### Express error handler

After all routes in `index.ts`:

```typescript
Sentry.setupExpressErrorHandler(app);
```

#### Source maps in Railway build

Restore the build step in `railway.json` and `nixpacks.toml`:

```json
"buildCommand": "... && npm run build -w apps/gateway && npm run upload-sourcemaps -w apps/gateway"
```

Restore `scripts/upload-sourcemaps.mjs` (or equivalent) pointed at Better Stack's upload URL. Railway build-time env vars:

- `SENTRY_AUTH_TOKEN` (Better Stack Telemetry API token)
- `SENTRY_ORG` (team ID)
- `SENTRY_PROJECT` (application ID)
- `SENTRY_URL` (source-map upload URL)
- `SENTRY_RELEASE` (optional; `RAILWAY_GIT_COMMIT_SHA` is auto-set)

### Shared package (`packages/agent/observability`)

Restore these exports (removed 2026-06-07):

- `resolveRelease()` — returns `shopkeeper@${VERCEL_GIT_COMMIT_SHA | RAILWAY_GIT_COMMIT_SHA | SENTRY_RELEASE}`
- `scrubErrorEvent()` — strip tokens, emails, bodies, cookies from event payloads
- `errorBeforeSend()` — thin wrapper used by both SDKs

Per-app thin wrappers:

- `apps/dashboard/src/lib/observability/errors.ts`
- `apps/gateway/src/observability/errors.ts`

Critical for a support-commerce app handling customer emails and OAuth tokens.

## Environment Variables

| Variable | Dashboard (Vercel) | Gateway (Railway) | Level |
|----------|-------------------|-------------------|-------|
| Better Stack source token | Log drain header | Log drain header | 1 |
| `SENTRY_DSN` | Runtime | Runtime | 2 |
| `NEXT_PUBLIC_SENTRY_DSN` | Runtime | — | 2 |
| `SENTRY_AUTH_TOKEN` | Build | Build | 2 |
| `SENTRY_ORG` | Build | Build | 2 |
| `SENTRY_PROJECT` | Build | Build | 2 |
| `SENTRY_URL` | Build | Build | 2 |
| `SENTRY_RELEASE` | Optional override | Optional override | 2 |
| `OPS_ALERTS_ENABLED` | Both | Both | 1 |

**Do not** add `SENTRY_DSN` to `validateDashboardEnv()` or `validateGatewayEnv()` boot requirements. Keep Level 2 opt-in so CI, e2e, and local dev do not need Better Stack Errors.

Update `apps/dashboard/.env.example` and `apps/gateway/.env.example` with commented Level 2 vars when implemented.

## Phased Rollout

### Phase 0 — Level 1 launch observability (now)

Handled primarily by [operational-guardrails.md](operational-guardrails.md) and [runbook.md](runbook.md):

- Better Stack Telemetry HTTP sources + Vercel drain and Railway forwarder
- Log alert rules on four ops-alert categories
- Uptime monitors on three health endpoints
- Controlled alert validation + escalation policy

**Go/no-go:** Launch when Phase 0 is done.

### Phase 1 — Level 2 errors only (post-launch)

- Restore shared scrubbing + release helpers in `packages/agent/observability`
- Dashboard: `@sentry/nextjs` + Better Stack DSN and upload env vars
- Gateway: `instrument.ts` + `--import` + Express error handler
- Restore gateway source map upload script and Railway build step
- Verify with a test exception in staging — confirm issue in Better Stack Errors with readable stack trace
- Do **not** enable Better Stack alert rules on ops-alert dual-write events

### Phase 2 — Observability depth

- `tracesSampleRate: 0.1` on dashboard and gateway
- Propagate `sentry-trace` / `baggage` on dashboard → gateway internal calls (`GATEWAY_INTERNAL_URL`)
- `pinoIntegration` on gateway (warn/error levels)

## What to Avoid

1. **Treating Level 2 as a launch blocker** — Level 1 log-drain ops alerts are the v1 paging channel.
2. **Launching with neither log drains nor error tracking** — no production paging at all.
3. **Adding a second error vendor by accident** — this originally read "adding sentry.io," but the dashboard already reports to sentry.io (see the correction at the top). Resolve that split deliberately rather than letting a Better Stack gateway SDK land beside it unnoticed.
4. **One error application for everything** — BullMQ worker noise will bury dashboard regressions.
5. **Wizard at monorepo root** — paths and build commands will not match this layout.
6. **Init inside route handlers** — too late for auto-instrumentation; use `instrumentation.ts` / `--import`.
7. **Making DSN required at boot** — breaks local dev and test pipelines.
8. **Replacing Pino ops alerts** — keep `opsAlert: true` logs; Better Stack Errors complements them.
9. **Duplicate paging** — do not alert on the same ops-alert threshold in both log drains and Better Stack Errors.
10. **High `tracesSampleRate` on day one** — BullMQ workers generate many spans.

## Implementation Checklist

### Level 1 — launch (do first)

- [ ] Create Better Stack team + escalation policy for launch owner (paid tier)
- [ ] Create Telemetry HTTP sources for dashboard and gateway
- [ ] Configure Vercel log drain → Better Stack (needs Vercel Pro/Enterprise)
- [ ] Deploy a Railway log forwarder service → Better Stack (no native drain exists)
- [ ] Create saved charts + threshold alert rules for four ops-alert categories
- [ ] Create three uptime keyword monitors (see runbook)
- [ ] Validate one controlled alert per category
- [ ] Complete operational-guardrails Phase 5 gate

### Level 2 — Better Stack Errors (post-launch)

#### Better Stack setup

- [ ] Create `shopkeeper-dashboard` Errors application
- [ ] Create `shopkeeper-gateway` Errors application
- [ ] Create Telemetry API token for source map uploads

#### Code changes

- [ ] Add `@sentry/nextjs` to `apps/dashboard`
- [ ] Add `@sentry/node` to `apps/gateway`
- [ ] Restore `packages/agent/observability` error helpers + tests
- [ ] Add dashboard config files and wrap `next.config.js`
- [ ] Extend `apps/dashboard/src/instrumentation.ts`
- [ ] Add `apps/gateway/src/instrument.ts` and fix `start.ts` `--import`
- [ ] Add `Sentry.setupExpressErrorHandler` to gateway Express app
- [ ] Restore gateway source map upload script and Railway build step

#### Platform config

- [ ] Set Vercel Level 2 env vars (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_URL`)
- [ ] Set Railway Level 2 build + runtime env vars
- [ ] Update `.env.example` files

#### Verification

- [ ] Confirm Level 1 log-drain ops alerts still fire independently
- [ ] Trigger test exception on dashboard staging — readable stack trace in Better Stack Errors
- [ ] Trigger test exception on gateway staging — source-mapped stack trace
- [ ] Cross an ops-alert threshold — confirm `opsAlert: true` in Logs; no duplicate Errors alert rule
- [ ] Confirm local dev and CI pass without `SENTRY_DSN` set

## Open Concerns

### Alert routing overlap

Ops alerts emit `opsAlert: true` Pino logs into Better Stack Telemetry. **Keep log alert rules as the sole paging channel.** Level 2 dual-write to Better Stack Errors is for triage grouping only — do not enable Errors alert rules on ops-alert captures unless log paging is retired.

### Event scrubbing must stay in sync with log redaction

OAuth and provider token leakage was fixed in Pino via `PINO_REDACT_PATHS`. `scrubErrorEvent()` must apply the same policy to error event context, breadcrumbs, and exception messages. Add redaction tests alongside restored helpers.

### CSP and client SDK

Dashboard CSP is still report-only, but it is no longer the loose policy this section assumed: since the 2026-07-30 nonce migration `unsafe-eval` is dev-only, `script-src` carries a per-request nonce with `'strict-dynamic'`, and the policy is built in `apps/dashboard/src/proxy.ts` rather than `next.config.js`. If `tunnelRoute` or direct ingest hosts are enabled for a client SDK, add the `connect-src` entries in `src/proxy/content-security-policy.ts` and coordinate with the broader CSP enforcement pass.

## Alternatives (if Better Stack Errors is insufficient)

| Need | Alternative |
|------|-------------|
| Sentry-class error UX, session replay | sentry.io (if access restored) or Highlight.io |
| Sentry SDK compatible, self-host | GlitchTip, Bugsink |
| Logs-only at scale | Axiom (replace or supplement Better Stack Telemetry) |

Do not add a second error-tracking vendor alongside Better Stack Errors without a clear split (e.g. logs in Axiom, errors in Better Stack).

## Related Docs

- [operational-guardrails.md](operational-guardrails.md) — ops alert categories, thresholds, Phase 5 gate
- [runbook.md](runbook.md) — uptime monitors, controlled alert validation, sign-off evidence
- [deployment.md](deployment.md) — deploy order and build commands
