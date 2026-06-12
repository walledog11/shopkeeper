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
"[externals]/node:module [external] (node:module, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:module", () => require("node:module"));

module.exports = mod;
}),
"[externals]/node:crypto [external] (node:crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:crypto", () => require("node:crypto"));

module.exports = mod;
}),
"[project]/packages/db/dist/crypto.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "decryptToken",
    ()=>decryptToken,
    "encryptToken",
    ()=>encryptToken,
    "isEncrypted",
    ()=>isEncrypted,
    "resetCryptoKeyCacheForTests",
    ()=>resetCryptoKeyCacheForTests
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:crypto [external] (node:crypto, cjs)");
;
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const VERSION_PREFIX = 'enc:v1:';
const DEV_FALLBACK_KEY_SOURCE = 'clerk-dev-only-token-encryption-key-do-not-use-in-prod';
let cachedKey = null;
let warnedMissing = false;
function deriveDevFallbackKey() {
    const buf = Buffer.alloc(32);
    for(let i = 0; i < buf.length; i++){
        buf[i] = DEV_FALLBACK_KEY_SOURCE.charCodeAt(i % DEV_FALLBACK_KEY_SOURCE.length);
    }
    return buf;
}
function parseKey(raw) {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
    const base64 = Buffer.from(raw, 'base64');
    if (base64.length === 32) return base64;
    return Buffer.from(raw, 'utf8');
}
function loadKey() {
    if (cachedKey) return cachedKey;
    const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim();
    if (raw) {
        const key = parseKey(raw);
        if (key.length !== 32) {
            throw new Error('[crypto] TOKEN_ENCRYPTION_KEY must decode to 32 bytes (hex64, base64, or 32 raw chars)');
        }
        cachedKey = key;
        return cachedKey;
    }
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    if (!warnedMissing) {
        warnedMissing = true;
        console.warn('[crypto] TOKEN_ENCRYPTION_KEY not set — using insecure dev fallback. Set this env var before production.');
    }
    cachedKey = deriveDevFallbackKey();
    return cachedKey;
}
function isEncrypted(value) {
    return typeof value === 'string' && value.startsWith(VERSION_PREFIX);
}
function encryptToken(plain) {
    if (plain == null) return null;
    if (typeof plain !== 'string' || plain === '') return null;
    if (isEncrypted(plain)) return plain;
    const key = loadKey();
    const iv = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["randomBytes"])(IV_LENGTH);
    const cipher = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["createCipheriv"])(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([
        cipher.update(plain, 'utf8'),
        cipher.final()
    ]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([
        ciphertext,
        tag
    ]).toString('base64');
    return `${VERSION_PREFIX}${iv.toString('base64')}:${payload}`;
}
function decryptToken(stored) {
    if (stored == null) return null;
    if (typeof stored !== 'string' || stored === '') return null;
    if (!isEncrypted(stored)) return stored;
    const parts = stored.slice(VERSION_PREFIX.length).split(':');
    if (parts.length !== 2) return null;
    try {
        const iv = Buffer.from(parts[0], 'base64');
        const buf = Buffer.from(parts[1], 'base64');
        if (iv.length !== IV_LENGTH || buf.length < TAG_LENGTH) return null;
        const tag = buf.subarray(buf.length - TAG_LENGTH);
        const data = buf.subarray(0, buf.length - TAG_LENGTH);
        const decipher = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["createDecipheriv"])(ALGORITHM, loadKey(), iv);
        decipher.setAuthTag(tag);
        const plain = Buffer.concat([
            decipher.update(data),
            decipher.final()
        ]);
        return plain.toString('utf8');
    } catch  {
        return null;
    }
}
function resetCryptoKeyCacheForTests() {
    cachedKey = null;
    warnedMissing = false;
}
}),
"[project]/packages/db/dist/llm-spend.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// Per-org daily LLM spend backstop. Pricing and shared types live here; the
// Postgres-backed counter that both apps read/write is in spend-store.ts.
// All amounts are tracked in nano-dollars (1 USD = 1_000_000_000) so token
// pricing stays integer-clean and the running total stays a whole number.
__turbopack_context__.s([
    "DEFAULT_DAILY_LLM_SPEND_CAP_USD",
    ()=>DEFAULT_DAILY_LLM_SPEND_CAP_USD,
    "LLM_PRICING",
    ()=>LLM_PRICING,
    "NANO_DOLLARS_PER_USD",
    ()=>NANO_DOLLARS_PER_USD,
    "SpendCapError",
    ()=>SpendCapError,
    "isSpendCapError",
    ()=>isSpendCapError,
    "nanoDollarsToUsd",
    ()=>nanoDollarsToUsd,
    "usageToNanoDollars",
    ()=>usageToNanoDollars,
    "usdToNanoDollars",
    ()=>usdToNanoDollars,
    "utcDayString",
    ()=>utcDayString
]);
const NANO_DOLLARS_PER_USD = 1_000_000_000;
const LLM_PRICING = {
    "claude-haiku-4-5-20251001": {
        inputPerToken: 1000,
        outputPerToken: 5000,
        cacheCreationPerToken: 1250,
        cacheReadPerToken: 100
    },
    "claude-sonnet-4-6": {
        inputPerToken: 3000,
        outputPerToken: 15000,
        cacheCreationPerToken: 3750,
        cacheReadPerToken: 300
    }
};
const FALLBACK_PRICE = {
    inputPerToken: 5000,
    outputPerToken: 25000,
    cacheCreationPerToken: 6250,
    cacheReadPerToken: 500
};
function usageToNanoDollars(usage, model) {
    const price = LLM_PRICING[model] ?? FALLBACK_PRICE;
    return usage.inputTokens * price.inputPerToken + usage.outputTokens * price.outputPerToken + (usage.cacheCreationInputTokens ?? 0) * price.cacheCreationPerToken + (usage.cacheReadInputTokens ?? 0) * price.cacheReadPerToken;
}
function utcDayString(now = new Date()) {
    return now.toISOString().slice(0, 10);
}
const DEFAULT_DAILY_LLM_SPEND_CAP_USD = 20;
function nanoDollarsToUsd(nano) {
    return nano / NANO_DOLLARS_PER_USD;
}
function usdToNanoDollars(usd) {
    return Math.round(usd * NANO_DOLLARS_PER_USD);
}
class SpendCapError extends Error {
    code = "spend_cap_reached";
    currentNanoUsd;
    capNanoUsd;
    constructor(currentNanoUsd, capNanoUsd){
        super(`LLM spend cap reached: $${nanoDollarsToUsd(currentNanoUsd).toFixed(2)} / $${nanoDollarsToUsd(capNanoUsd).toFixed(2)} today`);
        this.name = "SpendCapError";
        this.currentNanoUsd = currentNanoUsd;
        this.capNanoUsd = capNanoUsd;
    }
    get currentUsd() {
        return nanoDollarsToUsd(this.currentNanoUsd);
    }
    get capUsd() {
        return nanoDollarsToUsd(this.capNanoUsd);
    }
}
function isSpendCapError(err) {
    return err instanceof SpendCapError || typeof err === "object" && err !== null && err.code === "spend_cap_reached";
}
}),
"[project]/packages/db/dist/spend-store.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getDailyLlmSpendNano",
    ()=>getDailyLlmSpendNano,
    "recordDailyLlmSpend",
    ()=>recordDailyLlmSpend
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/db/dist/index.js [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$llm$2d$spend$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/db/dist/llm-spend.js [app-route] (ecmascript)");
;
;
async function getDailyLlmSpendNano(orgId, day = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$llm$2d$spend$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["utcDayString"])()) {
    const result = await __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].llmDailySpend.aggregate({
        where: {
            organizationId: orgId,
            day
        },
        _sum: {
            spentNanoUsd: true
        }
    });
    return result._sum.spentNanoUsd ? Number(result._sum.spentNanoUsd) : 0;
}
async function recordDailyLlmSpend(orgId, usage, model, day = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$llm$2d$spend$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["utcDayString"])()) {
    const delta = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$llm$2d$spend$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["usageToNanoDollars"])(usage, model);
    if (delta <= 0) return;
    const deltaBig = BigInt(delta);
    await __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].llmDailySpend.upsert({
        where: {
            organizationId_day_model: {
                organizationId: orgId,
                day,
                model
            }
        },
        create: {
            organizationId: orgId,
            day,
            model,
            spentNanoUsd: deltaBig,
            calls: 1
        },
        update: {
            spentNanoUsd: {
                increment: deltaBig
            },
            calls: {
                increment: 1
            }
        }
    });
}
}),
"[project]/packages/db/dist/refund-spend.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getDailyRefundSpendCents",
    ()=>getDailyRefundSpendCents,
    "incrementDailyRefundSpendCents",
    ()=>incrementDailyRefundSpendCents
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/db/dist/index.js [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$llm$2d$spend$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/db/dist/llm-spend.js [app-route] (ecmascript)");
;
;
async function getDailyRefundSpendCents(orgId, day = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$llm$2d$spend$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["utcDayString"])()) {
    const row = await __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].refundDailySpend.findUnique({
        where: {
            organizationId_day: {
                organizationId: orgId,
                day
            }
        },
        select: {
            spentCents: true
        }
    });
    return row?.spentCents ?? 0;
}
async function incrementDailyRefundSpendCents(orgId, cents, day = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$llm$2d$spend$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["utcDayString"])()) {
    const delta = Math.round(cents);
    if (!Number.isFinite(delta) || delta <= 0) return;
    await __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].refundDailySpend.upsert({
        where: {
            organizationId_day: {
                organizationId: orgId,
                day
            }
        },
        create: {
            organizationId: orgId,
            day,
            spentCents: delta
        },
        update: {
            spentCents: {
                increment: delta
            }
        }
    });
}
}),
"[project]/packages/db/dist/index.js [app-route] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ChannelType",
    ()=>ChannelTypeRuntime,
    "Prisma",
    ()=>PrismaRuntime,
    "SenderType",
    ()=>SenderTypeRuntime,
    "ThreadFilterFeedback",
    ()=>ThreadFilterFeedbackRuntime,
    "ThreadFilterStatus",
    ()=>ThreadFilterStatusRuntime,
    "ThreadStatus",
    ()=>ThreadStatusRuntime,
    "createMessage",
    ()=>createMessage,
    "db",
    ()=>db
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$module__$5b$external$5d$__$28$node$3a$module$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:module [external] (node:module, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$crypto$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/db/dist/crypto.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$spend$2d$store$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/db/dist/spend-store.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$refund$2d$spend$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/db/dist/refund-spend.js [app-route] (ecmascript)");
const __TURBOPACK__import$2e$meta__ = {
    get url () {
        return `file://${__turbopack_context__.P("packages/db/dist/index.js")}`;
    },
    get turbopackHot () {
        return __turbopack_context__.m.hot;
    }
};
;
;
const require = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$module__$5b$external$5d$__$28$node$3a$module$2c$__cjs$29$__["createRequire"])(__TURBOPACK__import$2e$meta__.url);
const prismaClient = __turbopack_context__.r("[externals]/@prisma/client [external] (@prisma/client, cjs, [project]/node_modules/@prisma/client)");
const { PrismaClient, Prisma: PrismaRuntime, SenderType: SenderTypeRuntime, ChannelType: ChannelTypeRuntime, ThreadStatus: ThreadStatusRuntime, ThreadFilterStatus: ThreadFilterStatusRuntime, ThreadFilterFeedback: ThreadFilterFeedbackRuntime } = prismaClient;
const globalForPrisma = globalThis;
const TOKEN_FIELDS = [
    'accessToken',
    'refreshToken'
];
function encryptFieldInput(value) {
    if (value === null) return null;
    if (typeof value === 'string') return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$crypto$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["encryptToken"])(value);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const op = value;
        if ('set' in op) {
            return {
                ...op,
                set: typeof op.set === 'string' ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$crypto$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["encryptToken"])(op.set) : op.set
            };
        }
    }
    return value;
}
function encryptTokenFieldsInPayload(payload) {
    if (!payload) return payload;
    const next = {
        ...payload
    };
    for (const field of TOKEN_FIELDS){
        if (field in next) next[field] = encryptFieldInput(next[field]);
    }
    return next;
}
function transformWriteArgs(operation, args) {
    if (!args || typeof args !== 'object') return args;
    const obj = args;
    if (operation === 'create' || operation === 'update' || operation === 'updateMany') {
        if ('data' in obj) {
            const data = obj.data;
            const nextData = Array.isArray(data) ? data.map((row)=>encryptTokenFieldsInPayload(row)) : encryptTokenFieldsInPayload(data);
            return {
                ...obj,
                data: nextData
            };
        }
    }
    if (operation === 'createMany') {
        if ('data' in obj) {
            const data = obj.data;
            const nextData = Array.isArray(data) ? data.map((row)=>encryptTokenFieldsInPayload(row)) : encryptTokenFieldsInPayload(data);
            return {
                ...obj,
                data: nextData
            };
        }
    }
    if (operation === 'upsert') {
        return {
            ...obj,
            ...obj.create ? {
                create: encryptTokenFieldsInPayload(obj.create)
            } : {},
            ...obj.update ? {
                update: encryptTokenFieldsInPayload(obj.update)
            } : {}
        };
    }
    return args;
}
function decryptIntegrationRow(row) {
    if (!row || typeof row !== 'object') return;
    const obj = row;
    for (const field of TOKEN_FIELDS){
        if (field in obj && typeof obj[field] === 'string') {
            obj[field] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$crypto$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["decryptToken"])(obj[field]);
        }
    }
}
function decryptResultRows(result) {
    if (result == null) return result;
    if (Array.isArray(result)) {
        for (const row of result)decryptIntegrationRow(row);
        return result;
    }
    if (typeof result === 'object') {
        decryptIntegrationRow(result);
    }
    return result;
}
function createClient() {
    const log = ("TURBOPACK compile-time truthy", 1) ? [
        'query',
        'error',
        'warn'
    ] : "TURBOPACK unreachable";
    let base;
    if (process.env.NEON_SERVERLESS_HTTP === 'true' && ("TURBOPACK compile-time value", "development") !== 'test') {
        const { PrismaNeon } = __turbopack_context__.r("[project]/packages/db/node_modules/@prisma/adapter-neon/dist/index.js [app-route] (ecmascript)");
        const adapter = new PrismaNeon({
            connectionString: process.env.DATABASE_URL
        });
        base = new PrismaClient({
            adapter,
            log
        });
    } else {
        base = new PrismaClient({
            log
        });
    }
    return base.$extends({
        query: {
            integration: {
                async $allOperations ({ args, query, operation }) {
                    const nextArgs = transformWriteArgs(operation, args);
                    const result = await query(nextArgs);
                    return decryptResultRows(result);
                }
            }
        }
    });
}
const shouldCacheClient = ("TURBOPACK compile-time value", "development") !== 'production' && ("TURBOPACK compile-time value", "development") !== 'test';
const db = ("TURBOPACK compile-time truthy", 1) ? globalForPrisma.prisma ?? createClient() : "TURBOPACK unreachable";
if ("TURBOPACK compile-time truthy", 1) globalForPrisma.prisma = db;
async function resolveMessageOrganizationId(data) {
    if (data.organizationId) {
        return {
            ...data,
            organizationId: data.organizationId
        };
    }
    const thread = await db.thread.findUnique({
        where: {
            id: data.threadId
        },
        select: {
            organizationId: true
        }
    });
    if (!thread) {
        throw new Error(`Thread not found: ${data.threadId}`);
    }
    return {
        ...data,
        organizationId: thread.organizationId
    };
}
async function createMessage(data, threadPatch) {
    const resolvedData = await resolveMessageOrganizationId(data);
    const isConversation = resolvedData.senderType !== SenderTypeRuntime.note;
    const hasPatch = threadPatch && Object.keys(threadPatch).length > 0;
    if (!isConversation && !hasPatch) {
        return db.message.create({
            data: resolvedData
        });
    }
    return db.$transaction(async (tx)=>{
        const message = await tx.message.create({
            data: resolvedData
        });
        await tx.thread.update({
            where: {
                id: message.threadId
            },
            data: {
                ...threadPatch ?? {},
                ...isConversation ? {
                    lastMessageAt: message.sentAt,
                    lastMessageSenderType: message.senderType
                } : {}
            }
        });
        return message;
    });
}
;
;
;
;
;
;
}),
"[project]/packages/agent/dist/errors.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// Shared HTTP-shaped error classes (Track 4.1 extraction). Pure and Next-free so
// both the dashboard routes and the gateway worker can throw/catch one class
// identity (`instanceof ApiError` works across hosts). The Next-coupled
// `handleApiError` mapper stays in the dashboard (`@/lib/api/errors`).
__turbopack_context__.s([
    "ApiError",
    ()=>ApiError,
    "BadRequestError",
    ()=>BadRequestError,
    "ConflictError",
    ()=>ConflictError,
    "ForbiddenError",
    ()=>ForbiddenError,
    "NoActiveOrganizationError",
    ()=>NoActiveOrganizationError,
    "NotFoundError",
    ()=>NotFoundError,
    "ServiceUnavailableError",
    ()=>ServiceUnavailableError,
    "UnauthorizedError",
    ()=>UnauthorizedError
]);
class ApiError extends Error {
    status;
    details;
    constructor(message, status, details){
        super(message);
        this.status = status;
        this.details = details;
        this.name = 'ApiError';
    }
}
class UnauthorizedError extends ApiError {
    constructor(message = 'Unauthorized'){
        super(message, 401);
        this.name = 'UnauthorizedError';
    }
}
class ForbiddenError extends ApiError {
    constructor(message = 'Forbidden'){
        super(message, 403);
        this.name = 'ForbiddenError';
    }
}
class NoActiveOrganizationError extends ApiError {
    constructor(message = 'No active organization'){
        super(message, 403);
        this.name = 'NoActiveOrganizationError';
    }
}
class NotFoundError extends ApiError {
    constructor(message = 'Not found'){
        super(message, 404);
        this.name = 'NotFoundError';
    }
}
class BadRequestError extends ApiError {
    constructor(message = 'Bad request', details){
        super(message, 400, details);
        this.name = 'BadRequestError';
    }
}
class ConflictError extends ApiError {
    constructor(message = 'Conflict'){
        super(message, 409);
        this.name = 'ConflictError';
    }
}
class ServiceUnavailableError extends ApiError {
    constructor(message = 'Service temporarily unavailable'){
        super(message, 503);
        this.name = 'ServiceUnavailableError';
    }
}
}),
"[project]/packages/agent/dist/logger.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__,
    "installAgentLogger",
    ()=>installAgentLogger,
    "resetAgentLoggerForTests",
    ()=>resetAgentLoggerForTests
]);
function consoleLog(write, obj, msg) {
    if (typeof obj === "string") {
        write(obj);
        return;
    }
    if (msg) {
        write(msg, obj);
        return;
    }
    write(obj);
}
const consoleLogger = {
    warn: (obj, msg)=>consoleLog(console.warn, obj, msg),
    info: (obj, msg)=>consoleLog(console.info, obj, msg),
    error: (obj, msg)=>consoleLog(console.error, obj, msg),
    debug: (obj, msg)=>consoleLog(console.debug, obj, msg)
};
let installedLogger = consoleLogger;
function installAgentLogger(logger) {
    installedLogger = logger;
}
function resetAgentLoggerForTests() {
    installedLogger = consoleLogger;
}
const logger = {
    warn: (obj, msg)=>installedLogger.warn(obj, msg),
    info: (obj, msg)=>installedLogger.info(obj, msg),
    error: (obj, msg)=>installedLogger.error(obj, msg),
    debug: (obj, msg)=>installedLogger.debug(obj, msg)
};
const __TURBOPACK__default__export__ = logger;
}),
"[project]/packages/email/dist/logger.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getEmailLogger",
    ()=>getEmailLogger,
    "installEmailLogger",
    ()=>installEmailLogger
]);
function consoleLog(write, obj, msg) {
    if (typeof obj === 'string') {
        write(obj);
        return;
    }
    if (msg) {
        write(msg, obj);
        return;
    }
    write(obj);
}
const consoleLogger = {
    warn: (obj, msg)=>consoleLog(console.warn, obj, msg),
    info: (obj, msg)=>consoleLog(console.info, obj, msg),
    error: (obj, msg)=>consoleLog(console.error, obj, msg),
    debug: (obj, msg)=>consoleLog(console.debug, obj, msg)
};
let installedLogger = consoleLogger;
function installEmailLogger(logger) {
    installedLogger = logger;
}
function getEmailLogger() {
    return installedLogger;
}
}),
"[project]/packages/agent/dist/observability/index.js [app-route] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
;
}),
"[project]/packages/agent/dist/observability/redaction.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PINO_REDACT_PATHS",
    ()=>PINO_REDACT_PATHS,
    "REDACTED",
    ()=>REDACTED,
    "REDACTED_EMAIL",
    ()=>REDACTED_EMAIL,
    "scrubValue",
    ()=>scrubValue
]);
const REDACTED = '[REDACTED]';
const REDACTED_EMAIL = '[email]';
const PINO_REDACT_PATHS = [
    'accessToken',
    '*.accessToken',
    'access_token',
    '*.access_token',
    'refreshToken',
    '*.refreshToken',
    'refresh_token',
    '*.refresh_token',
    'id_token',
    '*.id_token',
    'client_secret',
    '*.client_secret',
    'authorization',
    'Authorization',
    'cookie',
    'Cookie',
    'password',
    'apiKey',
    'api_key',
    'secret',
    'token',
    'headers.authorization',
    'headers.cookie',
    'req.headers.authorization',
    'req.headers.cookie',
    'request.headers.authorization',
    'request.headers.cookie',
    'integration.accessToken',
    'integration.refreshToken',
    'email',
    'customerEmail',
    'fromEmail',
    'toEmail',
    'body',
    'responseBody',
    'rawBody'
];
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const SENSITIVE_KEY_PATTERN = /(token|secret|password|authorization|cookie|api[_-]?key|email|message|body)/i;
function scrubString(value) {
    return value.replace(EMAIL_PATTERN, REDACTED_EMAIL);
}
function scrubValue(value, key, depth = 0) {
    if (depth > 6) return REDACTED;
    if (value == null) return value;
    if (key && SENSITIVE_KEY_PATTERN.test(key)) {
        return typeof value === 'string' ? REDACTED : value;
    }
    if (typeof value === 'string') return scrubString(value);
    if (Array.isArray(value)) return value.map((v)=>scrubValue(v, key, depth + 1));
    if (typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)){
            out[k] = scrubValue(v, k, depth + 1);
        }
        return out;
    }
    return value;
}
}),
"[project]/apps/dashboard/src/lib/server/logger.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$pino__$5b$external$5d$__$28$pino$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f$pino$29$__ = __turbopack_context__.i("[externals]/pino [external] (pino, cjs, [project]/node_modules/pino)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$logger$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/logger.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$email$2f$dist$2f$logger$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/email/dist/logger.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$observability$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/agent/dist/observability/index.js [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$observability$2f$redaction$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/observability/redaction.js [app-route] (ecmascript)");
;
;
;
;
const globalForLogger = globalThis;
function createLogger() {
    return (0, __TURBOPACK__imported__module__$5b$externals$5d2f$pino__$5b$external$5d$__$28$pino$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f$pino$29$__["default"])({
        level: process.env.LOG_LEVEL ?? 'info',
        redact: {
            paths: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$observability$2f$redaction$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["PINO_REDACT_PATHS"],
            censor: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$observability$2f$redaction$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["REDACTED"]
        }
    });
}
const logger = globalForLogger.shopkeeperLogger ?? createLogger();
globalForLogger.shopkeeperLogger = logger;
(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$logger$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["installAgentLogger"])(logger);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$email$2f$dist$2f$logger$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["installEmailLogger"])(logger);
const __TURBOPACK__default__export__ = logger;
}),
"[project]/apps/dashboard/src/lib/api/errors.ts [app-route] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "handleApiError",
    ()=>handleApiError
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/db/dist/index.js [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$llm$2d$spend$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/db/dist/llm-spend.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$errors$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/errors.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/server/logger.ts [app-route] (ecmascript)");
;
;
;
;
;
function handleApiError(error, context, message) {
    if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$llm$2d$spend$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["isSpendCapError"])(error)) {
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].warn({
            context
        }, '[api] spend cap reached');
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'AI spend cap reached for today. Increase the daily limit in Settings or wait until midnight UTC.',
            code: 'spend_cap_reached',
            currentUsd: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$llm$2d$spend$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["nanoDollarsToUsd"])(error.currentNanoUsd),
            capUsd: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$llm$2d$spend$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["nanoDollarsToUsd"])(error.capNanoUsd)
        }, {
            status: 429
        });
    }
    if (error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$errors$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["ApiError"]) {
        if (error.status >= 500) {
            __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].error({
                err: error
            }, `[${context}]`);
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: error.message,
            ...error.details ? {
                details: error.details
            } : {}
        }, {
            status: error.status
        });
    }
    if (error instanceof Error && error.message === 'Unauthenticated') {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Unauthorized'
        }, {
            status: 401
        });
    }
    __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].error({
        err: error
    }, `[${context}]`);
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: message
    }, {
        status: 500
    });
}
}),
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/node:async_hooks [external] (node:async_hooks, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:async_hooks", () => require("node:async_hooks"));

module.exports = mod;
}),
"[project]/apps/dashboard/src/lib/e2e-auth.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getE2EAuthIdentity",
    ()=>getE2EAuthIdentity,
    "isE2EAuthBypassEnabled",
    ()=>isE2EAuthBypassEnabled
]);
function isE2EAuthBypassEnabled(env = process.env) {
    return env.NODE_ENV === 'test' && env.E2E_AUTH_BYPASS === 'true';
}
function getE2EAuthIdentity(env = process.env) {
    if (!isE2EAuthBypassEnabled(env)) {
        return null;
    }
    return {
        orgId: env.E2E_CLERK_ORG_ID || 'org_e2e_test',
        orgName: env.E2E_TEST_ORG_NAME || 'E2E Test Store',
        userId: env.E2E_CLERK_USER_ID || 'user_e2e_test'
    };
}
}),
"[project]/apps/dashboard/src/lib/server/e2e-org.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getE2EBypassOrg",
    ()=>getE2EBypassOrg
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/db/dist/index.js [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$e2e$2d$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/e2e-auth.ts [app-route] (ecmascript)");
;
;
async function getE2EBypassOrg() {
    const identity = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$e2e$2d$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getE2EAuthIdentity"])();
    if (!identity) {
        return null;
    }
    const existing = await __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].organization.findUnique({
        where: {
            clerkOrgId: identity.orgId
        }
    });
    if (existing) {
        return existing;
    }
    try {
        return await __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].organization.create({
            data: {
                clerkOrgId: identity.orgId,
                name: identity.orgName,
                settings: {
                    autoPlanOnOpen: false,
                    spamFilterEnabled: false
                }
            }
        });
    } catch (err) {
        if (err.code !== 'P2002') throw err;
        return __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].organization.findUniqueOrThrow({
            where: {
                clerkOrgId: identity.orgId
            }
        });
    }
}
}),
"[project]/apps/dashboard/src/lib/server/org.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getOrCreateOrg",
    ()=>getOrCreateOrg
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/db/dist/index.js [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$nextjs$2f$dist$2f$esm$2f$app$2d$router$2f$server$2f$auth$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@clerk/nextjs/dist/esm/app-router/server/auth.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$nextjs$2f$dist$2f$esm$2f$server$2f$clerkClient$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@clerk/nextjs/dist/esm/server/clerkClient.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$errors$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/errors.ts [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$errors$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/errors.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$e2e$2d$org$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/server/e2e-org.ts [app-route] (ecmascript)");
;
;
;
;
;
const USE_CASE_PHRASES = {
    organize: 'organize support tickets',
    automate: 'automate responses to common questions',
    team: 'collaborate on a team inbox',
    analyze: 'track response times and customer satisfaction'
};
const TEAM_SIZE_PHRASES = {
    solo: 'Solo merchant',
    small: 'Small team (2–10 people)',
    mid: 'Mid-sized team (11–50 people)',
    large: 'Larger team (51+ people)'
};
function composeAiContext(useCases, teamSize) {
    const cases = Array.isArray(useCases) ? useCases.filter((c)=>typeof c === 'string') : [];
    const team = typeof teamSize === 'string' ? teamSize : null;
    const teamPhrase = team && TEAM_SIZE_PHRASES[team] ? TEAM_SIZE_PHRASES[team] : null;
    const casePhrases = cases.flatMap((c)=>USE_CASE_PHRASES[c] ? [
            USE_CASE_PHRASES[c]
        ] : []);
    if (!teamPhrase && casePhrases.length === 0) return '';
    const subject = teamPhrase ?? 'Team';
    if (casePhrases.length === 0) return `${subject} using Shopkeeper for customer support.`;
    const list = casePhrases.length === 1 ? casePhrases[0] : casePhrases.length === 2 ? `${casePhrases[0]} and ${casePhrases[1]}` : `${casePhrases.slice(0, -1).join(', ')}, and ${casePhrases[casePhrases.length - 1]}`;
    return `${subject} using Shopkeeper to ${list}.`;
}
const getOrCreateOrg = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["cache"])(async ()=>{
    const e2eOrg = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$e2e$2d$org$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getE2EBypassOrg"])();
    if (e2eOrg) return e2eOrg;
    const { userId, orgId } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$nextjs$2f$dist$2f$esm$2f$app$2d$router$2f$server$2f$auth$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["auth"])();
    if (!userId) throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$errors$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["UnauthorizedError"]();
    if (!orgId) throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$errors$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NoActiveOrganizationError"]();
    const existing = await __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].organization.findUnique({
        where: {
            clerkOrgId: orgId
        }
    });
    if (existing) return existing;
    // First time this Clerk org is seen — provision it in our DB
    const client = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$nextjs$2f$dist$2f$esm$2f$server$2f$clerkClient$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["clerkClient"])();
    const [clerkOrg, clerkUser] = await Promise.all([
        client.organizations.getOrganization({
            organizationId: orgId
        }),
        // Welcome metadata is best-effort; never block org creation on it.
        client.users.getUser(userId).catch(()=>null)
    ]);
    const meta = clerkUser?.unsafeMetadata ?? {};
    const aiContext = composeAiContext(meta.useCases, meta.teamSize);
    const settings = aiContext ? {
        aiContext
    } : {};
    try {
        return await __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].organization.create({
            data: {
                clerkOrgId: orgId,
                name: clerkOrg.name,
                settings: JSON.parse(JSON.stringify(settings))
            }
        });
    } catch (err) {
        if (err.code !== 'P2002') throw err;
        return __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].organization.findUniqueOrThrow({
            where: {
                clerkOrgId: orgId
            }
        });
    }
});
}),
"[project]/apps/dashboard/src/lib/billing/write-gate.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "assertBillingWriteAllowed",
    ()=>assertBillingWriteAllowed,
    "assertBillingWriteAllowedForOrgId",
    ()=>assertBillingWriteAllowedForOrgId
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/db/dist/index.js [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$errors$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/errors.ts [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$errors$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/errors.js [app-route] (ecmascript)");
;
;
const BLOCKED_WRITE_STATUSES = new Set([
    'past_due',
    'canceled'
]);
class BillingWriteBlockedError extends __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$errors$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["ApiError"] {
    constructor(status){
        super(`Billing status ${status} blocks write actions. Update billing to continue.`, 402);
        this.name = 'BillingWriteBlockedError';
    }
}
function isBillingWriteBlocked(status) {
    return typeof status === 'string' && BLOCKED_WRITE_STATUSES.has(status);
}
function assertBillingWriteAllowed(org) {
    if (isBillingWriteBlocked(org.stripeStatus)) {
        throw new BillingWriteBlockedError(org.stripeStatus);
    }
}
async function assertBillingWriteAllowedForOrgId(orgId) {
    const org = await __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].organization.findUnique({
        where: {
            id: orgId
        },
        select: {
            stripeStatus: true
        }
    });
    if (!org) {
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$errors$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NotFoundError"]('Organization not found');
    }
    assertBillingWriteAllowed(org);
}
}),
"[externals]/events [external] (events, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("events", () => require("events"));

