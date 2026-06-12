module.exports = [
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[project]/packages/agent/dist/plan-cache-shape.js [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AGENT_PLAN_CACHE_VERSION",
    ()=>AGENT_PLAN_CACHE_VERSION,
    "extractCachedDraftReply",
    ()=>extractCachedDraftReply,
    "getCurrentPlanForThread",
    ()=>getCurrentPlanForThread,
    "readAgentPlanCacheRecordShape",
    ()=>readAgentPlanCacheRecordShape
]);
const AGENT_PLAN_CACHE_VERSION = 2;
const TOOL_CATEGORIES = [
    "action",
    "communication",
    "internal",
    "read"
];
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isToolCategory(value) {
    return typeof value === "string" && TOOL_CATEGORIES.includes(value);
}
function isPlanStep(value) {
    if (!isRecord(value)) return false;
    return typeof value.id === "string" && typeof value.tool === "string" && typeof value.label === "string" && typeof value.description === "string" && isToolCategory(value.category) && typeof value.enabled === "boolean";
}
function isRawToolCall(value) {
    if (!isRecord(value)) return false;
    return typeof value.id === "string" && typeof value.name === "string" && "input" in value;
}
function isStringRecord(value) {
    return isRecord(value) && Object.values(value).every((v)=>typeof v === "string");
}
function isAgentPlan(value) {
    if (!isRecord(value)) return false;
    if (typeof value.instruction !== "string") return false;
    if (!Array.isArray(value.steps) || !value.steps.every(isPlanStep)) return false;
    if (!Array.isArray(value.rawToolCalls) || !value.rawToolCalls.every(isRawToolCall)) return false;
    if (value.readResults !== undefined && !isStringRecord(value.readResults)) return false;
    if (value.warnings !== undefined && (!Array.isArray(value.warnings) || !value.warnings.every((w)=>typeof w === "string"))) return false;
    return true;
}
function readAgentPlanCacheRecordShape(value) {
    if (!isRecord(value)) return null;
    if (value.version !== AGENT_PLAN_CACHE_VERSION || typeof value.instruction !== "string" || typeof value.settingsFingerprint !== "string" || !isAgentPlan(value.plan)) {
        return null;
    }
    return {
        version: value.version,
        instruction: value.instruction,
        lastCustomerMessageId: typeof value.lastCustomerMessageId === "string" ? value.lastCustomerMessageId : null,
        settingsFingerprint: value.settingsFingerprint,
        plan: value.plan
    };
}
function readAgentPlanCachePlan(value) {
    return readAgentPlanCacheRecordShape(value)?.plan ?? null;
}
function extractCachedDraftReply(cachedPlan) {
    const plan = readAgentPlanCachePlan(cachedPlan);
    if (!plan) return null;
    for (const call of plan.rawToolCalls){
        if (call.name !== "send_reply") continue;
        const input = call.input;
        if (isRecord(input) && typeof input.text === "string" && input.text.trim()) {
            return input.text;
        }
    }
    return null;
}
function getCurrentPlanForThread(thread, lastCustomerMessageId) {
    if (!thread.cachedPlanMessageId || thread.cachedPlanMessageId !== lastCustomerMessageId) return null;
    const plan = readAgentPlanCachePlan(thread.cachedPlan);
    return plan && plan.steps.length > 0 ? plan : null;
}
}),
"[project]/packages/agent/dist/tools/result.js [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/packages/agent/dist/tools/registry/helpers.js [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "cancelReasons",
    ()=>cancelReasons,
    "noShopify",
    ()=>noShopify,
    "noThread",
    ()=>noThread,
    "requireShopify",
    ()=>requireShopify,
    "threadContextOf",
    ()=>threadContextOf,
    "threadStatuses",
    ()=>threadStatuses
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-rsc] (ecmascript)");
;
const noShopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["toolError"])("Error: no Shopify integration connected.");
const noThread = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["toolError"])("Error: this tool requires a conversation thread.");
const cancelReasons = [
    "customer",
    "fraud",
    "inventory",
    "declined",
    "other"
];
const threadStatuses = [
    "open",
    "pending",
    "closed"
];
function requireShopify(ctx) {
    return ctx.shopify;
}
function threadContextOf(ctx) {
    const thread = ctx.thread;
    if (!thread) return null;
    return {
        threadId: thread.id,
        orgId: ctx.orgId,
        orgName: ctx.orgName
    };
}
}),
"[project]/packages/agent/dist/tools/registry/schema.js [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ToolInputValidationError",
    ()=>ToolInputValidationError,
    "arrayArg",
    ()=>arrayArg,
    "booleanArg",
    ()=>booleanArg,
    "defineTool",
    ()=>defineTool,
    "numberArg",
    ()=>numberArg,
    "stringArg",
    ()=>stringArg
]);
class ToolInputValidationError extends Error {
    constructor(message){
        super(message);
        this.name = "ToolInputValidationError";
    }
}
function stringArg(description, options = {}) {
    return {
        kind: "string",
        description,
        ...options
    };
}
function numberArg(description, options = {}) {
    return {
        kind: "number",
        description,
        ...options
    };
}
function booleanArg(description, options = {}) {
    return {
        kind: "boolean",
        description,
        ...options
    };
}
function arrayArg(description, items, options = {}) {
    return {
        kind: "array",
        description,
        items,
        ...options
    };
}
function objectSchema(fields) {
    const required = Object.entries(fields).flatMap(([name, field])=>field.required ? [
            name
        ] : []);
    return {
        type: "object",
        properties: Object.fromEntries(Object.entries(fields).map(([name, field])=>[
                name,
                fieldSchema(field)
            ])),
        ...required.length > 0 ? {
            required
        } : {},
        additionalProperties: false
    };
}
function fieldSchema(field) {
    if (field.kind === "array") {
        return {
            type: "array",
            description: field.description,
            items: objectSchema(field.items),
            ...field.minItems !== undefined ? {
                minItems: field.minItems
            } : {}
        };
    }
    return {
        type: field.kind,
        description: field.description,
        ...field.kind === "string" && field.enum ? {
            enum: field.enum
        } : {}
    };
}
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validationMessage(path, message) {
    return new ToolInputValidationError(`${path} ${message}`);
}
function parseObject(fields, input, path) {
    if (!isPlainObject(input)) {
        throw validationMessage(path, "must be an object.");
    }
    const allowedKeys = new Set(Object.keys(fields));
    for (const key of Object.keys(input)){
        if (!allowedKeys.has(key)) {
            throw validationMessage(`${path}.${key}`, "is not allowed.");
        }
    }
    const parsed = {};
    for (const [key, field] of Object.entries(fields)){
        const value = input[key];
        const fieldPath = `${path}.${key}`;
        if (value === undefined) {
            if (field.required) {
                throw validationMessage(fieldPath, "is required.");
            }
            continue;
        }
        parsed[key] = parseField(field, value, fieldPath);
    }
    return parsed;
}
function parseField(field, value, path) {
    if (field.kind === "array") {
        if (!Array.isArray(value)) {
            throw validationMessage(path, "must be an array.");
        }
        if (field.minItems !== undefined && value.length < field.minItems) {
            throw validationMessage(path, `must include at least ${field.minItems} item.`);
        }
        return value.map((item, index)=>parseObject(field.items, item, `${path}[${index}]`));
    }
    if (field.kind === "string") {
        if (typeof value !== "string") {
            throw validationMessage(path, "must be a string.");
        }
        if (field.enum && !field.enum.includes(value)) {
            throw validationMessage(path, `must be one of: ${field.enum.join(", ")}.`);
        }
        return value;
    }
    if (field.kind === "number") {
        if (typeof value !== "number" || !Number.isFinite(value)) {
            throw validationMessage(path, "must be a finite number.");
        }
        return value;
    }
    if (typeof value !== "boolean") {
        throw validationMessage(path, "must be a boolean.");
    }
    return value;
}
function objectParser(fields) {
    return (input)=>parseObject(fields, input, "input");
}
function defineTool(definition) {
    return {
        name: definition.name,
        description: definition.description,
        inputSchema: objectSchema(definition.fields),
        parse: objectParser(definition.fields),
        category: definition.category,
        group: definition.group,
        labels: {
            executed: definition.label,
            planStep: definition.planStepLabel
        },
        policy: {
            categoryPermission: true,
            ...definition.policy
        },
        execute: definition.execute
    };
}
}),
"[project]/packages/agent/dist/tools/registry/customer.js [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CUSTOMER_TOOL_DEFINITIONS",
    ()=>CUSTOMER_TOOL_DEFINITIONS
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/helpers.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/schema.js [app-rsc] (ecmascript)");
;
;
const CUSTOMER_TOOL_DEFINITIONS = [
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "search_shopify_customers",
        description: "Search for Shopify customers by name or email. Use this when given a customer's name or email address to resolve their Shopify customer ID before calling other customer tools.",
        fields: {
            query: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Name or email to search for (e.g. 'Jane Smith' or 'jane@example.com').", {
                required: true
            }),
            limit: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["numberArg"])("Maximum number of results to return (default 5, max 10).")
        },
        category: "read",
        group: "customer",
        label: "Searched customers",
        planStepLabel: "Search Shopify customers",
        execute: async (input, ctx, _settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.searchShopifyCustomers(input, shopify) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["noShopify"];
        }
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "get_shopify_customer",
        description: "Fetch the Shopify customer profile (name, email, phone, address, order count, total spent). Call this first whenever you need customer details.",
        fields: {
            customer_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("The Shopify customer ID (already available in context if the thread is linked).", {
                required: true
            })
        },
        category: "read",
        group: "customer",
        label: "Fetched customer",
        planStepLabel: "Fetch customer profile",
        execute: async (input, ctx, _settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.getShopifyCustomer(input, shopify) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["noShopify"];
        }
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "update_shopify_customer_info",
        description: "Update basic Shopify customer info: first name, last name, email, or phone.",
        fields: {
            customer_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Shopify customer ID.", {
                required: true
            }),
            first_name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("First name."),
            last_name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Last name."),
            email: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Email address."),
            phone: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Phone number.")
        },
        category: "action",
        group: "customer",
        label: "Updated customer info",
        planStepLabel: "Update customer info on Shopify",
        execute: async (input, ctx, _settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.updateShopifyCustomerInfo(input, shopify) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["noShopify"];
        }
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "add_shopify_customer_note",
        description: "Append a note to the Shopify customer record (visible in the Shopify admin).",
        fields: {
            customer_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Shopify customer ID.", {
                required: true
            }),
            note: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("The note text to append.", {
                required: true
            })
        },
        category: "action",
        group: "customer",
        label: "Added Shopify note",
        planStepLabel: "Add note to Shopify customer",
        execute: async (input, ctx, _settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.addShopifyCustomerNote(input, shopify) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["noShopify"];
        }
    })
];
}),
"[project]/packages/agent/dist/tools/registry/knowledge.js [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "KNOWLEDGE_TOOL_DEFINITIONS",
    ()=>KNOWLEDGE_TOOL_DEFINITIONS
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/helpers.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/schema.js [app-rsc] (ecmascript)");
;
;
;
const KNOWLEDGE_TOOL_DEFINITIONS = [
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "search_kb",
        description: "Search the organization's knowledge base for articles matching a query. Use this to find store policies, FAQs, or how-to guides before answering customer questions about returns, shipping, or store procedures.",
        fields: {
            query: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Search terms to look for in knowledge base article titles and bodies (e.g. 'return policy', 'shipping times').", {
                required: true
            })
        },
        category: "read",
        group: "knowledge",
        label: "Searched knowledge base",
        planStepLabel: "Search knowledge base",
        execute: async (input, ctx, _settings, deps)=>{
            const words = input.query.trim().split(/\s+/).filter((word)=>word.length >= 2);
            if (words.length === 0) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["toolNotFound"])("No knowledge base articles found for that query.");
            const articles = await deps.searchKnowledgeBaseArticles(ctx.orgId, words);
            if (articles.length === 0) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["toolNotFound"])("No knowledge base articles found for that query.");
            const kbThreadCtx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["threadContextOf"])(ctx);
            if (kbThreadCtx) {
                await deps.recordKnowledgeBaseCitations(ctx.orgId, kbThreadCtx.threadId, articles.map((article)=>article.id));
            }
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify(articles.map((article)=>({
                    title: article.title,
                    body: article.body,
                    tags: article.tags
                }))));
        }
    })
];
}),
"[project]/packages/agent/dist/tools/registry/messaging.js [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MESSAGING_TOOL_DEFINITIONS",
    ()=>MESSAGING_TOOL_DEFINITIONS
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/helpers.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/schema.js [app-rsc] (ecmascript)");
;
;
const MESSAGING_TOOL_DEFINITIONS = [
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "send_reply",
        description: "Send a message to the customer on their channel (Instagram DM, email, etc.).",
        fields: {
            text: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("The message text to send.", {
                required: true
            })
        },
        category: "communication",
        group: "messaging",
        label: "Sent reply",
        planStepLabel: "Notify customer",
        execute: async (input, ctx)=>ctx.io ? ctx.io.sendReply(input) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["noThread"]
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "send_email",
        description: "Send an outbound email to any email address. Use this to proactively contact a customer (e.g. shipping delay notice) even when the current thread is not an email thread.",
        fields: {
            to: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Recipient email address in user@domain format (e.g. 'jane@example.com'). Must be a valid SMTP address — never a name or phone number.", {
                required: true
            }),
            subject: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Email subject line.", {
                required: true
            }),
            body: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Email body text.", {
                required: true
            })
        },
        category: "communication",
        group: "messaging",
        label: "Sent email",
        planStepLabel: "Send email to customer",
        execute: async (input, ctx)=>ctx.io ? ctx.io.sendEmail(input) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["noThread"]
    })
];
}),
"[project]/packages/agent/dist/tools/registry/order.js [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ORDER_TOOL_DEFINITIONS",
    ()=>ORDER_TOOL_DEFINITIONS
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/helpers.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/schema.js [app-rsc] (ecmascript)");
;
;
const ORDER_TOOL_DEFINITIONS = [
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "get_shopify_orders",
        description: "Fetch the most recent Shopify orders for a customer (up to 5), including financial status, fulfillment status, line items, and the order's shipping_address (address1, address2, city, province, zip, country). Use this first for basic order-status questions or to look up the shipping address; if fulfillment_status is null, the order has not shipped yet and you usually do not need get_order_tracking.",
        fields: {
            customer_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Shopify customer ID.", {
                required: true
            })
        },
        category: "read",
        group: "order",
        label: "Fetched orders",
        planStepLabel: "Fetch recent orders",
        execute: async (input, ctx, _settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.getShopifyOrders(input, shopify) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["noShopify"];
        }
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "update_shopify_order_address",
        description: "Update the shipping address on a specific Shopify order AND sync the customer's default address to match (only works for unfulfilled/unshipped orders). The order ID is available in the 'Customer's recent orders' context — use it directly. Pass ALL address components in a single call.",
        fields: {
            order_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Shopify order ID (numeric, e.g. '5678901234'). Use the id field from the orders context.", {
                required: true
            }),
            customer_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Shopify customer ID.", {
                required: true
            }),
            address1: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Street line (e.g. '123 Main St').", {
                required: true
            }),
            address2: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Apartment, suite, unit, etc. (e.g. 'Apt 4B'). Omit if not provided."),
            city: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("City.", {
                required: true
            }),
            province: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("State or province abbreviation (e.g. 'NY', 'CA').", {
                required: true
            }),
            zip: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("ZIP or postal code.", {
                required: true
            }),
            country: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Country name (e.g. 'United States').", {
                required: true
            })
        },
        category: "action",
        group: "order",
        label: "Updated shipping address",
        planStepLabel: "Update shipping address on Shopify",
        execute: async (input, ctx, _settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.updateShopifyOrderAddress(input, shopify) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["noShopify"];
        }
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "get_order_by_name",
        description: "Look up a Shopify order by its human-readable order number (e.g. '#1234'). Use this when the customer mentions an order number. Returns the order ID, financial/fulfillment status, line items, and shipping_address.",
        fields: {
            order_name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("The order number as shown to the customer, e.g. '#1234' or '1234'.", {
                required: true
            })
        },
        category: "read",
        group: "order",
        label: "Looked up order",
        planStepLabel: "Look up order",
        execute: async (input, ctx, _settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.getOrderByName(input, shopify) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["noShopify"];
        }
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "get_order_tracking",
        description: "Fetch live fulfillment and tracking details for a Shopify order. Returns tracking number, carrier, shipment status, estimated delivery date, and the full scan event timeline (including exceptions like return to sender, delivery attempt failed, weather delay, etc.). Use this only when an order is already fulfilled or partially fulfilled, or when someone explicitly needs tracking details such as tracking numbers, carrier scans, delivery events, or delivery exceptions. Do not use it for unfulfilled orders or basic status checks that can be answered from get_shopify_orders.",
        fields: {
            order_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Shopify order ID (numeric, e.g. '5678901234'). Use the id field from the orders context or from get_order_by_name.", {
                required: true
            })
        },
        category: "read",
        group: "order",
        label: "Fetched tracking info",
        planStepLabel: "Fetch order tracking",
        execute: async (input, ctx, _settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.getOrderTracking(input, shopify) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["noShopify"];
        }
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "create_refund",
        description: "Issue a refund on a Shopify order. Always pass an explicit amount (for a full refund, use the order's total from the orders context) so the refund can be validated against the workspace refund limit.",
        fields: {
            order_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Shopify order ID (numeric).", {
                required: true
            }),
            amount: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Amount to refund in the store's currency (e.g. '19.99'). For a full refund, use the order's total from context. Always provide this.", {
                required: true
            }),
            reason: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Reason for the refund (e.g. 'Item not received', 'Wrong item sent').")
        },
        category: "action",
        group: "order",
        label: "Issued refund",
        planStepLabel: "Issue refund",
        policy: {
            refundAmountLimits: true,
            dailyRefundSpendLimit: true
        },
        execute: async (input, ctx, _settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            if (!shopify) return __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["noShopify"];
            const refund = await deps.createRefund(input, shopify);
            if (refund.refundedCents !== null && refund.refundedCents > 0) {
                await deps.incrementDailyRefundSpendCents(ctx.orgId, refund.refundedCents);
            }
            return refund;
        }
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "cancel_order",
        description: "Cancel an unfulfilled Shopify order. Only works for orders that have not yet been fulfilled.",
        fields: {
            order_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Shopify order ID (numeric).", {
                required: true
            }),
            reason: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Reason for cancellation.", {
                enum: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cancelReasons"]
            }),
            restock: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["booleanArg"])("Whether to restock the items. Defaults to true.")
        },
        category: "action",
        group: "order",
        label: "Cancelled order",
        planStepLabel: "Cancel order",
        policy: {
            cancellationDisabled: true
        },
        execute: async (input, ctx, _settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.cancelOrder(input, shopify) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["noShopify"];
        }
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "create_shopify_order",
        description: "Create a new Shopify order on behalf of a customer. Each line item must include either a variant_id (for a real catalog product) or a title + price (for a custom item, if allowed). Set financial_status to pending — do not charge the customer.",
        fields: {
            email: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Customer email address.", {
                required: true
            }),
            first_name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Customer first name.", {
                required: true
            }),
            last_name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Customer last name.", {
                required: true
            }),
            address1: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Shipping street address.", {
                required: true
            }),
            address2: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Apartment or suite (optional)."),
            city: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("City.", {
                required: true
            }),
            province: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("State or province abbreviation (e.g. 'NY').", {
                required: true
            }),
            zip: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("ZIP or postal code.", {
                required: true
            }),
            country: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Country name (e.g. 'United States').", {
                required: true
            }),
            line_items: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["arrayArg"])("Items to include in the order.", {
                variant_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Shopify product variant ID. Use this for real catalog products."),
                title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Custom item title. Only provide when variant_id is omitted."),
                price: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Unit price as a decimal string (e.g. '29.99'). Only for custom items."),
                quantity: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["numberArg"])("Quantity.", {
                    required: true
                })
            }, {
                required: true,
                minItems: 1
            }),
            note: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Optional note to attach to the order.")
        },
        category: "action",
        group: "order",
        label: "Created order",
        planStepLabel: "Create Shopify order",
        policy: {
            customLineItemsDisabled: true
        },
        execute: async (input, ctx, settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.createShopifyOrder(input, shopify, {
                allowCustomLineItems: !settings.blockCustomLineItems
            }) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["noShopify"];
        }
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "edit_shopify_order",
        description: "Add, remove, or swap a line item on an existing Shopify order using the Order Editing API. To add an item: provide variant_id and quantity. To remove an item: provide only remove_variant_id from the orders context, no search needed. To swap size/color: provide variant_id (new) and remove_variant_id (old). At least one of variant_id or remove_variant_id must be provided.",
        fields: {
            order_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Shopify order ID (numeric, e.g. '5678901234'). Use the id field from the orders context.", {
                required: true
            }),
            variant_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Variant ID to add. Required when adding or swapping. Omit for pure removal."),
            quantity: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["numberArg"])("Number of units to add. Required when variant_id is provided."),
            remove_variant_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Variant ID of the existing item to remove. Use for removals and swaps. Available in the orders context — no search needed.")
        },
        category: "action",
        group: "order",
        label: "Edited order",
        planStepLabel: "Edit existing order",
        execute: async (input, ctx, _settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.editShopifyOrder(input, shopify) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["noShopify"];
        }
    })
];
}),
"[project]/packages/agent/dist/tools/registry/product.js [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PRODUCT_TOOL_DEFINITIONS",
    ()=>PRODUCT_TOOL_DEFINITIONS
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/helpers.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/schema.js [app-rsc] (ecmascript)");
;
;
const PRODUCT_TOOL_DEFINITIONS = [
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "search_shopify_products",
        description: "Search the Shopify product catalog by title or keyword. Returns matching products with their variants and variant IDs. Use this when the operator describes a product by name (e.g. 'pencil half zip, size L') so you can resolve the correct variant_id before creating an order.",
        fields: {
            query: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Product title or keyword to search for (e.g. 'pencil half zip').", {
                required: true
            }),
            limit: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["numberArg"])("Maximum number of products to return (default 5, max 10).")
        },
        category: "read",
        group: "product",
        label: "Searched products",
        planStepLabel: "Search Shopify products",
        execute: async (input, ctx, _settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.searchShopifyProducts(input, shopify) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["noShopify"];
        }
    })
];
}),
"[project]/packages/agent/dist/tools/support-stats-types.js [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SUPPORT_STATS_DEFAULT_DAYS",
    ()=>SUPPORT_STATS_DEFAULT_DAYS,
    "SUPPORT_STATS_MAX_DAYS",
    ()=>SUPPORT_STATS_MAX_DAYS,
    "clampSupportStatsDays",
    ()=>clampSupportStatsDays
]);
const SUPPORT_STATS_DEFAULT_DAYS = 7;
const SUPPORT_STATS_MAX_DAYS = 90;
function clampSupportStatsDays(days) {
    if (days === undefined) return SUPPORT_STATS_DEFAULT_DAYS;
    return Math.min(Math.max(Math.round(days), 1), SUPPORT_STATS_MAX_DAYS);
}
}),
"[project]/packages/agent/dist/tools/registry/stats.js [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "STATS_TOOL_DEFINITIONS",
    ()=>STATS_TOOL_DEFINITIONS
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$support$2d$stats$2d$types$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/support-stats-types.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/schema.js [app-rsc] (ecmascript)");
;
;
;
const STATS_TOOL_DEFINITIONS = [
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "get_support_stats",
        description: "Summarize support activity over the last N days: ticket volume by day, topic, and channel, message counts by sender, and average resolution time. Use this for questions like 'how many tickets came in last week?' or 'what were customers asking about this month?'.",
        fields: {
            days: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["numberArg"])(`Number of days to look back (1-${__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$support$2d$stats$2d$types$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["SUPPORT_STATS_MAX_DAYS"]}). Use ${__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$support$2d$stats$2d$types$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["SUPPORT_STATS_DEFAULT_DAYS"]} for 'this week', 30 for 'this month'.`, {
                required: true
            })
        },
        category: "read",
        group: "insights",
        label: "Summarized support activity",
        planStepLabel: "Summarize support activity",
        execute: async (input, ctx, _settings, deps)=>{
            const stats = await deps.getSupportStats(ctx.orgId, (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$support$2d$stats$2d$types$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["clampSupportStatsDays"])(input.days));
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify(stats));
        }
    })
];
}),
"[project]/packages/agent/dist/tools/registry/thread.js [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "THREAD_TOOL_DEFINITIONS",
    ()=>THREAD_TOOL_DEFINITIONS
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/helpers.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/schema.js [app-rsc] (ecmascript)");
;
;
;
const THREAD_TOOL_DEFINITIONS = [
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "add_internal_note",
        description: "Add an internal note to the support thread. Notes are visible only to agents, not the customer. Always call this to document what you did.",
        fields: {
            text: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("Note content.", {
                required: true
            })
        },
        category: "internal",
        group: "thread",
        label: "Added internal note",
        planStepLabel: "Add internal note",
        execute: async (input, ctx)=>ctx.io ? ctx.io.addInternalNote(input) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["noThread"]
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "update_thread_status",
        description: "Update the status of the support thread.",
        fields: {
            status: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("New status for the thread.", {
                required: true,
                enum: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["threadStatuses"]
            })
        },
        category: "internal",
        group: "thread",
        label: "Updated thread status",
        planStepLabel: "Update ticket status",
        execute: async (input, ctx)=>ctx.io ? ctx.io.updateThreadStatus(input) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["noThread"]
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "update_thread_tag",
        description: "Update the topic tag on the support thread.",
        fields: {
            tag: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("New tag (e.g. 'Shipping', 'Returns', 'Billing').", {
                required: true
            })
        },
        category: "internal",
        group: "thread",
        label: "Updated thread tag",
        planStepLabel: "Update ticket tag",
        execute: async (input, ctx)=>ctx.io ? ctx.io.updateThreadTag(input) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["noThread"]
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "escalate_to_human",
        description: "Hand off the ticket to the merchant when a tool failure, missing data, or out-of-scope question prevents you from helping. Marks the thread as pending with a 'needs_human' tag and logs the reason. Stop after calling this — do not attempt any other tools or send a reply.",
        fields: {
            reason: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stringArg"])("A short explanation of why a human needs to take over (e.g. 'Customer is asking about wholesale pricing — out of scope', 'Shopify returned 503 on refund attempt').", {
                required: true
            })
        },
        category: "internal",
        group: "thread",
        label: "Escalated to merchant",
        planStepLabel: "Escalate to merchant",
        execute: async (input, ctx)=>{
            const reason = input.reason.trim() || "No reason provided";
            await ctx.escalate(reason);
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["toolEscalated"])(reason);
        }
    })
];
}),
"[project]/packages/agent/dist/tools/registry/index.js [app-rsc] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AGENT_TOOLS",
    ()=>AGENT_TOOLS,
    "PLAN_STEP_LABELS",
    ()=>PLAN_STEP_LABELS,
    "TOOL_CATEGORIES",
    ()=>TOOL_CATEGORIES,
    "TOOL_DEFINITIONS",
    ()=>TOOL_DEFINITIONS,
    "TOOL_DEFINITION_REGISTRY",
    ()=>TOOL_DEFINITION_REGISTRY,
    "TOOL_GROUPS",
    ()=>TOOL_GROUPS,
    "TOOL_LABELS",
    ()=>TOOL_LABELS,
    "formatToolInputValidationError",
    ()=>formatToolInputValidationError,
    "getToolDefinition",
    ()=>getToolDefinition,
    "isAgentToolName",
    ()=>isAgentToolName,
    "parseToolInput",
    ()=>parseToolInput,
    "selectAgentTools",
    ()=>selectAgentTools,
    "toolNamesForGroups",
    ()=>toolNamesForGroups
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$settings$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/settings.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$customer$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/customer.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$knowledge$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/knowledge.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$messaging$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/messaging.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$order$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/order.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$product$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/product.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/schema.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$stats$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/stats.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$thread$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/thread.js [app-rsc] (ecmascript)");
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
const TOOL_DEFINITIONS = [
    ...__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$knowledge$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["KNOWLEDGE_TOOL_DEFINITIONS"],
    ...__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$product$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["PRODUCT_TOOL_DEFINITIONS"],
    ...__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$customer$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["CUSTOMER_TOOL_DEFINITIONS"],
    ...__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$order$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ORDER_TOOL_DEFINITIONS"],
    ...__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$thread$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["THREAD_TOOL_DEFINITIONS"],
    ...__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$messaging$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["MESSAGING_TOOL_DEFINITIONS"],
    ...__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$stats$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["STATS_TOOL_DEFINITIONS"]
];
const TOOL_DEFINITION_REGISTRY = Object.fromEntries(TOOL_DEFINITIONS.map((definition)=>[
        definition.name,
        definition
    ]));
