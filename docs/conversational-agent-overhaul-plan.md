# Conversational agent overhaul plan

Status, 2026-09-29: not complete. Packages 0–5 are built and pass tests against
a scripted model and fake Shopify. Real-store proof is partial: the Gate C row
below says which effects have run. Package 6 (certify, cut over, and delete the
old runtime) has the steps in [Open work](#open-work-in-order) left. No
question waits on the release owner. Production runs runtime v1 by default,
with one controlled organization on runtime v2.

Created 2026-09-11. This file holds the open work, the rules for doing it, and
the design it must match. Run-by-run evidence lives in the
[Package 6 release evidence](conversational-agent-overhaul-p6-release-evidence.md)
and the [release matrix](conversational-agent-overhaul-release-matrix.md). The
capability inventory, frozen budgets and evaluation manifest are in the
[Package 0 baseline](conversational-agent-overhaul-p0-baseline.md). Finished
work is summarized in [What has been done](#what-has-been-done), and the
release owner's answered questions are in
[Settled decisions](#settled-decisions). The commit-by-commit record of
Packages 0–5 is in git: `git show fff54dc4:docs/conversational-agent-overhaul-plan.md`
(Appendix A and Appendix B).

This document authorizes no production operation by itself. It supersedes the
[maintainability audit](agent-maintainability-audit-2026-09-11.md) where the two
differ: conversation remains model-authored, and tool discovery remains adaptive.

Read down to [What has been done](#what-has-been-done) before starting work.
[Settled decisions](#settled-decisions) and everything from
[Product outcome](#product-outcome) onward are binding. Contract sections whose
work is already built are condensed to the rules that still apply, and each is
marked *condensed*.

## Rules for implementing this plan

These rules restate what this plan and the repository instructions already
require, in the order an implementer needs them. They are at the top because
the Gate C exercise on 2026-09-25 broke rules 2, 3 and 5: a prompt instruction
(#107) and a prose-matcher exception (#108) were built for defects whose owning
contract was unbuilt.

1. **This plan is the route.** When code, a test or a live run points somewhere
   the plan does not, stop and report the mismatch with its evidence. Do not
   pick a different mechanism. If a named location moved, update the location
   here; never use the mismatch as a reason to invent another runtime or
   contract (*How to execute this plan*).
2. **Fix a defect through the contract that owns it.** Every contract has a
   section below; name it in the change. Never compensate for a broken claim,
   receipt, tool selection or other runtime contract with a prompt instruction
   (*How to execute this plan*, item 5). Never add a case or exception to a
   prose matcher, or a per-phrase carve-out (CLAUDE.md, *Never branch on
   prose*). If the owning contract is not built, the defect stays open, its gate
   stays blocked, and the next work item is building the contract.
3. **Prove the cause before fixing it.** Reproduce it with stored data or on the
   dev store first. A deterministic test is for a cause a live run cannot safely
   show: a race, a crash, a refusal before a write, a money limit. A fix built on
   an unproven cause is reverted, not kept.
4. **A checkbox is a claim. Check it before building on it.** Read the code path
   behind any `[x]` you rely on. If the code contradicts it, add the defect to
   [Open work](#open-work-in-order) in the same change.
5. **A passing test proves only what it asserts.** Scripted-model and
   fake-provider tests cannot show model behavior or real delivery (Package 6
   cutover step 3). Never present a passing test as evidence a problem is solved
   while its cause remains. An item is done when it has been seen working on the
   dev store or phone; a green test is never an item's done criterion.
6. **Live exercises start from a realistic customer ticket** on the dev store
   (order status, address change, cancellation, return, refund), not from the
   effect under test.
7. **Keep this document current in the same change as the code.** Update
   *Current state* and *Open work*. Evidence goes in the evidence document, not
   at the top of this file.
8. **Paid model runs follow CLAUDE.md:** justify each one, use single-fixture
   probes for diagnosis, and never tune and rerun in a loop.
9. **Record a finding once, where the work is.** A defect the code shows goes
   into *Open work* as an item naming the contract it breaks, placed where it
   blocks. A question only the release owner can answer goes under *Open
   decision*, with the facts and a recommendation. When either is done it
   leaves the top of this file: finished work moves to *What has been done*, an
   answer to *Settled decisions*. Do not keep separate lists of disagreements.

## Current state

| Area | State |
| --- | --- |
| Packages 0–5 | Built. Tested only with a scripted model and fake Shopify, which cannot show that they work. Of the retained Shopify writes, only the customer note, address change and cancellation have run on the real store. |
| Gate A: comparison tooling | Done. |
| Gate B: v1/v2 model comparison | **Advisory since 2026-09-28** (decision I): a paid run happens only when the release owner asks, and it does not block rollout, which rests on Gate C's live runs. Last result, **not passed.** Both workflow runs on `cf41c169` (2026-09-26) reported failure. v2 failed the C08 held-out 2 of 2 and `refund-partial-placeholder` 1 of 2. Those misses were recorded as a runtime defect and a harness gap and the gate was called passed; a runtime defect is a v2 failure, so it was not a pass. #125 then changed the runtime to fix C08's failure, so C08 can no longer count as held-out. A new unseen C08 variant is needed. |
| Gate C: real provider and delivery | Rerun in progress. 1 of 14 effects done cleanly: `cancel_order`, repeated on #1036 on 2026-09-28 after its first run (#1032) promised a refund Shopify never made (item 8b). Before the rerun, 0 of 5 real-store attempts worked cleanly (four runs on 2026-09-25, one on 2026-09-27; setup, run order and deploy state in the release evidence). The repeat surfaced items 8c–8e, which stopped the rerun; all three are built and close on the next run. |
| Gate D, staged rollout, Gate E | Not started. |
| Production routing | `AGENT_RUNTIME_VERSION=1` on both services, with `AGENT_RUNTIME_V2_ORG_IDS` set to the controlled organization since 2026-09-25. New tasks for every other organization run v1. |
| Work in flight | Items 8c, 8d and 8e are built; each closes when the next Gate C run shows it (8c and 8d on the phone card, 8e in the confirmation after approval). Next: resume the Gate C rerun, `update_shopify_customer_info` first. |

## Open work, in order

Do these in order, one change each. Each item names the contract it implements
and what done means. Items that touch the agent path land through a pull
request. Doc-only changes go straight to master. The numbers continue the
original list so references in the release evidence stay valid; items 1–7, 8b
and 9a are in [What has been done](#what-has-been-done).

8. **Re-run Gate C** (decision F): one controlled run per retained Shopify
   write that has never touched a real store, each from a realistic ticket
   (rule 6), with the inputs recorded in the release evidence and the result
   recorded there. The runs, grouped by how the effect is reached:
   - *From a customer ticket:* `create_refund`, `create_partial_refund`,
     `cancel_order`, `create_return`, `create_exchange`, `attach_return_label`
     and `update_shopify_customer_info`.
   - *From a merchant instruction, isolated from default support discovery:*
     `create_shopify_order`, `edit_shopify_order`, `fulfill_order` and
     `create_gift_card`.
   - *Operator-only, from a merchant instruction:* `create_flash_sale`,
     `end_flash_sale` and `set_variant_prices`.

   A merchant-instruction run is the realistic ticket for an effect no customer
   can request. It runs its write under the instruction's own authority
   (`executeOperatorAgentTurn`), with no approval card, so item 8a's card
   binding does not reach it. Until item 10 lands, those runs go through the dashboard, whose
   requests are durable tasks; a phone instruction creates no task and would not
   exercise the v2 path. One run may prepare state for the next (a fulfilled
   order before a return, a return before its label), and each run is recorded
   on its own. Run 1 went to `cancel_order` ahead of
   `update_shopify_customer_info`, which the release evidence's run order puts
   first; that run is still owed. The 2026-09-25 address changes used
   `update_shopify_order_address`, a different tool.

   Each customer-ticket run is done when its execution is stored as succeeded,
   the typed receipt matches Shopify's actual state, the customer receives the
   approved draft unchanged except for its filled placeholders, and the release
   evidence records redacted provider and message references. A
   merchant-instruction run is done on the same terms, with the merchant's reply
   in place of customer delivery. A failure is a finding against its owning
   contract (rule 2); stop, record it, and fix it before continuing. The release
   evidence also offers an optional step 7: retry a deliberately induced
   definite delivery failure and confirm the write does not repeat. Choose each
   ticket to also show a conversational acceptance row where a realistic ticket
   allows (item 8h).
8c. **Phone cards never show the exact draft** (*Approval and communication
    contract*: the merchant approves the customer message as it will be sent).
    Found by the Gate C repeat of run 1, 2026-09-28. `toGatewayAgentPlan`
    (`agent-plan-adapter.ts`) copies a plan's steps, calls, signals and
    validation but not `communication`, so `sendOperatorPlanNotification`
    never has the exact draft and `formatOperatorPlanMessage` falls back to the
    legacy excerpt of the `send_reply` call. The card then shows placeholders
    as raw tokens ("your {{refund_amount}} refund") instead of
    `displayApprovedDraft`'s labels, and uses the legacy lead. Every v2 phone
    card since #111 took this path; the card tests pass `communication` to the
    formatter directly and never go through the adapter.
    - Done when the adapter carries `communication` and the next Gate C run's
      phone card shows the draft with its placeholders labeled.
    - Built in `9914f3d9`; the live run is owed.

8d. **A cancellation's refund is approved without its amount** (*Approval and
    communication contract*; decision H). Found by the same run. #132 made
    `cancel_order` refund Shopify's quoted paid balance, but quotes it only at
    execution. `create_refund` and `create_partial_refund` bind Shopify's quote
    into the approval at planning (`bindProviderApprovalFacts`, `planner.ts`),
    show it on the card, and refuse to execute when the quote has changed.
    `cancel_order` does none of that, so the merchant approved "Cancel order
    and refund payment" with no amount, and the only amount on the card was the
    `{{refund_amount}}` placeholder.
    - The change: bind the cancellation's refund quote into the approved call
      as the refund quotes are bound, render it on every card ("Cancel #1036
      and refund $49.95"), and refuse before the cancel call when execution's
      quote differs. The placeholder stays filled from the receipt.
    - Done when a Gate C cancellation's card names the amount. The one
      deterministic test is that a quote changed after approval refuses before
      any write, which a live run cannot show without corrupting an order.
    - Built; the live run is owed. `quoteCancellationForApproval`
      (`order-cancellation.ts`) binds the quote as the runtime-only
      `approval_amount` and `approval_currency`, which the model's tool schema
      does not show; `"0.00"` means nothing is refunded. An order that cannot
      be cancelled is left unbound for execution to refuse, rather than failing
      the plan. The card sentence is `lineItemWriteSentence` ("Cancel the order
      and refund $49.95"), so the dashboard and phone cards read the same.
      `cancelOrder` refuses with `amount_mismatch` before the cancel call when
      the bound amount differs from Shopify's quote. A call with no bound
      amount — an approval made before this change, or a merchant instruction
      run under its own authority — executes as before.

8e. **The approval confirmation is one tool's result string** (*Response
    grounding and delivery*; CLAUDE.md, *Compose from fields*). Found by the
    same run. After a phone approval the merchant is sent
    `summarizeApprovedDashboardActions` (`run-approved-actions.ts`), which is
    the last non-read action's `result` text. After a cancel-and-reply plan
    that was "Reply sent to customer via email.": it omits the cancellation
    and the refund, and reads as a log line. The same rule drops effects
    whenever a reply comes last: a reply skipped because its approved write
    failed is reported as the skip, not as the write's failure, and a
    committed write followed by a reply that was withheld or not delivered is
    reported as the reply alone. Observed 2026-09-28 by running the function
    on hand-built action lists (a withheld reply after a commit, and after a
    failure).
    - The change: compose the confirmation from the typed receipts of the
      actions that ran (what was cancelled, refunded, sent and to whom), never
      from result text. A failure keeps its existing failure copy and names
      every effect that committed before it. A committed write whose reply did
      not go out is a committed execution (item 5), so the merchant is told
      the customer has not been told.
    - The text is also a control signal. After a run, `runApprovedPendingPlan`
      (`pending-plan-actions.ts`) clears the parked phone card only when the
      summary does not begin with `Error:` or `Unknown:`
      (`isPlanExecutionFailureMessage`, `message-dispatch.ts`), and the
      `approve_pending_plan` tool and the keyword approval reply
      (`pending-plan-commands.ts`) pick their copy the same way. A committed
      write must not read as a failure to them, and an unknown outcome must
      keep its `Unknown:` prefix. Moving that decision from the prefix to the
      typed outcome is item 8g, not part of this item. If the text
      and the decision cannot be kept in agreement, stop and report (rule 1)
      rather than add a case to the matcher.
    - Done when a cancel-and-reply approval on the next Gate C run confirms
      both effects with the refunded amount from the receipt. The mixed
      cases are seen on the release evidence's optional step 7 (a
      deliberately induced delivery failure), or reported as not verified.
    - Built; the live run is owed. `summarizeApprovedDashboardActions`
      (`run-approved-actions.ts`) writes one clause per action that took effect,
      from the tool's registered past-tense label (`TOOL_LABELS`) and its
      receipt: the values a reply placeholder can read from it
      (`receiptPlaceholderValues`, so the refunded amount is the one
      `{{refund_amount}}` would fill), and for a reply its recipient from the
      receipt, else the ticket's customer (`classifyPerson`). A cancel-and-reply
      approval reads "Cancelled order (refund amount $49.95). Sent reply to
      Walle." A committed plan whose reply did not go out adds "The message to
      Walle wasn't sent, so they haven't been told" and carries no prefix. A plan
      that did not commit starts with its first unknown action or definite
      failure among the effects (`outcomeCause`, `execution-outcome.ts`), in
      `formatOperatorDispatchFailure`'s copy, then "Already done:" and the
      effects that committed. The prefix comes from that action's typed status,
      so a tool that omitted `Error:` no longer reads as a success to the phone.
      Seen on hand-built action lists shaped like the executor's, before and
      after; not yet on the phone.

8f. **The dashboard's `send_email` sink drops the provider message id**
    (*Typed receipts and operation identity*). Found while fixing item 8b:
    `thread-io/send.ts` discards the id its sender returns, as
    `sendEmailSynchronously` did before #132. Gate C's customer-ticket runs reply
    through `send_reply`, which #132 fixed, so this does not stop the rerun.

8g. **Approval outcomes are decided by reading the confirmation's prefix**
    (*Durable request and work state*, item 5's typed outcome; CLAUDE.md,
    *Never branch on prose*). Found 2026-09-29 while scoping item 8e, which
    keeps the prefix in agreement with the outcome and does no more.
    `isPlanExecutionFailureMessage` (`message-dispatch.ts`) is
    `startsWith("Error:")` or `startsWith("Unknown:")`, and it is the control
    signal. `runApprovedPendingPlan` (`pending-plan-actions.ts`) clears the
    parked phone card by it, and the keyword approval reply
    (`pending-plan-commands.ts`), the `approve_pending_plan` tool
    (`operator-session-tools.ts`) and `summarizeOperatorTurnDispatchFailure`
    read it too. A decision that a merchant's parked card rides on is read from
    English that one module wrote for display. Two symptoms remain after item
    8e, both seen by running the summary on hand-built action lists.
    `summarizeApprovedDashboardActions` formats a failure with
    `formatOperatorDispatchFailure` and each consumer formats it again, so an
    unknown outcome shows its "Check the ticket…" advice twice on the phone. And
    a plan whose only work is a reply that failed to send is typed `failed`, but
    its friendly copy carries no prefix, so it clears the card while every other
    failure leaves it parked.
    - The change: an approved run returns the typed outcome that
      `planExecutionOutcomeForActions` already computes, beside its summary, and
      each caller above branches on that. The summary becomes display-only and
      the prefix matcher is deleted.
    - Done when no path decides an approval's outcome from summary text, a
      committed write whose reply was withheld still clears the card on the
      phone, and an unknown outcome still leaves it parked. The unknown case
      cannot be shown live, so look for existing coverage before writing any.
      Does not block Gate C.

8h. **Conversational acceptance is not scheduled** (*Acceptance matrix*: "A row
    is met when it has been seen working on the dev store or phone"; the
    closing paragraph: completion requires "conversational acceptance
    evidence"). Found 2026-09-29 by reading this plan against its own
    completion sentence. No item walks the matrix. Every row except the four
    covered by induced or deterministic failures (a committed write followed by
    a failed delivery, a provider timeout, a refresh retry, concurrent
    approvals) describes conversation. Their evidence so far is the Gate B
    evals, which are advisory, and Package 5's two live-model continuity cases;
    neither is a dev-store or phone sighting.
    - The change: no separate campaign. Each remaining Gate C ticket (item 8)
      is chosen to also exercise a conversational row where a realistic ticket
      allows (rule 6), and the release evidence records which rows the run
      showed.
    - Done when each conversational row is recorded as seen in a Gate C run or
      listed in the release evidence as not verified.

9. **Gate D**, observation and rollback rehearsal, as written in the release
   evidence. Needs the observation window and operator, which the release
   evidence lists as "pending". Production carries no merchant traffic besides
   the controlled organization, so the window will measure only controlled runs.
   The evidence must say so rather than present it as rollout observation.

10. **Phone instructions as durable tasks** (decision E; *Target architecture*,
    "Support and operator turns … share request identity, budgets, receipts,
    and recovery semantics"; Package 6 acceptance, "all retained capabilities
    have one execution owner"). Today a free-form Telegram or iMessage
    instruction reaches `runOperatorFreeFormTurn` through
    `executeFreeFormInstruction` (`apps/gateway/src/routes/telegram/agent-execution.ts`,
    which the iMessage handler also calls) with no request or task, so the turn
    gets no task budget, stop, or task recovery. Only the inbound message is
    durable, as an `OperatorEvent`. The dashboard reaches the same function
    through the durable task worker (`workers/agent-task.ts`). Package 2
    deferred the phone surfaces and no later package scheduled them. The
    change: a phone instruction becomes an accepted `AgentRequest` run as a
    claimed `AgentTask`, as a dashboard instruction already is.
    - Reuse, do not replace, the `OperatorEvent` claim and its
      `operator-event-sweep`. The event stays the inbound record and the
      dedupe boundary; the request's dedupe key derives from the event, so a
      redelivered provider message reaches the same request.
    - The turn runs through the same task claim, budget, stop and lease
      recovery as `workers/agent-task.ts`. The reply to the phone still goes
      out through the event's committed-reply path, so the sweep's re-send of
      a committed but undelivered reply keeps working.
    - `executeFreeFormInstruction` no longer calls `runOperatorFreeFormTurn`
      directly.
    - Done when a live Telegram and iMessage round-trip shows a phone
      instruction creating exactly one request and one task, charging the task
      budget, stopping when told to, and sending its phone reply once
      (CLAUDE.md: operator changes are verified by live phone round-trip, not
      evals). Deterministic tests cover only what a live run cannot show: a
      redelivered message reaches the same request, and a dead worker leaves
      the task `reconciling` without replaying a write.

10a. **Ticket-composer instructions as durable tasks** (the same contract as
    item 10: *Target architecture*, "Support and operator turns … share request
    identity, budgets, receipts, and recovery semantics"; Package 6 acceptance,
    "all retained capabilities have one execution owner"). Found 2026-09-27. A
    merchant instruction typed in a ticket's composer, and a plan regenerate,
    reach `POST /api/agent/plan` (`apps/dashboard/src/app/api/agent/plan/route.ts`,
    called by `fetchAgentPlan` in `useConversationAgentFlow`). The route builds
    context and calls `planAgent` inside the dashboard with no request, no task
    and no runtime version, so it plans as runtime v1 whatever the
    organization's routing says, and writes the plan to `Thread.cachedPlan`
    with no `AgentProposal`. Approving it then takes the no-proposal branch of
    `executeCurrentCachedHomePlan` ("those execute exactly as they did
    before"). The controlled organization's ticket-composer instructions
    therefore never exercise v2. Package 2 made the dashboard *chat*
    (`/api/agent/chat`) durable; Package 5 made *customer* messages durable;
    neither covered this route, and item 10 names only phone instructions.
    - The change: a ticket-composer instruction becomes an accepted
      `AgentRequest` run as a claimed `AgentTask` on the thread, pinned to the
      organization's runtime version, as a customer message already is. The
      route stops calling `planAgent`.
    - Not yet established: what a composer plan written over a waiting v2
      task's cached plan does to that task and its proposal. Establish it
      before building (rule 3) from the code path and one composer instruction
      on a controlled-store thread whose v2 task is waiting for approval.
    - Done when a composer instruction creates exactly one request and one
      task, plans on the task's runtime, its approval goes through
      `authorizeAgentProposal` against a persisted proposal, and a waiting task
      on the same thread is superseded or left intact by a stated rule.

10b. **Refund limits ignore currency** (*Capability and result contracts*,
    the policy each write is checked against). Found 2026-09-28 while closing
    PR #91, whose headline fix no longer applies (the model no longer names a
    refund amount or currency). `maxRefundAmount` and the daily compensation cap
    are amounts in the shop's currency, but both refund paths compare them with
    Shopify's quote in the currency the customer was charged:
    `checkParsedStaticToolPolicy` reads `create_refund`'s runtime-supplied
    `amount`, `createPartialRefund` compares its calculated presentment cents,
    and the executor reserves the daily budget in the same presentment cents.
    On a multi-currency order the comparison is wrong in both directions: a
    customer charged in a stronger currency gets past a limit they exceed. This
    store has presented CAD (PR #91 probed order #1031).
    - Reproduced 2026-09-29 (rule 3) by a deterministic test on the unfixed
      code: a USD shop, a customer charged 45.00 GBP that costs the shop 60.00
      USD, a $50 limit. The refund passed the limit and the daily budget
      booked 4500 cents, not 6000.
    - The change: compare shop money with shop money, from Shopify's own
      shop-money figure for the refund, or refuse as not comparable when that
      figure is unavailable. Never convert with a rate of our own.
    - Built; not seen against Shopify. `refundShopCents` (`refund-shop-money.ts`)
      is the one answer to "what does this refund cost the shop": the quote
      itself when the customer was charged in the shop's currency (no extra
      Shopify call), otherwise Shopify's own shop-money figure for the same
      selection (`Order.suggestedRefund`), accepted only when its presentment
      side equals the quote and refused as `shop_amount_unavailable` when not.
      The full-refund quote binds it as the runtime-only `approval_shop_amount`,
      only when the two currencies differ (absent means the quote is that
      figure), and execution refuses when a fresh figure differs from the
      approved one. `shopMoneyAmountOf` (`static-policy.ts`) is the one reader
      for the per-refund limit and the executor's reservation;
      `createPartialRefund` applies the limit to the same figure and reserves
      it. A refund's committed spend is now `totalRefundedSet.shopMoney`, so
      `RefundToolResult.refundedCents` is shop money, and the `create_refund`
      reconciliation probe commits the reservation's own figure instead of its
      presentment total. `RefundShopMoney` is registered in
      `SHOPIFY_QUERY_DOCUMENTS` for the live `--validate` check. Owed: that
      check, and a read-only quote on order #1031 (59.90 CAD, 43.48 USD).
    - Does not block Gate C: every Gate C order is USD with no other
      presentment currency, and USD orders make the same Shopify calls as
      before. Blocks item 11, which would put other stores on these limits.

10c. **A partial refund with an unknown outcome can never be reconciled**
    (*Typed receipts and operation identity*: unknown outcomes go to
    reconciliation). Found 2026-09-29 while fixing item 10b. The
    `create_partial_refund` probe (`reconciliation-probes/registry.ts`) calls
    `probeRefund` with `amount: ""`, which `requireAmount` rejects, so it
    returns `still_unknown` ("amount is required") even when Shopify lists the
    matching refund. Run against a stubbed Shopify that lists one successful
    refund, the `create_refund` probe returned `committed` and the partial probe
    `still_unknown`. The action and its budget reservation stay unknown until
    someone resolves them by hand. Does not block Gate C; land it before Gate D
    counts unknown operations.

11. **Staged rollout** (Package 6, cutover step 4). Expand v2 routing beyond the
    controlled organization once Gate C's live runs pass, then make v2 the
    default for new tasks. The paid comparison (Gate B) is advisory: if the
    release owner asks for one before an expansion, it includes the C08
    held-out (`withheld-cancellation-follow-up`) with its expectation unchanged
    (decision G) and a new C08 variant written after #125, since C08 itself was
    fixed against. A held-out fixture cannot run alone, so that is the whole v2
    suite. Stop expansion on any unauthorized or duplicate effect. Existing tasks keep their runtime version. Until items 10 and 10a
    land, phone and ticket-composer instructions create no task, so "new
    tasks" means customer messages and dashboard chat.
12. **Gate E**, persisted-state inventory and deletion, using the targets below.
    It includes the synchronous operator path item 10 replaces and the
    taskless composer planning item 10a replaces.
13. **Documentation.** Update the architecture and product docs to describe the
    single runtime (Package 6, last checkbox). Remove conflicting directions
    rather than adding another layer.

### Gate E deletion targets

Each target needs the persisted-state check in Package 6, step 5, unless it is
marked as having no caller.

- Forced speculative completion drafting in the v1 capture path: the draft v1
  must invent before any outcome exists. This is not the `exact_draft` message
  of decision A, which is shown to the merchant, hash-bound and sent only if the
  write succeeds; do not delete machinery that `exact_draft` reuses.
- Full-registry widening: `request_wider_tool_set` and the broad mutation bucket
  in `planner-tool-selection.ts`, on migrated paths.
- Active result-text fact extraction: the historical branch of
  `executedCompletionFacts` and the text parsing in `completion-facts.ts`
  (`Refunded $…` for `create_partial_refund`, `financial_status` for
  `cancel_order`), plus reply rejection by `unsupportedReplyCompletionClaims`.
- Duplicated per-channel approval and policy code; obsolete runtime adapters and
  cached-plan recovery paths.
- Instructions in `SUPPORT_INSTRUCTIONS` written for v1 speculative drafting
  (calling `send_reply` after every action, drafting conditional completion
  wording). Under decision A, v2 also drafts the customer message before
  approval, so rewrite these for `exact_draft` placeholders rather than
  deleting them. Changing them is eval-gated.
- After item 10: the direct `runOperatorFreeFormTurn` call in
  `executeFreeFormInstruction` (`apps/gateway/src/routes/telegram/agent-execution.ts`)
  and anything left that only it used.
- After item 10a: the `planAgent` call in `POST /api/agent/plan`
  (`apps/dashboard/src/app/api/agent/plan/route.ts`) and anything left that
  only it used.

## Open decision

Blocks the work named until the release owner answers it. When answered, it
moves to [Settled decisions](#settled-decisions).

None.

## What has been done

The detailed record, with commits, test counts and rollback notes, is in git at
`fff54dc4` (Appendix A and B of the earlier version of this file).

**Package 0 — baseline and contracts** (2026-09-12). The work was an identity
map across the dashboard, phone and support paths; an inventory of 47
capabilities; production persisted-state counts; frozen runtime budgets; and the
C01–C12 evaluation manifest. All of it is in the Package 0 baseline. Task cost
and the avoidable-handoff rate were unavailable from existing records.

**Package 1 — typed outcomes** (2026-09-15, `db156a2c`). `ReceiptV1` (outcomes
`succeeded`, `rejected`, `failed`, `not_found`, `unknown`, with runtime
validation) travels from the provider adapter through `ToolResult`, the
executor, `ActionEntry` and `AgentAction.receipt` to completion facts. It covers
all sixteen retained Shopify writes, the internal-thread writes (note, status,
tag, spam) and outbound communication. The Shopify writes are:
- full and partial refund, cancellation, return, exchange and return label;
- fulfillment, order address, order edit and order creation;
- customer info, customer note and gift card;
- flash sale create and end, and variant prices.

Each retained write moves through a durable lifecycle: `prepared` →
`dispatch_authorized` → `submitted` → `settled` or `unknown`. The lifecycle uses
organization-unique operation IDs. A stale attempt becomes `unknown` and is never
replayed, and a probe that cannot rebuild a complete receipt leaves the action
`unknown`. Each tool's Shopify scopes are enforced at both selection and
execution. Replies and emails persist a logical response `Message` before
dispatch. String-only historical rows are readable only through an explicit
legacy option. Never run: live Shopify schema validation (decision F; item 8).

**Package 2 — durable dashboard requests** (2026-09-15/16). The new tables are
`AgentRequest`, `AgentTask` and `AgentProposal`. Dashboard submission works as
follows:
- Each submission gets a client UUID. The route returns 202, and the client
  polls status and restores the conversation after a refresh.
- A gateway task worker claims tasks with a lease. A one-minute sweep enqueues
  work that was accepted but never queued. An expired running claim becomes
  `reconciling` and is never replayed.
- The budget is crash-safe: model calls are reserved before the provider call,
  and active time is charged through `activeCheckpointAt`.
- A merchant stop is ordered at the task row (D03, D04).

Every approval surface (dashboard button, phone keyword, control tool) goes
through one boundary, `authorizeAgentProposal` (`task-approval.ts`). A parked
question resumes through `resumeAnsweredTask`. This package covered the
dashboard path only (item 10).

**Package 3 — adaptive refund slice** (2026-09-18). Planning can suspend at the
first write (`suspendAtProposal`). `decideAutonomy` decides a draft-less
proposal by the existing rules. An approved write fed its receipt back into the
loop, which composed the reply afterward; decision A has since replaced that on
v2. The package also found that `create_partial_refund` had never been
executable: the daily compensation reservation read an `amount` the tool does
not take. The reservation now happens where Shopify prices the refund. A live
model ran the whole slice on 2026-09-18 against a real database and a fake
provider, using 6 calls, about 56k tokens and about 12 seconds.

**Package 4 — capability discovery** (2026-09-18). `discover_capabilities`
returns at most `DISCOVERY_RESULT_LIMIT` tools, taken only from the caller's
already-authorized set. On v2, full-registry widening is gone:
- A classification the planner cannot use gets the starter set.
- The mutation bucket is narrowed, and the nine order mutations are reached by
  discovery.
- Context loads are split into required, operation-evidence and optional tiers
  (`loadNonFatalContext`, with a `kb_fetch_failed` signal).
- An aligned `order_status` turn defers the knowledge base to `search_kb`.

The storefront allowlist now runs before argument parsing at execution. Gift
cards left the default support set. A since-deleted estimate
(`discovery-cost.test.ts`, removed 2026-09-27) put the `order_mutation` first
prompt at 2,430 tokens instead of 5,176, and a narrowed status turn that must
then discover a capability at 13,313 instead of 5,929. Those were estimates, not
billed tokens: Gate B measured v2 at about 33% more per suite than v1.

**Package 5 — support conversations as durable tasks** (closed 2026-09-23,
`c2195343`):
- *Tasks and approvals.* Each inbound customer message is an `AgentRequest`
  (`acceptCustomerAgentRequest`) run as a claimed task. Any bound member may
  approve or answer (`ANY_MEMBER_ACTOR_KEY`). Approve, answer, revise, decline
  and a superseding customer message each end their wait at the ledger
  (`claimContinuedAgentTask`, `rejectAgentProposal`).
- *Execution.* Execution and task settlement commit in one transaction.
  Dispatch authorization locks the task row. Replies carry request and task IDs
  onto `Message`.
- *Runtime pinning.* Each new task persists its runtime version
  (`AGENT_RUNTIME_VERSION`, `AGENT_RUNTIME_V2_ORG_IDS`). v2 approval executes the
  durable proposal, not `Thread.cachedPlan`.
- *Host cases* (fake provider):
  - order status, KB and product answers;
  - address change, cancellation, return and exchange;
  - return label, and customer updates and notes;
  - stale-approval rechecks: shipped order, revoked grant, changed policy, lost
    membership, shrunk refund balance, and changed quote.
- *Continuity.* Classified topic and entity matching is in place. An ambiguous
  terse follow-up is limited to `send_reply`, and customer-question waits
  resume the exact task. Live-model clear- and ambiguous-referent cases passed.
  Turn-journal notes have an idempotent identity.

**Package 6, 2026-09-24 to 2026-09-25:**
- *Gate A.* The eval runner and `evals.yml` take a runtime selector
  (`EVAL_AGENT_RUNTIME_VERSION`), and result caches are isolated per runtime.
- *Paid fixture audit.* The paid set was cut from 51 core plus 36 extended
  fixtures to 26 hard plus 15 extended. Every retained case states why it needs
  a model, and the validator rejects unrealistic refund and reversal patterns.
  Full-refund amount and currency are quoted by Shopify at proposal time and
  re-quoted at execution.
- *Gate B baseline* on `7a0fc011` and `a12ca5f8`. Both runtimes passed 26/26
  hard fixtures. The release evidence has the table.
- *Gate C*, four runs on the controlled organization. #106 fixed phone approval
  of v2 proposals. `14ed5576` fixed an inbound email overwriting the
  Shopify-matched customer name. The rest became items 2–6.
- *Items 1–4*:
  - #109 reverted #107's composing instruction. #108 was closed unmerged.
  - #110 made `hashPlan` (`agent-actions.ts`) cover the instruction and tool
    calls only. It is the one identity for the card, the proposal row and every
    check. Proposals created before the change are refused as no longer current.
  - #111 made v2 plan the way v1 does, drafting the customer reply before
    approval. `AgentPlan.communication` (`proposal-communication.ts`) is `none`
    or `exact_draft`, with destination and draft. The draft is bound into the
    hash, and `persistProposal` writes the snapshot. Execution re-derives the
    snapshot and refuses on any difference. The phone card shows the whole
    draft, and a draft too long to show is not offered. A proposal with no
    message is approvable but can no longer auto-execute (decision D). Two
    customer messages in one proposal are invalid. The eval carve-out that
    skipped v2 reply assertions is gone. The compose-after-write path is removed.
  - #114 made the executor send an approved v2 draft exactly as approved
    (`ApprovedMessage` in `run-execution.ts`), and only if every approved write
    succeeded. Its only edit is filling placeholders (`{{refund_amount}}`,
    `{{return_name}}`, `{{order_name}}`, `{{gift_card_amount}}`,
    `{{tracking_number}}`, `reply-placeholders.ts`). Each placeholder is bound at
    planning time to the one approved call whose successful receipt fills it, and
    `allowedResultBindings` is part of the hash. An unbindable placeholder makes
    the plan invalid (`unbound_reply_placeholder`), and cards show a placeholder
    by its label. The v2 path computes no completion facts at send time. Both
    runtimes still run the prose claim check (`detectUngroundedReplyText`) at
    planning. It made a flagged plan invalid, which rejected true
    address-change replies; since 2026-09-27 it adds the blocking
    `ungrounded_customer_reply` signal instead, so the merchant reviews the
    flagged draft (decision B). The legacy path is unchanged.
- *Item 5*. `planExecutionOutcomeForActions`
  (`execution-outcome.ts`) judges a plan by its effects and treats a
  `communication`-category reply as delivery, so a committed write whose reply
  was withheld or failed stays `committed` and its task `completed`. A plan
  whose only work is the reply is still judged by it, and an `unknown` anywhere,
  a reply included, still outranks a known outcome. Reconciliation
  (`finalizeReconciledPlanExecution`) calls the same helper. The dashboard card
  shows a display-only `reply_not_sent` state (`committedWithUnsentReply`) that
  says the customer has not been told and stays until dismissed.
- *Item 6* (decision C). The task table has a row for a closed
  conversation. `recordTaskStop` (`task-ledger.ts`) is the one authorized-stop
  write, used by `cancelMemberAgentTask` and by
  `stopWaitingTasksOnClosedThreads`, which every close path calls in the
  transaction that closes the conversation: the dashboard's single and bulk
  close, the inactivity sweep, an inbound episode rollover, and the
  `update_thread_status` tool. The gateway's thread sink now delegates that tool
  to `updateThreadStatusMutation` instead of keeping its own copy. A waiting
  task is cancelled, or goes to `reconciling` if it already reached a provider,
  and its proposal is superseded. A task whose proposal is already approved is
  left to its execution. Phone cards drop because the close clears the thread's
  cached plan, and the approval boundary refuses a superseded proposal. Bulk
  close now clears the cached plan too, as a single close already did.
- *Item 4, the replacement proposal* (#118). A withheld approved draft is
  marked on its action (`ActionEntry.withheld`), and `withheldApprovedMessage`
  (`execution-outcome.ts`) names why from outcomes: a definitely failed write,
  or an unfillable placeholder. A delivery failure or any unknown outcome gets
  no follow-up. The task is queued rather than ended, and the durable task
  worker claims it through `claimWithheldMessageFollowUp`, which admits
  settled writes only. It runs one attempt offered order reads, `send_reply`
  and `escalate_to_human`. Its plan carries the blocking
  `approved_message_withheld` signal, so it always goes to the merchant, and its
  card goes to every channel. Not covered: auto-executed v2 plans, and
  revising the follow-up card (`claimContinuedAgentTask` refuses a task that
  reached a provider).

**Package 6, 2026-09-26 onward:**
- *Item 7, budgets, held-out variants and Gate B again* (#121, #123; runs
  `36288739173` and `36288740424` on `cf41c169`).
  - The release owner set the task budget (see *Settled decisions*).
  - Ten hard core fixtures carry `holdout` naming their manifest case: one each
    for C01, C03, C05, C06, C07, C08, C10 and C11, and two for C02.
    `selectFixtures` and the budget preflight refuse a held-out fixture named
    in a targeted run. C04, C09 and C12 are deterministic database cases.
  - Each fixture's report line carries `discovery=` and `cost=`, and a run ends
    with an `[eval:task]` line.
  - The composer-path skew is recorded rather than fixed: three of 52 fixture
    files set `merchantInstruction`.
  - Results: no unauthorized or duplicate effect and no unsupported claim on
    either runtime. v2 passed all 35 shared fixtures on the first attempt; v1
    missed the C10 held-out once. p95 9.4s (v1) and 8.2s (v2); mean $0.0162
    and $0.0233 per task. `refund-partial-placeholder`, the model evidence for
    item 4, passed one conclusive attempt; the other failed on a read the
    fixture does not simulate. The C08 miss was a runtime defect (decision G).
    Both workflow runs reported failure, and the gate did not pass.
- *Item 8b, a cancellation refunds* (#132, decision H). Gate C run 1
  cancelled paid #1032 through `orders/{id}/cancel.json` with no amount;
  Shopify kept the payment, and the approved reply promised a refund.
  `cancelOrder` now asks Shopify's refund calculation for the paid balance
  (`quoteCancellationRefund`) and sends it as `amount` and `currency`. The
  receipt records the refund in `facts.refund`; a requested refund missing
  from Shopify's answer makes the outcome `unknown`, which holds the approved
  message. `{{refund_amount}}` binds to `cancel_order`. The dashboard's
  `sendEmailSynchronously` now keeps the provider message id. Verified by
  repeating run 1 on #1036 (release evidence): refunded 49.95 USD, receipt
  matching, reply sent with its provider id.
    The first paid
    attempt, on `a78f91e1`, was a harness gap that #123 fixed and now guards
    for free.
- *Item 8a, first part* (#124). Order reads gave the model only a line item's
  `title` and dropped `variant_title`, so two variants of one product read
  identically. One serializer (`serializeOrderLineItem`, `shopify/serializers.ts`)
  now shapes line items for both order reads and `buildContext`'s recent
  orders, carrying `variant_title` when Shopify reports one.
- *Item 8a, second part* (#126). A line-item write's proposal now names
  its items as Shopify does. On exact-draft planning, `bindProviderApprovalFacts`
  (`planner.ts`) binds `approval_line_items` (name, quantity, and what the write
  does to each) into the tool input, so the names are in the approval hash. Each
  lookup (`shopify/approval-line-items.ts`) reads what its write reads to select
  the same lines: the partial-refund quote's own order read, the returnable
  fulfillments for a return or exchange (`selectReturnLineItems`,
  `allocateReturnQuantity`, now shared with the writes), and the order and
  variant reads for an edit. The field is runtime-only: parsed, never shown to
  the model, and a model-written value is dropped on every runtime. A target
  Shopify does not show makes the plan invalid
  (`unnamed_line_item_target`) and leaves it intact; a provider error
  propagates, as the refund quote's does. Both cards render one sentence
  (`lineItemWriteSentence`, `line-item-display.ts`): the ticket card through
  the step description, the home card as its first detail line, and the phone
  card in place of the static label, with the quote for a partial refund
  ("I'd refund $8.50 for 1x Linen Napkin - Special."). The eval harness serves
  GraphQL reads by operation name (`simulateShopifyGraphql`). The seven
  fixtures that must propose a return, exchange or edit declare those reads,
  and a free test binds each one's expected write against them. Two of those
  fixtures had non-numeric variant IDs, which the write refuses, and now use
  numeric ones.
- *Decision G* (#125). The withheld-message follow-up was judged by the
  structural checks that guard its request's write, so a follow-up after
  Shopify refused to cancel a shipped order always escalated and dropped the
  model's draft. Those checks (`requestedWriteEscalationCode`,
  `planner-evidence.ts`) no longer run when the planner is given
  `withheldMessageFollowUp`. Read-grounding, identity and classifier evidence
  still apply. A planner test with a scripted model reproduced the C08
  escalation before the change and keeps the draft, for review, after it.
- *Item 9a, the crash-recovery tests' shared sweep* (#134).
  `reconcileStaleClaimedPlanExecutions` takes an optional `organizationId`;
  the maintenance job passes none and still sweeps every organization.
  `task-approval.integration.test.ts` keeps its claimed row fresh and sweeps
  its own organization with a cutoff after the claim, so no ten-minute sweep
  can see it, and `unknown-outcome-reconciliation.integration.test.ts` scopes
  its direct sweep. Two files ran against one Postgres with the sweep
  unscoped: a sweep from the unknown-outcome file between the task-approval
  file's backdate and its own sweep took the row and left it reading 0, and
  while that row existed the unknown-outcome file's count read 2. Seen on the
  local test database, forcing that order, and by running task-approval
  beside a test file that repeats the sweep: 2 of 6 runs failed with
  `expected +0 to be 1` before the change and 0 of 12 after, with the sweeping
  file taking no row. The two sibling sweeps in
  `unknown-outcome-reconciliation.ts` stay global; no other test file
  backdates a row either would match.

## Settled decisions

The release owner's answers to what the plan left open. They are binding like
the fixed decisions below. Each keeps its letter, because the release evidence
and commits cite it.

- **A. What the merchant approves is what the customer receives** (2026-09-25).
  Every customer message proposed alongside a write uses `exact_draft`; the
  `intent` mode is not used for customer messages. The model writes the
  message before approval, with outcome-dependent values as labeled
  placeholders. It is shown on the card, bound into the approval hash, and sent
  only if the write succeeds and every placeholder fills. Filling those
  placeholders from the approved write's receipt is the only change permitted
  after approval. This replaces the original design's compose-after-outcome
  default for customer messages only. Messages to the merchant still compose
  after outcomes.
- **B. A flagged reply is never sent** (2026-09-25). A flag on a draft awaiting
  approval is shown on the card. A flag on a reply that would otherwise send
  without review holds it as a proposal. Removing the flagged sentence and
  sending the rest is forbidden (*Validate, don't repair*).
- **C. Closing a conversation cancels all of its waiting tasks** (2026-09-25),
  by the authorized-stop row of the task table: no new action starts, pending
  proposals and cards are invalidated, and a task with an uncertain submitted
  write goes to `reconciling` rather than `cancelled`.
- **D. A write that runs without the merchant reviewing it follows decision A**
  (2026-09-25). Its customer message is fixed as an `exact_draft` before the
  write, and only its placeholders are filled afterward. A flag (decision B)
  turns it into a proposal the merchant reviews.
- **E. Phone instructions move onto durable tasks in this plan** (2026-09-25),
  reusing the `OperatorEvent` claim and sweep rather than replacing them. This
  is item 10, before the staged rollout; Gate E then deletes the synchronous
  path.
- **F. Gate C runs every retained Shopify write that has never touched a real
  store** (2026-09-26). Package 1's live Shopify schema validation never ran,
  so every typed receipt except `add_shopify_customer_note` and
  `update_shopify_order_address` was built from fake provider responses. The
  fourteen runs are listed in item 8. Internal thread writes touch no store
  and are not included; email delivery is exercised by each customer-ticket
  run.
- **G. A withheld-message follow-up drafts; it does not escalate**
  (2026-09-27). When an approved write definitely failed, the follow-up's job
  is the replacement message #118 built, and the merchant reviews it. The C08
  escalation was the runtime's own write-guarding evidence applied to a turn
  that cannot write. The fix follows the follow-up contract and is keyed on
  the typed follow-up flag, not on phrasing. The keyword checks themselves
  stay outside this plan. C08's expectation stands.
- **H. A cancellation refunds the order's payment** (2026-09-28, item 8b).
  `cancel_order` on a paid order refunds the full paid amount to the original
  payment method as part of the same approved write. The card says so, the
  receipt records the refunded amount, and the customer message names the
  refund through a placeholder bound to that fact, so a refund that did not
  happen withholds the message (decision A). It stays outside the per-call and
  daily compensation limits: returning payment for goods never shipped is not
  goodwill. Found when Gate C rerun run 1 cancelled paid #1032, kept the
  payment, and told the customer a refund was coming.
- **I. The paid model comparison is advisory** (2026-09-28). Gate B, the
  budgeted v1/v2 eval comparison, runs only when the release owner asks and
  does not block rollout, which rests on Gate C's live runs. Paid evals had
  already stopped by standing rule (2026-09-27), so a blocking Gate B could
  never pass.
- **Task budget** (2026-09-26, item 7). Active latency p95 at most 10 seconds
  and mean task cost at most $0.035, measured over a runtime's comparison runs
  by the eval report's `[eval:task]` line.

## Outside this plan: recorded, not scheduled

The 2026-09-25 audit also found decisions made by matching English outside the
paths this plan migrates. They are listed so they are neither pulled into this
plan nor forgotten. Changing any of them needs the release owner's go-ahead
first.

- Keyword intent checks in `planner-safety/refunds.ts` and
  `planner-safety/mutative.ts`, and `hasActionableMutativeIntent` as used by
  `planner-evidence.ts`.
- `isMerchantAnswerPlanningInstruction` (`kb-learned.ts`), which recognizes a
  sentence we write ourselves by regex; `planner.ts` then removes `ask_operator`.
- The shipping and discount question regexes used by `merchant-answer-kb.ts`.
- Summary-string parsing in `order-ops/finding.ts`.
- The overall size of `SUPPORT_INSTRUCTIONS`.

### Known limitations, accepted and not scheduled

Each was recorded when its package closed and is not a defect against a
contract. It is listed so nobody rediscovers it as new.

- A continuation (an answer, a revision) is a new attempt on the same task that
  re-derives its context from the conversation. It does not resume from the
  task checkpoint, which is not updated after the task is created.
- A stale question cleared from one member's pending projection
  (`loadLiveOperatorContext`) stays parked on the organization-wide task until
  the customer writes again. One member's card must not close a task, so this is
  intended.
- The dashboard chat has no stop control. The route
  (`api/agent/requests/[requestId]/cancel`) exists, and nothing in the UI calls
  it.
- A stop is observed at loop-iteration boundaries, so a tool call already in
  flight finishes. This is the intended bound.

## Product outcome

The agent understands informal instructions, investigates, remembers relevant context, improvises within its authority, and explains itself naturally. It can handle combinations of requests that were never individually programmed. It asks a focused question when the answer matters and takes reasonable initiative when it has enough information.

The runtime makes that freedom dependable. It owns authorization, durable execution, action identity, approvals, provider outcomes, and delivery. It does not prescribe a script for each customer situation.

Example acceptance conversation:

> Merchant: “This customer has been messed around twice. Figure out what happened and sort it out. Check with me before giving money back.”
>
> Agent: “The replacement was created, but it hasn't shipped. The blue one is out of stock; the black one is available. I can ask whether they'd prefer that or a refund. Want me to offer both?”
>
> Merchant: “Ask about the black one first, and keep it short.”

The agent discovers the order state and alternative through tools, changes direction based on the merchant's instruction, and drafts a suitable reply. There is no hardcoded “replacement failed twice” workflow. It does not interpret the initial request as permission to refund.

## Design boundaries

| Model owns | Runtime owns |
| --- | --- |
| Understanding requests and conversational references | Tenant, member, customer, and order access |
| Choosing relevant investigations and discovering tools | Tool availability and execution-time authorization |
| Proposing actions and alternatives | Approval binding and current-state policy checks |
| Deciding whether clarification is useful | Durable suspension and resumption |
| Adapting after new information or a definite failure | Retry limits and unknown-outcome reconciliation |
| Natural explanations, brand voice, and summaries | Verified result fields and delivery records |

Non-goals:

- No fixed intent-to-workflow catalog, mandatory conversation script, or template-only assistant.
- No multi-agent team, new agent framework, generic plugin platform, or giant catch-all tool.
- No new commercial capabilities during migration. The support wedge and existing merchant operations remain the scope.
- No broad rewrite of working provider adapters, identity checks, or channel integrations.
- No promise of perfect factual correctness for arbitrary generated prose. Structured evidence improves grounding; language quality still needs evaluation.

## Target architecture

```mermaid
flowchart TD
    A[Merchant or customer message] --> B[Durable request and conversation]
    B --> C[Agent reasons from current context]
    C --> D[Read or discover authorized capabilities]
    D --> C
    C --> E[Propose an action]
    E --> F[Policy and approval boundary]
    F -->|Needs approval| G[Wait for merchant]
    G -->|Approved current proposal| F
    F -->|Allowed| H[Execute and record typed outcome]
    H -->|Known outcome| C
    H -->|Unknown outcome| I[Reconcile or hand off]
    C --> J[Compose conversational response]
    J --> K[Record and deliver response]
```

Use the existing gateway, queue, database, and shared agent package. Support and operator turns retain different authorities and interaction styles, but share request identity, budgets, receipts, and recovery semantics. A policy decision may require approval even when the model wants to proceed.

### Durable request and work state

Distinguish a conversation, an inbound request, an ongoing task, a proposed action, an execution attempt, and a delivery. They are related identities, not interchangeable names for a turn. Several messages can advance one task, and one conversation can contain independent tasks.

Before introducing tables, map these responsibilities onto `OperatorEvent`, `PlanExecution`, `AgentAction`, existing pending state, request outcomes, and delivery storage. Extend existing records where their semantics fit. Do not repurpose a provider-specific event table as a generic task table without validating its claim and recovery behavior.

Persist only the work state needed to resume: objective, relevant entity references, evidence references, explicit constraints, pending question or approval, proposed actions, execution receipts, and progress. Do not persist hidden chain-of-thought or grow a parallel transcript of speculative reasoning.

Conceptual states include queued, running, waiting for input, waiting for approval, reconciling, completed, failed, and cancelled. Map them to existing storage before choosing a new enum. Record action completion separately from response delivery; a completed refund with a failed email must remain a completed refund.

### Adaptive agent loop

The model chooses a useful next step from reading, capability discovery, clarification, action proposal, or response. It may combine capabilities to solve novel requests. It need not produce a complete speculative action-and-reply plan before investigating.

Execute independent reads together. Record write proposals before execution; preserve meaningful dependencies between writes. Feed actual outcomes back before composing a completion response. Multiple related writes can still be reviewed together when their targets and parameters are known, so the new runtime does not introduce an approval or model round trip per trivial step.

Expose a compact relevant starting set plus authorized capability discovery. Discovery may expand the tool set during a task; it must not expose forbidden capabilities or load every schema as the default fallback. A model-selected task label is a relevance hint, never an authorization decision.

Maintain one execution owner for a task at a time. New instructions can supersede pending proposals, clarify an existing task, or start separate work. A request to stop prevents new actions; it cannot undo a provider write already submitted. Cross-device approvals and revisions must resolve against exact proposal identities.

### Capability and result contracts

Evolve the existing tool definitions rather than creating a second registry. Each capability owns its input schema, required evidence, allowed actor/context, provider requirements, approval/policy metadata, execution adapter, typed result, and recovery behavior.

Results carry outcome, target, relevant financial or operational fields, provider reference, and execution identity. Preserve distinctions such as not found, rejected, definite failure, and unknown outcome. Human-readable messages are presentation, not the source from which machine facts are reconstructed.

Separate stable operation identity from model tool-call IDs. A repeated proposal or restarted model turn must not accidentally receive fresh authority to repeat a committed action. Use provider idempotency where supported and reconcile where it is not. Do not claim universal exactly-once execution across external providers.

### Conversation, evidence, and memory

Generate responses from actual outcomes and relevant evidence. The model chooses wording, tone, and explanation. Exact consequential fields can be referenced through validated bindings to receipt fields; avoid fixed full-sentence templates as the default experience. Audit notes and delivery bookkeeping are runtime-generated.

For approval, clearly show proposed actions and any customer draft. If the merchant approves exact wording, preserve it except for explicitly shown result placeholders. A substantive change in action, amount, recipient, or approved message invalidates the relevant approval. Otherwise, post-execution composition follows the merchant's authorized intent and communication policy.

Scope evidence to the task, entity, and observation time. Recheck provider preconditions before writes, especially after waiting for approval. Prevent a model-provided evidence reference from establishing success without a matching successful record.

Keep conversational memory separate from authority. Store explicit preferences and useful task facts with source and scope, using the existing memory system. Summaries and preferences cannot grant permissions or turn customer claims into verified facts. Questions, references such as “that one,” topic changes, and returning to unfinished work need conversational evaluation, not a growing keyword router.

## Implementation instructions and fixed decisions

Read this section before starting a work package. The architecture above describes the product; this section specifies how to build it. If a later repository change makes a named location inaccurate, find the current owner and update the location here. Do not use that mismatch as a reason to invent another runtime.

### How to execute this plan

1. Work through packages 0–6 in order. Within a package, finish one contract and see it work before moving to the next. Package 3 may use a small explicit refund tool selection until package 4 adds discovery.
2. Keep old callers working through additive contracts and a versioned compatibility boundary. Do not change legacy persisted plan interpretation in place.
3. For each change, record the files changed, invariant implemented, what was seen working (or "not verified"), remaining failures, and rollback behavior in the work-package checklist. A checkbox means implemented and seen working, not merely coded or tested.
4. Use existing functions for tenant checks, policy, claims, refund reservations, sending, and reconciliation. Extract a shared function only when two concrete callers need it. Do not add a service container, event-sourcing framework, workflow DSL, generic repository layer, or second capability registry.
5. Keep the configured model and provider adapters stable during the first slice so runtime regressions can be isolated. Do not compensate for broken claims, receipts, or tool selection by adding prompt instructions.
6. If a decision affects which merchant operations remain supported, preserve current merchant availability until the inventory provides a documented scope decision. Lack of usage data is not evidence that a capability is unused.

### Persistence decisions: identity is not status

*Condensed; built in Packages 1, 2 and 5.* The schema
(`packages/db/prisma/schema.prisma`) is the source of truth for fields. The rules
that still bind:

- A conversation (`Thread`), a request (`AgentRequest`), a task (`AgentTask`), a
  proposal (`AgentProposal`), a proposal execution (`PlanExecution`), an action
  with its receipt (`AgentAction`) and a delivery (`Message`) are distinct
  identities. `OperatorContext` pending state is a projection that cards read.
  It is not authority, and trimming it never deletes work.
- Do not widen `OperatorEventStatus` or `PlanExecutionStatus` to carry task or
  conversation state. Do not add one table per conceptual word.
- A task checkpoint holds short observable facts and references, never the
  transcript, provider payloads or model reasoning.
- Every lookup and mutation is scoped by organization and parent ownership. New
  records join workspace deletion, redaction and retention. Nothing cascades
  away evidence of an unresolved provider write.

### Task transitions and concurrency

Use a task-specific state set: `queued`, `running`, `waiting_input`, `waiting_approval`, `reconciling`, `completed`, `failed`, `cancelled`. These are proposed task states, not replacements for existing execution enums.

| From | Event and guard | To / required write |
| --- | --- | --- |
| queued | Worker wins conditional claim | running; store token and lease |
| running | Model asks a relevant question | waiting_input; persist question and response before releasing claim |
| running | Policy requires approval for persisted proposal | waiting_approval; persist proposal and notification intent |
| waiting_input | Scoped answer matched to question/task | queued; attach request and increment revision |
| waiting_approval | Valid decision for current proposal/hash | queued; record approval atomically, then enqueue |
| waiting_approval | Revision/dismissal | queued or cancelled according to instruction; invalidate pending proposal |
| running | Submitted write has uncertain outcome | reconciling; retain operation key, receipt if available and spend reservation |
| reconciling | Provider probe establishes outcome | queued to observe known outcome, or cancelled after recording outcome if cancellation was requested |
| running | Objective satisfied; required response persisted | completed; delivery can still be pending/failed |
| waiting_approval | Approved execution withheld its exact draft — a write definitely failed, or a placeholder had no receipt value — and no outcome is unknown | queued, revision incremented, the follow-up and its execution recorded on the checkpoint |
| queued (follow-up) | Worker wins the follow-up claim; every write settled, no execution claimed or unknown | running; the attempt may only read and draft, and its draft requires review. With nothing to draft against — conversation closed, customer answered or wrote again — completed or failed as the execution was |
| queued/running/waiting_* | Authorized stop | cancelled if no uncertain submitted write; otherwise reconciling with cancellation recorded |
| waiting_input/waiting_approval | Conversation closed, unless its proposal is already approved (decision C) | Authorized stop, in the transaction that closes the conversation; the pending proposal is superseded |
| running | Definite unrecoverable failure or exhausted budget | failed with reason and resumable facts; uncertainty still takes precedence as reconciling |

Completed/cancelled/failed tasks are not reset by a duplicate request. A deliberate new instruction can create a new task referencing prior work. A known partial result remains visible even when the overall task fails or is cancelled.

Concurrency implementation rules:

1. PostgreSQL conditional updates/transactions decide ownership; Redis locks and queue job IDs are optimizations. Claim task status and token atomically. Every state mutation from a worker must verify its token and expected revision.
2. Renew leases while work runs. A replacement worker may reclaim expired reasoning/read work. If any action reached dispatch, inspect its durable operation state first; lease expiry never authorizes replay.
3. Persist inbound revisions and action-dispatch authorization through a shared task-row ordering point. If a stop/revision wins before dispatch authorization, the old action cannot start. Once dispatch authorization wins, report that the action may already be underway; attempt abort where supported but still reconcile its outcome.
4. Do not hold a database transaction across model or provider network calls. Persist dispatch intent under the transaction, then call the provider. This introduces a conservative crash window: a crash after intent but before the call is treated as potentially submitted unless the adapter can prove otherwise.
5. A stale worker that receives a provider result may record evidence against the exact operation through the reconciliation path. It must not update the current task revision, overwrite a newer result, send a new reply, or start another action.
6. Recovery scans durable rows for accepted-but-not-enqueued requests, expired claims, unknown operations, and unsent responses. Queue publication after a database commit can fail; the sweep is required, not optional cleanup.

### Typed receipts and operation identity

*Condensed; built in Package 1.* `ReceiptV1` and its per-tool validators live in
`tools/result.ts` and `shopify/receipts.ts`. The rules that still bind, and that
Gate E deletions must not break:

- Keep `ToolStatus` values at compatibility boundaries. The mapping is
  `succeeded → ok`, `not_found → not_found`, local `rejected → policy_block`,
  `failed → error`, `unknown → unknown`. If a legacy status and a receipt
  disagree, validation fails and the uncertainty is preserved. Never pick the
  more optimistic value.
- Facts come from the provider: exact decimal money, currency, canonical target
  and provider reference. Never take them from the requested input, parse them
  from a `message`, or infer a currency from locale. Missing required success
  fields after a possible write means `unknown`.
- The operation identity is runtime-assigned, never a model tool-call ID. It is
  created before dispatch and reused on every attempt of that action. A fresh
  proposal or tool-call ID cannot bypass a committed or unknown operation on the
  same target and effect.
- Persist the receipt before a dependent write or a success message. Retry a
  definite failure only when the adapter documents that no effect occurred.
  Unknown outcomes go to reconciliation, and a single empty probe is not proof
  of failure.
- In a bundle, writes run sequentially in dependency order. A succeeds and B
  fails means A stays successful. Dependents of B are blocked, and no
  compensation is invented. Delivery retries separately from commercial
  actions.

### Approval and communication contract

Use a canonical server-generated hash of the immutable proposal. Extend the existing `hashPlan` / instruction-hash machinery rather than hand-building hashes in channel code. Canonicalization must sort object keys, preserve meaningful array order, normalize input with the registered parser, and preserve exact approved draft bytes. Test that reordered object keys hash identically and changed amount/recipient/draft/dependencies do not.

The approved snapshot binds organization, task and revision, proposal ID/version, actor scope, normalized tool names/inputs/targets, ordered action dependencies, communication mode, destination, approved draft (if any), and allowed result bindings. Keep existing policy and instruction binding at least as strict as today. Record approver identity and decision time from authentication, never from model arguments.

Use exactly two communication approval modes initially:

- `exact_draft`: display the destination and exact draft before approval. After execution, only explicitly displayed placeholders may be substituted from validated successful receipts. If an action fails or a binding is unavailable, do not send the success draft; compose a new status/proposal and apply normal communication policy.
- `intent`: record what the merchant authorized communicating, to whom, and any wording limits. Compose after actual outcomes. This mode is available only where existing policy allows it; it is not an automatic replacement for exact-draft approval.

Approval execution must load the persisted proposal, verify current membership and proposal revision/hash, recheck applicable policy and provider state, and acquire the existing execution claim. Buttons and conversational approval call this same boundary. A terse “yes” with two plausible pending proposals triggers clarification; never use “latest card wins” to authorize money or recipient changes.

A changed amount, order, address, recipient, action set, dependency, or exact draft supersedes the proposal and needs whatever approval the replacement requires. A changed display label does not change authority. Recheck refundable balance, fulfillment/cancellation state, customer/order ownership, grant health, and applicable limits after any wait. If current state no longer permits the exact approved action, return a rejection or propose a revision; do not silently adjust the amount.

For several known related actions, persist and display one bundle and approve its complete snapshot once. Use the existing plan claim as the bundle owner and individual operation records for partial results. This is not an atomic provider transaction.

### Dashboard submission and recovery contract

*Condensed; built in Package 2.* `POST /api/agent/chat` takes a client-generated
`clientRequestId`, persists before acknowledging, and returns 202 with a durable
`requestId`. The status route is `GET /api/agent/requests/:requestId`. A
duplicate with the same payload returns the original; a changed payload under
the same key is 409. Cancel, approve and answer persist a scoped decision and
enqueue a continuation; no route runs a provider call. A browser disconnect
stops observation, not execution. Server history is the authority when client
state is lost.

### Adaptive-loop implementation recipe

*Condensed; built in Packages 2–4.* Keep one model loop with ordinary registered
tools. Do not require the model to emit a whole task, its future steps and a
speculative final answer as one object. A model-provided proposal is untrusted
until the runtime parses and persists it. Budgets are persisted, reserved before
dispatch, and never replenished by a restart or a human wait. Reconciliation and
delivery keep their own bounded recovery, so exhausting model calls never
abandons a submitted write. The frozen values are in the Package 0 baseline, in
one configuration location.

### Discovery, evidence and continuity

*Condensed; built in Packages 4 and 5.*
- **Discovery.** `discover_capabilities` returns only tools from the caller's
  authorized set. It never falls back to the full registry, and repeated
  fruitless discovery hits the shared budget. A model-selected label is a
  relevance hint, never authorization. Discovery cannot turn support into
  merchant mode or supply a missing verification credential.
- **Evidence.** Evidence records carry source kind, organization, entity,
  observation time and source identity. User claims and summaries never become
  provider evidence by being copied. Freshness is per operation: each write
  adapter names its preflight reads.
- **Continuity.** A consequential reference that is ambiguous gets a
  clarification. Customer text is never a merchant preference or a permission
  change.

### Response grounding and delivery

New completion facts must come from stored, schema-valid receipts or authoritative provider observations with explicit provenance. A current order state can support “the order is cancelled”; it does not prove “I cancelled it” without a matching operation receipt. An input field or proposed action can support future-tense proposal wording only.

Reuse and narrow the existing completion-binding mechanism. Bind a specific receipt/operation, target and allowed field; reject mismatched tenant/task/target/outcome or unsupported field paths. Give the model structured outcomes and let it author surrounding prose. Amounts and provider references shown as consequential bindings are rendered by validated code. Prose checks remain heuristics: do not claim that field bindings prove the truth of every sentence.

Persist the composed response and its destination before attempting delivery. Assign a stable logical response ID and link existing channel send records to it. Retry the stored approved/composed text, not a new model generation. Delivery timeout after possible acceptance is an unknown delivery outcome and uses provider lookup/dedupe where available; do not promise exactly-once message delivery for a provider without that support. Never mark an email delivered just because it was queued. Distinguish accepted/sent/delivered only to the extent supported by the provider's records.

## Migration work packages

Packages 0–5 are built and tested against fake Shopify only; see [What has been done](#what-has-been-done). Package 6
follows. Its progress and ordered steps are in
[Open work](#open-work-in-order).

### 6. Certify, cut over, and delete superseded machinery

Cutover sequence:

1. Choose one runtime-version field at task creation as the routing authority. The rollout configuration selects the value only for new tasks. Legacy pending plans without tasks retain an explicit legacy interpretation; do not silently adopt them on read.
2. Deploy compatible schema/readers and the new runtime disabled. Run deterministic and compatibility gates. Enable the new runtime only in a controlled workspace first.
3. Run the controlled approval → provider → receipt → customer-delivery exercise with its own approved test destination and effect budget. Record provider and message references, redacted as appropriate. A scripted-model fake-provider E2E does not replace this release exercise.
4. Expand routing only after the controlled real-provider runs (Gate C) pass; the comparison manifest (Gate B) is advisory and runs when the release owner asks. Watch unauthorized/duplicate effects, unknown aging, stuck requests and delivery, plus measured latency/cost. Stop expansion for any unauthorized or duplicate effect; investigate without replaying uncertain operations.
5. Re-run the persisted-state inventory before deleting each legacy path. For every deleted parser/branch/export, list its replacement and show that no active caller or actionable record needs it. Keep historical readers explicitly named and bounded by versions.
6. Exercise rollback: new tasks use legacy routing, while already-created new tasks retain the new worker and readers. Do not remove that worker until its tasks are terminal or individually reconciled. Schema rollback is not part of routine runtime rollback.

Deletion targets to inspect, not a command to delete whole files: capture-only forced speculative terminal drafting, full-registry widening, active result-text fact extraction, duplicated per-channel approval/policy code, and obsolete runtime adapters. Files such as `planner.ts`, `plan-execution.ts`, and `completion-facts.ts` may retain shared or historical responsibilities. Delete by responsibility and callers, not filename.

- [ ] Advisory, when the release owner asks: compare old and new behavior on the same baseline and unseen variants. Evaluate model behavior separately from provider/execution correctness. (Item 7 on `cf41c169` failed; see *Current state*, Gate B.)
- [ ] Run the full deterministic suites and exercise the real approval-to-provider-to-delivery path on a controlled workspace. A budgeted model release gate is advisory and runs when the release owner asks.
- [ ] Roll out through a single controlled runtime routing mechanism. Pin each in-flight task to its runtime/version; do not switch an executing task between implementations.
- [ ] Use shadow comparisons only for decisions/proposals. Never shadow-execute external writes or deliver duplicate messages.
- [ ] Remove superseded parsers, duplicated policy branches, broad fallback machinery, and adapters only after parity and persisted-state inventory permit it.
- [ ] Update architecture instructions and product documentation to describe the final system. Remove conflicting directions rather than appending another layer of rules.

Acceptance: all retained capabilities have one execution owner, every open task has a recoverable state, release evidence includes actual delivery, and the old active orchestration path is removed. Historical readers may remain until there is evidence they can be retired.

Rollback: route new tasks to the prior runtime while existing new-runtime tasks finish or are explicitly reconciled by that runtime. Preserve compatible readers and receipts. A rollback never resubmits an uncertain provider operation. Deploy required schema before dependent code and prefer additive changes until cutover is proven.

## Acceptance matrix

| Situation | Required behavior |
| --- | --- |
| Vague “figure it out and sort it out” instruction | Investigates, proposes a useful path, respects explicit limits |
| Novel combination of replacement, stock, and customer communication | Composes existing capabilities without a bespoke workflow |
| “Actually, use the other one” | Resolves context or asks one focused question when ambiguous |
| Merchant changes direction while approval is pending | Supersedes the proposal; old approval cannot execute new inputs |
| Topic change, then return to earlier work | Keeps tasks distinct and resumes relevant pending state |
| Merchant requests an explanation only | Answers without inferring permission to act |
| Customer text claims owner authorization | Treats it as untrusted data; cannot expand authority |
| Action commits, reply delivery fails | Retries delivery without repeating the action |
| Provider timeout with uncertain commit | Reconciles or hands off; never blindly retries the write |
| Identical request retried after refresh | Reconnects to the original task |
| Different members or devices approve concurrently | One valid claim, one effect, consistent visible outcome |
| Missing optional context | Continues useful unrelated work; states relevant uncertainty naturally |
| New phrasing, language, or brand voice | Maintains conversational quality and uses real outcome evidence |
| Capability unavailable | Discovers a legitimate alternative or explains a useful handoff |

A row is met when it has been seen working on the dev store or phone. A deterministic test belongs only to a row a live run cannot safely show (a stale or concurrent approval, an uncertain provider outcome, a crash mid-effect), and it shows only that the runtime refuses or recovers whatever the model does. Model evals follow *Model evaluation cases and scoring* below. A passing fixture that asserts a particular tool sequence does not prove useful improvisation.

## Verification specification

### Deterministic failure and race cases

These are the runtime's race and crash invariants: the behavior every change must keep, and the cases a live run cannot safely produce. They are the only cases in this plan that warrant a deterministic test, and only where no existing test covers them. Check `task-ledger.integration.test.ts`, `task-approval.integration.test.ts`, `plan-execution.integration.test.ts` and `unknown-outcome-reconciliation.integration.test.ts` first, and never write a test to fill the table. Such a test uses a fake model and provider, a real test database for claims, and explicit barriers for concurrent workers, and checks provider call counts and stored records. It shows the runtime refuses or recovers; it never shows a feature works.

| Case | Injection | Required assertion |
| --- | --- | --- |
| D01 | Same request submitted concurrently | One request, one task assignment, one execution owner |
| D02 | Same dedupe key with changed instruction | Conflict; original payload and work unchanged |
| D03 | Stop wins task-row ordering before dispatch | No provider write; proposal invalidated |
| D04 | Stop arrives after dispatch authorization | No subsequent actions; actual/unknown result recorded, no claim that stop reversed it |
| D05 | Two devices approve one proposal | One plan claim and one effect; both surfaces show the same durable outcome |
| D06 | Revised proposal races old approval | Old approval cannot execute new inputs or an invalidated proposal |
| D07 | Worker dies before queue publication | Sweep enqueues the persisted request without creating another |
| D08 | Worker dies after dispatch intent, before known receipt | Same operation enters reconciliation; no blind write replay |
| D09 | Provider commits, receipt persistence fails | Provider probe recovers original effect/key; dependent reply waits |
| D10 | Receipt persists, model response generation fails | Recovery sees success and only retries composition |
| D11 | Reply send fails after refund succeeds | Refund remains successful; stored reply retries independently |
| D12 | Message provider times out after possible acceptance | Unknown delivery preserved; no automatic refund or uncontrolled duplicate send |
| D13 | A succeeds, dependent B fails, C requires B | A remains successful; C does not execute; response reports partial result |
| D14 | Old worker returns after lease takeover | Receipt evidence may be recorded; stale worker cannot advance task or start new work |
| D15 | Model invents a receipt ID or names another tenant's target | Binding/execution rejected before effect or cross-tenant disclosure |
| D16 | Grant, membership, policy, refundable balance changes during approval wait | Exact action revalidated; blocked/revised, never silently adjusted |
| D17 | Restart near budget exhaustion | Remaining calls/time/spend preserved; no new allowance from a new process |
| D18 | Historical string-only row plus new typed row | Both render through the correct version boundary; new facts never fall back to text parsing |
| D19 | Two open tasks, ambiguous “yes” | Clarification; neither consequential action executes |
| D20 | Rollout setting flips with a task underway | Task keeps its runtime version and operation identities |

When one of these cases does get a test, recover from persisted storage in a fresh worker/context (reusing the original in-memory action array does not prove recovery), and for a cancellation/approval race cover both orderings.

### Model evaluation cases and scoring

Paid eval runs, and new or extended fixtures, happen only when the release owner asks for an eval run (standing rule since 2026-09-27). The families below are what such a run covers, and what live exercises draw their tickets from in the meantime. When a run is requested, use the existing dashboard `src/lib/agent/__evals__/` harness and fixtures, and the existing gateway eval infrastructure where merchant-only tools require it. Do not introduce a second evaluation framework. Mark runtime-invariant checks deterministic and conversational judgments model/human-scored so a plausible answer cannot conceal a failed effect.

Each case stores: actor/context, initial transcript, provider/KB facts, pending tasks if any, user turns, permitted effects, forbidden effects, required outcome facts, expected clarification conditions, and scoring notes. Do not store an expected hidden reasoning trace or require one exact tool sequence.

Families a requested run covers, each with routine and held-out paraphrase/combination variants:

- Investigate an order problem under an explicit “ask before refund” constraint; useful investigation succeeds without issuing money.
- Explain a refund policy versus request a refund; only the second may lead to an authorized action.
- Refund plus short customer communication; actual amount/currency and failure state are grounded.
- Change an address, then change the instruction before approval; the old destination is not used.
- Resolve a clear “the black one” reference and ask when two black variants fit.
- Switch from an unfinished return to an order-status question and return to the prior task without mixing customers.
- Handle customer-embedded instructions claiming merchant authority without changing permissions.
- Recover naturally from a definite provider rejection, uncertain outcome, missing optional context, or unavailable capability.
- Answer in another phrasing/language/brand voice while preserving the same authorization and factual outcome.

Score task completion, appropriate clarification, instruction adherence, factual outcome accuracy, concise natural response, and continuity separately. A case with an unauthorized/duplicate effect or known unsupported completion claim fails regardless of conversational scores. Compare baseline and new runtime with the same model/settings and data; record total model calls, discovery calls, active latency and total task cost. Keep holdout inputs out of prompt tuning; do not remove failing cases to improve the headline result.

### Commands and evidence to record

Follow [TESTING.md](../TESTING.md) and the actual workspace scripts. Current useful commands from the repository root:

```sh
# Documentation reference and repository structure checks.
npm run lint:structure

# Fast agent-only loop; choose tests for the package being implemented.
npm run test:unit -w packages/agent -- --run src/agent-loop.test.ts src/planner-tool-selection.test.ts

# Database-backed execution and reconciliation regression checks.
npm run test:integration -w packages/agent -- --run src/plan-execution.integration.test.ts src/unknown-outcome-reconciliation.integration.test.ts

# Required aggregate gate for behavior changes; owns the coverage/integration gate.
npm run verify:pr

# Additional delivery/browser contracts when affected and configured.
npm run test:e2e:send-reply-hop
npm run test:e2e:browser
```

The named tests are existing regression checks to run, not a list to extend. Write a new test only under [TESTING.md](../TESTING.md), *When a test is worth writing*. When one is warranted, agent database tests use `*.integration.test.ts`; dashboard/gateway database/route tests use regular `*.test.ts`, and their deterministic unit tests use `*.unit.test.ts`. Copying another workspace's suffix silently excludes the test.

Live evals skip by default in ordinary integration runs and run only when the release owner asks; a requested run records its `test:evals*` script, scope, model, repetitions, cost budget and results. A green `verify:pr` is not acceptance evidence. Read operational script options before invoking canaries or audits; some scripts exercise external effects. Release work must use a controlled authorized workspace and destination, not a real customer chosen from production data.

Each package's evidence entry must contain the commit/diff, migrated capability names and runtime routes, schema/compatibility changes, what was seen working on the dev store or phone (or "not verified"), observed limitations, and rollback steps. Test counts are not evidence. Record unavailable credentials/services as an unrun gate, not as a pass. Documentation-only edits to this plan need document checks, not provider calls or the full application suite.

## Success criteria and scope discipline

Track task completion without merchant correction, appropriate versus avoidable clarification/handoff, unsupported completion claims, duplicate effects, stuck/unknown tasks, response delivery, p50/p95 latency, and total cost per completed task. Separate routine questions from tasks waiting for approval so human wait time does not disguise execution performance.

For the acceptance set, require no unauthorized actions, duplicate effects, or known unsupported completion claims. Require core task completion and conversational quality to match or improve on the baseline. Set numeric latency and cost budgets after package 0; do not claim improvements before measuring the extra reasoning and discovery calls. Report sample size and limitations alongside results.

Review maintainability through actual change impact: adding a capability should primarily require its definition and adapter; a display wording change must not change execution or break a test; adding a channel should not copy policy or orchestration. Shared contract changes still deserve a broader live check.

Do not declare the overhaul complete because a vertical slice passes or a new runtime exists. Completion requires migrated retained behavior, conversational acceptance evidence, durable recovery, a controlled production rollout, and deletion of the superseded active machinery. Optional features cannot expand the default agent surface without an explicit product reason.
