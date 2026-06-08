# Sentry Integration Plan

This plan covers re-integrating Sentry for production error monitoring across the dashboard (Vercel) and gateway (Railway). It restores the prior integration shape with one structural fix for gateway ESM boot, and leans on each platform's native deploy hooks instead of a monolithic wizard run at the repo root.

Sentry was removed on 2026-06-07 in favor of structured Pino logs only. Ops alerts still emit `opsAlert: true` log lines. This plan adds Sentry back as a complement — not a replacement — for grouping, stack traces, release tracking, and alerting.

## Summary

| Service | Platform | Sentry SDK | Source maps |
|---------|----------|------------|-------------|
| `apps/dashboard` (Next.js 16) | Vercel | `@sentry/nextjs` | Vercel ↔ Sentry integration (build-time upload) |
| `apps/gateway` (Express + BullMQ) | Railway | `@sentry/node` | `sentry-cli` in Railway build step |

Use **two Sentry projects** (`shopkeeper-dashboard`, `shopkeeper-gateway`) so worker noise does not drown out dashboard regressions. Tag both with `service: dashboard | gateway` for cross-filtering.

## Prior Setup (What Worked)

The repo previously had a working Sentry integration (removed in commit `d5f9b7a`). The following patterns should be restored:

- Opt-in init when `SENTRY_DSN` is set — local dev, CI, and e2e work without Sentry.
- Shared `resolveSentryRelease()` using `RAILWAY_GIT_COMMIT_SHA` / `VERCEL_GIT_COMMIT_SHA`.
- Shared `scrubSentryEvent()` in `packages/agent/observability` to strip tokens, emails, bodies, and cookies.
- Ops alerts dual-wrote to Pino (`opsAlert: true`) **and** Sentry (`captureMessage` / `captureException`).
- Gateway source maps uploaded post-`tsc` via `scripts/sentry-upload-sourcemaps.mjs` in the Railway build.

## Prior Gap (What to Fix)

Sentry was initialized inside `index.ts` / `worker.ts` after other modules loaded. For ESM Node, Sentry requires loading an instrument module **before** everything else via `node --import`.

`start.ts` spawns two child processes (server + worker). Both must load the instrument module first:

```typescript
spawn(process.execPath, [
  '--import', resolve(distDir, 'instrument.js'),
  resolve(distDir, entryFile),
], { stdio: 'inherit', env: process.env });
```

Also update `start:server` / `start:worker` scripts for split Railway services (`GATEWAY_RUNTIME_ROLE=server|worker`).

## Dashboard (Vercel)

### 1. Install the Vercel ↔ Sentry integration

