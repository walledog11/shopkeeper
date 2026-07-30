# Gmail production rollout evidence — 2026-07-29

This record contains sanitized operational evidence only. It intentionally omits
credentials, OAuth tokens, message bodies, customer addresses, raw provider
payloads, and attachment contents.

## Scope and release

- Gmail reliability release commit:
  `5a7771ab010406b15655aa61daacb8f0b40ff2d5`
  (`fix: harden Gmail sync recovery`).
- Previous Railway release:
  `ed0d7cb81e636f0df0f4c866f1cf7ebbab9eb852`.
- No Prisma schema or migration changed. Production reported 62 migrations and
  `Database schema is up to date` before deployment.
- `EMAIL_INBOUND_MODE` is unset on both gateway services and therefore resolves
  to the code default `hybrid`.
- `GMAIL_NATIVE_INBOUND=true` on both gateway services.
- `OUTBOUND_EMAIL_ASYNC` remains unset; this rollout did not enable or change it.
- No Postmark service or integration was provisioned.

## Local release gates

All gates ran against the release worktree before the commit was pushed:

| Gate | Result |
|---|---|
| Focused Gmail gateway tests | 46 passed |
| Focused Gmail email-package tests | 15 passed |
| Gateway unit suite | 258 passed |
| Gateway integration suite | 594 passed, 1 skipped |
| Gateway coverage suite | 852 passed, 1 skipped |
| Email-package unit/coverage suite | 65 passed |
| Node script tests | 38 passed |
| Monorepo build | passed |
| Monorepo typecheck | passed |
| Monorepo lint | passed |
| `git diff --cached --check` | passed |

The release includes automated coverage for lease renewal/loss, bounded
stale-history recovery, truncation without checkpoint advance, maintenance job
identity, daily renewal without checkpoint replacement, pre-Redis attachment
budgets, bounded fetch concurrency, raw-message size limits, and
Retry-After-aware backoff.

## Production configuration baseline

Captured before deployment on 2026-07-30 UTC:

- Both services use the same Neon pooler host and database.
- The existing target and `sslmode=require` were preserved while
  `pgbouncer=true&connection_limit=1` was added to both pooled `DATABASE_URL`
  values with deploy triggering suppressed.
- Gmail topic:
  `projects/shopkeeper-501301/topics/gmail-inbound`.
- Pub/Sub OIDC audience:
  `https://clerk-production-e37f.up.railway.app/webhooks/gmail/push`.
- Expected Pub/Sub service account:
  `shopkeeper-gmail-push@shopkeeper-501301.iam.gserviceaccount.com`.
- Topic, audience, and service-account values matched across both services and
  were not changed.
- The production environment contract passed on both services. The remaining
  warning is the intentional Railway-private `redis://` endpoint.

## Palette baseline

Sanitized snapshot at 2026-07-30T01:25:57Z:

| Field | Value |
|---|---|
| Organization | Palette |
| Integration ID | `5581f606-029b-4b12-951a-89af960d859c` |
| Organization ID | `10c25c34-7a92-4963-b9cd-537ef893f6c0` |
| Gmail integration count | 1 |
| Inbound status | `active` |
| Last error | none |
| History checkpoint | `39912` |
| Last synced at | `2026-07-30T01:25:57.923Z` |
| Watch last renewed at | `2026-07-25T21:53:16.206Z` |
| Watch expiration | `1785621196086` |
| Support alias configured | yes |
| Configured alias is `support@palettegarments.com` | no |

The existing support address was not changed during deployment.

Pre-deploy authenticated queue snapshot:

| Queue | Waiting | Active | Completed | Failed | Delayed |
|---|---:|---:|---:|---:|---:|
| `gmail-sync` | 0 | 0 | 3 | 0 | 0 |
| `gmail-watch-maintenance` | 0 | 0 | 52 | 0 | 1 |
| `inbound-messages` | 0 | 0 | 3 | 0 | 0 |

There were no failed Gmail job IDs.

## Deployment

Both Railway services built and deployed the exact release SHA:

| Service | Deployment ID | Status | Started |
|---|---|---|---|
| `shopkeeper` | `4727d86c-9dc5-4c88-98dd-324d04ab26b9` | success/running | `2026-07-30T02:07:57.331Z` |
| `Gateway Worker` | `05d79509-b44c-4bb6-9cdd-d2da5a940ce9` | success/running | `2026-07-30T02:07:57.736Z` |

Vercel production deployment `dpl_ADr5Yzp3mvs6cbJ5WkHh1dHF7JYV` reached
`READY`. GitHub reported successful checks for both Railway services and Vercel
on the release commit.

## Immediate production verification

Completed after both Railway deployments reached `SUCCESS`:

- Public `/health/deep`: `status=ok`; DB, Redis, worker, and queues all `ok`.
- Authenticated `/health/queues`: worker healthy; `gmail-sync`,
  `gmail-watch-maintenance`, and inbound queues had zero failed jobs.
- `npm run verify:production`: passed dashboard health, internal hop-back auth,
  retired-route rejection, gateway deep health, authenticated queue health, and
  Photon route checks. The optional Postmark inbound smoke was intentionally
  skipped because no test recipient was supplied.
- Startup logs for both services contained no warning or error entries.
- No rollback was required.

Post-canary verification at 2026-07-30T04:45Z again passed dashboard health,
internal hop-back authentication, gateway deep health, authenticated queue
health, and the Photon webhook check. Recent worker logs contained no canary
error and recorded the expected Gmail history synchronization.

