# Email inbound steady-state plan

Created: 2026-09-25. Last updated: 2026-09-26.

**Status:** Phases **0–3 complete** in code and tests. **Phases 4–6 not started.**

| Phase | State | Notes |
| --- | --- | --- |
| 0 — Inventory | Done | [Phase 0 inventory](./email-inbound-phase-0-inventory.md) |
| 1 — Stop dual delivery | Done | [Phase 1 acceptance](./email-inbound-phase-1-acceptance.md) |
| 2 — Data model + validation | Done in repo | **Pending:** deploy migration `20260926120000_email_inbound_mode_backfill` to production |
| 3 — Unified ingress | Done | `InboundEmailEvent` + single enqueue path |
| 4 — Retire env flags | Not started | |
| 5 — Remove Postmark inbound (optional) | Not started | Product-gated |
| 6 — Docs handoff | Not started | |

Owner: engineering / release, with product sign-off on forward-only Postmark retention.

**Related docs:** [Phase 0 inventory](./email-inbound-phase-0-inventory.md) ·
[Phase 1 acceptance](./email-inbound-phase-1-acceptance.md) ·
[audit commands](./audit-commands.md) ·
[runbook — Gmail inbound steady state](production/runbook.md)

## Progress summary (as of 2026-09-26)

| Area | Done | Notes |
| --- | --- | --- |
| Inventory / audit | Yes | `npm run audit:email-inbound-transport` ([`packages/db/email-inbound-transport-audit.ts`](../packages/db/email-inbound-transport-audit.ts), [`scripts/audit-email-inbound-transport.mjs`](../scripts/audit-email-inbound-transport.mjs)). `--strict` fails on dual-delivery risk. |
| Production snapshot | Yes | 1 Gmail-only email org, 0 dual-integration, 0 dual-delivery risk ([inventory](./email-inbound-phase-0-inventory.md)). Re-run audit after fleet or integration changes. |
| Integrations UI | Yes | “Inbound via Gmail” / “Inbound via forwarding”; dual-path banner; forward connect blocked when Gmail sync is active ([`email-inbound-path.ts`](../apps/dashboard/src/lib/integrations/email-inbound-path.ts), presentation + forwarding panels). |
| Connect validation (Phase 2) | Yes | Dual inbound blocked on **all** email upserts via [`hasDualInboundDeliveryRisk` / `assertNoDualInboundDelivery`](../packages/email/src/inbound-transport-policy.ts) in [`email-integration.ts`](../apps/dashboard/src/app/api/integrations/_lib/email-integration.ts). Option **A**: transport implied by `email_provider`. |
| Metadata backfill (Phase 2) | Yes (migration file) | [`20260926120000_email_inbound_mode_backfill`](../packages/db/prisma/migrations/20260926120000_email_inbound_mode_backfill/migration.sql) strips legacy `hybrid`/`native`; upsert strips `inboundMode` except Gmail send-only (`inboundMode: 'postmark'`). **Deploy to prod pending.** |
| Gmail OAuth metadata | Yes | No longer writes `inboundMode: 'native'` on connect ([`complete-gmail-oauth.ts`](../apps/dashboard/src/app/api/integrations/gmail/callback/complete-gmail-oauth.ts)). |
| Shared path assessment | Yes | [`packages/email/src/inbound-transport.ts`](../packages/email/src/inbound-transport.ts) — `assessEmailInboundPaths`, `isGmailWatchReceivingConfigured`. |
| Unified ingress (Phase 3) | Yes | [`InboundEmailEvent`](../packages/email/src/inbound-event.ts), [`toInboundEmailJobPayload` / `parseInboundEmailJobData`](../packages/email/src/inbound-email-job.ts), sole producer [`enqueue-inbound-email.ts`](../apps/gateway/src/inbound/enqueue-inbound-email.ts). Postmark webhook + Gmail sync enqueue through it; `handleEmailJob` parses normalized shape. |
| CI gates | Yes | Audit fixture: [`scripts/email-inbound-transport-audit-fixture.test.mjs`](../scripts/email-inbound-transport-audit-fixture.test.mjs) (`npm run test:node`). Enqueue surface: [`scripts/check-inbound-email-enqueue-surface.mjs`](../scripts/check-inbound-email-enqueue-surface.mjs) (`verify:pr --stage=static`). |
| Runbook | Yes | Steady-state one transport per mailbox; hybrid parallel forward **migration-only**; Palette canary uses distinct messages per path. |
| Retire env flags | No | Phase 4 — `GMAIL_NATIVE_INBOUND`, `EMAIL_INBOUND_MODE=hybrid` still in env contracts. |
| README / to-do cross-links | No | Phase 6. |