Per [Sentry's Vercel docs](https://docs.sentry.io/integrations/deployment/vercel/), this auto-injects:

- `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`
- `NEXT_PUBLIC_SENTRY_DSN` (or `SENTRY_DSN`)
- Release tracking tied to deploys

This removes the need for a custom upload token on Vercel.

Install from: https://vercel.com/integrations/sentry

### 2. Add `@sentry/nextjs` manually

Do **not** run `npx @sentry/wizard -i nextjs` at the monorepo root — it will not understand the `apps/dashboard` layout.

Add these files under `apps/dashboard`:

```
apps/dashboard/
  sentry.server.config.ts
  sentry.edge.config.ts
  instrumentation-client.ts      # browser init (Next 15+ pattern)
  src/instrumentation.ts         # extend existing file
  src/lib/observability/sentry.ts
```

Wrap `next.config.js` with `withSentryConfig`:

```js
const { withSentryConfig } = require('@sentry/nextjs');

module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // tunnelRoute: '/monitoring',  // optional; see CSP note below
});
```

Extend the existing `instrumentation.ts` (which already runs env validation on Node):

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

Shared server/edge config should use:

- `dsn: process.env.SENTRY_DSN`
- `release: resolveSentryRelease()`
- `sendDefaultPii: false`
- `beforeSend: sentryBeforeSend`

### 3. Restore ops-alert → Sentry capture

`emitOpsAlert` in `apps/dashboard/src/lib/server/ops-alerts.ts` previously accepted an injected `sentry` client and called `captureMessage` / `captureException`. Restore that dual-write path so queue health, webhook signature failures, provider send failures, and agent failures become Sentry issues — not just log lines.

Keep structured Pino logs as the primary observability contract. Sentry is for grouping, alerting, and stack traces.

### 4. CSP update (if using `tunnelRoute`)

The dashboard CSP in `next.config.js` is report-only today. If a Sentry tunnel is added to avoid ad-blockers, eventually add `connect-src` entries for `*.ingest.sentry.io` and the tunnel path before moving to enforcement.

### 5. Optional: Vercel log drains

Vercel can forward platform logs and traces to Sentry without code changes. Useful as a supplement to the SDK, not a replacement — Pino application logs will not flow through drains.

See: https://docs.sentry.io/integrations/deployment/vercel/

## Gateway (Railway)

### 1. Single instrument module, loaded before everything

```typescript
// apps/gateway/src/instrument.ts
import * as Sentry from '@sentry/node';
import { resolveSentryRelease, sentryBeforeSend } from '@shopkeeper/agent/observability';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'production',
    release: resolveSentryRelease(),
    sendDefaultPii: false,
    beforeSend: sentryBeforeSend,
    enableLogs: true,
    integrations: [Sentry.pinoIntegration({ log: { levels: ['warn', 'error'] } })],
    tracesSampleRate: 0.1,
  });
}
```

### 2. Fix `start.ts` to use `--import`

Update `apps/gateway/src/start.ts` so every spawned child loads the instrument module first (see Prior Gap above).

### 3. Express error handler

After all routes in `index.ts`:

```typescript
Sentry.setupExpressErrorHandler(app);
```

### 4. Source maps in Railway build

Restore the build step in `railway.json` and `nixpacks.toml`:

```json
"buildCommand": "... && npm run build -w apps/gateway && npm run upload-sourcemaps -w apps/gateway"
```

Restore `scripts/sentry-upload-sourcemaps.mjs` and the `upload-sourcemaps` script in `apps/gateway/package.json`.

Railway build-time env vars:

- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_RELEASE` (optional; `RAILWAY_GIT_COMMIT_SHA` is auto-set)

Railway has no first-class Sentry integration — manual `sentry-cli` upload at build time is the right approach.

### 5. Pino stays primary

Keep Pino as the source of truth for ops logs. Use `pinoIntegration` so warn/error logs correlate with traces and issues. Do not replace the `opsAlert: true` log contract.

Restore ops-alert Sentry capture in `apps/gateway/src/ops-alerts.ts` (same dual-write pattern as the dashboard).

## Shared Package (`packages/agent/observability`)

Restore these exports (removed with Sentry on 2026-06-07):

- `resolveSentryRelease()` — returns `shopkeeper@${VERCEL_GIT_COMMIT_SHA | RAILWAY_GIT_COMMIT_SHA | SENTRY_RELEASE}`
- `scrubSentryEvent()` — strip tokens, emails, bodies, cookies from event payloads
- `sentryBeforeSend()` — thin wrapper used by both SDKs

Per-app thin wrappers remain in:

- `apps/dashboard/src/lib/observability/sentry.ts`
- `apps/gateway/src/observability/sentry.ts`

This is important for a support-commerce app handling customer emails and OAuth tokens.

## Environment Variables

| Variable | Dashboard (Vercel) | Gateway (Railway) |
|----------|-------------------|-------------------|
| `SENTRY_DSN` | Runtime (set by integration) | Runtime |
| `SENTRY_AUTH_TOKEN` | Build (set by integration) | Build only |
| `SENTRY_ORG` | Build (set by integration) | Build only |
| `SENTRY_PROJECT` | Build (set by integration) | Build only |
| `SENTRY_RELEASE` | Optional override | Optional override |
| `OPS_ALERTS_ENABLED` | Both — keep existing flag | Both |

**Do not** add `SENTRY_DSN` to `validateDashboardEnv()` or `validateGatewayEnv()` boot requirements. Keep it opt-in so CI, e2e, and local dev do not need Sentry.

Update `apps/dashboard/.env.example` and `apps/gateway/.env.example` with commented Sentry vars.

## Phased Rollout

### Phase 1 — Errors only (ship first)

- Restore shared scrubbing + release helpers in `packages/agent/observability`
- Dashboard: `@sentry/nextjs` + Vercel integration
- Gateway: `instrument.ts` + `--import` + Express error handler
- Restore ops-alert Sentry capture in both apps
- Restore gateway source map upload script and Railway build step
- Verify with a test exception in staging

### Phase 2 — Observability depth

- `tracesSampleRate: 0.1` on dashboard and gateway
- Propagate `sentry-trace` / `baggage` on dashboard → gateway internal calls (`GATEWAY_INTERNAL_URL`)
- `pinoIntegration` on gateway (warn/error levels)

### Phase 3 — Platform extras

- Vercel log drains
- Sentry Crons for maintenance workers (digest, retention, queue-health)
- AI agent monitoring for tool-call spans if desired

## What to Avoid

1. **One Sentry project for everything** — BullMQ worker noise will bury dashboard regressions.
2. **Wizard at monorepo root** — paths and build commands will not match this layout.
3. **Init inside route handlers** — too late for auto-instrumentation; use `instrumentation.ts` / `--import`.
4. **Making DSN required at boot** — breaks local dev and test pipelines.
5. **Replacing Pino ops alerts** — keep `opsAlert: true` logs; Sentry complements them.
6. **High `tracesSampleRate` on day one** — BullMQ workers generate many spans.

## Implementation Checklist

### Sentry org setup

- [ ] Create `shopkeeper-dashboard` project in Sentry
- [ ] Create `shopkeeper-gateway` project in Sentry
- [ ] Install Vercel ↔ Sentry integration for the dashboard project
- [ ] Create org auth token for Railway gateway source map uploads

### Code changes

- [ ] Add `@sentry/nextjs` to `apps/dashboard`
- [ ] Add `@sentry/node` to `apps/gateway`
- [ ] Restore `packages/agent/observability` Sentry helpers + tests
- [ ] Add dashboard Sentry config files and wrap `next.config.js`
- [ ] Extend `apps/dashboard/src/instrumentation.ts`
- [ ] Add `apps/gateway/src/instrument.ts` and fix `start.ts` `--import`
- [ ] Add `Sentry.setupExpressErrorHandler` to gateway Express app
- [ ] Restore ops-alert dual-write in both apps
- [ ] Restore `scripts/sentry-upload-sourcemaps.mjs` and gateway build step

### Platform config

- [ ] Set Railway build env vars (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`)
- [ ] Set Railway runtime `SENTRY_DSN` for gateway project
- [ ] Confirm Vercel integration injected dashboard env vars
- [ ] Update `.env.example` files
- [ ] Update `deployment.md` and `runbook.md` — gateway build resumes source-map upload; dashboard build uses `withSentryConfig` on Vercel

