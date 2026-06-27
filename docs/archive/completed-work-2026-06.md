# Completed Work — June 2026

Implementation detail remains available in git history and the focused plans.
This file keeps concise completion evidence out of the active task list.

## Billing write gate

The dashboard and gateway block paid write actions for `past_due` and `canceled`
organizations. Route-sweep and wrapper regression tests cover both states.
Recovery, inbound, teardown, and lightweight bookkeeping paths remain available.

## Cross-ticket memory

Agent context now includes summaries and tags from the customer's three most
recent closed tickets. The feature is read-only and requires no maintenance job
or editable memory surface.

## iMessage operator rewire

The line now routes team-member messages through the operator agent rather than
creating customer-support tickets. Identity binding, dashboard framing,
synchronous replies, data-model changes, and legacy-path cleanup were completed
on 2026-06-24. The pre-GA data-retention decision remains separate operational
work.

## Support workflow capabilities

- Return-only RMAs ship through Shopify's GraphQL Returns API.
- Single-use percentage discount codes ship with tier-based percentage caps.
- Existing stores must reauthorize for the Shopify return scopes.
- Exchanges, return labels, store credit, gift cards, and fulfillment actions
  remain open work.

## Policy-gap guard

The policy-gap guard no longer treats shipping actions on a customer's own order
as merchant-policy questions. Focused intent and planner-safety regressions cover
the distinction between order actions and shipping-coverage questions.