**Tests added or updated (Phases 0–3):**

- `packages/email/src/inbound-transport.test.ts`
- `packages/email/src/inbound-transport-policy.test.ts`
- `packages/email/src/inbound-email-job.test.ts`
- `packages/db/email-inbound-transport-audit.unit.test.ts`
- `apps/dashboard/src/lib/integrations/email-inbound-path.unit.test.ts`
- `apps/dashboard/src/app/api/integrations/_lib/email-integration.test.ts` (dual-path rejection, hybrid metadata strip)
- `apps/dashboard/src/app/api/integrations/route.test.ts` (forward blocked when Gmail watch active)
- `apps/dashboard/src/app/api/integrations/gmail/callback/route.test.ts` (OAuth reconnect; no `inboundMode: 'native'`)
- Gateway: `gmail-sync.unit.test.ts`, `webhooks-email-shopify.test.ts`, `worker-inbound-email.test.ts` (regression via normalized job payload)

## Objective

Replace the **hybrid dual-rail** email ingress model (Postmark forwarding + Gmail
native sync running in parallel) with a **production steady state** that is:

- **One active inbound transport per support mailbox** — no intentional duplicate
  delivery of the same message through two schedulers.
- **Explicit in data** — transport choice lives on the integration (or is derived
  unambiguously from `emailProvider`), not from a Cartesian product of global env
  flags and `metadata.inboundMode`.
- **Reliable** — failures surface in Integrations health and ops alerts, not as
  silent 200s on the wrong rail.
- **Maintainable** — one normalized ingress contract and one enqueue path into the
  existing `process-email` → `processInboundMessage` tail.

Outbound remains unchanged in scope: per-integration Gmail API or Postmark send,
`resolveEmailIntegration`, threading, and bounce handling on the outbound provider.

This plan does **not** remove the Gmail sync/watch machinery (~1.3k LOC in gateway).
That code is intrinsic to native inbound; the refactor **isolates** it behind a
narrow adapter and deletes **overlap and rollout glue**.

## Problem statement

Today customer mail can enter through:

1. **Postmark forwarding** — `POST /webhooks/email/inbound` → `enqueueInboundEmail`
   → `process-email` (org UUID in recipient local part, Postmark `emailProvider` row).
2. **Gmail native** — Pub/Sub push → `gmail-sync` → history checkpoint → MIME
   → `enqueueInboundEmail` → `process-email` (Gmail `emailProvider` row).

Both rails converge on `handleEmailJob` (`apps/gateway/src/message-handlers/inbound/channels.ts`)
and `processInboundMessage` (`inbound-persistence.ts`). Remaining fragility (Phase 4+)
sits in **global rollout flags** and legacy docs — not in duplicate enqueue paths.

| Source of complexity | Effect | Steady-state status |
| --- | --- | --- |
| `EMAIL_INBOUND_MODE` (`hybrid` / `postmark` / `gmail-only`) | Gateway-wide rail enablement | Still present — **Phase 4** |
| `GMAIL_NATIVE_INBOUND` on **dashboard and gateway** | Rollout kill switch; must stay matched | Still present — **Phase 4** |
| `metadata.inboundMode` (`hybrid` / `native` / `postmark`) | Per-row override of native sync | **Option A:** stripped except Gmail `postmark` (send-only); SQL backfill ready |
| `metadata.gmail.inboundStatus` + history checkpoint | Native health and eligibility | Unchanged (intrinsic to Gmail watch) |
| Two `Integration` rows per org (`gmail` + `postmark`) | Dual delivery during rollout | Blocked in API + audit; 0 dual-risk orgs in prod snapshot |

Hybrid was a **migration strategy**. Steady-state architecture treats dual
delivery as a **bug**, not a supported mode.