module.exports = mod;
}),
"[externals]/assert [external] (assert, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("assert", () => require("assert"));

module.exports = mod;
}),
"[externals]/util [external] (util, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("util", () => require("util"));

module.exports = mod;
}),
"[externals]/fs [external] (fs, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("fs", () => require("fs"));

module.exports = mod;
}),
"[externals]/path [external] (path, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("path", () => require("path"));

module.exports = mod;
}),
"[externals]/url [external] (url, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("url", () => require("url"));

module.exports = mod;
}),
"[externals]/tty [external] (tty, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("tty", () => require("tty"));

module.exports = mod;
}),
"[externals]/os [external] (os, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("os", () => require("os"));

module.exports = mod;
}),
"[externals]/stream [external] (stream, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("stream", () => require("stream"));

module.exports = mod;
}),
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("crypto", () => require("crypto"));

module.exports = mod;
}),
"[externals]/dns [external] (dns, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("dns", () => require("dns"));

module.exports = mod;
}),
"[externals]/net [external] (net, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("net", () => require("net"));

module.exports = mod;
}),
"[externals]/tls [external] (tls, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("tls", () => require("tls"));

module.exports = mod;
}),
"[externals]/buffer [external] (buffer, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("buffer", () => require("buffer"));

module.exports = mod;
}),
"[externals]/string_decoder [external] (string_decoder, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("string_decoder", () => require("string_decoder"));

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
"[project]/apps/dashboard/src/lib/server/rate-limit.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "isE2ERateLimitBypassEnabled",
    ()=>isE2ERateLimitBypassEnabled,
    "isE2ERateLimitForceEnabled",
    ()=>isE2ERateLimitForceEnabled,
    "rateLimit",
    ()=>rateLimit,
    "tooManyRequests",
    ()=>tooManyRequests
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$ioredis$2f$built$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/ioredis/built/index.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$redis$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/server/redis.ts [app-route] (ecmascript)");
;
;
;
let e2eRedis = null;
async function rateLimit(key, limit = 10, windowSecs = 60, options = {}) {
    const now = Math.floor(Date.now() / 1000);
    const windowStart = Math.floor(now / windowSecs);
    const windowKey = `rl:${key}:${windowStart}`;
    const reset = (windowStart + 1) * windowSecs;
    if (isE2ERateLimitBypassEnabled(process.env, options)) {
        return {
            success: true,
            remaining: limit,
            reset
        };
    }
    try {
        const client = getRateLimitClient(options);
        const count = await client.incr(windowKey);
        if (count === 1) {
            // Set expiry only on first increment so the key is cleaned up automatically
            await client.expire(windowKey, windowSecs);
        }
        return {
            success: count <= limit,
            remaining: Math.max(0, limit - count),
            reset
        };
    } catch  {
        // Redis unavailable — fail closed in production to prevent rate-limit bypass
        if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
        ;
        return {
            success: true,
            remaining: limit,
            reset
        };
    }
}
function getRateLimitClient(options) {
    if (isE2ERateLimitForceEnabled(process.env, options)) {
        return getE2ERedis();
    }
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$redis$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getRedis"])();
}
function getE2ERedis() {
    if (!e2eRedis) {
        const redisUrl = process.env.REDIS_URL;
        if (!redisUrl) {
            throw new Error('REDIS_URL is required for E2E rate-limit enforcement');
        }
        e2eRedis = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$ioredis$2f$built$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["Redis"](redisUrl);
        e2eRedis.on('error', ()=>undefined);
    }
    return e2eRedis;
}
function isE2ERateLimitBypassEnabled(env = process.env, options = {}) {
    return readEnv(env, 'NODE_ENV') !== 'production' && readEnv(env, 'E2E_TEST_RUN') === 'true' && !isE2ERateLimitForceEnabled(env, options);
}
function isE2ERateLimitForceEnabled(env = process.env, options = {}) {
    return readEnv(env, 'NODE_ENV') === 'test' && readEnv(env, 'E2E_TEST_RUN') === 'true' && readEnv(env, 'E2E_RATE_LIMIT_TEST_MODE') === 'force-header' && options.forceForE2E === true;
}
function readEnv(env, name) {
    return env[name];
}
function tooManyRequests(reset) {
    const retryAfter = Math.max(0, reset - Math.floor(Date.now() / 1000));
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: 'Too many requests. Please try again later.'
    }, {
        status: 429,
        headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Reset': String(reset)
        }
    });
}
}),
"[project]/apps/dashboard/src/lib/api/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "assertEntityInOrg",
    ()=>assertEntityInOrg,
    "withOrgRoute",
    ()=>withOrgRoute
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$org$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/server/org.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$errors$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/errors.ts [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$errors$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/errors.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$billing$2f$write$2d$gate$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/billing/write-gate.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$rate$2d$limit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/server/rate-limit.ts [app-route] (ecmascript)");
;
;
;
;
const PLACEHOLDER_REQUEST_URL = 'http://localhost/';
function withOrgRoute(options, handler) {
    return async (request, // Loose typing here matches Next.js's generated route validator (params: Promise<{}>),
    // so the wrapper is assignable for both no-param and dynamic-segment routes.
    routeCtx)=>{
        let orgId = null;
        try {
            const org = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$org$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getOrCreateOrg"])();
            orgId = org.id;
            if (options.requireBillingWriteAllowed) (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$billing$2f$write$2d$gate$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["assertBillingWriteAllowed"])(org);
            if (options.rateLimit) {
                const { key, limit, windowSecs } = options.rateLimit;
                const rl = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$rate$2d$limit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["rateLimit"])(`${key}:${org.id}`, limit, windowSecs);
                if (!rl.success) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$rate$2d$limit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["tooManyRequests"])(rl.reset);
            }
            const params = routeCtx ? await routeCtx.params : {};
            const req = request ?? new Request(PLACEHOLDER_REQUEST_URL);
            return await handler({
                org,
                request: req,
                params
            });
        } catch (error) {
            if (options.onError) {
                try {
                    await options.onError(error, orgId);
                } catch  {
                // Swallow — onError must not mask the original error.
                }
            }
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$errors$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["handleApiError"])(error, options.context, options.errorMessage);
        }
    };
}
function assertEntityInOrg(entity, orgId, message = 'Not found') {
    if (!entity || entity.organizationId !== orgId) {
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$errors$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NotFoundError"](message);
    }
}
}),
"[project]/packages/agent/dist/shopify/client.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SHOPIFY_API_VERSION",
    ()=>SHOPIFY_API_VERSION,
    "ShopifyRequestError",
    ()=>ShopifyRequestError,
    "formatShopifyToolError",
    ()=>formatShopifyToolError,
    "formatUserErrors",
    ()=>formatUserErrors,
    "parseNextPageInfo",
    ()=>parseNextPageInfo,
    "shopifyGraphql",
    ()=>shopifyGraphql,
    "shopifyRest",
    ()=>shopifyRest,
    "shopifyRestJson",
    ()=>shopifyRestJson
]);
const SHOPIFY_API_VERSION = "2026-04";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 1;
class ShopifyRequestError extends Error {
    status;
    payload;
    constructor(message, options = {}){
        super(message);
        this.name = "ShopifyRequestError";
        this.status = options.status;
        this.payload = options.payload;
        if (options.cause !== undefined) {
            this.cause = options.cause;
        }
    }
}
function shopifyHeaders(token) {
    return {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json"
    };
}
function normalizeShopifyShop(shop) {
    let stripped = shop.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
    if (/^[a-z0-9][a-z0-9-]*$/.test(stripped)) {
        stripped = `${stripped}.myshopify.com`;
    }
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(stripped)) {
        throw new ShopifyRequestError("Invalid Shopify shop domain. Expected a *.myshopify.com host.");
    }
    return stripped;
}
function buildShopifyAdminUrl(ctx, path, query) {
    const shop = normalizeShopifyShop(ctx.shop);
    const normalizedPath = path.replace(/^\/+/, "");
    const url = new URL(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/${normalizedPath}`);
    for (const [key, value] of Object.entries(query ?? {})){
        if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
        }
    }
    return url.toString();
}
function retryDelayMs(res) {
    const retryAfter = res.headers.get("retry-after");
    if (!retryAfter) return 500;
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.min(seconds * 1000, 5000);
    }
    const dateMs = Date.parse(retryAfter);
    if (Number.isFinite(dateMs)) {
        return Math.min(Math.max(dateMs - Date.now(), 0), 5000);
    }
    return 500;
}
function delay(ms) {
    return new Promise((resolve)=>setTimeout(resolve, ms));
}
// ── Per-shop request throttling ─────────────────────────────────────────────
// Shopify's REST Admin API is a leaky bucket (standard plan: 40 burst, 2 req/s
// refill). The per-call retry above only backs off a lone 429 — concurrent
// agent/autopilot runs against the same shop would each stampede the bucket
// independently. A shared in-process token bucket per shop makes them wait
// cooperatively so request starts are paced under the leak rate.
const BUCKET_CAPACITY = 40;
const BUCKET_REFILL_PER_SEC = 2;
const shopBuckets = new Map();
function drainBucket(bucket) {
    const now = Date.now();
    const elapsedSec = (now - bucket.lastRefill) / 1000;
    if (elapsedSec > 0) {
        bucket.tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + elapsedSec * BUCKET_REFILL_PER_SEC);
        bucket.lastRefill = now;
    }
    while(bucket.queue.length > 0 && bucket.tokens >= 1){
        bucket.tokens -= 1;
        bucket.queue.shift()();
    }
    if (bucket.queue.length > 0 && !bucket.timer) {
        const waitMs = Math.max(50, Math.ceil((1 - bucket.tokens) / BUCKET_REFILL_PER_SEC * 1000));
        bucket.timer = setTimeout(()=>{
            bucket.timer = undefined;
            drainBucket(bucket);
        }, waitMs);
    }
}
function acquireShopToken(shop) {
    const existing = shopBuckets.get(shop);
    const bucket = existing ?? {
        tokens: BUCKET_CAPACITY,
        lastRefill: Date.now(),
        queue: []
    };
    if (!existing) shopBuckets.set(shop, bucket);
    return new Promise((resolve)=>{
        bucket.queue.push(resolve);
        drainBucket(bucket);
    });
}
async function fetchWithTimeout(url, init, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal
        });
    } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
            throw new ShopifyRequestError("Shopify request timed out.", {
                cause: err
            });
        }
        throw new ShopifyRequestError("Shopify request failed before receiving a response.", {
            cause: err
        });
    } finally{
        clearTimeout(timer);
    }
}
async function parseResponseBody(res) {
    const text = await res.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch  {
        return text;
    }
}
function describeShopifyPayload(payload) {
    if (payload === null || payload === undefined || payload === "") {
        return "No response body.";
    }
    if (typeof payload === "string") {
        return payload;
    }
    if (typeof payload === "object") {
        const maybeErrors = payload.errors;
        if (typeof maybeErrors === "string") return maybeErrors;
        if (Array.isArray(maybeErrors)) return maybeErrors.map(String).join(", ");
        if (maybeErrors && typeof maybeErrors === "object") return JSON.stringify(maybeErrors);
    }
    return JSON.stringify(payload);
}
function formatShopifyToolError(action, err) {
    if (err instanceof ShopifyRequestError) {
        const status = err.status ? ` (${err.status})` : "";
        const detail = err.payload !== undefined ? describeShopifyPayload(err.payload) : err.message;
        return `Error: ${action}${status} - ${detail}`;
    }
    if (err instanceof Error) {
        return `Error: ${action} - ${err.message}`;
    }
    return `Error: ${action} - ${String(err)}`;
}
async function shopifyRest(ctx, path, options = {}) {
    const shop = normalizeShopifyShop(ctx.shop);
    const url = buildShopifyAdminUrl(ctx, path, options.query);
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const method = options.method ?? "GET";
    const init = {
        method,
        cache: "no-store",
        headers: shopifyHeaders(ctx.accessToken),
        ...options.body !== undefined ? {
            body: JSON.stringify(options.body)
        } : {}
    };
    async function attemptRequest(attempt) {
        await acquireShopToken(shop);
        const res = await fetchWithTimeout(url, init, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        const shouldRetry = (res.status === 429 || res.status >= 500) && attempt < maxRetries;
        if (shouldRetry) {
            await delay(retryDelayMs(res));
            return attemptRequest(attempt + 1);
        }
        const payload = await parseResponseBody(res);
        if (!res.ok) {
            throw new ShopifyRequestError("Shopify API request failed.", {
                status: res.status,
                payload
            });
        }
        return {
            data: payload,
            headers: res.headers
        };
    }
    return attemptRequest(0);
}
async function shopifyRestJson(ctx, path, options = {}) {
    const { data } = await shopifyRest(ctx, path, options);
    return data;
}
function parseNextPageInfo(headers) {
    const linkHeader = headers.get("link") ?? "";
    const nextMatch = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    return nextMatch ? nextMatch[1] : null;
}
async function shopifyGraphql(ctx, query, variables) {
    const payload = await shopifyRestJson(ctx, "graphql.json", {
        method: "POST",
        body: {
            query,
            variables
        }
    });
    if (payload.errors?.length) {
        throw new ShopifyRequestError("Shopify GraphQL request failed.", {
            payload: payload.errors.map((e)=>e.message).join(", ")
        });
    }
    if (!payload.data) {
        throw new ShopifyRequestError("Shopify GraphQL response did not include data.", {
            payload
        });
    }
    return payload.data;
}
function formatUserErrors(errors) {
    if (!errors?.length) return null;
    return errors.map((e)=>e.message).join(", ");
}
}),
"[project]/packages/agent/dist/tools/result.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "toolError",
    ()=>toolError,
    "toolEscalated",
    ()=>toolEscalated,
    "toolNotFound",
    ()=>toolNotFound,
    "toolOk",
    ()=>toolOk
]);
function toolOk(message) {
    return {
        status: "ok",
        message
    };
}
function toolEscalated(reason) {
    return {
        status: "escalated",
        message: reason
    };
}
function toolError(message) {
    return {
        status: "error",
        message
    };
}
function toolNotFound(message) {
    return {
        status: "not_found",
        message
    };
}
}),
"[project]/packages/agent/dist/shopify/serializers.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "customerName",
    ()=>customerName,
    "formatAddressForMessage",
    ()=>formatAddressForMessage,
    "serializeCustomer",
    ()=>serializeCustomer,
    "serializeOrder",
    ()=>serializeOrder,
    "serializeProduct",
    ()=>serializeProduct
]);
function customerName(customer) {
    return [
        customer.first_name,
        customer.last_name
    ].filter(Boolean).join(" ").trim();
}
function serializeAddress(addr) {
    if (!addr) return null;
    return {
        address1: addr.address1 ?? null,
        address2: addr.address2 ?? null,
        city: addr.city ?? null,
        province: addr.province ?? null,
        zip: addr.zip ?? null,
        country: addr.country_name ?? addr.country ?? null
    };
}
function serializeProduct(product) {
    return {
        product_id: String(product.id),
        title: product.title,
        variants: (product.variants ?? []).map((variant)=>({
                variant_id: String(variant.id),
                title: variant.title,
                price: variant.price,
                inventory_quantity: variant.inventory_quantity ?? null
            }))
    };
}
function serializeCustomer(customer) {
    return {
        customer_id: String(customer.id),
        name: customerName(customer),
        email: customer.email ?? null,
        phone: customer.phone ?? null,
        orders_count: customer.orders_count ?? null,
        total_spent: customer.total_spent ?? null,
        note: customer.note ?? null,
        default_address: serializeAddress(customer.default_address)
    };
}
function serializeOrderLineItem(lineItem) {
    return {
        line_item_id: lineItem.id !== undefined && lineItem.id !== null ? String(lineItem.id) : null,
        variant_id: lineItem.variant_id !== undefined && lineItem.variant_id !== null ? String(lineItem.variant_id) : null,
        title: lineItem.title,
        quantity: lineItem.quantity,
        fulfillable_quantity: lineItem.fulfillable_quantity ?? null,
        current_quantity: lineItem.current_quantity ?? null,
        fulfillment_status: lineItem.fulfillment_status ?? null
    };
}
function serializeOrder(order) {
    return {
        id: String(order.id),
        name: order.name ?? null,
        created_at: order.created_at ?? null,
        financial_status: order.financial_status ?? null,
        fulfillment_status: order.fulfillment_status ?? null,
        total_price: order.current_total_price ?? order.total_price ?? null,
        currency: order.currency ?? null,
        items: (order.line_items ?? []).map(serializeOrderLineItem),
        shipping_address: serializeAddress(order.shipping_address)
    };
}
function formatAddressForMessage(addr) {
    return [
        addr.address1,
        addr.address2,
        addr.city,
        addr.province,
        addr.zip,
        addr.country_name ?? addr.country
    ].filter(Boolean).join(", ");
}
}),
"[project]/packages/agent/dist/shopify/validation.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ShopifyInputError",
    ()=>ShopifyInputError,
    "centsToMoney",
    ()=>centsToMoney,
    "clampLimit",
    ()=>clampLimit,
    "moneyToCents",
    ()=>moneyToCents,
    "optionalPositiveInteger",
    ()=>optionalPositiveInteger,
    "optionalString",
    ()=>optionalString,
    "requireAmount",
    ()=>requireAmount,
    "requireEmail",
    ()=>requireEmail,
    "requireNonEmptyString",
    ()=>requireNonEmptyString,
    "requireNumericId",
    ()=>requireNumericId
]);
class ShopifyInputError extends Error {
    constructor(message){
        super(message);
        this.name = "ShopifyInputError";
    }
}
function requireNonEmptyString(value, field) {
    if (typeof value !== "string" || value.trim() === "") {
        throw new ShopifyInputError(`${field} is required.`);
    }
    return value.trim();
}
function optionalString(value) {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
}
function requireNumericId(value, field) {
    const id = requireNonEmptyString(value, field);
    if (!/^\d+$/.test(id)) {
        throw new ShopifyInputError(`${field} must be a numeric Shopify ID.`);
    }
    return id;
}
function requirePositiveInteger(value, field) {
    const numberValue = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(numberValue) || numberValue <= 0) {
        throw new ShopifyInputError(`${field} must be a positive integer.`);
    }
    return numberValue;
}
function optionalPositiveInteger(value, field, fallback) {
    if (value === undefined || value === null || value === "") return fallback;
    return requirePositiveInteger(value, field);
}
function clampLimit(value, fallback, max) {
    if (value === undefined || value === null || value === "") return fallback;
    const numberValue = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(numberValue) || numberValue <= 0) {
        throw new ShopifyInputError("limit must be a positive integer.");
    }
    return Math.min(numberValue, max);
}
function requireEmail(value, field) {
    const email = requireNonEmptyString(value, field);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ShopifyInputError(`${field} must be a valid email address.`);
    }
    return email;
}
function requireAmount(value, field) {
    const amount = requireNonEmptyString(value, field);
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
        throw new ShopifyInputError(`${field} must be a positive decimal amount.`);
    }
    if (moneyToCents(amount) <= 0) {
        throw new ShopifyInputError(`${field} must be greater than zero.`);
    }
    return amount;
}
function moneyToCents(value) {
    const [dollars, cents = ""] = value.split(".");
    return Number(dollars) * 100 + Number(cents.padEnd(2, "0").slice(0, 2));
}
function centsToMoney(cents) {
    return (cents / 100).toFixed(2);
}
}),
"[project]/packages/agent/dist/shopify/products.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "searchShopifyProducts",
    ()=>searchShopifyProducts
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/client.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$serializers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/serializers.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/validation.js [app-route] (ecmascript)");
;
;
;
;
async function searchShopifyProducts(input, ctx) {
    try {
        const query = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(input.query, "query");
        const limit = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["clampLimit"])(input.limit, 5, 10);
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, "products.json", {
            query: {
                title: query,
                limit,
                fields: "id,title,variants"
            }
        });
        const products = data.products ?? [];
        if (products.length === 0) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolNotFound"])(`No products found matching "${query}".`);
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify(products.map(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$serializers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["serializeProduct"])));
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("could not search products", err));
    }
}
}),
"[project]/packages/agent/dist/shopify/customers.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "addShopifyCustomerNote",
    ()=>addShopifyCustomerNote,
    "getShopifyCustomer",
    ()=>getShopifyCustomer,
    "searchShopifyCustomers",
    ()=>searchShopifyCustomers,
    "updateShopifyCustomerInfo",
    ()=>updateShopifyCustomerInfo
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/client.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$serializers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/serializers.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/validation.js [app-route] (ecmascript)");
;
;
;
;
async function searchShopifyCustomers(input, ctx) {
    try {
        const query = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(input.query, "query");
        const limit = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["clampLimit"])(input.limit, 5, 10);
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, "customers/search.json", {
            query: {
                query,
                limit,
                fields: "id,first_name,last_name,email,phone"
            }
        });
        const customers = data.customers ?? [];
        if (customers.length === 0) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolNotFound"])(`No customers found matching "${query}".`);
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify(customers.map((customer)=>({
                customer_id: String(customer.id),
                name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$serializers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["customerName"])(customer),
                email: customer.email ?? null,
                phone: customer.phone ?? null
            }))));
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("could not search customers", err));
    }
}
async function getShopifyCustomer(input, ctx) {
    try {
        const customerId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNumericId"])(input.customer_id, "customer_id");
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `customers/${customerId}.json`, {
            query: {
                fields: "id,first_name,last_name,email,phone,orders_count,total_spent,default_address,note"
            }
        });
        if (!data.customer) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])(`Error: could not fetch customer - customer ${customerId} was not returned by Shopify.`);
        }
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$serializers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["serializeCustomer"])(data.customer)));
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("could not fetch customer", err));
    }
}
async function updateShopifyCustomerInfo(input, ctx) {
    try {
        const customerId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNumericId"])(input.customer_id, "customer_id");
        const payload = {
            id: customerId
        };
        const firstName = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["optionalString"])(input.first_name);
        const lastName = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["optionalString"])(input.last_name);
        const email = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["optionalString"])(input.email);
        const phone = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["optionalString"])(input.phone);
        if (firstName !== undefined) payload.first_name = firstName;
        if (lastName !== undefined) payload.last_name = lastName;
        if (email !== undefined) payload.email = email;
        if (phone !== undefined) payload.phone = phone;
        if (Object.keys(payload).length === 1) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])("Error: failed to update customer info - provide at least one customer field to update.");
        }
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `customers/${customerId}.json`, {
            method: "PUT",
            body: {
                customer: payload
            }
        });
        if (!data.customer) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])(`Error: failed to update customer info - customer ${customerId} was not returned by Shopify.`);
        }
        const c = data.customer;
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolOk"])(`Customer info updated. Name: ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$serializers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["customerName"])(c)}, Email: ${c.email ?? "none"}, Phone: ${c.phone ?? "none"}.`);
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("failed to update customer info", err));
    }
}
async function addShopifyCustomerNote(input, ctx) {
    try {
        const customerId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNumericId"])(input.customer_id, "customer_id");
        const note = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(input.note, "note");
        const existing = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `customers/${customerId}.json`, {
            query: {
                fields: "id,note"
            }
        });
        if (!existing.customer) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])(`Error: failed to add note - customer ${customerId} was not returned by Shopify.`);
        }
        const existingNote = existing.customer.note ?? "";
        const newNote = existingNote ? `${existingNote}\n\n${note}` : note;
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `customers/${customerId}.json`, {
            method: "PUT",
            body: {
                customer: {
                    id: customerId,
                    note: newNote
                }
            }
        });
        if (!data.customer) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])(`Error: failed to add note - customer ${customerId} was not returned after update.`);
        }
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolOk"])(`Note added to Shopify customer record: "${note}"`);
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("failed to add note", err));
    }
}
}),
"[project]/packages/agent/dist/shopify/orders.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getOrderByName",
    ()=>getOrderByName,
    "getShopifyOrders",
    ()=>getShopifyOrders,
    "listRecentUnfulfilledOrderIds",
    ()=>listRecentUnfulfilledOrderIds
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/client.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$serializers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/serializers.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/validation.js [app-route] (ecmascript)");
;
;
;
;
function orderFields() {
    return "id,name,created_at,financial_status,fulfillment_status,total_price,current_total_price,currency,line_items,shipping_address";
}
async function getShopifyOrders(input, ctx) {
    try {
        const customerId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNumericId"])(input.customer_id, "customer_id");
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, "orders.json", {
            query: {
                customer_id: customerId,
                status: "any",
                limit: 5,
                fields: orderFields()
            }
        });
        const orders = data.orders ?? [];
        if (orders.length === 0) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolNotFound"])("No orders found for this customer.");
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify(orders.map(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$serializers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["serializeOrder"])));
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("could not fetch orders", err));
    }
}
async function getOrderByName(input, ctx) {
    try {
        const rawName = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(input.order_name, "order_name");
        const name = rawName.startsWith("#") ? rawName : `#${rawName}`;
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, "orders.json", {
            query: {
                name,
                status: "any",
                limit: 1,
                fields: orderFields()
            }
        });
        const orders = data.orders ?? [];
        if (orders.length === 0) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolNotFound"])(`No order found with number ${name}.`);
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$serializers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["serializeOrder"])(orders[0])));
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("could not search orders", err));
    }
}
async function listRecentUnfulfilledOrderIds(ctx, limit = 10) {
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, "orders.json", {
        query: {
            status: "open",
            fulfillment_status: "unfulfilled",
            financial_status: "paid",
            limit,
            fields: "id"
        }
    });
    return (data.orders ?? []).map((order)=>String(order.id));
}
}),
"[project]/packages/agent/dist/shopify/order-address.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "buildOrderAddress",
    ()=>buildOrderAddress,
    "updateShopifyOrderAddress",
    ()=>updateShopifyOrderAddress
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/client.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$serializers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/serializers.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/validation.js [app-route] (ecmascript)");
;
;
;
;
function buildOrderAddress(input) {
    const address2 = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["optionalString"])(input.address2);
    return {
        ...input.first_name !== undefined ? {
            first_name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(input.first_name, "first_name")
        } : {},
        ...input.last_name !== undefined ? {
            last_name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(input.last_name, "last_name")
        } : {},
        address1: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(input.address1, "address1"),
        ...address2 ? {
            address2
        } : {},
        city: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(input.city, "city"),
        province: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(input.province, "province"),
        zip: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(input.zip, "zip"),
        country: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(input.country, "country")
    };
}
async function syncCustomerDefaultAddress(ctx, customerId, addressPayload) {
    try {
        const customerData = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `customers/${customerId}.json`, {
            query: {
                fields: "id,default_address"
            }
        });
        const defaultAddressId = customerData.customer?.default_address?.id;
        if (defaultAddressId === undefined || defaultAddressId === null) {
            return "Customer profile was not updated because no default address exists.";
        }
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `customers/${customerId}/addresses/${defaultAddressId}.json`, {
            method: "PUT",
            body: {
                address: addressPayload
            }
        });
        return "Customer profile also updated.";
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("customer profile sync failed", err).replace(/^Error: /, "");
    }
}
async function updateShopifyOrderAddress(input, ctx) {
    try {
        const orderId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNumericId"])(input.order_id, "order_id");
        const customerId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNumericId"])(input.customer_id, "customer_id");
        const addressPayload = buildOrderAddress(input);
        const orderData = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `orders/${orderId}.json`, {
            method: "PUT",
            body: {
                order: {
                    id: orderId,
                    shipping_address: addressPayload
                }
            }
        });
        const addr = orderData.order?.shipping_address;
        if (!orderData.order || !addr) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])(`Error: order ${orderId} not found or shipping address was not returned after update.`);
        }
        const customerSync = await syncCustomerDefaultAddress(ctx, customerId, addressPayload);
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolOk"])(`Order #${orderData.order.order_number ?? orderId} shipping address updated to: ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$serializers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatAddressForMessage"])(addr)}. ${customerSync}`);
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("failed to update order shipping address", err));
    }
}
}),
"[project]/packages/agent/dist/shopify/order-cancellation.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "cancelOrder",
    ()=>cancelOrder
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/client.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/validation.js [app-route] (ecmascript)");
;
;
;
async function cancelOrder(input, ctx) {
    try {
        const orderId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNumericId"])(input.order_id, "order_id");
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `orders/${orderId}/cancel.json`, {
            method: "POST",
            body: {
                reason: input.reason ?? "other",
                restock: input.restock ?? true,
                email: false
            }
        });
        if (!data.order) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])(`Error: failed to cancel order - order ${orderId} was not returned by Shopify.`);
        }
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolOk"])(`Order ${data.order.name ?? orderId} cancelled successfully. Reason: ${input.reason ?? "other"}. Items ${input.restock !== false ? "restocked" : "not restocked"}. Refund status: Shopify returned financial_status "${data.order.financial_status ?? "unknown"}".`);
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("failed to cancel order", err));
    }
}
}),
"[project]/packages/agent/dist/shopify/order-creation.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createShopifyOrder",
    ()=>createShopifyOrder
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/client.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$order$2d$address$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/order-address.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/validation.js [app-route] (ecmascript)");
;
;
;
;
function buildLineItems(lineItems, options) {
    if (!Array.isArray(lineItems) || lineItems.length === 0) {
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["ShopifyInputError"]("line_items must include at least one item.");
    }
    return lineItems.map((item, index)=>{
        const quantity = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["optionalPositiveInteger"])(item.quantity, `line_items[${index}].quantity`, 1);
        const variantId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["optionalString"])(item.variant_id);
        if (variantId) {
            return {
                variant_id: Number((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNumericId"])(variantId, `line_items[${index}].variant_id`)),
                quantity
            };
        }
        if (!options.allowCustomLineItems) {
            throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["ShopifyInputError"]("Custom line items are disabled. Each line item must include a variant_id.");
        }
        return {
            title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(item.title, `line_items[${index}].title`),
            price: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireAmount"])(item.price, `line_items[${index}].price`),
            quantity,
            requires_shipping: true
        };
    });
}
async function createShopifyOrder(input, ctx, options = {}) {
    try {
        const email = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireEmail"])(input.email, "email");
        const shippingAddress = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$order$2d$address$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["buildOrderAddress"])({
            first_name: input.first_name,
            last_name: input.last_name,
            address1: input.address1,
            address2: input.address2,
            city: input.city,
            province: input.province,
            zip: input.zip,
            country: input.country
        });
        const lineItems = buildLineItems(input.line_items, options);
        const note = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["optionalString"])(input.note);
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, "orders.json", {
            method: "POST",
            body: {
                order: {
                    email,
                    financial_status: "pending",
                    send_receipt: false,
                    send_fulfillment_receipt: false,
                    line_items: lineItems,
                    shipping_address: shippingAddress,
                    billing_address: shippingAddress,
                    ...note ? {
                        note
                    } : {}
                }
            }
        });
        if (!data.order) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])("Error: failed to create order - Shopify did not return an order.");
        }
        const orderName = data.order.name ?? `#${data.order.id}`;
        const total = data.order.total_price ? `$${data.order.total_price}` : "unknown total";
        const adminUrl = `https://${ctx.shop}/admin/orders/${data.order.id}`;
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolOk"])(`Done — order ${orderName} is in for ${email}, total ${total}.\n\n[View in Shopify](${adminUrl})`);
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("failed to create order", err));
    }
}
}),
"[project]/packages/agent/dist/shopify/order-edit.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "editShopifyOrder",
    ()=>editShopifyOrder
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/client.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/validation.js [app-route] (ecmascript)");
;
;
;
async function editShopifyOrder(input, ctx) {
    try {
        const orderId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNumericId"])(input.order_id, "order_id");
        const addVariantId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["optionalString"])(input.variant_id);
        const removeVariantId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["optionalString"])(input.remove_variant_id);
        if (!addVariantId && !removeVariantId) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])("Error: edit_shopify_order requires at least variant_id (to add) or remove_variant_id (to remove).");
        }
        const productVariantIdPrefix = "gid://shopify/ProductVariant/";
        const orderGid = `gid://shopify/Order/${orderId}`;
        const beginData = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyGraphql"])(ctx, `mutation orderEditBegin($id: ID!) {
        orderEditBegin(id: $id) {
          calculatedOrder {
            id
            lineItems(first: 250) {
              edges { node { id quantity variant { id } title } }
              pageInfo { hasNextPage }
            }
          }
          userErrors { field message }
        }
      }`, {
            id: orderGid
        });
        const beginPayload = beginData.orderEditBegin;
        const beginErrors = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatUserErrors"])(beginPayload?.userErrors);
        if (beginErrors) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])(`Error: could not begin order edit - ${beginErrors}`);
        const calculatedOrder = beginPayload?.calculatedOrder;
        const calculatedOrderId = calculatedOrder?.id;
        if (!calculatedOrderId) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])("Error: failed to begin order edit - Shopify did not return a calculated order.");
        }
        let itemToRemove;
        if (removeVariantId) {
            const removeVariantGid = `${productVariantIdPrefix}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNumericId"])(removeVariantId, "remove_variant_id")}`;
            const matches = (calculatedOrder.lineItems.edges ?? []).filter((edge)=>edge.node.quantity > 0 && edge.node.variant?.id === removeVariantGid);
            if (matches.length === 0) {
                const paginationNote = calculatedOrder.lineItems.pageInfo.hasNextPage ? " The order has more than 250 line items, so the target item may be outside the fetched page." : "";
                return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])(`Error: could not remove old item - variant ${removeVariantId} was not found on order ${orderId}.${paginationNote}`);
            }
            if (matches.length > 1) {
                return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])(`Error: could not remove old item - variant ${removeVariantId} appears multiple times on order ${orderId}; manual review is required.`);
            }
            itemToRemove = matches[0];
        }
        if (addVariantId) {
            const addData = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyGraphql"])(ctx, `mutation orderEditAddVariant($id: ID!, $variantId: ID!, $quantity: Int!) {
          orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity) {
            calculatedOrder { id }
            userErrors { field message }
          }
        }`, {
                id: calculatedOrderId,
                variantId: `${productVariantIdPrefix}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNumericId"])(addVariantId, "variant_id")}`,
                quantity: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["optionalPositiveInteger"])(input.quantity, "quantity", 1)
            });
            const addPayload = addData.orderEditAddVariant;
            const addErrors = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatUserErrors"])(addPayload?.userErrors);
            if (addErrors) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])(`Error: could not add item to order - ${addErrors}`);
            if (!addPayload?.calculatedOrder) {
                return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])("Error: could not add item to order - Shopify did not return a calculated order.");
            }
        }
        if (itemToRemove) {
            const setQtyData = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyGraphql"])(ctx, `mutation orderEditSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!) {
          orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity) {
            calculatedOrder { id }
            userErrors { field message }
          }
        }`, {
                id: calculatedOrderId,
                lineItemId: itemToRemove.node.id,
                quantity: 0
            });
            const setQtyPayload = setQtyData.orderEditSetQuantity;
            const setQtyErrors = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatUserErrors"])(setQtyPayload?.userErrors);
            if (setQtyErrors) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])(`Error: could not remove old item - ${setQtyErrors}`);
            if (!setQtyPayload?.calculatedOrder) {
                return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])("Error: could not remove old item - Shopify did not return a calculated order.");
            }
        }
        const commitData = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyGraphql"])(ctx, `mutation orderEditCommit($id: ID!) {
        orderEditCommit(id: $id, notifyCustomer: false) {
          order {
            name
            lineItems(first: 250) {
              edges { node { title quantity variant { title } } }
            }
          }
          userErrors { field message }
        }
      }`, {
            id: calculatedOrderId
        });
        const commitPayload = commitData.orderEditCommit;
        const commitErrors = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatUserErrors"])(commitPayload?.userErrors);
        if (commitErrors) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])(`Error: could not commit order edit - ${commitErrors}`);
        const order = commitPayload?.order;
        if (!order) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])("Error: could not commit order edit - Shopify did not return the updated order.");
        const itemList = order.lineItems.edges.flatMap(({ node })=>{
            if (node.quantity <= 0) return [];
            const variantTitle = node.variant?.title && node.variant.title !== "Default Title" ? ` (${node.variant.title})` : "";
            return [
                `${node.quantity}x ${node.title}${variantTitle}`
            ];
        }).join(", ");
        const action = addVariantId && removeVariantId ? "swapped item on" : removeVariantId ? "removed item from" : "added item to";
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolOk"])(`Successfully ${action} order ${order.name ?? `#${orderId}`}. Current order items: ${itemList || "none"}.`);
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("failed to edit order", err));
    }
}
}),
"[project]/packages/agent/dist/shopify/refunds.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createRefund",
    ()=>createRefund
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/client.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/validation.js [app-route] (ecmascript)");
;
;
;
function refundableQuantity(lineItem) {
    const quantity = lineItem.current_quantity ?? lineItem.quantity;
    return Number.isFinite(quantity) ? Math.max(quantity, 0) : 0;
}
function buildRefundLineItems(order) {
    return (order.line_items ?? []).flatMap((lineItem)=>lineItem.id !== undefined && lineItem.id !== null && refundableQuantity(lineItem) > 0 ? [
            {
                line_item_id: lineItem.id,
                quantity: refundableQuantity(lineItem),
                restock_type: "no_restock"
            }
        ] : []);
}
function calculatedTransactions(calculation) {
    const refund = calculation.refund;
    return refund?.transactions ?? refund?.suggested_transactions ?? [];
}
function normalizeRefundTransaction(transaction, amount) {
    return {
        kind: "refund",
        gateway: transaction.gateway,
        amount: amount ?? transaction.amount,
        ...transaction.parent_id !== undefined ? {
            parent_id: transaction.parent_id
        } : {},
        ...transaction.currency ? {
            currency: transaction.currency
        } : {}
    };
}
function buildFullRefundTransactions(calculation) {
    return calculatedTransactions(calculation).flatMap((transaction)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["moneyToCents"])(transaction.amount) > 0 ? [
            normalizeRefundTransaction(transaction)
        ] : []);
}
function buildPartialRefundTransactions(calculation, amount) {
    let remainingCents = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["moneyToCents"])(amount);
    const transactions = [];
    for (const transaction of calculatedTransactions(calculation)){
        const maxRefundable = transaction.maximum_refundable ?? transaction.amount;
        const availableCents = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["moneyToCents"])(maxRefundable);
        const refundCents = Math.min(remainingCents, availableCents);
        if (refundCents > 0) {
            transactions.push(normalizeRefundTransaction(transaction, (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["centsToMoney"])(refundCents)));
            remainingCents -= refundCents;
        }
        if (remainingCents === 0) break;
    }
    if (remainingCents > 0) {
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["ShopifyInputError"]("Requested refund amount exceeds the amount Shopify reports as refundable.");
    }
    return transactions;
}
async function calculateRefund(ctx, orderId, refundLineItems) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `orders/${orderId}/refunds/calculate.json`, {
        method: "POST",
        body: {
            refund: {
                shipping: {
                    full_refund: true
                },
                refund_line_items: refundLineItems
            }
        }
    });
}
async function createRefund(input, ctx) {
    try {
        const orderId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNumericId"])(input.order_id, "order_id");
        const amount = input.amount !== undefined ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireAmount"])(input.amount, "amount") : undefined;
        const note = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["optionalString"])(input.reason) ?? "";
        const orderData = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `orders/${orderId}.json`, {
            query: {
                fields: "id,name,currency,line_items,total_price,current_total_price,financial_status"
            }
        });
        if (!orderData.order) {
            return {
                ...(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])(`Error: could not create refund - order ${orderId} was not returned by Shopify.`),
                refundedCents: null
            };
        }
        const refundLineItems = buildRefundLineItems(orderData.order);
        if (refundLineItems.length === 0 && !amount) {
            return {
                ...(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])("Error: could not create refund - no refundable line items were found on this order."),
                refundedCents: null
            };
        }
        const calculation = await calculateRefund(ctx, orderId, refundLineItems);
        const currency = calculation.refund?.currency ?? orderData.order.currency;
        const transactions = amount ? buildPartialRefundTransactions(calculation, amount) : buildFullRefundTransactions(calculation);
        if (transactions.length === 0) {
            return {
                ...(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])("Error: could not create refund - Shopify did not return refundable transactions."),
                refundedCents: null
            };
        }
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `orders/${orderId}/refunds.json`, {
            method: "POST",
            body: {
                refund: {
                    notify: true,
                    note,
                    ...currency ? {
                        currency
                    } : {},
                    ...amount ? {} : {
                        shipping: calculation.refund?.shipping ?? {
                            full_refund: true
                        },
                        refund_line_items: calculation.refund?.refund_line_items ?? refundLineItems
                    },
                    transactions
                }
            }
        });
        if (!data.refund) {
            return {
                ...(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])(`Error: failed to create refund - Shopify did not return a refund for order ${orderId}.`),
                refundedCents: null
            };
        }
        const totalRefunded = (data.refund.transactions ?? []).reduce((sum, transaction)=>sum + (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["moneyToCents"])(transaction.amount), 0);
        return {
            ...(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolOk"])(`Refund of $${(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["centsToMoney"])(totalRefunded)} issued successfully for order ${orderId}.${note ? ` Reason: ${note}.` : ""}`),
            refundedCents: totalRefunded
        };
    } catch (err) {
        return {
            ...(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("failed to create refund", err)),
            refundedCents: null
        };
    }
}
}),
"[project]/packages/agent/dist/shopify/tracking.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getOrderTracking",
    ()=>getOrderTracking
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/client.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/validation.js [app-route] (ecmascript)");
;
;
;
let uspsAccessToken = null;
function isUSPSCarrier(carrier) {
    const normalized = carrier?.toLowerCase() ?? "";
    return normalized.includes("usps") || normalized.includes("united states postal service") || normalized.includes("u.s. postal service");
}
function fulfillmentTrackingNumbers(fulfillment) {
    const trackingNumbers = fulfillment.tracking_numbers?.filter(Boolean) ?? [];
    if (trackingNumbers.length > 0) return trackingNumbers;
    return fulfillment.tracking_number ? [
        fulfillment.tracking_number
    ] : [];
}
function fulfillmentTrackingUrls(fulfillment) {
    const trackingUrls = fulfillment.tracking_urls?.filter(Boolean) ?? [];
    if (trackingUrls.length > 0) return trackingUrls;
    return fulfillment.tracking_url ? [
        fulfillment.tracking_url
    ] : [];
}
async function fetchJson(url, init) {
    const res = await fetch(url, init);
    const text = await res.text();
    let payload = null;
    if (text) {
        try {
            payload = JSON.parse(text);
        } catch  {
            payload = text;
        }
    }
    if (!res.ok) {
        throw new Error(typeof payload === "string" ? payload : JSON.stringify(payload));
    }
    return payload;
}
async function getUspsAccessToken() {
    const clientId = process.env.USPS_CLIENT_ID;
    const clientSecret = process.env.USPS_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    if (uspsAccessToken && uspsAccessToken.expiresAt > Date.now() + 60_000) {
        return uspsAccessToken.token;
    }
    const tokenData = await fetchJson("https://apis.usps.com/oauth2/v3/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            grant_type: "client_credentials",
            client_id: clientId,
            client_secret: clientSecret
        })
    });
    if (!tokenData.access_token) return null;
    uspsAccessToken = {
        token: tokenData.access_token,
        expiresAt: Date.now() + (tokenData.expires_in ?? 300) * 1000
    };
    return uspsAccessToken.token;
}
async function getOrderTracking(input, ctx) {
    try {
        const orderId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireNumericId"])(input.order_id, "order_id");
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `orders/${orderId}/fulfillments.json`);
        const fulfillments = data.fulfillments ?? [];
        if (fulfillments.length === 0) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolNotFound"])("This order has not been fulfilled yet - no tracking information is available.");
        }
        const shipments = fulfillments.flatMap((fulfillment)=>{
            const numbers = fulfillmentTrackingNumbers(fulfillment);
            const urls = fulfillmentTrackingUrls(fulfillment);
            if (numbers.length === 0) {
                return [
                    {
                        fulfillment_status: fulfillment.status,
                        shipment_status: fulfillment.shipment_status ?? null,
                        tracking_number: null,
                        tracking_company: fulfillment.tracking_company ?? null,
                        tracking_url: urls[0] ?? null,
                        note: "Fulfillment has no tracking number."
                    }
                ];
            }
            return numbers.map((trackingNumber, index)=>({
                    fulfillment_status: fulfillment.status,
                    shipment_status: fulfillment.shipment_status ?? null,
                    tracking_number: trackingNumber,
                    tracking_company: fulfillment.tracking_company ?? null,
                    tracking_url: urls[index] ?? urls[0] ?? null
                }));
        });
        const uspsShipment = shipments.find((shipment)=>shipment.tracking_number && isUSPSCarrier(shipment.tracking_company));
        if (!uspsShipment?.tracking_number) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify({
                shipments,
                note: "Live tracking events are only available for USPS shipments. Use each carrier tracking URL for carrier updates."
            }));
        }
        let accessToken;
        try {
            accessToken = await getUspsAccessToken();
        } catch  {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify({
                shipments,
                note: "Live tracking unavailable - USPS authentication failed."
            }));
        }
        if (!accessToken) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify({
                shipments,
                note: "Live tracking unavailable - USPS API is not configured."
            }));
        }
        try {
            const trackData = await fetchJson(`https://apis.usps.com/tracking/v3/tracking/${encodeURIComponent(uspsShipment.tracking_number)}?expand=DETAIL`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify({
                shipments,
                live_usps_tracking: {
                    tracking_number: uspsShipment.tracking_number,
                    status: trackData.statusCategory ?? trackData.status ?? uspsShipment.shipment_status ?? uspsShipment.fulfillment_status,
                    status_summary: trackData.statusSummary ?? null,
                    events: (trackData.trackingEvents ?? []).slice(0, 10).map((event)=>({
                            message: event.eventType ?? null,
                            datetime: event.eventTimestamp ?? null,
                            location: [
                                event.eventCity,
                                event.eventState,
                                event.eventZIP
                            ].filter(Boolean).join(", ") || null
                        }))
                }
            }));
        } catch  {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify({
                shipments,
                note: "Live tracking lookup failed - USPS data unavailable."
            }));
        }
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("could not fetch fulfillments", err));
    }
}
}),
"[project]/packages/agent/dist/shopify/index.js [app-route] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$products$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/products.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$customers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/customers.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$orders$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/orders.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$order$2d$address$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/order-address.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$order$2d$cancellation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/order-cancellation.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$order$2d$creation$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/order-creation.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$order$2d$edit$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/order-edit.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$refunds$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/refunds.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$tracking$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/tracking.js [app-route] (ecmascript)");
;
;
;
;
;
;
;
;
;
;
}),
"[project]/apps/dashboard/src/app/api/shopify/customer/_lib/customer-service.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "lookupShopifyCustomer",
    ()=>lookupShopifyCustomer,
    "updateShopifyCustomer",
    ()=>updateShopifyCustomer
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/db/dist/index.js [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$errors$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/errors.ts [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$errors$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/errors.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/index.js [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/client.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/server/logger.ts [app-route] (ecmascript)");
;
;
;
;
const CUSTOMER_FIELDS = 'id,first_name,last_name,email,phone,note,orders_count,total_spent,currency,created_at,default_address';
async function lookupShopifyCustomer({ organizationId, email, customerId, orderLimit }) {
    const { shop, ctx } = await getShopifyContext(organizationId);
    const customer = await findShopifyCustomer(ctx, {
        email,
        customerId
    });
    if (!customer) {
        return {
            customer: null,
            orders: []
        };
    }
    await persistCustomerName(organizationId, customer);
    const orders = orderLimit > 0 ? await getCustomerOrdersWithImages(ctx, customer.id, orderLimit) : [];
    return {
        customer,
        orders,
        shop
    };
}
async function updateShopifyCustomer(organizationId, customerId, updates) {
    const { ctx } = await getShopifyContext(organizationId);
    const customerPayload = buildShopifyCustomerPayload(customerId, updates);
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `customers/${customerId}.json`, {
        method: 'PUT',
        maxRetries: 0,
        body: {
            customer: customerPayload
        }
    });
    return data.customer ?? null;
}
async function getShopifyContext(organizationId) {
    const integration = await __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].integration.findFirst({
        where: {
            organizationId,
            platform: 'shopify'
        }
    });
    if (!integration?.accessToken) {
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$errors$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NotFoundError"]('no_integration');
    }
    const shop = integration.externalAccountId;
    return {
        shop,
        ctx: {
            shop,
            accessToken: integration.accessToken
        }
    };
}
async function findShopifyCustomer(ctx, input) {
    if (input.customerId) {
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `customers/${input.customerId}.json`, {
            query: {
                fields: CUSTOMER_FIELDS
            },
            maxRetries: 0
        });
        return data.customer ?? null;
    }
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, 'customers/search.json', {
        query: {
            query: `email:${input.email}`,
            fields: CUSTOMER_FIELDS
        },
        maxRetries: 0
    });
    return (data.customers ?? [])[0] ?? null;
}
async function getCustomerOrdersWithImages(ctx, customerId, orderLimit) {
    const ordersData = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, 'orders.json', {
        query: {
            customer_id: customerId,
            status: 'any',
            limit: orderLimit,
            fields: 'id,name,created_at,fulfillment_status,total_price,currency,line_items'
        },
        maxRetries: 0
    });
    return addProductImagesToOrders(ordersData.orders ?? [], ctx);
}
function buildShopifyCustomerPayload(customerId, updates) {
    const customerPayload = {
        id: customerId,
        ...updates.first_name !== undefined && {
            first_name: updates.first_name
        },
        ...updates.last_name !== undefined && {
            last_name: updates.last_name
        },
        ...updates.email !== undefined && {
            email: updates.email
        },
        ...updates.phone !== undefined && {
            phone: updates.phone
        },
        ...updates.note !== undefined && {
            note: updates.note
        }
    };
    if (updates.address) {
        customerPayload.addresses = [
            {
                ...updates.address.address1 !== undefined && {
                    address1: updates.address.address1
                },
                ...updates.address.city !== undefined && {
                    city: updates.address.city
                },
                ...updates.address.province !== undefined && {
                    province: updates.address.province
                },
                ...updates.address.zip !== undefined && {
                    zip: updates.address.zip
                },
                ...updates.address.country !== undefined && {
                    country: updates.address.country
                },
                default: true
            }
        ];
    }
    return customerPayload;
}
async function persistCustomerName(organizationId, shopifyCustomer) {
    const email = shopifyCustomer.email?.trim();
    if (!email) return;
    const fullName = `${shopifyCustomer.first_name ?? ''} ${shopifyCustomer.last_name ?? ''}`.trim();
    if (!fullName) return;
    try {
        const local = await __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].customer.findFirst({
            where: {
                organizationId,
                platformId: {
                    equals: email,
                    mode: 'insensitive'
                }
            },
            select: {
                id: true,
                name: true,
                platformId: true
            }
        });
        if (!local) return;
        const emailLocal = local.platformId.split('@')[0];
        const isEmailLike = !local.name || local.name === local.platformId || local.name === emailLocal;
        if (!isEmailLike) return;
        await __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].customer.update({
            where: {
                id: local.id
            },
            data: {
                name: fullName
            }
        });
    } catch (err) {
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].warn({
            err,
            organizationId,
            email
        }, '[Shopify Customer GET] Failed to persist customer name');
    }
}
async function addProductImagesToOrders(orders, ctx) {
    const productIds = Array.from(new Set(orders.flatMap((order)=>order.line_items.map((item)=>item.product_id).filter((id)=>typeof id === 'number'))));
    if (productIds.length === 0) return orders;
    try {
        const productsData = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, 'products.json', {
            query: {
                ids: productIds.join(','),
                fields: 'id,images'
            },
            maxRetries: 0
        });
        const productImageById = new Map((productsData.products ?? []).map((product)=>[
                product.id,
                product.images?.[0]?.src ?? null
            ]));
        return orders.map((order)=>({
                ...order,
                line_items: order.line_items.map((item)=>({
                        ...item,
                        image: item.product_id ? productImageById.get(item.product_id) ?? null : null
                    }))
            }));
    } catch (err) {
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].warn({
            err
        }, '[Shopify Customer GET] Failed to fetch product images');
        return orders;
    }
}
}),
"[project]/apps/dashboard/src/lib/api/body.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "isJsonObject",
    ()=>isJsonObject,
    "readEmptyJsonBody",
    ()=>readEmptyJsonBody,
    "readJsonBody",
    ()=>readJsonBody,
    "readOptionalJsonObject",
    ()=>readOptionalJsonObject,
    "readRequiredJsonObject",
    ()=>readRequiredJsonObject,
    "requireJsonObject",
    ()=>requireJsonObject
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$errors$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/errors.ts [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$errors$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/errors.js [app-route] (ecmascript)");
;
const MALFORMED_JSON_DETAILS = [
    {
        code: 'invalid_body',
        message: 'Request body must be valid JSON'
    }
];
const EMPTY_JSON_DETAILS = [
    {
        code: 'invalid_body',
        message: 'Request body is required'
    }
];
const OBJECT_JSON_DETAILS = [
    {
        code: 'invalid_body',
        message: 'Request body must be a JSON object'
    }
];
function badRequest(options, fallbackMessage, fallbackDetails) {
    return new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$errors$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["BadRequestError"](options?.message ?? fallbackMessage, options?.details ?? fallbackDetails);
}
async function readJsonBody(request, options = {}) {
    let text;
    try {
        text = await request.text();
    } catch  {
        throw badRequest(options.malformed, 'Invalid JSON body', MALFORMED_JSON_DETAILS);
    }
    if (!text.trim()) {
        if (options.allowEmpty) return undefined;
        throw badRequest(options.empty, 'Request body is required', EMPTY_JSON_DETAILS);
    }
    try {
        return JSON.parse(text);
    } catch  {
        throw badRequest(options.malformed, 'Invalid JSON body', MALFORMED_JSON_DETAILS);
    }
}
function isJsonObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
function requireJsonObject(value, options) {
    if (!isJsonObject(value)) {
        throw badRequest(options, 'Validation failed', OBJECT_JSON_DETAILS);
    }
    return value;
}
async function readRequiredJsonObject(request, options = {}) {
    return requireJsonObject(await readJsonBody(request, options), options.object);
}
async function readOptionalJsonObject(request, options = {}) {
    const body = await readJsonBody(request, {
        ...options,
        allowEmpty: true
    });
    if (body === undefined) return undefined;
    return requireJsonObject(body, options.object);
}
async function readEmptyJsonBody(request, options = {}) {
    const body = await readJsonBody(request, {
        ...options,
        allowEmpty: true
    });
    if (body === undefined) return;
    const objectBody = requireJsonObject(body, options.object);
    if (Object.keys(objectBody).length > 0) {
        throw badRequest(options.object, 'Request body must be empty', [
            {
                code: 'invalid_body',
                message: 'Request body must be empty'
            }
        ]);
    }
}
}),
"[project]/apps/dashboard/src/app/api/shopify/customer/_lib/validation.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "parseCreateShopifyCustomerBody",
    ()=>parseCreateShopifyCustomerBody,
    "parseShopifyCustomerUpdateBody",
    ()=>parseShopifyCustomerUpdateBody
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$errors$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/errors.ts [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$errors$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/errors.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$body$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/body.ts [app-route] (ecmascript)");
;
;
function parseCustomerId(value) {
    if (typeof value === 'string' && value.trim() !== '') {
        return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$errors$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["BadRequestError"]('Missing customerId or updates');
}
function parseShopifyCustomerUpdateBody(body) {
    const candidate = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$body$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireJsonObject"])(body, {
        message: 'Validation failed'
    });
    const { customerId, updates } = candidate;
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$errors$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["BadRequestError"]('Missing customerId or updates');
    }
    return {
        customerId: parseCustomerId(customerId),
        updates: updates
    };
}
function parseCreateShopifyCustomerBody(body) {
    const candidate = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$body$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireJsonObject"])(body, {
        message: 'Validation failed'
    });
    const { first_name, last_name, email } = candidate;
    return {
        first_name: typeof first_name === 'string' ? first_name : '',
        last_name: typeof last_name === 'string' ? last_name : '',
        email: typeof email === 'string' ? email : undefined
    };
}
}),
"[project]/apps/dashboard/src/app/api/shopify/customer/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "PATCH",
    ()=>PATCH
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$errors$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/errors.ts [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$errors$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/errors.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$route$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/route.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/index.js [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/client.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/server/logger.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$api$2f$shopify$2f$customer$2f$_lib$2f$customer$2d$service$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/api/shopify/customer/_lib/customer-service.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$api$2f$shopify$2f$customer$2f$_lib$2f$validation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/api/shopify/customer/_lib/validation.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$body$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/body.ts [app-route] (ecmascript)");
;
;
;
;
;
;
;
;
function shopifyErrorResponse(err) {
    if (err instanceof __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["ShopifyRequestError"]) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'shopify_error',
            details: err.payload ?? {}
        }, {
            status: err.status ?? 502
        });
    }
    throw err;
}
const GET = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$route$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["withOrgRoute"])({
    context: 'Shopify Customer GET',
    errorMessage: 'server_error'
}, async ({ org, request })=>{
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const customerId = searchParams.get('customerId');
    const parsedOrderLimit = Number.parseInt(searchParams.get('orderLimit') ?? '5', 10);
    const orderLimit = Number.isFinite(parsedOrderLimit) ? Math.min(Math.max(parsedOrderLimit, 0), 5) : 5;
    if (!email && !customerId) {
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$errors$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["BadRequestError"]('Missing email or customerId');
    }
    try {
        const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$api$2f$shopify$2f$customer$2f$_lib$2f$customer$2d$service$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["lookupShopifyCustomer"])({
            organizationId: org.id,
            email,
            customerId,
            orderLimit
        });
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(result);
    } catch (err) {
        return shopifyErrorResponse(err);
    }
});
const PATCH = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$route$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["withOrgRoute"])({
    context: 'Shopify Customer PATCH',
    errorMessage: 'server_error'
}, async ({ org, request })=>{
    const { customerId, updates } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$api$2f$shopify$2f$customer$2f$_lib$2f$validation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["parseShopifyCustomerUpdateBody"])(await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$body$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["readRequiredJsonObject"])(request));
    let customer;
    try {
        customer = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$api$2f$shopify$2f$customer$2f$_lib$2f$customer$2d$service$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["updateShopifyCustomer"])(org.id, customerId, updates);
    } catch (err) {
        if (err instanceof __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["ShopifyRequestError"]) {
            __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].error({
                err: err.payload
            }, '[Shopify Customer PATCH] Shopify error');
            const errors = err.payload?.errors;
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: errors ?? 'Failed to update customer'
            }, {
                status: err.status ?? 502
            });
        }
        throw err;
    }
    if (!customer) {
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].error({
            err: {
                customer
            }
        }, '[Shopify Customer PATCH] Shopify error');
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Failed to update customer'
        }, {
            status: 502
        });
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        customer
    });
});
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__05ts636._.js.map