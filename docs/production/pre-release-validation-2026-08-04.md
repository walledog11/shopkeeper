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

### Dashboard production environment contract

The Vercel production environment is missing:

- `CLERK_WEBHOOK_SECRET`
- `PRICE_ID_STARTER`
- `PRICE_ID_PRO`

These configured variables all contain the same invalid sentinel rather than
values matching their contracts:

- `NEXT_PUBLIC_APP_URL`
- `POSTHOG_HOST`
- `GMAIL_NATIVE_INBOUND`
- `GMAIL_PUBSUB_TOPIC`
- `GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT`

Replace the sentinels, add the missing values, and rerun:

```bash
node scripts/check-production-env.mjs dashboard \
  --scope=launch \
  --env-file=<fresh-production-vercel-env-file>
```

The Vercel project is also configured for Node.js 24.x while the repository
declares Node.js 22.x. Align the project setting to Node.js 22.x before the
release candidate deploy.

### CSP reporting

An unauthenticated, sanitized production CSP report returned `401`, so browser
reports cannot currently reach the collector. The local fix adds
`/api/security/csp-report` to the public route policy and includes proxy-policy
tests. It is intentionally not deployed from the current dirty worktree,
because that would also deploy unrelated in-progress changes.

After the fix is deployed, repeat the Shopify OAuth popup smoke test, review
the report-only observation window, and only then change CSP from report-only
to enforced.

### Shopify follow-up

The connected `palette-dev` store retains 38 OAuth scopes; trim it to the 15
used scopes before merchant number two. Repeat the strict reservation and
unknown-outcome audits after the production observation window before closing
that rollout gate.

### Email, Sentry, and order-risk evidence

- `OUTBOUND_EMAIL_ASYNC` remains disabled, and the production outbound-email
  audit has no Postmark rows. The Postmark send/bounce canary and the documented
  stale-claim/manual-retry recovery exercises remain open.
- Dashboard `agent_failure` capture still needs one controlled request from an
  authenticated production browser session and confirmation in Sentry.
- The controlled order-risk review and notification passed. The worker has
  `ORDER_RISK_MONITOR_ENABLED=1`, but the webhook gateway has it set to `false`,
  so real `orders/created` webhooks are not admitted to the review queue. Align
  the gateway flag only when the launch owner approves live review traffic.

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
