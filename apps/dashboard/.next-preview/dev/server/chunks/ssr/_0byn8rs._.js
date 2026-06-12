module.exports = [
"[project]/apps/dashboard/src/hooks/useMediaQuery.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useMediaQuery",
    ()=>useMediaQuery
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
;
function useMediaQuery(query) {
    const [matches, setMatches] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(undefined);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const mediaQuery = window.matchMedia(query);
        const update = ()=>setMatches(mediaQuery.matches);
        update();
        mediaQuery.addEventListener("change", update);
        return ()=>mediaQuery.removeEventListener("change", update);
    }, [
        query
    ]);
    return matches;
}
}),
"[project]/apps/dashboard/src/lib/attachments/blob-ref.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "BLOB_ATTACHMENT_PREFIX",
    ()=>BLOB_ATTACHMENT_PREFIX,
    "attachmentBelongsToOrg",
    ()=>attachmentBelongsToOrg,
    "attachmentFilename",
    ()=>attachmentFilename,
    "formatBlobAttachmentRef",
    ()=>formatBlobAttachmentRef,
    "isImageAttachmentRef",
    ()=>isImageAttachmentRef,
    "isImageAttachmentUrl",
    ()=>isImageAttachmentUrl,
    "isManagedAttachmentRef",
    ()=>isManagedAttachmentRef,
    "parseManagedAttachmentRef",
    ()=>parseManagedAttachmentRef,
    "toAttachmentDisplayUrl",
    ()=>toAttachmentDisplayUrl
]);
const BLOB_ATTACHMENT_PREFIX = 'blob:';
const VERCEL_BLOB_HOST_SUFFIX = '.blob.vercel-storage.com';
function formatBlobAttachmentRef(pathname) {
    return `${BLOB_ATTACHMENT_PREFIX}${pathname}`;
}
function parseManagedAttachmentRef(ref) {
    if (ref.startsWith(BLOB_ATTACHMENT_PREFIX)) {
        return ref.slice(BLOB_ATTACHMENT_PREFIX.length);
    }
    try {
        const url = new URL(ref);
        if (url.hostname.endsWith(VERCEL_BLOB_HOST_SUFFIX)) {
            const pathname = url.pathname.replace(/^\/+/, '');
            return pathname.length > 0 ? pathname : null;
        }
    } catch  {
        return null;
    }
    return null;
}
function isManagedAttachmentRef(ref) {
    return parseManagedAttachmentRef(ref) !== null;
}
function attachmentBelongsToOrg(pathname, organizationId) {
    return pathname.startsWith(`attachments/${organizationId}/`);
}
function attachmentFilename(pathname) {
    return pathname.split('/').at(-1) ?? 'attachment';
}
function toAttachmentDisplayUrl(ref) {
    if (isManagedAttachmentRef(ref)) {
        return `/api/attachments?ref=${encodeURIComponent(ref)}`;
    }
    return ref;
}
function isImageAttachmentRef(ref) {
    if (isManagedAttachmentRef(ref)) {
        const pathname = parseManagedAttachmentRef(ref);
        return pathname ? /\.(jpg|jpeg|png|gif|webp)$/i.test(pathname) : false;
    }
    return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(ref);
}
function isImageAttachmentUrl(url) {
    try {
        const parsed = new URL(url, 'http://localhost');
        if (parsed.pathname === '/api/attachments') {
            const ref = parsed.searchParams.get('ref');
            return ref ? isImageAttachmentRef(ref) : false;
        }
    } catch  {
    // Fall through to direct URL matching.
    }
    return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url);
}
}),
"[project]/apps/dashboard/src/lib/messaging/channels.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DASHBOARD_CHANNEL_TYPES",
    ()=>DASHBOARD_CHANNEL_TYPES,
    "getActionLogChannelInfo",
    ()=>getActionLogChannelInfo,
    "getChannelBadgeClassName",
    ()=>getChannelBadgeClassName,
    "getChannelInfo",
    ()=>getChannelInfo,
    "getChannelLabel",
    ()=>getChannelLabel,
    "getChannelOptions",
    ()=>getChannelOptions
]);
const DEFAULT_CHANNEL_INFO = {
    name: 'Workspace',
    label: 'Workspace',
    logo: '/logos/default.svg',
    badgeClassName: 'bg-muted text-muted-foreground'
};
const CHANNEL_INFO = {
    ig_dm: {
        name: 'Instagram',
        label: 'Instagram',
        logo: '/logos/instagram-outline.svg',
        badgeClassName: 'bg-pink-500/15 text-pink-400'
    },
    email: {
        name: 'Email',
        label: 'Email',
        logo: '/logos/email.svg',
        badgeClassName: 'bg-blue-500/15 text-blue-400'
    },
    tiktok: {
        name: 'TikTok',
        label: 'TikTok',
        logo: '/logos/tiktok-logo.png',
        badgeClassName: 'bg-slate-500/15 text-slate-400'
    },
    shopify: {
        name: 'Shopify',
        label: 'Shopify',
        logo: '/logos/shopify.svg',
        badgeClassName: 'bg-green-500/15 text-green-400'
    },
    sms: {
        name: 'SMS',
        label: 'SMS',
        logo: '/logos/sms.svg',
        badgeClassName: 'bg-emerald-500/15 text-emerald-400'
    },
    sms_agent: {
        name: 'Telegram',
        label: 'Telegram',
        logo: '/logos/sms.svg',
        badgeClassName: 'bg-emerald-500/15 text-emerald-400'
    },
    dashboard_agent: {
        name: 'Dashboard',
        label: 'Dashboard',
        logo: '/logos/sms.svg',
        badgeClassName: 'bg-violet-500/15 text-violet-400'
    }
};
const EXTRA_CHANNEL_INFO = {
    whatsapp: {
        name: 'WhatsApp',
        label: 'WhatsApp',
        logo: '/logos/default.svg',
        badgeClassName: 'bg-muted text-muted-foreground'
    }
};
const DASHBOARD_CHANNEL_TYPES = [
    'email',
    'ig_dm',
    'sms',
    'shopify',
    'tiktok',
    'dashboard_agent',
    'sms_agent'
];
function getChannelInfo(channelType) {
    if (!channelType) return DEFAULT_CHANNEL_INFO;
    return CHANNEL_INFO[channelType] ?? EXTRA_CHANNEL_INFO[channelType] ?? {
        ...DEFAULT_CHANNEL_INFO,
        name: channelType,
        label: channelType
    };
}
function getActionLogChannelInfo(entry) {
    const instruction = entry.instruction?.trim();
    if (instruction?.startsWith('order-risk-review:')) {
        return getChannelInfo('shopify');
    }
    return getChannelInfo(entry.channelType);
}
function getChannelLabel(channelType, { operatorLabel = "canonical" } = {}) {
    if (operatorLabel === "internal" && (channelType === "dashboard_agent" || channelType === "sms_agent")) {
        return "Internal";
    }
    return getChannelInfo(channelType).label;
}
function getChannelBadgeClassName(channelType) {
    return getChannelInfo(channelType).badgeClassName;
}
function getChannelOptions(channelTypes = DASHBOARD_CHANNEL_TYPES) {
    return channelTypes.map((id)=>({
            id,
            label: getChannelLabel(id)
        }));
}
}),
"[project]/apps/dashboard/src/lib/messaging/customer-name.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/packages/agent/dist/tools/turn-content.js [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AGENT_TURN_PREFIX",
    ()=>AGENT_TURN_PREFIX,
    "LEGACY_AGENT_TURN_PREFIX",
    ()=>LEGACY_AGENT_TURN_PREFIX,
    "getAgentTurnPrefixLength",
    ()=>getAgentTurnPrefixLength,
    "isAgentTurnContent",
    ()=>isAgentTurnContent
]);
const LEGACY_AGENT_TURN_PREFIX = "__clerk_agent__";
const AGENT_TURN_PREFIX = "__shopkeeper_agent__";
const AGENT_TURN_PREFIXES = [
    AGENT_TURN_PREFIX,
    LEGACY_AGENT_TURN_PREFIX
];
function isAgentTurnContent(contentText) {
    if (!contentText) return false;
    return AGENT_TURN_PREFIXES.some((prefix)=>contentText.startsWith(prefix));
}
function getAgentTurnPrefixLength(contentText) {
    for (const prefix of AGENT_TURN_PREFIXES){
        if (contentText.startsWith(prefix)) {
            return prefix.length;
        }
    }
    return null;
}
}),
"[project]/packages/agent/dist/plan-cache-shape.js [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/packages/agent/dist/thread-constants.js [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/apps/dashboard/src/app/dashboard/tickets/_lib/thread-to-ticket.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "threadToTicket",
    ()=>threadToTicket
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$attachments$2f$blob$2d$ref$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/attachments/blob-ref.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$channels$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/messaging/channels.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$customer$2d$name$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/messaging/customer-name.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$format$2f$date$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/format/date.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/index.js [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$turn$2d$content$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/turn-content.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$plan$2d$cache$2d$shape$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/plan-cache-shape.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/thread-constants.js [app-ssr] (ecmascript)");
;
;
;
;
;
;
;
function threadToTicket(thread, agentName) {
    const channel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$channels$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getChannelInfo"])(thread.channelType);
    const lastMsg = thread.messages.filter((message)=>message.senderType !== __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SENDER_TYPE"].NOTE).at(-1);
    const lastCustomerMessageId = lastMsg?.senderType === __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SENDER_TYPE"].CUSTOMER ? lastMsg.id : null;
    const planIsForLastMessage = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$plan$2d$cache$2d$shape$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getCurrentPlanForThread"])(thread, lastCustomerMessageId) !== null;
    return {
        id: thread.id,
        channelType: thread.channelType,
        platform: channel.name,
        logo: channel.logo,
        customer: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$customer$2d$name$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getCustomerName"])(thread.customer),
        time: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$format$2f$date$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatTicketAge"])(thread.lastMessageAt),
        subject: thread.subject || "New Inquiry",
        preview: lastMsg?.contentText || "No messages yet.",
        tag: thread.tag || "Support",
        tagColor: "text-slate-500 bg-slate-100 border-slate-200",
        aiSummary: thread.aiSummary || `${agentName ?? "Shopkeeper"} is reading this ticket…`,
        status: thread.status,
        lastCustomerMessageAt: thread.messages.filter((message)=>message.senderType === __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SENDER_TYPE"].CUSTOMER).at(-1)?.sentAt ?? null,
        hasPlan: planIsForLastMessage,
        filterStatus: thread.filterStatus,
        filterReason: thread.filterReason,
        messages: thread.messages.flatMap((message)=>{
            if (message.senderType === __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SENDER_TYPE"].NOTE && (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$turn$2d$content$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isAgentTurnContent"])(message.contentText)) return [];
            const isAgentNote = message.senderType === __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SENDER_TYPE"].NOTE && (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isAgentNoteContent"])(message.contentText);
            return [
                {
                    id: message.id,
                    sender: message.senderType,
                    text: isAgentNote ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["stripAgentNotePrefix"])(message.contentText) : message.contentText,
                    time: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$format$2f$date$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatTime"])(message.sentAt),
                    author: message.senderType === __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SENDER_TYPE"].NOTE ? isAgentNote ? agentName ?? "Agent" : "You" : undefined,
                    isAgentNote,
                    attachments: (message.attachments ?? []).map(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$attachments$2f$blob$2d$ref$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["toAttachmentDisplayUrl"]),
                    sendStatus: message.sendStatus
                }
            ];
        })
    };
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_hooks/useActiveThreadSelection.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useActiveThreadSelection",
    ()=>useActiveThreadSelection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/swr/dist/index/index.mjs [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/fetcher.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_lib$2f$thread$2d$to$2d$ticket$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_lib/thread-to-ticket.ts [app-ssr] (ecmascript)");
;
;
;
;
function createLoadingTicket(threadId) {
    return {
        id: threadId,
        channelType: 'email',
        platform: 'Conversation',
        logo: '',
        customer: 'Loading conversation',
        time: 'Now',
        subject: 'Loading conversation',
        preview: '',
        tag: 'Support',
        tagColor: 'text-slate-500 bg-slate-100 border-slate-200',
        aiSummary: '',
        status: 'open',
        lastCustomerMessageAt: null,
        hasPlan: false,
        filterStatus: 'genuine',
        filterReason: null,
        messages: []
    };
}
function useActiveThreadSelection({ queryThreadId, activeTab, openThreads, closedThreads, filteredThreads, searchThreads, agentName }) {
    const [activeTicketId, setActiveTicketId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const appliedQueryThreadRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const activeThreadKey = activeTicketId ? `/api/threads/${activeTicketId}` : null;
    const { data: activeThreadData, error: activeThreadError, mutate: mutateActiveThread } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"])(activeThreadKey, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["fetcher"]);
    const activeThread = activeThreadData?.thread;
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!queryThreadId) {
            appliedQueryThreadRef.current = null;
            return;
        }
        if (appliedQueryThreadRef.current === queryThreadId) return;
        appliedQueryThreadRef.current = queryThreadId;
        setActiveTicketId((current)=>current === queryThreadId ? current : queryThreadId);
    }, [
        queryThreadId
    ]);
    const effectiveActiveTab = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (queryThreadId) {
            if (activeThread?.id === queryThreadId) {
                if (activeThread.filterStatus === 'filtered') return 'filtered';
                return activeThread.status === 'closed' ? 'closed' : 'open';
            }
            if (openThreads.some((thread)=>thread.id === queryThreadId)) return 'open';
            if (closedThreads.some((thread)=>thread.id === queryThreadId)) return 'closed';
            if (filteredThreads.some((thread)=>thread.id === queryThreadId)) return 'filtered';
        }
        return activeTab;
    }, [
        activeTab,
        activeThread,
        closedThreads,
        filteredThreads,
        openThreads,
        queryThreadId
    ]);
    const activeTicket = activeThread ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_lib$2f$thread$2d$to$2d$ticket$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["threadToTicket"])(activeThread, agentName) : undefined;
    const activeThreadPreview = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (!activeTicketId) return undefined;
        return openThreads.find((thread)=>thread.id === activeTicketId) ?? closedThreads.find((thread)=>thread.id === activeTicketId) ?? filteredThreads.find((thread)=>thread.id === activeTicketId) ?? searchThreads.find((thread)=>thread.id === activeTicketId);
    }, [
        activeTicketId,
        closedThreads,
        filteredThreads,
        openThreads,
        searchThreads
    ]);
    const activeTicketPreview = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>activeThreadPreview ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_lib$2f$thread$2d$to$2d$ticket$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["threadToTicket"])(activeThreadPreview, agentName) : undefined, [
        activeThreadPreview,
        agentName
    ]);
    const isConversationLoading = Boolean(activeTicketId && !activeThread && !activeThreadError);
    const conversationTicket = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (activeTicket) return activeTicket;
        if (!isConversationLoading || !activeTicketId) return undefined;
        return activeTicketPreview ?? createLoadingTicket(activeTicketId);
    }, [
        activeTicket,
        activeTicketId,
        activeTicketPreview,
        isConversationLoading
    ]);
    return {
        activeTicketId,
        setActiveTicketId,
        activeThread,
        activeThreadData,
        activeThreadError,
        activeThreadPreview,
        activeTicket,
        activeTicketPreview,
        conversationTicket,
        effectiveActiveTab,
        isConversationLoading,
        mutateActiveThread
    };
}
}),
"[project]/packages/agent/dist/turns.js [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "agentTurnMessageFilter",
    ()=>agentTurnMessageFilter,
    "excludeAgentTurnMessages",
    ()=>excludeAgentTurnMessages,
    "extractAgentTurnsFromMessages",
    ()=>extractAgentTurnsFromMessages,
    "serializeAgentTurn",
    ()=>serializeAgentTurn
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$turn$2d$content$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/turn-content.js [app-ssr] (ecmascript)");
;
function toNoteShape(turn) {
    return {
        ...turn.id ? {
            id: turn.id
        } : {},
        instruction: turn.instruction,
        summary: turn.summary,
        error: turn.error,
        ...turn.mode ? {
            mode: turn.mode
        } : {},
        ...turn.senderPhone !== undefined ? {
            senderPhone: turn.senderPhone
        } : {},
        ...turn.clerkUserId !== undefined ? {
            clerkUserId: turn.clerkUserId
        } : {}
    };
}
function serializeAgentTurn(turn) {
    return `${__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$turn$2d$content$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AGENT_TURN_PREFIX"]}${JSON.stringify(toNoteShape(turn))}`;
}
function parseAgentTurn(contentText) {
    if (!contentText) return null;
    const prefixLength = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$turn$2d$content$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getAgentTurnPrefixLength"])(contentText);
    if (prefixLength === null) return null;
    try {
        const parsed = JSON.parse(contentText.slice(prefixLength));
        return {
            ...parsed.id ? {
                id: parsed.id
            } : {},
            instruction: parsed.instruction ?? "",
            // Legacy notes carry the full actions array; new notes omit it because
            // AgentAction is now the canonical per-tool record. Hydration happens in
            // extractAgentTurnsFromMessages when an actionsByTurnId map is supplied.
            actions: Array.isArray(parsed.actions) ? parsed.actions : [],
            summary: parsed.summary ?? null,
            error: parsed.error ?? null,
            ...parsed.mode ? {
                mode: parsed.mode
            } : {},
            ...parsed.senderPhone !== undefined ? {
                senderPhone: parsed.senderPhone
            } : {},
            ...parsed.clerkUserId !== undefined ? {
                clerkUserId: parsed.clerkUserId
            } : {}
        };
    } catch  {
        return null;
    }
}
function extractAgentTurnsFromMessages(messages, actionsByTurnId) {
    return messages.map((message)=>parseAgentTurn(message.contentText)).filter((turn)=>turn !== null).map((turn)=>{
        if (!actionsByTurnId || !turn.id) return turn;
        const hydrated = actionsByTurnId[turn.id];
        return hydrated ? {
            ...turn,
            actions: hydrated
        } : turn;
    });
}
function excludeAgentTurnMessages(messages) {
    return messages.filter((message)=>!(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$turn$2d$content$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isAgentTurnContent"])(message.contentText));
}
const agentTurnMessageFilter = {
    senderType: "note",
    OR: [
        {
            contentText: {
                startsWith: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$turn$2d$content$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AGENT_TURN_PREFIX"]
            }
        },
        {
            contentText: {
                startsWith: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$turn$2d$content$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["LEGACY_AGENT_TURN_PREFIX"]
            }
        }
    ]
};
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_hooks/useAgentTurns.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useAgentTurns",
    ()=>useAgentTurns
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$turns$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/turns.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/thread-constants.js [app-ssr] (ecmascript)");
;
;
;
function useAgentTurns({ activeTicketId, activeThread, agentActionsByTurnId, patchThreadCaches, revalidateThreadCaches }) {
    const [agentTurnsByThread, setAgentTurnsByThread] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({});
    const [agentRunningThread, setAgentRunningThread] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const activeAgentTurns = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const dbTurns = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$turns$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["extractAgentTurnsFromMessages"])(activeThread?.messages ?? [], agentActionsByTurnId);
        const errorTurns = activeTicketId ? agentTurnsByThread[activeTicketId] ?? [] : [];
        return [
            ...dbTurns,
            ...errorTurns
        ];
    }, [
        activeThread?.messages,
        activeTicketId,
        agentActionsByTurnId,
        agentTurnsByThread
    ]);
    const isAgentRunning = agentRunningThread === activeTicketId;
    const handleAgentTurnAdd = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((turn)=>{
        if (!activeTicketId) return;
        setAgentTurnsByThread((prev)=>({
                ...prev,
                [activeTicketId]: [
                    ...prev[activeTicketId] ?? [],
                    turn
                ]
            }));
    }, [
        activeTicketId
    ]);
    const handleAgentRunningChange = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((running)=>{
        setAgentRunningThread(running ? activeTicketId : null);
    }, [
        activeTicketId
    ]);
    const handleAgentComplete = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((turn)=>{
        if (!activeTicketId) return;
        const threadId = activeTicketId;
        const optimisticMsg = {
            id: `agent-turn-${Date.now()}`,
            threadId,
            senderType: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SENDER_TYPE"].NOTE,
            contentText: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$turns$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["serializeAgentTurn"])(turn),
            mediaUrl: null,
            attachments: [],
            sentAt: new Date().toISOString()
        };
        void (async ()=>{
            await patchThreadCaches(threadId, (thread)=>({
                    ...thread,
                    messages: [
                        ...thread.messages,
                        optimisticMsg
                    ]
                }));
            await revalidateThreadCaches();
        })();
    }, [
        activeTicketId,
        patchThreadCaches,
        revalidateThreadCaches
    ]);
    return {
        activeAgentTurns,
        isAgentRunning,
        handleAgentTurnAdd,
        handleAgentRunningChange,
        handleAgentComplete
    };
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_hooks/usePaginatedThreads.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "usePaginatedThreads",
    ()=>usePaginatedThreads
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$infinite$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/swr/dist/infinite/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/fetcher.ts [app-ssr] (ecmascript)");
;
;
;
const PAGINATED_LIMIT = 25;
function useIsDocumentVisible() {
    const [isVisible, setIsVisible] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(typeof document !== "undefined" ? document.visibilityState === "visible" : true);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const handler = ()=>setIsVisible(document.visibilityState === "visible");
        document.addEventListener("visibilitychange", handler);
        return ()=>document.removeEventListener("visibilitychange", handler);
    }, []);
    return isVisible;
}
function usePaginatedThreads(status = "open", initialData, preview = false, filterStatus, needsReply = false, enabled = true) {
    const isVisible = useIsDocumentVisible();
    const baseInterval = status === "open" ? 15000 : 60000;
    const getKey = (pageIndex, previousPageData)=>{
        if (!enabled) return null;
        if (previousPageData && !previousPageData.nextCursor) return null;
        const filterParam = filterStatus ? `&filterStatus=${filterStatus}` : "";
        const needsReplyParam = needsReply ? "&needsReply=true" : "";
        const countParam = pageIndex === 0 ? "&includeCount=true" : "";
        const base = `/api/threads?status=${status}&limit=${PAGINATED_LIMIT}${preview ? "&preview=true" : ""}${filterParam}${needsReplyParam}${countParam}`;
        if (pageIndex === 0) return base;
        return `${base}&cursor=${previousPageData.nextCursor}`;
    };
    const fbData = initialData && !needsReply ? [
        {
            threads: initialData,
            nextCursor: null
        }
    ] : undefined;
    const { data: pages, error, isLoading, size, setSize, mutate: swrMutate } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$infinite$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"])(getKey, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["fetcher"], {
        refreshInterval: isVisible && enabled ? baseInterval : 0,
        fallbackData: fbData,
        revalidateFirstPage: true
    });
    const threads = pages?.flatMap((page)=>page.threads) ?? [];
    const totalCount = pages?.[0]?.totalCount;
    const lastPage = pages?.[pages.length - 1];
    const hasMore = !!lastPage?.nextCursor;
    const isLoadingMore = size > (pages?.length ?? 0);
    const loadMore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>setSize((currentSize)=>currentSize + 1), [
        setSize
    ]);
    const removeThreadById = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (id)=>{
        await swrMutate((currentPages = [])=>currentPages.map((page)=>({
                    ...page,
                    threads: page.threads.filter((t)=>t.id !== id)
                })), false);
    }, [
        swrMutate
    ]);
    const prependThread = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (thread)=>{
        await swrMutate((currentPages = [])=>{
            if (currentPages.length === 0) return [
                {
                    threads: [
                        thread
                    ],
                    nextCursor: null
                }
            ];
            return currentPages.map((page, i)=>i === 0 ? {
                    ...page,
                    threads: [
                        thread,
                        ...page.threads.filter((t)=>t.id !== thread.id)
                    ]
                } : {
                    ...page,
                    threads: page.threads.filter((t)=>t.id !== thread.id)
                });
        }, false);
    }, [
        swrMutate
    ]);
    const mutate = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (updater, revalidate = true)=>{
        if (updater === undefined) {
            const result = await swrMutate();
            return result?.flatMap((page)=>page.threads);
        }
        const result = await swrMutate((currentPages = [])=>currentPages.map((page)=>({
                    ...page,
                    threads: page.threads.map((thread)=>updater.find((updated)=>updated.id === thread.id) ?? thread)
                })), revalidate);
        return result?.flatMap((page)=>page.threads);
    }, [
        swrMutate
    ]);
    return {
        threads,
        totalCount,
        isLoading,
        error,
        mutate,
        removeThreadById,
        prependThread,
        loadMore,
        hasMore,
        isLoadingMore
    };
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_hooks/useTicketTabCounts.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CLOSED_THREAD_COUNT_KEY",
    ()=>CLOSED_THREAD_COUNT_KEY,
    "FILTERED_THREAD_COUNT_KEY",
    ()=>FILTERED_THREAD_COUNT_KEY,
    "buildOpenThreadCountKey",
    ()=>buildOpenThreadCountKey,
    "useTicketTabCounts",
    ()=>useTicketTabCounts
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/swr/dist/index/index.mjs [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/fetcher.ts [app-ssr] (ecmascript)");
;
;
;
const TAB_COUNT_REFRESH_MS = 60_000;
function buildOpenThreadCountKey(needsReply) {
    return needsReply ? "/api/threads?status=open&count=true&needsReply=true" : "/api/threads?status=open&count=true";
}
const CLOSED_THREAD_COUNT_KEY = "/api/threads?status=closed&count=true";
const FILTERED_THREAD_COUNT_KEY = "/api/threads?status=open&count=true&filterStatus=filtered";
function useTicketTabCounts({ needsReply, openCountFromList }) {
    const openCountKey = buildOpenThreadCountKey(needsReply);
    const skipOpenCountPoll = openCountFromList !== null;
    const { data: openData, mutate: mutateOpenCount } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"])(skipOpenCountPoll ? null : openCountKey, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["fetcher"], {
        refreshInterval: TAB_COUNT_REFRESH_MS,
        revalidateOnFocus: false
    });
    const { data: closedData, mutate: mutateClosedCount } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"])(CLOSED_THREAD_COUNT_KEY, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["fetcher"], {
        refreshInterval: TAB_COUNT_REFRESH_MS,
        revalidateOnFocus: false
    });
    const { data: filteredData, mutate: mutateFilteredCount } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"])(FILTERED_THREAD_COUNT_KEY, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["fetcher"], {
        refreshInterval: TAB_COUNT_REFRESH_MS,
        revalidateOnFocus: false
    });
    const mutateTabCounts = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        await Promise.all([
            skipOpenCountPoll ? Promise.resolve() : mutateOpenCount(),
            mutateClosedCount(),
            mutateFilteredCount()
        ]);
    }, [
        mutateClosedCount,
        mutateFilteredCount,
        mutateOpenCount,
        skipOpenCountPoll
    ]);
    return {
        openCount: openCountFromList ?? openData?.count ?? 0,
        closedCount: closedData?.count ?? 0,
        spamCount: filteredData?.count ?? 0,
        mutateTabCounts
    };
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_hooks/useSummaryRefresh.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useSummaryRefresh",
    ()=>useSummaryRefresh
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
;
function errorMessage(error, fallback) {
    return error instanceof Error && error.message ? error.message : fallback;
}
function useSummaryRefresh({ patchThreadCaches, showToast }) {
    const [refreshingSummaryId, setRefreshingSummaryId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const refreshingSummaryIdsRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(new Set());
    const patchThreadSummary = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (threadId, summary)=>{
        await patchThreadCaches(threadId, (thread)=>({
                ...thread,
                aiSummary: summary
            }));
    }, [
        patchThreadCaches
    ]);
    const handleRefreshSummary = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (threadId)=>{
        if (refreshingSummaryIdsRef.current.has(threadId)) return;
        refreshingSummaryIdsRef.current.add(threadId);
        setRefreshingSummaryId(threadId);
        try {
            const res = await fetch('/api/ai/summary', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    threadId
                })
            });
            const data = await res.json().catch(()=>null);
            if (!res.ok) {
                throw new Error(typeof data?.error === 'string' && data.error.trim() ? data.error : `Server error: ${res.status}`);
            }
            await patchThreadSummary(threadId, typeof data?.summary === 'string' ? data.summary : null);
        } catch (err) {
            showToast(errorMessage(err, 'Failed to refresh summary.'), 'error');
        } finally{
            refreshingSummaryIdsRef.current.delete(threadId);
            setRefreshingSummaryId((current)=>current === threadId ? null : current);
        }
    }, [
        patchThreadSummary,
        showToast
    ]);
    return {
        refreshingSummaryId,
        handleRefreshSummary
    };
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_hooks/useTicketActions.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useTicketActions",
    ()=>useTicketActions
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/thread-constants.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/fetcher.ts [app-ssr] (ecmascript)");
;
;
;
const jsonPost = (body)=>({
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
const jsonPatch = (body)=>({
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
function useTicketActions({ activeTicketId, patchThreadCaches, revalidateThreadCaches, moveThreadStatus, moveThreadFilterStatus, setActiveTicketId, setSelectedIds }) {
    const [replyText, setReplyText] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('');
    const [isSending, setIsSending] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [sendError, setSendError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [toast, setToast] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [failedMessages, setFailedMessages] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const toastTimeoutRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const showToast = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((message, tone = 'success')=>{
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        setToast({
            message,
            tone
        });
        toastTimeoutRef.current = setTimeout(()=>setToast(null), 2500);
    }, []);
    const handleSendMessage = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (noteMode)=>{
        if (!replyText.trim() || !activeTicketId) return;
        const threadId = activeTicketId;
        const textToSend = replyText;
        setReplyText('');
        setIsSending(true);
        setSendError(null);
        const optimisticMessage = {
            id: `temp-${Date.now()}`,
            threadId,
            senderType: noteMode ? __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SENDER_TYPE"].NOTE : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SENDER_TYPE"].AGENT,
            contentText: textToSend,
            mediaUrl: null,
            attachments: [],
            sentAt: new Date().toISOString()
        };
        await patchThreadCaches(threadId, (thread)=>({
                ...thread,
                messages: [
                    ...thread.messages,
                    optimisticMessage
                ]
            }));
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["requestOk"])('/api/messages', jsonPost({
                threadId,
                text: textToSend,
                isNote: noteMode
            }), 'Failed to send message');
            await revalidateThreadCaches();
        } catch (err) {
            console.error('Failed to send message', err);
            setSendError((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["errorMessageFromUnknown"])(err, 'Failed to send message.'));
            setFailedMessages((prev)=>[
                    ...prev,
                    {
                        id: optimisticMessage.id,
                        threadId,
                        text: textToSend,
                        isNote: noteMode
                    }
                ]);
            await revalidateThreadCaches();
        } finally{
            setIsSending(false);
        }
    }, [
        activeTicketId,
        patchThreadCaches,
        replyText,
        revalidateThreadCaches
    ]);
    const handleResolve = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        if (!activeTicketId) return;
        const resolvedId = activeTicketId;
        await moveThreadStatus(resolvedId, 'closed');
        setActiveTicketId(null);
        showToast('Ticket resolved');
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["requestOk"])(`/api/threads/${resolvedId}`, jsonPatch({
                status: 'closed'
            }), 'Failed to close ticket');
            revalidateThreadCaches();
        } catch (err) {
            console.error('Failed to resolve ticket', err);
            await revalidateThreadCaches();
            showToast((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["errorMessageFromUnknown"])(err, 'Failed to close ticket.'), 'error');
        }
    }, [
        activeTicketId,
        moveThreadStatus,
        revalidateThreadCaches,
        setActiveTicketId,
        showToast
    ]);
    const handleReopen = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        if (!activeTicketId) return;
        const reopenId = activeTicketId;
        await moveThreadStatus(reopenId, 'open');
        setActiveTicketId(null);
        showToast('Ticket reopened');
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["requestOk"])(`/api/threads/${reopenId}`, jsonPatch({
                status: 'open'
            }), 'Failed to reopen ticket');
            revalidateThreadCaches();
        } catch (err) {
            console.error('Failed to reopen ticket', err);
            await revalidateThreadCaches();
            showToast((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["errorMessageFromUnknown"])(err, 'Failed to reopen ticket.'), 'error');
        }
    }, [
        activeTicketId,
        moveThreadStatus,
        revalidateThreadCaches,
        setActiveTicketId,
        showToast
    ]);
    const handleLinkShopifyCustomer = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (customerId)=>{
        if (!activeTicketId) return;
        const threadId = activeTicketId;
        await patchThreadCaches(threadId, (thread)=>({
                ...thread,
                shopifyCustomerId: customerId
            }));
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["requestOk"])(`/api/threads/${threadId}`, jsonPatch({
                shopifyCustomerId: customerId
            }), 'Failed to link Shopify customer');
            await revalidateThreadCaches();
        } catch (err) {
            console.error('Failed to link Shopify customer', err);
            await revalidateThreadCaches();
            throw err;
        }
    }, [
        activeTicketId,
        patchThreadCaches,
        revalidateThreadCaches
    ]);
    const handleRetry = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (id)=>{
        const failed = failedMessages.find((m)=>m.id === id);
        if (!failed) return;
        setFailedMessages((prev)=>prev.filter((m)=>m.id !== id));
        setSendError(null);
        const optimisticMessage = {
            id,
            threadId: failed.threadId,
            senderType: failed.isNote ? __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SENDER_TYPE"].NOTE : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SENDER_TYPE"].AGENT,
            contentText: failed.text,
            mediaUrl: null,
            attachments: [],
            sentAt: new Date().toISOString()
        };
        await patchThreadCaches(failed.threadId, (thread)=>({
                ...thread,
                messages: [
                    ...thread.messages,
                    optimisticMessage
                ]
            }));
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["requestOk"])('/api/messages', jsonPost({
                threadId: failed.threadId,
                text: failed.text,
                isNote: failed.isNote
            }), 'Failed to retry message');
            await revalidateThreadCaches();
        } catch (err) {
            console.error('Failed to retry message', err);
            setSendError((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["errorMessageFromUnknown"])(err, 'Failed to retry message.'));
            setFailedMessages((prev)=>[
                    ...prev,
                    failed
                ]);
            await revalidateThreadCaches();
        }
    }, [
        failedMessages,
        patchThreadCaches,
        revalidateThreadCaches
    ]);
    // Persisted async outbound send (sendStatus 'failed') — re-enqueue it. Distinct
    // from handleRetry, which re-POSTs an optimistic message that never persisted.
    const handleRetrySend = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (messageId)=>{
        if (!activeTicketId) return;
        const threadId = activeTicketId;
        await patchThreadCaches(threadId, (thread)=>({
                ...thread,
                messages: thread.messages.map((m)=>m.id === messageId ? {
                        ...m,
                        sendStatus: 'pending'
                    } : m)
            }));
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["requestOk"])('/api/messages/retry', jsonPost({
                messageId
            }), 'Failed to retry message');
            await revalidateThreadCaches();
        } catch (err) {
            console.error('Failed to retry send', err);
            showToast((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["errorMessageFromUnknown"])(err, 'Failed to retry message.'), 'error');
            await revalidateThreadCaches();
        }
    }, [
        activeTicketId,
        patchThreadCaches,
        revalidateThreadCaches,
        showToast
    ]);
    const handleBulkClose = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (selectedIds)=>{
        if (selectedIds.length === 0) return;
        const ids = [
            ...selectedIds
        ];
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["requestOk"])('/api/threads/bulk', jsonPatch({
                ids,
                action: 'close'
            }), 'Failed to close selected tickets');
            await revalidateThreadCaches();
            setSelectedIds([]);
            if (activeTicketId && ids.includes(activeTicketId)) setActiveTicketId(null);
            showToast(`${ids.length} ticket${ids.length !== 1 ? 's' : ''} closed`);
        } catch (err) {
            console.error('Bulk close failed', err);
            showToast((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["errorMessageFromUnknown"])(err, 'Failed to close selected tickets.'), 'error');
        }
    }, [
        activeTicketId,
        revalidateThreadCaches,
        setActiveTicketId,
        setSelectedIds,
        showToast
    ]);
    const handleBulkArchive = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (selectedIds)=>{
        if (selectedIds.length === 0) return;
        const ids = [
            ...selectedIds
        ];
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["requestOk"])('/api/threads/bulk', jsonPatch({
                ids,
                action: 'archive'
            }), 'Failed to archive selected tickets');
            await revalidateThreadCaches();
            setSelectedIds([]);
            if (activeTicketId && ids.includes(activeTicketId)) setActiveTicketId(null);
            showToast(`${ids.length} ticket${ids.length !== 1 ? 's' : ''} archived`);
        } catch (err) {
            console.error('Bulk archive failed', err);
            showToast((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["errorMessageFromUnknown"])(err, 'Failed to archive selected tickets.'), 'error');
        }
    }, [
        activeTicketId,
        revalidateThreadCaches,
        setActiveTicketId,
        setSelectedIds,
        showToast
    ]);
    const handleMarkAsSpam = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (threadId)=>{
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["requestOk"])(`/api/threads/${threadId}`, jsonPatch({
                filterStatus: 'filtered',
                filterFeedback: 'confirmed_spam'
            }), 'Failed to mark as spam');
            await moveThreadFilterStatus(threadId, 'filtered', 'confirmed_spam');
            await revalidateThreadCaches();
            if (activeTicketId === threadId) setActiveTicketId(null);
            showToast('Marked as spam');
        } catch (err) {
            console.error('Failed to mark as spam', err);
            showToast((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["errorMessageFromUnknown"])(err, 'Failed to mark as spam.'), 'error');
        }
    }, [
        activeTicketId,
        moveThreadFilterStatus,
        revalidateThreadCaches,
        setActiveTicketId,
        showToast
    ]);
    const handleRecover = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (threadId)=>{
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["requestOk"])(`/api/threads/${threadId}`, jsonPatch({
                filterStatus: 'genuine',
                filterFeedback: 'confirmed_genuine'
            }), 'Failed to recover thread');
            await moveThreadFilterStatus(threadId, 'genuine', 'confirmed_genuine');
            await revalidateThreadCaches();
            if (activeTicketId === threadId) setActiveTicketId(null);
            showToast('Recovered to inbox');
        } catch (err) {
            console.error('Failed to recover thread', err);
            showToast((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["errorMessageFromUnknown"])(err, 'Failed to recover thread.'), 'error');
        }
    }, [
        activeTicketId,
        moveThreadFilterStatus,
        revalidateThreadCaches,
        setActiveTicketId,
        showToast
    ]);
    const handleBulkTag = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (selectedIds, tag)=>{
        const trimmedTag = tag.trim();
        if (selectedIds.length === 0 || !trimmedTag) return;
        const ids = [
            ...selectedIds
        ];
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["requestOk"])('/api/threads/bulk', jsonPatch({
                ids,
                action: 'tag',
                tag: trimmedTag
            }), 'Failed to tag selected tickets');
            await revalidateThreadCaches();
            setSelectedIds([]);
            showToast(`Tagged ${ids.length} ticket${ids.length !== 1 ? 's' : ''}`);
        } catch (err) {
            console.error('Bulk tag failed', err);
            showToast((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["errorMessageFromUnknown"])(err, 'Failed to tag selected tickets.'), 'error');
        }
    }, [
        revalidateThreadCaches,
        setSelectedIds,
        showToast
    ]);
    return {
        replyText,
        setReplyText,
        isSending,
        sendError,
        setSendError,
        toast,
        failedMessages,
        showToast,
        handleSendMessage,
        handleRetry,
        handleRetrySend,
        handleResolve,
        handleReopen,
        handleLinkShopifyCustomer,
        handleBulkClose,
        handleBulkArchive,
        handleBulkTag,
        handleMarkAsSpam,
        handleRecover
    };
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_hooks/useTicketSelection.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useTicketSelection",
    ()=>useTicketSelection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
