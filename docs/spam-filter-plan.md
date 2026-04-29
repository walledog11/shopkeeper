# Spam Filter — Implementation Plan

Three-bucket email triage (genuine / questionable / filtered) with implicit-feedback capture and a daily WhatsApp digest.

## Locked decisions

- **Channel scope:** email only. IG DM and WhatsApp inbound are out of scope.
- **Daily digest:** in scope — built as part of this work.
- **LLM:** one combined classify + summarize call upfront; replaces the existing two-call pattern.
- **Existing-customer bypass:** if the sender has any prior `filterStatus = genuine` thread, skip the classifier entirely.
- **No presets / custom rules:** single hardcoded prompt + one on/off toggle. Presets are a follow-up.
- **UI:** "Filtered" lives as a status pill in the existing inbox header (alongside Open / Pending / Closed). "Questionable" lives as a row badge in the
         normal Open list — same pattern as the existing "Plan ready" badge.

## Architecture overview

Three thread-level states, each with different downstream behavior:

| `filterStatus` | Visible in Open list | Playbooks | Plan precompute | Real-time WhatsApp | Daily digest | 7-day auto-purge |
| --- | --- | --- | --- | --- | --- | --- |
| `genuine` | yes | yes | yes | yes | counted | no |
| `questionable` | yes (badged) | yes | no | no | listed inline | no |
| `filtered` | no (in Filtered pill only) | no | no | no | counted | yes |

Implicit feedback (`filterFeedback`) is captured from existing merchant actions — no modal:

- Reply sent / thread closed-as-resolved → `confirmed_genuine` (and promotes `filtered` → `genuine`).
- "Mark as spam" row action → `confirmed_spam`.
- Recovery from Filtered pill → `confirmed_genuine`.

Captured now; applied to the classifier prompt in a follow-up.

---

## 1. Schema (one migration)

`packages/db/prisma/schema.prisma` — `Thread` model gains:

- `filterStatus` — new enum `ThreadFilterStatus` (`genuine | questionable | filtered`), default `genuine`. Existing rows unaffected.
- `filterReason` — `String?`. Classifier's one-line rationale.
- `filterDecidedAt` — `DateTime?`. Gates the 7-day purge.
- `filterFeedback` — new enum (`none | confirmed_genuine | confirmed_spam`), default `none`.
- New index: `@@index([organizationId, filterStatus, filterDecidedAt])`.

`Organization.settings` (JSON, no schema change) gains one optional key: `spamFilterEnabled` (default `true`).

## 2. Combined classify + summarize call (gateway)

`apps/gateway/src/message-handlers.ts`:

- **Delete** `isCustomerSupportMessage` (lines 119–136) and its caller at line 585.
- Modify `generateThreadIntelligence` (line 230) prompt to return `{summary, tag, classification, reason}` in one strict-JSON call. Net cost: zero on rea
         l tickets, save a call previously paid on every spammer.
- New helper `classifyAndSummarizeNewEmail(subject, body)` for the *pre-persistence* path used by `handleEmailJob`.

Wire into `handleEmailJob` (line 567):

1. Sender already has an open email thread → skip classifier (existing behavior at 577–590); inherit thread's `filterStatus`.
2. Sender has any `Customer` with at least one prior `filterStatus = genuine` thread → skip classifier; new thread persists as `genuine`.
3. Otherwise → run `classifyAndSummarizeNewEmail`, persist customer/thread/message inline with `filterStatus`, `filterReason`, `filterDecidedAt`, `aiSummary`, `tag` set. Skip the `SUMMARIZE_THREAD` enqueue for this path.
4. `processInboundMessage` accepts an optional `precomputed: {summary, tag}` parameter so the email path can skip the summary job; IG/WhatsApp paths are unchanged.

If `Organization.settings.spamFilterEnabled === false`, treat every email as `genuine` and skip steps 1–3 entirely.

## 3. Downstream branching

`apps/gateway/src/worker.ts:119` and the playbook / precompute hooks gate on `filterStatus`:

