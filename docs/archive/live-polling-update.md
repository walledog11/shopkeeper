# Live inbox — replace polling with gateway SSE + Redis pub/sub

**Goal:** the dashboard inbox updates the instant a customer message arrives, instead of on a 3–15s poll. The gateway is already a long-running process (`server` role holds `app.listen` + public ingress; `worker` role processes messages), so it can hold SSE connections cheaply and the publish/hold split is bridged by Redis pub/sub.

**Cost:** no new infrastructure. Pub/sub rides the existing `REDIS_URL` instance, connections are held on the already-on `server` process, and auth reuses `INTERNAL_API_SECRET`. Steady-state load on Neon, Upstash, and Vercel *drops* versus polling, because we query only on connect + on real change instead of every few seconds. Avoid the two cost traps: SSE held by Vercel functions (compute billed for connection lifetime) and Postgres `LISTEN/NOTIFY` (pins a Neon connection open, defeats autosuspend).

## Status — Phases 1 & 2 (mutation points) implemented (behind flags, off by default)

Gateway: `realtime/publish.ts`, `realtime/token.ts`, `realtime/sse.ts` (+ subscriber in `clients/redis-client.ts`, mount in `index.ts`, publish in `message-handlers/inbound-persistence.ts`). Dashboard: `api/realtime/token/route.ts`, `lib/realtime/{config,token}.ts`, `components/realtime/RealtimeProvider.tsx` (mounted in the shell layout), with polling intervals raised to a 60s safety net only when realtime is enabled. Tests: `gateway/.../token.test.ts`, `dashboard/.../token.test.ts` (wire-format contract). Typecheck + lint clean; message-handler suite green.

**Phase 2 mutation points done:** `publishThreadEvent` now also fires from `message-handlers/generate-thread-plan.ts` (after a fresh plan is cached), `message-handlers/agent-thread-sink.ts` (every state-changing sink op — send_reply/send_email on success, note/status/tag/escalate/ask_operator — which also covers auto-execution), and `message-handlers/intelligence.ts` (after summary/tag write). All best-effort/try-catch; a Redis hiccup never breaks ingestion, planning, or a tool call. Typecheck + lint clean; `agent-thread-sink.unit`, `generate-thread-plan`, `ai-summary-flow` suites green.

**To enable:** set `GATEWAY_REALTIME_ENABLED=true` (gateway) and `NEXT_PUBLIC_GATEWAY_EVENTS_URL=<public gateway URL>` (dashboard). With either unset, the endpoint is absent and the dashboard keeps its original polling cadence. The only remaining Phase 2 item is the optional cross-tab publish endpoint (below); Phase 3 is not yet built.

## Core design principle: events are invalidation signals, not data

The SSE channel never carries thread/message content — only a tiny { orgId, threadId } "something changed" ping. The browser still fetches real data
through your existing authenticated Next routes via SWR mutate(). This means: no new data contract, no sensitive payloads over the wire, all existing authz
on /api/threads is reused, and the event stays a few bytes. This is the single most important decision and it keeps the whole thing cheap and safe.

---
## Phase 1 — Live inbox (the actual win: inbound messages appear instantly)

Gateway: publisher

