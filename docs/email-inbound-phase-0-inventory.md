# Email inbound — Phase 0 inventory

Companion to [email-inbound-steady-state-plan.md](./email-inbound-steady-state-plan.md).
**Read-only** — no data changes.

## Product policy (sign-off)

**Decision (2026-09-25):** Keep **Postmark inbound** as the product path for
**forward-only** workspaces (no Gmail OAuth). Gmail-connected workspaces use
**Gmail watch / history sync only**; Postmark forward to `{orgId}@inbound.*` must
not run in parallel on the same merchant INBOX.

Product owner acknowledgment: _engineering default per steady-state plan; escalate if
forward-only path is deprecated before Phase 5._

## How to run inventory

```bash
npm run audit:email-inbound-transport
```

Optional gate (Phase 1 acceptance — fails when any org has dual-delivery risk):

```bash
npm run audit:email-inbound-transport -- --strict
```

Implementation: `packages/db/email-inbound-transport-audit.ts` (report builder) and
`scripts/audit-email-inbound-transport.mjs` (CLI).

Equivalent SQL (dual **active** providers):

```sql
SELECT organization_id, array_agg(email_provider ORDER BY email_provider) AS providers
FROM integrations
WHERE platform = 'email'
  AND lifecycle_status = 'active'
  AND email_provider IS NOT NULL
GROUP BY organization_id
HAVING count(*) > 1;
```

### Report fields (dual-integration orgs)

| Field | Meaning |
| --- | --- |
| `supportAddressOverlap` | Gmail and Postmark rows share the same support/from address (likely same INBOX). |
| `dualDeliveryRisk` | Both integrations **active** and Gmail native sync not disabled (`inboundMode !== 'postmark'`, `gmail.inboundStatus` active or degraded). |
| `postmarkInboundRecipient` | `{organizationId}@{INBOUND_EMAIL_DOMAIN}` — verify merchant forwarding rules target this. |
| `operatorNotes.*` | Manual follow-up; not inferred from DB. Update in your run log, not in git. |

Do **not** commit full audit JSON from production (contains org names). Record
**aggregate counts** in the steady-state plan only.

## Production snapshot (2026-09-26)

Audit run via `npm run audit:email-inbound-transport` against the configured
`DATABASE_URL` (production).

| Metric | Count |
| --- | ---: |
| Organizations with ≥1 active email integration | 1 |
| Forward-only (Postmark active, no active Gmail) | 0 |
| Gmail watch only (Gmail active, no active Postmark) | 1 |
| Dual active integration (Gmail + Postmark) | 0 |
| Dual-delivery risk | 0 |
| Dual integration with support-address overlap | 0 |

**Phase 1 ops:** No per-org Postmark forward disable list required at this time.
Re-run the audit after any merchant connects Gmail while Postmark forward remains
enabled.

**Phase 1 engineering (2026-09-26):** Integrations UI + API guard shipped; runbook
steady-state updated. Production passes `npm run audit:email-inbound-transport -- --strict`.
Remaining Phase 1 item: Palette/internal canary per runbook (operator-run).

## Per-org operator checklist (template)

Use when `dualIntegrationOrgs` is non-empty. Copy rows into your ops ticket;

| Organization | Postmark forward still active? | Same INBOX as Gmail watch? | Action |
| --- | --- | --- | --- |
| _(example)_ | yes / no / unknown | yes / no / unknown | disable forward / disconnect Postmark row / set `inboundMode` |
