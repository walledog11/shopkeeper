module.exports = [
"[project]/apps/dashboard/src/lib/env/helpers.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/apps/dashboard/src/lib/env/index.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$env$2f$helpers$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/env/helpers.ts [instrumentation] (ecmascript)");
;
function getDashboardAppUrl() {
    const appUrl = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$env$2f$helpers$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["readEnv"])('APP_URL');
    if (appUrl) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$env$2f$helpers$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["normalizeAbsoluteUrl"])('APP_URL', appUrl);
    }
    if ("TURBOPACK compile-time truthy", 1) {
        const publicAppUrl = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$env$2f$helpers$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["readEnv"])('NEXT_PUBLIC_APP_URL');
        if (publicAppUrl) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$env$2f$helpers$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["normalizeAbsoluteUrl"])('NEXT_PUBLIC_APP_URL', publicAppUrl);
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
    const missing = required.filter((name)=>!(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$env$2f$helpers$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["hasEnv"])(name));
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
    const dbUrl = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$env$2f$helpers$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["requireEnv"])('DATABASE_URL');
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
    const rawValue = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$env$2f$helpers$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["readEnv"])(name);
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
    const rawValue = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$env$2f$helpers$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["readEnv"])(name);
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
"[project]/apps/dashboard/src/instrumentation.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "register",
    ()=>register
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$env$2f$index$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/env/index.ts [instrumentation] (ecmascript)");
;
async function register() {
    if ("TURBOPACK compile-time truthy", 1) {
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$env$2f$index$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["validateDashboardEnv"])();
        const dns = await __turbopack_context__.A("[externals]/dns [external] (dns, cjs, async loader)");
        dns.setServers([
            '8.8.8.8',
            '1.1.1.1'
        ]);
    }
}
}),
];

//# sourceMappingURL=apps_dashboard_src_0cldfa6._.js.map