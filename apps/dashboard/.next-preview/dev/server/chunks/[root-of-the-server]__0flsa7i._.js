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
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/node:async_hooks [external] (node:async_hooks, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:async_hooks", () => require("node:async_hooks"));

module.exports = mod;
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
"[project]/packages/agent/dist/thread-constants.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AGENT_NOTE_PREFIX",
    ()=>AGENT_NOTE_PREFIX,
    "CHANNEL_TYPE",
    ()=>CHANNEL_TYPE,
    "LEGACY_AGENT_NOTE_PREFIX",
    ()=>LEGACY_AGENT_NOTE_PREFIX,
    "OPERATOR_CHANNEL_TYPES",
    ()=>OPERATOR_CHANNEL_TYPES,
    "SENDER_TYPE",
    ()=>SENDER_TYPE,
    "THREAD_STATUS",
    ()=>THREAD_STATUS,
    "isAgentNoteContent",
    ()=>isAgentNoteContent,
    "isOperatorChannel",
    ()=>isOperatorChannel,
    "stripAgentNotePrefix",
    ()=>stripAgentNotePrefix
]);
const CHANNEL_TYPE = {
    IG_DM: 'ig_dm',
    EMAIL: 'email',
    TIKTOK: 'tiktok',
    SHOPIFY: 'shopify',
    SMS: 'sms',
    SMS_AGENT: 'sms_agent',
    DASHBOARD_AGENT: 'dashboard_agent'
};
const OPERATOR_CHANNEL_TYPES = new Set([
    CHANNEL_TYPE.DASHBOARD_AGENT,
    CHANNEL_TYPE.SMS_AGENT
]);
function isOperatorChannel(channelType) {
    if (!channelType) return false;
    return OPERATOR_CHANNEL_TYPES.has(channelType);
}
const THREAD_STATUS = {
    OPEN: 'open',
    PENDING: 'pending',
    CLOSED: 'closed'
};
const SENDER_TYPE = {
    CUSTOMER: 'customer',
    AGENT: 'agent',
    NOTE: 'note',
    AI: 'ai'
};
const LEGACY_AGENT_NOTE_PREFIX = "__clerk_agent_note__";
const AGENT_NOTE_PREFIX = "__shopkeeper_agent_note__";
const AGENT_NOTE_PREFIXES = [
    AGENT_NOTE_PREFIX,
    LEGACY_AGENT_NOTE_PREFIX
];
function isAgentNoteContent(contentText) {
    if (!contentText) return false;
    return AGENT_NOTE_PREFIXES.some((prefix)=>contentText.startsWith(prefix));
}
function stripAgentNotePrefix(contentText) {
    for (const prefix of AGENT_NOTE_PREFIXES){
        if (contentText.startsWith(prefix)) {
            return contentText.slice(prefix.length);
        }
    }
    return contentText;
}
}),
"[project]/apps/dashboard/src/lib/messaging/inbox-filter.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "canonicalInboxThreadSql",
    ()=>canonicalInboxThreadSql,
    "canonicalInboxThreadWhere",
    ()=>canonicalInboxThreadWhere
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/db/dist/index.js [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/thread-constants.js [app-route] (ecmascript)");
;
;
function canonicalInboxThreadWhere(organizationId) {
    return {
        organizationId,
        channelType: {
            notIn: [
                __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["CHANNEL_TYPE"].SMS_AGENT,
                __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["CHANNEL_TYPE"].DASHBOARD_AGENT
            ]
        },
        archivedAt: null,
        deletedAt: null,
        filterStatus: {
            not: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["ThreadFilterStatus"].filtered
        }
    };
}
function canonicalInboxThreadSql(organizationId) {
    return __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["Prisma"].sql`
    t.organization_id = ${organizationId}::uuid
    AND t.channel_type NOT IN ('sms_agent', 'dashboard_agent')
    AND t.archived_at IS NULL
    AND t.deleted_at IS NULL
    AND t.filter_status <> 'filtered'
  `;
}
}),
"[project]/apps/dashboard/src/app/api/threads/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "dynamic",
    ()=>dynamic
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/db/dist/index.js [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$route$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/route.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$inbox$2d$filter$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/messaging/inbox-filter.ts [app-route] (ecmascript)");
;
;
;
;
const dynamic = 'force-dynamic';
const GET = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$route$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["withOrgRoute"])({
    context: 'Threads GET',
    errorMessage: 'Failed to fetch threads',
    rateLimit: {
        key: 'threads:get',
        limit: 60,
        windowSecs: 60
    }
}, async ({ org, request })=>{
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'open';
    const filterStatusParam = searchParams.get('filterStatus');
    const preview = searchParams.get('preview') === 'true';
    const countOnly = searchParams.get('count') === 'true';
    const includeCount = searchParams.get('includeCount') === 'true';
    const cursor = searchParams.get('cursor') ?? undefined;
    const limitParam = searchParams.get('limit');
    const parsedLimit = limitParam ? parseInt(limitParam, 10) : NaN;
    const limit = !isNaN(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : undefined;
    const wantsFiltered = filterStatusParam === __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["ThreadFilterStatus"].filtered;
    const needsReply = searchParams.get('needsReply') === 'true';
    const where = {
        ...(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$inbox$2d$filter$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["canonicalInboxThreadWhere"])(org.id),
        ...wantsFiltered ? {
            filterStatus: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["ThreadFilterStatus"].filtered
        } : {
            status,
            filterStatus: {
                not: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["ThreadFilterStatus"].filtered
            }
        },
        ...needsReply ? {
            lastMessageSenderType: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["SenderType"].customer
        } : {}
    };
    if (countOnly) {
        const count = await __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].thread.count({
            where
        });
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            count
        });
    }
    const rows = await __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].thread.findMany({
        where,
        ...cursor ? {
            cursor: {
                id: cursor
            },
            skip: 1
        } : {},
        ...limit !== undefined ? {
            take: limit + 1
        } : {},
        include: {
            customer: true,
            messages: preview ? {
                where: {
                    NOT: {
                        senderType: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["SenderType"].note
                    },
                    deletedAt: null
                },
                orderBy: {
                    sentAt: 'desc'
                },
                take: 1
            } : {
                where: {
                    deletedAt: null
                },
                orderBy: {
                    sentAt: 'asc'
                }
            }
        },
        orderBy: {
            lastMessageAt: 'desc'
        }
    });
    let threads = rows;
    let nextCursor = null;
    if (limit !== undefined && rows.length > limit) {
        threads = rows.slice(0, limit);
        nextCursor = threads[threads.length - 1].id;
    }
    const totalCount = includeCount && !cursor ? await __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].thread.count({
        where
    }) : undefined;
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        threads,
        nextCursor,
        ...totalCount !== undefined ? {
            totalCount
        } : {}
    });
});
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__0flsa7i._.js.map