Related docs: [runbook — Gmail native-inbound rollout](production/runbook.md),
[README — Email hybrid model](../README.md), [phase-6 external services](phase-6-external-services.md).

Open operational proof (not blockers for Phases 0–3 code, but blockers for deleting
Postmark inbound globally): [to-do-list — Postmark canary, Gmail alias, Palette
independent-email canary](to-do-list.md).

## Decisions and invariants

1. **One transport per mailbox.** For a given merchant support address, at most one
   inbound transport may be **active**. Gmail OAuth connections use **`gmail_watch`**
   only; they must not also receive the same inbox via Postmark forward.

2. **Postmark inbound remains a product path** for **forward-only** workspaces
   (no Gmail OAuth): connect Email forwarding → Postmark webhook rail only. This
   avoids forcing every merchant through Google verification before first ticket.

3. **No global hybrid mode in production** after migration. `EMAIL_INBOUND_MODE=hybrid`
   is retired; production uses `postmark` until the last forward-only tenant migrates,
   then `gmail-only` **or** per-integration transport without a global “both rails on”
   mode (see target architecture). **Phase 4.**

4. **`GMAIL_NATIVE_INBOUND` is retired** once Gmail connect always registers watch
   when readonly/mail scopes allow. Native sync eligibility comes from integration
   state, not a paired env flag on two hosts. **Phase 4.**

5. **The durable tail is frozen.** Do not fork ticket creation, episode rollover,
   classification, or summarization. All transports produce the same
   **`InboundEmailEvent`** consumed by one enqueue function. **Done (Phase 3).**

6. **Dedup remains org-scoped `externalMessageId`.** Transports must populate RFC
   `Message-ID` when present; Gmail may fall back to `gmail:{id}` only when header
   absent. Dual-rail duplicate tickets are prevented by policy (invariant 1), not
   only by id coincidence.

7. **Rollback is per integration**, not “flip two env vars and hope forwarding
   works.” Document reconnect, transport switch, and operator metadata change in the
   runbook — not silent dual delivery.

## Target architecture

```text
                    ┌─ Postmark webhook adapter ────┐
Customer mail ──────┤                                 ├── InboundEmailEvent
                    └─ Gmail sync adapter ──────────┘            │
                                                                   ▼
                                                    enqueueInboundEmail()
                                                    (single BullMQ JOB.EMAIL add)
                                                                   │
                                                                   ▼
                                                    handleEmailJob (thin)
                                         parseInboundEmailJobData → persist
                                                                   │
                                                                   ▼
                                                    processInboundMessage
                                                    (unchanged semantics)
```

### Normalized ingress contract (implemented)

Location: [`packages/email/src/inbound-event.ts`](../packages/email/src/inbound-event.ts),
[`packages/email/src/inbound-email-job.ts`](../packages/email/src/inbound-email-job.ts).

```ts
/** Stable job payload for JOB.EMAIL after normalization. */
export interface InboundEmailEvent {
  organizationId: string;
  integrationId: string;
  senderEmail: string;
  senderName: string | null;
  subject: string;
  body: string;
  /** Persists to Message.externalMessageId */
  externalMessageId: string | null;
  receivedAt: string; // ISO
  traceId: string;
  attachments?: Array<{ name: string; contentType: string; contentBase64: string }>;
  /** Provenance for logs/metrics only; not a second dedup namespace */
  ingressTransport: 'postmark_forward' | 'gmail_sync';
}
```

BullMQ jobs use `toInboundEmailJobPayload` (adds `platform: 'email'` and legacy
`inboundMessageId` mirror). Workers use `parseInboundEmailJobData` for in-flight and
new jobs.

### Integration model (steady state)

**Decision (Phase 2): Option A** — derive transport from `emailProvider`; do not store
`inboundTransport` in metadata. Exception: Gmail row may keep `inboundMode: 'postmark'`
to disable watch while Postmark handles inbound (send-only OAuth).

| `emailProvider` | Effective inbound transport | Ingestion |
| --- | --- | --- |
| `gmail` | `gmail_watch` | Pub/Sub + sync (unless `inboundMode: 'postmark'`) |
| `postmark` | `postmark_forward` | Webhook only |

