# Operational Guardrails V1 Plan

This plan covers the first production operational guardrail pass for launch. It uses structured Pino logging only. It does not add Slack, a generic webhook notifier, a new database table, or a new vendor dependency.

## Summary

Add focused launch-blocker guardrails for:

- stuck queues
- repeated webhook signature failures
- repeated provider send failures
- repeated agent execution and tool failures

The goal is to make production failures visible quickly without changing customer-facing behavior or broadening the runtime surface more than necessary.

## Plan Evaluation

Overall assessment: this is a good V1 launch plan. It is focused on production failure modes that can block customer support, reuses the repo's existing Redis, structured logging, BullMQ, and provider code, and avoids new tables, vendors, and customer-facing behavior changes.

Strengths:

- It targets failure classes that are hard to spot manually during launch: stuck jobs, bad webhook configuration, provider outages or credential failures, and broken agent/tool execution.
- It keeps alerting out of the customer path by preserving existing HTTP responses, message persistence semantics, and agent summaries.
- It gives concrete thresholds and env vars, which makes implementation testable and rollout reversible.
- It matches the current repo shape: the gateway already has a queue-health maintenance worker and webhook verification paths; the dashboard already has Redis rate limiting, provider dispatch code, and agent routes.

Risks to handle during implementation:

- Alert grouping must be deliberate. `orgId` is useful as a tag or extra field, but including it in every fingerprint can fragment issues and hide platform-wide incidents. Fingerprints should group by stable failure class first, then provider, channel, queue, or tool.
- Redis fixed-window counters need a small shared contract because the gateway uses `ioredis` and the dashboard uses the Upstash REST client. The helper should expose the same behavior on both sides without forcing either app into the other Redis client.
- Queue active-job inspection can become expensive if implemented by scanning too many jobs. Limit the active-job sample, cache diagnostics consistently, and report the oldest observed active job rather than attempting a full queue scan.
- Queue alerts only work if the queue-health repeatable worker is running. Deployments that split `GATEWAY_RUNTIME_ROLE=server` and `worker` must keep maintenance workers enabled in the worker process.
- `OPS_ALERTS_ENABLED` should disable threshold alerts but should not suppress ordinary structured logs that are needed for debugging.
- The alert helper always emits structured logs; local, test, and staging environments remain predictable without any external error-tracking vendor.

## Key Changes

### Shared alert helper

- Add a small shared operational alert helper for structured log alerts.
- Emit structured Pino logs with `opsAlert: true`.
- Use stable tags and fingerprints for `category`, `service`, `queue`, `provider`, and `channel`; include `orgId` as a tag or extra field where available rather than a default fingerprint key.
- Add `OPS_ALERTS_ENABLED`, defaulting to enabled in production and disabled only when explicitly set to `false`.

### Queue health

- Expand the gateway queue health monitor beyond current failed/waiting checks.
- Keep failed and waiting checks for `inbound` and `aiSummary`.
- Add active-job age checks to detect stuck jobs.
- Include queue counts, oldest active job age, job id, attempts, and trace id when available.
- Default thresholds:
  - `QUEUE_ALERT_FAILED_THRESHOLD=10`
  - `QUEUE_ALERT_WAITING_THRESHOLD=100`
  - `QUEUE_ALERT_ACTIVE_STUCK_MS=900000`

### Webhook signature failures

- Track invalid or missing signatures for Meta, Shopify, and Twilio in Redis fixed windows.
- Alert only after a threshold is crossed to avoid noisy single-request alerts.
- Preserve current HTTP behavior: invalid signatures still return the existing `401` or `403` responses.
- Default thresholds:
  - `WEBHOOK_SIGNATURE_ALERT_THRESHOLD=5`
  - `OPS_ALERT_WINDOW_SECS=300`

### Provider send failures

- Alert on repeated outbound failures from Postmark/email, Meta/Instagram, Twilio/WhatsApp/SMS, and Shopify webhook registration or send paths.
- Use existing dispatch result failures and caught provider exceptions.
- Do not change message persistence semantics. Failed dispatches should still avoid saving successful outbound messages unless existing code already does otherwise.
- Default threshold:
  - `PROVIDER_SEND_ALERT_THRESHOLD=3` per provider/channel/org/window

