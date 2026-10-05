# Conversational agent runtime

Last reviewed: 2026-10-05.

Retirement shipped in [PR #165](https://github.com/walledog11/shopkeeper/pull/165)
as `17afc644` on dashboard, gateway and worker. Required PR checks and production
verification passed; deployment identities are in the release evidence.

Runtime 2 is the sole executable agent runtime. New dashboard, composer,
iMessage, and customer requests persist `runtimeVersion=2`; organization
allowlists and the proposal/discovery rollout flags no longer select behavior.
A persisted task on another version must be regenerated before execution or
continuation. Its version is never rewritten.

## Requests, planning, and approval

Dashboard chat and composer submissions persist a request before returning 202.
iMessage work uses the same task ledger through the operator-event worker.
Customer planning accepts the source message as a durable request. Claims,
revision checks, leases, cumulative budgets, and cancellation govern each
attempt. Reloading or retrying a request does not refill its budget.

Customer planning starts with the authorized reads and controls appropriate to
its classification. Missing or stale classification uses the compact starter
set with `discover_capabilities`. Discovery adds capabilities from that actor's
authorized registry within the same bounded loop; no full-registry retry exists.
Merchant instructions and operator/storefront contexts retain their own
authorized tool sets. Discovery grants no additional authority.

A customer message is an `exact_draft`, bound with its destination and action
bundle into the durable proposal's hash. Only labeled placeholders explicitly
bound to successful receipts may change after approval. Missing receipt values,
a failed write, or an unknown outcome withholds the message. A definite failure
may produce a separately reviewed message follow-up; an uncertain write is
reconciled without replaying it.

All approval surfaces call the shared proposal authorization and execution
boundary. Authenticated membership, recorded approver scope, current source,
proposal identity, and execution ownership are checked before dispatch. Approval
of a taskless historical cache is refused with regeneration guidance. Approval
never falls through to an untracked execution.

Dashboard answers and phone answers/revisions claim the exact durable wait,
persist the merchant's continuation, renew the claim while planning, and settle
the proposal and cache together. These existing continuation handlers await
planning in their host process; they are not queued HTTP submissions. The
private `/api/agent/ask` surface remains a bounded, synchronous, read-only query.
It cannot execute writes or authorize a proposal.

## Outcomes and compatibility

Mutation completion facts come from validated successful receipts. Current
Shopify order reads may establish an already observed state; mutation inputs,
result prose, cached plans, and customer messages cannot prove a completed write.
Activity labels distinguish blocked, failed, and unknown calls. Request polling
shows a failed/reconciling summary only when its stored response belongs to that
request, and does not restore approval controls on it.

Versioned cache/receipt decoders, historical journal rows, provider operation
keys, unknown-action reconciliation, and attributed delivery recovery remain.
`Thread.cachedPlan` is a presentation projection, not execution authority.
Cache digest and missing-plan recovery maintenance still serve current durable
work. Their presence does not enable the retired runtime.

The read-only `audit:agent-runtime-retirement -- --strict` gate reports task
versions/statuses, historical proposals, unknown actions, and current taskless
caches. Run it with the intended database target before deploying retirement.
The 2026-10-04 production inventory found no v1 tasks/proposals or v1/taskless
unknown actions. Five current taskless caches require regeneration and review;
two unknown actions on runtime 2 remain under reconciliation. No production
rows were rewritten or deleted. See the [release evidence](conversational-agent-overhaul-p6-release-evidence.md#runtime-retirement-inventory-2026-10-04).

## Deployment and rollback

Deploy gateway, worker, and dashboard from the same reviewed retirement commit.
No schema rollback or data migration is required. The current image ignores
`AGENT_RUNTIME_VERSION`, `AGENT_RUNTIME_V2_ORG_IDS`,
`AGENT_PROPOSAL_SUSPENSION_MODE`, and `AGENT_CAPABILITY_DISCOVERY_MODE`. The
rollback image below does not: it picks each new task's runtime from the first
two, and starts it on runtime 1 when `AGENT_RUNTIME_VERSION` is unset. Until the
rollback target includes #165, keep `AGENT_RUNTIME_VERSION=2` and leave
`AGENT_RUNTIME_V2_ORG_IDS` unset on the `shopkeeper` gateway and `Gateway Worker`
Railway services. A task started on runtime 1 during a rollback is refused as
retired once the current image is redeployed.

Rollback means redeploying the previous known-good application revision
`ecb514bbe531116dd94ed5317f37aaf95da7ccfd` (#164) to all three hosts. That revision
contains both runtime implementations and understands the retained additive
schema and runtime-2 records. With the variables above it runs new work on
runtime 2. Setting runtime 1 on the retirement image cannot restore deleted code.

Do not rewrite task versions, drop ledger/receipt columns, resubmit unknown
provider operations, or retry an uncertain customer delivery. Preserve the
operation and delivery identities and use their existing reconciliation paths.
The release owner waived a staged rollback rehearsal under decision L; this
runbook does not claim one occurred.

## Verification scope

Existing local regression checks cover receipt grounding, durable approvals,
continuation ownership, stale-source refusal, budget persistence, unknown
outcomes, and delivery recovery. They use controlled model/provider responses
and do not establish live conversational quality. The prior dev-store/phone
observations, exclusions, and still-unobserved ordinary-use checks are recorded
in the [overhaul plan](conversational-agent-overhaul-plan.md).

No paid comparison ran for retirement. The last historical comparison measured
v2 at p95 8.2 seconds and mean $0.0233 per task, within the recorded task budget;
it also cost approximately 44% more than v1. Deleting a widening retry removes a
possible second planning attempt, but does not establish a new cost/latency
measurement.
