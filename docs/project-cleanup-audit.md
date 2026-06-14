# Project Cleanup Audit

Last reviewed: 2026-06-14.

This audit captures cleanup opportunities found after recent major project changes. It focuses on codebase hygiene, verification gaps, stale compatibility paths, and documentation drift.

## Highest Priority

### Fix the typecheck contract

Status: Complete on 2026-06-14. `npm run typecheck` now runs real `typecheck` scripts in all five Turbo workspaces.

Previously, `npm run typecheck` reported five Turbo packages in scope, but only `shopkeeper-dashboard` had a real `typecheck` script. Gateway, DB, agent, and email showed as missing tasks in Turbo's dry run.

Action:

- Add `typecheck` scripts to `apps/gateway`, `packages/db`, `packages/agent`, and `packages/email`, or rename the root script so it does not overstate coverage.
- Keep `npm run typecheck` aligned with what release verification expects.

Evidence:

- `package.json`
- `apps/dashboard/package.json`
- `apps/gateway/package.json`
- `packages/agent/package.json`
- `packages/db/package.json`
- `packages/email/package.json`

### Triage dependency audit findings

Status: Complete on 2026-06-14. `@anthropic-ai/sdk` was upgraded to `0.104.1` in dashboard, gateway, and agent. The remaining Next/PostCSS finding was resolved with a narrow root npm override that keeps `next@16.2.6` but resolves its `postcss` dependency to `8.5.15`.

`npm audit --audit-level=moderate` now reports zero vulnerabilities.

Notes:

- Latest stable `next@16.2.9` still declares `postcss@8.4.31`.
- `next@16.3.0-canary.51` has moved to `postcss@8.5.10`, so the override should be removed once a compatible stable Next release includes the patched dependency.
- Gateway e2e startup now preserves the test wrapper's `PORT=8180` by not allowing `apps/gateway/.env` to override existing env values during `E2E_TEST_RUN=true`.

Verification:

- `npm audit --audit-level=moderate`
- `node scripts/with-test-env.mjs npm run build -w apps/dashboard`
- `npm run test:e2e:smoke`
- `npm run typecheck`
- `npm run lint -w apps/gateway`

## Active Feature Cleanup

### Finish or trim the walkthrough feature

Status: Complete on 2026-06-14. Typed merchant questions now prepend the active ticket context via `buildWalkthroughContextPrefix` while keeping the visible chat bubble as the merchant's original question. The walkthrough open/approve/skip/closing flow and context block are covered by `apps/dashboard/src/components/agent/walkthrough-briefing.unit.test.ts`.

The home walkthrough path is now partially wired through:

- `apps/dashboard/src/lib/home/walkthrough.ts`
- `apps/dashboard/src/app/dashboard/_components/home/useHomeData.ts`
- `apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx`
- `apps/dashboard/src/components/agent/AgentChatView.tsx`
- `apps/dashboard/src/components/agent/WalkthroughBriefing.tsx`

Resolved cleanup point:

- `buildWalkthroughContextPrefix` is called by `AgentChatView` when a walkthrough item is active.

Verification:

- `npm run test:unit -w apps/dashboard -- src/components/agent/walkthrough-briefing.unit.test.ts src/lib/home/walkthrough.unit.test.ts`
- `npm run typecheck -w apps/dashboard`
- `npm run lint -w apps/dashboard`

### Remove stale home Telegram return values

Status: Complete on 2026-06-14. `useHomeData` still checks Telegram connection state for the setup checklist, but no longer exposes Telegram-specific return values that the home UI does not consume.

Previously, `useHomeData` returned `hasTelegramBound` and `telegramBotUsername`, but `ConciergeBriefing` no longer consumed them after the CTA was changed to open the agent panel.

Resolved cleanup point:

- Removed the unused return values.
- Kept the Telegram workflow step because it remains part of the setup checklist.

## Package Boundary Cleanup

### Complete the email package extraction

Status: Complete on 2026-06-14. Dashboard imports now use `@shopkeeper/email` package subpaths directly, package-behavior tests live under `packages/email/src`, and the dashboard email shim modules were removed.

Removed shims:

- `apps/dashboard/src/lib/messaging/email/index.ts`
- `apps/dashboard/src/lib/messaging/email/reply.ts`
- `apps/dashboard/src/lib/messaging/email/gmail.ts`
- `apps/dashboard/src/lib/messaging/email/outlook.ts`
- `apps/dashboard/src/lib/messaging/email/postmark.ts`
- `apps/dashboard/src/lib/messaging/email/mime.ts`

