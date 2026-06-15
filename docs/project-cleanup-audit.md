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

Status: Complete on 2026-06-14. The package is private, these files were not referenced by source imports, and they were not exported from `@shopkeeper/agent`.

These files are one-line re-export modules and were not referenced in source during the audit:

- `packages/agent/src/tools/tool-selection.ts`
- `packages/agent/src/tools/tool-schemas.ts`

Action:

- Confirm there are no external/import-by-path consumers.
- Delete them if they are no longer part of a supported package API.

Resolved cleanup point:

- Removed `packages/agent/src/tools/tool-selection.ts`.
- Removed `packages/agent/src/tools/tool-schemas.ts`.

## Large File Refactors

Status: Complete on 2026-06-14. All remaining large-file candidates have had focused, behavior-preserving extractions.

Several files are now large enough that focused extraction would improve maintainability.

Completed sub-items:

- [x] 2026-06-14: Extracted the walkthrough sequencing, opening/closing messages, approve/skip advancement, and typed-question context wrapping from `AgentChatView.tsx` into `apps/dashboard/src/components/agent/useAgentWalkthrough.ts`.
- [x] 2026-06-14: Extracted org-settings parsing, validation, and repair helpers from `packages/agent/src/settings.ts` into `packages/agent/src/settings-parser.ts`; `settings.ts` now keeps the public defaults, tier resolution, and business-hours API.
- [x] 2026-06-14: Extracted the home needs-you deck, card rendering, swipe behavior, and motion constants from `NeedsYou.tsx` into local sibling modules.
- [x] 2026-06-14: Extracted review output grouping/formatting helpers and review-card rendering from `QualityPanel.tsx`.
- [x] 2026-06-14: Extracted tickets page orchestration and loading/error states from `TicketsPageClient.tsx` into local sibling modules.
- [x] 2026-06-14: Extracted conversation viewport side effects and skeleton render helpers from `ConversationView.tsx`.
- [x] 2026-06-14: Extracted agent chat message rendering and composer controls from `AgentChatView.tsx`.
- [x] 2026-06-14: Extracted home-summary SQL loading and needs-attention plan-card shaping from `apps/dashboard/src/lib/server/home-summary.ts`.
- [x] 2026-06-14: Extracted support-context detection, failure recording, audit finalization, and tool-call execution from `packages/agent/src/run.ts`.
- [x] 2026-06-14: Extracted read-tool execution/warning generation and visible step formatting from `packages/agent/src/planner.ts`.

Action:

- Extract stateful orchestration into hooks where useful.
- Keep render-only subcomponents close to the feature folder.
- Avoid broad style rewrites while behavior is still moving.

Resolved cleanup point:

- `apps/dashboard/src/lib/server/home-summary.ts` now assembles the summary from focused server helpers.
- `packages/agent/src/run.ts` now keeps the agent loop orchestration separate from shared execution plumbing.
- `packages/agent/src/planner.ts` now keeps model phase sequencing separate from read-tool warning logic and plan-step copy.

## Test Infrastructure Cleanup

### Consolidate DB test helpers

Status: Complete on 2026-06-14. `e2e/db-helpers.cjs` now delegates shared org/integration/cleanup fixture behavior to `@shopkeeper/db/test-helpers` where the async e2e runtime allows it, and uses `@shopkeeper/agent` plan-cache/settings helpers for cached-plan construction.

`e2e/db-helpers.cjs` duplicates helper logic from `packages/db/test-helpers.ts` and also carries local copies of agent defaults and plan-cache record construction.

Action:

- Prefer shared package helpers where the e2e runtime allows it.
- Pull agent defaults and plan-cache constants from the agent package instead of duplicating them.
- Keep e2e-only polling helpers in `e2e/` if they are specific to browser tests.

Resolved cleanup point:

- Reused shared DB test helpers for test org, integration, and cleanup operations.
- Replaced local agent settings/defaults and cache fingerprint construction with `resolveAgentSettings` and `buildAgentPlanCacheRecord`.
- Fixed seeded cached-plan messages to write the known `orgId` instead of relying on an unselected organization id.
- Kept e2e-specific polling, seeded email integration, and rate-limit helpers in `e2e/`.

