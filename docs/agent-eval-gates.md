# Agent eval operating model

The eval workflow has four deliberately different modes. A paid invocation is
manual, budgeted, and conclusive; a failed invocation never dispatches another
paid run.

| Mode | Purpose | Dashboard fixtures | Repeats | Semantic judges | Release blocking |
| --- | --- | ---: | ---: | --- | --- |
| `release` | Certify a release candidate | 48 core, hard-gated | 1 | Only objective `gate: true` checks | Yes |
| `targeted` | Diagnose named fixtures | Selected IDs | 1–3 | Caller choice | Selected hard fixtures only |
| `drift` | Measure the complete model surface | All 84 | 3 | All rubric checks | Hard drift only; advisory is reported |
| `baseline` | Replace comparable three-repeat evidence | All 84 | 3 | All rubric checks | Capture must complete |

Pull requests run only the deterministic preflight. They validate fixture
structure, selection/retry/cache behavior, cost accounting, and the gateway
pre-filter without contacting Anthropic. Paid modes require an explicit
`workflow_dispatch` with `max_usd` and `max_model_calls`.

Local model eval commands enforce the same contract. For example, a named
fixture run must include both ceilings:

```sh
EVAL_MAX_USD=0.10 EVAL_MAX_MODEL_CALLS=20 EVAL_FIXTURE=fixture-id npm run test:evals:fixture -w apps/dashboard
```

Package 6 runtime comparisons must additionally set
`EVAL_AGENT_RUNTIME_VERSION=1` or `2`. The dashboard runner passes that version
through the same planner options used by persisted tasks; version 2 also stops
planning at a write proposal. The unset value, or `current`, preserves the
historical eval behavior. Run v1 and v2 from the same commit with identical
fixture selection, repeats, judges, models, and budgets. Keep
`AGENT_CAPABILITY_DISCOVERY_MODE=off` and
`AGENT_PROPOSAL_SUSPENSION_MODE=off` during the comparison so compatibility
flags do not alter the explicitly selected v1 arm.

## Release semantics

A release passes only when the dashboard core set and gateway hard case both
pass within their allocated portions of the caller's total budget. Subjective
advisory outcomes cannot affect that result. An initial dashboard hard failure
is confirmed by rerunning only that fixture twice; both confirmations must pass.
Infrastructure, fixture-validation, and budget failures are not retried.

Dashboard and gateway jobs run independently, upload their logs even on
failure, and feed one final summary job. The summary is a conclusion, not an
automatic retry trigger.

## Spend protection

`scripts/eval-budget-preflight.mjs` estimates a run from the committed
three-repeat usage baseline, adds contingency, and refuses a dispatch whose
estimate exceeds either caller-approved ceiling. It divides the total ceiling
between dashboard and gateway so the two concurrent jobs cannot each spend the
full authorization. Release call estimates reserve 2.25 calls per dashboard
fixture, based on the 2026-09-07 observed run. A targeted fixture instead
reserves the planner's mechanical bound: 10 calls for the narrowed attempt and
10 for its possible full-registry retry. Fixtures that exercise execution add
another 10 calls, and judged fixtures add one. Targeted dollar estimates use
the greater of two-times baseline cost or the observed isolated cold-start cost
plus 20% contingency because a small selection receives less benefit from
prompt-cache reuse than the aggregate baseline.

Every model call is checked against both `EVAL_MAX_USD` and
`EVAL_MAX_MODEL_CALLS`. Usage is priced from the committed table in
`@shopkeeper/agent/model-cost`; an unknown model is rejected before the request.
The dollar meter records actual response usage and blocks every subsequent call
after the ceiling is reached. Because token usage is known only after a response,
one in-flight response can cross the dollar boundary; the independent call cap
is the strict provider-call backstop.

The pricing table is dated and must be updated alongside any model pin or API
pricing change. As of 2026-09-07 it uses standard global Claude API pricing for
Sonnet 5, Sonnet 4.6, and Haiku 4.5. A root node test compares the eval prices
with production spend accounting for representative usage so the two paths
cannot silently diverge. Both paths reject models without a committed price.

## Reuse and evidence

Passing per-fixture results are cached only for the exact commit SHA, repeat
count, judge mode, and selected agent runtime. Failed jobs save partial passing evidence, so rerunning
the same workflow attempt spends only on unfinished fixtures. A code change
produces a different SHA and cannot reuse the old certification.

Every paid job uploads the raw log, the parseable eval report, and any reusable
fixture evidence with `if: always()`. Drift compares the current three-repeat
hard-gated subset with the same subset of the three-repeat baseline. A
one-repeat release run is never compared with a three-repeat baseline.

Every accepted local or CI eval command also appends an invocation record to the
gitignored `test-results/eval-ledger.jsonl`, including the SHA, selection,
repeat/judge configuration, approved ceilings, and GitHub run identity.

The prompt-cache experiment and context-budget comparison are not release
checks. They run only when explicitly selected, preventing hidden calls from
being folded into a gate advertised as the fixture suite.