;
function useTicketSelection() {
    const [selectedIds, setSelectedIds] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const handleToggleSelect = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((id)=>{
        setSelectedIds((prev)=>prev.includes(id) ? prev.filter((x)=>x !== id) : [
                ...prev,
                id
            ]);
    }, []);
    const handleClearSelection = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>setSelectedIds([]), []);
    return {
        selectedIds,
        setSelectedIds,
        handleToggleSelect,
        handleClearSelection
    };
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_hooks/useThreadCacheCoordinator.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createThreadCacheCoordinator",
    ()=>createThreadCacheCoordinator,
    "useThreadCacheCoordinator",
    ()=>useThreadCacheCoordinator
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
;
function patchThreads(threads, threadId, updateThread) {
    return threads.map((thread)=>thread.id === threadId ? updateThread(thread) : thread);
}
function findThread(deps, threadId) {
    return deps.openThreads.find((thread)=>thread.id === threadId) ?? deps.closedThreads.find((thread)=>thread.id === threadId) ?? deps.filteredThreads.find((thread)=>thread.id === threadId) ?? (deps.activeThread?.id === threadId ? deps.activeThread : undefined);
}
async function patchSearchCache(mutateSearch, threadId, updateThread) {
    await mutateSearch((current)=>current ? {
            ...current,
            threads: patchThreads(current.threads, threadId, updateThread)
        } : current, {
        revalidate: false
    });
}
async function patchActiveThreadCache(mutateActiveThread, threadId, updateThread) {
    await mutateActiveThread((current)=>current?.thread.id === threadId ? {
            ...current,
            thread: updateThread(current.thread)
        } : current, {
        revalidate: false
    });
}
function createThreadCacheCoordinator(deps) {
    const patchThreadCaches = async (threadId, updateThread)=>{
        await Promise.all([
            deps.mutateOpen(patchThreads(deps.openThreads, threadId, updateThread), false),
            deps.mutateClosed(patchThreads(deps.closedThreads, threadId, updateThread), false),
            deps.mutateFiltered(patchThreads(deps.filteredThreads, threadId, updateThread), false),
            patchSearchCache(deps.mutateSearch, threadId, updateThread),
            patchActiveThreadCache(deps.mutateActiveThread, threadId, updateThread)
        ]);
    };
    const moveThreadStatus = async (threadId, nextStatus)=>{
        const existing = findThread(deps, threadId);
        if (!existing) return;
        const updated = {
            ...existing,
            status: nextStatus
        };
        const updateThread = (thread)=>({
                ...thread,
                status: nextStatus
            });
        if (updated.filterStatus === 'filtered') {
            await Promise.all([
                deps.removeFromOpen(threadId),
                deps.removeFromClosed(threadId),
                deps.mutateFiltered(patchThreads(deps.filteredThreads, threadId, updateThread), false)
            ]);
        } else if (nextStatus === 'closed') {
            await Promise.all([
                deps.removeFromOpen(threadId),
                deps.removeFromFiltered(threadId),
                deps.prependToClosed(updated)
            ]);
        } else {
            await Promise.all([
                deps.removeFromClosed(threadId),
                deps.removeFromFiltered(threadId),
                deps.prependToOpen(updated)
            ]);
        }
        await Promise.all([
            patchSearchCache(deps.mutateSearch, threadId, updateThread),
            patchActiveThreadCache(deps.mutateActiveThread, threadId, updateThread)
        ]);
    };
    const moveThreadFilterStatus = async (threadId, nextFilterStatus, nextFilterFeedback)=>{
        const existing = findThread(deps, threadId);
        if (!existing) return;
        const updated = {
            ...existing,
            filterStatus: nextFilterStatus,
            filterFeedback: nextFilterFeedback ?? existing.filterFeedback
        };
        const updateThread = (thread)=>({
                ...thread,
                filterStatus: nextFilterStatus,
                filterFeedback: nextFilterFeedback ?? thread.filterFeedback
            });
        if (nextFilterStatus === 'filtered') {
            await Promise.all([
                deps.removeFromOpen(threadId),
                deps.removeFromClosed(threadId),
                deps.prependToFiltered(updated)
            ]);
        } else if (updated.status === 'closed') {
            await Promise.all([
                deps.removeFromFiltered(threadId),
                deps.removeFromOpen(threadId),
                deps.prependToClosed(updated)
            ]);
        } else {
            await Promise.all([
                deps.removeFromFiltered(threadId),
                deps.removeFromClosed(threadId),
                deps.prependToOpen(updated)
            ]);
        }
        await Promise.all([
            patchSearchCache(deps.mutateSearch, threadId, updateThread),
            patchActiveThreadCache(deps.mutateActiveThread, threadId, updateThread)
        ]);
    };
    const revalidateThreadCaches = async ()=>{
        await Promise.all([
            deps.mutateOpen(),
            deps.mutateClosed(),
            deps.mutateFiltered(),
            deps.mutateSearch(),
            deps.mutateActiveThread()
        ]);
    };
    return {
        patchThreadCaches,
        moveThreadStatus,
        moveThreadFilterStatus,
        revalidateThreadCaches
    };
}
function useThreadCacheCoordinator({ openThreads, closedThreads, filteredThreads, activeThread, mutateOpen, mutateClosed, mutateFiltered, removeFromOpen, removeFromClosed, removeFromFiltered, prependToOpen, prependToClosed, prependToFiltered, mutateSearch, mutateActiveThread }) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>createThreadCacheCoordinator({
            openThreads,
            closedThreads,
            filteredThreads,
            activeThread,
            mutateOpen,
            mutateClosed,
            mutateFiltered,
            removeFromOpen,
            removeFromClosed,
            removeFromFiltered,
            prependToOpen,
            prependToClosed,
            prependToFiltered,
            mutateSearch,
            mutateActiveThread
        }), [
        activeThread,
        closedThreads,
        filteredThreads,
        mutateActiveThread,
        mutateClosed,
        mutateFiltered,
        mutateOpen,
        mutateSearch,
        openThreads,
        prependToClosed,
        prependToFiltered,
        prependToOpen,
        removeFromClosed,
        removeFromFiltered,
        removeFromOpen
    ]);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/constants.ts [app-ssr] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CHANNEL_FILTERS",
    ()=>CHANNEL_FILTERS,
    "getAvatarGradient",
    ()=>getAvatarGradient,
    "getInitials",
    ()=>getInitials
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$channels$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/messaging/channels.ts [app-ssr] (ecmascript)");
;
;
const FILTER_IDS = [
    "email",
    "ig_dm"
];
const CHANNEL_FILTERS = FILTER_IDS.map((id)=>{
    const info = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$channels$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getChannelInfo"])(id);
    return {
        id,
        logo: info.logo,
        label: info.name
    };
});
const AVATAR_GRADIENTS = [
    "from-orange-400 to-rose-500",
    "from-sky-400 to-blue-600",
    "from-emerald-400 to-teal-600",
    "from-violet-400 to-purple-600",
    "from-pink-400 to-fuchsia-600",
    "from-amber-400 to-orange-500"
];
function getAvatarGradient(name) {
    let hash = 0;
    for(let i = 0; i < name.length; i++)hash = hash * 31 + name.charCodeAt(i) | 0;
    return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}