### Agent and tool failures

- Alert on repeated API-level agent failures from dashboard agent endpoints.
- Alert on repeated tool results beginning with `Error:` and thrown tool exceptions.
- Group by org and tool name where available.
- Preserve current agent summaries and user-facing error behavior.
- Default threshold:
  - `AGENT_FAILURE_ALERT_THRESHOLD=3` per org/tool/window

## Implementation Phases

Each phase should preserve existing customer-facing behavior, add or update targeted tests before moving on, and keep `OPS_ALERTS_ENABLED=false` as a kill switch for threshold alerts.

### Phase 0: Alerting contract and helpers

Create the shared operational alerting contract before instrumenting call sites.

- [x] Add alert categories: `queue_health`, `webhook_signature`, `provider_send`, and `agent_failure`.
- [x] Add a helper for structured log fields, tags, extras, severity, and stable fingerprints.
- [x] Add fixed-window threshold helpers with the same behavior for gateway `ioredis` and dashboard Upstash Redis.
- [x] Parse and validate alert env vars close to existing runtime/env config code.
- [x] Ensure alerts always emit structured logs regardless of environment.
- [x] Add unit tests for enabled/disabled behavior, threshold crossing, TTL handling, and fingerprint/tag output.

Completion gate:

- [x] The helper can emit a structured log alert and stay quiet when `OPS_ALERTS_ENABLED=false`.

### Phase 1: Gateway queue health

Expand the existing gateway queue-health maintenance worker.

- [x] Move existing failed/waiting queue alerts onto the new alert helper.
- [x] Keep monitoring `inbound` and `aiSummary` failed and waiting counts.
- [x] Add active-job age checks using bounded active job sampling.
- [x] Include queue counts, oldest observed active job age, job id, attempts, job name, platform/channel, org id, and trace id where available.
- [x] Add `QUEUE_ALERT_ACTIVE_STUCK_MS` parsing and tests.
- [x] Keep `/health/queues` diagnostic output useful, but avoid making endpoint traffic the only source of alerting.

Completion gate:

- [x] The repeatable queue-health job alerts once per threshold window for failed, waiting, and stuck-active cases, and remains quiet below thresholds.

### Phase 2: Gateway webhook signature failures

Instrument signature rejection paths in gateway webhook routes.

- [x] Track Meta missing signature/raw body and signature mismatch.
- [x] Track Shopify missing signature/raw body and signature mismatch.
- [x] Track Twilio missing signature and validation failure only for direct provider requests, not trusted internal proxy requests.
- [x] Preserve the current `401`, `403`, and `500` responses exactly unless a route already needs a bug fix.
- [x] Group counters by provider, failure reason, and window; attach route, service, and request metadata that is safe to log.

Completion gate:

- [x] Repeated invalid signatures alert after `WEBHOOK_SIGNATURE_ALERT_THRESHOLD`; single invalid requests only log at the existing level.

### Phase 3: Dashboard provider send failures

Instrument outbound provider failures without changing dispatch persistence.

- [x] Add provider-send alerts around `dispatchMessage` failures for Postmark/email, Meta/Instagram, Twilio/WhatsApp/SMS, and Shopify-channel email fallback.
- [x] Add alerts for provider exceptions and non-OK responses inside agent `send_reply` and `send_email` tool paths.
- [x] Add alerts for Shopify webhook registration failures during OAuth callback setup.
- [x] Group by provider, channel, org, and window; include thread id and integration id only as tags or extras where safe.
- [x] Confirm failed dispatches still do not create successful outbound agent messages.

Completion gate:

- [x] Repeated provider failures cross `PROVIDER_SEND_ALERT_THRESHOLD` and existing successful/failed persistence tests still pass.

### Phase 4: Dashboard agent and tool failures

Instrument API-level agent failures and tool-level error results.

- [x] Add route-level alerting for `/api/agent`, `/api/agent/internal`, `/api/agent/chat`, and `/api/agent/quick-approve` failures.
- [x] Record repeated `actionsPerformed` results beginning with `Error:` after `executeAgentTurn` or `runAgent` returns.
- [x] Keep thrown tool exceptions captured at the tool execution boundary and counted by tool name.
- [x] Group by org and tool where available; use `unknown` where a route fails before org/tool resolution.
- [x] Preserve the current JSON error shapes, summaries, audit-note behavior, and quick-approve `502` behavior.