## UI Inventory Cleanup

Status: Complete on 2026-06-14. Both components were unreferenced by dashboard source imports and have been removed.

These UI components appear unused by dashboard source imports:

- `apps/dashboard/src/components/ui/sidebar.tsx`
- `apps/dashboard/src/components/ui/grid-pattern.tsx`

Action:

- Remove if they are leftover shadcn inventory.
- Keep only if there is an explicit near-term use.

Resolved cleanup point:

- Removed `apps/dashboard/src/components/ui/sidebar.tsx`.
- Removed `apps/dashboard/src/components/ui/grid-pattern.tsx`.

## Documentation Cleanup

Status: Complete on 2026-06-14. `docs/production/checklist.md` was recreated as a concise release gate, stale env references were updated, and the production to-do list now reflects the completed documentation cleanup.

Previously stale references:

- `README.md` linked to missing `docs/production/checklist.md`.
- `docs/telegram-operator-channel.md` referenced `docs/production/checklist.md`.
- `docs/production/runbook.md` linked to `apps/dashboard/src/lib/env.ts`, but the current path is `apps/dashboard/src/lib/env/index.ts`.

Action:

- Either recreate `docs/production/checklist.md` or retarget links to `docs/production/runbook.md` and `docs/to-do-list.md`.
- Update the env file reference in the runbook.
- Add a concise release-gate checklist that includes `npx prisma validate`, `npm run verify:production:env`, `npm run test:integration`, and `npm run verify:pr`.

Resolved cleanup point:

- Recreated `docs/production/checklist.md`.
- Updated the dashboard env validation link in `docs/production/runbook.md`.
- Updated `docs/telegram-operator-channel.md` so it no longer references a removed checklist section.
- Marked the matching documentation cleanup items complete in `docs/to-do-list.md`.

## Local Hygiene

Status: Complete on 2026-06-14. `scripts/clean.mjs` now treats `.DS_Store` as an ignored artifact file during the default artifact cleanup mode, existing `.DS_Store` files were removed, and the regenerated ignored build outputs were cleared after stopping the local dev/watch process.

Update on 2026-06-14: `npm run clean` removed the remaining ignored artifacts and an immediate `npm run clean -- --dry-run` reported no matching paths. Subsequent verification commands regenerated expected ignored Turbo/build outputs. A final `npm run clean` removed those outputs again, but `apps/dashboard/.next-dev`, `packages/agent/dist`, and `packages/email/dist` reappeared immediately afterward. After stopping the active repo `npm run dev` / Turbo watch process tree, another `npm run clean` removed those three paths and `npm run clean -- --dry-run` reported no matching paths.

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

- [x] Run `npm run clean` when ready to remove generated artifacts.
- [x] Teach `scripts/clean.mjs` to remove `.DS_Store` files, since `.gitignore` already ignores them.
- [x] Stop the local dev/watch process regenerating ignored outputs and rerun `npm run clean`.

Resolved cleanup point:

- Removed existing `.DS_Store` files with `npm run clean`.
- Taught `scripts/clean.mjs` to remove `.DS_Store` files, since `.gitignore` already ignores them.
- Stopped the active repo `npm run dev` / Turbo watch process tree that was regenerating local build outputs.
- Removed generated artifacts after verification; the final `npm run clean -- --dry-run` reported no matching paths.

## Verification From Audit

Commands run during the audit:

- `npm run lint`: passed.
- `npm run typecheck`: passed across all five Turbo workspaces.
- `npm run test:unit -w apps/dashboard -- src/lib/home/walkthrough.unit.test.ts`: passed.
- `npm audit --audit-level=moderate`: passed with zero vulnerabilities after the Next/PostCSS override.

Commands run after package/UI/docs cleanup:

- `npm run lint:structure`: passed.
- `npm run typecheck`: passed across all five Turbo workspaces.

Commands run after DB test-helper cleanup:

