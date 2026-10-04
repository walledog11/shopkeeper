# Agent completion-fact contract

Last reviewed: 2026-10-04

Customer-facing completion language is conditional until the provider action succeeds. A proposed tool call is evidence of intent, not evidence that an external mutation committed.

## Fact shape

`packages/agent/src/completion-facts.ts` derives a small fact for each supported mutation:

- `action`: the normalized operation, such as `refund`, `cancellation`, `return`, or `fulfillment`;
- `target`: the order, customer, or email the operation affects, including a known customer-facing order alias;
- `amount` and `currency`: present when relevant and known;
- `outcome`: `proposed`, `success`, `error`, `policy_block`, `escalated`, or `unknown`;
- `executionReference`: the approved tool-call ID, provider operation key, or live-read call ID;
- `sourceTool`: the concrete tool that produced the fact.

Plan validation accepts `proposed` facts only to validate a conditional draft. The runtime send guard accepts only `success` facts. Mutation facts come from validated successful receipts; result prose and mutation inputs cannot establish completion. Current provider order reads can establish already observed state. The model cannot assert its own evidence.

## Wording and execution rules

- Every mutation described by a reply must precede that reply in the plan.
- Explicit order, amount, and currency language must match the fact. A completion email must retain the current customer recipient.
- A compound statement is sendable only when every described operation has a successful fact. Partial execution therefore cannot produce whole-plan success copy.
- A successful cancellation supports cancellation wording. Its receipt supports refund wording only when the refunded amount/payment facts confirm it.
- Known failures block the completion reply as an error. Unknown provider outcomes keep the existing distinct `unknown` path, prevent the reply, and require reconciliation rather than retry.
- Historical completion wording is allowed only when a live Shopify order read establishes the state. Customer messages, summaries, and old/unexecuted plans do not produce facts.

## Approval boundary

The durable proposal hash covers the action bundle, exact customer draft and
destination. The executor sends those approved bytes only after the approved
writes succeed, substituting only the already bound receipt placeholders.
Changing the recipient, amount, target, promise or wording requires a revised
proposal and renewed approval. Missing receipt values withhold the message;
result-text inference cannot fill them.

Planning may flag unsupported draft language for merchant review. It does not
rewrite approved exact drafts after execution. Model turns without an approval
snapshot still ground their wording in receipts and observed provider reads.
See [agent-runtime.md](agent-runtime.md) for migration and compatibility policy.