- `genuine` — existing behavior unchanged.
- `questionable` — playbooks fire, **skip plan precompute**, **suppress real-time WhatsApp**, surface in digest.
- `filtered` — no playbooks, no precompute, no notify.

## 4. Threads API

`apps/dashboard/src/app/api/threads/route.ts`:

- Default list excludes `filterStatus = filtered`.
- Accept `?filterStatus=filtered` for the Filtered-pill view.
- `questionable` ships in the default Open list (so the badge appears inline).

## 5. Inbox UI

`apps/dashboard/src/app/dashboard/tickets/_components/`:

- `thread-list/ThreadListHeader.tsx` — add **Filtered** pill alongside Open / Pending / Closed.
- `thread-list/TicketRow.tsx` — when `filterStatus === 'questionable'`, render a "Flagged" badge using the existing "Plan ready" pattern (line 89–93). Hover tooltip shows `filterReason`.
- Row actions: add **Mark as spam** (`filterStatus → filtered`, `filterFeedback = confirmed_spam`). In Filtered view, primary action is **Recover** (`filterStatus → genuine`, `filterFeedback = confirmed_genuine`).

## 6. Implicit feedback writes

No modal. Hooks into existing endpoints:

- `POST /api/messages` (outbound): if parent thread is `questionable` or `filtered`, set `filterFeedback = confirmed_genuine`, promote `filtered` → `genuine`.
- `PATCH /api/threads/[id]` (close-as-resolved): if previously `questionable`, set `filterFeedback = confirmed_genuine`.
- "Mark as spam" / "Recover" actions write feedback explicitly.

## 7. Settings UI

`apps/dashboard/src/app/dashboard/settings/` — one toggle "Filter spam emails" (default on) bound to `Organization.settings.spamFilterEnabled`. One row.

## 8. WhatsApp daily digest

Largest new piece — the digest doesn't exist today.

- New BullMQ repeatable job `dailyDigest`, registered in `apps/gateway/src/worker.ts`, scheduled once per org per day (UTC for MVP; per-org timezone is a follow-up).
- New file `apps/gateway/src/digest-worker.ts`:
- For each org with verified members, query last 24h of threads grouped by `filterStatus`.
- Format message with top-line counts ("12 new tickets, 3 flagged, 5 filtered"), one bullet per `questionable` thread (customer + 1-line summary), filtered count only.
- Send to each `OrgMember.phoneNumber` via existing Twilio client.
- Write `SmsContext.pendingDigest = { threadIds: [...] }`.
- Extend `SmsContext` (`apps/gateway/src/sms-context.ts`): add `pendingDigest` field parallel to `pendingPlan`.
- Extend SMS inbound parser (`apps/gateway/src/routes/webhooks.ts` Twilio handler) to recognize:
  - `REVIEW` — reply with numbered list of pending questionable threads.
  - `OPEN <n>` — reply with thread detail.
  - `SPAM <n>` — mark filtered, `filterFeedback = confirmed_spam`.
  - `REPLY <n> <text>` — send via existing pendingPlan flow.

## 9. 7-day purge sweep

Extend `apps/gateway/src/maintenance-workers.ts`. Hard-delete threads where `filterStatus = filtered AND filterDecidedAt < now - 7d AND filterFeedback = none AND no agent-sent messages`. Cascades to messages.

## 10. Testing

Per `CLAUDE.md`: real DB, no mocks. Tests live alongside each phase, not as a final pass.

Coverage:

- Classifier behavior: each bucket persists correctly with reason; existing-customer bypass; org-level kill switch.
- Implicit feedback: reply / close / mark-spam / recover all write the right `filterFeedback`.
- Threads API: default view excludes filtered; `?filterStatus=filtered` returns the right set.
- Digest aggregation: 24h window math, formatter output, REVIEW / SPAM / OPEN / REPLY commands.
- Purge sweep: deletes 7-day filtered threads with no feedback; recovered ones survive.

