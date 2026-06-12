module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/node:crypto [external] (node:crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:crypto", () => require("node:crypto"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

module.exports = mod;
}),
"[project]/apps/dashboard/src/lib/env/helpers.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "hasEnv",
    ()=>hasEnv,
    "normalizeAbsoluteUrl",
    ()=>normalizeAbsoluteUrl,
    "readEnv",
    ()=>readEnv,
    "requireEnv",
    ()=>requireEnv
]);
function readEnv(name, env = process.env) {
    const value = env[name];
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function hasEnv(name, env = process.env) {
    return readEnv(name, env) !== null;
}
function requireEnv(name, env = process.env) {
    const value = readEnv(name, env);
    if (!value) {
        throw new Error(`[Dashboard] Missing required environment variable: ${name}`);
    }
    return value;
}
function normalizeAbsoluteUrl(name, value = requireEnv(name)) {
    let parsed;
    try {
        parsed = new URL(value);
    } catch  {
        throw new Error(`[Dashboard] ${name} must be a valid absolute URL`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`[Dashboard] ${name} must use http or https`);
    }
    return value.replace(/\/+$/, "");
}
}),
"[project]/apps/dashboard/src/lib/env/index.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getDashboardAppUrl",
    ()=>getDashboardAppUrl,
    "getDashboardOpsAlertConfig",
    ()=>getDashboardOpsAlertConfig,
    "getDashboardRedisEnv",
    ()=>getDashboardRedisEnv,
    "validateDashboardEnv",
    ()=>validateDashboardEnv
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$env$2f$helpers$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/env/helpers.ts [app-route] (ecmascript)");
;
function getDashboardAppUrl() {
    const appUrl = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$env$2f$helpers$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["readEnv"])('APP_URL');
    if (appUrl) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$env$2f$helpers$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["normalizeAbsoluteUrl"])('APP_URL', appUrl);
    }
    if ("TURBOPACK compile-time truthy", 1) {
        const publicAppUrl = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$env$2f$helpers$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["readEnv"])('NEXT_PUBLIC_APP_URL');
        if (publicAppUrl) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$env$2f$helpers$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["normalizeAbsoluteUrl"])('NEXT_PUBLIC_APP_URL', publicAppUrl);
        }
        return 'http://localhost:3000';
    }
    //TURBOPACK unreachable
    ;
}
function validateDashboardEnv() {
    const required = [
        'DATABASE_URL',
        'CLERK_SECRET_KEY',
        'ANTHROPIC_API_KEY',
        'INTERNAL_API_SECRET'
    ];
    const missing = required.filter((name)=>!(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$env$2f$helpers$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["hasEnv"])(name));
    if (missing.length > 0) {
        throw new Error(`[Dashboard] Missing required environment variables: ${missing.join(', ')}`);
    }
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
    if (redisUrl && !redisToken || !redisUrl && redisToken) {
        throw new Error('[Dashboard] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set together');
    }
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    const dbUrl = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$env$2f$helpers$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireEnv"])('DATABASE_URL');
    if (!dbUrl.includes('pgbouncer=true')) {
        console.warn('[Dashboard] DATABASE_URL is missing pgbouncer=true — add it to avoid connection exhaustion in production');
    }
    if (!dbUrl.includes('connection_limit=')) {
        console.warn('[Dashboard] DATABASE_URL is missing connection_limit — add it (e.g. connection_limit=1) to avoid connection exhaustion in production');
    }
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
}
function getDashboardRedisEnv() {
    const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
    if (!url || !token) {
        throw new Error('[Dashboard] Redis is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
    }
    return {
        url,
        token
    };
}
function parsePositiveIntEnv(name, fallback) {
    const rawValue = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$env$2f$helpers$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["readEnv"])(name);
    if (!rawValue) {
        return fallback;
    }
    const parsedValue = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
        throw new Error(`[Dashboard] ${name} must be a positive integer`);
    }
    return parsedValue;
}
function parseBooleanEnv(name, fallback) {
    const rawValue = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$env$2f$helpers$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["readEnv"])(name);
    if (!rawValue) {
        return fallback;
    }
    const normalizedValue = rawValue.toLowerCase();
    if ([
        "1",
        "true",
        "yes",
        "on"
    ].includes(normalizedValue)) {
        return true;
    }
    if ([
        "0",
        "false",
        "no",
        "off"
    ].includes(normalizedValue)) {
        return false;
    }
    throw new Error(`[Dashboard] ${name} must be a boolean`);
}
function getDashboardOpsAlertConfig() {
    return {
        enabled: parseBooleanEnv("OPS_ALERTS_ENABLED", true),
        windowSecs: parsePositiveIntEnv("OPS_ALERT_WINDOW_SECS", 300),
        queueFailedThreshold: parsePositiveIntEnv("QUEUE_ALERT_FAILED_THRESHOLD", 10),
        queueWaitingThreshold: parsePositiveIntEnv("QUEUE_ALERT_WAITING_THRESHOLD", 100),
        queueActiveStuckMs: parsePositiveIntEnv("QUEUE_ALERT_ACTIVE_STUCK_MS", 900_000),
        webhookSignatureThreshold: parsePositiveIntEnv("WEBHOOK_SIGNATURE_ALERT_THRESHOLD", 5),
        providerSendThreshold: parsePositiveIntEnv("PROVIDER_SEND_ALERT_THRESHOLD", 3),
        agentFailureThreshold: parsePositiveIntEnv("AGENT_FAILURE_ALERT_THRESHOLD", 3)
    };
}
}),
"[project]/apps/dashboard/src/lib/server/redis.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getRedis",
    ()=>getRedis
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$upstash$2f$redis$2f$nodejs$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/@upstash/redis/nodejs.mjs [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$env$2f$index$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/env/index.ts [app-route] (ecmascript)");
;
;
let redis = null;
function getRedis() {
    if (!redis) {
        const { url, token } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$env$2f$index$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getDashboardRedisEnv"])();
        redis = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$upstash$2f$redis$2f$nodejs$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["Redis"]({
            url,
            token
        });
    }
    return redis;
}
}),
"[project]/apps/dashboard/src/app/api/threads/[id]/presence/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DELETE",
    ()=>DELETE,
    "PUT",
    ()=>PUT
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$nextjs$2f$dist$2f$esm$2f$app$2d$router$2f$server$2f$auth$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@clerk/nextjs/dist/esm/app-router/server/auth.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$redis$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/server/redis.ts [app-route] (ecmascript)");
;
;
;
const PRESENCE_TTL = 20; // seconds — heartbeat must arrive within this window
function presenceKey(orgId, threadId) {
    return `presence:${orgId}:${threadId}`;
}
async function PUT(_req, { params }) {
    const { userId, orgId } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$nextjs$2f$dist$2f$esm$2f$app$2d$router$2f$server$2f$auth$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["auth"])();
    if (!userId || !orgId) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: 'Unauthorized'
    }, {
        status: 401
    });
    const { id: threadId } = await params;
    const now = Date.now();
    const cutoff = now - PRESENCE_TTL * 1000;
    try {
        const client = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$redis$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getRedis"])();
        const key = presenceKey(orgId, threadId);
        await client.zadd(key, {
            gt: true
        }, {
            score: now,
            member: userId
        });
        await client.expire(key, PRESENCE_TTL * 4);
        const active = await client.zrange(key, cutoff, '+inf', {
            byScore: true
        });
        const count = active.filter((uid)=>uid !== userId).length;
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            count
        });
    } catch  {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            count: 0
        });
    }
}
async function DELETE(_req, { params }) {
    const { userId, orgId } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$nextjs$2f$dist$2f$esm$2f$app$2d$router$2f$server$2f$auth$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["auth"])();
    if (!userId || !orgId) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: 'Unauthorized'
    }, {
        status: 401
    });
    const { id: threadId } = await params;
    try {
        const client = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$redis$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getRedis"])();
        await client.zrem(presenceKey(orgId, threadId), userId);
    } catch  {}
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        ok: true
    });
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__0-2b_3-._.js.map