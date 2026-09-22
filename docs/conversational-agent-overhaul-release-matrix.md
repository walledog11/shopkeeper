# Conversational agent release matrix

This is the short working gate for [the overhaul plan](conversational-agent-overhaul-plan.md).
An entry is complete only when its evidence is recorded against a commit. A
database-backed fake-provider host test proves the selected path, not a real
provider or customer delivery. Retained capability scope comes from the
[Package 0 inventory](conversational-agent-overhaul-p0-baseline.md).

## Package 5: capability migration

For each row, check availability, validated inputs and fresh evidence, authority,
effect receipt, recovery, conversational variants, delivery, and v1 compatibility
as defined in the plan. Reuse shared contract tests; add a host case where the
operation has a distinct provider precondition or recovery mode.

| Row | Evidence recorded | Next release evidence |
| --- | --- | --- |
| Order status, policy, product answers | Full safe-read row; task-attributed gateway delivery | Keep in comparison and holdout eval |
| Full and partial refunds | Durable reference slice, typed receipts, live model with fake provider; full-refund balance shrink and a partial-refund selection consumed by another refund during approval preserve rejected receipts and send no refund mutation | Real-store approval/effect/delivery; partial-refund calculated amount changes without a prior refund; delivery recovery |
| Address change | Approved fake-provider receipt and gateway send; full/partial fulfillment or changed order customer during approval records a rejected receipt without an order address PUT; customer-profile refusal after the order update preserves a typed partial outcome and prevents a success reply | Delivery retry |
| Cancellation | Approved fake-provider receipt and gateway send; shipped and partially shipped order, revoked-grant, and changed-workspace-policy waits refuse provider dispatch; a lost provider response after a committed cancellation is confirmed by a fresh read; an unconfirmed provider result leaves one unknown cancellation, stops the success reply, and keeps the task reconciling; failed/unknown customer send leaves one committed cancellation; retrying a definite failed attributed email sends the same response row without repeating cancellation | Provider reconciliation for unknown delivery |
| Return and exchange | Approved fake-provider receipt and gateway send; a return or exchange whose returnable quantity falls to zero during approval records a rejected receipt without return creation; an exchange whose replacement price rises is also refused | Unknown probe, revised instruction, delivery retry |
| Return-label attachment | Typed receipt/dispatch boundary; merchant answer continues the parked task through approval and provider receipt; confirmed attachment gets an attributed gateway send, while an ambiguous provider outcome leaves the task reconciling and sends no label link | Recovery handoff and delivery retry after a confirmed attachment |
| Customer updates and explicit notes | Typed receipts | Claimed-task approval, grant/identity changes, provider outcome and delivery |
| Order creation and editing | Typed receipts | Isolated merchant selection, approval, operation-specific stale state and recovery |
| Gift card and fulfillment | Typed receipts; isolated from default support selection | Merchant-only path, approval, financial/fulfillment preflight, recovery and delivery |
| Internal thread updates and communication | Typed receipts and shared send boundary; failed/unknown send after cancellation is separate from the committed commercial effect; synchronous agent reply records its provider-attempt boundary, stale attempted sends become unknown, and concurrent definite-failure retries have one claimant; the real retry route and outbound worker deliver the same failed task-attributed response while preserving one committed cancellation action | Receipt-driven automatic status consequences; provider reconciliation for unknown sends |
| Operator shop operations: flash sale create/end, variant prices | Typed receipts | Claimed-task authority, partial/unknown outcomes, provider reconciliation and merchant delivery |
| Operator inbox operations: ticket reply, spam, reads | Ticket reply has durable send boundary | Exact task attribution, tenant/authority, failure and delivery recovery where applicable |

## Package 5: conversation and safety

| Gate | Evidence recorded | Next release evidence |
| --- | --- | --- |
| Distinct pending tasks | Classified topic/entity matching and return to a single match; two items on the same order remain separate and a named item resumes only its task | Clear “that one” from conversation context, ambiguous “yes” asks a useful question, cross-channel switch |
| Wait continuation | Merchant answer, revision, decline are accepted requests on the exact task | Customer wait and return; explicit preferences; another-device answer |
| Stop and supersession | Old approval invalidated; cancellation before dispatch ordered at task row | Stop after dispatch records actual/unknown effect; no later action |
| Stale approval | Shipped cancellation, revoked Shopify write grant, changed cancellation policy, lost member authority, and full-refund balance shrink refuse the effect | Partial-refund balance and address/return preconditions |
| Bookkeeping | Idempotent turn journal note | Receipt-driven status consequences; inspect residual automatic note/status calls |
| Completion wording | Receipt-based composition and negated-refund grounding case | Holdout paraphrases and unsupported-claim checks across effect rows |

## Package 6: release gate

1. Select one controlled workspace with `AGENT_RUNTIME_V2_ORG_IDS` while the
   default remains v1. Both support and dashboard requests now use this
   selector at task creation; existing tasks keep their persisted version.
   Clear the list only when promoting the global `AGENT_RUNTIME_VERSION`.
2. Run deterministic gates and the budgeted live-model release set on the same
   baseline and held-out inputs for v1 and v2. Record effect correctness, task
   completion, clarification, delivery, model calls, latency, and cost separately.
3. In an authorized controlled store, run approval → real provider → typed
   receipt → actual customer delivery with a bounded effect budget and test
   destination. Record redacted provider and message references.
4. Stage routing, watch duplicate/unauthorized effects, unknown aging, stuck
   tasks, and failed delivery, and rehearse rollback of **new** tasks to v1.
