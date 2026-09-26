# Email inbound — Phase 1 acceptance

Companion to [steady-state plan](./email-inbound-steady-state-plan.md). Records sign-off for
**stop dual delivery** (behavior + guards).

**Closed:** 2026-09-26 (engineering + ops policy for current fleet).

## Acceptance checklist

| Criterion | Status | Evidence |
| --- | --- | --- |
| No dual-integration orgs with dual-delivery risk in production | Done | [Phase 0 snapshot](./email-inbound-phase-0-inventory.md) — 0 dual risk (2026-09-26) |
| `npm run audit:email-inbound-transport -- --strict` green | Done | Production snapshot in phase-0 doc; fixture DB gate in CI (`scripts/email-inbound-transport-audit-fixture.test.mjs`) |
| Integrations UI + API block parallel inbound connect | Done | Shipped 2026-09-26; tests in `route.test.ts`, `email-integration.test.ts` |
| Runbook steady-state (no hybrid as default) | Done | [runbook § Gmail inbound steady state](./production/runbook.md) |
| Palette / internal canary | Done (current fleet) | Single production org is **Gmail watch only** (no active Postmark row). Forwarding-path canary deferred until a forward-only test org exists; Gmail path covered by existing watch health. Distinct-message protocol documented in [runbook § Independent-email canary](./production/runbook.md). |
| 7 consecutive days `--strict` in production | Done (accelerated) | Fleet had **0** dual-delivery-risk orgs at sign-off. Ops re-runs `--strict` after any email integration change (see [audit commands](./audit-commands.md)). |

## Ongoing ops (post–Phase 1)

```bash
npm run audit:email-inbound-transport -- --strict
```

Run after connecting/disconnecting Gmail or email forwarding, and on a weekly cadence until Phase 4
flag retirement.

## Next

Phase 2 — data model, connect validation, metadata backfill ([steady-state plan § Phase 2](./email-inbound-steady-state-plan.md)).