const TOOL_GROUP_ORDER = [
    "knowledge",
    "product",
    "customer",
    "order",
    "thread",
    "messaging",
    "insights"
];
const TOOL_CATEGORIES = Object.fromEntries(TOOL_DEFINITIONS.map((definition)=>[
        definition.name,
        definition.category
    ]));
const TOOL_GROUPS = TOOL_GROUP_ORDER.reduce((groups, group)=>({
        ...groups,
        [group]: TOOL_DEFINITIONS.filter((definition)=>definition.group === group).map((definition)=>definition.name)
    }), {});
const TOOL_LABELS = Object.fromEntries(TOOL_DEFINITIONS.map((definition)=>[
        definition.name,
        definition.labels.executed
    ]));
const PLAN_STEP_LABELS = Object.fromEntries(TOOL_DEFINITIONS.map((definition)=>[
        definition.name,
        definition.labels.planStep
    ]));
const AGENT_TOOLS = TOOL_DEFINITIONS.map((definition)=>({
        name: definition.name,
        description: definition.description,
        input_schema: definition.inputSchema
    }));
function getToolDefinition(name) {
    return TOOL_DEFINITION_REGISTRY[name];
}
function isAgentToolName(name) {
    return Object.prototype.hasOwnProperty.call(TOOL_DEFINITION_REGISTRY, name);
}
function parseToolInput(name, input) {
    const definition = getToolDefinition(name);
    if (!definition) {
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ToolInputValidationError"](`unknown tool "${name}".`);
    }
    return definition.parse(input);
}
function formatToolInputValidationError(name, error) {
    const message = error instanceof Error ? error.message : String(error);
    return `invalid arguments for ${name}: ${message}`;
}
function toolNamesForGroups(...groups) {
    return groups.flatMap((group)=>[
            ...TOOL_GROUPS[group]
        ]);
}
function selectAgentTools(settings, allowedToolNames) {
    const s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$settings$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["resolveAgentSettings"])(settings);
    const allowed = allowedToolNames ? new Set(allowedToolNames) : null;
    return AGENT_TOOLS.filter((tool)=>{
        const category = TOOL_CATEGORIES[tool.name];
        if (category && !s.toolsEnabled[category]) return false;
        if (allowed && !allowed.has(tool.name)) return false;
        return true;
    });
}
}),
"[project]/packages/agent/dist/tools/static-policy.js [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "checkParsedStaticToolPolicy",
    ()=>checkParsedStaticToolPolicy,
    "checkStaticToolPolicy",
    ()=>checkStaticToolPolicy
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$index$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/index.js [app-rsc] (ecmascript) <locals>");
;
function checkParsedStaticToolPolicy(definition, input, settings) {
    if (definition.policy.categoryPermission && !settings.toolsEnabled[definition.category]) {
        return {
            blocked: true,
            reason: `${definition.category} tools are disabled by the workspace owner.`
        };
    }
    if (definition.policy.cancellationDisabled && settings.blockCancellations) {
        return {
            blocked: true,
            reason: "order cancellations are disabled by the workspace owner."
        };
    }
    if (definition.policy.refundAmountLimits) {
        const refundInput = input;
        const hasPerCallCap = settings.maxRefundAmount !== null && settings.maxRefundAmount > 0;
        const hasDailyCap = settings.dailyRefundCap !== null && settings.dailyRefundCap > 0;
        if (hasPerCallCap || hasDailyCap) {
            if (!refundInput.amount) {
                const limit = hasPerCallCap ? settings.maxRefundAmount : settings.dailyRefundCap;
                return {
                    blocked: true,
                    reason: `refund amount must be specified and cannot exceed $${limit}.`
                };
            }
            const amount = Number(refundInput.amount);
            if (!Number.isFinite(amount) || amount <= 0) {
                return {
                    blocked: true,
                    reason: "refund amount must be a positive decimal value."
                };
            }
            if (hasPerCallCap && amount > settings.maxRefundAmount) {
                return {
                    blocked: true,
                    reason: `refund amount $${refundInput.amount} exceeds the workspace limit of $${settings.maxRefundAmount}.`
                };
            }
        }
    }
    if (definition.policy.customLineItemsDisabled && settings.blockCustomLineItems) {
        const orderInput = input;
        const hasCustomLineItem = orderInput.line_items.some((item)=>!item.variant_id);
        if (hasCustomLineItem) {
            return {
                blocked: true,
                reason: "custom line items are disabled by the workspace owner. Each line item must include a variant_id."
            };
        }
    }
    return {
        blocked: false
    };
}
function checkStaticToolPolicy(name, args, settings) {
    const definition = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$index$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["getToolDefinition"])(name);
    if (!definition) return {
        blocked: false
    };
    let input;
    try {
        input = definition.parse(args);
    } catch (error) {
        return {
            blocked: true,
            reason: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$index$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["formatToolInputValidationError"])(name, error)
        };
    }
    return checkParsedStaticToolPolicy(definition, input, settings);
}
}),
"[project]/packages/agent/dist/plan-preview.js [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "buildPlanPreview",
    ()=>buildPlanPreview,
    "classifyHomePlan",
    ()=>classifyHomePlan
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$settings$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/settings.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$index$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/index.js [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$static$2d$policy$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/static-policy.js [app-rsc] (ecmascript)");
;
;
;
const QUICK_REPLY_READ_TOOLS = new Set([
    "search_kb",
    "search_shopify_products",
    "search_shopify_customers",
    "get_shopify_customer",
    "get_shopify_orders",
    "get_order_by_name",
    "get_order_tracking"
]);
const CUSTOMER_OR_ORDER_READ_TOOLS = new Set([
    "search_shopify_customers",
    "get_shopify_customer",
    "get_shopify_orders",
    "get_order_by_name",
    "get_order_tracking"
]);
const ACTION_TOOL_PRIORITY = [
    "create_refund",
    "cancel_order",
    "edit_shopify_order",
    "create_shopify_order",
    "update_shopify_order_address",
    "update_shopify_customer_info",
    "add_shopify_customer_note"
];
const TOOL_PHRASE = {
    send_reply: "reply",
    send_email: "email customer",
    add_internal_note: "add internal note",
    update_thread_status: "close ticket",
    update_thread_tag: "retag"
};
function replyTextFromToolCall(toolCall) {
    const input = toolCall?.input;
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const text = input.text;
    return typeof text === "string" && text.trim() ? text.trim() : null;
}
function usesCustomerOrOrderContext(plan) {
    return plan.rawToolCalls.some((toolCall)=>CUSTOMER_OR_ORDER_READ_TOOLS.has(toolCall.name));
}
function warningBlocksQuickReply(warning, plan) {
    const lower = warning.toLowerCase();
    if (lower.includes("couldn't find a shopify customer") || lower.includes("could not find a shopify customer")) {
        return usesCustomerOrOrderContext(plan);
    }
    return true;
}
const NEEDS_REVIEW = {
    kind: "needs_review",
    replyText: null,
    sendReplyToolCall: null
};
function detectQuickReply(plan) {
    if (plan.steps.length !== 1 || plan.steps[0].tool !== "send_reply") {
        return NEEDS_REVIEW;
    }
    const sendReplyCalls = plan.rawToolCalls.filter((toolCall)=>toolCall.name === "send_reply");
    if (sendReplyCalls.length !== 1 || sendReplyCalls[0].id !== plan.steps[0].id) {
        return NEEDS_REVIEW;
    }
    const sendReplyToolCall = sendReplyCalls[0];
    const rawCallsAreSafe = plan.rawToolCalls.every((toolCall)=>toolCall.id === sendReplyToolCall.id ? toolCall.name === "send_reply" : QUICK_REPLY_READ_TOOLS.has(toolCall.name));
    const replyText = replyTextFromToolCall(sendReplyToolCall);
    if (!rawCallsAreSafe || !replyText) {
        return NEEDS_REVIEW;
    }
    return {
        kind: "quick_reply",
        replyText,
        sendReplyToolCall
    };
}
function classifyHomePlan(plan, settings) {
    if (!plan || (plan.warnings ?? []).some((warning)=>warningBlocksQuickReply(warning, plan))) {
        return NEEDS_REVIEW;
    }
    const resolved = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$settings$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["resolveAgentSettings"])(settings ?? null);
    const tier = resolved.autonomyTier ?? "guarded";
    const mutativeCalls = plan.rawToolCalls.filter((tc)=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$index$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["TOOL_CATEGORIES"][tc.name] === "action");
    if (mutativeCalls.length > 0) {
        if (!__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$settings$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["TIERS_THAT_AUTO_EXECUTE"].has(tier)) {
            return NEEDS_REVIEW;
        }
        const policyClean = mutativeCalls.every((tc)=>!(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$static$2d$policy$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["checkStaticToolPolicy"])(tc.name, tc.input, resolved).blocked);
        if (!policyClean) {
            return NEEDS_REVIEW;
        }
        const sendReplyToolCall = plan.rawToolCalls.find((tc)=>tc.name === "send_reply") ?? null;
        const replyText = replyTextFromToolCall(sendReplyToolCall);
        return {
            kind: "auto_execute",
            replyText,
            sendReplyToolCall
        };
    }
    const quickReply = detectQuickReply(plan);
    if (quickReply.kind === "quick_reply" && tier === "watch") {
        return NEEDS_REVIEW;
    }
    return quickReply;
}
function findActionStep(plan) {
    const stepsByTool = new Map(plan.steps.map((step)=>[
            step.tool,
            step
        ]));
    for (const tool of ACTION_TOOL_PRIORITY){
        const found = stepsByTool.get(tool);
        if (found) return found;
    }
    return null;
}
function trim(text, max = 110) {
    const cleaned = text.replace(/^"([\s\S]*)"$/, "$1").trim();
    return cleaned.length > max ? `${cleaned.slice(0, max - 3)}…` : cleaned;
}
function warningLead(warning) {
    const head = warning.split(/\s[-–,]\s/)[0] ?? warning;
    return head.replace(/[.?!]+$/, "").trim();
}
function actionPhraseFor(step) {
    const fixed = TOOL_PHRASE[step.tool];
    if (fixed) return fixed;
    if (step.description) return trim(step.description, 60);
    return step.label || step.tool.replace(/_/g, " ");
}
function summarizeActionChain(plan, excludeStepId) {
    const seen = new Set();
    const phrases = [];
    for (const step of plan.steps){
        if (step.id === excludeStepId) continue;
        const phrase = actionPhraseFor(step);
        if (!phrase || seen.has(phrase)) continue;
        seen.add(phrase);
        phrases.push(phrase);
        if (phrases.length === 3) break;
    }
    return phrases.join(" + ");
}
function buildProposal(plan, headlineStep) {
    if (!plan) return "No plan generated — open ticket to draft reply";
    const warnings = (plan.warnings ?? []).slice(0, 2).flatMap((warning)=>{
        const lead = warningLead(warning);
        return lead ? [
            lead
        ] : [];
    });
    const action = summarizeActionChain(plan, headlineStep?.id);
    if (warnings.length === 0 && !action) {
        return "No plan generated — open ticket to draft reply";
    }
    if (warnings.length === 0) return action;
    const left = warnings.join(". ");
    return action ? `${left} — ${action}` : left;
}
function orderRefFromPlan(plan) {
    const lookup = plan.rawToolCalls.find((c)=>c.name === "get_order_by_name");
    const name = lookup?.input?.order_name;
    if (typeof name !== "string" || !name.trim()) return null;
    return name.startsWith("#") ? name : `#${name}`;
}
function buildPlanPreview(plan, aiSummary, firstMessage) {
    const action = plan ? findActionStep(plan) : null;
    const proposal = buildProposal(plan, action);
    if (action) {
        const headline = action.description ? trim(action.description, 90) : action.label || "Run action";
        const context = aiSummary?.trim() ? trim(aiSummary, 140) : "";
        return {
            headline,
            context,
            proposal,
            orderRef: plan ? orderRefFromPlan(plan) : null
        };
    }
    const headline = aiSummary?.trim() ? trim(aiSummary, 100) : firstMessage?.trim() ? trim(firstMessage, 100) : "New customer message";
    return {
        headline,
        context: "",
        proposal,
        orderRef: plan ? orderRefFromPlan(plan) : null
    };
}
}),
"[project]/apps/dashboard/src/lib/home/summary-contract.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "HOME_NEEDS_ATTENTION_LIMIT",
    ()=>HOME_NEEDS_ATTENTION_LIMIT,
    "HOME_OVERNIGHT_TOPIC_LIMIT",
    ()=>HOME_OVERNIGHT_TOPIC_LIMIT,
    "HOME_REPEAT_CUSTOMER_LIMIT",
    ()=>HOME_REPEAT_CUSTOMER_LIMIT,
    "HOME_SUMMARY_REFRESH_INTERVAL_MS",
    ()=>HOME_SUMMARY_REFRESH_INTERVAL_MS,
    "createEmptyHomeSummary",
    ()=>createEmptyHomeSummary,
    "lastUtcDayKeys",
    ()=>lastUtcDayKeys
]);
const HOME_SUMMARY_REFRESH_INTERVAL_MS = 30_000;
const HOME_NEEDS_ATTENTION_LIMIT = 5;
const HOME_OVERNIGHT_TOPIC_LIMIT = 4;
const HOME_REPEAT_CUSTOMER_LIMIT = 4;
function utcDayKey(date) {
    return date.toISOString().slice(0, 10);
}
function lastUtcDayKeys(now, count) {
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);
    return Array.from({
        length: count
    }, (_, index)=>{
        const day = new Date(today);
        day.setUTCDate(today.getUTCDate() - (count - index - 1));
        return utcDayKey(day);
    });
}
function createEmptyHomeSummary(now = new Date()) {
    const days = lastUtcDayKeys(now, 7);
    const emptySeries = days.map(()=>0);
    return {
        generatedAt: now.toISOString(),
        metrics: {
            openCount: 0,
            openDelta: 0,
            weeklyVolume: 0,
            firstReplyMinutes: null,
            autoResolvedPct: null,
            repliesSent24h: 0,
            overnightClearedCount: 0,
            needsYouCount: 0,
            refundsPending: 0,
            vipsInQueue: 0,
            hasSentReply: false
        },
        series: {
            days,
            newThreadsByDay: [
                ...emptySeries
            ],
            aiResolvedByDay: [
                ...emptySeries
            ],
            totalRepliesByDay: [
                ...emptySeries
            ]
        },
        needsAttention: [],
        overnight: {
            topics: [],
            channelNames: []
        },
        repeatCustomers: []
    };
}
}),
"[project]/packages/agent/dist/thread-constants.js [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/apps/dashboard/src/lib/messaging/inbox-filter.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "canonicalInboxThreadSql",
    ()=>canonicalInboxThreadSql,
    "canonicalInboxThreadWhere",
    ()=>canonicalInboxThreadWhere
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/db/dist/index.js [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/thread-constants.js [app-rsc] (ecmascript)");
;
;
function canonicalInboxThreadWhere(organizationId) {
    return {
        organizationId,
        channelType: {
            notIn: [
                __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["CHANNEL_TYPE"].SMS_AGENT,
                __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["CHANNEL_TYPE"].DASHBOARD_AGENT
            ]
        },
        archivedAt: null,
        deletedAt: null,
        filterStatus: {
            not: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["ThreadFilterStatus"].filtered
        }
    };
}
function canonicalInboxThreadSql(organizationId) {
    return __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["Prisma"].sql`
    t.organization_id = ${organizationId}::uuid
    AND t.channel_type NOT IN ('sms_agent', 'dashboard_agent')
    AND t.archived_at IS NULL
    AND t.deleted_at IS NULL
    AND t.filter_status <> 'filtered'
  `;
}
}),
"[project]/apps/dashboard/src/lib/messaging/customer-name.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getCustomerName",
    ()=>getCustomerName
]);
function getCustomerName(customer) {
    if (customer?.name) return customer.name;
    const id = customer?.platformId;
    if (!id) return "Unknown Customer";
    if (id.includes("@")) return id;
    if (/^\d+$/.test(id)) return `Customer ${id.slice(-6)}`;
    return id.replace(/_/g, " ").replace(/\b\w/g, (char)=>char.toUpperCase()).slice(0, 40);
}
}),
"[project]/apps/dashboard/src/lib/server/home-summary.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getHomeSummary",
    ()=>getHomeSummary
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/db/dist/index.js [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$plan$2d$cache$2d$shape$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/plan-cache-shape.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$plan$2d$preview$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/plan-preview.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$home$2f$summary$2d$contract$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/home/summary-contract.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$inbox$2d$filter$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/messaging/inbox-filter.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$channels$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/messaging/channels.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$customer$2d$name$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/messaging/customer-name.ts [app-rsc] (ecmascript)");
;
;
;
;
;
;
;
const DAY_MS = 24 * 60 * 60 * 1000;
const TAG_SUBTITLES = {
    Shipping: "WISMO replies sent",
    Returns: "size swaps + refunds",
    "Order Status": "tracking pulled & shared",
    "Product Inquiry": "answered from KB",
    General: "answered from KB"
};
function startOfUtcDay(date) {
    const result = new Date(date);
    result.setUTCHours(0, 0, 0, 0);
    return result;
}
function numberFromDb(value) {
    return typeof value === "bigint" ? Number(value) : value;
}
function initialsOf(name) {
    return name.split(/\s+/).flatMap((part)=>part[0] ? [
            part[0]
        ] : []).slice(0, 2).join("").toUpperCase() || "?";
}
function timeAgoShort(date, now) {
    const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}
function currentPlanPredicate(organizationId) {
    return __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["Prisma"].sql`
    t.status = 'open'
    AND t.cached_plan IS NOT NULL
    AND t.cached_plan_message_id IS NOT NULL
    AND t.cached_plan->>'version' = '2'
    AND CASE
      WHEN jsonb_typeof(t.cached_plan #> '{plan,steps}') = 'array'
      THEN jsonb_array_length(t.cached_plan #> '{plan,steps}') > 0
      ELSE FALSE
    END
    AND t.cached_plan_message_id = (
      SELECT m.id
      FROM messages m
      WHERE m.thread_id = t.id
        AND m.deleted_at IS NULL
        AND m.sender_type <> 'note'
      ORDER BY m.sent_at DESC, m.id DESC
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1
      FROM messages cached_message
      WHERE cached_message.id = t.cached_plan_message_id
        AND cached_message.thread_id = t.id
        AND cached_message.deleted_at IS NULL
        AND cached_message.sender_type = 'customer'
    )
    AND ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$inbox$2d$filter$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["canonicalInboxThreadSql"])(organizationId)}
  `;
}
async function loadNeedsAttention(organizationId, settings, now) {
    const rows = await __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].$queryRaw`
    SELECT t.id
    FROM threads t
    WHERE ${currentPlanPredicate(organizationId)}
    ORDER BY t.last_message_at DESC, t.id DESC
    LIMIT ${__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$home$2f$summary$2d$contract$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["HOME_NEEDS_ATTENTION_LIMIT"]}
  `;
    if (rows.length === 0) return [];
    const ids = rows.map((row)=>row.id);
    const threads = await __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].thread.findMany({
        where: {
            ...(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$inbox$2d$filter$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["canonicalInboxThreadWhere"])(organizationId),
            id: {
                in: ids
            },
            status: "open"
        },
        include: {
            customer: true,
            messages: {
                where: {
                    senderType: {
                        not: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["SenderType"].note
                    },
                    deletedAt: null
                },
                orderBy: [
                    {
                        sentAt: "desc"
                    },
                    {
                        id: "desc"
                    }
                ],
                take: 1
            }
        }
    });
    const byId = new Map(threads.map((thread)=>[
            thread.id,
            thread
        ]));
    return ids.flatMap((id)=>{
        const thread = byId.get(id);
        const latestMessage = thread?.messages[0];
        if (!thread || !latestMessage) return [];
        const plan = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$plan$2d$cache$2d$shape$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getCurrentPlanForThread"])(thread, latestMessage.id);
        if (!plan) return [];
        const copy = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$plan$2d$preview$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["buildPlanPreview"])(plan, thread.aiSummary, latestMessage.contentText);
        const classification = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$plan$2d$preview$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["classifyHomePlan"])(plan, settings);
        const kind = classification.kind === "quick_reply" ? "quick_reply" : "needs_review";
        return [
            {
                threadId: thread.id,
                kind,
                customerName: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$customer$2d$name$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getCustomerName"])(thread.customer),
                channelName: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$channels$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getChannelInfo"])(thread.channelType).name,
                timeAgo: timeAgoShort(latestMessage.sentAt, now),
                headline: copy.headline,
                contextLine: copy.context,
                proposalSummary: copy.proposal,
                replyText: classification.replyText,
                orderRef: copy.orderRef,
                tag: thread.tag
            }
        ];
    });
}
async function getHomeSummary(organizationId, settings, now = new Date()) {
    const todayStart = startOfUtcDay(now);
    const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);
    const weekStart = new Date(todayStart.getTime() - 6 * DAY_MS);
    const last24h = new Date(now.getTime() - DAY_MS);
    const last30d = new Date(now.getTime() - 30 * DAY_MS);
    const [metricRows, dailyRows, topicRows, channelRows, repeatRows, needsAttention] = await Promise.all([
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].$queryRaw`
      WITH inbox_threads AS MATERIALIZED (
        SELECT t.*
        FROM threads t
        WHERE ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$inbox$2d$filter$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["canonicalInboxThreadSql"])(organizationId)}
          AND t.status IN ('open', 'closed')
      ),
      customer_thread_counts AS (
        SELECT customer_id, COUNT(*) AS thread_count
        FROM inbox_threads
        GROUP BY customer_id
      ),
      reply_counts AS (
        SELECT
          COUNT(*) FILTER (WHERE m.sender_type = 'ai') AS ai_replies,
          COUNT(*) FILTER (WHERE m.sender_type = 'agent') AS agent_replies
        FROM messages m
        INNER JOIN inbox_threads t ON t.id = m.thread_id
        WHERE m.deleted_at IS NULL
          AND m.sent_at >= ${weekStart}
          AND m.sent_at <= ${now}
      ),
      first_replies AS (
        SELECT
          t.id,
          MIN(m.sent_at) FILTER (WHERE m.sender_type = 'customer') AS first_customer,
          MIN(m.sent_at) FILTER (WHERE m.sender_type IN ('agent', 'ai')) AS first_response
        FROM inbox_threads t
        INNER JOIN messages m ON m.thread_id = t.id AND m.deleted_at IS NULL
        WHERE t.created_at >= ${weekStart}
          AND t.created_at <= ${now}
        GROUP BY t.id
      )
      SELECT
        COUNT(*) FILTER (WHERE t.status = 'open')::bigint AS open_count,
        (
          COUNT(*) FILTER (WHERE t.created_at >= ${todayStart} AND t.created_at <= ${now})
          - COUNT(*) FILTER (WHERE t.created_at >= ${yesterdayStart} AND t.created_at < ${todayStart})
        )::bigint AS open_delta,
        COUNT(*) FILTER (WHERE t.created_at >= ${weekStart} AND t.created_at <= ${now})::bigint AS weekly_volume,
        (
          SELECT ROUND(AVG(EXTRACT(EPOCH FROM (first_response - first_customer)) / 60))::int
          FROM first_replies
          WHERE first_customer IS NOT NULL
            AND first_response IS NOT NULL
            AND first_response > first_customer
        ) AS first_reply_minutes,
        (
          SELECT CASE
            WHEN ai_replies + agent_replies > 0
            THEN ROUND((ai_replies * 100.0) / (ai_replies + agent_replies))::int
            ELSE NULL
          END
          FROM reply_counts
        ) AS auto_resolved_pct,
        (
          SELECT COUNT(*)::bigint
          FROM messages m
          INNER JOIN inbox_threads reply_thread ON reply_thread.id = m.thread_id
          WHERE m.deleted_at IS NULL
            AND m.sender_type IN ('agent', 'ai')
            AND m.sent_at >= ${last24h}
            AND m.sent_at <= ${now}
        ) AS replies_sent_24h,
        COUNT(*) FILTER (
          WHERE t.status = 'closed'
            AND t.last_message_sender_type = 'ai'
            AND t.updated_at >= ${last24h}
            AND t.updated_at <= ${now}
        )::bigint AS overnight_cleared_count,
        (
          SELECT COUNT(*)::bigint
          FROM threads t
          WHERE ${currentPlanPredicate(organizationId)}
        ) AS needs_you_count,
        COUNT(*) FILTER (WHERE t.status = 'open' AND t.tag = 'Returns')::bigint AS refunds_pending,
        (
          SELECT COUNT(*)::bigint
          FROM inbox_threads vip_thread
          INNER JOIN customer_thread_counts customer_count
            ON customer_count.customer_id = vip_thread.customer_id
          WHERE vip_thread.status = 'open'
            AND customer_count.thread_count >= 3
        ) AS vips_in_queue,
        EXISTS (
          SELECT 1
          FROM messages m
          INNER JOIN inbox_threads sent_thread ON sent_thread.id = m.thread_id
          WHERE m.deleted_at IS NULL
            AND m.sender_type IN ('agent', 'ai')
        ) AS has_sent_reply
      FROM inbox_threads t
    `,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].$queryRaw`
      WITH inbox_threads AS MATERIALIZED (
        SELECT t.*
        FROM threads t
        WHERE ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$inbox$2d$filter$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["canonicalInboxThreadSql"])(organizationId)}
          AND t.status IN ('open', 'closed')
      ),
      days AS (
        SELECT generate_series(
          date_trunc('day', ${weekStart}::timestamptz AT TIME ZONE 'UTC'),
          date_trunc('day', ${todayStart}::timestamptz AT TIME ZONE 'UTC'),
          interval '1 day'
        ) AS day
      ),
      new_threads AS (
        SELECT date_trunc('day', t.created_at AT TIME ZONE 'UTC') AS day, COUNT(*)::bigint AS count
        FROM inbox_threads t
        WHERE t.created_at >= ${weekStart}
          AND t.created_at <= ${now}
        GROUP BY date_trunc('day', t.created_at AT TIME ZONE 'UTC')
      ),
      ai_resolved AS (
        SELECT date_trunc('day', t.updated_at AT TIME ZONE 'UTC') AS day, COUNT(*)::bigint AS count
        FROM inbox_threads t
        WHERE t.status = 'closed'
          AND t.last_message_sender_type = 'ai'
          AND t.updated_at >= ${weekStart}
          AND t.updated_at <= ${now}
        GROUP BY date_trunc('day', t.updated_at AT TIME ZONE 'UTC')
      ),
      replies AS (
        SELECT date_trunc('day', m.sent_at AT TIME ZONE 'UTC') AS day, COUNT(*)::bigint AS count
        FROM messages m
        INNER JOIN inbox_threads t ON t.id = m.thread_id
        WHERE m.deleted_at IS NULL
          AND m.sender_type IN ('agent', 'ai')
          AND m.sent_at >= ${weekStart}
          AND m.sent_at <= ${now}
        GROUP BY date_trunc('day', m.sent_at AT TIME ZONE 'UTC')
      )
      SELECT
        to_char(days.day, 'YYYY-MM-DD') AS day,
        COALESCE(new_threads.count, 0)::bigint AS new_threads,
        COALESCE(ai_resolved.count, 0)::bigint AS ai_resolved,
        COALESCE(replies.count, 0)::bigint AS total_replies
      FROM days
      LEFT JOIN new_threads ON new_threads.day = days.day
      LEFT JOIN ai_resolved ON ai_resolved.day = days.day
      LEFT JOIN replies ON replies.day = days.day
      ORDER BY days.day ASC
    `,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].$queryRaw`
      SELECT COALESCE(t.tag, 'General') AS tag, COUNT(*)::bigint AS count
      FROM threads t
      WHERE ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$inbox$2d$filter$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["canonicalInboxThreadSql"])(organizationId)}
        AND t.status = 'closed'
        AND t.last_message_sender_type = 'ai'
        AND t.updated_at >= ${last24h}
        AND t.updated_at <= ${now}
      GROUP BY COALESCE(t.tag, 'General')
      ORDER BY count DESC, tag ASC
      LIMIT ${__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$home$2f$summary$2d$contract$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["HOME_OVERNIGHT_TOPIC_LIMIT"]}
    `,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].$queryRaw`
      SELECT t.channel_type::text AS channel_type
      FROM threads t
      WHERE ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$inbox$2d$filter$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["canonicalInboxThreadSql"])(organizationId)}
        AND t.status = 'closed'
        AND t.last_message_sender_type = 'ai'
        AND t.updated_at >= ${last24h}
        AND t.updated_at <= ${now}
      GROUP BY t.channel_type
      ORDER BY COUNT(*) DESC, t.channel_type ASC
      LIMIT 5
    `,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$dist$2f$index$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].$queryRaw`
      SELECT
        c.id AS customer_id,
        c.name,
        c.platform_id,
        COUNT(t.id)::bigint AS ticket_count
      FROM threads t
      INNER JOIN customers c ON c.id = t.customer_id
      WHERE ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$inbox$2d$filter$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["canonicalInboxThreadSql"])(organizationId)}
        AND t.status IN ('open', 'closed')
        AND t.updated_at >= ${last30d}
        AND t.updated_at <= ${now}
      GROUP BY c.id, c.name, c.platform_id
      HAVING COUNT(t.id) >= 3
      ORDER BY ticket_count DESC, MAX(t.updated_at) DESC, c.id ASC
      LIMIT ${__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$home$2f$summary$2d$contract$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["HOME_REPEAT_CUSTOMER_LIMIT"]}
    `,
        loadNeedsAttention(organizationId, settings, now)
    ]);
    const metric = metricRows[0] ?? {
        open_count: BigInt(0),
        open_delta: BigInt(0),
        weekly_volume: BigInt(0),
        first_reply_minutes: null,
        auto_resolved_pct: null,
        replies_sent_24h: BigInt(0),
        overnight_cleared_count: BigInt(0),
        needs_you_count: BigInt(0),
        refunds_pending: BigInt(0),
        vips_in_queue: BigInt(0),
        has_sent_reply: false
    };
    const byDay = new Map(dailyRows.map((row)=>[
            row.day,
            row
        ]));
    const days = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$home$2f$summary$2d$contract$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["lastUtcDayKeys"])(now, 7);
    const topics = topicRows.map((row)=>({
            tag: row.tag,
            count: numberFromDb(row.count),
            subtitle: TAG_SUBTITLES[row.tag] ?? "auto-resolved"
        }));
    const repeatCustomers = repeatRows.map((row)=>{
        const name = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$customer$2d$name$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getCustomerName"])({
            name: row.name,
            platformId: row.platform_id
        });
        return {
            customerId: row.customer_id,
            name,
            initials: initialsOf(name),
            ticketCount: numberFromDb(row.ticket_count)
        };
    });
    return {
        generatedAt: now.toISOString(),
        metrics: {
            openCount: numberFromDb(metric.open_count),
            openDelta: numberFromDb(metric.open_delta),
            weeklyVolume: numberFromDb(metric.weekly_volume),
            firstReplyMinutes: metric.first_reply_minutes,
            autoResolvedPct: metric.auto_resolved_pct,
            repliesSent24h: numberFromDb(metric.replies_sent_24h),
            overnightClearedCount: numberFromDb(metric.overnight_cleared_count),
            needsYouCount: numberFromDb(metric.needs_you_count),
            refundsPending: numberFromDb(metric.refunds_pending),
            vipsInQueue: numberFromDb(metric.vips_in_queue),
            hasSentReply: metric.has_sent_reply
        },
        series: {
            days,
            newThreadsByDay: days.map((day)=>numberFromDb(byDay.get(day)?.new_threads ?? 0)),
            aiResolvedByDay: days.map((day)=>numberFromDb(byDay.get(day)?.ai_resolved ?? 0)),
            totalRepliesByDay: days.map((day)=>numberFromDb(byDay.get(day)?.total_replies ?? 0))
        },
        needsAttention,
        overnight: {
            topics,
            channelNames: channelRows.map((row)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$channels$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getChannelInfo"])(row.channel_type).name)
        },
        repeatCustomers
    };
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx [app-rsc] (client reference proxy) <module evaluation>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const __TURBOPACK__default__export__ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call the default export of [project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx <module evaluation> from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx <module evaluation>", "default");
}),
"[project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx [app-rsc] (client reference proxy)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const __TURBOPACK__default__export__ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call the default export of [project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx", "default");
}),
"[project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$home$2f$DashboardHomeClient$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__$3c$module__evaluation$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx [app-rsc] (client reference proxy) <module evaluation>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$home$2f$DashboardHomeClient$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx [app-rsc] (client reference proxy)");
;
__turbopack_context__.n(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$home$2f$DashboardHomeClient$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__);
}),
"[project]/apps/dashboard/src/app/dashboard/page.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>DashboardPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$nextjs$2f$dist$2f$esm$2f$app$2d$router$2f$server$2f$currentUser$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@clerk/nextjs/dist/esm/app-router/server/currentUser.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$org$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/server/org.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$home$2d$summary$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/server/home-summary.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$home$2f$DashboardHomeClient$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx [app-rsc] (ecmascript)");
;
;
;
;
;
async function DashboardPage() {
    const [org, user] = await Promise.all([
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$org$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getOrCreateOrg"])(),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$nextjs$2f$dist$2f$esm$2f$app$2d$router$2f$server$2f$currentUser$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["currentUser"])()
    ]);
    const initialSummary = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$server$2f$home$2d$summary$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getHomeSummary"])(org.id, org.settings);
    const userName = user?.firstName ?? user?.fullName ?? "there";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$home$2f$DashboardHomeClient$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {
        userName: userName,
        initialSummary: initialSummary
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/page.tsx",
        lineNumber: 14,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/dashboard/src/app/dashboard/page.tsx [app-rsc] (ecmascript, Next.js Server Component)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/page.tsx [app-rsc] (ecmascript)"));
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__07tywhs._.js.map