5. Re-inventory actionable persisted v1 records. Remove each superseded active
   parser, fallback, policy branch, or adapter only with a named replacement and
   proof that no active caller or actionable record needs it. Update architecture
   and product docs after removal.

No live-model or real-provider gate is claimed by the local fake-provider tests.

## 2026-09-21 local evidence

- Gateway approval host: `generate-thread-plan-order-status.test.ts` has 16
  database-backed cases, including grant and policy changes, stale full-refund
  balance, and sent/failed/unknown customer delivery after a confirmed
  cancellation. The 16-case file passed after the changes above.
- Shared approval boundary: `task-approval.integration.test.ts` has 23 passing
  database-backed cases, including membership loss during a wait.
- The rejected full-refund receipt exposed a lost-receipt branch in
  `tools/executor.ts`; preserving the receipt keeps the action's policy-block
  status and structured failure evidence aligned. `tools/registry.test.ts`
  passed with the scope-refusal status assertion.
- `npm run verify:pr` passed after the confirmed return-label host case and the
  other preceding changes, with local socket access. Static checks, unit tests, browser
  smoke (12 passed), coverage, and builds completed. The first full run with the
  new return-label case found a fixed Shopify account ID colliding across test
  workers; the fixture now uses an organization-specific ID. Earlier runs also
  exposed a local-listener `EPERM` in the sandbox and one transient gateway
  route `socket hang up`; its 24 tests passed in isolation. Live-model and
  real-provider gates have not run.
- Workspace routing has deterministic selector coverage plus database-backed
  support and dashboard request cases. Operational staging and rollback are
  still unrun.
- The return-label continuation host cases use a database-backed waiting task,
  an authorized merchant answer on another channel, an approved v2 proposal,
  and fake Shopify reverse-delivery calls. A confirmed receipt reaches the
  gateway send; an ambiguous provider response leaves a typed unknown receipt,
  a reconciling task, and no label-link send. All 11 cases in
  `operator-answer-replan.test.ts` passed after the full gate; gateway typecheck,
  touched-file lint, and `git diff --check` also passed.

## 2026-09-22 local evidence

- Synchronous agent replies now persist `sendAttemptedAt` before calling the
  provider. The outbound sweep treats a stale attempted `pending` message as
  `unknown`, while a pre-attempt pending message remains a definite failure.
  Database-backed dashboard dispatch and gateway sweep cases passed.
- The dashboard retry route conditionally claims a failed message before queue
  admission; a concurrent retry test admits one enqueue. The retry keeps the
  existing message identity and selects the agent reply source for an attributed
  task. This does not yet prove the full effect-to-delivery host retry gate.
- A database-backed gateway host case now parks a partial refund for approval,
  observes a prior refund on the same item at execution, records a rejected
  typed receipt, and sends no Shopify refund mutation. All 17 cases in
  `generate-thread-plan-order-status.test.ts` passed. A changed calculated
  amount without a prior refund remains a separate approval-contract question.
- The cancellation stale-approval host case now covers both fully and partially
  fulfilled orders. In each case approval records a rejected typed receipt and
  sends no cancellation POST. All 18 gateway host cases passed after local test
  services were restarted.
- The approved address-change host case now also covers fully and partially
  fulfilled orders and changed order ownership at execution. All refuse the
  order update with a rejected receipt. A definite customer-profile refusal
  after the order update preserves both outcomes in an unknown receipt and
  sends no success claim. All 22 cases in that gateway host file passed.
- The approved return host case now rechecks a quantity that fell to zero during
  approval. It records a rejected typed receipt without `returnCreate` or a
  success reply. The exchange host case also refuses a depleted returnable item
  and a replacement variant that became more expensive. All 25 cases in the
  gateway host file passed.
- Task continuity now rejects a match when either known order or known subject
  conflicts, so two return tasks for different items on one order stay separate.
  A named follow-up resumes only its matching task, while a terse follow-up
  matching both opens separate work without superseding either. All 59 task-
  ledger integration cases passed.
- Local implementation revisions: `d05d720e` (durable release batch and
  delivery recovery), `f3b91b5c` (address host cases), `06eafec3` (return and
  exchange host cases), and `4b027b66` (same-order continuity). A full
  `npm run verify:pr` passed on `4b027b66`, including static checks, unit tests,
  12 browser smoke tests, coverage, and builds. This gate does not include
  live-model evaluation or a real-provider/customer-delivery exercise.
- The cancellation host now injects a lost Shopify response after the provider
  committed, then confirms the cancellation through a fresh order read before
  sending the customer a success reply. One cancellation POST and one typed
  success receipt remain. A second path keeps an unconfirmed provider result
  unknown, sends no customer success claim, and leaves the task reconciling.
  All 26 gateway host cases passed.
- A database-backed delivery recovery case starts with one committed cancellation
  action and its failed task-attributed email. The dashboard retry route claims
  the existing message, and the gateway outbound worker sends that row. The
  message becomes sent with its original task identity and the cancellation
  action count remains one. All 7 retry-route cases passed.
- `npm run verify:pr` passed after the delivery changes, partial-refund host
  case, and test fixes: static checks, unit tests,
  browser smoke (12 passed), coverage, and builds. The first full run hit the
  sandbox's local-listener `EPERM`; an enabled-socket run then exposed a stale
  outbound-sweep unit mock, and the next run exposed an unrelated global bind-
  token count in a parallel dashboard test. Both test defects were fixed before
  this passing rerun. The partially shipped cancellation variant was added
  afterward and passed its targeted database-backed host file. Live-model and
  real-provider gates remain unrun.