### Verification

- [ ] Trigger test exception on dashboard staging — confirm issue in Sentry with readable stack trace
- [ ] Trigger test exception on gateway staging — confirm issue with source-mapped stack trace
- [ ] Cross an ops-alert threshold — confirm Sentry issue + `opsAlert: true` log line
- [ ] Confirm local dev and CI pass without `SENTRY_DSN` set

## Open Concerns

These are valid follow-ups specific to Sentry — not tracked in the production to-do list.

### Alert routing overlap

Ops alerts already emit `opsAlert: true` Pino logs routed via Vercel/Railway log drains (see [operational-guardrails.md](operational-guardrails.md) and [runbook.md](runbook.md)). After Sentry dual-write is restored, decide whether Sentry alert rules should fire on ops-alert captures or whether log-drain keyword alerts remain the sole paging channel. Avoid duplicate pages for the same threshold crossing.

### Event scrubbing must stay in sync with log redaction

OAuth and provider token leakage was fixed in Pino via `PINO_REDACT_PATHS` (see completed to-do: stop OAuth and provider token leakage in logs). `scrubSentryEvent()` must apply the same policy to Sentry request context, breadcrumbs, and exception messages. Add redaction tests alongside the restored Sentry helpers.

### CSP and client SDK

Dashboard CSP is still report-only with `unsafe-inline` and `unsafe-eval` (a separate production to-do). If `tunnelRoute` or direct `*.ingest.sentry.io` client reporting is enabled, coordinate CSP `connect-src` changes with the broader CSP enforcement pass — do not treat Sentry as a standalone CSP exception.

## Related Docs

- [deployment.md](deployment.md) — deploy order and build commands
- [runbook.md](runbook.md) — production verification and ops alert validation
- [operational-guardrails.md](operational-guardrails.md) — ops alert categories and thresholds