Verification at 2026-07-30T08:20Z against the current production deployments
again passed dashboard health, all authenticated dashboard hop-back checks,
retired-route rejection, gateway deep health, authenticated seven-queue health,
and the Photon webhook check. The strict 240-hour required-Gmail outbound audit
still reported exactly one `sent` Gmail row and no failed, unknown, stale,
missing-provider-ID, or duplicate-provider-ID blockers.

Post-deploy authenticated queue snapshot at 2026-07-30T02:10:39Z:

| Queue | Waiting | Active | Completed | Failed | Delayed |
|---|---:|---:|---:|---:|---:|
| `gmail-sync` | 0 | 0 | 3 | 0 | 0 |
| `gmail-watch-maintenance` | 0 | 0 | 52 | 0 | 1 |
| `inbound-messages` | 0 | 0 | 3 | 0 | 0 |

## Recovery guardrail evidence

At 2026-07-30T02:13Z, the production command below was run without
`--execute`:

```bash
npm run recover:gmail-history -- \
  --integration-id=5581f606-029b-4b12-951a-89af960d859c \
  --max-messages=10000 \
  --query='newer_than:30d in:inbox'
```

The preflight reported `execute=false`, `inboundStatus=active`, and no last
error, then exited with the inspect-only notice. It did not enqueue a job or
mutate the integration. Execution is additionally refused unless the
integration is degraded specifically with `sync_recovery_truncated` and a
stable recovery ID is supplied.

## Scheduled observation

The previous maintenance deployment completed at `2026-07-30T00:00:00.296Z`.
The repeat schedule is anchored to 00:00/12:00 UTC, so the first hardening
maintenance run is due at 2026-07-30T12:00Z (05:00 PDT).

- [ ] Record the first `catchupsEnqueued=1` maintenance completion.
- [ ] Record the corresponding deterministic job ID:
  `gmail-sync-maintenance-5581f606-029b-4b12-951a-89af960d859c-<12-hour-bucket>`.
- [ ] Confirm `lastSyncedAt` is monotonic and checkpoint is at least `39912`.
- [ ] Confirm the overdue daily renewal advances `watchLastRenewedAt` and watch
  expiration without replacing the established checkpoint.
- [ ] Re-run deep health, authenticated queue health, and error-log checks after
  12 hours.
- [ ] Re-run those checks after 24 hours and confirm both services still run the
  same release SHA.

## Async outbound Gmail canary

At 2026-07-30T04:45Z, the guarded production canary sent one clearly labeled
message to the connected Gmail account's own plus-address. The output was
sanitized and reported:

| Check | Result |
|---|---|
| Queue admission | accepted |
| Final state | `sent` |
| Provider message ID persisted | yes |
| Same message ID re-enqueued | `deduplicated=true` |
| Staged Shopkeeper thread | closed after verification |

The canary message ID is `32588b09-0a00-4e10-93b0-a5813b1d39ad`; its raw
provider ID, recipient address, body, and credentials are intentionally absent
from this record.

Strict audits immediately afterward:

| Window | Gmail sent | Failed | Unknown | Stale pending/processing | Missing/duplicate provider ID |
|---|---:|---:|---:|---:|---:|
| 1 hour | 1 | 0 | 0 | 0 | 0 |
| 240 hours | 1 | 0 | 0 | 0 | 0 |

`OUTBOUND_EMAIL_ASYNC` remains unset on the production dashboard. This canary
proves the deployed gateway worker, Gmail provider send, provider-ID commit, and
stable queue deduplication path without widening dashboard traffic. Keep the
synchronous dashboard path as the rollback rail until the documented
unknown/stale/manual-retry recovery exercises are complete; mailbox receipt and
exact-once reconciliation are now confirmed below.

## Live mailbox canary

The automated self-addressed outbound canary above is complete. The remaining
inbound, alias, attachment, and threading checks need authenticated Gmail
administrator access plus an independent external mailbox. Neither is
available in the release workspace, so Palette's support address was not
changed.

At 2026-07-30T08:36Z, a read-only Gmail API reconciliation loaded the integration
through the same top-level credential path used by production, fetched the
stored provider message, parsed its RFC `Message-ID`, and queried Gmail by that
identity. Gmail returned exactly one match, whose provider ID and unique canary
subject both matched the staged Shopkeeper row. This closes mailbox receipt and
duplicate-delivery confirmation without recording the mailbox address, message
body, raw MIME, provider ID, or token. A separate read-only `sendAs` check found
one configured sender and confirmed `support@palettegarments.com` is not present
or verified, so changing Shopkeeper's `fromEmail` would be premature.

- [ ] Configure delivery for `support@palettegarments.com`.
- [ ] Verify it as an authorized Gmail **Send mail as** address.
- [ ] Prove inbound delivery and alias sending in Gmail first.
- [ ] Save the alias in Shopkeeper.
- [x] Confirm message `32588b09-0a00-4e10-93b0-a5813b1d39ad` arrived once in
  the connected Gmail mailbox.
- [ ] Send unique plain-text and HTML-plus-safe-attachment canaries externally.
- [ ] Reply from the dashboard alias and send one customer follow-up.
- [ ] Confirm one ticket/message, attachment persistence, alias sender,
  Gmail threading, one continuing Shopkeeper thread, and no duplicate jobs.
- [ ] Review logs for identifiers/categories only, with no content or tokens.

If alias behavior fails, restore Palette's original Gmail address immediately.
The reliability release can remain deployed.

## Rollback record

- Prior service deployments:
  `390c535d-8217-4bad-b333-2726d6c14e68` (`shopkeeper`) and
  `be96c2b8-5d29-4dad-ba57-a9eb61355067` (`Gateway Worker`).
- Rollback trigger observed: none.
- Code rollback performed: no.
- `GMAIL_NATIVE_INBOUND` emergency disable performed: no.
