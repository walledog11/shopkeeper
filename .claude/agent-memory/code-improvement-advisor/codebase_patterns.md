---
name: Codebase Patterns and Known Issues
description: Recurring patterns, anti-patterns, and known issues identified in April 2026 code audit
type: project
---

Comprehensive audit of the Clerk codebase completed 2026-04-17.

**Why:** Full code review to identify security, performance, dead code, and correctness issues before scaling.

**How to apply:** Use as a reference when touching any of the files or patterns listed below.

## Duplicate TOOL_LABELS constant
- `apps/dashboard/src/lib/agent/tools.ts` exports `TOOL_LABELS`
- `apps/dashboard/src/app/dashboard/activity/_components/ActivityFeed.tsx` re-declares an identical local copy
- Fix: remove the local copy and import from tools.ts

## Two conflicting note prefix constants
- `AGENT_NOTE_PREFIX = "__clerk_agent_note__"` in `apps/dashboard/src/lib/constants.ts` — used by thread-tools.ts for `add_internal_note`
- `AGENT_TURN_PREFIX = "__clerk_agent__"` in `apps/dashboard/src/lib/agent/tools.ts` — used for agent run audit notes
- These are intentionally different (notes vs turn logs) but confusingly named. The distinction is real but not obvious.

## OTP verification code stored in org settings JSON
- `/api/phone/send-code` stores `_phoneCode_${userId}` inside `Organization.settings`
- This is a workaround to avoid a DB column, but pollutes the settings blob with temp data
- Security concern: any endpoint that reads org.settings can see unverified codes

## Shopify API version hardcoded as "2024-01"
- Appears in shopify-tools.ts, runner.ts (buildContext), orders/route.ts, products/route.ts, customers/route.ts
- Single constant `API_VERSION = "2024-01"` in shopify-tools.ts but `buildContext` in runner.ts has it inline as a string literal

## N+1 pattern in sms-context updateContext
- `updateContext()` always calls `getContext()` first (a full DB read) before the upsert
- Called on every SMS/WhatsApp message, every plan approval, every digest notification

## Dead/duplicate component files
- `apps/dashboard/src/app/dashboard/agent/ActionLog.tsx` and `apps/dashboard/src/app/dashboard/agent/_components/ActionLog.tsx` — two files for the same component
- `apps/dashboard/src/app/dashboard/agent/AgentChatClient.tsx` and `apps/dashboard/src/app/dashboard/agent/_components/AgentChatClient.tsx` — same pattern

## GATEWAY_URL env var inconsistency
- `apps/dashboard/src/app/api/webhooks/email/route.ts` uses `GATEWAY_URL`
- `apps/dashboard/src/app/api/webhooks/meta/route.ts` uses `GATEWAY_URL`
- CLAUDE.md documents this variable as `GATEWAY_INTERNAL_URL` — mismatch; proxy routes use the wrong env var name

## Missing `externalMessageId` index
- `Message.externalMessageId` is queried on every inbound message for deduplication (`findFirst({ where: { externalMessageId: idempotencyKey } })`)
- No index on this column in schema.prisma — full table scan on every inbound message

## timingSafeEqual buffer length issue in Shopify HMAC callback
- `apps/dashboard/src/app/api/integrations/shopify/callback/route.ts` line 57: `crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac))`
- `digest` is always 64 hex chars, but `hmac` comes from Shopify as a hex string — lengths should match, but no explicit length check before calling timingSafeEqual (throws on mismatch)