## Tradeoffs flagged

- **Existing-customer bypass is generous.** A compromised customer email could push spam through. Acceptable at solo-merchant scale.
- **Digest in UTC for MVP** — some merchants get pinged at odd hours. Configurable hour is a follow-up, not a blocker.
- **Combined LLM call** lengthens the prompt slightly. Email isn't latency-sensitive.
- **Feedback captured, not applied.** Data accumulates in `filterFeedback`; classifier prompt doesn't yet read it. Application step is a follow-up.

---

## Phased checklist

Each phase is a coherent unit that can be shipped, reviewed, and merged on its own. Tests are part of the phase that introduces the behavior.

### Phase 1 — Foundation

- [ ] Add `ThreadFilterStatus` enum to `schema.prisma`.
- [ ] Add `ThreadFilterFeedback` enum to `schema.prisma`.
- [ ] Add `filterStatus`, `filterReason`, `filterDecidedAt`, `filterFeedback` columns to `Thread`.
- [ ] Add `@@index([organizationId, filterStatus, filterDecidedAt])`.
- [ ] Update `Organization.settings` TypeScript shape to include `spamFilterEnabled?: boolean`.
- [ ] Generate and apply Prisma migration.

### Phase 2 — Classification core (gateway)

- [ ] Delete `isCustomerSupportMessage` and its caller in `handleEmailJob`.
- [ ] Rewrite `generateThreadIntelligence` prompt to return `{summary, tag, classification, reason}`.
- [ ] Add `classifyAndSummarizeNewEmail` helper for pre-persistence path.
- [ ] Add `processInboundMessage`'s optional `precomputed` parameter; skip summary enqueue for the email path when supplied.
- [ ] Wire `handleEmailJob` to: open-thread bypass → existing-customer bypass → classifier → persist with all filter columns set inline.
- [ ] Honor `Organization.settings.spamFilterEnabled === false` (treat every email as genuine).
- [ ] Gate `sendWhatsAppPlanNotification` (`worker.ts:119`) on `filterStatus === 'genuine'`.
- [ ] Gate `precomputeThreadPlan` to skip when `filterStatus === 'questionable'` or `'filtered'`.
- [ ] Gate `triggerPlaybooks` to skip when `filterStatus === 'filtered'`.
- [ ] Tests: bucket assignment, existing-customer bypass, kill switch, reply on existing thread skips classifier.

### Phase 3 — Dashboard surface (inbox + settings)

- [ ] `GET /api/threads`: default list excludes `filterStatus = filtered`; accept `?filterStatus=filtered`.
- [ ] `ThreadListHeader.tsx`: add **Filtered** pill alongside existing status pills.
- [ ] `TicketRow.tsx`: render "Flagged" badge when `filterStatus === 'questionable'`; hover tooltip shows `filterReason`.
- [ ] Row action: **Mark as spam** (sets `filterStatus = filtered`, `filterFeedback = confirmed_spam`).
- [ ] Row action in Filtered view: **Recover** (sets `filterStatus = genuine`, `filterFeedback = confirmed_genuine`).
- [ ] `POST /api/messages`: on outbound dispatch, write `confirmed_genuine` and promote `filtered → genuine` if applicable.
- [ ] `PATCH /api/threads/[id]`: on close, write `confirmed_genuine` if previously `questionable`.
- [ ] Settings page: add "Filter spam emails" toggle bound to `Organization.settings.spamFilterEnabled`.
- [ ] Tests: feedback writes on reply / close / mark-spam / recover; threads API filter param.

### Phase 4 — Daily digest (gateway)

- [ ] Tests: aggregator math, formatter output, each inbound command branch.

### Phase 5 — Purge sweep

- [ ] Extend `maintenance-workers.ts`: hard-delete threads where `filterStatus = filtered AND filterDecidedAt < now - 7d AND filterFeedback = none AND no agent-sent messages`.
- [ ] Tests: 7-day-old filtered with no feedback are deleted; recovered or merchant-touched ones survive.