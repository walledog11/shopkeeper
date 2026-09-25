# Typed reply claims — design for review

Status: proposal, 2026-09-25. Nothing here is built. Scope is the runtime-v2
receipt-composition path; runtime v1 is untouched and retires with Package 6.

**Superseded in part by the overhaul plan.** Section 1 below proposes a new
`reports` field on `send_reply`. The plan already specifies the mechanism: the
proposal's communication snapshot (`communicationMode`, destination, approved
draft, `allowedResultBindings`) under its *Approval and communication contract*.
Where this document and the plan differ, the plan wins. The failure analysis in
*The problem, as observed* still stands; the plan's *Next work*, items 3–5, is
the work. The open questions at the end are answered by the plan's
*Release-owner decisions* A and B.

## The problem, as observed

After an approved v2 write commits, `runAgent` (with `composeFromReceipt`) asks the
model to reply to the customer. The model writes free text, and before dispatch
the execution guard in `run-execution.ts` decides whether that text makes a
completion claim nothing backs:

1. `claimingSentences` / `claimSpans` find sentences that sound like a claim.
2. `SPECIFIC_CLAIM_ACTIONS` maps words in them to actions (`shipping` → fulfillment,
   `address` → address update, `notes?` → customer note, …).
3. `spanIsGrounded` requires a successful `CompletionFact` for every mapped action.
4. If any sentence fails, the reply is recorded as an `error` action and not sent.

Gate C showed both failure directions of guessing actions from words:

- **False rejection.** "Order #1032's shipping address has been updated to …" was
  backed by a real `address_update` receipt, but `shipping` also demanded a
  fulfillment, so the reply was rejected. The model retried, was rejected again,
  and escalated "no tool available" (run 3). Run 4 got through only on a phrasing
  the scanner does not recognise as a claim.
- **False acceptance.** "Order #1032 has shipped." and "I have refunded you." are
  not recognised as claims at all — both pass `unsupportedReplyCompletionClaims`
  with zero facts (checked against the current build, 2026-09-25). An unbacked
  refund claim, the exact failure principle 3 exists for, reaches the customer.

Then `planExecutionOutcomeForActions` counts the rejected draft as a failed action,
so a run whose write committed and whose reply was delivered is recorded
`partial`, and `execution-ledger.ts` records any non-`committed` outcome as
`approved_execution_failed`.

Every fix to this within the current design is another word in a regex. That is
the architecture law's "never branch on prose" being broken, not followed.

## What the guard is for

One thing: a customer must never be told something happened that did not. That
requirement stays. What changes is how it is checked.

## Proposal

### 1. The reply names what it reports

In the composing call only, `send_reply` gains a required field:

- `reports: string[]` — the tool-call ids (already in the model's transcript as
  the `tool_use` blocks it is answering) of the completed actions this reply
  tells the customer about. Empty when the reply reports no outcome.

The executor resolves each id through `ActionEntry.toolCallId` and requires the
entry to have a receipt with `outcome: "succeeded"` for the current customer's
target. That is a typed lookup, no text involved. An id that does not resolve,
did not succeed, or targets another customer rejects the reply.

The field exists only in the composing call's tool schema, so the shared
registry and every v1 support fixture's option set are unchanged.

### 2. Outcome wording comes from the receipt

For each reported action, a renderer keyed on `receipt.tool` produces the outcome
statement from receipt fields — e.g. `update_shopify_order_address` → "Order
#1032 will now ship to 350 5th Ave, New York, NY 10118." The model writes the
surrounding message (greeting, tone, anything else the customer asked); the
executor places the rendered statements in it. The customer-facing facts are
never model-authored. (Placement is an open question below.)

This is the existing intent of `renderReplyCompletionClaims`, without the regex
that decides which sentence to replace.

### 3. The prose detector stops deciding, and only flags

Free text can still assert something unreported ("…and I've refunded you").
No typed scheme catches that without reading the text, so the detector stays,
with a different role and failure mode:

- It runs only on the model-authored part, and only to find claims about
  actions **not** in `reports`.
- A hit does not reject and does not retry. The reply is parked for the
  merchant with the flagged sentence shown — one approval to send, or edit.
- Its false positives then cost the merchant a tap, not the customer a reply.
  Its false negatives are bounded because the facts the customer relies on
  are rendered from receipts, not written by the model.

Its word lists stop growing: a misread phrase becomes a flagged reply, not a
code change.

### 4. A rejected draft is not a failed effect

A reply rejected before dispatch never reached a provider. It is recorded as a
rejected draft, not an `error` action, and `planExecutionOutcomeForActions`
ignores it. The task outcome derives from the writes' receipts and the final
delivery state: write committed + reply delivered = completed; write committed
+ no reply delivered = completed with the merchant told the customer has not
been answered.

## What gets deleted on the v2 path

- `SPECIFIC_CLAIM_ACTIONS`-driven blocking (kept only as the flag in §3).
- `renderReplyCompletionClaims`' sentence-matching replacement.
- `executedCompletionFacts(..., { allowHistoricalResultInference: true })` — v2
  facts come from receipts only.
- The v2 half of `detectUngroundedReplyText`: a v2 proposal carries no reply, so
  there is nothing to ground at planning time.

v1 keeps all of it until Package 6 deletes the v1 runtime.

## Cost and risk

- `send_reply`'s schema is something the model reads, so this is eval-gated. It
  needs new v2 composition fixtures (none exist: Gate B dropped reply assertions
  for v2 action-only plans), plus a live round trip.
- The renderer needs one entry per write tool with a receipt (address, note,
  cancel, refund, return, exchange, customer update, …). A write without one
  cannot be reported, and says so at build time, not in production.
- Parking flagged replies adds a new merchant-facing wait. It reuses the
  existing approval card and ledger, not a new surface.

## Open questions for you

1. **Placement of rendered facts.** (a) The model's text carries a marker where
   the facts go; (b) facts are appended after the model's text; (c) the model
   receives the rendered sentences and must include them verbatim, checked by
   exact match. (c) reads most natural but is the easiest to get wrong; (b) is
   the most robust.
2. **Flagged replies.** Park for the merchant (proposed), or send without the
   flagged sentence? Sending a modified reply is repair, which the
   architecture law forbids, so parking is recommended.
3. **The approval card.** Should the card say a reply will follow ("and reply
   to Walle"), now that the reply is structured enough to promise?

## Related, not in this design

#106 left two hash definitions for one proposal (`persistProposal` omits steps,
the card's `planIdentity` includes them). It should collapse to one identity; it
is a separate small change.
