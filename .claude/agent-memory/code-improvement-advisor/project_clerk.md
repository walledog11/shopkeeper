---
name: Clerk Project Overview
description: SaaS helpdesk for Shopify merchants — stack, architecture, recurring anti-patterns observed in code reviews
type: project
---

Clerk is a Next.js 15 (dashboard) + Express/BullMQ (gateway) + Prisma/Neon (packages/db) SaaS helpdesk.

**Why:** Shopify merchants need AI-first support tooling that integrates directly with Shopify orders/customers.

**Recurring anti-patterns observed across the codebase:**
- Hardcoded API version strings (`'2024-01'`) duplicated in multiple files instead of using the exported `SHOPIFY_API_VERSION` constant from `shopify-tools.ts`.
- Missing rate limiting on write endpoints (PATCH/POST) that touch expensive external APIs.
- Unchecked `approvedToolCalls` input — validated in `/api/agent/route.ts` but NOT in `/api/agent/internal/route.ts`.
- `getOrderByName` returns items without `variant_id` (only string summaries), breaking the agent's ability to remove items.
- `dispatchMessage` in `thread-tools.ts` (sendReply) does NOT handle the `shopify` channel type, silently returning an error for Shopify threads.
- `search/route.ts` raw SQL touches `messages` without scoping to `organizationId` — relies on join but no direct filter.
- Playbook PATCH does not validate `trigger.type` (only POST does).
- No `Content-Disposition` on CSV audit log export when attachment filename contains user-controlled `orgId`.

**How to apply:** When reviewing agent, webhook, or billing code, flag gaps in these specific areas first.