**Forbidden:** active Gmail watch ingest + active Postmark forward on the same org
(enforced in upsert + audit).

### Code layout (current)

| Module | Responsibility |
| --- | --- |
| `apps/gateway/src/routes/webhooks-email.ts` | Auth, parse Postmark → `InboundEmailEvent` → `enqueueInboundEmail` |
| `apps/gateway/src/routes/webhooks-gmail.ts` | OIDC, enqueue sync (unchanged entry) |
| `apps/gateway/src/workers/gmail-sync/*` | Gmail API, checkpoint, MIME → `InboundEmailEvent` |
| `apps/gateway/src/inbound/enqueue-inbound-email.ts` | **Sole** `process-email` producer |
| `apps/gateway/src/message-handlers/inbound/channels.ts` | `handleEmailJob` → `processInboundMessage` |

Still to shrink (Phase 4):

- `isNativeGmailInboundEnabled` branches that exist only for global hybrid rollout
  (`apps/gateway/src/workers/gmail-sync/eligibility.ts`).
- Dual-flag reads in dashboard `isGmailNativeInboundEnabled` when watch is always-on
  for new Gmail connects.

## Phases

### Phase 0 — Inventory and policy sign-off (1–2 days)

**Status:** Complete (2026-09-26).

**Deliverables**

- [x] SQL/report: orgs with **both** active `email` integrations (`gmail` + `postmark`).
- [x] For each, document whether Postmark forward duplicates Gmail INBOX (support
  address, forwarding rules). _None in production snapshot; template in phase-0 doc._
- [x] Product decision recorded: keep Postmark inbound for forward-only only (recommended).
- [x] Update this plan’s “Completion criteria” with counts from inventory.

**Inventory command (replaces ad-hoc SQL)**

```bash
npm run audit:email-inbound-transport
```

See [email-inbound-phase-0-inventory.md](./email-inbound-phase-0-inventory.md) for
policy sign-off, production snapshot counts, and per-org checklist template.

**Reference SQL**

```sql
SELECT organization_id, array_agg(email_provider ORDER BY email_provider) AS providers
FROM integrations
WHERE platform = 'email' AND lifecycle_status = 'active' AND email_provider IS NOT NULL
GROUP BY organization_id
HAVING count(*) > 1;
```

### Phase 1 — Stop dual delivery (behavior, minimal code) (2–4 days)

**Goal:** No merchant receives the same mail on both rails.

**Status:** Complete (2026-09-26). See [email-inbound-phase-1-acceptance.md](./email-inbound-phase-1-acceptance.md).

**Tasks**

- [x] For each dual-integration org on native Gmail: merchant or operator disables
  Postmark forward to `{orgUuid}@inbound.*` (or disconnects Postmark inbound row if
  product allows). _Production inventory: 0 dual-integration orgs (2026-09-26); re-run
  audit when fleet changes._
- [x] Integrations UI copy: “Inbound via Gmail” vs “Inbound via forwarding” — mutually
  exclusive (banner, card copy, API block on new forward connect when Gmail sync active).
- [x] Runbook: remove “keep hybrid forwarding live while enabling native” as
  steady-state guidance; keep as **temporary migration** note until Phase 4.
- [x] Palette / internal canary (fleet-appropriate — see acceptance doc).

**Acceptance:** [email-inbound-phase-1-acceptance.md](./email-inbound-phase-1-acceptance.md)

- [x] `npm run audit:email-inbound-transport -- --strict` green (production snapshot + CI fixture gate).
- [x] Palette / internal canary (fleet-appropriate sign-off).
- [x] Duplicate `externalMessageId` from dual rails ≈ 0 (0 dual-risk orgs at sign-off).

### Phase 2 — Data model and validation (3–5 days)

**Status:** Complete in repository (2026-09-26). **Production:** run migration deploy + audit.

**Decision:** **Option A** — inbound transport implied by `email_provider`; remove
`inboundMode` except `postmark` on Gmail rows that disable watch (send-only).

**Tasks**

- [x] Add migration: remove legacy `hybrid` / `native` / Postmark-row `inboundMode`
  ([`20260926120000_email_inbound_mode_backfill`](../packages/db/prisma/migrations/20260926120000_email_inbound_mode_backfill/migration.sql)).
