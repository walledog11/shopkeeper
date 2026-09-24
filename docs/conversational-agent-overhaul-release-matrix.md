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
| Full and partial refunds | Durable reference slice, typed receipts, live model with fake provider; full-refund balance shrink and a partial-refund selection consumed by another refund during approval preserve rejected receipts and send no refund mutation; runtime-v2 partial-refund proposals bind Shopify's quoted amount/currency, display it, and reject a changed execution-time quote before reservation or dispatch; shared attributed-delivery recovery is proved independently of the commercial effect | Controlled real-provider approval/effect/delivery |
| Address change | Approved fake-provider receipt and gateway send; full/partial fulfillment or changed order customer during approval records a rejected receipt without an order address PUT; customer-profile refusal after the order update preserves a typed partial outcome and prevents a success reply; shared task-attributed delivery recovery retries the response row without invoking the effect executor | Controlled real-provider exercise only |
| Cancellation | Approved fake-provider receipt and gateway send; shipped and partially shipped order, revoked-grant, and changed-workspace-policy waits refuse provider dispatch; a lost provider response after a committed cancellation is confirmed by a fresh read; an unconfirmed provider result leaves one unknown cancellation, stops the success reply, and keeps the task reconciling; failed/unknown customer send leaves one committed cancellation; retrying a definite failed attributed email sends the same response row without repeating cancellation | Provider reconciliation for unknown delivery |
| Return and exchange | Approved fake-provider receipt and gateway send; a return or exchange whose returnable quantity falls to zero during approval records a rejected receipt without return creation; an exchange whose replacement price rises is also refused; an incomplete return or exchange creation response records an unknown receipt, stops the customer success reply, and leaves the task reconciling; probes observe provider state but preserve the handoff when required receipt facts cannot be rebuilt; shared attributed delivery recovery does not invoke the effect executor; revising either operation supersedes the old proposal and approval executes one mutation with only the replacement card's exact inputs | Controlled real-provider exercise only |
| Return-label attachment | Typed receipt/dispatch boundary; merchant answer continues the parked task through approval and provider receipt; confirmed attachment gets an attributed gateway send, while an ambiguous provider outcome leaves the task reconciling and sends no label link; the host case hands that unknown action to reconciliation, preserves it for review when the receipt cannot be rebuilt, and does not repeat the mutation; shared attributed delivery recovery retries the response row without invoking the effect executor | Controlled real-provider exercise only |
| Customer updates and explicit notes | Typed receipts; bounded discovery only for explicit customer-record requests; claimed runtime-v2 revision and approval; revoked write grant and changed linked-customer identity refuse provider dispatch; confirmed outcomes produce grounded task-attributed delivery; ambiguous outcomes remain reconciling and suppress replies | Controlled real-provider exercise only |
| Order creation and editing | Typed receipts | Isolated merchant selection, approval, operation-specific stale state and recovery |
| Gift card and fulfillment | Typed receipts; isolated from default support selection | Merchant-only path, approval, financial/fulfillment preflight, recovery and delivery |
| Internal thread updates and communication | Typed receipts and shared send boundary; failed/unknown send after cancellation is separate from the committed commercial effect; synchronous agent reply records its provider-attempt boundary, stale attempted sends become unknown, and concurrent definite-failure retries have one claimant; the real retry route and outbound worker deliver the same failed task-attributed response while preserving one committed cancellation action | Receipt-driven automatic status consequences; provider reconciliation for unknown sends |
| Operator shop operations: flash sale create/end, variant prices | Typed receipts | Claimed-task authority, partial/unknown outcomes, provider reconciliation and merchant delivery |
| Operator inbox operations: ticket reply, spam, reads | Ticket reply has durable send boundary | Exact task attribution, tenant/authority, failure and delivery recovery where applicable |

## Package 5: conversation and safety

| Gate | Evidence recorded | Next release evidence |
| --- | --- | --- |
| Distinct pending tasks | Classified topic/entity matching and return to a single match; two items on the same order remain separate and a named item resumes only its task | Clear “that one” from conversation context, ambiguous “yes” asks a useful question, cross-channel switch |
| Wait continuation | Merchant answer, revision, decline are accepted requests on the exact task; a delivered customer question records that customer as the durable answerer and their next message resumes the exact task even when classification is absent; active merchant preferences already load with source/scope policy tests; any authorized member can answer the org-scoped merchant wait | Live conversational evidence for clear/ambiguous referents and channel switching |
| Stop and supersession | Old approval invalidated; cancellation before dispatch is ordered at the task row; cancellation after dispatch preserves a committed outcome or leaves submitted work reconciling, and prevents later work | No remaining deterministic runtime case; retain in held-out conversation/release evaluation |
| Stale approval | Shipped/partially shipped cancellation, revoked Shopify write grant, changed cancellation policy, lost member authority, full-refund balance shrink, changed address ownership/fulfillment, depleted return quantity, invalidated exchange replacement, and changed partial-refund quote all refuse the effect | Keep in controlled real-provider and holdout evaluation |
| Bookkeeping | Idempotent runtime turn journal; no routine action-note prompt; retained note/status/tag tools are explicit operations; runtime-v2 receipt composition replaces speculative completion drafting | Keep the v1-only draft path until Package 6 persisted-state inventory permits deletion |
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
- A database-backed gateway host case parks a partial refund for approval,
  binds Shopify's calculated amount/currency into the proposal, displays that
  amount, and re-quotes immediately before execution. A changed amount records
  a rejected typed receipt before reservation or dispatch and sends no Shopify
  refund mutation. A separate case observes a prior refund on the selected item
  and also refuses the mutation.
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
- The approved return host now also covers Shopify omitting the created return
  after one `returnCreate` attempt. The action keeps a typed unknown receipt, the
  task remains reconciling, and no customer success reply is attempted. All 27
  gateway order-status host cases passed.