function getInitials(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/EmptyState.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "EmptyState",
    ()=>EmptyState
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$inbox$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Inbox$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/inbox.js [app-ssr] (ecmascript) <export default as Inbox>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$thread$2d$list$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/constants.ts [app-ssr] (ecmascript) <locals>");
;
;
;
;
function EmptyState({ activeFilter, activeTab, isSearchMode, searchQuery, totalCount }) {
    if (isSearchMode) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "text-center p-8 text-white/30 text-sm",
            children: [
                "No results for “",
                searchQuery,
                "”"
            ]
        }, void 0, true, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/EmptyState.tsx",
            lineNumber: 23,
            columnNumber: 7
        }, this);
    }
    if (totalCount === 0 && !searchQuery && !activeFilter) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex flex-col items-center text-center p-8 gap-3",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "size-12 rounded-md bg-white/[0.05] border border-border flex items-center justify-center",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$inbox$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Inbox$3e$__["Inbox"], {
                        className: "size-5 text-white/20"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/EmptyState.tsx",
                        lineNumber: 33,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/EmptyState.tsx",
                    lineNumber: 32,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-sm font-semibold text-white/50 mb-1",
                            children: "No tickets yet"
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/EmptyState.tsx",
                            lineNumber: 36,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-xs text-white/30 mb-3",
                            children: "Connect a channel to start receiving customer messages."
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/EmptyState.tsx",
                            lineNumber: 37,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                            href: "/dashboard/integrations",
                            className: "text-xs font-semibold text-white/50 hover:text-white/80 transition-colors",
                            children: "Set up integrations →"
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/EmptyState.tsx",
                            lineNumber: 38,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/EmptyState.tsx",
                    lineNumber: 35,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/EmptyState.tsx",
            lineNumber: 31,
            columnNumber: 7
        }, this);
    }
    const tabLabel = activeTab === "filtered" ? "spam" : activeTab;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "text-center p-8 text-white/25 text-sm",
        children: searchQuery ? `No results for "${searchQuery}"` : `No ${tabLabel} tickets${activeFilter ? ` from ${__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$thread$2d$list$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["CHANNEL_FILTERS"].find((channel)=>channel.id === activeFilter)?.label ?? activeFilter}` : ""}.`
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/EmptyState.tsx",
        lineNumber: 49,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/dashboard/src/components/ui/tabs.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Tabs",
    ()=>Tabs,
    "TabsContent",
    ()=>TabsContent,
    "TabsList",
    ()=>TabsList,
    "TabsTrigger",
    ()=>TabsTrigger
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/class-variance-authority/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tabs$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Tabs$3e$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-tabs/dist/index.mjs [app-ssr] (ecmascript) <export * as Tabs>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/ui/cn.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
function Tabs({ className, orientation = "horizontal", ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tabs$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Tabs$3e$__["Tabs"].Root, {
        "data-slot": "tabs",
        "data-orientation": orientation,
        orientation: orientation,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("group/tabs flex gap-2 data-[orientation=horizontal]:flex-col", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/tabs.tsx",
        lineNumber: 15,
        columnNumber: 5
    }, this);
}
const tabsListVariants = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cva"])("group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none", {
    variants: {
        variant: {
            default: "bg-muted",
            line: "gap-1 bg-transparent"
        }
    },
    defaultVariants: {
        variant: "default"
    }
});
function TabsList({ className, variant = "default", ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tabs$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Tabs$3e$__["Tabs"].List, {
        "data-slot": "tabs-list",
        "data-variant": variant,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])(tabsListVariants({
            variant
        }), className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/tabs.tsx",
        lineNumber: 50,
        columnNumber: 5
    }, this);
}
function TabsTrigger({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tabs$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Tabs$3e$__["Tabs"].Trigger, {
        "data-slot": "tabs-trigger",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4", "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent", "data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground", "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/tabs.tsx",
        lineNumber: 64,
        columnNumber: 5
    }, this);
}
function TabsContent({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tabs$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Tabs$3e$__["Tabs"].Content, {
        "data-slot": "tabs-content",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex-1 outline-none", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/tabs.tsx",
        lineNumber: 83,
        columnNumber: 5
    }, this);
}
;
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/BulkActions.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "BulkActions",
    ()=>BulkActions
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$archive$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Archive$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/archive.js [app-ssr] (ecmascript) <export default as Archive>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$tag$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Tag$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/tag.js [app-ssr] (ecmascript) <export default as Tag>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/x.js [app-ssr] (ecmascript) <export default as X>");
"use client";
;
;
;
function BulkActions({ selectedCount, onBulkArchive, onBulkClose, onBulkTag, onClearSelection }) {
    const [tagInput, setTagInput] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [showTagInput, setShowTagInput] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const applyBulkTag = ()=>{
        const tag = tagInput.trim();
        if (!tag) return;
        onBulkTag(tag);
        setTagInput("");
        setShowTagInput(false);
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-1.5",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between bg-white/[0.10] border border-white/[0.12] rounded-md px-3 py-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs font-semibold text-white/80",
                        children: [
                            selectedCount,
                            " selected"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/BulkActions.tsx",
                        lineNumber: 34,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: onBulkClose,
                                className: "text-xs font-semibold text-white bg-white/[0.15] hover:bg-white/[0.22] px-2.5 py-1 rounded transition-colors",
                                children: "Close"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/BulkActions.tsx",
                                lineNumber: 38,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: onBulkArchive,
                                title: "Archive selected",
                                className: "text-white/50 hover:text-white transition-colors",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$archive$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Archive$3e$__["Archive"], {
                                    className: "size-3.5"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/BulkActions.tsx",
                                    lineNumber: 49,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/BulkActions.tsx",
                                lineNumber: 44,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: ()=>setShowTagInput((value)=>!value),
                                title: "Tag selected",
                                className: "text-white/50 hover:text-white transition-colors",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$tag$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Tag$3e$__["Tag"], {
                                    className: "size-3.5"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/BulkActions.tsx",
                                    lineNumber: 56,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/BulkActions.tsx",
                                lineNumber: 51,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: onClearSelection,
                                className: "text-white/40 hover:text-white transition-colors",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                                    className: "size-3.5"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/BulkActions.tsx",
                                    lineNumber: 59,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/BulkActions.tsx",
                                lineNumber: 58,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/BulkActions.tsx",
                        lineNumber: 37,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/BulkActions.tsx",
                lineNumber: 33,
                columnNumber: 7
            }, this),
            showTagInput && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-1.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                        "aria-label": "Bulk tag name",
                        value: tagInput,
                        onChange: (event)=>setTagInput(event.target.value),
                        onKeyDown: (event)=>{
                            if (event.key === "Enter") applyBulkTag();
                        },
                        placeholder: "Tag name…",
                        className: "flex-1 text-xs text-white/70 bg-white/[0.06] border border-white/[0.12] rounded px-2 py-1 focus:outline-none focus:border-white/[0.25] placeholder:text-white/25"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/BulkActions.tsx",
                        lineNumber: 67,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: applyBulkTag,
                        disabled: !tagInput.trim(),
                        className: "text-xs font-semibold text-white bg-white/[0.15] hover:bg-white/[0.22] disabled:opacity-40 px-2.5 py-1 rounded transition-colors",
                        children: "Apply"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/BulkActions.tsx",
                        lineNumber: 77,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/BulkActions.tsx",
                lineNumber: 64,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/BulkActions.tsx",
        lineNumber: 32,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ThreadListHeader",
    ()=>ThreadListHeader
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/image.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/loader-circle.js [app-ssr] (ecmascript) <export default as Loader2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/search.js [app-ssr] (ecmascript) <export default as Search>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/x.js [app-ssr] (ecmascript) <export default as X>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/tabs.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$thread$2d$list$2f$BulkActions$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/BulkActions.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$thread$2d$list$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/constants.ts [app-ssr] (ecmascript) <locals>");
"use client";
;
;
;
;
;
;
function ThreadListHeader({ activeFilter, activeTab, hasSelection, isSearchLoading, isSearchMode, openCount, closedCount, spamCount, searchQuery, selectedCount, needsReply, onNeedsReplyChange, onBulkArchive, onBulkClose, onBulkTag, onClearSelection, onFilterChange, onSearchChange, onTabChange }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "px-3 pt-5 md:pt-3 pb-3 border-b border-border bg-background space-y-2",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-2 bg-white/[0.05] border border-border rounded-md px-3 h-9",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__["Search"], {
                        className: "size-3.5 text-white/20 shrink-0"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                        lineNumber: 56,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                        "aria-label": "Search tickets",
                        value: searchQuery,
                        onChange: (event)=>onSearchChange(event.target.value),
                        placeholder: "Search all tickets…",
                        className: "flex-1 bg-transparent text-sm text-white/70 placeholder:text-white/25 outline-none"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                        lineNumber: 57,
                        columnNumber: 9
                    }, this),
                    searchQuery && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>onSearchChange(""),
                        className: "text-white/20 hover:text-white/50 transition-colors",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                            className: "size-3.5"
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                            lineNumber: 66,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                        lineNumber: 65,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                lineNumber: 55,
                columnNumber: 7
            }, this),
            !isSearchMode && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Tabs"], {
                value: activeTab,
                onValueChange: (value)=>onTabChange(value),
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TabsList"], {
                    className: "w-full bg-white/[0.06] h-auto p-0.5 gap-0.5",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TabsTrigger"], {
                            value: "open",
                            className: "flex-1 gap-1.5 py-1.5 h-auto text-xs font-semibold data-[state=active]:bg-white/[0.12] data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:text-white/35",
                            children: [
                                "Open",
                                openCount > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: `text-xs font-bold px-1.5 py-0.5 rounded-full ${activeTab === "open" ? "bg-white/[0.15] text-white" : "bg-white/[0.08] text-white/35"}`,
                                    children: openCount
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                                    lineNumber: 80,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                            lineNumber: 74,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TabsTrigger"], {
                            value: "closed",
                            className: "flex-1 gap-1.5 py-1.5 h-auto text-xs font-semibold data-[state=active]:bg-white/[0.12] data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:text-white/35",
                            children: [
                                "Closed",
                                closedCount > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: `text-xs font-bold px-1.5 py-0.5 rounded-full ${activeTab === "closed" ? "bg-white/[0.15] text-white" : "bg-white/[0.08] text-white/35"}`,
                                    children: closedCount
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                                    lineNumber: 93,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                            lineNumber: 87,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TabsTrigger"], {
                            value: "filtered",
                            title: "Spam — automatically filtered messages",
                            className: "flex-1 gap-1.5 py-1.5 h-auto text-xs font-semibold data-[state=active]:bg-white/[0.12] data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:text-white/35",
                            children: [
                                "Spam",
                                spamCount > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: `text-xs font-bold px-1.5 py-0.5 rounded-full ${activeTab === "filtered" ? "bg-white/[0.15] text-white" : "bg-white/[0.08] text-white/35"}`,
                                    children: spamCount
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                                    lineNumber: 107,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                            lineNumber: 100,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                    lineNumber: 73,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                lineNumber: 72,
                columnNumber: 9
            }, this),
            isSearchMode && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between px-0.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-1.5",
                        children: [
                            isSearchLoading && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                className: "size-3 text-white/30 animate-spin"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                                lineNumber: 121,
                                columnNumber: 33
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-xs font-semibold text-white/40",
                                children: isSearchLoading ? "Searching…" : "Search results"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                                lineNumber: 122,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                        lineNumber: 120,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>onSearchChange(""),
                        className: "text-xs text-white/30 hover:text-white/60 font-medium",
                        children: "Clear"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                        lineNumber: 126,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                lineNumber: 119,
                columnNumber: 9
            }, this),
            !isSearchMode && activeTab === "open" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: ()=>onNeedsReplyChange(!needsReply),
                title: "Show only tickets where the customer sent the last message",
                className: `w-full h-8 rounded-md border text-xs font-semibold transition-all ${needsReply ? "bg-white/[0.15] text-white border-white/[0.35]" : "bg-transparent border-border text-white/40 hover:border-white/[0.18] hover:text-white/60"}`,
                children: "Needs my reply"
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                lineNumber: 133,
                columnNumber: 9
            }, this),
            !isSearchMode && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-1.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>onFilterChange(null),
                        className: `flex-1 h-9 rounded-md border text-xs font-semibold transition-all ${activeFilter === null ? "bg-white/[0.15] text-white border-white/[0.35]" : "bg-transparent border-border text-white/40 hover:border-white/[0.18] hover:text-white/60"}`,
                        children: "All"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                        lineNumber: 149,
                        columnNumber: 11
                    }, this),
                    __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$thread$2d$list$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["CHANNEL_FILTERS"].map((channel)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: ()=>onFilterChange(activeFilter === channel.id ? null : channel.id),
                            title: channel.label,
                            className: `flex-1 h-9 rounded-md border flex items-center justify-center transition-all ${activeFilter === channel.id ? "border-white/[0.30] bg-white/[0.10]" : "border-border bg-transparent hover:border-white/[0.18] hover:bg-white/[0.05]"}`,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                src: channel.logo,
                                alt: channel.label,
                                width: 16,
                                height: 16,
                                className: "object-contain opacity-60 brightness-0 invert"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                                lineNumber: 170,
                                columnNumber: 15
                            }, this)
                        }, channel.id, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                            lineNumber: 160,
                            columnNumber: 13
                        }, this))
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                lineNumber: 148,
                columnNumber: 9
            }, this),
            hasSelection && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$thread$2d$list$2f$BulkActions$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["BulkActions"], {
                selectedCount: selectedCount,
                onBulkArchive: onBulkArchive,
                onBulkClose: onBulkClose,
                onBulkTag: onBulkTag,
                onClearSelection: onClearSelection
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
                lineNumber: 177,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx",
        lineNumber: 54,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/sla.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getSlaInfo",
    ()=>getSlaInfo
]);
function getSlaInfo(lastCustomerMessageAt) {
    if (!lastCustomerMessageAt) return null;
    const ageH = (Date.now() - new Date(lastCustomerMessageAt).getTime()) / 3_600_000;
    if (ageH < 4) return {
        color: "text-emerald-400/80",
        dot: "bg-emerald-400",
        label: `${Math.round(ageH * 10) / 10}h`
    };
    if (ageH < 24) return {
        color: "text-amber-400/80",
        dot: "bg-amber-400",
        label: `${Math.round(ageH)}h`
    };
    return {
        color: "text-red-400/80",
        dot: "bg-red-400",
        label: `${Math.floor(ageH / 24)}d`
    };
}
}),
"[project]/apps/dashboard/src/app/dashboard/_lib/ticket-tags.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getTagStyle",
    ()=>getTagStyle
]);
const TAG_STYLES = {
    Shipping: {
        label: "Shipping",
        className: "bg-blue-500/15 text-blue-300"
    },
    Returns: {
        label: "Returns",
        className: "bg-amber-700/25 text-amber-300"
    },
    "Order Status": {
        label: "Order Status",
        className: "bg-purple-500/15 text-purple-300"
    },
    "Product Inquiry": {
        label: "Product Inquiry",
        className: "bg-rose-500/15 text-rose-300"
    },
    General: {
        label: "General",
        className: "bg-slate-500/20 text-slate-300"
    }
};
function getTagStyle(tag) {
    if (tag && TAG_STYLES[tag]) return TAG_STYLES[tag];
    return TAG_STYLES.General;
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TicketRow",
    ()=>TicketRow
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/image.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$ban$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Ban$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/ban.js [app-ssr] (ecmascript) <export default as Ban>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2d$check$2d$big$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckSquare$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/square-check-big.js [app-ssr] (ecmascript) <export default as CheckSquare>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$flag$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Flag$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/flag.js [app-ssr] (ecmascript) <export default as Flag>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$ccw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCcw$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/rotate-ccw.js [app-ssr] (ecmascript) <export default as RotateCcw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/sparkles.js [app-ssr] (ecmascript) <export default as Sparkles>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Square$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/square.js [app-ssr] (ecmascript) <export default as Square>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useMediaQuery$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/hooks/useMediaQuery.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$thread$2d$list$2f$sla$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/sla.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$thread$2d$list$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/constants.ts [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_lib$2f$ticket$2d$tags$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_lib/ticket-tags.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
const SWIPE_DETECT_PX = 8;
const SWIPE_COMMIT_PX = 120;
const CLICK_SUPPRESS_PX = 6;
function TicketRow({ activeTab, activeTicketId, hasSelection, isSearchMode, isSelected, ticket, onSelectTicket, onToggleSelect, onMarkAsSpam, onRecover }) {
    const lastRealMsg = [
        ...ticket.messages
    ].reverse().find((message)=>message.sender !== "note");
    const awaitingReply = ticket.status === "open" && lastRealMsg?.sender === "customer";
    const sla = awaitingReply ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$thread$2d$list$2f$sla$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getSlaInfo"])(ticket.lastCustomerMessageAt) : null;
    const isActive = activeTicketId === ticket.id;
    const tagStyle = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_lib$2f$ticket$2d$tags$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getTagStyle"])(ticket.tag);
    const gradient = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$thread$2d$list$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["getAvatarGradient"])(ticket.customer);
    const initials = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$thread$2d$list$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["getInitials"])(ticket.customer);
    const closed = ticket.status === "closed" || activeTab === "closed";
    const overdue = sla?.dot === "bg-red-400";
    const isSpam = ticket.filterStatus === "filtered";
    const isHoverCapable = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useMediaQuery$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMediaQuery"])("(hover: hover) and (pointer: fine)");
    const useSwipe = isHoverCapable === false;
    const recoverable = activeTab === "filtered" && !!onRecover;
    const spammable = !closed && ticket.filterStatus !== "filtered" && !!onMarkAsSpam;
    const rowAction = !hasSelection && !isSearchMode ? recoverable ? {
        kind: "recover",
        run: ()=>onRecover(ticket.id)
    } : spammable ? {
        kind: "spam",
        run: ()=>onMarkAsSpam(ticket.id)
    } : null : null;
    const surfaceRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const bannerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const swipe = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])({
        pointerId: -1,
        startX: 0,
        startY: 0,
        dx: 0,
        locked: false,
        width: 0,
        suppressClick: false,
        committed: false
    });
    const commitTimeout = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const settleTimeout = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const canSwipe = useSwipe && rowAction !== null;
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>()=>{
            if (commitTimeout.current !== null) window.clearTimeout(commitTimeout.current);
            if (settleTimeout.current !== null) window.clearTimeout(settleTimeout.current);
        }, []);
    function applyTransform(tx, animate) {
        const el = surfaceRef.current;
        if (!el) return;
        el.style.transition = animate ? "transform 180ms ease" : "none";
        el.style.transform = tx === 0 ? "" : `translate3d(${tx}px,0,0)`;
    }
    function setBannerVisible(visible) {
        const el = bannerRef.current;
        if (!el) return;
        el.style.visibility = visible ? "visible" : "hidden";
    }
    function setSurfacePromoted(promoted) {
        const el = surfaceRef.current;
        if (!el) return;
        el.style.willChange = promoted ? "transform" : "";
    }
    function onPointerDown(event) {
        if (!canSwipe) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if (swipe.current.pointerId !== -1) return;
        if (swipe.current.committed) return;
        if (settleTimeout.current !== null) {
            window.clearTimeout(settleTimeout.current);
            settleTimeout.current = null;
        }
        swipe.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            dx: 0,
            locked: false,
            width: event.currentTarget.getBoundingClientRect().width,
            suppressClick: false,
            committed: false
        };
        setSurfacePromoted(true);
        event.currentTarget.setPointerCapture(event.pointerId);
    }
    function onPointerMove(event) {
        const s = swipe.current;
        if (s.pointerId !== event.pointerId) return;
        const dx = event.clientX - s.startX;
        const dy = event.clientY - s.startY;
        if (!s.locked) {
            if (Math.abs(dx) < SWIPE_DETECT_PX && Math.abs(dy) < SWIPE_DETECT_PX) return;
            if (Math.abs(dy) > Math.abs(dx)) {
                s.pointerId = -1;
                setSurfacePromoted(false);
                return;
            }
            s.locked = true;
            setBannerVisible(true);
        }
        s.dx = Math.min(0, dx);
        if (Math.abs(s.dx) > CLICK_SUPPRESS_PX) s.suppressClick = true;
        applyTransform(s.dx, false);
    }
    function finish(event, cancelled) {
        const s = swipe.current;
        if (s.pointerId !== event.pointerId) return;
        try {
            event.currentTarget.releasePointerCapture(event.pointerId);
        } catch  {}
        s.pointerId = -1;
        const commitPx = Math.min(SWIPE_COMMIT_PX, s.width * 0.4);
        if (!cancelled && s.locked && rowAction && s.dx <= -commitPx) {
            s.committed = true;
            applyTransform(-s.width, true);
            commitTimeout.current = window.setTimeout(()=>{
                commitTimeout.current = null;
                rowAction.run();
            }, 180);
        } else {
            applyTransform(0, true);
            const wasLocked = s.locked;
            s.locked = false;
            settleTimeout.current = window.setTimeout(()=>{
                settleTimeout.current = null;
                if (swipe.current.pointerId !== -1 || swipe.current.committed) return;
                if (wasLocked) setBannerVisible(false);
                setSurfacePromoted(false);
            }, 200);
        }
    }
    function openTicketRow(event) {
        if (swipe.current.suppressClick || swipe.current.committed) {
            swipe.current.suppressClick = false;
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        onSelectTicket(ticket.id);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-testid": "ticket-row",
        "data-ticket-id": ticket.id,
        "data-ticket-channel": ticket.channelType,
        className: "relative overflow-hidden",
        children: [
            canSwipe && rowAction && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                ref: bannerRef,
                "aria-hidden": "true",
                style: {
                    visibility: "hidden"
                },
                className: `absolute inset-0 flex items-center justify-end gap-2 pr-5 text-white text-sm font-semibold pointer-events-none ${rowAction.kind === "spam" ? "bg-red-500/90" : "bg-emerald-500/90"}`,
                children: rowAction.kind === "spam" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$ban$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Ban$3e$__["Ban"], {
                            className: "size-4"
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                            lineNumber: 192,
                            columnNumber: 17
                        }, this),
                        " Spam"
                    ]
                }, void 0, true) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$ccw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCcw$3e$__["RotateCcw"], {
                            className: "size-4"
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                            lineNumber: 193,
                            columnNumber: 17
                        }, this),
                        " Recover"
                    ]
                }, void 0, true)
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                lineNumber: 183,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                ref: surfaceRef,
                onPointerDown: onPointerDown,
                onPointerMove: onPointerMove,
                onPointerUp: (event)=>finish(event, false),
                onPointerCancel: (event)=>finish(event, true),
                style: canSwipe ? {
                    touchAction: "pan-y"
                } : undefined,
                className: `relative pt-0.5 ${canSwipe ? "bg-background select-none" : ""}`,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: `cursor-pointer relative px-4 py-2 transition-colors group ${isActive ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"}`,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: `absolute left-0 top-0 bottom-0 w-0.5 rounded-r-full ${isActive ? "bg-green-400" : "bg-transparent"}`
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                            lineNumber: 212,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: (event)=>{
                                event.stopPropagation();
                                onToggleSelect(ticket.id);
                            },
                            className: `absolute left-3 top-1/2 -translate-y-1/2 transition-opacity z-10 ${hasSelection || isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`,
                            children: isSelected ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2d$check$2d$big$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckSquare$3e$__["CheckSquare"], {
                                className: "size-3.5 text-white/70"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                lineNumber: 223,
                                columnNumber: 17
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Square$3e$__["Square"], {
                                className: "size-3.5 text-white/20"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                lineNumber: 224,
                                columnNumber: 17
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                            lineNumber: 216,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            "data-testid": "ticket-row-open",
                            "data-ticket-id": ticket.id,
                            onClick: openTicketRow,
                            className: `flex w-full items-start gap-3 border-0 bg-transparent p-0 text-left transition-transform [font-family:inherit] ${hasSelection ? "translate-x-5" : "group-hover:translate-x-5"}`,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "relative size-9 shrink-0",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: `size-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-[14px] font-bold shadow-sm`,
                                            children: initials
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                            lineNumber: 236,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "absolute -bottom-0.5 -right-0.5 size-4.5 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                                src: ticket.logo,
                                                width: 9,
                                                height: 9,
                                                alt: ticket.platform,
                                                className: "object-contain brightness-0 invert opacity-80"
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                                lineNumber: 240,
                                                columnNumber: 17
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                            lineNumber: 239,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                    lineNumber: 235,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex-1 min-w-0",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-baseline justify-between gap-2 mb-0.5",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-sm font-semibold text-white/90 truncate",
                                                    children: ticket.customer
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                                    lineNumber: 246,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "relative shrink-0 flex items-center justify-end min-h-[14px]",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: `text-xs transition-opacity ${overdue ? "text-red-400 font-semibold" : "text-white/30"} ${!useSwipe && rowAction ? "group-hover:opacity-0" : ""}`,
                                                        children: ticket.time
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                                        lineNumber: 248,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                                    lineNumber: 247,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                            lineNumber: 245,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "text-[13px] font-medium text-white/80 truncate mb-0.5",
                                            children: ticket.subject
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                            lineNumber: 258,
                                            columnNumber: 15
                                        }, this),
                                        isSpam && ticket.filterReason ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "text-xs text-white/45 line-clamp-2 mb-2",
                                            children: ticket.filterReason
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                            lineNumber: 260,
                                            columnNumber: 17
                                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "text-xs text-white/40 line-clamp-1 mb-2",
                                            children: ticket.preview
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                            lineNumber: 262,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-center gap-1.5 flex-wrap min-w-0",
                                            children: isSpam ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 shrink-0",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$ban$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Ban$3e$__["Ban"], {
                                                        className: "size-2.5 mr-1"
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                                        lineNumber: 268,
                                                        columnNumber: 21
                                                    }, this),
                                                    " Spam"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                                lineNumber: 267,
                                                columnNumber: 19
                                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: `inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${tagStyle.className}`,
                                                        children: tagStyle.label
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                                        lineNumber: 272,
                                                        columnNumber: 21
                                                    }, this),
                                                    ticket.hasPlan && !closed && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"], {
                                                                className: "size-2.5 mr-1"
                                                            }, void 0, false, {
                                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                                                lineNumber: 277,
                                                                columnNumber: 25
                                                            }, this),
                                                            " Plan ready"
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                                        lineNumber: 276,
                                                        columnNumber: 23
                                                    }, this),
                                                    ticket.filterStatus === "questionable" && !closed && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        title: `Possibly not a genuine customer message${ticket.filterReason ? ` — ${ticket.filterReason}` : ""}`,
                                                        className: "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$flag$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Flag$3e$__["Flag"], {
                                                                className: "size-2.5 mr-1"
                                                            }, void 0, false, {
                                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                                                lineNumber: 285,
                                                                columnNumber: 25
                                                            }, this),
                                                            " Unverified sender"
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                                        lineNumber: 281,
                                                        columnNumber: 23
                                                    }, this),
                                                    closed && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-400/10 text-green-400",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: "size-1.5 rounded-full bg-green-400"
                                                            }, void 0, false, {
                                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                                                lineNumber: 290,
                                                                columnNumber: 25
                                                            }, this),
                                                            "Closed"
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                                        lineNumber: 289,
                                                        columnNumber: 23
                                                    }, this),
                                                    !sla && isSearchMode && ticket.status && !closed && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "text-xs text-white/25 font-medium capitalize ml-auto",
                                                        children: ticket.status
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                                        lineNumber: 295,
                                                        columnNumber: 23
                                                    }, this)
                                                ]
                                            }, void 0, true)
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                            lineNumber: 265,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                    lineNumber: 244,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                            lineNumber: 228,
                            columnNumber: 11
                        }, this),
                        !useSwipe && rowAction && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: (event)=>{
                                event.stopPropagation();
                                rowAction.run();
                            },
                            title: rowAction.kind === "spam" ? "Mark as spam" : "Recover to inbox",
                            className: `absolute right-4 top-3 flex items-center justify-end opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity ${rowAction.kind === "spam" ? "text-white/50 hover:text-red-400" : "text-white/50 hover:text-emerald-400"}`,
                            children: rowAction.kind === "spam" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$ban$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Ban$3e$__["Ban"], {
                                className: "size-3.5"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                lineNumber: 311,
                                columnNumber: 19
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$ccw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCcw$3e$__["RotateCcw"], {
                                className: "size-3.5"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                                lineNumber: 312,
                                columnNumber: 19
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                            lineNumber: 303,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                    lineNumber: 207,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
                lineNumber: 198,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx",
        lineNumber: 176,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadList.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ThreadList
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$thread$2d$list$2f$EmptyState$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/EmptyState.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$thread$2d$list$2f$ThreadListHeader$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadListHeader.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$thread$2d$list$2f$TicketRow$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/TicketRow.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
function ThreadList({ tickets, totalCount, activeTab, activeFilter, activeTicketId, openCount, closedCount, spamCount, searchQuery, listState, selectedIds, needsReply, onNeedsReplyChange, onSearchChange, onTabChange, onFilterChange, onSelectTicket, onToggleSelect, onBulkClose, onBulkArchive, onBulkTag, onClearSelection, onLoadMore, onMarkAsSpam, onRecover }) {
    const hasSelection = selectedIds.length > 0;
    const { searchMode: isSearchMode, searchLoading: isSearchLoading, hasMore, loadingMore: isLoadingMore } = listState ?? {};
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$thread$2d$list$2f$ThreadListHeader$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ThreadListHeader"], {
                activeFilter: activeFilter,
                activeTab: activeTab,
                hasSelection: hasSelection,
                isSearchLoading: isSearchLoading,
                isSearchMode: isSearchMode,
                openCount: openCount,
                closedCount: closedCount,
                spamCount: spamCount,
                searchQuery: searchQuery,
                selectedCount: selectedIds.length,
                needsReply: needsReply,
                onNeedsReplyChange: onNeedsReplyChange,
                onBulkArchive: onBulkArchive,
                onBulkClose: onBulkClose,
                onBulkTag: onBulkTag,
                onClearSelection: onClearSelection,
                onFilterChange: onFilterChange,
                onSearchChange: onSearchChange,
                onTabChange: onTabChange
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadList.tsx",
                lineNumber: 79,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                "data-testid": "tickets-list",
                className: "flex-1 overflow-y-auto custom-scrollbar divide-y divide-white/[0.1]",
                children: [
                    tickets.map((ticket)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$thread$2d$list$2f$TicketRow$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TicketRow"], {
                            activeTab: activeTab,
                            activeTicketId: activeTicketId,
                            hasSelection: hasSelection,
                            isSearchMode: isSearchMode,
                            isSelected: selectedIds.includes(ticket.id),
                            ticket: ticket,
                            onSelectTicket: onSelectTicket,
                            onToggleSelect: onToggleSelect,
                            onMarkAsSpam: onMarkAsSpam,
                            onRecover: onRecover
                        }, ticket.id, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadList.tsx",
                            lineNumber: 106,
                            columnNumber: 11
                        }, this)),
                    tickets.length === 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$thread$2d$list$2f$EmptyState$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["EmptyState"], {
                        activeFilter: activeFilter,
                        activeTab: activeTab,
                        isSearchMode: isSearchMode,
                        searchQuery: searchQuery,
                        totalCount: totalCount
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadList.tsx",
                        lineNumber: 122,
                        columnNumber: 11
                    }, this),
                    !isSearchMode && hasMore && tickets.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "px-4 py-3 border-t border-white/[0.05]",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: onLoadMore,
                            disabled: isLoadingMore,
                            className: "w-full text-xs font-semibold text-white/40 hover:text-white/70 disabled:opacity-40 transition-colors py-1",
                            children: isLoadingMore ? "Loading…" : "Load more"
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadList.tsx",
                            lineNumber: 133,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadList.tsx",
                        lineNumber: 132,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadList.tsx",
                lineNumber: 101,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true);
}
}),
"[project]/apps/dashboard/src/hooks/useThreadPresence.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useThreadPresence",
    ()=>useThreadPresence
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/swr/dist/index/index.mjs [app-ssr] (ecmascript) <locals>");
"use client";
;
;
// The PUT doubles as heartbeat + read: it registers this viewer and returns
// how many other org members are viewing the thread.
async function heartbeat(url) {
    const response = await fetch(url, {
        method: "PUT"
    });
    return response.ok ? response.json() : {
        count: 0
    };
}
function useThreadPresence(ticketId) {
    const presenceUrl = `/api/threads/${ticketId}/presence`;
    const { data } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"])(presenceUrl, heartbeat, {
        refreshInterval: 15000,
        revalidateOnFocus: false
    });
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        return ()=>{
            void fetch(presenceUrl, {
                method: "DELETE"
            }).catch(()=>{});
        };
    }, [
        presenceUrl
    ]);
    return {
        presenceCount: data?.count ?? 0
    };
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_hooks/conversation-agent-requests.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "askAgentPrivately",
    ()=>askAgentPrivately,
    "executeApprovedAgentPlan",
    ()=>executeApprovedAgentPlan,
    "fetchAgentPlan",
    ()=>fetchAgentPlan,
    "planRequestErrorTurn",
    ()=>planRequestErrorTurn,
    "regenerateAgentPlan",
    ()=>regenerateAgentPlan
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/fetcher.ts [app-ssr] (ecmascript)");
;
const JSON_HEADERS = {
    "Content-Type": "application/json"
};
const NETWORK_ERROR = "Network error — please try again.";
function agentTurnFields(instruction, payload, error) {
    return {
        instruction,
        actions: payload.actionsPerformed ?? [],
        summary: payload.summary ?? null,
        error
    };
}
function networkErrorTurn(instruction) {
    return {
        instruction,
        actions: [],
        summary: null,
        error: NETWORK_ERROR
    };
}
function requestErrorTurn(instruction, error, fallback) {
    const message = error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ApiRequestError"] ? error.message : error instanceof Error && error.message ? error.message : fallback;
    return {
        instruction,
        actions: [],
        summary: null,
        error: message
    };
}
async function executeApprovedAgentPlan(threadId, instruction, approvedToolCalls) {
    try {
        const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["requestJson"])("/api/agent", {
            method: "POST",
            headers: JSON_HEADERS,
            body: JSON.stringify({
                threadId,
                instruction,
                approvedToolCalls
            })
        }, "Agent failed.");
        return {
            ok: true,
            turn: agentTurnFields(instruction, payload, null)
        };
    } catch (error) {
        if (error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ApiRequestError"]) {
            const payload = error.payload ?? {};
            return {
                ok: false,
                turn: agentTurnFields(instruction, payload, error.message)
            };
        }
        return {
            ok: false,
            turn: networkErrorTurn(instruction)
        };
    }
}
async function askAgentPrivately(threadId, instruction) {
    try {
        const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["requestJson"])("/api/agent/ask", {
            method: "POST",
            headers: JSON_HEADERS,
            body: JSON.stringify({
                threadId,
                instruction
            })
        }, "Agent failed.");
        return {
            ok: true,
            turn: agentTurnFields(instruction, payload, null)
        };
    } catch (error) {
        if (error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ApiRequestError"]) {
            const payload = error.payload ?? {};
            return {
                ok: false,
                turn: agentTurnFields(instruction, payload, error.message)
            };
        }
        return {
            ok: false,
            turn: networkErrorTurn(instruction)
        };
    }
}
async function fetchAgentPlan(threadId, instruction, options = {}) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["requestJson"])("/api/agent/plan", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
            threadId,
            instruction,
            force: options.force ?? false
        })
    }, "Plan request failed");
}
async function regenerateAgentPlan(threadId, instruction) {
    try {
        return await fetchAgentPlan(threadId, instruction, {
            force: true
        });
    } catch  {
        return null;
    }
}
function planRequestErrorTurn(instruction, error) {
    return requestErrorTurn(instruction, error, "Failed to generate plan — please try again.");
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_hooks/useConversationAgentFlow.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getAgentCommandState",
    ()=>getAgentCommandState,
    "planRequiresApproval",
    ()=>planRequiresApproval,
    "resolvePendingPlan",
    ()=>resolvePendingPlan,
    "shouldUsePrivateComposerAsk",
    ()=>shouldUsePrivateComposerAsk,
    "useConversationAgentFlow",
    ()=>useConversationAgentFlow
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$conversation$2d$agent$2d$requests$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_hooks/conversation-agent-requests.ts [app-ssr] (ecmascript)");
"use client";
;
;
function createAgentTurn(turn) {
    return {
        id: crypto.randomUUID(),
        ...turn
    };
}
function getAgentCommandState(replyText, agentName, viewTab) {
    const triggerPrefix = `@${agentName.toLowerCase()}`;
    const trimmedReply = replyText.trimStart();
    const isSupportedComposerTab = viewTab === "chat" || viewTab === "notes";
    const isAgentMode = isSupportedComposerTab && trimmedReply.toLowerCase().startsWith(triggerPrefix);
    const agentInstruction = isAgentMode ? trimmedReply.slice(triggerPrefix.length).replace(/^ /, "") : "";
    return {
        agentInstruction,
        isAgentMode,
        triggerPrefix
    };
}
function resolvePendingPlan(plan, instruction) {
    return plan.steps.length > 0 ? {
        ...plan,
        instruction
    } : null;
}
const PRIVATE_ASK_RE = /\b(what should i|what do i|what to say|how should i|how do i|what can i|can you draft|draft|write|rewrite|responding to this|summari[sz]e|explain|do we have enough|should i|what's|what is|why)\b/i;
const ACTION_REQUEST_RE = /^(?:(?:please|can you|could you|go ahead and|let's|lets)\s+)?(?:change|update|edit|swap|remove|add|refund|cancel|create|place|make|send|email|notify|close|tag|run|approve)\b/i;
function shouldUsePrivateComposerAsk(instruction) {
    const normalized = instruction.trim();
    if (!normalized) return false;
    if (PRIVATE_ASK_RE.test(normalized)) return true;
    return !ACTION_REQUEST_RE.test(normalized);
}
function planRequiresApproval(plan) {
    return plan.steps.some((step)=>step.category === "action" || step.category === "communication" || step.category === "internal");
}
function pendingPlanReducer(_state, action) {
    return {
        ticketId: action.ticketId,
        hasOverride: true,
        plan: action.plan
    };
}
function useConversationAgentFlow({ ticket, viewTab, replyText, agentName, initialPlan, onReplyChange, onSend, onAgentTurnAdd, onAgentRunningChange, onAgentComplete, onPrivateAnswerStart, onNoteModeReset }) {
    const [pendingInstruction, setPendingInstruction] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [pendingPlanState, dispatchPendingPlan] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useReducer"])(pendingPlanReducer, {
        ticketId: ticket.id,
        hasOverride: false,
        plan: null
    });
    const [isPlanLoading, setIsPlanLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [isPlanExecuting, setIsPlanExecuting] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [isRegenerating, setIsRegenerating] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const { agentInstruction, isAgentMode } = getAgentCommandState(replyText, agentName, viewTab);
    const pendingPlan = pendingPlanState.ticketId === ticket.id && pendingPlanState.hasOverride ? pendingPlanState.plan : initialPlan ?? null;
    const setPendingPlan = (plan)=>{
        dispatchPendingPlan({
            type: "set",
            ticketId: ticket.id,
            plan
        });
    };
    const executeApprovedPlan = async (instruction, approvedToolCalls)=>{
        setPendingPlan(null);
        setPendingInstruction(instruction);
        setIsPlanExecuting(true);
        onAgentRunningChange(true);
        try {
            const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$conversation$2d$agent$2d$requests$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["executeApprovedAgentPlan"])(ticket.id, instruction, approvedToolCalls);
            const turn = createAgentTurn(result.turn);
            if (result.ok) {
                onAgentComplete(turn);
            } else {
                onAgentTurnAdd(turn);
            }
        } finally{
            onAgentRunningChange(false);
            setIsPlanExecuting(false);
            setPendingInstruction(null);
        }
    };
    const answerPrivateQuestion = async (instruction)=>{
        onReplyChange("");
        setPendingInstruction(instruction);
        setIsPlanLoading(true);
        onPrivateAnswerStart?.();
        try {
            const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$conversation$2d$agent$2d$requests$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["askAgentPrivately"])(ticket.id, instruction);
            const turn = createAgentTurn(result.turn);
            if (result.ok) {
                onAgentComplete(turn);
            } else {
                onAgentTurnAdd(turn);
            }
        } finally{
            setIsPlanLoading(false);
            setPendingInstruction(null);
        }
    };
    const handleSend = async (noteArg)=>{
        if (isAgentMode && agentInstruction) {
            const instruction = agentInstruction;
            if (shouldUsePrivateComposerAsk(instruction)) {
                await answerPrivateQuestion(instruction);
                return;
            }
            onReplyChange("");
            setPendingInstruction(instruction);
            setIsPlanLoading(true);
            try {
                const plan = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$conversation$2d$agent$2d$requests$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["fetchAgentPlan"])(ticket.id, instruction);
                const requiresApproval = planRequiresApproval(plan);
                if (!requiresApproval) {
                    setIsPlanLoading(false);
                    setPendingInstruction(null);
                    await answerPrivateQuestion(instruction);
                } else {
                    setIsPlanLoading(false);
                    setPendingInstruction(null);
                    setPendingPlan(resolvePendingPlan(plan, instruction));
                }
            } catch (err) {
                setIsPlanLoading(false);
                setPendingInstruction(null);
                onAgentTurnAdd(createAgentTurn((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$conversation$2d$agent$2d$requests$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["planRequestErrorTurn"])(instruction, err)));
            }
            return;
        }
        onSend(viewTab === "notes" ? true : noteArg);
        if (viewTab === "notes") {
            onNoteModeReset();
        }
    };
    const handlePlanApprove = async (approvedToolCalls)=>{
        if (!pendingPlan) return;
        await executeApprovedPlan(pendingPlan.instruction, approvedToolCalls);
    };
    const handlePlanDismiss = ()=>{
        setPendingPlan(null);
    };
    const handlePlanRegenerate = async ()=>{
        if (!pendingPlan || isRegenerating) return;
        setIsRegenerating(true);
        const instruction = pendingPlan.instruction;
        try {
            const plan = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$conversation$2d$agent$2d$requests$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["regenerateAgentPlan"])(ticket.id, instruction);
            const resolved = plan ? resolvePendingPlan(plan, instruction) : null;
            if (resolved) setPendingPlan(resolved);
        } finally{
            setIsRegenerating(false);
        }
    };
    return {
        agentInstruction,
        handlePlanApprove,
        handlePlanDismiss,
        handlePlanRegenerate,
        handleSend,
        isAgentMode,
        isPlanExecuting,
        isPlanLoading,
        isRegenerating,
        pendingInstruction,
        pendingPlan
    };
}
}),
"[project]/apps/dashboard/src/components/ui/badge.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Badge",
    ()=>Badge
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/class-variance-authority/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Slot$3e$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-slot/dist/index.mjs [app-ssr] (ecmascript) <export * as Slot>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/ui/cn.ts [app-ssr] (ecmascript)");
;
;
;
;
const badgeVariants = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cva"])("inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3", {
    variants: {
        variant: {
            default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
            secondary: "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
            destructive: "bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
            outline: "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
            ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
            link: "text-primary underline-offset-4 [a&]:hover:underline"
        }
    },
    defaultVariants: {
        variant: "default"
    }
});
function Badge({ className, variant = "default", asChild = false, ...props }) {
    const Comp = asChild ? __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Slot$3e$__["Slot"].Root : "span";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Comp, {
        "data-slot": "badge",
        "data-variant": variant,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])(badgeVariants({
            variant
        }), className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/badge.tsx",
        lineNumber: 39,
        columnNumber: 5
    }, this);
}
;
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ConversationHeader
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$left$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowLeft$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/arrow-left.js [app-ssr] (ecmascript) <export default as ArrowLeft>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/circle-check.js [app-ssr] (ecmascript) <export default as CheckCircle2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$info$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Info$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/info.js [app-ssr] (ecmascript) <export default as Info>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$ccw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCcw$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/rotate-ccw.js [app-ssr] (ecmascript) <export default as RotateCcw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/button.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/badge.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
function ConversationHeader({ activeTab, customer, platform, onBack, onResolve, onReopen, onOpenContext }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "h-14 border-b border-border flex items-center justify-between px-3 md:px-6 shrink-0",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-3 min-w-0",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                        variant: "ghost",
                        size: "icon",
                        className: "md:hidden shrink-0 -ml-2 text-white/40 hover:text-white/80 hover:bg-white/[0.06] size-8",
                        onClick: onBack,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$left$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowLeft$3e$__["ArrowLeft"], {
                            className: "size-4"
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx",
                            lineNumber: 35,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx",
                        lineNumber: 29,
                        columnNumber: 9
                    }, this),
                    onOpenContext ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        className: "min-w-0 cursor-pointer border-0 bg-transparent p-0 text-left [font-family:inherit] xl:pointer-events-none xl:cursor-auto",
                        onClick: onOpenContext,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                className: "text-[15px] font-semibold text-white/80 truncate leading-tight",
                                children: customer
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx",
                                lineNumber: 43,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-xs text-white/35 font-medium capitalize",
                                children: [
                                    "via ",
                                    platform
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx",
                                lineNumber: 46,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx",
                        lineNumber: 38,
                        columnNumber: 11
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "min-w-0",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                className: "text-[15px] font-semibold text-white/80 truncate leading-tight",
                                children: customer
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx",
                                lineNumber: 52,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-xs text-white/35 font-medium capitalize",
                                children: [
                                    "via ",
                                    platform
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx",
                                lineNumber: 55,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx",
                        lineNumber: 51,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx",
                lineNumber: 28,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-2",
                children: [
                    onOpenContext && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                        variant: "ghost",
                        size: "icon",
                        className: "xl:hidden shrink-0 text-white/40 hover:text-white/80 hover:bg-white/[0.06] size-8",
                        onClick: onOpenContext,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$info$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Info$3e$__["Info"], {
                            className: "size-4"
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx",
                            lineNumber: 70,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx",
                        lineNumber: 64,
                        columnNumber: 11
                    }, this),
                    activeTab === "open" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                        size: "sm",
                        onClick: onResolve,
                        className: "bg-white hover:bg-white/90 text-black text-xs font-semibold flex items-center gap-1.5 h-8",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__["CheckCircle2"], {
                                className: "size-3.5"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx",
                                lineNumber: 79,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "hidden sm:inline",
                                children: "Close Ticket"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx",
                                lineNumber: 80,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx",
                        lineNumber: 74,
                        columnNumber: 11
                    }, this),
                    activeTab === "closed" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Badge"], {
                                variant: "outline",
                                className: "font-semibold bg-green-400/10 text-green-400 border-green-400/20 px-2.5 py-1 text-xs",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__["CheckCircle2"], {
                                        className: "size-3 mr-1"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx",
                                        lineNumber: 86,
                                        columnNumber: 15
                                    }, this),
                                    " Closed"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx",
                                lineNumber: 85,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                                variant: "outline",
                                size: "sm",
                                onClick: onReopen,
                                className: "text-white/50 border-border hover:bg-white/[0.06] hover:text-white/80 text-xs font-semibold flex items-center gap-1.5 h-8",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$ccw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCcw$3e$__["RotateCcw"], {
                                        className: "size-3.5"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx",
                                        lineNumber: 94,
                                        columnNumber: 15
                                    }, this),
                                    " Reopen"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx",
                                lineNumber: 88,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx",
                        lineNumber: 84,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx",
                lineNumber: 62,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx",
        lineNumber: 27,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationSummaryBar.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ConversationSummaryBar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$brain$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Brain$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/brain.js [app-ssr] (ecmascript) <export default as Brain>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/refresh-cw.js [app-ssr] (ecmascript) <export default as RefreshCw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/button.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/tooltip.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
