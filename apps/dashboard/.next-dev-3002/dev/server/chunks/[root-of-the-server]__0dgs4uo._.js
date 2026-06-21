module.exports = [
"[externals]/next/dist/build/adapter/setup-node-env.external.js [external] (next/dist/build/adapter/setup-node-env.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/build/adapter/setup-node-env.external.js", () => require("next/dist/build/adapter/setup-node-env.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/lib/incremental-cache/tags-manifest.external.js [external] (next/dist/server/lib/incremental-cache/tags-manifest.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/lib/incremental-cache/tags-manifest.external.js", () => require("next/dist/server/lib/incremental-cache/tags-manifest.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/node:async_hooks [external] (node:async_hooks, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:async_hooks", () => require("node:async_hooks"));

module.exports = mod;
}),
"[externals]/path [external] (path, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("path", () => require("path"));

module.exports = mod;
}),
"[externals]/next/dist/server/lib/incremental-cache/memory-cache.external.js [external] (next/dist/server/lib/incremental-cache/memory-cache.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/lib/incremental-cache/memory-cache.external.js", () => require("next/dist/server/lib/incremental-cache/memory-cache.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/lib/incremental-cache/shared-cache-controls.external.js [external] (next/dist/server/lib/incremental-cache/shared-cache-controls.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/lib/incremental-cache/shared-cache-controls.external.js", () => require("next/dist/server/lib/incremental-cache/shared-cache-controls.external.js"));

module.exports = mod;
}),
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("crypto", () => require("crypto"));

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
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[project]/apps/dashboard/src/lib/e2e-auth.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/apps/dashboard/src/proxy/path-access-policy.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getPathAccessPolicy",
    ()=>getPathAccessPolicy,
    "isApiPath",
    ()=>isApiPath,
    "isPublicPath",
    ()=>isPublicPath,
    "matchesPathname",
    ()=>matchesPathname,
    "publicRoutePatterns",
    ()=>publicRoutePatterns
]);
const publicRoutePatterns = [
    "/",
    "/login(.*)",
    "/signup(.*)",
    "/demo-film",
    "/api/health(.*)",
    "/api/billing/webhook(.*)",
    "/api/webhooks(.*)",
    "/api/integrations/shopify/callback(.*)",
    "/api/integrations/instagram/callback(.*)",
    "/api/agent/io-send-internal(.*)",
    "/api/messages/auto-ack(.*)",
    "/api/messages/internal(.*)"
];
const signedInNoOrgRoutePatterns = [
    "/select-org(.*)",
    "/create-workspace(.*)",
    "/onboarding(.*)"
];
const patternRegexCache = new Map();
function getPatternRegex(pattern) {
    let regex = patternRegexCache.get(pattern);
    if (!regex) {
        regex = new RegExp(`^${pattern}$`);
        patternRegexCache.set(pattern, regex);
    }
    return regex;
}
function matchesPathname(pathname, patterns) {
    return patterns.some((pattern)=>getPatternRegex(pattern).test(pathname));
}
function isPublicPath(pathname) {
    return matchesPathname(pathname, publicRoutePatterns);
}
function isSignedInNoOrgPath(pathname) {
    return matchesPathname(pathname, signedInNoOrgRoutePatterns);
}
function isApiPath(pathname) {
    return pathname.startsWith("/api/");
}
function getPathAccessPolicy(pathname) {
    if (isPublicPath(pathname)) {
        return {
            requiresAuth: false,
            requiresOrganization: false,
            missingOrganizationAction: "none"
        };
    }
    if (isSignedInNoOrgPath(pathname)) {
        return {
            requiresAuth: true,
            requiresOrganization: false,
            missingOrganizationAction: "none"
        };
    }
    if (isApiPath(pathname)) {
        return {
            requiresAuth: true,
            requiresOrganization: true,
            missingOrganizationAction: "json-403"
        };
    }
    return {
        requiresAuth: true,
        requiresOrganization: true,
        missingOrganizationAction: "redirect"
    };
}
}),
"[project]/apps/dashboard/src/proxy.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "config",
    ()=>config,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$nextjs$2f$dist$2f$esm$2f$server$2f$clerkMiddleware$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@clerk/nextjs/dist/esm/server/clerkMiddleware.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$e2e$2d$auth$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/e2e-auth.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$proxy$2f$path$2d$access$2d$policy$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/proxy/path-access-policy.ts [middleware] (ecmascript)");
;
;
;
;
const __TURBOPACK__default__export__ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$nextjs$2f$dist$2f$esm$2f$server$2f$clerkMiddleware$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["clerkMiddleware"])(async (auth, req)=>{
    if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$e2e$2d$auth$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["isE2EAuthBypassEnabled"])()) {
        return;
    }
    const pathname = req.nextUrl.pathname;
    const policy = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$proxy$2f$path$2d$access$2d$policy$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["getPathAccessPolicy"])(pathname);
    const { userId, orgId } = await auth();
    if (userId && pathname === '/signup') {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL('/dashboard', req.url));
    }
    if (policy.requiresAuth && !userId) {
        if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$proxy$2f$path$2d$access$2d$policy$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["isApiPath"])(pathname)) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'Unauthorized'
            }, {
                status: 401
            });
        }
        await auth.protect();
        return;
    }
    if (!policy.requiresOrganization || orgId) {
        return;
    }
    if (policy.missingOrganizationAction === 'json-403') {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'No active organization'
        }, {
            status: 403
        });
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL('/select-org', req.url));
});
const config = {
    matcher: [
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|mp4|webm|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        '/(api|trpc)(.*)'
    ]
};
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__0dgs4uo._.js.map