apps/gateway/src/clients/redis-client.ts — add a dedicated subscriber connection (ioredis can't run normal commands on a subscribed client) and register it
in closeGatewayRedisConnections(). The publisher reuses the existing getGatewayRedis().

getGatewayRedisSubscriber(): IORedis   // dedicated, for SUBSCRIBE only

apps/gateway/src/realtime/publish.ts (new) — one helper:
publishThreadEvent(orgId: string, threadId: string): Promise<void>
// getGatewayRedis().publish('realtime:thread', JSON.stringify({ orgId, threadId }))
Single global channel + in-process filtering by orgId (avoids dynamic SUBSCRIBE/UNSUBSCRIBE churn as clients come and go; trivial at your volume).

Call it after the DB write at the one high-value point for Phase 1:
- message-handlers/inbound-persistence.ts — after a customer message is persisted (new ticket / new inbound message). This is what makes the inbox feel
live.

Gateway: SSE endpoint (server role)

apps/gateway/src/realtime/sse.ts (new):
- In-memory registry Map<orgId, Set<Response>>.
- On the subscriber's message, parse {orgId}, write the event to each Response in that org's set.
- A mountRealtime(app) that registers GET /events, called from startGatewayServer() in apps/gateway/src/index.ts (alongside /webhooks — same process, same
public ingress).
- GET /events: verify token (below) → set SSE headers + CORS for the dashboard origin (getGatewayDashboardUrl()) → register the response → req.on('close')
removes it → setInterval heartbeat comment (:ping\n\n) every ~25s so Railway's proxy doesn't drop idle connections.

Auth (token, not header — EventSource can't set headers)

apps/gateway/src/realtime/token.ts (new) — verifyRealtimeToken(token): HMAC-SHA256 over {orgId, exp} using INTERNAL_API_SECRET (already shared by both apps
— no new secret). Returns orgId or rejects on bad sig / expiry.

apps/dashboard/src/app/api/realtime/token/route.ts (new) — wrapped in the existing org-route auth; mints the same HMAC token with a short TTL (~5 min)
scoped to the caller's organizationId. Token grants only a subscription (no data), so URL exposure is low-risk.

Dashboard: client

apps/dashboard/src/components/realtime/RealtimeProvider.tsx (new) — mount once in the shell layout (app/dashboard/(shell)/layout.tsx):
- Fetch token → open one EventSource to NEXT_PUBLIC_GATEWAY_EVENTS_URL/events?token=….
- On event → useSWRConfig().mutate(key => typeof key === 'string' && key.startsWith('/api/threads')) to revalidate all thread lists + counts.
- Reconnect with backoff + token refresh; on (re)connect and on tab re-focus, do a blanket revalidate to catch anything missed while disconnected.

Lower the polling to a safety net (SSE is now primary; polls just guarantee convergence if the stream drops):
- usePaginatedThreads.ts baseInterval 15s → 60s
- useThreads.ts count 15s → 60s
- useTicketTabCounts.ts already 60s ✓
- summary-contract.ts 30s → 60s

Env

- Dashboard: NEXT_PUBLIC_GATEWAY_EVENTS_URL (public gateway base — same host webhooks already use).
- Gateway: optional GATEWAY_REALTIME_ENABLED flag to gate the endpoint.
- No new secret (reuses INTERNAL_API_SECRET), no new Redis (reuses REDIS_URL).

---
## Phase 2 — Completeness

publishThreadEvent now fires at the remaining gateway mutation points so every state change pushes:
- ✅ message-handlers/generate-thread-plan.ts (plan cached → "Needs you" card appears) — after the fresh `cachedPlan` write; warm-cache hits don't re-publish
- ✅ message-handlers/agent-thread-sink.ts (agent reply / status change) — send_reply/send_email publish on non-error; note/status/tag/escalate/ask_operator publish after the DB write; covers auto-execution since it runs through this sink
- ✅ message-handlers/intelligence.ts (summary/tag update) — after the aiTitle/aiSummary/tag write; skipSummary + spend-cap early returns don't publish

Remaining (optional) — cross-tab for dashboard-originated mutations (merchant reply/resolve from another tab/teammate): add a thin authed POST /internal/events/publish on the
gateway and have the relevant Next routes call it (they already hold INTERNAL_API_SECRET + GATEWAY_INTERNAL_URL). The originating tab's
optimistic update + the 60s fallback already cover the solo-merchant case; this is for teams with multiple sessions.

## Phase 3 — Polish (optional)

Presence ("Alex is viewing"), a small connection-status dot, typing indicators — all ride the same channel + registry.

---
Testing

- Gateway: verifyRealtimeToken (valid / expired / tampered); pub/sub round-trip against real Redis (per your "real deps in tests" norm); registry
add/remove on connect/close. Use the [live Telegram/iMessage verification recipes] for a real inbound round-trip with two browser tabs open.
- Dashboard: token route returns a valid signed token for an authed org and 401s otherwise; provider maps an event → correct mutate keys.

Rollout

Behind GATEWAY_REALTIME_ENABLED. Off → endpoint absent, dashboard provider no-ops, polling intervals stay. Ship Phase 1, watch it, then flip on the rest.
Reversible at any point by toggling the flag and reverting intervals.

Gotchas baked in

- Heartbeat pings — without them Railway's proxy kills idle SSE connections.
- Horizontal scale: every gateway server instance subscribes to the global channel and pushes to its own local registry — fan-out is correct across
instances, no sticky sessions needed.
- No Postgres LISTEN/NOTIFY — would pin a Neon connection open and defeat autosuspend. Redis pub/sub only.
- Subscriber needs its own connection — never share with the command/BullMQ clients.