function ConversationSummaryBar({ summary, isRefreshing, onRefresh }) {
    const displaySummary = summary?.trim();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "shrink-0 border-b border-border bg-[#050505] px-2 py-1 mt-1 md:px-6",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex min-w-0 items-start justify-between gap-3",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex min-w-0 items-start gap-2",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-gradient-to-r from-slate-200 via-slate-400 to-slate-600 text-white",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$brain$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Brain$3e$__["Brain"], {
                                className: "size-2.5"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationSummaryBar.tsx",
                                lineNumber: 30,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationSummaryBar.tsx",
                            lineNumber: 29,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "min-w-0 text-xs leading-6 text-white/55",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "font-semibold text-white/90",
                                    children: "Summary"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationSummaryBar.tsx",
                                    lineNumber: 33,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-white/35",
                                    children: " · "
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationSummaryBar.tsx",
                                    lineNumber: 34,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: displaySummary ? "" : "text-white/35",
                                    children: displaySummary || "Generating summary…"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationSummaryBar.tsx",
                                    lineNumber: 35,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationSummaryBar.tsx",
                            lineNumber: 32,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationSummaryBar.tsx",
                    lineNumber: 28,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TooltipProvider"], {
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Tooltip"], {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TooltipTrigger"], {
                                asChild: true,
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                                    variant: "ghost",
                                    size: "icon-xs",
                                    className: "mt-0.5 shrink-0 text-white/35 hover:bg-white/[0.06] hover:text-white/75",
                                    disabled: isRefreshing,
                                    onClick: onRefresh,
                                    "aria-label": "Refresh summary",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__["RefreshCw"], {
                                        className: `size-3 ${isRefreshing ? "animate-spin" : ""}`
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationSummaryBar.tsx",
                                        lineNumber: 52,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationSummaryBar.tsx",
                                    lineNumber: 44,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationSummaryBar.tsx",
                                lineNumber: 43,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TooltipContent"], {
                                side: "bottom",
                                children: "Refresh summary"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationSummaryBar.tsx",
                                lineNumber: 55,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationSummaryBar.tsx",
                        lineNumber: 42,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationSummaryBar.tsx",
                    lineNumber: 41,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationSummaryBar.tsx",
            lineNumber: 27,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationSummaryBar.tsx",
        lineNumber: 26,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/PresenceBanner.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>PresenceBanner
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$users$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Users$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/users.js [app-ssr] (ecmascript) <export default as Users>");
"use client";
;
;
function PresenceBanner({ presenceCount }) {
    if (presenceCount <= 0) {
        return null;
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "px-5 py-2 border-b border-amber-400/20 bg-amber-400/[0.04] flex items-center gap-2 shrink-0",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$users$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Users$3e$__["Users"], {
                className: "size-3.5 text-amber-400 shrink-0"
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/PresenceBanner.tsx",
                lineNumber: 16,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "text-xs text-amber-400 font-medium",
                children: [
                    presenceCount === 1 ? "Another agent is" : `${presenceCount} other agents are`,
                    " viewing this ticket"
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/PresenceBanner.tsx",
                lineNumber: 17,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/PresenceBanner.tsx",
        lineNumber: 15,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ChatTimeline
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$attachments$2f$blob$2d$ref$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/attachments/blob-ref.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$triangle$2d$alert$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertTriangle$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/triangle-alert.js [app-ssr] (ecmascript) <export default as AlertTriangle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/loader-circle.js [app-ssr] (ecmascript) <export default as Loader2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$square$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageSquare$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/message-square.js [app-ssr] (ecmascript) <export default as MessageSquare>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/image.js [app-ssr] (ecmascript)");
"use client";
;
;
;
;
function AttachmentList({ attachments }) {
    if (attachments.length === 0) {
        return null;
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex flex-wrap gap-2 mt-2",
        children: attachments.map((url)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$attachments$2f$blob$2d$ref$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isImageAttachmentUrl"])(url) ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                src: url,
                alt: "attachment",
                width: 240,
                height: 160,
                unoptimized: true,
                className: "h-auto max-w-[240px] rounded-md border border-white/[0.10]"
            }, url, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                lineNumber: 26,
                columnNumber: 13
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                href: url,
                target: "_blank",
                rel: "noopener noreferrer",
                className: "text-xs text-blue-400 underline",
                children: "Download attachment"
            }, url, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                lineNumber: 27,
                columnNumber: 13
            }, this))
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
        lineNumber: 23,
        columnNumber: 5
    }, this);
}
function ChatTimeline({ failedMessages, isAgentRunning, messages, messagesEndRef, onRetry, onRetrySend }) {
    if (messages.length === 0 && !isAgentRunning) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex flex-col items-center justify-center h-full text-center gap-3",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "size-10 rounded-md bg-white/[0.05] border border-border flex items-center justify-center",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$square$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageSquare$3e$__["MessageSquare"], {
                        className: "size-4 text-white/20"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                        lineNumber: 45,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                    lineNumber: 44,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-sm text-white/30",
                    children: "No messages yet"
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                    lineNumber: 47,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
            lineNumber: 43,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            messages.map((msg)=>{
                const isOutbound = msg.sender === "agent" || msg.sender === "ai";
                const isPending = isOutbound && msg.sendStatus === "pending";
                const isFailed = isOutbound && msg.sendStatus === "failed";
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    "data-testid": "chat-message",
                    "data-message-id": msg.id,
                    "data-sender": msg.sender,
                    "data-send-status": msg.sendStatus ?? undefined,
                    className: `flex flex-col gap-1 ${isOutbound ? "items-end" : "items-start"}`,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            "data-testid": "chat-message-bubble",
                            "data-message-id": msg.id,
                            "data-sender": msg.sender,
                            className: `px-4 py-3.5 text-[14px] max-w-[80%] leading-relaxed ${isFailed ? "bg-red-500/10 border border-red-500/30 text-white/70 rounded-md rounded-tr-sm" : isOutbound ? "bg-white/[0.14] text-white rounded-md rounded-tr-sm" : "bg-white/[0.07] border border-white/[0.10] text-white/75 rounded-md rounded-tl-sm"}`,
                            children: [
                                msg.text,
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(AttachmentList, {
                                    attachments: msg.attachments ?? []
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                                    lineNumber: 81,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                            lineNumber: 68,
                            columnNumber: 13
                        }, this),
                        isPending ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "flex items-center gap-1.5 text-xs text-white/30 mx-1",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                    className: "size-3 animate-spin"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                                    lineNumber: 85,
                                    columnNumber: 17
                                }, this),
                                "Sending…"
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                            lineNumber: 84,
                            columnNumber: 15
                        }, this) : isFailed ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center gap-1.5 mx-1",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$triangle$2d$alert$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertTriangle$3e$__["AlertTriangle"], {
                                    className: "size-3 text-red-400"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                                    lineNumber: 90,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-xs text-red-400",
                                    children: "Failed to send"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                                    lineNumber: 91,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-xs text-white/20",
                                    children: "·"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                                    lineNumber: 92,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>onRetrySend?.(msg.id),
                                    className: "text-xs font-semibold text-red-400 hover:text-red-300 transition-colors",
                                    children: "Retry"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                                    lineNumber: 93,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                            lineNumber: 89,
                            columnNumber: 15
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "text-xs text-white/25 mx-1",
                            children: msg.time
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                            lineNumber: 101,
                            columnNumber: 15
                        }, this)
                    ]
                }, msg.id, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                    lineNumber: 60,
                    columnNumber: 11
                }, this);
            }),
            failedMessages.map((failedMessage)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    "data-testid": "failed-chat-message",
                    "data-message-id": failedMessage.id,
                    className: "flex flex-col gap-1 items-end",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            "data-testid": "failed-chat-message-bubble",
                            "data-message-id": failedMessage.id,
                            className: "px-4 py-3.5 text-[14px] max-w-[80%] leading-relaxed bg-red-500/10 border border-red-500/30 text-white/70 rounded-md rounded-tr-sm",
                            children: failedMessage.text
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                            lineNumber: 114,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center gap-1.5 mx-1",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$triangle$2d$alert$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertTriangle$3e$__["AlertTriangle"], {
                                    className: "size-3 text-red-400"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                                    lineNumber: 122,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-xs text-red-400",
                                    children: "Failed to send"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                                    lineNumber: 123,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-xs text-white/20",
                                    children: "·"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                                    lineNumber: 124,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>onRetry?.(failedMessage.id),
                                    className: "text-xs font-semibold text-red-400 hover:text-red-300 transition-colors",
                                    children: "Retry"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                                    lineNumber: 125,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                            lineNumber: 121,
                            columnNumber: 11
                        }, this)
                    ]
                }, failedMessage.id, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                    lineNumber: 108,
                    columnNumber: 9
                }, this)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                ref: messagesEndRef
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx",
                lineNumber: 135,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>NotesTimeline
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertCircle$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/circle-alert.js [app-ssr] (ecmascript) <export default as AlertCircle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bot$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Bot$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/bot.js [app-ssr] (ecmascript) <export default as Bot>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/check.js [app-ssr] (ecmascript) <export default as Check>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/refresh-cw.js [app-ssr] (ecmascript) <export default as RefreshCw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$smartphone$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Smartphone$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/smartphone.js [app-ssr] (ecmascript) <export default as Smartphone>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$users$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Users$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/users.js [app-ssr] (ecmascript) <export default as Users>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/index.js [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/index.js [app-ssr] (ecmascript) <locals>");
"use client";
;
;
;
function NotesTimeline({ agentName, agentTurns, isAgentRunning, isPlanLoading, pendingInstruction, planPhrase, runPhrase, messages }) {
    if (messages.length === 0 && agentTurns.length === 0 && !isAgentRunning) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex flex-col items-center justify-center h-full text-center gap-3",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "size-10 rounded-md bg-violet-500/10 border border-violet-500/20 flex items-center justify-center",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$users$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Users$3e$__["Users"], {
                        className: "size-4 text-violet-400"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                        lineNumber: 32,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                    lineNumber: 31,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-sm font-semibold text-white/50",
                            children: "No internal activity yet"
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                            lineNumber: 35,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-xs text-white/30 mt-1",
                            children: [
                                "Type ",
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "font-mono font-semibold text-violet-400",
                                    children: [
                                        "@",
                                        agentName.toLowerCase()
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                    lineNumber: 37,
                                    columnNumber: 18
                                }, this),
                                " to ask ",
                                agentName,
                                ", or add a note for your team."
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                            lineNumber: 36,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                    lineNumber: 34,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
            lineNumber: 30,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            messages.map((msg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "w-full",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex gap-3",
                        children: [
                            msg.isAgentNote ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "size-7 rounded-full bg-violet-500/15 flex items-center justify-center shrink-0 mt-0.5",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bot$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Bot$3e$__["Bot"], {
                                    className: "size-3.5 text-violet-400"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                    lineNumber: 51,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                lineNumber: 50,
                                columnNumber: 15
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "size-7 rounded-full bg-amber-400/20 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold text-amber-400",
                                children: (msg.author ?? "Y")[0].toUpperCase()
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                lineNumber: 54,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex-1 min-w-0",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-baseline gap-1.5 mb-1.5",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: `text-[12px] font-semibold ${msg.isAgentNote ? "text-violet-400" : "text-white/60"}`,
                                                children: msg.author ?? "You"
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                                lineNumber: 60,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-xs text-white/30",
                                                children: "added a note"
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                                lineNumber: 63,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-xs text-white/25 ml-auto",
                                                children: msg.time
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                                lineNumber: 64,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                        lineNumber: 59,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: msg.isAgentNote ? "bg-violet-500/10 border border-violet-500/20 rounded-lg rounded-tl-sm px-3.5 py-2.5" : "bg-amber-400/10 border border-amber-400/20 rounded-lg rounded-tl-sm px-3.5 py-2.5",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "text-[13px] text-white/70 leading-relaxed",
                                            children: msg.text
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                            lineNumber: 70,
                                            columnNumber: 17
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                        lineNumber: 66,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                lineNumber: 58,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                        lineNumber: 48,
                        columnNumber: 11
                    }, this)
                }, msg.id, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                    lineNumber: 47,
                    columnNumber: 9
                }, this)),
            agentTurns.map((turn, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "space-y-2",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex flex-col gap-1 items-end",
                            children: [
                                turn.senderPhone && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex items-center gap-1 text-xs text-white/30 mr-1",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$smartphone$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Smartphone$3e$__["Smartphone"], {
                                            className: "size-3"
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                            lineNumber: 82,
                                            columnNumber: 17
                                        }, this),
                                        "Via Telegram"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                    lineNumber: 81,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "px-4 py-3.5 text-[14px] max-w-[80%] leading-relaxed bg-white/[0.08] text-white/70 rounded-md rounded-tr-sm",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-violet-400 font-semibold",
                                            children: [
                                                "@",
                                                agentName.toLowerCase()
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                            lineNumber: 87,
                                            columnNumber: 15
                                        }, this),
                                        " ",
                                        turn.instruction
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                    lineNumber: 86,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                            lineNumber: 79,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex flex-col gap-1 items-start",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex items-center gap-1.5 mb-0.5 ml-1",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bot$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Bot$3e$__["Bot"], {
                                            className: "size-3 text-violet-400"
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                            lineNumber: 93,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-xs font-semibold text-violet-400",
                                            children: agentName
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                            lineNumber: 94,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                    lineNumber: 92,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "px-4 py-3 max-w-[80%] bg-violet-500/10 border border-violet-500/20 rounded-md rounded-tl-sm space-y-2",
                                    children: turn.error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-xs text-red-400",
                                        children: turn.error
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                        lineNumber: 98,
                                        columnNumber: 17
                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                        children: [
                                            turn.actions.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "space-y-1",
                                                children: turn.actions.map((action, actionIndex)=>{
                                                    const isError = action.status ? action.status === "error" || action.status === "policy_block" : action.result.startsWith("Error:");
                                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "flex items-center gap-1.5",
                                                        children: [
                                                            isError ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertCircle$3e$__["AlertCircle"], {
                                                                className: "size-3 text-red-400 shrink-0"
                                                            }, void 0, false, {
                                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                                                lineNumber: 110,
                                                                columnNumber: 33
                                                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__["Check"], {
                                                                className: "size-3 text-green-400 shrink-0"
                                                            }, void 0, false, {
                                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                                                lineNumber: 111,
                                                                columnNumber: 33
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: `text-xs ${isError ? "text-red-400" : "text-white/40"}`,
                                                                children: isError ? action.result : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["TOOL_LABELS"][action.tool] ?? action.tool
                                                            }, void 0, false, {
                                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                                                lineNumber: 113,
                                                                columnNumber: 29
                                                            }, this)
                                                        ]
                                                    }, `${action.tool}-${action.result}`, true, {
                                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                                        lineNumber: 108,
                                                        columnNumber: 27
                                                    }, this);
                                                })
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                                lineNumber: 102,
                                                columnNumber: 21
                                            }, this),
                                            turn.summary && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: "text-[14px] text-white/70 leading-relaxed",
                                                children: turn.summary
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                                lineNumber: 122,
                                                columnNumber: 21
                                            }, this)
                                        ]
                                    }, void 0, true)
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                    lineNumber: 96,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                            lineNumber: 91,
                            columnNumber: 11
                        }, this)
                    ]
                }, turn.id ?? `${turn.instruction}-${index}`, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                    lineNumber: 78,
                    columnNumber: 9
                }, this)),
            (isPlanLoading || isAgentRunning) && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-2",
                children: [
                    pendingInstruction && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-col gap-1 items-end",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "px-4 py-3.5 text-[14px] max-w-[80%] leading-relaxed bg-white/[0.08] text-white/70 rounded-md rounded-tr-sm",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-violet-400 font-semibold",
                                    children: [
                                        "@",
                                        agentName.toLowerCase()
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                    lineNumber: 136,
                                    columnNumber: 17
                                }, this),
                                " ",
                                pendingInstruction
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                            lineNumber: 135,
                            columnNumber: 15
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                        lineNumber: 134,
                        columnNumber: 13
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-col gap-1 items-start",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center gap-1.5 mb-0.5 ml-1",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bot$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Bot$3e$__["Bot"], {
                                        className: "size-3 text-violet-400"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                        lineNumber: 143,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-xs font-semibold text-violet-400",
                                        children: agentName
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                        lineNumber: 144,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                lineNumber: 142,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "px-4 py-3 bg-violet-500/10 border border-violet-500/20 rounded-md rounded-tl-sm",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex items-center gap-1.5 text-xs text-violet-400",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__["RefreshCw"], {
                                            className: "size-3 animate-spin"
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                            lineNumber: 148,
                                            columnNumber: 17
                                        }, this),
                                        isPlanLoading ? planPhrase : runPhrase
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                    lineNumber: 147,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                                lineNumber: 146,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                        lineNumber: 141,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx",
                lineNumber: 132,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/composer-utils.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "buildComposerPlaceholder",
    ()=>buildComposerPlaceholder,
    "isInstagramReplyWindowExpired",
    ()=>isInstagramReplyWindowExpired
]);
function isInstagramReplyWindowExpired({ channelType, isAgentMode, isNoteTab, lastCustomerMessageAt, nowMs = Date.now() }) {
    return channelType === "ig_dm" && !isNoteTab && !isAgentMode && (!lastCustomerMessageAt || nowMs - new Date(lastCustomerMessageAt).getTime() > 24 * 60 * 60 * 1000);
}
function buildComposerPlaceholder({ agentName, customerName, isMobile, isNoteTab }) {
    const placeholderParts = isNoteTab ? [
        "Add a private note for your team",
        ...isMobile ? [] : [
            "⌘↵ to send"
        ]
    ] : [
        `Reply to ${customerName}…`,
        `type @${agentName.toLowerCase()} to invoke ${agentName}`,
        ...isMobile ? [] : [
            "⌘↵ to send"
        ]
    ];
    return placeholderParts.join("  ·  ");
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/composer-state.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useComposerState",
    ()=>useComposerState
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/swr/dist/index/index.mjs [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useMediaQuery$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/hooks/useMediaQuery.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/fetcher.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$composer$2f$composer$2d$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/composer-utils.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
function useComposerState({ customerName, agentName = "Shopkeeper", channelType, lastCustomerMessageAt, value, isAgentMode = false, viewTab, onViewTabChange, isSending, onChange }) {
    const textareaRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const shouldRestoreTextareaFocusRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(false);
    const isNoteTab = viewTab === "notes";
    const isEmailLike = channelType === "email" || channelType === "shopify";
    const igWindowExpired = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$composer$2f$composer$2d$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isInstagramReplyWindowExpired"])({
        channelType,
        isAgentMode,
        isNoteTab,
        lastCustomerMessageAt
    });
    const { data: integrations } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"])(isEmailLike ? "/api/integrations" : null, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["fetcher"]);
    const emailIntegration = integrations?.find((i)=>i.platform === "email");
    const senderEmail = emailIntegration?.fromEmail || emailIntegration?.externalAccountId || null;
    const resizeTextarea = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        const ta = textareaRef.current;
        if (!ta) return;
        ta.style.height = "0px";
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const cap = Math.min(viewportHeight * 0.4, 320);
        ta.style.height = `${Math.min(ta.scrollHeight, cap)}px`;
    }, []);
    const resizeTextareaRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(resizeTextarea);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        resizeTextareaRef.current = resizeTextarea;
    }, [
        resizeTextarea
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        resizeTextarea();
    }, [
        resizeTextarea,
        value
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const handleResize = ()=>resizeTextareaRef.current();
        window.visualViewport?.addEventListener("resize", handleResize);
        window.addEventListener("resize", handleResize);
        return ()=>{
            window.visualViewport?.removeEventListener("resize", handleResize);
            window.removeEventListener("resize", handleResize);
        };
    }, []);
    const isMobile = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useMediaQuery$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMediaQuery"])("(max-width: 767px)") === true;
    const placeholder = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$composer$2f$composer$2d$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["buildComposerPlaceholder"])({
        agentName,
        customerName,
        isMobile,
        isNoteTab
    });
    const sendDisabled = !value.trim() || isSending || igWindowExpired;
    const rememberTextareaFocus = ()=>{
        shouldRestoreTextareaFocusRef.current = document.activeElement === textareaRef.current;
    };
    const handleViewTabSelect = (tab)=>{
        onViewTabChange(tab);
        if (shouldRestoreTextareaFocusRef.current) {
            requestAnimationFrame(()=>textareaRef.current?.focus({
                    preventScroll: true
                }));
        }
        shouldRestoreTextareaFocusRef.current = false;
    };
    return {
        handleViewTabSelect,
        igWindowExpired,
        isEmailLike,
        isNoteTab,
        onChange,
        placeholder,
        rememberTextareaFocus,
        senderEmail,
        sendDisabled,
        textareaRef
    };
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Composer
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bot$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Bot$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/bot.js [app-ssr] (ecmascript) <export default as Bot>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/loader-circle.js [app-ssr] (ecmascript) <export default as Loader2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$composer$2f$composer$2d$state$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/composer-state.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
function Composer(props) {
    const { agentName = "Shopkeeper", error, isAgentMode = false, isSending, noteCount, onClearAgentMode, onSend, value } = props;
    const { handleViewTabSelect, igWindowExpired, isEmailLike, isNoteTab, onChange, placeholder, rememberTextareaFocus, senderEmail, sendDisabled, textareaRef } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$composer$2f$composer$2d$state$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useComposerState"])(props);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "bg-background border-t border-border shrink-0 pb-[max(0rem,env(safe-area-inset-bottom))]",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-1 px-5 border-b border-border",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(TabButton, {
                        active: !isNoteTab,
                        onClick: ()=>handleViewTabSelect('chat'),
                        onPointerDown: rememberTextareaFocus,
                        children: "Reply"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
                        lineNumber: 36,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(TabButton, {
                        active: isNoteTab,
                        onClick: ()=>handleViewTabSelect('notes'),
                        onPointerDown: rememberTextareaFocus,
                        children: [
                            "Internal note",
                            noteCount > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: `ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${isNoteTab ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[0.08] text-white/35'}`,
                                children: noteCount
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
                                lineNumber: 50,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
                        lineNumber: 43,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
                lineNumber: 35,
                columnNumber: 7
            }, this),
            igWindowExpired && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mx-5 mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200",
                children: "Instagram only allows replies within 24 hours of the customer's last message. Wait for them to message again before you can reply here."
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
                lineNumber: 60,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "relative px-5 pt-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-start gap-2",
                        children: [
                            isAgentMode && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "inline-flex items-center gap-1 bg-violet-500/15 text-violet-400 text-xs font-semibold px-2.5 py-[5px] rounded-full shrink-0 mt-0.5",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bot$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Bot$3e$__["Bot"], {
                                        className: "size-3"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
                                        lineNumber: 70,
                                        columnNumber: 15
                                    }, this),
                                    "@",
                                    agentName.toLowerCase()
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
                                lineNumber: 69,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                "aria-label": "Reply composer",
                                "data-testid": "reply-composer-textarea",
                                ref: textareaRef,
                                value: value,
                                onChange: (e)=>onChange(e.target.value),
                                onKeyDown: (e)=>{
                                    // ⌘/Ctrl + Enter sends; plain Enter inserts newline (default).
                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                        e.preventDefault();
                                        if (!sendDisabled) onSend(isNoteTab);
                                        return;
                                    }
                                    if (e.key === 'Backspace' && value === '' && isAgentMode && onClearAgentMode) {
                                        e.preventDefault();
                                        onClearAgentMode();
                                    }
                                },
                                disabled: isSending,
                                rows: 2,
                                className: "flex-1 w-0 min-h-[85px] max-h-[40vh] overflow-y-auto bg-transparent resize-none outline-none text-base md:text-sm text-white/80 placeholder:text-white/30 disabled:opacity-50",
                                placeholder: placeholder
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
                                lineNumber: 74,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
                        lineNumber: 67,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center justify-between pt-3 pb-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {}, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
                                lineNumber: 100,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center gap-3",
                                children: [
                                    isEmailLike && senderEmail && !isNoteTab && !isAgentMode && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-xs text-white/40 hidden sm:block",
                                        children: [
                                            "Replies as ",
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "font-semibold text-white/70",
                                                children: senderEmail
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
                                                lineNumber: 104,
                                                columnNumber: 28
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
                                        lineNumber: 103,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        "data-testid": "reply-composer-send",
                                        disabled: sendDisabled,
                                        onClick: ()=>onSend(isNoteTab),
                                        className: `flex items-center gap-2 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed h-8 pl-3 pr-2 rounded-md transition-colors ${isAgentMode ? 'bg-violet-500 text-white hover:bg-violet-400' : isNoteTab ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-emerald-500 text-white hover:bg-emerald-400'}`,
                                        children: isSending ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                                    className: "size-3.5 animate-spin"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
                                                    lineNumber: 120,
                                                    columnNumber: 19
                                                }, this),
                                                " ",
                                                isAgentMode ? 'Running…' : 'Sending…'
                                            ]
                                        }, void 0, true) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "flex items-center gap-1",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "text-sm leading-none",
                                                            children: "↑"
                                                        }, void 0, false, {
                                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
                                                            lineNumber: 124,
                                                            columnNumber: 21
                                                        }, this),
                                                        isAgentMode ? `Ask ${agentName}` : isNoteTab ? 'Save note' : 'Send'
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
                                                    lineNumber: 123,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("kbd", {
                                                    className: "hidden md:inline bg-black/25 text-white/80 text-xs font-semibold rounded px-1.5 py-0.5 leading-none",
                                                    children: "⌘↵"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
                                                    lineNumber: 127,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
                                        lineNumber: 107,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
                                lineNumber: 101,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
                        lineNumber: 99,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
                lineNumber: 66,
                columnNumber: 7
            }, this),
            error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "mt-1 mb-2 text-xs text-red-400 font-medium px-5",
                children: error
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
                lineNumber: 137,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
        lineNumber: 33,
        columnNumber: 5
    }, this);
}
function TabButton({ active, onClick, onPointerDown, children }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        type: "button",
        onClick: onClick,
        onPointerDown: onPointerDown,
        className: `relative inline-flex items-center text-sm font-semibold px-3 py-2 transition-colors ${active ? 'text-white' : 'text-white/35 hover:text-white/60'}`,
        children: [
            children,
            active && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "absolute left-2 right-2 -bottom-px h-0.5 bg-emerald-500 rounded-t-sm"
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
                lineNumber: 161,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx",
        lineNumber: 152,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/plan-step-display.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "formatPlanStepSentence",
    ()=>formatPlanStepSentence,
    "getPlanApproveLabel",
    ()=>getPlanApproveLabel,
    "getPlanCollapsedPreview",
    ()=>getPlanCollapsedPreview
]);
function formatPlanStepSentence(step, customerName) {
    const firstName = customerName?.trim().split(/\s+/)[0];
    if (step.tool === "send_reply") {
        const reply = step.description?.replace(/^"|"$/g, "").trim();
        if (reply && firstName) return `Reply to ${firstName}: "${reply}"`;
        if (reply) return `Reply: "${reply}"`;
        return "Send a reply to the customer";
    }
    if (step.tool === "send_email") {
        if (step.description) return step.description;
        return firstName ? `Email ${firstName}` : "Email the customer";
    }
    if (step.tool === "update_thread_status") {
        const status = step.description?.match(/Set status to (\w+)/i)?.[1]?.toLowerCase();
        if (status === "closed" || status === "resolved") return "Close the ticket";
    }
    if (step.description) return step.description;
    return step.label;
}
function getPlanApproveLabel(steps) {
    const enabled = steps.filter((step)=>step.enabled);
    const replyOnly = enabled.length === 1 && enabled[0].tool === "send_reply";
    return replyOnly ? "Send reply" : "Do this";
}
function getPlanCollapsedPreview(plan) {
    const replyStep = plan.steps.find((step)=>step.tool === "send_reply");
    if (replyStep?.description) {
        return replyStep.description.replace(/^"|"$/g, "").trim() || null;
    }
    const firstStep = plan.steps[0];
    if (!firstStep) return null;
    return formatPlanStepSentence(firstStep);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ActionPlanCard
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$up$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronUp$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/chevron-up.js [app-ssr] (ecmascript) <export default as ChevronUp>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/loader-circle.js [app-ssr] (ecmascript) <export default as Loader2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/refresh-cw.js [app-ssr] (ecmascript) <export default as RefreshCw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$triangle$2d$alert$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertTriangle$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/triangle-alert.js [app-ssr] (ecmascript) <export default as AlertTriangle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$AnimatePresence$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/components/AnimatePresence/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$LazyMotion$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/components/LazyMotion/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$dom$2f$features$2d$animation$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/render/dom/features-animation.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$m$2f$proxy$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/render/components/m/proxy.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$composer$2f$plan$2d$step$2d$display$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/plan-step-display.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
const TRANSITION = {
    layout: {
        type: "spring",
        stiffness: 420,
        damping: 32
    },
    opacity: {
        duration: 0.08,
        ease: "linear"
    }
};
const HIGH_RISK_TOOLS = new Set([
    "send_reply",
    "create_refund"
]);
function highRiskUncheckMessage(tool) {
    if (tool === "send_reply") {
        return "Unchecking the reply step means no message goes to the customer. Continue?";
    }
    if (tool === "create_refund") {
        return "Unchecking the refund step skips the refund. Continue?";
    }
    return "Unchecking this step skips a customer-facing action. Continue?";
}
const CONTENT_IN = {
    duration: 0.13,
    delay: 0.1
};
const CONTENT_OUT = {
    duration: 0.07
};
function ActionPlanCard({ plan, agentName = "Shopkeeper", customerName, isExecuting, isRegenerating, onApprove, onDismiss, onRegenerate }) {
    const [disabledStepIds, setDisabledStepIds] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(()=>new Set());
    const [collapsed, setCollapsed] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const steps = plan.steps.map((step)=>({
            ...step,
            enabled: !disabledStepIds.has(step.id)
        }));
    const toggleStep = (id, tool)=>{
        const isEnabled = !disabledStepIds.has(id);
        if (isEnabled && HIGH_RISK_TOOLS.has(tool)) {
            if (!window.confirm(highRiskUncheckMessage(tool))) return;
        }
        setDisabledStepIds((prev)=>{
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };
    const handleRun = ()=>{
        const enabledIds = new Set(steps.flatMap((s)=>s.enabled ? [
                s.id
            ] : []));
        const stepIds = new Set(steps.map((s)=>s.id));
        const approved = plan.rawToolCalls.filter((tc)=>{
            const isRead = !stepIds.has(tc.id);
            return isRead || enabledIds.has(tc.id);
        });
        onApprove(approved);
    };
    const enabledCount = steps.filter((s)=>s.enabled).length;
    const approveLabel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$composer$2f$plan$2d$step$2d$display$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getPlanApproveLabel"])(steps);
    const collapsedPreview = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$composer$2f$plan$2d$step$2d$display$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getPlanCollapsedPreview"])(plan);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$LazyMotion$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["LazyMotion"], {
        features: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$dom$2f$features$2d$animation$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["domAnimation"],
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "w-full",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$AnimatePresence$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AnimatePresence"], {
                initial: false,
                mode: "popLayout",
                children: collapsed ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$m$2f$proxy$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["m"].button, {
                    layoutId: "plan-card",
                    initial: {
                        opacity: 0
                    },
                    animate: {
                        opacity: 1
                    },
                    exit: {
                        opacity: 0
                    },
                    transition: TRANSITION,
                    onClick: ()=>setCollapsed(false),
                    className: "w-full flex items-center gap-2 pl-3 pr-4 py-2 bg-card border border-white/[0.12] rounded-full shadow-lg hover:border-white/[0.20] transition-colors overflow-hidden",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$m$2f$proxy$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["m"].div, {
                        initial: {
                            opacity: 0
                        },
                        animate: {
                            opacity: 1,
                            transition: CONTENT_IN
                        },
                        exit: {
                            opacity: 0,
                            transition: CONTENT_OUT
                        },
                        className: "flex items-center gap-2 w-full min-w-0",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "size-5 rounded-full bg-white/[0.12] flex items-center justify-center shrink-0",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$up$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronUp$3e$__["ChevronUp"], {
                                    className: "size-3 text-white/60"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                    lineNumber: 111,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                lineNumber: 110,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-[12px] font-semibold text-white/60 shrink-0",
                                children: [
                                    agentName,
                                    " wants to"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                lineNumber: 113,
                                columnNumber: 15
                            }, this),
                            collapsedPreview && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-[12px] text-white/45 truncate ml-auto italic",
                                children: collapsedPreview
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                lineNumber: 115,
                                columnNumber: 17
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                        lineNumber: 104,
                        columnNumber: 13
                    }, this)
                }, "bubble", false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                    lineNumber: 94,
                    columnNumber: 11
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$m$2f$proxy$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["m"].div, {
                    layoutId: "plan-card",
                    "data-testid": "action-plan-card",
                    initial: {
                        opacity: 0
                    },
                    animate: {
                        opacity: 1
                    },
                    exit: {
                        opacity: 0
                    },
                    transition: TRANSITION,
                    className: "w-full bg-card border border-white/[0.12] rounded-xl shadow-xl overflow-hidden",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$m$2f$proxy$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["m"].div, {
                        initial: {
                            opacity: 0
                        },
                        animate: {
                            opacity: 1,
                            transition: CONTENT_IN
                        },
                        exit: {
                            opacity: 0,
                            transition: CONTENT_OUT
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "relative flex items-center px-4 py-2.5 border-b border-white/[0.08] bg-white/[0.04]",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        onClick: ()=>setCollapsed(true),
                                        className: "flex-1 flex items-center gap-2 text-left min-w-0",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-[13px] font-semibold text-white/70 truncate",
                                                children: [
                                                    agentName,
                                                    " wants to:"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                                lineNumber: 143,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$up$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronUp$3e$__["ChevronUp"], {
                                                className: "size-3.5 text-white/35 shrink-0 ml-auto"
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                                lineNumber: 146,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                        lineNumber: 139,
                                        columnNumber: 17
                                    }, this),
                                    onRegenerate && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        onClick: onRegenerate,
                                        disabled: isExecuting || isRegenerating,
                                        title: "Regenerate plan",
                                        className: "ml-2 shrink-0 p-1 rounded text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors disabled:opacity-40",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__["RefreshCw"], {
                                            className: `size-3.5 ${isRegenerating ? 'animate-spin' : ''}`
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                            lineNumber: 155,
                                            columnNumber: 21
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                        lineNumber: 149,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                lineNumber: 138,
                                columnNumber: 15
                            }, this),
                            plan.warnings && plan.warnings.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "px-4 py-2.5 border-b border-white/[0.06] space-y-1.5 bg-amber-400/[0.04]",
                                children: plan.warnings.map((w)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-start gap-2",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$triangle$2d$alert$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertTriangle$3e$__["AlertTriangle"], {
                                                className: "size-3 text-amber-400 shrink-0 mt-0.5"
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                                lineNumber: 165,
                                                columnNumber: 23
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: "text-xs text-amber-300/80 leading-relaxed",
                                                children: w
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                                lineNumber: 166,
                                                columnNumber: 23
                                            }, this)
                                        ]
                                    }, w, true, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                        lineNumber: 164,
                                        columnNumber: 21
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                lineNumber: 162,
                                columnNumber: 17
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ol", {
                                className: "divide-y divide-white/[0.06] max-h-[30vh] overflow-y-auto custom-scrollbar",
                                children: steps.map((step, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            "data-testid": "action-plan-step-toggle",
                                            "data-step-id": step.id,
                                            "aria-pressed": step.enabled,
                                            onClick: ()=>toggleStep(step.id, step.tool),
                                            disabled: isExecuting,
                                            className: "w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-white/[0.04] transition-colors disabled:opacity-60",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: `mt-0.5 size-4 shrink-0 rounded border flex items-center justify-center text-[10px] font-bold transition-colors ${step.enabled ? 'bg-white border-white text-black' : 'bg-transparent border-white/[0.20] text-white/25'}`,
                                                    children: isExecuting && step.enabled ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                                        className: "size-2.5 animate-spin"
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                                        lineNumber: 190,
                                                        columnNumber: 29
                                                    }, this) : index + 1
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                                    lineNumber: 184,
                                                    columnNumber: 23
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: `flex-1 min-w-0 text-[13px] leading-relaxed ${step.enabled ? 'text-white/80' : 'text-white/25 line-through'}`,
                                                    children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$composer$2f$plan$2d$step$2d$display$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatPlanStepSentence"])(step, customerName)
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                                    lineNumber: 194,
                                                    columnNumber: 23
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                            lineNumber: 176,
                                            columnNumber: 21
                                        }, this)
                                    }, step.id, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                        lineNumber: 175,
                                        columnNumber: 19
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                lineNumber: 173,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center gap-2 px-4 py-2.5 border-t border-white/[0.06] bg-white/[0.02]",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        "data-testid": "action-plan-run",
                                        onClick: handleRun,
                                        disabled: isExecuting || enabledCount === 0,
                                        className: "flex items-center gap-1.5 h-8 px-4 bg-green-400 hover:bg-green-300 disabled:bg-white/[0.07] disabled:text-white/25 text-black text-xs font-semibold rounded-md transition-colors",
                                        children: isExecuting ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                                    className: "size-3 animate-spin"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                                    lineNumber: 213,
                                                    columnNumber: 25
                                                }, this),
                                                " Running…"
                                            ]
                                        }, void 0, true) : approveLabel
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                        lineNumber: 206,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        "data-testid": "action-plan-dismiss",
                                        onClick: onDismiss,
                                        disabled: isExecuting,
                                        className: "h-8 px-3 text-xs font-semibold text-white/50 border border-white/[0.12] rounded-md hover:text-white/70 hover:border-white/[0.20] transition-colors disabled:opacity-40",
                                        children: "I'll handle this"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                        lineNumber: 217,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                                lineNumber: 205,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                        lineNumber: 132,
                        columnNumber: 13
                    }, this)
                }, "card", false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                    lineNumber: 122,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
                lineNumber: 92,
                columnNumber: 7
            }, this)
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
            lineNumber: 91,
            columnNumber: 5
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx",
        lineNumber: 90,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ConversationComposerArea.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ConversationComposerArea
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$AnimatePresence$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/components/AnimatePresence/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$LazyMotion$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/components/LazyMotion/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$dom$2f$features$2d$animation$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/render/dom/features-animation.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$m$2f$proxy$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/render/components/m/proxy.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$composer$2f$Composer$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/Composer.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$composer$2f$ActionPlanCard$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ActionPlanCard.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
function ConversationComposerArea({ agentName, containerRef, agentInstruction, isAgentMode, isPlanExecuting, isRegenerating, noteCount, onChange, onClearAgentMode, onPlanApprove, onPlanDismiss, onPlanRegenerate, onSend, onViewTabChange, pendingPlan, composer, viewTab }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$LazyMotion$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["LazyMotion"], {
        features: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$dom$2f$features$2d$animation$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["domAnimation"],
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            ref: containerRef,
            className: "mobile-ticket-composer-row relative z-20 shrink-0 flex flex-col",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$AnimatePresence$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AnimatePresence"], {
                    initial: false,
                    children: pendingPlan && viewTab === "chat" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$m$2f$proxy$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["m"].div, {
                        className: "overflow-hidden",
                        initial: {
                            height: 0,
                            opacity: 0
                        },
                        animate: {
                            height: "auto",
                            opacity: 1
                        },
                        exit: {
                            height: 0,
                            opacity: 0,
                            transition: {
                                duration: 0.2
                            }
                        },
                        transition: {
                            duration: 0.3,
                            ease: "easeOut"
                        },
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "px-5 pb-2 pt-1 pointer-events-auto",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$composer$2f$ActionPlanCard$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                plan: pendingPlan,
                                agentName: agentName,
                                customerName: composer.customerName,
                                isExecuting: isPlanExecuting,
                                isRegenerating: isRegenerating,
                                onApprove: onPlanApprove,
                                onDismiss: onPlanDismiss,
                                onRegenerate: onPlanRegenerate
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ConversationComposerArea.tsx",
                                lineNumber: 70,
                                columnNumber: 15
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ConversationComposerArea.tsx",
                            lineNumber: 69,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ConversationComposerArea.tsx",
                        lineNumber: 62,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ConversationComposerArea.tsx",
                    lineNumber: 60,
                    columnNumber: 7
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$composer$2f$Composer$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                    customerName: composer.customerName,
                    agentName: agentName,
                    channelType: composer.channelType,
                    shopifyCustomerId: composer.shopifyCustomerId,
                    customerPlatformId: composer.customerPlatformId,
                    lastCustomerMessageAt: composer.lastCustomerMessageAt,
                    value: isAgentMode ? agentInstruction : composer.replyText,
                    isAgentMode: isAgentMode,
                    viewTab: viewTab,
                    noteCount: noteCount,
                    onViewTabChange: onViewTabChange,
                    isSending: composer.isSending,
                    error: composer.sendError,
                    onChange: onChange,
                    onClearAgentMode: onClearAgentMode,
                    onSend: onSend
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ConversationComposerArea.tsx",
                    lineNumber: 85,
                    columnNumber: 7
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ConversationComposerArea.tsx",
            lineNumber: 59,
            columnNumber: 5
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ConversationComposerArea.tsx",
        lineNumber: 58,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationTabs.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ConversationTabs
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$square$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageSquare$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/message-square.js [app-ssr] (ecmascript) <export default as MessageSquare>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$users$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Users$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/users.js [app-ssr] (ecmascript) <export default as Users>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/tabs.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
function ConversationTabs({ noteCount, value, onValueChange }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "px-4 py-2 border-b border-border bg-background shrink-0",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Tabs"], {
            value: value,
            onValueChange: (nextValue)=>onValueChange(nextValue),
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TabsList"], {
                className: "bg-transparent h-auto p-0 gap-1",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TabsTrigger"], {
                        value: "chat",
                        className: "text-xs font-semibold rounded px-3 py-1.5 gap-1.5 h-auto data-[state=active]:bg-white/[0.10] data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:text-white/35",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$square$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageSquare$3e$__["MessageSquare"], {
                                className: "size-3"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationTabs.tsx",
                                lineNumber: 21,
                                columnNumber: 13
                            }, this),
                            "Conversation"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationTabs.tsx",
                        lineNumber: 17,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TabsTrigger"], {
                        value: "notes",
                        className: "text-xs font-semibold rounded px-3 py-1.5 gap-1.5 h-auto data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-400 data-[state=active]:shadow-none data-[state=inactive]:text-white/35",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$users$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Users$3e$__["Users"], {
                                className: "size-3"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationTabs.tsx",
                                lineNumber: 28,
                                columnNumber: 13
                            }, this),
                            "Internal",
                            noteCount > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: `px-1.5 py-0.5 rounded-full text-xs font-bold ${value === "notes" ? "bg-violet-500/20 text-violet-400" : "bg-white/[0.08] text-white/35"}`,
                                children: noteCount
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationTabs.tsx",
                                lineNumber: 31,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationTabs.tsx",
                        lineNumber: 24,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationTabs.tsx",
                lineNumber: 16,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationTabs.tsx",
            lineNumber: 15,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationTabs.tsx",
        lineNumber: 14,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/utils/conversationViewUtils.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "partitionConversationMessages",
    ()=>partitionConversationMessages
]);
function partitionConversationMessages(messages, viewTab) {
    const chatMessages = messages.filter((message)=>message.sender !== "note");
    const noteMessages = messages.filter((message)=>message.sender === "note");
    return {
        chatMessages,
        noteMessages,
        displayMessages: viewTab === "chat" ? chatMessages : noteMessages,
        noteCount: noteMessages.length
    };
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/useVisualKeyboard.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getVisualKeyboardState",
    ()=>getVisualKeyboardState,
    "useVisualKeyboard",
    ()=>useVisualKeyboard
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
const MOBILE_QUERY = "(max-width: 767px)";
const COARSE_POINTER_QUERY = "(pointer: coarse)";
const KEYBOARD_DELTA_THRESHOLD = 80;
const EDITABLE_SELECTOR = [
    "textarea",
    "select",
    "input:not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit']):not([type='reset'])",
    "[contenteditable='true']",
    "[role='textbox']"
].join(",");
const DEFAULT_STATE = {
    keyboardInset: 0,
    keyboardOpen: false,
    visualViewportHeight: 0
};
function getVisualKeyboardState({ focusedEditable, innerHeight, isMobile, isCoarsePointer = false, visualViewport }) {
    const hasVisualViewport = !!visualViewport;
    const visualViewportHeight = visualViewport?.height ?? innerHeight;
    const viewportDelta = hasVisualViewport ? innerHeight - visualViewportHeight : 0;
    const viewportWasReduced = viewportDelta > KEYBOARD_DELTA_THRESHOLD;
    const focusFallback = !hasVisualViewport && focusedEditable && isCoarsePointer;
    const keyboardOpen = isMobile && (viewportWasReduced || focusFallback);
    const keyboardInset = keyboardOpen && visualViewport ? Math.max(0, innerHeight - visualViewport.height - visualViewport.offsetTop) : 0;
    return {
        keyboardInset,
        keyboardOpen,
        visualViewportHeight
    };
}
function statesMatch(a, b) {
    return a.keyboardInset === b.keyboardInset && a.keyboardOpen === b.keyboardOpen && a.visualViewportHeight === b.visualViewportHeight;
}
function useVisualKeyboard(rootRef, enabled = true) {
    const [state, setState] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(DEFAULT_STATE);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!enabled) return;
        if ("TURBOPACK compile-time truthy", 1) return;
        //TURBOPACK unreachable
        ;
        let settleTimer;
        const mobileQuery = undefined;
        const legacyMobileQuery = undefined;
        const coarsePointerQuery = undefined;
        const legacyCoarsePointerQuery = undefined;
        const hasFocusedEditable = undefined;
        const read = undefined;
        const update = undefined;
        const scheduleUpdate = undefined;
        const passiveListenerOptions = undefined;
    }, [
        enabled,
        rootRef
    ]);
    return enabled ? state : DEFAULT_STATE;
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ConversationView
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useFillerPhrase$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/hooks/useFillerPhrase.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useThreadPresence$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/hooks/useThreadPresence.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$useConversationAgentFlow$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_hooks/useConversationAgentFlow.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$ConversationHeader$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationHeader.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$ConversationSummaryBar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationSummaryBar.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$PresenceBanner$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/PresenceBanner.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$timeline$2f$ChatTimeline$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/ChatTimeline.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$timeline$2f$NotesTimeline$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/timeline/NotesTimeline.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$composer$2f$ConversationComposerArea$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/composer/ConversationComposerArea.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$ConversationTabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationTabs.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$utils$2f$conversationViewUtils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/utils/conversationViewUtils.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$useVisualKeyboard$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/useVisualKeyboard.ts [app-ssr] (ecmascript)");
"use client";
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
;
;
;
;
const EMPTY_FAILED_MESSAGES = [];
function ConversationView({ ticket, activeTab, agentName, shopifyCustomerId, customerPlatformId, replyText, sendError, messagesEndRef, agentTurns, status, onAgentTurnAdd, onAgentRunningChange, onBack, onResolve, onReopen, onReplyChange, onSend, onAgentComplete, initialPlan, onOpenContext, aiSummary, onRefreshSummary, failedMessages = EMPTY_FAILED_MESSAGES, onRetry, onRetrySend }) {
    const { threadLoading: isThreadLoading = false, sending: isSending, agentRunning: isAgentRunning, summaryRefreshing: isSummaryRefreshing } = status;
    const [viewTab, setViewTab] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('chat');
    const conversationRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const timelineRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const composerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const { keyboardInset, visualViewportHeight } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$useVisualKeyboard$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useVisualKeyboard"])(conversationRef, activeTab === 'open');
    const keyboardLayoutOpen = keyboardInset > 0;
    const { displayMessages, noteCount } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$utils$2f$conversationViewUtils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["partitionConversationMessages"])(ticket.messages, viewTab);
    const { agentInstruction, handlePlanApprove, handlePlanDismiss, handlePlanRegenerate, handleSend, isAgentMode, isPlanExecuting, isPlanLoading, isRegenerating, pendingInstruction, pendingPlan } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$useConversationAgentFlow$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useConversationAgentFlow"])({
        ticket,
        viewTab,
        replyText,
        agentName,
        initialPlan,
        onReplyChange,
        onSend,
        onAgentTurnAdd,
        onAgentRunningChange,
        onAgentComplete,
        onPrivateAnswerStart: ()=>setViewTab('notes'),
        onNoteModeReset: ()=>setViewTab('chat')
    });
    const planPhrase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useFillerPhrase$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useFillerPhrase"])([
        'On it…',
        'Reading the room…',
        'Getting up to speed…',
        'Cooking up a plan…'
    ], isPlanLoading);
    const runPhrase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useFillerPhrase$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useFillerPhrase"])([
        'Making it happen…',
        'Doing the thing…',
        'Almost there…',
        'Just a sec…',
        'Finishing touches…'
    ], isAgentRunning);
    const { presenceCount } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useThreadPresence$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useThreadPresence"])(ticket.id);
    const conversationStyle = {
        "--ticket-visual-viewport-height": `${visualViewportHeight}px`
    };
    const scrollTimelineToEnd = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((behavior = "smooth")=>{
        const timeline = timelineRef.current;
        if (timeline) {
            timeline.scrollTo({
                top: timeline.scrollHeight,
                behavior
            });
            return;
        }
        messagesEndRef.current?.scrollIntoView({
            behavior,
            block: "end"
        });
    }, [
        messagesEndRef
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const root = conversationRef.current;
        if (activeTab !== 'open') {
            root?.style.setProperty("--ticket-composer-height", "0px");
            return;
        }
        const element = composerRef.current;
        if (!element) return;
        const updateHeight = ()=>{
            root?.style.setProperty("--ticket-composer-height", `${Math.ceil(element.getBoundingClientRect().height)}px`);
        };
        updateHeight();
        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", updateHeight);
            return ()=>window.removeEventListener("resize", updateHeight);
        }
        const observer = new ResizeObserver(updateHeight);
        observer.observe(element);
        return ()=>observer.disconnect();
    }, [
        activeTab
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!keyboardLayoutOpen) return;
        const settleScroll = ()=>scrollTimelineToEnd("smooth");
        const first = window.setTimeout(settleScroll, 50);
        const second = window.setTimeout(settleScroll, 300);
        return ()=>{
            window.clearTimeout(first);
            window.clearTimeout(second);
        };
    }, [
        displayMessages.length,
        failedMessages.length,
        keyboardInset,
        keyboardLayoutOpen,
        replyText,
        scrollTimelineToEnd,
        viewTab,
        visualViewportHeight
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const root = document.documentElement;
        if (keyboardLayoutOpen) {
            root.dataset.mobileTicketEditing = "true";
        } else if (root.dataset.mobileTicketEditing === "true") {
            delete root.dataset.mobileTicketEditing;
        }
        return ()=>{
            if (root.dataset.mobileTicketEditing === "true") {
                delete root.dataset.mobileTicketEditing;
            }
        };
    }, [
        keyboardLayoutOpen
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: conversationRef,
        "data-keyboard-open": keyboardLayoutOpen ? "true" : "false",
        "data-testid": "ticket-conversation",
        className: "mobile-ticket-conversation flex-1 flex flex-col min-w-0 min-h-0 bg-background",
        style: conversationStyle,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$ConversationHeader$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                activeTab: activeTab,
                customer: ticket.customer,
                platform: ticket.platform,
                onBack: onBack,
                onResolve: onResolve,
                onReopen: onReopen,
                onOpenContext: onOpenContext
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                lineNumber: 223,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$ConversationSummaryBar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                summary: aiSummary,
                isRefreshing: isSummaryRefreshing,
                onRefresh: onRefreshSummary
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                lineNumber: 232,
                columnNumber: 7
            }, this),
            activeTab === 'closed' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$ConversationTabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                noteCount: noteCount,
                value: viewTab,
                onValueChange: setViewTab
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                lineNumber: 239,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$PresenceBanner$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                presenceCount: presenceCount
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                lineNumber: 241,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                ref: timelineRef,
                "data-testid": viewTab === 'notes' ? 'notes-timeline' : 'chat-timeline',
                "data-thread-id": ticket.id,
                className: `mobile-ticket-timeline flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4 transition-colors ${viewTab === 'notes' ? 'bg-violet-500/[0.02]' : 'bg-background'}`,
                children: isThreadLoading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(TimelineSkeleton, {}, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                    lineNumber: 253,
                    columnNumber: 11
                }, this) : viewTab === 'notes' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$timeline$2f$NotesTimeline$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                    agentName: agentName,
                    agentTurns: agentTurns,
                    isAgentRunning: isAgentRunning,
                    isPlanLoading: isPlanLoading,
                    messages: displayMessages,
                    pendingInstruction: pendingInstruction,
                    planPhrase: planPhrase,
                    runPhrase: runPhrase
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                    lineNumber: 255,
                    columnNumber: 11
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$timeline$2f$ChatTimeline$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                    failedMessages: failedMessages,
                    isAgentRunning: isAgentRunning,
                    messages: displayMessages,
                    messagesEndRef: messagesEndRef,
                    onRetry: onRetry,
                    onRetrySend: onRetrySend
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                    lineNumber: 266,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                lineNumber: 244,
                columnNumber: 7
            }, this),
            activeTab === 'open' && (isThreadLoading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(ComposerSkeleton, {}, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                lineNumber: 279,
                columnNumber: 11
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$composer$2f$ConversationComposerArea$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                containerRef: composerRef,
                agentName: agentName,
                agentInstruction: agentInstruction,
                isAgentMode: isAgentMode,
                isPlanExecuting: isPlanExecuting,
                isRegenerating: isRegenerating,
                noteCount: noteCount,
                onChange: (text)=>onReplyChange(isAgentMode ? `@${agentName.toLowerCase()} ` + text : text),
                onClearAgentMode: ()=>onReplyChange(''),
                onPlanApprove: handlePlanApprove,
                onPlanDismiss: handlePlanDismiss,
                onPlanRegenerate: handlePlanRegenerate,
                onSend: handleSend,
                onViewTabChange: setViewTab,
                pendingPlan: pendingPlan,
                composer: {
                    customerName: ticket.customer,
                    channelType: ticket.channelType,
                    customerPlatformId,
                    isSending: isSending || isAgentRunning || isPlanLoading,
                    replyText,
                    sendError,
                    shopifyCustomerId,
                    lastCustomerMessageAt: ticket.lastCustomerMessageAt
                },
                viewTab: viewTab
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                lineNumber: 281,
                columnNumber: 11
            }, this))
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
        lineNumber: 216,
        columnNumber: 5
    }, this);
}
function TimelineSkeleton() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "animate-pulse space-y-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "max-w-[75%] space-y-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "h-3 w-16 rounded bg-white/[0.07]"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                        lineNumber: 319,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "h-3 w-56 max-w-full rounded bg-white/[0.06]"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                        lineNumber: 320,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "h-3 w-40 max-w-full rounded bg-white/[0.05]"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                        lineNumber: 321,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                lineNumber: 318,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "ml-auto max-w-[70%] space-y-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "ml-auto h-3 w-14 rounded bg-white/[0.07]"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                        lineNumber: 324,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "h-3 w-52 max-w-full rounded bg-white/[0.06]"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                        lineNumber: 325,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                lineNumber: 323,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "max-w-[68%] space-y-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "h-3 w-20 rounded bg-white/[0.07]"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                        lineNumber: 328,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "h-3 w-48 max-w-full rounded bg-white/[0.06]"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                        lineNumber: 329,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "h-3 w-36 max-w-full rounded bg-white/[0.05]"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                        lineNumber: 330,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                lineNumber: 327,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
        lineNumber: 317,
        columnNumber: 5
    }, this);
}
function ComposerSkeleton() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "mobile-ticket-composer-row relative z-20 shrink-0 flex flex-col",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "bg-background border-t border-border animate-pulse",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex items-center gap-1 px-5 border-b border-border",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "px-3 py-2",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "h-4 w-10 rounded bg-white/[0.08]"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                                lineNumber: 342,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                            lineNumber: 341,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "px-3 py-2",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "h-4 w-20 rounded bg-white/[0.05]"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                                lineNumber: 345,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                            lineNumber: 344,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                    lineNumber: 340,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "px-5 pt-3",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "h-[85px] w-full rounded bg-white/[0.04]"
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                            lineNumber: 349,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center justify-end pt-3 pb-3",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "h-8 w-20 rounded-md bg-white/[0.08]"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                                lineNumber: 351,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                            lineNumber: 350,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
                    lineNumber: 348,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
            lineNumber: 339,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx",
        lineNumber: 338,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/SectionHeader.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SectionHeader",
    ()=>SectionHeader
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
;
function SectionHeader({ title, action }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex items-center justify-between gap-2 mb-2",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "text-xs font-semibold uppercase tracking-[0.12em] text-white/40 shrink-0",
                children: title
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/SectionHeader.tsx",
                lineNumber: 11,
                columnNumber: 7
            }, this),
            action && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "shrink-0",
                children: action
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/SectionHeader.tsx",
                lineNumber: 12,
                columnNumber: 18
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/SectionHeader.tsx",
        lineNumber: 10,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/formatters.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "formatMoney",
    ()=>formatMoney,
    "formatMonthYear",
    ()=>formatMonthYear,
    "formatShortDate",
    ()=>formatShortDate,
    "fulfillmentLabel",
    ()=>fulfillmentLabel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$format$2f$date$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/format/date.ts [app-ssr] (ecmascript)");
