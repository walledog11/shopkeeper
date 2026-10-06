# Agent follow-ups

Last reviewed: 2026-10-05. Closure status and subsequent local implementations
are recorded here; this adds no new deployment or live-verification claim.

The runtime migration closed on 2026-10-04 within the accepted scope. These
follow-ups and normal-use observations are retained, not scheduled, and do not
reopen the migration. Standing decisions and contracts live in
[agent-runtime.md](agent-runtime.md#settled-decisions). Record actual run results
in the [release evidence](conversational-agent-overhaul-p6-release-evidence.md)
and update the status here. The
[archived plan](archive/conversational-agent-overhaul-plan.md) is historical.

## Known defects and follow-ups

**Exchange balance and capability explanations (8h), the top follow-up.** In
the #1039 conversation the agent told the merchant an exchange would leave no
balance owed, with no Shopify financial calculation behind it, and that
`create_exchange` ships the replacement once the return comes back, which the
adapter does not do (release evidence, *Conversation A first turn* and
*Conversation A explanation-only follow-up*). #152 rewrote the
`create_exchange` description, result and prompt lines those claims
paraphrased. #167 (`46745cf7`, deployed 2026-10-05) adds the read-only
`get_exchange_quote` tool, backed by Shopify's `returnCalculate` for the exact
returned item, replacement and quantity. It exposes discounted amounts, tax and
calculated fees separately in customer and shop currencies, with exact decimal
arithmetic.
Incomplete or mismatched provider data withholds the estimate. Guidance now
distinguishes that estimate from a settled balance and removes the claim that
catalog-price eligibility establishes what the customer owes. Execution still
records no financial consequence from opening the exchange alone. It has not
been observed in live conversation; that remains open follow-up work. Do not
rerun the withdrawn #1039 financial probes to check it.

An order-status question that names the customer rather than the order still
uses the full order read and can pad the reply; one-order questions use the lean
`get_order_status` read (#144).

Oct 4 follow-ups: raw escalation reason on an already-escalated ticket;
answering the agent's own operator-chat question reports no pending question;
product- and customer-search chips print an ID as a count; and changing an
order line's quantity is unsupported. Unknown summaries and refused-action
success labels are fixed in deployed #165. Reopen on a ticket whose customer
has another open conversation on that channel now refuses with that reason
instead of a silent HTTP 500.

Oct 5: the dashboard chat's client-side navigation matcher opened a page
instead of sending any instruction that paired add, change, update or edit with
a page keyword such as "profile", "shopify", "orders" or "notes", and dropped
the instruction silently (release evidence, *First live write after
retirement*). #168 removes it: every message reaches the agent, and only the
agent's `navigate_dashboard` call navigates.

**Merchant-answer routing — local implementation awaiting release.** Dashboard
and phone continuations now pass typed answer/revision metadata from their
claimed wait. The generated-English matcher is removed, and current routing
evidence is no longer overridden by the legacy KB-miss fallback. Local checks
passed with controlled model/provider responses and isolated Postgres. Deployment
and ordinary-use answer/revision observation remain outstanding; details are in
the [release evidence](conversational-agent-overhaul-p6-release-evidence.md#merchant-answer-continuation-metadata-local-implementation--2026-10-05).

**Support request routing — local implementation awaiting release.** Refund,
cancellation, address-change and compensation routing now uses aligned current
classifier fields and independently checks proposed targets. Runtime English
intent scans are removed; the eval grader retains its independent heuristic.
Classifier version 6 adds explicit compensation intent, with version-5 request
display compatibility preserved. Targeted local checks and old/new guard
comparison passed. Ownership fixture/assertion failures in the original dirty
checkout were reproduced with its old routing modules; that separate ownership
change is outside this release candidate. Release and ordinary-use observation
remain outstanding; details are in the
[release evidence](conversational-agent-overhaul-p6-release-evidence.md#structured-support-request-routing-local-implementation--2026-10-05).

The 2026-09-25 audit also found decisions made by matching English outside the
paths the migration covered. They are listed so they are neither pulled into the
closed migration nor forgotten. Changing any of them needs the release owner's
go-ahead first.

- The shipping and discount question regexes used by `merchant-answer-kb.ts`.
- Summary-string parsing in `order-ops/finding.ts`.
- The overall size of `SUPPORT_INSTRUCTIONS`.

## Normal-use observations

No migration work remains, and nothing in this section is a release gate
(decision L). Each item is built and deployed but has not been seen live. When
one happens in ordinary use, record the result in the release evidence and
remove it here. Do not create staged tickets, induce a failure or book a paid
eval to observe one.

Built but not seen live:

- the full-refund amount on an approval card, phone and dashboard (#148);
- recovery when the customer reply fails after a committed write;
- the provider id on a live dashboard `send_email` (8f, #146);
- partial-refund cap refusal at execution;
- refusal of a stale or over-limit approval;
- a customer message on an already-escalated thread;
- revising a proposal from the phone.

Conversational acceptance not yet seen:
resolving a reference such as "the other one", returning to an earlier topic,
revising through conversation, and new phrasing, language or brand voice.

Accepted release exclusions and rollback are recorded in
[the runtime runbook](agent-runtime.md#settled-decisions).
