# Email inbound steady-state plan

Created: 2026-09-25. Last updated: 2026-09-26 (Phase 4 shipped + host env cleanup).

**Status:** Phases **0–4 complete** (code + production). Phases **0–3** in [PR #112](https://github.com/walledog11/shopkeeper/pull/112); **Phase 4** on `master` (`1903cc02`). Phases **5–6** open (5 product-gated; 6 partial).

| Phase | State | Notes |
| --- | --- | --- |
| 0 — Inventory | Done | [Phase 0 inventory](./email-inbound-phase-0-inventory.md) |
| 1 — Stop dual delivery | Done | [Phase 1 acceptance](./email-inbound-phase-1-acceptance.md) |
| 2 — Data model + validation | Done | Migration `20260926120000_email_inbound_mode_backfill` applied in production (2026-09-26) |
| 3 — Unified ingress | Done | Shipped on gateway via `master` deploy; `InboundEmailEvent` + single enqueue path |
| 4 — Retire env flags | Done | `GMAIL_NATIVE_INBOUND` removed from Vercel + Railway (2026-09-26); default `EMAIL_INBOUND_MODE` (`standard`) |
| 5 — Remove Postmark inbound (optional) | Not started | Product-gated |
| 6 — Docs handoff | Partial | README + runbook updated in Phase 4; to-do cross-link remains |

Owner: engineering / release, with product sign-off on forward-only Postmark retention.

**Related docs:** [Phase 0 inventory](./email-inbound-phase-0-inventory.md) ·
[Phase 1 acceptance](./email-inbound-phase-1-acceptance.md) ·
[audit commands](./audit-commands.md) ·
[runbook — Gmail inbound steady state](production/runbook.md)

## Progress summary (as of 2026-09-26)

| Area | Done | Notes |
| --- | --- | --- |
| Inventory / audit | Yes | `npm run audit:email-inbound-transport` ([`packages/db/email-inbound-transport-audit.ts`](../packages/db/email-inbound-transport-audit.ts), [`scripts/audit-email-inbound-transport.mjs`](../scripts/audit-email-inbound-transport.mjs)). `--strict` fails on dual-delivery risk. Production `--strict` green (2026-09-26, re-run after fleet changes). |
| Production snapshot | Yes | 1 Gmail-only email org, 0 dual-integration, 0 dual-delivery risk ([inventory](./email-inbound-phase-0-inventory.md)). |
| Ops health (post Phase 4) | Yes | Dashboard `/api/health` ok; gateway `/health/deep` ok (`worker` ok). See **Ops evidence** at end of doc. |
| Integrations UI | Yes | “Inbound via Gmail” / “Inbound via forwarding”; dual-path banner; forward connect blocked when Gmail sync is active. Phase 4: no `GMAIL_NATIVE_INBOUND` gating in UI ([`email-inbound-path.ts`](../apps/dashboard/src/lib/integrations/email-inbound-path.ts), presentation + forwarding panels). |
| Connect validation (Phase 2) | Yes | Dual inbound blocked on **all** email upserts via [`hasDualInboundDeliveryRisk` / `assertNoDualInboundDelivery`](../packages/email/src/inbound-transport-policy.ts) in [`email-integration.ts`](../apps/dashboard/src/app/api/integrations/_lib/email-integration.ts). Option **A**: transport implied by `email_provider`. |
| Metadata backfill (Phase 2) | Yes | [`20260926120000_email_inbound_mode_backfill`](../packages/db/prisma/migrations/20260926120000_email_inbound_mode_backfill/migration.sql) applied in production; upsert strips `inboundMode` except Gmail send-only (`inboundMode: 'postmark'`). |
| Gmail OAuth connect (Phase 4) | Yes | Always schedules watch after OAuth ([`complete-gmail-oauth.ts`](../apps/dashboard/src/app/api/integrations/gmail/callback/complete-gmail-oauth.ts)); no `inboundMode: 'native'` write. |
| Shared path assessment | Yes | [`packages/email/src/inbound-transport.ts`](../packages/email/src/inbound-transport.ts) — `assessEmailInboundPaths` (integration-only; no global rollout flag). |
| Unified ingress (Phase 3) | Yes | [`InboundEmailEvent`](../packages/email/src/inbound-event.ts), [`toInboundEmailJobPayload` / `parseInboundEmailJobData`](../packages/email/src/inbound-email-job.ts), sole producer [`enqueue-inbound-email.ts`](../apps/gateway/src/inbound/enqueue-inbound-email.ts). Postmark webhook + Gmail sync enqueue through it; `handleEmailJob` parses normalized shape. |
| CI gates | Yes | Audit fixture + enqueue surface gates in `verify:pr`. Production env schema: [`scripts/lib/production-config-schema.mjs`](../scripts/lib/production-config-schema.mjs), [`scripts/check-production-env.mjs`](../scripts/check-production-env.mjs) (Phase 4). |
| Production deploy (0–3) | Yes | [PR #112](https://github.com/walledog11/shopkeeper/pull/112) → `master`; `db:migrate:deploy` + post-deploy `audit --strict` (2026-09-26). |
| Production deploy (Phase 4) | Yes | Vercel + Railway deploy (2026-09-26); `GMAIL_NATIVE_INBOUND` stripped from both hosts |
| Runbook + README (Phase 4/6) | Partial | Steady-state inbound docs updated ([runbook](./production/runbook.md), [README](../README.md)); diagram + per-transport health checklist still Phase 6. |
| Retire env flags (Phase 4) | Yes | Code + host env; `EMAIL_INBOUND_MODE`: `standard` (default), `postmark`, `gmail-only`; legacy `hybrid` → `standard`. [compatibility-retirement-backlog.md](./compatibility-retirement-backlog.md). |
| to-do cross-link | No | Phase 6 — link from [to-do-list.md](./to-do-list.md). |

**Tests added or updated (Phases 0–4):**

- `packages/email/src/inbound-transport.test.ts`
- `packages/email/src/inbound-transport-policy.test.ts`
- `packages/email/src/inbound-email-job.test.ts`
- `packages/db/email-inbound-transport-audit.unit.test.ts`
- `apps/dashboard/src/lib/integrations/email-inbound-path.unit.test.ts`
- `apps/dashboard/src/app/api/integrations/_lib/email-integration.test.ts` (dual-path rejection, hybrid metadata strip)
- `apps/dashboard/src/app/api/integrations/route.test.ts` (forward blocked when Gmail watch active)
- `apps/dashboard/src/app/api/integrations/gmail/callback/route.test.ts` (OAuth reconnect; no `inboundMode: 'native'`)
- Gateway: `gmail-sync.unit.test.ts`, `webhooks-email-shopify.test.ts`, `worker-inbound-email.test.ts` (regression via normalized job payload)
- Phase 4: `production-config-schema.test.mjs`, `check-production-env.test.mjs`; gateway `webhooks-gmail.test.ts`, `gmail-watch.unit.test.ts`; dashboard `complete-gmail-oauth.unit.test.ts`, integrations presentation tests

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
and `processInboundMessage` (`inbound-persistence.ts`). Global rollout flags were retired in
**Phase 4**; remaining optional work is **Phase 5** (Postmark inbound product) and **Phase 6**
(docs polish) — not duplicate enqueue paths.

| Source of complexity | Effect | Steady-state status |
| --- | --- | --- |
| `EMAIL_INBOUND_MODE` (`standard` / `postmark` / `gmail-only`; `hybrid` → alias) | Gateway-wide rail enablement | **Retired hybrid** — Phase 4 |
| `GMAIL_NATIVE_INBOUND` on **dashboard and gateway** | Rollout kill switch; must stay matched | **Removed** — Phase 4 |
| `metadata.inboundMode` (`hybrid` / `native` / `postmark`) | Per-row override of native sync | **Option A:** stripped except Gmail `postmark` (send-only); SQL backfill **applied in production** |
| `metadata.gmail.inboundStatus` + history checkpoint | Native health and eligibility | Unchanged (intrinsic to Gmail watch) |
| Two `Integration` rows per org (`gmail` + `postmark`) | Dual delivery during rollout | Blocked in API + audit; 0 dual-risk orgs in prod snapshot |

Hybrid was a **migration strategy**. Steady-state architecture treats dual
delivery as a **bug**, not a supported mode.

Related docs: [runbook — Gmail inbound steady state](production/runbook.md),
[README — Email inbound](../README.md#channels), [phase-6 external services](phase-6-external-services.md).

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
   is retired (alias → `standard`); homogeneous fleets may use `postmark` or `gmail-only`;
   mixed fleets use `standard` with one transport per org in data. **Done (Phase 4).**

4. **`GMAIL_NATIVE_INBOUND` is retired.** Gmail connect always registers watch when
   scopes allow; native sync eligibility comes from integration state and
   `EMAIL_INBOUND_MODE !== 'postmark'`, not a paired env flag on two hosts. **Done (Phase 4).**

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
  steady-state guidance; keep as **temporary migration** note only ([runbook](./production/runbook.md)).
- [x] Palette / internal canary (fleet-appropriate — see acceptance doc).

**Acceptance:** [email-inbound-phase-1-acceptance.md](./email-inbound-phase-1-acceptance.md)

- [x] `npm run audit:email-inbound-transport -- --strict` green (production snapshot + CI fixture gate).
- [x] Palette / internal canary (fleet-appropriate sign-off).
- [x] Duplicate `externalMessageId` from dual rails ≈ 0 (0 dual-risk orgs at sign-off).

### Phase 2 — Data model and validation (3–5 days)

**Status:** Complete (2026-09-26), including production migration and audit.

**Decision:** **Option A** — inbound transport implied by `email_provider`; remove
`inboundMode` except `postmark` on Gmail rows that disable watch (send-only).

**Tasks**

- [x] Add migration: remove legacy `hybrid` / `native` / Postmark-row `inboundMode`
  ([`20260926120000_email_inbound_mode_backfill`](../packages/db/prisma/migrations/20260926120000_email_inbound_mode_backfill/migration.sql)).
- [x] `upsertEmailIntegration`: reject dual inbound delivery (Gmail watch + active Postmark).
- [x] Dashboard + API: validation on all email upserts (not only new forward connect).
- [x] Gate script: `npm run audit:email-inbound-transport` — flags orgs violating
  invariant 1 (shipped Phase 0; use `--strict` for CI/Phase 1 gate).
- [x] CI: `scripts/email-inbound-transport-audit-fixture.test.mjs` runs `--strict` on test DB (coverage stage).

**Acceptance**

- [x] Integration tests for connect/reconnect; audit script green on fixture DB in CI.
- [x] Migration applied in production; post-deploy `audit --strict` green (2026-09-26, `safeToBeginPhase1Ops: true`, 0 dual-delivery-risk orgs).

### Phase 3 — Unified ingress layer (5–8 days)

**Status:** Complete in production (2026-09-26).

**Tasks**

- [x] Introduce `InboundEmailEvent` and `enqueueInboundEmail(queue, event, options?)`.
- [x] Refactor Postmark webhook and `gmail-sync/enqueue.ts` to call it exclusively.
- [x] Slim `handleEmailJob` via `parseInboundEmailJobData` → `processInboundMessage`.
- [x] Attachment budget at ingress (webhook + Gmail sync); worker re-applies before upload only.
- [x] Unit tests: `inbound-email-job.test.ts`; gateway enqueue surface gate in `verify:pr` static stage.
- [x] Classification canary uses `enqueueInboundEmail` ([`canary-classification-write.ts`](../apps/gateway/src/scripts/canary-classification-write.ts)).

**Acceptance**

- [x] `scripts/check-inbound-email-enqueue-surface.mjs` green in CI static verification.
- [x] Gateway deploy live with Phase 3 binary on `master` (no direct `JOB.EMAIL` adds outside enqueue module; enforced in CI).

### Phase 4 — Retire rollout globals (2–4 days)

**Status:** Complete (2026-09-26). Deploy + host env cleanup done; `GMAIL_NATIVE_INBOUND`
removed from Vercel and Railway (`shopkeeper` + Gateway Worker).

**Tasks**

- [x] Remove `GMAIL_NATIVE_INBOUND` from dashboard and gateway env contracts; Gmail
  OAuth always schedules watch when native inbound is product-default.
- [x] Replace `EMAIL_INBOUND_MODE=hybrid` with `standard` (legacy `hybrid` alias);
  dev: `gmail-only`; prod: `standard` or `postmark` for forward-only fleet.
- [x] Update `scripts/check-production-env.mjs`, `production-config-schema.mjs`, README,
  runbook.
- [x] Add retirement entry to [compatibility-retirement-backlog.md](compatibility-retirement-backlog.md).

**Acceptance**

- [x] Production env preflight/schema updated; warn if `GMAIL_NATIVE_INBOUND` still set.
- [x] Runbook: no “must match on both hosts” for Gmail inbound.
- [x] Host env cleaned after Phase 4 deploy (remove `GMAIL_NATIVE_INBOUND`).

**Key code touchpoints (Phase 4):** [`production-config-schema.mjs`](../scripts/lib/production-config-schema.mjs),
[`check-production-env.mjs`](../scripts/check-production-env.mjs),
[`complete-gmail-oauth.ts`](../apps/dashboard/src/app/api/integrations/gmail/callback/complete-gmail-oauth.ts),
[`eligibility.ts`](../apps/gateway/src/workers/gmail-sync/eligibility.ts),
[`webhooks-gmail.ts`](../apps/gateway/src/routes/webhooks-gmail.ts),
[`gmail-watch.ts`](../apps/gateway/src/maintenance/gmail-watch.ts).

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

**Status:** Partial (2026-09-26). README + runbook steady-state copy landed with Phase 4.

- [x] README email section: one transport per mailbox narrative + link to this plan.
- [ ] README: steady-state **diagram** (ASCII or mermaid) if still desired beyond plan doc.
- [ ] Link from [to-do-list.md](to-do-list.md) (single line pointing here for email
  ingress work).
- [ ] Ops: single health checklist per transport in runbook (beyond existing `/health` +
  audit commands).

## Testing strategy

| Layer | What to prove | Status (2026-09-26) |
| --- | --- | --- |
| Unit | `InboundEmailEvent` ↔ job payload round-trip | Done — `inbound-email-job.test.ts` |
| Unit | Dual-path policy helpers | Done — `inbound-transport.test.ts`, `inbound-transport-policy.test.ts`, `email-inbound-path.unit.test.ts`, `email-inbound-transport-audit.unit.test.ts` |
| Integration | DB-backed `processInboundMessage` idempotency on `externalMessageId` | Unchanged — `worker-inbound-email.test.ts` |
| Integration | Forward connect blocked when Gmail watch active | Done — `route.test.ts`, `email-integration.test.ts` |
| Gateway | Webhook auth; Gmail sync enqueue shape | Done — `webhooks-email-shopify.test.ts`, `gmail-sync.unit.test.ts` |
| CI | Audit `--strict` on empty test DB | Done — `email-inbound-transport-audit-fixture.test.mjs` (coverage stage) |
| Production | Post-ship `--strict` | Done — 2026-09-26 after migration deploy |
| CI | No stray `process-email` enqueue | Done — `check-inbound-email-enqueue-surface.mjs` |
| Canary | Fleet-appropriate inbound paths | Done — [Phase 1 acceptance](./email-inbound-phase-1-acceptance.md) |
| Env / config | Phase 4 schema + preflight | Done — `production-config-schema.test.mjs`, `check-production-env.test.mjs` |

Do not weaken duplicate detection tests when changing inbound config (Phase 4+).

## Rollout and rollback

**Rollout order**

1. [x] Phase 1 dual-delivery stop (UI, API, runbook, audit).
2. [x] Phase 2–3 code merged; validate in CI and local integration tests ([PR #112](https://github.com/walledog11/shopkeeper/pull/112)).
3. [x] **Deploy:** `db:migrate:deploy` (Phase 2 backfill) + gateway/dashboard (Phase 2–3) on `master` (2026-09-26).
4. [x] Re-run `npm run audit:email-inbound-transport -- --strict` in production after deploy (2026-09-26).
5. [x] Phase 4 flag retirement (code) — ops: deploy + strip retired env vars from hosts.

**Rollback:** Per org, set transport to Postmark forward **or** pause native sync via
integration lifecycle — not re-enable global hybrid. Document in runbook.

## Completion criteria (definition of done)

**Phase 0 baseline (production, 2026-09-26):** 1 active email org (Gmail-only), 0
dual-integration, 0 dual-delivery risk — [details](./email-inbound-phase-0-inventory.md).

| Criterion | Status |
| --- | --- |
| Invariant 1 enforced in code (validation + audit script) | Done |
| Single module enqueues `JOB.EMAIL` from normalized events | Done |
| No production dependency on `GMAIL_NATIVE_INBOUND` or `EMAIL_INBOUND_MODE=hybrid` | Done (2026-09-26) |
| Runbook steady-state section; hybrid migration-only | Done |
| Integrations UI reflects one inbound path per connection type | Done |
| No duplicate-ingestion from dual rails (ops evidence) | Done — [Phase 1 acceptance](./email-inbound-phase-1-acceptance.md) |
| Phase 2 SQL backfill applied in production | Done (2026-09-26) |
| Phase 3 gateway binary live in production | Done (2026-09-26, via `master` deploy) |
| Phase 4 rollout globals retired in code | Done (2026-09-26) |
| Phase 4 binary live in production | Done (2026-09-26) |

## Expected outcomes (maintainability)

| Dimension | Before | After (Phases 0–3) | After (Phase 4, target) |
| --- | --- | --- | --- |
| Config dimensions | env × env × metadata × two rows | metadata simplified; dual connect blocked | `EMAIL_INBOUND_MODE` only; transport per integration |
| Mental model | “Which rail got this?” | “Which adapter enqueued this?” (`ingressTransport`) | “How is this org’s mail connected?” |
| Deploy coupling | Vercel + Railway flag parity | Single enqueue module; validation on connect | **Achieved:** Gmail watch on connect; no `GMAIL_NATIVE_INBOUND` parity |
| Ingress enqueue | Two call sites + ad-hoc canary adds | One module + CI gate | Same |
| Reliability | Silent drops on wrong/missing rail | Dual delivery blocked; normalized job contract | Phase 6: one health checklist per transport (optional) |

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

1. Ops: weekly `npm run audit:email-inbound-transport -- --strict` (or after any email integration change).
2. Optional ops: set `EMAIL_INBOUND_MODE=gmail-only` when the fleet is all-native (prod snapshot: 1 Gmail org, 2026-09-26).
3. Docs (Phase 6): `to-do-list.md` cross-link; steady-state diagram in README if desired.

**Ops evidence (2026-09-26, post Phase 4):**

| Check | Result |
| --- | --- |
| `npm run audit:email-inbound-transport -- --strict` | Green — 1 Gmail org, 0 dual-delivery risk (pre–Phase 4; re-run after fleet changes) |
| `GET https://app.useshopkeeper.com/api/health` | `{"status":"ok"}` |
| Gateway `GET /health/deep` | `status: ok`, `checks.worker.status: ok` |
| Host env | `GMAIL_NATIVE_INBOUND` absent on Vercel production + Railway gateway services |

Re-run health + audit after any email integration change.
