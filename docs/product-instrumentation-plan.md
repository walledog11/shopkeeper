# Product instrumentation plan — PostHog

**Status:** Planned  
**Last updated:** 2026-06-28  
**Owner:** Product engineering

## Goal

Measure the merchant activation funnel with server-mediated, pseudonymous organization-level events.

A workspace qualifies as activated when, within seven days of workspace creation, it:

1. connects Shopify;
2. connects email;
3. receives and persists a real inbound message; and
4. successfully sends an agent-assisted reply.

The system emits `workspace_activated` when those prerequisites are first met, even if they are met after seven days. The `within_seven_days` property determines whether the event counts toward the activation KPI. This preserves late-activation data without weakening the seven-day definition.

PostHog Cloud is the analytics processor. The internal `Organization.id` UUID is the PostHog `distinct_id`; the initial implementation does not use PostHog's paid group-analytics add-on.

## Privacy and scope

Product analytics must follow these rules:

- Capture only from trusted server code. Do not install the PostHog browser SDK.
- Do not enable autocapture, cookies, session replay, or person profiles.
- Set `$process_person_profile: false` on every event.
- Do not send names, email addresses, message content, prompts, tool inputs or outputs, street addresses, provider account or message identifiers, access tokens, refresh tokens, or Shopify payloads.
- Do not use Clerk organization IDs as identity. Use only the internal organization UUID.
- Keep Sentry responsible for error monitoring and replay. Do not duplicate those functions in PostHog.
- Treat capture as best-effort observability. An analytics failure must never fail or delay a product workflow.

This plan starts collection at deployment time. It includes no historical backfill.

## Non-goals

- User- or member-level behavior analysis
- Anonymous pre-signup marketing analytics
- Browser event capture or session replay
- PostHog feature flags or experiments
- Paid group analytics
- A database migration solely for analytics
- Persisting raw analytics payloads in the application database

---

## Architecture

Create a shared `packages/analytics` workspace published internally as `@shopkeeper/analytics`.

```text
Dashboard server actions/routes ─┐
                                 ├── captureProductEvent(event)
Gateway server/workers ──────────┘             │
                                               ▼
                                    validated ProductEvent
                                               │
                                  common safe properties added
                                               │
                         ┌─────────────────────┴─────────────────────┐
                         ▼                                           ▼
             immediate PostHog sink                     batched PostHog sink
             dashboard / Vercel                         gateway / Railway
```

Application code has one public interface:

```ts
export async function captureProductEvent(event: ProductEvent): Promise<void>;
```

Callers provide an event name, `organizationId`, source, event-specific safe properties, and an optional deterministic insert ID. The package:

1. validates the event contract;
2. discards properties not declared by that contract;
3. attaches common properties;
4. maps `organizationId` to PostHog `distinctId`;
5. sets `$process_person_profile: false`;
6. sends through the configured sink; and
7. logs and swallows capture failures.

### Package layout

```text
packages/analytics/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts             # captureProductEvent and public types
    ├── events.ts            # ProductEvent discriminated union
    ├── config.ts            # environment parsing and validation
    ├── sanitize.ts          # allowlisting and defense-in-depth redaction
    ├── insert-id.ts         # deterministic insert-ID helpers
    ├── sink.ts              # sink interface and no-op/recording sinks
    ├── posthog-immediate.ts # dashboard/serverless sink
    └── posthog-batched.ts   # gateway singleton and shutdown flush
```

Add `@shopkeeper/analytics` to the dashboard and gateway workspaces and add its build, lint, typecheck, unit-test, and coverage tasks to the existing Turbo pipeline.

### Event contract

Use a discriminated union rather than a generic property bag:

```ts
type EventSource = 'dashboard' | 'gateway';

type ProductEventBase = {
  organizationId: string;
  source: EventSource;
  insertId?: string;
};

export type ProductEvent =
  | (ProductEventBase & {
      event: 'workspace_created';
    })
  | (ProductEventBase & {
      event: 'onboarding_step_completed';
      step: 'store' | 'shopify' | 'email' | 'autonomy' | 'plan';
    })
  // Remaining variants are defined in the event catalog below.
```

Do not expose a generic `capture(name, properties)` API. Compile-time event variants and runtime allowlists must agree so a caller cannot accidentally attach a sensitive field.

Every captured event includes:

| Property | Value |
|---|---|
| `distinct_id` | Internal `Organization.id` UUID |
| `organization_id` | Same internal UUID |
| `schema_version` | `1` |
| `environment` | `production`, `preview`, `staging`, `development`, or `test` |
| `source` | `dashboard` or `gateway` |
| `$process_person_profile` | `false` |
| `$insert_id` | Deterministic value when supplied by the event contract |

Do not register organization IDs as PostHog group keys. Organization identity through `distinct_id` is sufficient for beta funnels and retention.

### Sinks and lifecycle

Define an injectable interface:

```ts
export interface AnalyticsSink {
  capture(payload: AnalyticsPayload): Promise<void>;
  shutdown?(): Promise<void>;
}
```

Provide:

- `NoopAnalyticsSink` for disabled analytics and default test behavior;
- `RecordingAnalyticsSink` for unit, route, and integration tests;
- an immediate PostHog sink using `captureImmediate` for Vercel/serverless calls; and
- a process-wide batched PostHog client for the gateway.

Gateway shutdown must flush analytics before process exit. Add the flush beside the existing queue, Redis, and database cleanup in gateway process shutdown handling. Bound the flush with a short timeout so analytics cannot prevent shutdown.

PostHog recommends immediate capture or explicit flushing for short-lived serverless execution: [PostHog Node documentation](https://posthog.com/docs/libraries/node).

### Configuration

Add these variables to dashboard and gateway environment examples, production validation, and deployment documentation:

| Variable | Required | Default | Notes |
|---|---:|---|---|
| `PRODUCT_ANALYTICS_ENABLED` | Yes in production validation | `false` outside production | Strict boolean |
| `POSTHOG_PROJECT_TOKEN` | When enabled | — | PostHog project token |
| `POSTHOG_HOST` | No | `https://us.i.posthog.com` | US PostHog Cloud ingest host |

Behavior:

- Development and tests default to disabled.
- Disabled analytics uses the no-op sink and does not require PostHog configuration.
- In production, `PRODUCT_ANALYTICS_ENABLED=true` requires a non-empty project token and a valid HTTPS host.
- Invalid or incomplete enabled configuration fails production environment validation.
- Vitest and Playwright always install the no-op or recording sink and never make PostHog network calls, even if a developer shell happens to contain PostHog variables.

Capture errors log one structured warning containing the event name, source, organization UUID, and error class. Do not log the attempted event payload or PostHog token.

### Deterministic insert IDs

Use `$insert_id` for events that can be retried or are intended to occur once:

| Event | Insert ID |
|---|---|
| `workspace_created` | `workspace_created:{organizationId}` |
| `onboarding_step_completed` | `onboarding_step_completed:{organizationId}:{step}` |
| `onboarding_completed` | `onboarding_completed:{organizationId}` |
| `integration_connection_completed` | `integration_connection_completed:{integrationId}` |
| `integration_connection_failed` | Stable OAuth attempt/callback state ID |
| `inbound_message_processed` | `inbound_message_processed:{messageId}` using the internal persisted message UUID |
| `agent_plan_generated` | `agent_plan_generated:{planId}` |
| `agent_plan_decided` | `agent_plan_decided:{planId}` |
| `agent_action_completed` | `agent_action_completed:{agentActionId}` |
| `outbound_reply_sent` | `outbound_reply_sent:{messageId}` using the internal persisted message UUID |
| `subscription_status_changed` | `subscription_status_changed:{stripeEventId}` |
| `workspace_activated` | `workspace_activated:{organizationId}` |

Identifiers used for deduplication are internal application identifiers, never provider identifiers. Do not also expose them as report properties.

---

## Event catalog

### Workspace and onboarding

| Event | Properties | Authoritative emission point |
|---|---|---|
| `workspace_created` | Common properties only | After `Organization` creation succeeds in `apps/dashboard/src/lib/server/org.ts` |
| `onboarding_step_completed` | `step` | Authenticated client-event route after a merchant advances from a completed step |
| `onboarding_completed` | Common properties only | After `onboardingCompletedAt` is persisted by the organization update route |

Allowed onboarding steps:

- `store`
- `shopify`
- `email`
- `autonomy`
- `plan`

### Integration connection

| Event | Properties | Authoritative emission point |
|---|---|---|
| `integration_connection_started` | `platform` | Authenticated client-event route immediately before redirecting to a provider or beginning a connection flow |
| `integration_connection_completed` | `platform` | After the integration upsert/connection transaction succeeds |
| `integration_connection_failed` | `platform`, `failure_category` | A provider callback or server connection path reaches a terminal failure |

`platform` must use the application's fixed integration platform allowlist. Do not accept arbitrary strings.

Allowed failure categories:

- `access_denied`
- `invalid_callback`
- `invalid_credentials`
- `provider_unavailable`
- `rate_limited`
- `state_mismatch`
- `validation_failed`
- `unknown`

Never send raw error text, provider responses, callback query strings, store domains, account IDs, or email addresses. Map errors to a category locally, then capture only the category.

### Agent value

| Event | Properties | Authoritative emission point |
|---|---|---|
| `inbound_message_processed` | `channel`, `is_first_for_workspace` | After deduplication and successful message persistence in the gateway inbound pipeline |
| `agent_plan_generated` | `channel`, `plan_source`, `step_count`, `generation_ms`, `cache_hit` | After a usable generated or cached plan is available |
| `agent_plan_decided` | `decision`, `channel`, `changed` | Approval from the authoritative server approval path; dismissal and regeneration through the restricted client-event route |
| `agent_action_completed` | `tool_name`, `tool_category`, `outcome` | After the action has reached a terminal outcome |
| `outbound_reply_sent` | `channel`, `reply_source` | Only after provider delivery succeeds |
| `subscription_status_changed` | `previous_status`, `new_status`, `plan` | After Stripe webhook state is validated and persisted |
| `workspace_activated` | `seconds_since_workspace_created`, `within_seven_days` | After the first successful agent-assisted reply when all activation prerequisites exist |

Property enums:

```ts
type PlanDecision = 'approved' | 'dismissed' | 'regenerated';
type ActionOutcome = 'succeeded' | 'blocked' | 'failed';
type ReplySource = 'manual' | 'agent_approved' | 'agent_automatic';
```

`channel`, subscription status, plan, tool name, and tool category must also be constrained to explicit safe allowlists. `step_count`, `generation_ms`, and `seconds_since_workspace_created` are non-negative integers. `changed`, `cache_hit`, `is_first_for_workspace`, and `within_seven_days` are booleans.

Use `plan_source` and `reply_source` in the payload rather than overloading the common `source` property, which identifies the emitting application.

### Event semantics

#### `inbound_message_processed`

- Emit for real provider-originated inbound messages only.
- Do not emit for fixtures, health checks, replay tools, synthetic maintenance work, duplicates, or messages rejected before persistence.
- Determine `is_first_for_workspace` from persisted inbound customer messages, in the same transaction or immediately after the successful insert.
- Duplicate webhook jobs must converge on the same internal message and insert ID.

#### `agent_plan_generated`

- A cached plan and a newly generated plan each produce the same event with the correct `cache_hit` value.
- `generation_ms` measures the attempt that produced the returned plan. For cache hits, use the cache retrieval duration rather than the original model duration.
- `step_count` counts normalized plan steps only.
- Do not send plan text, reasoning, prompts, tool arguments, model output, thread IDs, or customer data.

#### `agent_plan_decided`

- Capture exactly one terminal decision per plan version.
- `changed` is `true` when an approved plan or reply differs from the generated proposal; it is `false` for an unchanged approval and for dismissal/regeneration unless the product has an explicit edit operation.
- Approval is server-authoritative and is emitted after the approval state is committed.
- Dismissal and regeneration may originate in the browser, but the server derives organization and plan context and accepts only the decision enum.

#### `agent_action_completed`

- Capture only terminal outcomes.
- `blocked` means a product or policy guard prevented execution.
- `failed` means execution was attempted but did not complete.
- Never include action inputs, outputs, exception text, order details, refund amounts, or message bodies.

#### `outbound_reply_sent`

- Emit only after the provider confirms delivery.
- Queueing or persisting an outbound message is not delivery success.
- A retry that later succeeds reuses the internal message insert ID.
- `agent_approved` and `agent_automatic` are activation-eligible; `manual` is not.

#### `workspace_activated`

After an activation-eligible outbound send succeeds:

1. load the organization creation time;
2. confirm an active Shopify integration exists;
3. confirm an active email integration exists;
4. confirm at least one real persisted inbound customer message exists;
5. calculate whole `seconds_since_workspace_created`;
6. set `within_seven_days` using a seven-day boundary; and
7. capture with `workspace_activated:{organizationId}`.

The stable insert ID makes this safe to evaluate after every eligible successful send. No analytics-specific database flag or migration is required.

---

## Restricted client-event endpoint

Add `POST /api/product-events` to the dashboard.

Initially it accepts only:

- `onboarding_step_completed`
- `integration_connection_started`

Phase 3 expands the allowlist with:

- `agent_plan_decided` with `decision: dismissed | regenerated`

Approved plan decisions remain server-side and are not accepted from this endpoint.

### Request shapes

```json
{ "event": "onboarding_step_completed", "step": "email" }
```

```json
{ "event": "integration_connection_started", "platform": "shopify" }
```

```json
{
  "event": "agent_plan_decided",
  "decision": "dismissed",
  "planId": "<internal plan UUID>"
}
```

The route must:

- use the existing authenticated organization route wrapper;
- derive `organizationId` from the authenticated organization;
- reject requests without an authenticated organization;
- parse a closed discriminated union and reject unknown keys;
- validate step, platform, decision, and internal plan identifier;
- verify any referenced plan belongs to the authenticated organization;
- ignore and never forward client-supplied `organizationId`, `distinct_id`, `$insert_id`, `source`, or arbitrary properties;
- rate-limit by authenticated organization using the existing dashboard rate limiter;
- return success after safe capture, including when analytics is disabled or PostHog delivery fails; and
- return validation, authentication, tenant, and rate-limit errors using existing API conventions.

Use a conservative initial limit of 60 requests per organization per minute. This endpoint is not a general analytics proxy.

Deduplicate onboarding steps without a database migration:

- claim `product-event:onboarding-step:{organizationId}:{step}` through the existing Redis client with `SET NX`;
- retain the key long enough to cover onboarding and retries; and
- always use the deterministic PostHog insert ID as a second idempotency layer.

If Redis is temporarily unavailable, log a warning and continue with the deterministic insert ID. PostHog deduplication remains the final guard.

---

## Implementation phases

## Phase 1 — analytics foundation

1. Create `@shopkeeper/analytics` and add `posthog-node`.
2. Implement the `ProductEvent` union, runtime allowlists, automatic common properties, sanitizer, and deterministic insert-ID helpers.
3. Implement no-op, recording, immediate PostHog, and batched PostHog sinks.
4. Add environment parsing and production validation to both applications and root production-env checks.
5. Install the immediate sink in dashboard server code.
6. Install a singleton batched sink in gateway bootstrap and flush it during graceful shutdown.
7. Add package unit tests before instrumenting product paths.

**Exit criteria:** Both applications build with analytics disabled; recording-sink tests prove exact safe payloads; gateway shutdown flushes; capture failures are logged and swallowed.

## Phase 2 — onboarding and integration funnel

1. Capture `workspace_created` after organization persistence.
2. Add the restricted `POST /api/product-events` route.
3. Emit onboarding step completion from `useOnboardingFlow` only after the step's own required save/connect operation succeeds.
4. Capture `onboarding_completed` only after `onboardingCompletedAt` persists.
5. Emit connection-started events from onboarding and the integrations page.
6. Capture integration completed/failed events in shared integration upsert and OAuth callback paths.
7. Update the privacy policy at `apps/dashboard/src/app/(marketing)/privacy/page.tsx`.
8. Update `docs/production/deployment.md`, environment examples, and production checklists.

**Exit criteria:** The funnel from workspace creation through onboarding is visible in staging, tenant-spoofing route tests pass, and reviewed payloads contain no prohibited data.

## Phase 3 — agent value funnel

1. Capture inbound success from `apps/gateway/src/message-handlers/inbound-persistence.ts` after deduplication and persistence.
2. Capture generated and cached plan outcomes from the shared plan-generation paths.
3. Capture approvals from server approval paths and add dismissal/regeneration to the restricted endpoint.
4. Capture terminal tool outcomes from shared execution boundaries.
5. Capture outbound delivery success from the shared dispatch/worker completion boundaries.
6. Capture Stripe subscription transitions after webhook persistence.
7. Evaluate and capture workspace activation after each successful agent-assisted reply.

**Exit criteria:** Integration tests cover every success boundary and prove that persistence/provider failures do not emit success events.

## Phase 4 — PostHog reports

Create and save these reports in the production PostHog project. Mirror them in staging while validating events.

### 1. Activation funnel

Use a seven-day conversion window:

1. `workspace_created`
2. `integration_connection_completed` where `platform = shopify`
3. `integration_connection_completed` where `platform = email`
4. `onboarding_completed`
5. `inbound_message_processed`
6. `agent_plan_decided` where `decision = approved`
7. `outbound_reply_sent` where `reply_source IN (agent_approved, agent_automatic)`

Break down by environment only when validating staging; the production report must filter to `environment = production`.

### 2. Time to value

Report median and 90th-percentile duration from `workspace_created` to `workspace_activated`. Split `within_seven_days = true` from late activation where useful.

### 3. Agent quality

Create trends for:

- approval, dismissal, and regeneration rates;
- changed versus unchanged approvals;
- action success, block, and failure rates;
- manual versus agent-assisted outbound replies; and
- cache-hit versus newly generated plan volume.

### 4. Weekly retention

An organization is retained when it returns in a later calendar week and performs at least one meaningful event:

- `agent_plan_decided`
- `agent_action_completed`
- `outbound_reply_sent`

Because `distinct_id` is the stable internal organization UUID, PostHog can calculate this without group analytics. Group analytics is a paid add-on and is not part of the initial implementation: [PostHog group analytics](https://posthog.com/docs/product-analytics/group-analytics).

Record report names, owners, production URLs, filters, and last-verified dates in the production deployment documentation.

## Phase 5 — verification and rollout

### Unit tests

Test:

- every `ProductEvent` variant and property allowlist;
- common automatic properties;
- organization UUID mapping to `distinct_id`;
- `$process_person_profile: false`;
- analytics-disabled behavior;
- invalid enabled configuration;
- defense-in-depth property redaction;
- prohibited keys and unknown properties;
- deterministic insert IDs;
- capture failure logging and swallowing;
- recording-sink behavior; and
- gateway graceful-shutdown flushing.

### Route tests

Test:

- authentication is required;
- organization identity comes only from authenticated routing;
- cross-tenant plan references are rejected;
- client-supplied identity and arbitrary properties cannot be forwarded;
- only permitted client-originated events are accepted;
- all step, platform, and decision allowlists;
- malformed and oversized bodies;
- rate limiting;
- onboarding-step deduplication; and
- disabled or failed analytics delivery does not turn a valid request into a product error.

### Integration tests

Prove:

- failed database persistence emits no completion event;
- failed provider delivery emits no `outbound_reply_sent`;
- duplicate webhook jobs emit one `inbound_message_processed`;
- cached and newly generated plans set correct properties;
- every plan version maps to at most one decision event;
- tool completion maps to one terminal outcome;
- subscription events reflect committed before/after state;
- activation requires Shopify, email, a persisted real inbound message, and an agent-assisted successful send;
- manual replies do not activate a workspace;
- the seven-day boundary is calculated correctly; and
- activation retries reuse the stable organization insert ID.

Install `RecordingAnalyticsSink` in all tests. Vitest and Playwright must never call PostHog.

### Staging validation

1. Deploy the foundation with analytics disabled.
2. Configure a separate staging PostHog project or a strict `environment = staging` filter.
3. Enable analytics in staging.
4. Emit one controlled event of each type.
5. Inspect the raw payload for every event and confirm no prohibited data appears.
6. Verify deterministic retries do not increase unique event counts.
7. Verify all four saved reports with a controlled activation journey.
8. Exercise PostHog failure and confirm product workflows still succeed while warnings appear in existing logs/Sentry.

### Production rollout

Production capture is gated on:

- privacy policy deployment;
- deployment and environment documentation updates;
- passing unit, route, and integration suites;
- staging payload review;
- saved production reports; and
- an assigned owner for first-week monitoring.

Then:

1. deploy code with `PRODUCT_ANALYTICS_ENABLED=false`;
2. configure the production project token and US ingest host;
3. set `PRODUCT_ANALYTICS_ENABLED=true`;
4. complete one controlled production journey;
5. verify the raw events and reports; and
6. monitor analytics-delivery warnings in existing logs and Sentry during the first beta week.

Do not backfill pre-deployment events.

---

## Definition of done

- `@shopkeeper/analytics` is the only application-facing product analytics API.
- Dashboard and gateway use the correct lifecycle-specific sinks.
- Every event is typed, runtime-validated, organization-scoped, pseudonymous, and person-profile-free.
- Success events occur only after their authoritative persistence or provider boundary.
- Client events pass through the restricted authenticated endpoint.
- Retried and one-time events use stable insert IDs.
- Privacy and production documentation identify PostHog and the exact data scope.
- Four production reports are saved and verified.
- Staging payload review finds no prohibited data.
- Production starts from deployment time with no browser SDK, replay, group analytics, migration, or historical backfill.
