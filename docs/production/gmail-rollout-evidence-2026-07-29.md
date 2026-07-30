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

## Live mailbox canary

This needs authenticated Gmail administrator access and an independent external
mailbox. Neither is available in the release workspace, so no message was sent
and Palette's support address was not changed.

- [ ] Configure delivery for `support@palettegarments.com`.
- [ ] Verify it as an authorized Gmail **Send mail as** address.
- [ ] Prove inbound delivery and alias sending in Gmail first.
- [ ] Save the alias in Shopkeeper.
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
