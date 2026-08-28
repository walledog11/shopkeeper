# Pre-Release Validation — 2026-08-04

This record captures the production validation run requested on 2026-08-04.
It is evidence, not a release sign-off: the blockers below must be resolved and
their affected checks rerun before the release can be marked ready.

## Passed

| Check | Result |
| --- | --- |
| `npm run test:integration` | Passed: gateway, dashboard, and agent suites |
| `npm run verify:pr` | Passed: lint, unit and node tests, e2e smoke, coverage, and production builds |
| Prisma schema validation | Passed with the production Railway environment |
| Production migration status | Current: 62 migrations, no pending migration |
| Gateway production environment contract | Passed; the checker warns that the internal Railway Redis URL is not `rediss://` |
| `npm run verify:production` | Passed against `https://app.useshopkeeper.com` and the production gateway, including deep health, authenticated queue health, internal-hop authentication, and Photon |
| Shopify GraphQL document validation | All 13 mutation documents and 14 query documents validated against the connected store without executing mutations |
| Safe Shopify mutation canary | Created and cancelled test orders `#1019` and `#1020`; no existing live order was touched |
| Queue recovery drill | A controlled `order-review` job failed on attempt 1, completed on retry attempt 2, and was cleaned up |
| Goodwill reservation canaries | Refund `$0.01`, store credit `$0.01`, and gift card `$1.00` committed independently; all three stable identities returned `duplicate` on replay and the daily total was `$1.02` |
| Strict reservation audit | Three committed rows, 102 reserved/committed cents, no stale or `unknown` rows |
| Order-risk canary | Controlled test order `#1022` produced Shopify read evidence, a persisted `flag_order`, and one successful notification to the one bound operator channel |
| Focused CSP/queue tests and lint | Passed after the local fixes described below |

The outbound-email audit passed with zero qualifying production rows. It is a
clean baseline, not rollout evidence.

## Resolved during validation

### Shopify webhook secret mismatch

The safe test-order canary generated four Shopify webhook deliveries. The
production gateway rejected all four with signature mismatches. An
irreversible comparison confirmed that the dashboard's Shopify app/client
secret agrees with itself while both Railway services have a different
`SHOPIFY_APP_SECRET`.

The Vercel value was copied to both Railway services without printing or
retaining it. Both services redeployed successfully, their irreversible secret
fingerprints now match, and the live production verifier passed afterward.
The follow-up test-order webhooks were accepted and queued.

### Consequential Shopify canaries

After explicit launch-owner approval, all three canaries ran independently on
test-only resources:

- A dedicated test order with a synthetic test payment received a `$0.01`
  partial refund. Shopify reconciliation reported `committed`.
- A new canary customer received `$0.01` store credit. Shopify reconciliation
  reported `committed`.
- Shopify returned success for a `$1.00` gift card. The code-search probe missed
  it, so the operation was not retried; a read of the recent-card ledger found
  exactly one matching `$1.00` card and confirmed it committed.

The three confirmed effects were recorded in the goodwill reservation ledger.
Re-reserving each identical operation returned `duplicate` without changing the
daily total. The immediate strict audits found three committed rows totaling
102 cents and no stale or unknown rows.

The gift-card miss exposed a production safety defect: an empty Shopify code
search was treated as proof that no card existed. The local fix checks the
recent-card ledger using the operation note, amount, and last characters, and
keeps an unresolved miss `still_unknown` rather than releasing the reservation.
Unit tests, typecheck, lint, and live query-schema validation pass.

## Remaining blockers

Updated 2026-08-07. Open launch gates are tracked in
[to-do-list.md](../to-do-list.md); this section records what was still open
from the 2026-08-04 run and what has since cleared.

### Resolved after 2026-08-04

- **`CLERK_WEBHOOK_SECRET`** — set in Vercel production; unsigned probe returns
  `Invalid signature` (verified 2026-08-06). See
  [phase-6-external-services.md](../phase-6-external-services.md) (Clerk).
- **CSP report collector** — `/api/security/csp-report` is public; enforced CSP
  includes gateway SSE `connect-src` (deployed `399e0d13`, 2026-08-07).
- **Gmail scheduled observation** — 24-hour health window closed 2026-08-07. See
  [gmail-rollout-evidence-2026-07-29.md](gmail-rollout-evidence-2026-07-29.md).
- **Strict reservation audit (post-observation)** — re-run after the Gmail
  observation window closed 2026-08-07. `npm run audit:refund-spend-reservations
  -- --strict --hours=96` against production: three `committed` rows, 102
  reserved/committed cents, zero `unknown`, zero stale (verified 2026-08-07).
- **Live order-risk traffic** — `ORDER_RISK_MONITOR_ENABLED=1` on both Railway
  services (`shopkeeper` webhook gateway and `Gateway Worker`; verified
  2026-08-07 via `GET /internal/runtime-flags` → `monitors.orderRisk: true`).
  Production order `#1025` (Shopify id `6133857124586`) reviewed live
  2026-08-07T07:00:07Z: `[OrderRiskMonitor] Scan complete` → `[order-ops] run
  complete` with `flagged=false` (returning customer, benign — no operator
  alert). Escalation path (`flag_order` + operator notify) remains proven on
  controlled canaries `#1022` (2026-08-04) and `#1023` (2026-08-07).

### Still open from this validation

Every item below is now carried in [to-do-list.md](../to-do-list.md), which is the
file to read for current status. They are listed here only so this record states what
it left behind. Reconciled 2026-08-27.

#### Dashboard production environment contract

`PRICE_ID_STARTER` and `PRICE_ID_PRO` are still missing before two-tier billing, in
**both** Vercel and Railway. Re-verify any remaining sentinel values:

```bash
node scripts/check-production-env.mjs dashboard \
  --scope=launch \
  --env-file=<fresh-production-vercel-env-file>
```

The Vercel project may still be configured for Node.js 24.x while the repository
declares Node.js 22.x throughout. Still unverified.

#### Shopify follow-up

The connected `palette-dev` store retained 38 OAuth scopes against a declared set that
was 15 at the time of this run and is **17 today** — `write_products` and
`write_app_proxy` were added afterwards. Do not trim toward 15. Under managed
installation the released app version decides the grant, so the pending
`shopkeeper-production-28` release is the mechanism, not a separate console edit.

#### Email and Sentry evidence

- Postmark outbound canary and stale-claim/manual-retry recovery exercises —
  tracked in [to-do-list.md](../to-do-list.md) and
  [phase-6-external-services.md](../phase-6-external-services.md) (Postmark).
- Dashboard `agent_failure` capture → Sentry — tracked in
  [alerting-evidence.md](alerting-evidence.md).

`OUTBOUND_EMAIL_ASYNC` remains disabled by policy; sync path is the documented
rollback rail ([compatibility-retirement-backlog.md](../compatibility-retirement-backlog.md)).

## Local changes from this validation

- Made the CSP report collector public in the proxy access policy and added
  regression coverage.
- Added an explicit Shopify integration selector to the guarded mutation
  canary so a duplicate store connection cannot select the wrong tenant; added
  refundable-payment and controlled order-risk test fixtures.
- Made gift-card reconciliation fail closed on Shopify search/list misses and
  added a recent-card fallback proven against the live schema.
- Repaired BullMQ test doubles and added worker-registration regression
  coverage.
- Updated the near-term to-do list to reflect that a merchant and real traffic
  are now available.