- [x] `upsertEmailIntegration`: reject dual inbound delivery (Gmail watch + active Postmark).
- [x] Dashboard + API: validation on all email upserts (not only new forward connect).
- [x] Gate script: `npm run audit:email-inbound-transport` — flags orgs violating
  invariant 1 (shipped Phase 0; use `--strict` for CI/Phase 1 gate).
- [x] CI: `scripts/email-inbound-transport-audit-fixture.test.mjs` runs `--strict` on test DB.

**Acceptance**

- [x] Integration tests for connect/reconnect; audit script green on fixture DB in CI.
- [ ] Migration applied in production; post-deploy `audit --strict` recorded in ops log.

### Phase 3 — Unified ingress layer (5–8 days)

**Status:** Complete (2026-09-26).

**Tasks**

- [x] Introduce `InboundEmailEvent` and `enqueueInboundEmail(queue, event, options?)`.
- [x] Refactor Postmark webhook and `gmail-sync/enqueue.ts` to call it exclusively.
- [x] Slim `handleEmailJob` via `parseInboundEmailJobData` → `processInboundMessage`.
- [x] Attachment budget at ingress (webhook + Gmail sync); worker re-applies before upload only.
- [x] Unit tests: `inbound-email-job.test.ts`; gateway enqueue surface gate in `verify:pr` static stage.
- [x] Classification canary uses `enqueueInboundEmail` ([`canary-classification-write.ts`](../apps/gateway/src/scripts/canary-classification-write.ts)).

**Acceptance**

- [x] `scripts/check-inbound-email-enqueue-surface.mjs` green in CI static verification.
- [ ] Gateway deploy live with Phase 3 binary (no direct `JOB.EMAIL` adds outside enqueue module).

### Phase 4 — Retire rollout globals (2–4 days)

**Status:** Not started.

**Tasks**

- [ ] Remove `GMAIL_NATIVE_INBOUND` from dashboard and gateway env contracts; Gmail
  OAuth always schedules watch when native inbound is product-default.
- [ ] Replace `EMAIL_INBOUND_MODE=hybrid` with:
  - dev: `gmail-only` or explicit test mode documented in README
  - prod: no “both rails enabled globally”; optional `postmark` for legacy forward-only
    fleet only
- [ ] Update `scripts/check-production-env.mjs`, `production-config-schema.mjs`, README,
  runbook.
- [ ] Add retirement entry to [compatibility-retirement-backlog.md](compatibility-retirement-backlog.md)
  for `GMAIL_NATIVE_INBOUND` and `EMAIL_INBOUND_MODE=hybrid`.

**Acceptance:** Production env preflight passes; no reference to “must match on both
hosts” for Gmail inbound in runbook.

### Phase 5 — Optional: remove Postmark inbound product (product-gated)

**Status:** Not started.

**Only if** inventory shows zero forward-only merchants and product approves.

**Tasks**

- [ ] Remove Postmark inbound webhook route (keep **bounce** webhook for Postmark
  outbound sends).
- [ ] Remove `{orgUuid}@inbound` routing and unclaimed-recipient metrics for inbound.
- [ ] Set production `EMAIL_INBOUND_MODE=gmail-only`.
- [ ] LOC reduction ~150–250 lines gateway + tests (estimate).

**If not approved:** Postmark forward path stays permanently small and isolated.

### Phase 6 — Documentation and handoff (1 day)

**Status:** Not started.

- [ ] README email section: steady-state diagram, one transport per mailbox.
- [ ] Link from [to-do-list.md](to-do-list.md) (single line pointing here for email
  ingress work).
- [ ] Ops: single health checklist per transport in runbook.

## Testing strategy