;
function fulfillmentLabel(status) {
    switch(status){
        case 'fulfilled':
            return {
                label: 'Fulfilled',
                textClass: 'text-emerald-400',
                dotClass: 'bg-emerald-500'
            };
        case 'partial':
            return {
                label: 'Partial',
                textClass: 'text-amber-400',
                dotClass: 'bg-amber-500'
            };
        case 'restocked':
            return {
                label: 'Restocked',
                textClass: 'text-white/50',
                dotClass: 'bg-white/30'
            };
        default:
            return {
                label: 'Unfulfilled',
                textClass: 'text-amber-400',
                dotClass: 'bg-amber-500'
            };
    }
}
function formatMoney(value, currency) {
    const n = typeof value === 'number' ? value : parseFloat(value ?? '');
    const amount = Number.isFinite(n) ? n : 0;
    if (currency) {
        try {
            return amount.toLocaleString('en-US', {
                style: 'currency',
                currency
            });
        } catch  {
        // Fall through to a compact numeric fallback for unexpected currency codes.
        }
    }
    return `$${amount.toFixed(2)}`;
}
function formatMonthYear(iso) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$format$2f$date$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatMonthYear"])(iso, {
        fallback: '-',
        timeZone: 'UTC'
    });
}
function formatShortDate(iso) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$format$2f$date$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatShortDate"])(iso, {
        fallback: '',
        timeZone: 'UTC'
    });
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CustomerInfo",
    ()=>CustomerInfo
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/check.js [app-ssr] (ecmascript) <export default as Check>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/refresh-cw.js [app-ssr] (ecmascript) <export default as RefreshCw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$formatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/formatters.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
function makeCustomerDraft(customer) {
    const addr = customer.default_address;
    return {
        first_name: customer.first_name ?? '',
        last_name: customer.last_name ?? '',
        email: customer.email ?? '',
        phone: customer.phone ?? '',
        address1: addr?.address1 ?? '',
        city: addr?.city ?? '',
        province: addr?.province ?? '',
        zip: addr?.zip ?? '',
        country: addr?.country_name ?? '',
        note: customer.note ?? ''
    };
}
function CustomerInfo({ customer, isEditing, onEditingChange, onSaved }) {
    if (isEditing) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(CustomerInfoEditor, {
            customer: customer,
            onEditingChange: onEditingChange,
            onSaved: onSaved
        }, customer.id, false, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
            lineNumber: 48,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-2.5",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-baseline justify-between gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs leading-4 text-white/50 shrink-0",
                        children: "Orders"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                        lineNumber: 60,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs leading-4 font-semibold text-white/80 tabular-nums",
                        children: customer.orders_count
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                        lineNumber: 61,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                lineNumber: 59,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-baseline justify-between gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs leading-4 text-white/50 shrink-0",
                        children: "Total spent"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                        lineNumber: 65,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs leading-4 font-semibold text-white/80 tabular-nums",
                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$formatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatMoney"])(customer.total_spent, customer.currency)
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                        lineNumber: 66,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                lineNumber: 64,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-baseline justify-between gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs leading-4 text-white/50 shrink-0",
                        children: "Since"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                        lineNumber: 70,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs leading-4 font-semibold text-white/80 tabular-nums",
                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$formatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatMonthYear"])(customer.created_at)
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                        lineNumber: 71,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                lineNumber: 69,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
        lineNumber: 58,
        columnNumber: 5
    }, this);
}
function CustomerInfoEditor({ customer, onEditingChange, onSaved }) {
    const [isSaving, setIsSaving] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [saveError, setSaveError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [draft, setDraft] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(()=>makeCustomerDraft(customer));
    const handleSave = async ()=>{
        setIsSaving(true);
        setSaveError(null);
        try {
            const res = await fetch('/api/shopify/customer', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    customerId: customer.id,
                    updates: {
                        first_name: draft.first_name,
                        last_name: draft.last_name,
                        email: draft.email,
                        phone: draft.phone || null,
                        note: draft.note || null,
                        address: {
                            address1: draft.address1 || null,
                            city: draft.city || null,
                            province: draft.province || null,
                            zip: draft.zip || null,
                            country: draft.country || null
                        }
                    }
                })
            });
            const data = await res.json().catch(()=>({}));
            if (!res.ok || !data.customer) {
                setSaveError(typeof data.error === 'string' ? data.error : 'Failed to save customer.');
                return;
            }
            onSaved({
                first_name: data.customer.first_name,
                last_name: data.customer.last_name,
                email: data.customer.email,
                phone: data.customer.phone ?? null,
                note: data.customer.note ?? null,
                default_address: data.customer.default_address ?? null
            });
            onEditingChange(false);
        } catch (error) {
            console.error('Failed to save Shopify customer', error);
            setSaveError('Failed to save customer.');
        } finally{
            setIsSaving(false);
        }
    };
    const inputCls = "w-full text-xs text-white/80 bg-white/[0.05] border border-white/[0.12] rounded px-2 py-1.5 focus:outline-none focus:border-white/[0.25]";
    const labelCls = "block text-xs text-white/30 mb-0.5";
    const field = (label, key, textarea)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                    htmlFor: `shopify-customer-${customer.id}-${key}`,
                    className: labelCls,
                    children: label
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                    lineNumber: 137,
                    columnNumber: 9
                }, this),
                textarea ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                    "aria-label": label,
                    id: `shopify-customer-${customer.id}-${key}`,
                    value: draft[key],
                    onChange: (e)=>setDraft((d)=>({
                                ...d,
                                [key]: e.target.value
                            })),
                    rows: 3,
                    className: `${inputCls} resize-none`
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                    lineNumber: 139,
                    columnNumber: 11
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                    "aria-label": label,
                    id: `shopify-customer-${customer.id}-${key}`,
                    type: key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text',
                    value: draft[key],
                    onChange: (e)=>setDraft((d)=>({
                                ...d,
                                [key]: e.target.value
                            })),
                    className: inputCls
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                    lineNumber: 148,
                    columnNumber: 11
                }, this)
            ]
        }, key, true, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
            lineNumber: 136,
            columnNumber: 7
        }, this);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-2.5",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "rounded-md border border-white/[0.07] bg-white/[0.03] p-2.5 space-y-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center justify-between pb-1 border-b border-white/[0.07]",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-xs text-white/30 font-medium",
                                children: "Edit customer"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                                lineNumber: 164,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center gap-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        onClick: ()=>{
                                            onEditingChange(false);
                                            setSaveError(null);
                                        },
                                        className: "text-xs text-white/30 hover:text-white/60 transition-colors",
                                        children: "Cancel"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                                        lineNumber: 166,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        onClick: handleSave,
                                        disabled: isSaving,
                                        className: "flex items-center gap-1 text-xs font-semibold text-white bg-[#96BF48] hover:bg-[#7da33a] disabled:opacity-50 rounded px-2 py-0.5 transition-colors",
                                        children: [
                                            isSaving ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__["RefreshCw"], {
                                                className: "size-2.5 animate-spin"
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                                                lineNumber: 179,
                                                columnNumber: 27
                                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__["Check"], {
                                                className: "size-2.5"
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                                                lineNumber: 179,
                                                columnNumber: 77
                                            }, this),
                                            "Save"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                                        lineNumber: 173,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                                lineNumber: 165,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                        lineNumber: 163,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid grid-cols-2 gap-2",
                        children: [
                            field('First name', 'first_name'),
                            field('Last name', 'last_name')
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                        lineNumber: 184,
                        columnNumber: 9
                    }, this),
                    field('Email', 'email'),
                    field('Phone', 'phone'),
                    field('Address', 'address1'),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid grid-cols-2 gap-2",
                        children: [
                            field('City', 'city'),
                            field('Province', 'province')
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                        lineNumber: 191,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid grid-cols-2 gap-2",
                        children: [
                            field('ZIP', 'zip'),
                            field('Country', 'country')
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                        lineNumber: 195,
                        columnNumber: 9
                    }, this),
                    field('Notes', 'note', true)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                lineNumber: 162,
                columnNumber: 7
            }, this),
            saveError && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-xs text-red-500",
                children: saveError
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
                lineNumber: 201,
                columnNumber: 21
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx",
        lineNumber: 161,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ManageDropdown.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ManageDropdown",
    ()=>ManageDropdown
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$ellipsis$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MoreHorizontal$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/ellipsis.js [app-ssr] (ecmascript) <export default as MoreHorizontal>");
"use client";
;
;
;
function ManageDropdown({ items }) {
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const ref = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!open) return;
        const handlePointerDown = (e)=>{
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        const handleKeyDown = (e)=>{
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return ()=>{
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [
        open
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: ref,
        className: "relative shrink-0",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: ()=>setOpen((o)=>!o),
                className: "flex size-6 items-center justify-center rounded text-white/40 hover:bg-white/[0.05] hover:text-white/70 transition-colors",
                "aria-haspopup": "menu",
                "aria-expanded": open,
                "aria-label": "Manage customer",
                title: "Manage customer",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$ellipsis$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MoreHorizontal$3e$__["MoreHorizontal"], {
                    className: "size-3.5"
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ManageDropdown.tsx",
                    lineNumber: 49,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ManageDropdown.tsx",
                lineNumber: 40,
                columnNumber: 7
            }, this),
            open && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                role: "menu",
                className: "absolute right-0 top-7 z-10 w-44 rounded-md border border-white/[0.09] bg-popover shadow-md py-1",
                children: items.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>{
                            void item.onClick();
                            setOpen(false);
                        },
                        role: "menuitem",
                        className: `w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${item.danger ? 'text-white/50 hover:text-red-400 hover:bg-red-400/[0.08]' : 'text-white/60 hover:bg-white/[0.05]'}`,
                        children: [
                            item.icon,
                            item.label
                        ]
                    }, item.label, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ManageDropdown.tsx",
                        lineNumber: 54,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ManageDropdown.tsx",
                lineNumber: 52,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ManageDropdown.tsx",
        lineNumber: 39,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/constants.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "panelSectionClass",
    ()=>panelSectionClass
]);
const panelSectionClass = "px-3.5 py-3 border-b border-white/[0.08]";
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ProductImage.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ProductImage",
    ()=>ProductImage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/image.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$package$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Package$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/package.js [app-ssr] (ecmascript) <export default as Package>");