- The exchange host applies the same boundary when Shopify omits its created
  exchange return: one `returnCreate` attempt, one typed unknown action, no
  customer success reply, and a reconciling task. All 28 gateway order-status
  host cases passed.
- Existing database-backed unknown-outcome reconciliation cases were rerun for
  return, exchange, fulfillment, return-label, order-edit, address, and customer
  updates (7 passed). Return and exchange probes can observe the provider commit,
  but lifecycle actions stay unknown when the probe cannot reconstruct the full
  typed receipt. This is the intended human reconciliation handoff. Delivery
  retry is a shared message-row boundary independent of the preceding effect;
  its host test never re-enters the effect executor.
- `npm run verify:pr` passed on `e8662502` after this recovery batch: static
  checks, workspace tests, 12 browser smoke tests, coverage gates, and production
  builds all completed. The first attempt was stopped only by the sandbox's
  local-listener `EPERM`; the permitted socket-enabled rerun passed.
- `npm run verify:pr` passed after the delivery changes, partial-refund host
  case, and test fixes: static checks, unit tests,
  browser smoke (12 passed), coverage, and builds. The first full run hit the
  sandbox's local-listener `EPERM`; an enabled-socket run then exposed a stale
  outbound-sweep unit mock, and the next run exposed an unrelated global bind-
  token count in a parallel dashboard test. Both test defects were fixed before
  this passing rerun. The partially shipped cancellation variant was added
  afterward and passed its targeted database-backed host file. Live-model and
  real-provider gates remain unrun.
- Customer questions can now opt into a durable customer-scoped wait only after
  their reply action succeeds. The next message from that exact customer resumes
  the task even without a classifier hint; ambiguous multiple customer waits
  still fail closed. Focused agent integration tests and the 29-case gateway
  order-status host file passed.
- The inbound classifier now receives an explicit exactly-one-referent rule:
  copy prior request facts only for a unique conversational referent, otherwise
  return deliberately unresolved facts so planning asks a focused question.
  Its 36 unit tests passed. This is deterministic prompt/ledger evidence, not
  the still-required live-model conversational acceptance evidence.
- `npm run verify:pr` passed after the amount-binding, customer-wait, and
  referent-classification batch: static checks, workspace tests, 12 browser
  smoke tests, coverage gates, and production builds completed.
- The one-repeat live-model release gate completed with fresh result evidence
  under a cumulative $0.90/150-call authorization. The initial dashboard run
  passed all 48 completed hard fixtures (including `refund-partial`) before its
  sub-limit stopped the last fixture; that isolated fixture then passed 1/1 for
  $0.0438 and 4 calls. Across both dashboard runs all 49 fixtures passed, using
  $0.7669 and 92 calls. The gateway `clear-fraud-multi-signal` hard case passed
  1/1, and its post-suite assertion kept that run within $0.05 and 6 calls. The
  combined run stayed below the cumulative authorization. This certifies the
  current-runtime release set, not the still-open v1/v2 comparison or dedicated
  clear/ambiguous-referent live variants.
- No controlled runtime workspace or provider/customer destination is selected.

## 2026-09-23 local evidence

- A database-backed operator continuation host case now revises both a return
  and an exchange proposal. The original proposal becomes superseded, the same
  task advances to the replacement card, approval sends exactly one Shopify
  mutation, and its line item, reason, and replacement variant come only from
  the revised inputs. The attributed customer reply completes that task.
- The ambiguous return-label continuation now crosses the real reconciliation
  boundary in the host case. Because its typed success facts cannot be rebuilt,
  it remains unknown/reconciling for review, does not repeat the reverse-delivery
  mutation, and sends no customer label link.
- All 13 `operator-answer-replan.test.ts` cases passed with the local database,
  followed by gateway typecheck, lint, and `git diff --check`.
- Customer profile updates and explicit customer notes now run through the same
  claimed runtime-v2 continuation boundary. Eight database-backed host cases
  cover confirmed and ambiguous provider outcomes, a revoked `write_customers`
  grant, and a conversation whose linked Shopify customer changes during the
  approval wait. Confirmed receipts ground a task-attributed customer reply;
  ambiguous receipts leave the task reconciling and suppress that reply; both
  authority changes refuse the provider mutation.
- The shared executor now revalidates a customer-record action against the
  conversation's current linked Shopify customer immediately before dispatch.
  Threadless and explicitly targeted merchant operations retain their prior
  behavior. Planner-selection tests also prove that both tools are discoverable
  for explicit requests and that ordinary order-status help does not expose the
  note tool.
- All 21 `operator-answer-replan.test.ts` host cases passed after adding the
  eight customer-record variants. `npm run verify:pr` then passed static checks,
  workspace tests, 12 browser smoke tests, every coverage gate (including 1,448
  gateway tests and 1,455 agent tests), and all production builds. This is local
  fake-provider evidence; the controlled real-provider exercise remains unrun.