Completion gate:

- [x] Repeated agent route failures and repeated tool `Error:` results alert after `AGENT_FAILURE_ALERT_THRESHOLD`; successful agent flows remain unchanged.

### Phase 5: Production rollout and log routing

Roll out after targeted tests pass. Configure Better Stack Level 1 per [error-tracking-plan.md](error-tracking-plan.md) (log drains, keyword alerts, uptime monitors).

- [x] Run `npm run lint`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e:smoke`, and `npm run build`.
- [ ] Deploy with default thresholds first, then tune only after observing real traffic.
- [ ] Configure log-drain alerts for the four categories before marking the checklist item complete.
- [ ] Trigger one controlled alert per category in staging or a safe production smoke window and confirm grouping, owner routing, and payload quality.
- [ ] Confirm `OPS_ALERTS_ENABLED=false` can silence threshold alerts without redeploying code.

Completion gate:

- [ ] Log drains receive correctly grouped alerts for all four categories, runbook steps are enough to triage them, and the production checklist guardrails item can move from `partial` to `done`.

## Test Plan

Run the normal quality gates after implementation:

```bash
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e:smoke
npm run build
```

Add targeted tests for:

- [x] queue health alerting when failed count, waiting count, or active-job age exceeds threshold
- [x] queue health staying quiet below thresholds
- [x] Meta, Shopify, and Twilio signature failures incrementing counters and alerting only after threshold
- [x] alert helper respecting `OPS_ALERTS_ENABLED=false`
- [x] `/api/messages` provider failures recording operational alerts without saving successful outbound messages
- [x] agent route failures and tool `Error:` results alerting after threshold
- [x] existing successful agent, tool, webhook, and dispatch flows remaining unchanged

## Production Setup

Route Vercel and Railway log drains to your launch owner. The production checklist tracks live alerting readiness, not only code instrumentation, so do not mark the checklist item done until log routing and controlled-alert validation are complete.

Optional env vars:

- `OPS_ALERTS_ENABLED`
- `OPS_ALERT_WINDOW_SECS`
- `QUEUE_ALERT_FAILED_THRESHOLD`
- `QUEUE_ALERT_WAITING_THRESHOLD`
- `QUEUE_ALERT_ACTIVE_STUCK_MS`
- `WEBHOOK_SIGNATURE_ALERT_THRESHOLD`
- `PROVIDER_SEND_ALERT_THRESHOLD`
- `AGENT_FAILURE_ALERT_THRESHOLD`

Recommended log-drain alert rules:

- alert on log keyword `opsAlert` + `category=queue_health`
- alert on log keyword `opsAlert` + `category=webhook_signature`
- alert on log keyword `opsAlert` + `category=provider_send`
- alert on log keyword `opsAlert` + `category=agent_failure`
- route gateway alerts and dashboard alerts to the same launch ops owner until ownership is split

## Runbook Expectations

When queue alerts fire:

- Check `/health/queues` for worker heartbeat and queue counts.
- If active jobs are stuck, inspect the job payload and trace id in Railway logs.
- Restart the gateway worker only after confirming Redis and DB are healthy.

When webhook signature alerts fire:

- Confirm provider webhook URLs point directly at the gateway production routes.
- Confirm provider secrets match production env vars.
- Check whether failures are concentrated on one provider or one org.

When provider send alerts fire:

- Confirm provider credentials and account status.
- Check rate limits, sandbox/live account state, and provider incident pages.
- Confirm the app did not persist a successful outbound message for failed sends.

When agent/tool alerts fire:

- Group failures by tool name and org.
- Inspect the associated audit note and structured logs.
- Disable affected tool categories in org settings if the issue involves write actions and customer risk.

## Assumptions

- Structured logs routed through Vercel/Railway log drains to Better Stack are the only v1 alert channel (see [error-tracking-plan.md](error-tracking-plan.md)).
- Scope is launch blockers only, not a full ops dashboard.
- Redis is acceptable for short-window alert aggregation because both dashboard and gateway already depend on Redis for production guardrails.
- No database migration is needed.