| Layer | What to prove | Status (2026-09-26) |
| --- | --- | --- |
| Unit | `InboundEmailEvent` ↔ job payload round-trip | Done — `inbound-email-job.test.ts` |
| Unit | Dual-path policy helpers | Done — `inbound-transport.test.ts`, `inbound-transport-policy.test.ts`, `email-inbound-path.unit.test.ts`, `email-inbound-transport-audit.unit.test.ts` |
| Integration | DB-backed `processInboundMessage` idempotency on `externalMessageId` | Unchanged — `worker-inbound-email.test.ts` |
| Integration | Forward connect blocked when Gmail watch active | Done — `route.test.ts`, `email-integration.test.ts` |
| Gateway | Webhook auth; Gmail sync enqueue shape | Done — `webhooks-email-shopify.test.ts`, `gmail-sync.unit.test.ts` |
| CI | Audit `--strict` on empty test DB | Done — `email-inbound-transport-audit-fixture.test.mjs` |
| CI | No stray `process-email` enqueue | Done — `check-inbound-email-enqueue-surface.mjs` |
| Canary | Fleet-appropriate inbound paths | Done — [Phase 1 acceptance](./email-inbound-phase-1-acceptance.md) |

Do not weaken duplicate detection tests when removing hybrid (Phase 4+).

## Rollout and rollback

**Rollout order**

1. [x] Phase 1 dual-delivery stop (UI, API, runbook, audit).
2. [x] Phase 2–3 code merged; validate in CI and local integration tests.
3. [ ] **Deploy:** `db:migrate:deploy` (Phase 2 backfill) + gateway/dashboard (Phase 2–3).
4. [ ] Re-run `npm run audit:email-inbound-transport -- --strict` in production after deploy.
5. [ ] Phase 4 flag retirement only after production deploy stable.

**Rollback:** Per org, set transport to Postmark forward **or** pause native sync via
integration lifecycle — not re-enable global hybrid. Document in runbook.

## Completion criteria (definition of done)

**Phase 0 baseline (production, 2026-09-26):** 1 active email org (Gmail-only), 0
dual-integration, 0 dual-delivery risk — [details](./email-inbound-phase-0-inventory.md).

| Criterion | Status |
| --- | --- |
| Invariant 1 enforced in code (validation + audit script) | Done |
| Single module enqueues `JOB.EMAIL` from normalized events | Done |
| No production dependency on `GMAIL_NATIVE_INBOUND` or `EMAIL_INBOUND_MODE=hybrid` | **Phase 4** |
| Runbook steady-state section; hybrid migration-only | Done |
| Integrations UI reflects one inbound path per connection type | Done |
| No duplicate-ingestion from dual rails (ops evidence) | Done — [Phase 1 acceptance](./email-inbound-phase-1-acceptance.md) |
| Phase 2 SQL backfill applied in production | **Pending deploy** |
| Phase 3 gateway binary live in production | **Pending deploy** |

## Expected outcomes (maintainability)

| Dimension | Before | After (Phases 0–3) | After (Phase 4+) |
| --- | --- | --- | --- |
| Config dimensions | env × env × metadata × two rows | env flags remain; metadata simplified; dual connect blocked | transport per integration |
| Mental model | “Which rail got this?” | “Which adapter enqueued this?” (`ingressTransport`) | “How is this org’s mail connected?” |
| Deploy coupling | Vercel + Railway flag parity | Single enqueue module; validation on connect | Gmail watch on connect; simpler env |
| Ingress enqueue | Two call sites + ad-hoc canary adds | One module + CI gate | Same |
| Reliability | Silent drops on wrong/missing rail | Dual delivery blocked; normalized job contract | One health surface per transport |

## Non-goals

- Merging outbound Gmail and Postmark send paths.
- Changing email episode policy (`resolve-inbound-episode.ts`) or spam classification
  architecture.
- Replacing BullMQ or splitting gateway/worker deployables.

## Tracking

Work tracked in this file, [email-inbound-phase-0-inventory.md](./email-inbound-phase-0-inventory.md), and
[email-inbound-phase-1-acceptance.md](./email-inbound-phase-1-acceptance.md).
Optional: add row **E1** to [project-improvement-plan.md](project-improvement-plan.md) and link PRs.

**Next actions**

1. Deploy: `npm run db:migrate:deploy` (Phase 2 backfill) + gateway (Phase 3).
2. Production: `npm run audit:email-inbound-transport -- --strict` after deploy.
3. Ops: weekly `--strict` (or after any email integration change).
4. Engineering: **Phase 4** — retire `GMAIL_NATIVE_INBOUND` and `EMAIL_INBOUND_MODE=hybrid`.
