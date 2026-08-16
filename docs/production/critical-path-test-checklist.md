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

## Paid Model-Backed Agent Evals

The agent evals call Anthropic when given a real `ANTHROPIC_API_KEY`. They are
not part of the ordinary PR test loop: the production planner carries a large
system prompt and tool schema, so a full repeated suite can consume millions of
tokens in minutes. API spend is determined by tokens, not wall-clock duration.

Use the following escalation ladder. Do not skip directly to a full capture.

1. Run the deterministic unit/integration checks above first. Ensure a real
   `ANTHROPIC_API_KEY` is not exported for these commands (or explicitly set it
   to `test-anthropic-key`); `with-test-env.mjs` otherwise preserves a real key
   from the calling environment. These checks must not make live model calls.
2. During diagnosis, run only the affected fixture IDs, once. Leave the LLM
   judge off unless the change specifically affects reply semantics:

   ```bash
   REQUIRE_MODEL_EVALS=1 EVAL_REPEATS=1 \
     EVAL_FIXTURE=fixture-id,second-fixture-id RUN_JUDGE_EVALS=0 \
     npm run test:evals:fixture -w apps/dashboard
   ```

   Set `RUN_JUDGE_EVALS=1` only for selected fixtures whose rubric needs semantic
   judging. A failed targeted run is investigated with more targeted runs; it is
   not a reason to rerun the full suite. Use targeted three-repeat probes only
   when measuring a suspected flaky fixture.
3. After the affected fixtures are green and the implementation is stable, an
   unfiltered one-repeat gate may be used for release-level confidence:

   ```bash
   REQUIRE_MODEL_EVALS=1 EVAL_REPEATS=1 RUN_JUDGE_EVALS=0 \
     npm run test:evals:fixture -w apps/dashboard
   ```

   Enable judges for this run only when the release needs the semantic reply
   gate. Any unfiltered live-key run requires explicit human approval after the
   operator states the scope, repeats, judge setting, credential source, and an
   approximate spend ceiling.
4. A three-repeat full baseline capture is reserved for an explicitly approved
   release/baseline decision, after the one-repeat gate passes:

   ```bash
   REQUIRE_MODEL_EVALS=1 RUN_JUDGE_EVALS=1 \
     npm run test:evals:baseline -w apps/dashboard
   ```

   Run it once. Do not automatically rerun it after a failure. The baseline
   command writes `baseline.json` incrementally, so an interrupted or failing
   capture must not be committed; restore the last accepted baseline, diagnose
   with fixture filters, and request fresh approval before another full capture.
   Accept a new baseline only when the capture completes and all hard gates pass.

The eval runner currently reports token usage after execution but has no
model-aware dollar estimator or hard spending cutoff. Until an `EVAL_MAX_USD`
guard exists, the approval and one-run rules above are the spending control. Do
not borrow a production API credential for evals without explicit permission,
and never import production database or Redis configuration into a test run.