"use client";
;
;
;
;
function ProductImage({ src, title }) {
    const [failedSrc, setFailedSrc] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    if (!src || failedSrc === src) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "size-7 rounded bg-white/[0.05] border border-white/[0.08] flex items-center justify-center shrink-0",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$package$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Package$3e$__["Package"], {
                className: "size-3.5 text-white/20"
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ProductImage.tsx",
                lineNumber: 17,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ProductImage.tsx",
            lineNumber: 16,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
        src: src,
        alt: title,
        width: 28,
        height: 28,
        unoptimized: true,
        onError: ()=>setFailedSrc(src),
        className: "size-7 rounded object-cover border border-white/[0.08] shrink-0"
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ProductImage.tsx",
        lineNumber: 22,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "OrderList",
    ()=>OrderList
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$external$2d$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ExternalLink$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/external-link.js [app-ssr] (ecmascript) <export default as ExternalLink>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/constants.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$formatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/formatters.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$ProductImage$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ProductImage.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$SectionHeader$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/SectionHeader.tsx [app-ssr] (ecmascript)");
;
;
;
;
;
;
function OrderList({ orders, shop, olderOrderCount = Math.max(orders.length - 1, 0) }) {
    if (orders.length === 0) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
            className: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelSectionClass"],
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$SectionHeader$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SectionHeader"], {
                    title: "ORDER"
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                    lineNumber: 18,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-xs text-white/40",
                    children: "No orders found."
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                    lineNumber: 19,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
            lineNumber: 17,
            columnNumber: 7
        }, this);
    }
    const order = orders[0];
    const fulfillment = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$formatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["fulfillmentLabel"])(order.fulfillment_status);
    const orderDate = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$formatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatShortDate"])(order.created_at);
    const adminUrl = shop ? `https://${shop}/admin/orders/${order.id}` : null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelSectionClass"],
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between gap-2 mb-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs font-semibold uppercase tracking-[0.12em] text-white/40 truncate",
                        children: [
                            "ORDER ",
                            order.name
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                        lineNumber: 31,
                        columnNumber: 9
                    }, this),
                    adminUrl && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                        href: adminUrl,
                        target: "_blank",
                        rel: "noopener noreferrer",
                        className: "flex size-6 items-center justify-center rounded text-white/30 hover:bg-white/[0.05] hover:text-white/70 transition-colors shrink-0",
                        "aria-label": `View order ${order.name} in Shopify`,
                        title: "View order in Shopify",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$external$2d$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ExternalLink$3e$__["ExternalLink"], {
                            className: "size-3.5"
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                            lineNumber: 43,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                        lineNumber: 35,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                lineNumber: 30,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "rounded-md border border-white/[0.10] bg-white/[0.025] p-2.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-2",
                        children: [
                            order.line_items.map((item, index)=>{
                                const skuParts = [
                                    item.sku ? `SKU ${item.sku}` : null,
                                    item.variant_title,
                                    item.quantity > 1 ? `Qty ${item.quantity}` : null
                                ].filter(Boolean);
                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex items-center gap-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$ProductImage$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ProductImage"], {
                                            src: item.image,
                                            title: item.title
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                                            lineNumber: 59,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "min-w-0 flex-1",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "text-xs leading-4 font-medium text-white/80 truncate",
                                                    children: item.title
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                                                    lineNumber: 61,
                                                    columnNumber: 19
                                                }, this),
                                                skuParts.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "mt-0.5 font-mono text-xs leading-3 text-white/40 truncate",
                                                    children: skuParts.join(' / ')
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                                                    lineNumber: 65,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                                            lineNumber: 60,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, `${item.title}-${item.variant_title ?? 'default'}-${index}`, true, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                                    lineNumber: 58,
                                    columnNumber: 15
                                }, this);
                            }),
                            order.line_items.length === 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center gap-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$ProductImage$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ProductImage"], {
                                        src: null,
                                        title: "Order item"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                                        lineNumber: 75,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "min-w-0 flex-1",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "text-xs leading-4 font-medium text-white/80 truncate",
                                            children: "Order item"
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                                            lineNumber: 77,
                                            columnNumber: 17
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                                        lineNumber: 76,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                                lineNumber: 74,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex flex-row justify-between w-full",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-xs leading-4 font-semibold text-white/80",
                                        children: "Order Total: "
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                                        lineNumber: 82,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-xs leading-4 font-semibold text-white/80 tabular-nums shrink-0",
                                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$formatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatMoney"])(order.total_price, order.currency)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                                        lineNumber: 83,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                                lineNumber: 81,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                        lineNumber: 49,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "my-2.5 border-t border-dashed border-white/[0.08]"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                        lineNumber: 89,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center justify-between gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-xs leading-4 text-white/50",
                                children: "Status"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                                lineNumber: 92,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: `inline-flex items-center gap-1.5 text-xs leading-4 font-medium ${fulfillment.textClass}`,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: `size-1.5 rounded-full ${fulfillment.dotClass}`
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                                        lineNumber: 94,
                                        columnNumber: 13
                                    }, this),
                                    fulfillment.label,
                                    orderDate ? ` - ${orderDate}` : ''
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                                lineNumber: 93,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                        lineNumber: 91,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                lineNumber: 48,
                columnNumber: 7
            }, this),
            olderOrderCount > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "mt-2 text-xs leading-4 text-white/30",
                children: [
                    olderOrderCount,
                    " older order",
                    olderOrderCount !== 1 ? 's' : '',
                    " available in Shopify."
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
                lineNumber: 101,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx",
        lineNumber: 29,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerCreate.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ShopifyCustomerCreate",
    ()=>ShopifyCustomerCreate
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/refresh-cw.js [app-ssr] (ecmascript) <export default as RefreshCw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2d$plus$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__UserPlus$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/user-plus.js [app-ssr] (ecmascript) <export default as UserPlus>");
"use client";
;
;
function ShopifyCustomerCreate({ draft, error, isCreating, onDraftChange, onBack, onCreate }) {
    const isDisabled = isCreating || !draft.first_name && !draft.last_name && !draft.email;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-2",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-xs text-white/30",
                        children: "New Shopify customer"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerCreate.tsx",
                        lineNumber: 33,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: onBack,
                        className: "text-xs text-white/40 hover:text-white/70 transition-colors",
                        children: "Back"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerCreate.tsx",
                        lineNumber: 34,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerCreate.tsx",
                lineNumber: 32,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-1.5",
                children: [
                    'first_name',
                    'last_name',
                    'email'
                ].map((field)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                        type: field === 'email' ? 'email' : 'text',
                        placeholder: field === 'first_name' ? 'First name' : field === 'last_name' ? 'Last name' : 'Email',
                        "aria-label": field === 'first_name' ? 'First name' : field === 'last_name' ? 'Last name' : 'Email',
                        value: draft[field],
                        onChange: (e)=>onDraftChange({
                                ...draft,
                                [field]: e.target.value
                            }),
                        className: "w-full text-xs text-white/70 rounded-md border border-white/[0.12] bg-white/[0.06] px-2.5 py-1.5 focus:outline-none focus:border-white/[0.25] placeholder:text-white/20"
                    }, field, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerCreate.tsx",
                        lineNumber: 38,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerCreate.tsx",
                lineNumber: 36,
                columnNumber: 7
            }, this),
            error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-xs text-red-400",
                children: error
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerCreate.tsx",
                lineNumber: 49,
                columnNumber: 17
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: onCreate,
                disabled: isDisabled,
                className: "w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-[#96BF48] hover:bg-[#7da33a] disabled:opacity-50 rounded-md py-1.5 transition-colors",
                children: [
                    isCreating ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__["RefreshCw"], {
                        className: "size-3 animate-spin"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerCreate.tsx",
                        lineNumber: 56,
                        columnNumber: 23
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2d$plus$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__UserPlus$3e$__["UserPlus"], {
                        className: "size-3"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerCreate.tsx",
                        lineNumber: 56,
                        columnNumber: 71
                    }, this),
                    "Create & link"
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerCreate.tsx",
                lineNumber: 50,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerCreate.tsx",
        lineNumber: 31,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ShopifyCustomerSearch",
    ()=>ShopifyCustomerSearch
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/refresh-cw.js [app-ssr] (ecmascript) <export default as RefreshCw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/search.js [app-ssr] (ecmascript) <export default as Search>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2d$plus$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__UserPlus$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/user-plus.js [app-ssr] (ecmascript) <export default as UserPlus>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/x.js [app-ssr] (ecmascript) <export default as X>");
"use client";
;
;
function ShopifyCustomerSearch({ query, customers, status, onQueryChange, onClear, onCancel, onCreate, onLink }) {
    const { searching, linkingId, linkError, searchError, createAllowed } = status;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-2",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-xs text-white/30",
                        children: "Search Shopify customers to link."
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
                        lineNumber: 38,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: onCancel,
                        className: "text-xs text-white/40 hover:text-white/70 transition-colors",
                        children: "Cancel"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
                        lineNumber: 39,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
                lineNumber: 37,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "relative",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__["Search"], {
                        className: "absolute left-2 top-1/2 -translate-y-1/2 size-3 text-white/25 pointer-events-none"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
                        lineNumber: 43,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                        "aria-label": "Name or email…",
                        type: "text",
                        placeholder: "Name or email…",
                        value: query,
                        onChange: (e)=>onQueryChange(e.target.value),
                        className: "w-full pl-6 pr-7 py-1.5 text-xs text-white/70 rounded-md border border-white/[0.12] bg-white/[0.06] focus:outline-none focus:border-white/[0.25] placeholder:text-white/20"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
                        lineNumber: 44,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "absolute right-2 top-1/2 -translate-y-1/2",
                        children: searching ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__["RefreshCw"], {
                            className: "size-3 text-white/20 animate-spin"
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
                            lineNumber: 53,
                            columnNumber: 15
                        }, this) : query ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: onClear,
                            className: "text-white/25 hover:text-white/60",
                            "aria-label": "Clear customer search",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                                className: "size-3"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
                                lineNumber: 62,
                                columnNumber: 19
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
                            lineNumber: 56,
                            columnNumber: 17
                        }, this) : null
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
                        lineNumber: 51,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
                lineNumber: 42,
                columnNumber: 7
            }, this),
            linkError && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-xs text-red-400",
                children: linkError
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
                lineNumber: 69,
                columnNumber: 21
            }, this),
            searchError && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-xs text-red-400",
                children: "Unable to search customers."
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
                lineNumber: 70,
                columnNumber: 23
            }, this),
            customers?.length === 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-xs text-white/30",
                children: "No customers found."
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
                lineNumber: 73,
                columnNumber: 9
            }, this),
            customers && customers.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-1",
                children: customers.map((customer)=>{
                    const fullName = [
                        customer.first_name,
                        customer.last_name
                    ].filter(Boolean).join(' ') || '-';
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>onLink(customer),
                        disabled: linkingId !== null,
                        className: "w-full flex items-center justify-between gap-2 rounded-md border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/[0.12] disabled:opacity-60 px-2.5 py-1.5 transition-colors text-left group",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "min-w-0",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-xs font-semibold text-white/70 truncate",
                                        children: fullName
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
                                        lineNumber: 89,
                                        columnNumber: 19
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-xs text-white/30 truncate",
                                        children: customer.email || 'No email'
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
                                        lineNumber: 90,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
                                lineNumber: 88,
                                columnNumber: 17
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "shrink-0 flex size-5 items-center justify-center text-white/40 group-hover:text-[#96BF48] transition-colors",
                                "aria-hidden": "true",
                                children: linkingId === customer.id ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__["RefreshCw"], {
                                    className: "size-3 animate-spin"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
                                    lineNumber: 94,
                                    columnNumber: 23
                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2d$plus$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__UserPlus$3e$__["UserPlus"], {
                                    className: "size-3"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
                                    lineNumber: 95,
                                    columnNumber: 23
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
                                lineNumber: 92,
                                columnNumber: 17
                            }, this)
                        ]
                    }, customer.id, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
                        lineNumber: 81,
                        columnNumber: 15
                    }, this);
                })
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
                lineNumber: 77,
                columnNumber: 9
            }, this),
            createAllowed && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: onCreate,
                className: "w-full flex items-center justify-center gap-1.5 text-xs text-white/30 hover:text-white/60 border border-dashed border-white/[0.12] hover:border-white/[0.25] rounded-md py-2 transition-colors",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2d$plus$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__UserPlus$3e$__["UserPlus"], {
                        className: "size-3"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
                        lineNumber: 110,
                        columnNumber: 11
                    }, this),
                    " Create new customer"
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
                lineNumber: 105,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx",
        lineNumber: 36,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSkeleton.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ShopifyCustomerSkeleton",
    ()=>ShopifyCustomerSkeleton
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
;
function ShopifyCustomerSkeleton() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-2 animate-pulse",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "rounded-md border border-white/[0.07] bg-white/[0.03] p-2.5 space-y-1.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "h-2 w-16 bg-white/[0.08] rounded"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSkeleton.tsx",
                        lineNumber: 5,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "h-2.5 w-28 bg-white/[0.08] rounded"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSkeleton.tsx",
                        lineNumber: 6,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "h-2 w-32 bg-white/[0.05] rounded"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSkeleton.tsx",
                        lineNumber: 7,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "h-2 w-20 bg-white/[0.05] rounded"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSkeleton.tsx",
                        lineNumber: 8,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSkeleton.tsx",
                lineNumber: 4,
                columnNumber: 7
            }, this),
            [
                "shopify-customer-skeleton-1",
                "shopify-customer-skeleton-2"
            ].map((key)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "rounded-md border border-white/[0.07] bg-white/[0.03] p-2.5 space-y-1",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "h-2.5 w-20 bg-white/[0.08] rounded"
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSkeleton.tsx",
                            lineNumber: 12,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "h-2 w-32 bg-white/[0.05] rounded"
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSkeleton.tsx",
                            lineNumber: 13,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "h-2 w-16 bg-white/[0.05] rounded"
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSkeleton.tsx",
                            lineNumber: 14,
                            columnNumber: 11
                        }, this)
                    ]
                }, key, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSkeleton.tsx",
                    lineNumber: 11,
                    columnNumber: 9
                }, this))
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSkeleton.tsx",
        lineNumber: 3,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifySection.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ShopifySection",
    ()=>ShopifySection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/swr/dist/index/index.mjs [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Link$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/link.js [app-ssr] (ecmascript) <export default as Link>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$pencil$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Pencil$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/pencil.js [app-ssr] (ecmascript) <export default as Pencil>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$unlink$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Unlink$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/unlink.js [app-ssr] (ecmascript) <export default as Unlink>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/fetcher.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$CustomerInfo$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/CustomerInfo.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$ManageDropdown$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ManageDropdown.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$OrderList$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/OrderList.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$SectionHeader$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/SectionHeader.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$ShopifyCustomerCreate$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerCreate.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$ShopifyCustomerSearch$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSearch.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$ShopifyCustomerSkeleton$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifyCustomerSkeleton.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/constants.ts [app-ssr] (ecmascript)");
"use client";
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
;
;
;
const initialShopifyState = {
    mode: 'view',
    isEditingCustomer: false,
    query: '',
    debouncedQuery: '',
    isLinking: null,
    linkError: null,
    createDraft: {
        first_name: '',
        last_name: '',
        email: ''
    },
    isCreating: false,
    createError: null
};
function shopifySectionReducer(state, action) {
    switch(action.type){
        case "mode":
            return {
                ...state,
                mode: action.mode
            };
        case "editing":
            return {
                ...state,
                isEditingCustomer: action.editing
            };
        case "query":
            return {
                ...state,
                query: action.query
            };
        case "debouncedQuery":
            return {
                ...state,
                debouncedQuery: action.query
            };
        case "clearSearch":
            return {
                ...state,
                query: '',
                debouncedQuery: ''
            };
        case "exitSearch":
            return {
                ...state,
                query: '',
                debouncedQuery: '',
                linkError: null,
                mode: 'view'
            };
        case "linking":
            return {
                ...state,
                isLinking: action.id
            };
        case "linkError":
            return {
                ...state,
                linkError: action.error
            };
        case "createDraft":
            return {
                ...state,
                createDraft: action.draft
            };
        case "creating":
            return {
                ...state,
                isCreating: action.creating,
                createError: action.creating ? null : state.createError
            };
        case "createError":
            return {
                ...state,
                createError: action.error
            };
        case "createSuccess":
            return {
                ...state,
                createDraft: {
                    first_name: '',
                    last_name: '',
                    email: ''
                },
                mode: 'view'
            };
    }
}
function ShopifySection({ thread, shopify, onLinkShopifyCustomer }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(ShopifySectionContent, {
        thread: thread,
        shopify: shopify,
        onLinkShopifyCustomer: onLinkShopifyCustomer
    }, thread.id, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifySection.tsx",
        lineNumber: 96,
        columnNumber: 10
    }, this);
}
function ShopifySectionContent({ thread, shopify, onLinkShopifyCustomer }) {
    const isEmailThread = thread.channelType === 'email';
    const isLinked = !!thread.shopifyCustomerId;
    const canLoadCustomer = isEmailThread || isLinked;
    const canCreate = !isEmailThread;
    const [state, dispatch] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useReducer"])(shopifySectionReducer, initialShopifyState);
    const { mode, isEditingCustomer, query, debouncedQuery, isLinking, linkError, createDraft, isCreating, createError } = state;
    const { data, error: customerError, isLoading, mutate } = shopify;
    const handleCustomerSaved = (updated)=>{
        if (!data?.customer) return;
        void mutate({
            ...data,
            customer: {
                ...data.customer,
                ...updated
            }
        }, false);
    };
    const timerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(()=>dispatch({
                type: "debouncedQuery",
                query
            }), 150);
        return ()=>{
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [
        query
    ]);
    const { data: searchData, error: searchError, isLoading: isSearching } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"])(mode === 'search' && debouncedQuery.length >= 2 ? `/api/shopify/customers/search?q=${encodeURIComponent(debouncedQuery)}` : null, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["fetcher"], {
        keepPreviousData: true
    });
    const clearSearch = ()=>{
        dispatch({
            type: "clearSearch"
        });
    };
    const handleLink = async (customer)=>{
        dispatch({
            type: "linking",
            id: customer.id
        });
        dispatch({
            type: "linkError",
            error: null
        });
        try {
            await onLinkShopifyCustomer(customer.id.toString());
            clearSearch();
            dispatch({
                type: "mode",
                mode: 'view'
            });
        } catch (error) {
            console.error('Failed to link Shopify customer', error);
            dispatch({
                type: "linkError",
                error: 'Failed to link customer.'
            });
        } finally{
            dispatch({
                type: "linking",
                id: null
            });
        }
    };
    const handleUnlink = async ()=>{
        dispatch({
            type: "linkError",
            error: null
        });
        try {
            await onLinkShopifyCustomer(null);
            void mutate(undefined, false);
        } catch (error) {
            console.error('Failed to unlink Shopify customer', error);
            dispatch({
                type: "linkError",
                error: 'Failed to unlink customer.'
            });
        }
    };
    const exitSearch = ()=>{
        dispatch({
            type: "exitSearch"
        });
    };
    const handleCreate = async ()=>{
        dispatch({
            type: "creating",
            creating: true
        });
        try {
            const res = await fetch('/api/shopify/customers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(createDraft)
            });
            const json = await res.json().catch(()=>({}));
            if (!res.ok || !json.customer) {
                dispatch({
                    type: "createError",
                    error: typeof json.error === 'string' ? json.error : 'Failed to create customer.'
                });
                return;
            }
            try {
                await onLinkShopifyCustomer(json.customer.id.toString());
            } catch (error) {
                console.error('Failed to link created Shopify customer', error);
                dispatch({
                    type: "createError",
                    error: 'Customer created, but linking failed.'
                });
                return;
            }
            dispatch({
                type: "createSuccess"
            });
        } catch (error) {
            console.error('Failed to create Shopify customer', error);
            dispatch({
                type: "createError",
                error: 'Failed to create customer.'
            });
        } finally{
            dispatch({
                type: "creating",
                creating: false
            });
        }
    };
    const dropdownItems = [];
    if (isLinked || isEmailThread && data?.customer) {
        dropdownItems.push({
            label: 'Change customer',
            icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Link$3e$__["Link"], {
                className: "size-3"
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifySection.tsx",
                lineNumber: 205,
                columnNumber: 58
            }, this),
            onClick: ()=>dispatch({
                    type: "mode",
                    mode: 'search'
                })
        });
    } else if (isEmailThread && !isLoading && !data?.customer) {
        dropdownItems.push({
            label: 'Link existing customer',
            icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Link$3e$__["Link"], {
                className: "size-3"
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifySection.tsx",
                lineNumber: 207,
                columnNumber: 65
            }, this),
            onClick: ()=>dispatch({
                    type: "mode",
                    mode: 'search'
                })
        });
    }
    if (isLinked) {
        dropdownItems.push({
            label: 'Unlink customer',
            icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$unlink$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Unlink$3e$__["Unlink"], {
                className: "size-3"
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifySection.tsx",
                lineNumber: 210,
                columnNumber: 58
            }, this),
            onClick: handleUnlink,
            danger: true
        });
    }
    const header = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$SectionHeader$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SectionHeader"], {
        title: "CUSTOMER",
        action: data?.customer ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex items-center ",
            children: [
                !isEditingCustomer && mode === 'view' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    type: "button",
                    onClick: ()=>dispatch({
                            type: "editing",
                            editing: true
                        }),
                    className: "flex size-6 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white/70",
                    "aria-label": "Edit customer",
                    title: "Edit customer",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$pencil$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Pencil$3e$__["Pencil"], {
                        className: "size-3"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifySection.tsx",
                        lineNumber: 227,
                        columnNumber: 17
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifySection.tsx",
                    lineNumber: 220,
                    columnNumber: 15
                }, this),
                dropdownItems.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$ManageDropdown$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ManageDropdown"], {
                    items: dropdownItems
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifySection.tsx",
                    lineNumber: 230,
                    columnNumber: 42
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifySection.tsx",
            lineNumber: 218,
            columnNumber: 11
        }, this) : dropdownItems.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$ManageDropdown$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ManageDropdown"], {
            items: dropdownItems
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifySection.tsx",
            lineNumber: 233,
            columnNumber: 11
        }, this) : undefined
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifySection.tsx",
        lineNumber: 214,
        columnNumber: 5
    }, this);
    let body;
    let orderList = null;
    if (canLoadCustomer && isLoading) {
        body = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$ShopifyCustomerSkeleton$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ShopifyCustomerSkeleton"], {}, void 0, false, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifySection.tsx",
            lineNumber: 243,
            columnNumber: 12
        }, this);
    } else if (canLoadCustomer && customerError) {
        body = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
            className: "text-xs text-red-400",
            children: "Unable to load Shopify customer."
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifySection.tsx",
            lineNumber: 245,
            columnNumber: 12
        }, this);
    } else if (mode === 'search') {
        body = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$ShopifyCustomerSearch$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ShopifyCustomerSearch"], {
            query: query,
            customers: searchData?.customers,
            status: {
                searching: isSearching,
                linkingId: isLinking,
                linkError,
                searchError: !!searchError,
                createAllowed: !isEmailThread
            },
            onQueryChange: (nextQuery)=>dispatch({
                    type: "query",
                    query: nextQuery
                }),
            onClear: clearSearch,
            onCancel: exitSearch,
            onCreate: ()=>dispatch({
                    type: "mode",
                    mode: 'create'
                }),
            onLink: (customer)=>{
                void handleLink(customer);
            }
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifySection.tsx",
            lineNumber: 248,
            columnNumber: 7
        }, this);
    } else if (mode === 'create') {
        body = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$ShopifyCustomerCreate$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ShopifyCustomerCreate"], {
            draft: createDraft,
            error: createError,
            isCreating: isCreating,
            onDraftChange: (draft)=>dispatch({
                    type: "createDraft",
                    draft
                }),
            onBack: ()=>dispatch({
                    type: "mode",
                    mode: 'search'
                }),
            onCreate: ()=>{
                void handleCreate();
            }
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifySection.tsx",
            lineNumber: 267,
            columnNumber: 7
        }, this);
    } else if (isEmailThread && !isLoading && !data?.customer) {
        body = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
            className: "text-xs text-white/40",
            children: "No Shopify account found for this email."
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifySection.tsx",
            lineNumber: 277,
            columnNumber: 12
        }, this);
    } else if (canLoadCustomer && data?.customer) {
        body = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$CustomerInfo$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CustomerInfo"], {
                    customer: data.customer,
                    isEditing: isEditingCustomer,
                    onEditingChange: (editing)=>dispatch({
                            type: "editing",
                            editing
                        }),
                    onSaved: handleCustomerSaved
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifySection.tsx",
                    lineNumber: 281,
                    columnNumber: 9
                }, this),
                linkError && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "mt-2 text-xs text-red-400",
                    children: linkError
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifySection.tsx",
                    lineNumber: 287,
                    columnNumber: 23
                }, this)
            ]
        }, void 0, true);
        orderList = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$OrderList$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["OrderList"], {
            orders: data.orders,
            shop: data.shop,
            olderOrderCount: Math.max(data.customer.orders_count - data.orders.length, 0)
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifySection.tsx",
            lineNumber: 291,
            columnNumber: 7
        }, this);
    } else {
        body = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$ShopifyCustomerSearch$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ShopifyCustomerSearch"], {
            query: query,
            customers: searchData?.customers,
            status: {
                searching: isSearching,
                linkingId: isLinking,
                linkError,
                searchError: !!searchError,
                createAllowed: canCreate
            },
            onQueryChange: (nextQuery)=>dispatch({
                    type: "query",
                    query: nextQuery
                }),
            onClear: clearSearch,
            onCancel: exitSearch,
            onCreate: ()=>dispatch({
                    type: "mode",
                    mode: 'create'
                }),
            onLink: (customer)=>{
                void handleLink(customer);
            }
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifySection.tsx",
            lineNumber: 299,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelSectionClass"],
                children: [
                    header,
                    body
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifySection.tsx",
                lineNumber: 320,
                columnNumber: 7
            }, this),
            orderList
        ]
    }, void 0, true);
}
}),
"[project]/apps/dashboard/src/lib/format/shopify.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "locationString",
    ()=>locationString,
    "shopifyName",
    ()=>shopifyName
]);
function locationString(addr) {
    if (!addr) return null;
    return [
        addr.city,
        addr.province
    ].filter(Boolean).join(", ") || [
        addr.city,
        addr.country_name
    ].filter(Boolean).join(", ") || null;
}
function shopifyName(customer) {
    if (!customer) return null;
    return [
        customer.first_name,
        customer.last_name
    ].filter(Boolean).join(" ") || null;
}
}),
"[project]/apps/dashboard/src/lib/shopify/customer-key.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "buildShopifyCustomerKey",
    ()=>buildShopifyCustomerKey
]);
function buildShopifyCustomerKey({ channelType, customerPlatformId, shopifyCustomerId, orderLimit }) {
    const params = new URLSearchParams();
    if (shopifyCustomerId) {
        params.set('customerId', shopifyCustomerId);
    } else if (channelType === 'email' && customerPlatformId) {
        params.set('email', customerPlatformId);
    } else {
        return null;
    }
    if (orderLimit !== undefined) {
        params.set('orderLimit', String(orderLimit));
    }
    return `/api/shopify/customer?${params.toString()}`;
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/useShopifyCustomer.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useShopifyCustomer",
    ()=>useShopifyCustomer
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/swr/dist/index/index.mjs [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/fetcher.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$shopify$2f$customer$2d$key$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/shopify/customer-key.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
function useShopifyCustomer(thread, enabled) {
    const swrKey = enabled ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$shopify$2f$customer$2d$key$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["buildShopifyCustomerKey"])({
        channelType: thread.channelType,
        customerPlatformId: thread.customer?.platformId,
        shopifyCustomerId: thread.shopifyCustomerId,
        orderLimit: 1
    }) : null;
    const swr = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"])(swrKey, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["fetcher"], {
        revalidateOnFocus: false
    });
    return {
        ...swr,
        swrKey,
        customer: swr.data?.customer ?? null,
        orders: swr.data?.orders ?? [],
        shop: swr.data?.shop
    };
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ContextPanel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/image.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$mail$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Mail$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/mail.js [app-ssr] (ecmascript) <export default as Mail>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$shopping$2d$bag$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ShoppingBagIcon$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/shopping-bag.js [app-ssr] (ecmascript) <export default as ShoppingBagIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/swr/dist/index/index.mjs [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$channels$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/messaging/channels.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$customer$2d$name$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/messaging/customer-name.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/fetcher.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$SectionHeader$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/SectionHeader.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$ShopifySection$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ShopifySection.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$formatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/formatters.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$format$2f$shopify$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/format/shopify.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$useShopifyCustomer$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/useShopifyCustomer.ts [app-ssr] (ecmascript)");
"use client";
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
;
;
;
function ContextPanel({ thread, hasShopify, onLinkShopifyCustomer }) {
    const channel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$channels$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getChannelInfo"])(thread.channelType);
    const fallbackName = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$messaging$2f$customer$2d$name$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getCustomerName"])(thread.customer);
    const platformHandle = thread.customer?.platformId || '';
    const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$useShopifyCustomer$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useShopifyCustomer"])(thread, hasShopify);
    const shopifyCustomer = shopify.customer;
    const displayName = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$format$2f$shopify$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["shopifyName"])(shopifyCustomer) ?? fallbackName;
    const initials = displayName.split(' ').map((n)=>n[0]).join('').toUpperCase().slice(0, 2) || '?';
    const emailAddress = shopifyCustomer?.email || (platformHandle.includes('@') ? platformHandle : null);
    const secondaryHandle = emailAddress || (platformHandle ? platformHandle.startsWith('@') ? platformHandle : `@${platformHandle}` : null);
    const location = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$format$2f$shopify$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["locationString"])(shopifyCustomer?.default_address);
    const shopifyAdminCustomerUrl = shopify.shop && shopifyCustomer ? `https://${shopify.shop}/admin/customers/${shopifyCustomer.id}` : null;
    const { data: pastThreadsData } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"])(thread.customer?.id ? `/api/threads/customer/${thread.customer.id}?limit=4` : null, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["fetcher"]);
    const recentThreads = (pastThreadsData?.threads ?? []).filter((t)=>t.id !== thread.id).slice(0, 3);
    const basePill = "inline-flex h-6 items-center gap-2 rounded border border-white/[0.10] bg-white/[0.035] px-2 text-xs font-medium text-white/80";
    const actionPill = `${basePill} transition-colors hover:border-white/[0.18] hover:bg-white/[0.07]`;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
        className: "w-full xl:w-[300px] shrink-0 xl:border-l xl:border-white/[0.12] flex flex-col xl:overflow-y-auto bg-[#030303]",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                className: "px-3.5 pt-3 pb-3 border-b border-white/[0.08]",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-row items-center gap-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "size-8 rounded-full overflow-hidden bg-[#ff7a1a] flex items-center justify-center text-white text-xs font-semibold shrink-0",
                                children: thread.customer?.profilePicUrl ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                    src: thread.customer.profilePicUrl,
                                    alt: displayName,
                                    width: 40,
                                    height: 40,
                                    className: "size-full object-cover"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                                    lineNumber: 59,
                                    columnNumber: 15
                                }, this) : initials
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                                lineNumber: 57,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mt-1 min-w-0",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-sm leading-5 font-semibold text-white/90 truncate",
                                        children: displayName
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                                        lineNumber: 64,
                                        columnNumber: 13
                                    }, this),
                                    secondaryHandle && secondaryHandle !== displayName && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "mt-0.5 text-xs leading-4 text-white/50 truncate",
                                        children: secondaryHandle
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                                        lineNumber: 66,
                                        columnNumber: 15
                                    }, this),
                                    location && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "mt-0.5 flex items-center gap-1 text-xs italic leading-4 text-white/40 truncate",
                                        children: location
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                                        lineNumber: 69,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                                lineNumber: 63,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                        lineNumber: 56,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-2.5 flex flex-wrap items-center gap-2",
                        children: [
                            emailAddress ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                href: `mailto:${emailAddress}`,
                                className: actionPill,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$mail$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Mail$3e$__["Mail"], {
                                        className: "size-3"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                                        lineNumber: 79,
                                        columnNumber: 15
                                    }, this),
                                    "Email"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                                lineNumber: 78,
                                columnNumber: 13
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: basePill,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                        src: channel.logo,
                                        alt: channel.name,
                                        width: 16,
                                        height: 16,
                                        className: "object-contain opacity-75"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                                        lineNumber: 84,
                                        columnNumber: 15
                                    }, this),
                                    channel.name
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                                lineNumber: 83,
                                columnNumber: 13
                            }, this),
                            hasShopify && (shopifyAdminCustomerUrl ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                href: shopifyAdminCustomerUrl,
                                target: "_blank",
                                rel: "noopener noreferrer",
                                className: actionPill,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$shopping$2d$bag$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ShoppingBagIcon$3e$__["ShoppingBagIcon"], {
                                        className: "size-3"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                                        lineNumber: 92,
                                        columnNumber: 17
                                    }, this),
                                    "Shopify"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                                lineNumber: 91,
                                columnNumber: 15
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: basePill,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$shopping$2d$bag$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ShoppingBagIcon$3e$__["ShoppingBagIcon"], {
                                        className: "size-3"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                                        lineNumber: 97,
                                        columnNumber: 17
                                    }, this),
                                    "Shopify"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                                lineNumber: 96,
                                columnNumber: 15
                            }, this))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                        lineNumber: 76,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                lineNumber: 55,
                columnNumber: 7
            }, this),
            hasShopify && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$ShopifySection$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ShopifySection"], {
                thread: thread,
                shopify: shopify,
                onLinkShopifyCustomer: onLinkShopifyCustomer
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                lineNumber: 106,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                className: "px-3.5 py-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$SectionHeader$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SectionHeader"], {
                        title: "RECENT TICKETS"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                        lineNumber: 114,
                        columnNumber: 9
                    }, this),
                    recentThreads.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "divide-y divide-dashed divide-white/[0.08]",
                        children: recentThreads.map((t)=>{
                            const preview = t.messages[0]?.contentText;
                            const title = t.tag || t.aiSummary || preview || 'No content';
                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                href: `?thread=${t.id}`,
                                className: "flex items-start justify-between gap-2 py-1.5 first:pt-0 last:pb-0 group",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "min-w-0",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "block truncate text-xs leading-4 text-white/80 group-hover:text-white transition-colors",
                                                children: title
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                                                lineNumber: 127,
                                                columnNumber: 21
                                            }, this),
                                            preview && preview !== title && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "mt-0.5 block truncate text-xs leading-3 text-white/40",
                                                children: preview
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                                                lineNumber: 131,
                                                columnNumber: 23
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                                        lineNumber: 126,
                                        columnNumber: 19
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-xs leading-4 text-white/50 shrink-0",
                                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$formatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatShortDate"])(t.updatedAt)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                                        lineNumber: 136,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, t.id, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                                lineNumber: 121,
                                columnNumber: 17
                            }, this);
                        })
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                        lineNumber: 116,
                        columnNumber: 11
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-xs text-white/40",
                        children: "No recent tickets."
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                        lineNumber: 144,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
                lineNumber: 113,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx",
        lineNumber: 54,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ContextPanelSkeleton
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
;
function ContextPanelSkeleton({ hasShopify }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
        className: "w-full xl:w-[300px] shrink-0 xl:border-l xl:border-white/[0.12] flex flex-col xl:overflow-y-auto bg-[#030303] animate-pulse",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                className: "px-3.5 pt-3 pb-3 border-b border-white/[0.08]",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-row items-center gap-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "size-8 rounded-full bg-white/[0.06] shrink-0"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                                lineNumber: 10,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mt-1 min-w-0 flex-1 space-y-1.5",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "h-3 w-32 bg-white/[0.08] rounded"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                                        lineNumber: 12,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "h-2.5 w-24 bg-white/[0.05] rounded"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                                        lineNumber: 13,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                                lineNumber: 11,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                        lineNumber: 9,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-2.5 flex flex-wrap items-center gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "h-6 w-16 rounded border border-white/[0.08] bg-white/[0.03]"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                                lineNumber: 17,
                                columnNumber: 11
                            }, this),
                            hasShopify && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "h-6 w-20 rounded border border-white/[0.08] bg-white/[0.03]"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                                lineNumber: 19,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                        lineNumber: 16,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                lineNumber: 8,
                columnNumber: 7
            }, this),
            hasShopify && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: "px-3.5 py-3 border-b border-white/[0.08] space-y-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "h-2.5 w-20 bg-white/[0.08] rounded mb-2"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                                lineNumber: 27,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "rounded-md border border-white/[0.07] bg-white/[0.03] p-2.5 space-y-1.5",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "h-2 w-16 bg-white/[0.08] rounded"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                                        lineNumber: 29,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "h-2.5 w-28 bg-white/[0.08] rounded"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                                        lineNumber: 30,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "h-2 w-32 bg-white/[0.05] rounded"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                                        lineNumber: 31,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "h-2 w-20 bg-white/[0.05] rounded"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                                        lineNumber: 32,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                                lineNumber: 28,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                        lineNumber: 26,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: "px-3.5 py-3 border-b border-white/[0.08] space-y-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "h-2.5 w-16 bg-white/[0.08] rounded mb-2"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                                lineNumber: 37,
                                columnNumber: 13
                            }, this),
                            [
                                "customer-skeleton-1",
                                "customer-skeleton-2"
                            ].map((key)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex items-center gap-2.5 py-1",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "size-10 rounded bg-white/[0.05] shrink-0"
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                                            lineNumber: 40,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex-1 min-w-0 space-y-1.5",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "h-2.5 w-24 bg-white/[0.06] rounded"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                                                    lineNumber: 42,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "h-2 w-16 bg-white/[0.05] rounded"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                                                    lineNumber: 43,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                                            lineNumber: 41,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, key, true, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                                    lineNumber: 39,
                                    columnNumber: 15
                                }, this))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                        lineNumber: 36,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                className: "px-3.5 py-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "h-2.5 w-24 bg-white/[0.08] rounded mb-2"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                        lineNumber: 52,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-2",
                        children: [
                            "memory-skeleton-1",
                            "memory-skeleton-2",
                            "memory-skeleton-3"
                        ].map((key)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-start justify-between gap-2 py-1.5",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "min-w-0 flex-1 space-y-1",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "h-2.5 w-full max-w-[180px] bg-white/[0.06] rounded"
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                                                lineNumber: 57,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "h-2 w-24 bg-white/[0.04] rounded"
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                                                lineNumber: 58,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                                        lineNumber: 56,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "h-2 w-8 bg-white/[0.04] rounded shrink-0"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                                        lineNumber: 60,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, key, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                                lineNumber: 55,
                                columnNumber: 13
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                        lineNumber: 53,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
                lineNumber: 51,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx",
        lineNumber: 7,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>TicketsPageClient
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertCircle$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/circle-alert.js [app-ssr] (ecmascript) <export default as AlertCircle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/circle-check.js [app-ssr] (ecmascript) <export default as CheckCircle2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$inbox$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Inbox$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/inbox.js [app-ssr] (ecmascript) <export default as Inbox>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/x.js [app-ssr] (ecmascript) <export default as X>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/swr/dist/index/index.mjs [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sheet$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/sheet.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useMediaQuery$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/hooks/useMediaQuery.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$useActiveThreadSelection$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_hooks/useActiveThreadSelection.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$useAgentTurns$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_hooks/useAgentTurns.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$usePaginatedThreads$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_hooks/usePaginatedThreads.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$useTicketTabCounts$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_hooks/useTicketTabCounts.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$OpenThreadCountContext$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/hooks/OpenThreadCountContext.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$useSummaryRefresh$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_hooks/useSummaryRefresh.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$useTicketActions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_hooks/useTicketActions.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$useTicketSelection$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_hooks/useTicketSelection.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$useThreadCacheCoordinator$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_hooks/useThreadCacheCoordinator.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_lib$2f$thread$2d$to$2d$ticket$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_lib/thread-to-ticket.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/fetcher.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$thread$2d$list$2f$ThreadList$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/thread-list/ThreadList.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$ConversationView$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/conversation/ConversationView.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$ContextPanel$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanel.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$ContextPanelSkeleton$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/tickets/_components/context-panel/ContextPanelSkeleton.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$plan$2d$cache$2d$shape$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/plan-cache-shape.js [app-ssr] (ecmascript)");
"use client";
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
;
;
;
const EMPTY_SEARCH_THREADS = [];
function TicketsPageClient(props) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Suspense"], {
        fallback: null,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(TicketsPageContent, {
            ...props
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
            lineNumber: 38,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
        lineNumber: 37,
        columnNumber: 5
    }, this);
}
function TicketsPageContent({ initialOpenThreads, hasShopify, agentName }) {
    const searchParams = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSearchParams"])();
    const queryThreadId = searchParams.get('thread');
    const correctReply = searchParams.get('correct') === '1';
    const [dismissCorrectHint, setDismissCorrectHint] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [activeFilter, setActiveFilter] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [activeTab, setActiveTab] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('open');
    const [needsReply, setNeedsReply] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [searchQuery, setSearchQuery] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('');
    const [showContextDrawer, setShowContextDrawer] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const isDesktopContext = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useMediaQuery$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMediaQuery"])('(min-width: 1280px)');
    const messagesEndRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const openTabEnabled = activeTab === 'open';
    const closedTabEnabled = activeTab === 'closed';
    const filteredTabEnabled = activeTab === 'filtered';
    const { threads: openThreads, totalCount: openListTotalCount, isLoading: openLoading, error, mutate: mutateOpen, removeThreadById: removeFromOpen, prependThread: prependToOpen, loadMore: loadMoreOpen, hasMore: hasMoreOpen, isLoadingMore: isLoadingMoreOpen } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$usePaginatedThreads$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePaginatedThreads"])('open', initialOpenThreads, true, undefined, needsReply, openTabEnabled);
    const { threads: closedThreads, isLoading: closedLoading, mutate: mutateClosed, removeThreadById: removeFromClosed, prependThread: prependToClosed, loadMore: loadMoreClosed, hasMore: hasMoreClosed, isLoadingMore: isLoadingMoreClosed } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$usePaginatedThreads$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePaginatedThreads"])('closed', undefined, true, undefined, false, closedTabEnabled);
    const { threads: filteredThreads, isLoading: filteredLoading, mutate: mutateFiltered, removeThreadById: removeFromFiltered, prependThread: prependToFiltered, loadMore: loadMoreFiltered, hasMore: hasMoreFiltered, isLoadingMore: isLoadingMoreFiltered } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$usePaginatedThreads$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePaginatedThreads"])('open', undefined, true, 'filtered', false, filteredTabEnabled);
    const openCountFromList = openTabEnabled && openListTotalCount !== undefined ? openListTotalCount : null;
    const { openCount, closedCount, spamCount, mutateTabCounts } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$useTicketTabCounts$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTicketTabCounts"])({
        needsReply,
        openCountFromList
    });
    const { setOverride: setSidebarOpenCount } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$OpenThreadCountContext$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useOpenThreadCountOverride"])();
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        setSidebarOpenCount(openCount);
        return ()=>setSidebarOpenCount(null);
    }, [
        openCount,
        setSidebarOpenCount
    ]);
    const isSearchMode = searchQuery.length >= 2;
    const { data: searchData, isLoading: isSearchLoading, mutate: mutateSearch } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"])(isSearchMode ? `/api/search?q=${encodeURIComponent(searchQuery)}` : null, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["fetcher"], {
        keepPreviousData: true
    });
    const searchThreads = searchData?.threads ?? EMPTY_SEARCH_THREADS;
    const { activeTicketId, setActiveTicketId, activeThread, activeThreadData, activeThreadError, activeThreadPreview, activeTicket, conversationTicket, effectiveActiveTab, isConversationLoading, mutateActiveThread } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$useActiveThreadSelection$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useActiveThreadSelection"])({
        queryThreadId,
        activeTab,
        openThreads,
        closedThreads,
        filteredThreads,
        searchThreads,
        agentName
    });
    const dbThreads = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (isSearchMode) return [];
        if (effectiveActiveTab === 'open') return openThreads;
        if (effectiveActiveTab === 'closed') return closedThreads;
        return filteredThreads;
    }, [
        closedThreads,
        effectiveActiveTab,
        filteredThreads,
        isSearchMode,
        openThreads
    ]);
    const isLoading = effectiveActiveTab === 'open' ? openLoading : effectiveActiveTab === 'closed' ? closedLoading : filteredLoading;
    const listThreads = isSearchMode ? searchThreads : dbThreads;
    const liveTickets = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>listThreads.map((t)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_lib$2f$thread$2d$to$2d$ticket$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["threadToTicket"])(t, agentName)), [
        listThreads,
        agentName
    ]);
    const filteredTickets = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>isSearchMode ? liveTickets : liveTickets.filter((t)=>!activeFilter || t.channelType === activeFilter), [
        activeFilter,
        isSearchMode,
        liveTickets
    ]);
    const lastCustomerMessageId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>activeThread?.messages.filter((m)=>m.senderType === 'customer').at(-1)?.id ?? null, [
        activeThread?.messages
    ]);
    const cachedPlanMessageId = activeThread?.cachedPlanMessageId ?? null;
    // Key memo on cachedPlanMessageId (content fingerprint) rather than the cachedPlan
    // ref, which churns on every SWR poll and would re-fire downstream effects.
    const cachedPlan = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>activeThread ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$plan$2d$cache$2d$shape$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getCurrentPlanForThread"])(activeThread, lastCustomerMessageId) : null, [
        activeThread,
        lastCustomerMessageId
    ]);
    const { patchThreadCaches, moveThreadStatus, moveThreadFilterStatus, revalidateThreadCaches } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$useThreadCacheCoordinator$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useThreadCacheCoordinator"])({
        openThreads,
        closedThreads,
        filteredThreads,
        activeThread: activeThreadData?.thread,
        mutateOpen,
        mutateClosed,
        mutateFiltered,
        removeFromOpen,
        removeFromClosed,
        removeFromFiltered,
        prependToOpen,
        prependToClosed,
        prependToFiltered,
        mutateSearch,
        mutateActiveThread
    });
    const revalidateTicketData = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        await Promise.all([
            revalidateThreadCaches(),
            mutateTabCounts()
        ]);
    }, [
        mutateTabCounts,
        revalidateThreadCaches
    ]);
    const { selectedIds, setSelectedIds, handleToggleSelect, handleClearSelection } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$useTicketSelection$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTicketSelection"])();
    const { replyText, setReplyText, isSending, sendError, setSendError, toast, failedMessages, handleRetry, handleRetrySend, handleSendMessage, handleResolve, handleReopen, handleLinkShopifyCustomer, handleBulkClose, handleBulkArchive, handleBulkTag, handleMarkAsSpam, handleRecover, showToast } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$useTicketActions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTicketActions"])({
        activeTicketId,
        patchThreadCaches,
        revalidateThreadCaches: revalidateTicketData,
        moveThreadStatus,
        moveThreadFilterStatus,
        setActiveTicketId,
        setSelectedIds
    });
    const { activeAgentTurns, isAgentRunning, handleAgentTurnAdd, handleAgentRunningChange, handleAgentComplete } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$useAgentTurns$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useAgentTurns"])({
        activeTicketId,
        activeThread,
        agentActionsByTurnId: activeThreadData?.agentActionsByTurnId,
        patchThreadCaches,
        revalidateThreadCaches: revalidateTicketData
    });
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        messagesEndRef.current?.scrollIntoView({
            behavior: 'smooth'
        });
    }, [
        activeTicket?.messages?.length,
        activeTicketId
    ]);
    const { refreshingSummaryId, handleRefreshSummary } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_hooks$2f$useSummaryRefresh$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSummaryRefresh"])({
        patchThreadCaches,
        showToast
    });
    const handleTabChange = (tab)=>{
        setActiveTab(tab);
        setActiveTicketId(null);
        setSearchQuery('');
        setReplyText('');
        setSendError(null);
        setSelectedIds([]);
        if (tab !== 'open') setNeedsReply(false);
    };
    const handleSearchChange = (q)=>{
        setSearchQuery(q);
        setActiveTicketId(null);
        setSendError(null);
        if (!q) setSelectedIds([]);
    };
    if (isLoading && dbThreads.length === 0 && !isSearchMode) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex size-full overflow-hidden bg-background",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "w-full md:w-72 md:min-w-[260px] md:max-w-[300px] shrink-0 border-r border-border flex flex-col bg-background",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "px-3 pt-3 pb-2 border-b border-border space-y-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "h-9 bg-white/[0.04] rounded-md animate-pulse"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                    lineNumber: 268,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "h-8 bg-white/[0.04] rounded-md animate-pulse"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                    lineNumber: 269,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "h-9 bg-white/[0.04] rounded-md animate-pulse"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                    lineNumber: 270,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                            lineNumber: 267,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex-1 divide-y divide-white/[0.05]",
                            children: [
                                "ticket-skeleton-1",
                                "ticket-skeleton-2",
                                "ticket-skeleton-3",
                                "ticket-skeleton-4",
                                "ticket-skeleton-5",
                                "ticket-skeleton-6"
                            ].map((key)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "px-4 py-3.5 animate-pulse space-y-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex justify-between",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "h-3 w-24 bg-white/[0.06] rounded"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                                    lineNumber: 276,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "h-3 w-10 bg-white/[0.04] rounded"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                                    lineNumber: 277,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                            lineNumber: 275,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "h-3 w-40 bg-white/[0.05] rounded"
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                            lineNumber: 279,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "h-3 w-32 bg-white/[0.04] rounded"
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                            lineNumber: 280,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, key, true, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                    lineNumber: 274,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                            lineNumber: 272,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                    lineNumber: 266,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "hidden md:flex flex-1 items-center justify-center bg-background",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "size-14 rounded-md bg-white/[0.05] border border-border flex items-center justify-center",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$inbox$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Inbox$3e$__["Inbox"], {
                            className: "size-6 text-white/20"
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                            lineNumber: 287,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                        lineNumber: 286,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                    lineNumber: 285,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
            lineNumber: 265,
            columnNumber: 7
        }, this);
    }
    if (error) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex size-full items-center justify-center bg-background",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-red-400 text-sm font-medium",
                children: "Failed to connect to database."
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                lineNumber: 297,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
            lineNumber: 296,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex size-full overflow-hidden bg-background relative",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `
        w-full md:w-72 md:min-w-[260px] md:max-w-[300px] shrink-0 border-r border-border flex-col bg-background
        ${activeTicketId ? 'hidden md:flex' : 'flex'}
      `,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$thread$2d$list$2f$ThreadList$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                    tickets: filteredTickets,
                    totalCount: liveTickets.length,
                    activeTab: effectiveActiveTab,
                    activeFilter: activeFilter,
                    activeTicketId: activeTicketId,
                    openCount: openCount,
                    closedCount: closedCount,
                    spamCount: spamCount,
                    searchQuery: searchQuery,
                    listState: {
                        searchMode: isSearchMode,
                        searchLoading: isSearchLoading,
                        hasMore: effectiveActiveTab === 'open' ? hasMoreOpen : effectiveActiveTab === 'closed' ? hasMoreClosed : hasMoreFiltered,
                        loadingMore: effectiveActiveTab === 'open' ? isLoadingMoreOpen : effectiveActiveTab === 'closed' ? isLoadingMoreClosed : isLoadingMoreFiltered
                    },
                    selectedIds: selectedIds,
                    needsReply: needsReply,
                    onNeedsReplyChange: setNeedsReply,
                    onSearchChange: handleSearchChange,
                    onTabChange: handleTabChange,
                    onFilterChange: setActiveFilter,
                    onSelectTicket: (id)=>{
                        setActiveTicketId(id);
                        setSendError(null);
                    },
                    onToggleSelect: handleToggleSelect,
                    onBulkClose: ()=>handleBulkClose(selectedIds),
                    onBulkArchive: ()=>handleBulkArchive(selectedIds),
                    onBulkTag: (tag)=>handleBulkTag(selectedIds, tag),
                    onClearSelection: handleClearSelection,
                    onLoadMore: effectiveActiveTab === 'open' ? loadMoreOpen : effectiveActiveTab === 'closed' ? loadMoreClosed : loadMoreFiltered,
                    onMarkAsSpam: handleMarkAsSpam,
                    onRecover: handleRecover
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                    lineNumber: 310,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                lineNumber: 306,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `flex-1 flex min-w-0 overflow-hidden ${!activeTicketId ? 'hidden md:flex' : 'flex'}`,
                children: conversationTicket ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex flex-1 min-w-0 flex-col overflow-hidden",
                    children: [
                        correctReply && !dismissCorrectHint && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center justify-between gap-3 border-b border-amber-800/40 bg-amber-900/25 px-4 py-2 text-xs text-amber-100 shrink-0",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: [
                                        "Send the reply you'd prefer — ",
                                        agentName,
                                        " will learn from the difference."
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                    lineNumber: 350,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>setDismissCorrectHint(true),
                                    className: "inline-flex items-center gap-1 text-amber-200/80 hover:text-amber-50 transition-colors shrink-0",
                                    "aria-label": "Dismiss",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                                        className: "size-3.5"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                        lineNumber: 357,
                                        columnNumber: 19
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                    lineNumber: 351,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                            lineNumber: 349,
                            columnNumber: 15
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex flex-1 min-w-0 overflow-hidden",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$conversation$2f$ConversationView$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                    ticket: conversationTicket,
                                    agentName: agentName,
                                    shopifyCustomerId: activeThread?.shopifyCustomerId,
                                    customerPlatformId: activeThread?.customer?.platformId,
                                    agentTurns: activeAgentTurns,
                                    status: {
                                        threadLoading: isConversationLoading,
                                        sending: isSending,
                                        agentRunning: isAgentRunning,
                                        summaryRefreshing: activeThread ? refreshingSummaryId === activeThread.id : false
                                    },
                                    onAgentTurnAdd: handleAgentTurnAdd,
                                    onAgentRunningChange: handleAgentRunningChange,
                                    onAgentComplete: handleAgentComplete,
                                    activeTab: isSearchMode || effectiveActiveTab === 'filtered' ? (activeThread?.status ?? activeThreadPreview?.status) === 'closed' ? 'closed' : 'open' : effectiveActiveTab,
                                    initialPlan: cachedPlan,
                                    aiSummary: activeThread?.aiSummary ?? activeThreadPreview?.aiSummary ?? null,
                                    onRefreshSummary: ()=>{
                                        if (activeThread) {
                                            handleRefreshSummary(activeThread.id);
                                        }
                                    },
                                    replyText: replyText,
                                    sendError: sendError,
                                    messagesEndRef: messagesEndRef,
                                    failedMessages: failedMessages.filter((m)=>m.threadId === activeTicketId),
                                    onRetry: handleRetry,
                                    onRetrySend: handleRetrySend,
                                    onOpenContext: ()=>setShowContextDrawer(true),
                                    onBack: ()=>{
                                        setActiveTicketId(null);
                                        setSendError(null);
                                        setShowContextDrawer(false);
                                    },
                                    onResolve: handleResolve,
                                    onReopen: handleReopen,
                                    onReplyChange: (text)=>{
                                        setReplyText(text);
                                        if (sendError) setSendError(null);
                                    },
                                    onSend: handleSendMessage
                                }, conversationTicket.id, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                    lineNumber: 362,
                                    columnNumber: 13
                                }, this),
                                isDesktopContext && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "hidden xl:flex",
                                    children: activeThread && !isConversationLoading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$ContextPanel$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                        thread: activeThread,
                                        hasShopify: hasShopify,
                                        onLinkShopifyCustomer: handleLinkShopifyCustomer
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                        lineNumber: 405,
                                        columnNumber: 19
                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$ContextPanelSkeleton$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                        hasShopify: hasShopify
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                        lineNumber: 411,
                                        columnNumber: 19
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                    lineNumber: 403,
                                    columnNumber: 15
                                }, this),
                                activeThread && !isConversationLoading && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sheet$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Sheet"], {
                                    open: showContextDrawer,
                                    onOpenChange: setShowContextDrawer,
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sheet$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SheetContent"], {
                                        side: "bottom",
                                        className: "xl:hidden max-h-[82vh] flex flex-col p-0 rounded-t-xl border-border gap-0",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sheet$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SheetHeader"], {
                                                className: "px-5 py-3 border-b border-border shrink-0",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sheet$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SheetTitle"], {
                                                    className: "text-sm font-semibold text-white/70 text-left",
                                                    children: "Customer Details"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                                    lineNumber: 424,
                                                    columnNumber: 21
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                                lineNumber: 423,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex-1 overflow-y-auto",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$tickets$2f$_components$2f$context$2d$panel$2f$ContextPanel$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                                    thread: activeThread,
                                                    hasShopify: hasShopify,
                                                    onLinkShopifyCustomer: handleLinkShopifyCustomer
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                                    lineNumber: 427,
                                                    columnNumber: 21
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                                lineNumber: 426,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                        lineNumber: 419,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                    lineNumber: 418,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                            lineNumber: 361,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                    lineNumber: 347,
                    columnNumber: 11
                }, this) : activeTicketId ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex-1 flex flex-col items-center justify-center bg-background p-6 text-center gap-3",
                    children: activeThreadError ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertCircle$3e$__["AlertCircle"], {
                                className: "size-5 text-red-400"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                lineNumber: 442,
                                columnNumber: 17
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-sm font-semibold text-white/60",
                                        children: "Unable to load ticket"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                        lineNumber: 444,
                                        columnNumber: 19
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-xs text-white/30 mt-1",
                                        children: "The ticket may have been archived or is no longer available."
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                        lineNumber: 445,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                lineNumber: 443,
                                columnNumber: 17
                            }, this)
                        ]
                    }, void 0, true) : null
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                    lineNumber: 439,
                    columnNumber: 11
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex-1 flex flex-col items-center justify-center bg-background p-6 text-center gap-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "size-14 rounded-md bg-white/[0.05] border border-border flex items-center justify-center",
                            children: effectiveActiveTab === 'open' && openThreads.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__["CheckCircle2"], {
                                className: "size-6 text-green-400"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                lineNumber: 454,
                                columnNumber: 19
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$inbox$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Inbox$3e$__["Inbox"], {
                                className: "size-6 text-white/20"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                lineNumber: 455,
                                columnNumber: 19
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                            lineNumber: 452,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-sm font-semibold text-white/60",
                                    children: effectiveActiveTab === 'open' && openThreads.length === 0 ? 'All caught up' : 'No ticket open'
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                    lineNumber: 459,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-xs text-white/30 mt-1 max-w-[200px]",
                                    children: effectiveActiveTab === 'open' && openThreads.length === 0 ? 'No open tickets right now. Check back soon.' : 'Select a ticket from the list to start replying.'
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                                    lineNumber: 462,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                            lineNumber: 458,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                    lineNumber: 451,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                lineNumber: 345,
                columnNumber: 7
            }, this),
            toast && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-[#1c1c1c] border border-white/[0.10] text-white text-sm font-medium px-4 py-2.5 rounded-md shadow-lg pointer-events-none",
                children: [
                    toast.tone === 'error' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertCircle$3e$__["AlertCircle"], {
                        className: "size-4 text-red-400 shrink-0"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                        lineNumber: 476,
                        columnNumber: 15
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__["CheckCircle2"], {
                        className: "size-4 text-green-400 shrink-0"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                        lineNumber: 477,
                        columnNumber: 15
                    }, this),
                    toast.message
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
                lineNumber: 474,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/tickets/_components/TicketsPageClient.tsx",
        lineNumber: 303,
        columnNumber: 5
    }, this);
}
}),
];

//# sourceMappingURL=_0byn8rs._.js.map