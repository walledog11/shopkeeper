# Critical Path Test Checklist

Use this checklist before adding or changing high-risk dashboard or gateway routes. It is a test ownership contract, not a coverage-threshold policy.

## Applies To

- Money paths: billing, Stripe webhooks, subscription gates, checkout, portal.
- Tenant data paths: customers, threads, messages, KB, reports, analytics, exports, data deletion, team, integrations.
- External provider paths: Shopify, Postmark, Meta, Twilio, Clerk.com webhooks, gateway webhooks.
- Merchant workflow writes: outbound messages, agent actions, approvals, integration creation/deletion.

## Required Coverage

For each new high-risk route or route branch, add tests for:

- Auth: unauthenticated and no-active-org requests return stable JSON status codes, not redirects or 500s.
- Org scope: reads include only active-org records; resource-id routes return 404 for foreign IDs.
- No foreign mutation: PATCH/POST/DELETE calls with foreign IDs leave the foreign record unchanged.
- Validation: missing, malformed, or unsupported inputs return 400-class responses before writes or provider calls.
- Provider failure: mocked non-OK responses and thrown provider errors do not persist successful local side effects.
- Billing gate: merchant write actions fail with 402 for `past_due` and `canceled` orgs where the action can create customer-visible state.
- Idempotency: webhook/event replay paths do not double-apply state changes.

## Test Shape

- Prefer DB-backed integration tests beside the route or in `src/lib/security` for shared tenant-surface guards.
- Mock Stripe, Shopify, Clerk.com, Meta, Twilio, Postmark, Redis, and network `fetch`; no live provider calls in tests.
- Keep browser E2E for middleware/session/rendering behavior that route tests cannot prove.
- Add a smoke E2E only when the route backs a core merchant workflow or a billing/auth boundary.

## CI Expectations

PR default remains:

```bash
npm run lint
npm run test:unit
npm run test:integration
```

Run `npm run test:e2e:smoke` for changes touching billing, auth, org isolation, messages, agent approval, tickets UI, integrations, or middleware. Browser-auth E2E remains release/nightly or manual unless the changed surface requires real Clerk.com browser auth.

Coverage reports are generated for dashboard and gateway integration suites in CI artifacts. Do not add global coverage thresholds until the baseline is intentionally ratcheted.