Resolved cleanup point:

- Moved sender/provider/reply tests that validate package behavior into `packages/email`.
- Switched dashboard imports to `@shopkeeper/email` package subpaths.
- Deleted the dashboard shim files.

### Remove unreferenced agent tool compatibility files

These files are one-line re-export modules and were not referenced in source during the audit:

- `packages/agent/src/tools/tool-selection.ts`
- `packages/agent/src/tools/tool-schemas.ts`

Action:

- Confirm there are no external/import-by-path consumers.
- Delete them if they are no longer part of a supported package API.

## Large File Refactors

Several files are now large enough that focused extraction would improve maintainability.

Candidates:

- `apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx`
- `apps/dashboard/src/app/dashboard/review/_components/QualityPanel.tsx`
- `apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx`
- `apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx`
- `apps/dashboard/src/components/agent/AgentChatView.tsx`
- `apps/dashboard/src/lib/server/home-summary.ts`
- `packages/agent/src/settings.ts`
- `packages/agent/src/run.ts`
- `packages/agent/src/planner.ts`

Action:

- Extract stateful orchestration into hooks where useful.
- Keep render-only subcomponents close to the feature folder.
- Avoid broad style rewrites while behavior is still moving.

## Test Infrastructure Cleanup

### Consolidate DB test helpers

`e2e/db-helpers.cjs` duplicates helper logic from `packages/db/test-helpers.ts` and also carries local copies of agent defaults and plan-cache record construction.

Action:

- Prefer shared package helpers where the e2e runtime allows it.
- Pull agent defaults and plan-cache constants from the agent package instead of duplicating them.
- Keep e2e-only polling helpers in `e2e/` if they are specific to browser tests.

## UI Inventory Cleanup

These UI components appear unused by dashboard source imports:

- `apps/dashboard/src/components/ui/sidebar.tsx`
- `apps/dashboard/src/components/ui/grid-pattern.tsx`

Action:

- Remove if they are leftover shadcn inventory.
- Keep only if there is an explicit near-term use.

## Documentation Cleanup

Known stale references:

- `README.md` links to missing `docs/production/checklist.md`.
- `docs/telegram-operator-channel.md` references `docs/production/checklist.md`.
- `docs/production/runbook.md` links to `apps/dashboard/src/lib/env.ts`, but the current path is `apps/dashboard/src/lib/env/index.ts`.

Action:

- Either recreate `docs/production/checklist.md` or retarget links to `docs/production/runbook.md` and `docs/to-do-list.md`.
- Update the env file reference in the runbook.
- Add a concise release-gate checklist that includes `npx prisma validate`, `npm run verify:production:env`, `npm run test:integration`, and `npm run verify:pr`.

## Local Hygiene

Ignored build/test artifacts found by `npm run clean -- --dry-run`:

- `.turbo`
- `apps/dashboard/.next`
- `apps/dashboard/.next-dev`
- `apps/dashboard/.turbo`
- `apps/dashboard/tsconfig.tsbuildinfo`
- `apps/gateway/.turbo`
- `apps/gateway/dist`
- `packages/agent/.turbo`
- `packages/agent/dist`
- `packages/db/.turbo`
- `packages/db/dist`
- `packages/email/.turbo`
- `packages/email/dist`
- `test-results`

Additional local files:

- `.DS_Store`
- `packages/.DS_Store`
- `apps/.DS_Store`
- `apps/dashboard/.DS_Store`
- `apps/dashboard/public/.DS_Store`
- `apps/dashboard/public/logos/.DS_Store`
- `apps/gateway/.DS_Store`

Action:

- Run `npm run clean` when ready to remove generated artifacts.
- Consider teaching `scripts/clean.mjs` to remove `.DS_Store` files, since `.gitignore` already ignores them.

## Verification From Audit

Commands run during the audit:

- `npm run lint`: passed.
- `npm run typecheck`: passed across all five Turbo workspaces.
- `npm run test:unit -w apps/dashboard -- src/lib/home/walkthrough.unit.test.ts`: passed.
- `npm audit --audit-level=moderate`: passed with zero vulnerabilities after the Next/PostCSS override.