- `npm run lint:repo`: passed.
- `node ./scripts/with-test-env.mjs node -e '<cached-plan helper smoke>'`: passed.
- `npm run test:e2e:smoke`: passed with 6 tests.

Commands run after local hygiene and AgentChatView extraction:

- `npm run clean -- --dry-run`: found `.DS_Store` files before the script change, and no `.DS_Store` files after cleanup.
- `npm run clean`: removed ignored artifacts and `.DS_Store` files.
- `npm run build -w packages/db`: passed, restoring generated DB package output needed by dependent package builds.
- `npm run build -w packages/agent`: passed after DB build.
- `npm run build -w packages/email`: passed.
- `npm run test:unit -w apps/dashboard -- src/components/agent/walkthrough-briefing.unit.test.ts`: passed.
- `npm run lint -w apps/dashboard`: passed.
- `npm run typecheck -w apps/dashboard`: passed.

Commands run after settings parser extraction:

- `npm run clean`: removed `apps/dashboard/.next-dev`, `packages/agent/dist`, and `packages/email/dist`.
- `npm run clean -- --dry-run`: reported no matching paths immediately after cleanup.
- `npm run test:unit -w packages/agent -- src/settings.test.ts src/settings-tier.test.ts`: passed with 23 tests.
- `npm run build -w packages/db`: passed, restoring generated DB package output needed by package-level agent typecheck.
- `npm run typecheck -w packages/agent`: passed after DB build.
- `npm run lint -w packages/agent`: passed.
- `npm run build -w packages/agent`: passed.
- `npm run build -w packages/email`: passed, restoring generated email package output needed by root workspace typecheck.
- `npm run typecheck`: passed across all five Turbo workspaces.
- `npm run clean -- --dry-run`: after verification, reported regenerated ignored Turbo/build outputs.
- Stopped the active repo `npm run dev` / Turbo watch process tree.
- `npm run clean`: removed `apps/dashboard/.next-dev`, `packages/agent/dist`, and `packages/email/dist`.
- `npm run clean -- --dry-run`: passed with no matching paths.

Commands run after dashboard large-file extractions:

- `npm run build -w packages/db`: passed, restoring generated DB package output needed by dashboard typecheck.
- `npm run build -w packages/agent`: passed.
- `npm run build -w packages/email`: passed.
- `npm run typecheck -w apps/dashboard`: passed.
- `npm run lint -w apps/dashboard`: passed.
- `npm run lint:structure`: passed.
- `npm run test:unit -w apps/dashboard -- src/components/agent/walkthrough-briefing.unit.test.ts src/app/dashboard/tickets/_components/conversation/utils/conversationViewUtils.unit.test.ts src/app/dashboard/_components/home/home-sections.unit.test.ts`: passed with 6 tests.
- `npm run clean -- --dry-run`: reported regenerated package build outputs after verification.
- `npm run clean`: removed the regenerated package build outputs.
- `npm run clean -- --dry-run`: passed with no matching paths.

Commands run after final large-file refactors:

- `npm run build -w packages/db`: passed, restoring generated DB package output needed by agent/dashboard typecheck.
- `npm run typecheck -w packages/agent`: passed.
- `npm run test:unit -w packages/agent -- src/run.test.ts src/run-policy.test.ts src/planner.test.ts`: passed with 21 tests.
- `npm run build -w packages/agent`: passed.
- `npm run build -w packages/email`: passed.
- `npm run typecheck -w apps/dashboard`: passed.
- `npm run test:integration -w apps/dashboard -- src/lib/server/home-summary.test.ts`: passed with 3 tests.
- `npm run lint -w packages/agent`: passed.
- `npm run lint -w apps/dashboard`: passed.
- `npm run typecheck`: passed across all five Turbo workspaces.
- `npm run lint:structure`: passed.
- `npm run clean -- --dry-run`: reported regenerated ignored build outputs after verification.
- Stopped the active repo `npm run dev` / Turbo watch process tree.
- `npm run clean`: removed the regenerated ignored outputs.
- `npm run clean -- --dry-run`: passed with no matching paths.
