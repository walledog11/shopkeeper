(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/apps/dashboard/src/app/dashboard/_components/help/HelpContext.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "HelpProvider",
    ()=>HelpProvider,
    "useHelp",
    ()=>useHelp
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
const HelpContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])(null);
function HelpProvider({ children }) {
    _s();
    const [isOpen, setIsOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const openHelp = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "HelpProvider.useCallback[openHelp]": ()=>setIsOpen(true)
    }["HelpProvider.useCallback[openHelp]"], []);
    const closeHelp = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "HelpProvider.useCallback[closeHelp]": ()=>setIsOpen(false)
    }["HelpProvider.useCallback[closeHelp]"], []);
    const value = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "HelpProvider.useMemo[value]": ()=>({
                isOpen,
                openHelp,
                closeHelp
            })
    }["HelpProvider.useMemo[value]"], [
        closeHelp,
        isOpen,
        openHelp
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(HelpContext.Provider, {
        value: value,
        children: children
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpContext.tsx",
        lineNumber: 21,
        columnNumber: 5
    }, this);
}
_s(HelpProvider, "idbWvJTgtmoK6X77XdrV5l8dC6Y=");
_c = HelpProvider;
function useHelp() {
    const ctx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["use"])(HelpContext);
    if (!ctx) throw new Error("useHelp must be used within HelpProvider");
    return ctx;
}
var _c;
__turbopack_context__.k.register(_c, "HelpProvider");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/NotificationBar.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>NotificationBar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/x.js [app-client] (ecmascript) <export default as X>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$info$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Info$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/info.js [app-client] (ecmascript) <export default as Info>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$triangle$2d$alert$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertTriangle$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/triangle-alert.js [app-client] (ecmascript) <export default as AlertTriangle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/sparkles.js [app-client] (ecmascript) <export default as Sparkles>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$AnimatePresence$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/components/AnimatePresence/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$LazyMotion$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/components/LazyMotion/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$dom$2f$features$2d$animation$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/render/dom/features-animation.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$m$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/render/components/m/proxy.mjs [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
const TYPE_STYLES = {
    info: {
        bar: "bg-linear-to-b from-indigo-900/70 to-black/70 text-white/60 border-white[0.1]",
        icon: "text-indigo-400",
        title: "text-white/80",
        action: "text-indigo-400"
    },
    warning: {
        bar: "bg-linear-to-b from-amber-900/70 to-black/70 text-white/60 border-white[0.1]",
        icon: "text-amber-400",
        title: "text-amber-400",
        action: "text-amber-400"
    },
    success: {
        bar: "bg-linear-to-b from-emerald-900/70 to-black/70 text-white/60 border-white[0.1]",
        icon: "text-emerald-400",
        title: "text-emerald-400",
        action: "text-emerald-400"
    }
};
const TYPE_ICONS = {
    info: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$info$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Info$3e$__["Info"],
    warning: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$triangle$2d$alert$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertTriangle$3e$__["AlertTriangle"],
    success: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"]
};
const STORAGE_KEY = "notificationBar_dismissed";
function loadDismissed() {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
        return new Set(Array.isArray(stored) ? stored : []);
    } catch  {
        return new Set();
    }
}
function saveDismissed(ids) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([
        ...ids
    ]));
}
function NotificationBar({ notifications }) {
    _s();
    const [dismissedIds, setDismissedIds] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        "NotificationBar.useState": ()=>loadDismissed()
    }["NotificationBar.useState"]);
    const [current, setCurrent] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    const directionRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(1);
    const barRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const visibleNotifications = notifications.filter((n)=>!dismissedIds.has(n.id));
    const count = visibleNotifications.length;
    const safeIndex = Math.min(current, Math.max(0, count - 1));
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "NotificationBar.useEffect": ()=>{
            if (count <= 1) return;
            const id = setInterval({
                "NotificationBar.useEffect.id": ()=>{
                    directionRef.current = 1;
                    setCurrent({
                        "NotificationBar.useEffect.id": (c)=>(c + 1) % count
                    }["NotificationBar.useEffect.id"]);
                }
            }["NotificationBar.useEffect.id"], 5000);
            return ({
                "NotificationBar.useEffect": ()=>clearInterval(id)
            })["NotificationBar.useEffect"];
        }
    }["NotificationBar.useEffect"], [
        count
    ]);
    function dismiss(id) {
        setDismissedIds((prev)=>{
            const next = new Set(prev).add(id);
            saveDismissed(next);
            return next;
        });
        if (current >= count - 1) setCurrent(Math.max(0, count - 2));
    }
    const n = count > 0 ? visibleNotifications[safeIndex] : null;
    const type = n?.type ?? "info";
    const styles = TYPE_STYLES[type];
    const Icon = TYPE_ICONS[type];
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "NotificationBar.useEffect": ()=>{
            const el = barRef.current;
            if (!el) {
                document.documentElement.style.setProperty("--notification-bar-height", "2px");
                return;
            }
            const ro = new ResizeObserver({
                "NotificationBar.useEffect": ([entry])=>{
                    document.documentElement.style.setProperty("--notification-bar-height", `${entry.contentRect.height + 2}px`);
                }
            }["NotificationBar.useEffect"]);
            ro.observe(el);
            return ({
                "NotificationBar.useEffect": ()=>ro.disconnect()
            })["NotificationBar.useEffect"];
        }
    }["NotificationBar.useEffect"], [
        n
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$LazyMotion$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["LazyMotion"], {
        features: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$dom$2f$features$2d$animation$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["domAnimation"],
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$AnimatePresence$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AnimatePresence"], {
            initial: false,
            children: n && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$m$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["m"].div, {
                ref: barRef,
                "data-dashboard-notification-bar": true,
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
                    opacity: 0
                },
                transition: {
                    duration: 0.25,
                    ease: "easeInOut"
                },
                className: `relative z-20 flex items-center justify-center pl-3 pr-10 md:px-10 text-xs md:text-sm shrink-0 border-b overflow-hidden ${styles.bar}`,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "py-2 md:py-3 flex items-center gap-2 md:gap-2.5",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$AnimatePresence$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AnimatePresence"], {
                            mode: "wait",
                            custom: directionRef.current,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$m$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["m"].div, {
                                custom: directionRef.current,
                                variants: {
                                    enter: (d)=>({
                                            opacity: 0,
                                            y: d * 8
                                        }),
                                    center: {
                                        opacity: 1,
                                        y: 0
                                    },
                                    exit: (d)=>({
                                            opacity: 0,
                                            y: d * -8
                                        })
                                },
                                initial: "enter",
                                animate: "center",
                                exit: "exit",
                                transition: {
                                    duration: 0.18,
                                    ease: "easeInOut"
                                },
                                className: "flex items-center gap-2.5 transition-colors",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Icon, {
                                        className: `size-4 shrink-0 ${styles.icon}`
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/NotificationBar.tsx",
                                        lineNumber: 125,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-center gap-1.5 min-w-0",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: `font-bold whitespace-nowrap ${styles.title}`,
                                                children: n.title
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/NotificationBar.tsx",
                                                lineNumber: 127,
                                                columnNumber: 19
                                            }, this),
                                            n.message && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "font-normal text-white/40 hidden sm:inline whitespace-nowrap",
                                                children: n.message
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/NotificationBar.tsx",
                                                lineNumber: 128,
                                                columnNumber: 33
                                            }, this),
                                            n.action && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                                                children: [
                                                    " ",
                                                    n.action.href ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                                        href: n.action.href,
                                                        className: `font-semibold underline underline-offset-2 hover:opacity-70 transition-opacity whitespace-nowrap ${styles.action}`,
                                                        children: n.action.label
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/NotificationBar.tsx",
                                                        lineNumber: 133,
                                                        columnNumber: 25
                                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        type: "button",
                                                        onClick: n.action.onClick,
                                                        className: `font-semibold underline underline-offset-2 hover:opacity-70 transition-opacity whitespace-nowrap ${styles.action}`,
                                                        children: n.action.label
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/NotificationBar.tsx",
                                                        lineNumber: 140,
                                                        columnNumber: 25
                                                    }, this)
                                                ]
                                            }, void 0, true)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/NotificationBar.tsx",
                                        lineNumber: 126,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, n.id, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/NotificationBar.tsx",
                                lineNumber: 111,
                                columnNumber: 15
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/NotificationBar.tsx",
                            lineNumber: 110,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/NotificationBar.tsx",
                        lineNumber: 109,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$m$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["m"].button, {
                        onClick: ()=>dismiss(n.id),
                        whileHover: {
                            scale: 1.1
                        },
                        whileTap: {
                            scale: 0.9
                        },
                        className: "absolute right-3 p-1.5 rounded hover:bg-black/10 transition-colors",
                        "aria-label": "Dismiss",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                            className: "size-4"
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/NotificationBar.tsx",
                            lineNumber: 161,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/NotificationBar.tsx",
                        lineNumber: 154,
                        columnNumber: 11
                    }, this)
                ]
            }, "bar", true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/NotificationBar.tsx",
                lineNumber: 99,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/NotificationBar.tsx",
            lineNumber: 97,
            columnNumber: 5
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/NotificationBar.tsx",
        lineNumber: 96,
        columnNumber: 5
    }, this);
}
_s(NotificationBar, "hYRGPuw1VhkD/WSXfqmzodsTZoc=");
_c = NotificationBar;
var _c;
__turbopack_context__.k.register(_c, "NotificationBar");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/NavProgressBar.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>NavProgressBar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
function NavProgressBar() {
    _s();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    const barRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const isNavigating = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(false);
    const navTimerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const applyBarStyle = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "NavProgressBar.useCallback[applyBarStyle]": (width, opacity, transition)=>{
            const bar = barRef.current;
            if (!bar) return;
            bar.style.width = `${width}%`;
            bar.style.opacity = String(opacity);
            bar.style.transition = transition;
        }
    }["NavProgressBar.useCallback[applyBarStyle]"], []);
    // Sidebar dispatches "nav-progress-start" on link click so the bar begins before the route resolves
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "NavProgressBar.useEffect": ()=>{
            function onNavStart() {
                isNavigating.current = true;
                if (navTimerRef.current) clearTimeout(navTimerRef.current);
                applyBarStyle(0, 1, "none");
                requestAnimationFrame({
                    "NavProgressBar.useEffect.onNavStart": ()=>{
                        requestAnimationFrame({
                            "NavProgressBar.useEffect.onNavStart": ()=>{
                                applyBarStyle(85, 1, "width 3s cubic-bezier(0.05, 0.8, 0.1, 1)");
                            }
                        }["NavProgressBar.useEffect.onNavStart"]);
                    }
                }["NavProgressBar.useEffect.onNavStart"]);
            }
            window.addEventListener("nav-progress-start", onNavStart);
            return ({
                "NavProgressBar.useEffect": ()=>window.removeEventListener("nav-progress-start", onNavStart)
            })["NavProgressBar.useEffect"];
        }
    }["NavProgressBar.useEffect"], [
        applyBarStyle
    ]);
    // Complete the bar when pathname changes
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "NavProgressBar.useEffect": ()=>{
            if (!isNavigating.current) return;
            isNavigating.current = false;
            if (navTimerRef.current) clearTimeout(navTimerRef.current);
            applyBarStyle(100, 1, "width 0.2s ease-out");
            navTimerRef.current = setTimeout({
                "NavProgressBar.useEffect": ()=>{
                    applyBarStyle(100, 0, "opacity 0.3s ease-out");
                    navTimerRef.current = setTimeout({
                        "NavProgressBar.useEffect": ()=>applyBarStyle(0, 0, "none")
                    }["NavProgressBar.useEffect"], 300);
                }
            }["NavProgressBar.useEffect"], 250);
            return ({
                "NavProgressBar.useEffect": ()=>{
                    if (navTimerRef.current) {
                        clearTimeout(navTimerRef.current);
                        navTimerRef.current = null;
                    }
                }
            })["NavProgressBar.useEffect"];
        }
    }["NavProgressBar.useEffect"], [
        pathname,
        applyBarStyle
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-dashboard-nav-progress": true,
        className: "relative z-20 h-[2px] shrink-0 bg-transparent",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            ref: barRef,
            className: "absolute inset-y-0 left-0 bg-green-500 pointer-events-none",
            style: {
                width: "0%",
                opacity: 0,
                transition: "none"
            }
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/NavProgressBar.tsx",
            lineNumber: 57,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/NavProgressBar.tsx",
        lineNumber: 56,
        columnNumber: 5
    }, this);
}
_s(NavProgressBar, "VEx7xroOMOQ7S7Wbq5DhmBDFjqQ=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"]
    ];
});
_c = NavProgressBar;
var _c;
__turbopack_context__.k.register(_c, "NavProgressBar");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/hooks/useMobile.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useIsMobile",
    ()=>useIsMobile
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
;
const MOBILE_BREAKPOINT = 768;
function useIsMobile() {
    _s();
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSyncExternalStore"]({
        "useIsMobile.useSyncExternalStore": (onStoreChange)=>{
            if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
            ;
            const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
            const onChange = {
                "useIsMobile.useSyncExternalStore.onChange": ()=>onStoreChange()
            }["useIsMobile.useSyncExternalStore.onChange"];
            mql.addEventListener("change", onChange);
            return ({
                "useIsMobile.useSyncExternalStore": ()=>mql.removeEventListener("change", onChange)
            })["useIsMobile.useSyncExternalStore"];
        }
    }["useIsMobile.useSyncExternalStore"], {
        "useIsMobile.useSyncExternalStore": ()=>window.innerWidth < MOBILE_BREAKPOINT
    }["useIsMobile.useSyncExternalStore"], {
        "useIsMobile.useSyncExternalStore": ()=>false
    }["useIsMobile.useSyncExternalStore"]);
}
_s(useIsMobile, "FpwL93IKMLJZuQQXefVtWynbBPQ=");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/lib/ui/cn.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "cn",
    ()=>cn
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$clsx$2f$dist$2f$clsx$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/clsx/dist/clsx.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/tailwind-merge/dist/bundle-mjs.mjs [app-client] (ecmascript)");
;
;
function cn(...inputs) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["twMerge"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$clsx$2f$dist$2f$clsx$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clsx"])(inputs));
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/components/ui/button.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Button",
    ()=>Button
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/class-variance-authority/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Slot$3e$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-slot/dist/index.mjs [app-client] (ecmascript) <export * as Slot>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/ui/cn.ts [app-client] (ecmascript)");
;
;
;
;
const buttonVariants = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cva"])("inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4", {
    variants: {
        variant: {
            default: "bg-primary text-primary-foreground hover:bg-primary/90",
            destructive: "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
            outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
            secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
            link: "text-primary underline-offset-4 hover:underline"
        },
        size: {
            default: "h-9 px-4 py-2 has-[>svg]:px-3",
            xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
            sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
            lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
            icon: "size-9",
            "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
            "icon-sm": "size-8",
            "icon-lg": "size-10"
        }
    },
    defaultVariants: {
        variant: "default",
        size: "default"
    }
});
function Button({ className, variant = "default", size = "default", asChild = false, ...props }) {
    const Comp = asChild ? __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Slot$3e$__["Slot"].Root : "button";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Comp, {
        "data-slot": "button",
        "data-variant": variant,
        "data-size": size,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])(buttonVariants({
            variant,
            size,
            className
        })),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/button.tsx",
        lineNumber: 54,
        columnNumber: 5
    }, this);
}
_c = Button;
;
var _c;
__turbopack_context__.k.register(_c, "Button");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/components/ui/input.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Input",
    ()=>Input
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/ui/cn.ts [app-client] (ecmascript)");
;
;
function Input({ className, type, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
        type: type,
        "data-slot": "input",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30", "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50", "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/input.tsx",
        lineNumber: 7,
        columnNumber: 5
    }, this);
}
_c = Input;
;
var _c;
__turbopack_context__.k.register(_c, "Input");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/components/ui/separator.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Separator",
    ()=>Separator
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$separator$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Separator$3e$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-separator/dist/index.mjs [app-client] (ecmascript) <export * as Separator>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/ui/cn.ts [app-client] (ecmascript)");
"use client";
;
;
;
function Separator({ className, orientation = "horizontal", decorative = true, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$separator$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Separator$3e$__["Separator"].Root, {
        "data-slot": "separator",
        decorative: decorative,
        orientation: orientation,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/separator.tsx",
        lineNumber: 15,
        columnNumber: 5
    }, this);
}
_c = Separator;
;
var _c;
__turbopack_context__.k.register(_c, "Separator");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/components/ui/sheet.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Sheet",
    ()=>Sheet,
    "SheetClose",
    ()=>SheetClose,
    "SheetContent",
    ()=>SheetContent,
    "SheetDescription",
    ()=>SheetDescription,
    "SheetFooter",
    ()=>SheetFooter,
    "SheetHeader",
    ()=>SheetHeader,
    "SheetTitle",
    ()=>SheetTitle,
    "SheetTrigger",
    ()=>SheetTrigger
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__XIcon$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/x.js [app-client] (ecmascript) <export default as XIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-dialog/dist/index.mjs [app-client] (ecmascript) <export * as Dialog>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/ui/cn.ts [app-client] (ecmascript)");
"use client";
;
;
;
;
function Sheet({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Root, {
        "data-slot": "sheet",
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sheet.tsx",
        lineNumber: 10,
        columnNumber: 10
    }, this);
}
_c = Sheet;
function SheetTrigger({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Trigger, {
        "data-slot": "sheet-trigger",
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sheet.tsx",
        lineNumber: 16,
        columnNumber: 10
    }, this);
}
_c1 = SheetTrigger;
function SheetClose({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Close, {
        "data-slot": "sheet-close",
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sheet.tsx",
        lineNumber: 22,
        columnNumber: 10
    }, this);
}
_c2 = SheetClose;
function SheetPortal({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Portal, {
        "data-slot": "sheet-portal",
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sheet.tsx",
        lineNumber: 28,
        columnNumber: 10
    }, this);
}
_c3 = SheetPortal;
function SheetOverlay({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Overlay, {
        "data-slot": "sheet-overlay",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sheet.tsx",
        lineNumber: 36,
        columnNumber: 5
    }, this);
}
_c4 = SheetOverlay;
function SheetContent({ className, children, side = "right", showCloseButton = true, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(SheetPortal, {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(SheetOverlay, {}, void 0, false, {
                fileName: "[project]/apps/dashboard/src/components/ui/sheet.tsx",
                lineNumber: 59,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Content, {
                "data-slot": "sheet-content",
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("fixed z-50 flex flex-col gap-4 bg-background shadow-lg transition ease-in-out data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:animate-in data-[state=open]:duration-500", side === "right" && "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm", side === "left" && "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm", side === "top" && "inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top", side === "bottom" && "inset-x-0 bottom-0 h-auto border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom", className),
                ...props,
                children: [
                    children,
                    showCloseButton && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Close, {
                        className: "absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-secondary",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__XIcon$3e$__["XIcon"], {
                                className: "size-4"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/components/ui/sheet.tsx",
                                lineNumber: 79,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "sr-only",
                                children: "Close"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/components/ui/sheet.tsx",
                                lineNumber: 80,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/components/ui/sheet.tsx",
                        lineNumber: 78,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/components/ui/sheet.tsx",
                lineNumber: 60,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/components/ui/sheet.tsx",
        lineNumber: 58,
        columnNumber: 5
    }, this);
}
_c5 = SheetContent;
function SheetHeader({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "sheet-header",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex flex-col gap-1.5 p-4", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sheet.tsx",
        lineNumber: 90,
        columnNumber: 5
    }, this);
}
_c6 = SheetHeader;
function SheetFooter({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "sheet-footer",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("mt-auto flex flex-col gap-2 p-4", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sheet.tsx",
        lineNumber: 100,
        columnNumber: 5
    }, this);
}
_c7 = SheetFooter;
function SheetTitle({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Title, {
        "data-slot": "sheet-title",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("font-semibold text-foreground", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sheet.tsx",
        lineNumber: 113,
        columnNumber: 5
    }, this);
}
_c8 = SheetTitle;
function SheetDescription({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Description, {
        "data-slot": "sheet-description",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("text-sm text-muted-foreground", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sheet.tsx",
        lineNumber: 126,
        columnNumber: 5
    }, this);
}
_c9 = SheetDescription;
;
var _c, _c1, _c2, _c3, _c4, _c5, _c6, _c7, _c8, _c9;
__turbopack_context__.k.register(_c, "Sheet");
__turbopack_context__.k.register(_c1, "SheetTrigger");
__turbopack_context__.k.register(_c2, "SheetClose");
__turbopack_context__.k.register(_c3, "SheetPortal");
__turbopack_context__.k.register(_c4, "SheetOverlay");
__turbopack_context__.k.register(_c5, "SheetContent");
__turbopack_context__.k.register(_c6, "SheetHeader");
__turbopack_context__.k.register(_c7, "SheetFooter");
__turbopack_context__.k.register(_c8, "SheetTitle");
__turbopack_context__.k.register(_c9, "SheetDescription");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/components/ui/skeleton.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Skeleton",
    ()=>Skeleton
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/ui/cn.ts [app-client] (ecmascript)");
;
;
function Skeleton({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "skeleton",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("animate-pulse rounded-md bg-accent", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/skeleton.tsx",
        lineNumber: 5,
        columnNumber: 5
    }, this);
}
_c = Skeleton;
;
var _c;
__turbopack_context__.k.register(_c, "Skeleton");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/components/ui/tooltip.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Tooltip",
    ()=>Tooltip,
    "TooltipContent",
    ()=>TooltipContent,
    "TooltipProvider",
    ()=>TooltipProvider,
    "TooltipTrigger",
    ()=>TooltipTrigger
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tooltip$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Tooltip$3e$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-tooltip/dist/index.mjs [app-client] (ecmascript) <export * as Tooltip>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/ui/cn.ts [app-client] (ecmascript)");
"use client";
;
;
;
function TooltipProvider({ delayDuration = 0, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tooltip$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Tooltip$3e$__["Tooltip"].Provider, {
        "data-slot": "tooltip-provider",
        delayDuration: delayDuration,
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/tooltip.tsx",
        lineNumber: 13,
        columnNumber: 5
    }, this);
}
_c = TooltipProvider;
function Tooltip({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tooltip$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Tooltip$3e$__["Tooltip"].Root, {
        "data-slot": "tooltip",
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/tooltip.tsx",
        lineNumber: 24,
        columnNumber: 10
    }, this);
}
_c1 = Tooltip;
function TooltipTrigger({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tooltip$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Tooltip$3e$__["Tooltip"].Trigger, {
        "data-slot": "tooltip-trigger",
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/tooltip.tsx",
        lineNumber: 30,
        columnNumber: 10
    }, this);
}
_c2 = TooltipTrigger;
function TooltipContent({ className, sideOffset = 0, children, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tooltip$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Tooltip$3e$__["Tooltip"].Portal, {
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tooltip$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Tooltip$3e$__["Tooltip"].Content, {
            "data-slot": "tooltip-content",
            sideOffset: sideOffset,
            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("z-50 w-fit origin-(--radix-tooltip-content-transform-origin) animate-in rounded-md bg-foreground px-3 py-1.5 text-xs text-balance text-background fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95", className),
            ...props,
            children: [
                children,
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tooltip$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Tooltip$3e$__["Tooltip"].Arrow, {
                    className: "z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground"
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/components/ui/tooltip.tsx",
                    lineNumber: 51,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/dashboard/src/components/ui/tooltip.tsx",
            lineNumber: 41,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/tooltip.tsx",
        lineNumber: 40,
        columnNumber: 5
    }, this);
}
_c3 = TooltipContent;
;
var _c, _c1, _c2, _c3;
__turbopack_context__.k.register(_c, "TooltipProvider");
__turbopack_context__.k.register(_c1, "Tooltip");
__turbopack_context__.k.register(_c2, "TooltipTrigger");
__turbopack_context__.k.register(_c3, "TooltipContent");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/components/ui/sidebar.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Sidebar",
    ()=>Sidebar,
    "SidebarContent",
    ()=>SidebarContent,
    "SidebarFooter",
    ()=>SidebarFooter,
    "SidebarGroup",
    ()=>SidebarGroup,
    "SidebarGroupAction",
    ()=>SidebarGroupAction,
    "SidebarGroupContent",
    ()=>SidebarGroupContent,
    "SidebarGroupLabel",
    ()=>SidebarGroupLabel,
    "SidebarHeader",
    ()=>SidebarHeader,
    "SidebarInput",
    ()=>SidebarInput,
    "SidebarInset",
    ()=>SidebarInset,
    "SidebarMenu",
    ()=>SidebarMenu,
    "SidebarMenuAction",
    ()=>SidebarMenuAction,
    "SidebarMenuBadge",
    ()=>SidebarMenuBadge,
    "SidebarMenuButton",
    ()=>SidebarMenuButton,
    "SidebarMenuItem",
    ()=>SidebarMenuItem,
    "SidebarMenuSkeleton",
    ()=>SidebarMenuSkeleton,
    "SidebarMenuSub",
    ()=>SidebarMenuSub,
    "SidebarMenuSubButton",
    ()=>SidebarMenuSubButton,
    "SidebarMenuSubItem",
    ()=>SidebarMenuSubItem,
    "SidebarProvider",
    ()=>SidebarProvider,
    "SidebarRail",
    ()=>SidebarRail,
    "SidebarSeparator",
    ()=>SidebarSeparator,
    "SidebarTrigger",
    ()=>SidebarTrigger,
    "useSidebar",
    ()=>useSidebar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/class-variance-authority/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$left$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelLeftIcon$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/panel-left.js [app-client] (ecmascript) <export default as PanelLeftIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Slot$3e$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-slot/dist/index.mjs [app-client] (ecmascript) <export * as Slot>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useMobile$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/hooks/useMobile.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/ui/cn.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/button.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/input.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$separator$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/separator.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sheet$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/sheet.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/skeleton.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/tooltip.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature(), _s2 = __turbopack_context__.k.signature(), _s3 = __turbopack_context__.k.signature(), _s4 = __turbopack_context__.k.signature(), _s5 = __turbopack_context__.k.signature();
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
const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "13rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";
const SidebarContext = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"](null);
function useSidebar() {
    const context = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["use"](SidebarContext);
    if (!context) {
        throw new Error("useSidebar must be used within a SidebarProvider.");
    }
    return context;
}
function SidebarProvider({ defaultOpen = true, open: openProp, onOpenChange: setOpenProp, className, style, children, ...props }) {
    _s();
    const isMobile = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useMobile$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useIsMobile"])();
    const [openMobile, setOpenMobile] = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"](false);
    // This is the internal state of the sidebar.
    // We use openProp and setOpenProp for control from outside the component.
    const [_open, _setOpen] = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"](defaultOpen);
    const open = openProp ?? _open;
    const setOpen = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"]({
        "SidebarProvider.useCallback[setOpen]": (value)=>{
            const openState = typeof value === "function" ? value(open) : value;
            if (setOpenProp) {
                setOpenProp(openState);
            } else {
                _setOpen(openState);
            }
            // This sets the cookie to keep the sidebar state.
            document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
        }
    }["SidebarProvider.useCallback[setOpen]"], [
        setOpenProp,
        open
    ]);
    // Helper to toggle the sidebar.
    const toggleSidebar = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"]({
        "SidebarProvider.useCallback[toggleSidebar]": ()=>{
            return isMobile ? setOpenMobile({
                "SidebarProvider.useCallback[toggleSidebar]": (open)=>!open
            }["SidebarProvider.useCallback[toggleSidebar]"]) : setOpen({
                "SidebarProvider.useCallback[toggleSidebar]": (open)=>!open
            }["SidebarProvider.useCallback[toggleSidebar]"]);
        }
    }["SidebarProvider.useCallback[toggleSidebar]"], [
        isMobile,
        setOpen,
        setOpenMobile
    ]);
    // Adds a keyboard shortcut to toggle the sidebar.
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"]({
        "SidebarProvider.useEffect": ()=>{
            const handleKeyDown = {
                "SidebarProvider.useEffect.handleKeyDown": (event)=>{
                    if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault();
                        toggleSidebar();
                    }
                }
            }["SidebarProvider.useEffect.handleKeyDown"];
            window.addEventListener("keydown", handleKeyDown);
            return ({
                "SidebarProvider.useEffect": ()=>window.removeEventListener("keydown", handleKeyDown)
            })["SidebarProvider.useEffect"];
        }
    }["SidebarProvider.useEffect"], [
        toggleSidebar
    ]);
    // We add a state so that we can do data-state="expanded" or "collapsed".
    // This makes it easier to style the sidebar with Tailwind classes.
    const state = open ? "expanded" : "collapsed";
    const contextValue = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"]({
        "SidebarProvider.useMemo[contextValue]": ()=>({
                state,
                open,
                setOpen,
                isMobile,
                openMobile,
                setOpenMobile,
                toggleSidebar
            })
    }["SidebarProvider.useMemo[contextValue]"], [
        state,
        open,
        setOpen,
        isMobile,
        openMobile,
        setOpenMobile,
        toggleSidebar
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(SidebarContext.Provider, {
        value: contextValue,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipProvider"], {
            delayDuration: 0,
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                "data-slot": "sidebar-wrapper",
                style: {
                    "--sidebar-width": SIDEBAR_WIDTH,
                    "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
                    ...style
                },
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar", className),
                ...props,
                children: children
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
                lineNumber: 132,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
            lineNumber: 131,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 130,
        columnNumber: 5
    }, this);
}
_s(SidebarProvider, "QSOkjq1AvKFJW5+zwiK52jPX7zI=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useMobile$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useIsMobile"]
    ];
});
_c = SidebarProvider;
function Sidebar({ side = "left", variant = "sidebar", collapsible = "offcanvas", className, children, ...props }) {
    _s1();
    const { isMobile, state, openMobile, setOpenMobile } = useSidebar();
    if (collapsible === "none") {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            "data-slot": "sidebar",
            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground", className),
            ...props,
            children: children
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
            lineNumber: 170,
            columnNumber: 7
        }, this);
    }
    if (isMobile) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sheet$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Sheet"], {
            open: openMobile,
            onOpenChange: setOpenMobile,
            ...props,
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sheet$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SheetContent"], {
                "data-sidebar": "sidebar",
                "data-slot": "sidebar",
                "data-mobile": "true",
                className: "w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden",
                style: {
                    "--sidebar-width": SIDEBAR_WIDTH_MOBILE
                },
                side: side,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sheet$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SheetHeader"], {
                        className: "sr-only",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sheet$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SheetTitle"], {
                                children: "Sidebar"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
                                lineNumber: 199,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sheet$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SheetDescription"], {
                                children: "Displays the mobile sidebar."
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
                                lineNumber: 200,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
                        lineNumber: 198,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex size-full flex-col",
                        children: children
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
                        lineNumber: 202,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
                lineNumber: 186,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
            lineNumber: 185,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("group peer hidden text-sidebar-foreground md:flex md:flex-col shrink-0 transition-[width] duration-200 ease-linear", "w-(--sidebar-width) group-data-[collapsible=offcanvas]:w-0 group-data-[collapsible=icon]:w-(--sidebar-width-icon)", variant === "floating" || variant === "inset" ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]" : ""),
        "data-state": state,
        "data-collapsible": state === "collapsed" ? collapsible : "",
        "data-variant": variant,
        "data-side": side,
        "data-slot": "sidebar",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            "data-slot": "sidebar-container",
            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("hidden w-(--sidebar-width) overflow-hidden md:flex flex-col h-full transition-[width] duration-200 ease-linear", variant === "floating" || variant === "inset" ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]" : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l", className),
            ...props,
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                "data-sidebar": "sidebar",
                "data-slot": "sidebar-inner",
                className: "flex size-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow-sm",
                children: children
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
                lineNumber: 232,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
            lineNumber: 221,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 209,
        columnNumber: 5
    }, this);
}
_s1(Sidebar, "hAL3+uRFwO9tnbDK50BUE5wZ71s=", false, function() {
    return [
        useSidebar
    ];
});
_c1 = Sidebar;
function SidebarTrigger({ className, onClick, ...props }) {
    _s2();
    const { toggleSidebar } = useSidebar();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
        "data-sidebar": "trigger",
        "data-slot": "sidebar-trigger",
        variant: "ghost",
        size: "icon",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("size-7", className),
        onClick: (event)=>{
            onClick?.(event);
            toggleSidebar();
        },
        ...props,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$left$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelLeftIcon$3e$__["PanelLeftIcon"], {}, void 0, false, {
                fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
                lineNumber: 264,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "sr-only",
                children: "Toggle Sidebar"
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
                lineNumber: 265,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 252,
        columnNumber: 5
    }, this);
}
_s2(SidebarTrigger, "dRnjPhQbCChcVGr4xvQkpNxnqyg=", false, function() {
    return [
        useSidebar
    ];
});
_c2 = SidebarTrigger;
function SidebarRail({ className, ...props }) {
    _s3();
    const { toggleSidebar } = useSidebar();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        type: "button",
        "data-sidebar": "rail",
        "data-slot": "sidebar-rail",
        "aria-label": "Toggle Sidebar",
        tabIndex: -1,
        onClick: toggleSidebar,
        title: "Toggle Sidebar",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-sidebar-border sm:flex", "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize", "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize", "group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full hover:group-data-[collapsible=offcanvas]:bg-sidebar", "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2", "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 274,
        columnNumber: 5
    }, this);
}
_s3(SidebarRail, "dRnjPhQbCChcVGr4xvQkpNxnqyg=", false, function() {
    return [
        useSidebar
    ];
});
_c3 = SidebarRail;
function SidebarInset({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
        "data-slot": "sidebar-inset",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("relative flex w-full flex-1 flex-col bg-background", "md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 297,
        columnNumber: 5
    }, this);
}
_c4 = SidebarInset;
function SidebarInput({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Input"], {
        "data-slot": "sidebar-input",
        "data-sidebar": "input",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("h-8 w-full bg-background shadow-none", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 314,
        columnNumber: 5
    }, this);
}
_c5 = SidebarInput;
function SidebarHeader({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "sidebar-header",
        "data-sidebar": "header",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex flex-col gap-2 p-2", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 325,
        columnNumber: 5
    }, this);
}
_c6 = SidebarHeader;
function SidebarFooter({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "sidebar-footer",
        "data-sidebar": "footer",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex flex-col gap-2 p-2", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 336,
        columnNumber: 5
    }, this);
}
_c7 = SidebarFooter;
function SidebarSeparator({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$separator$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Separator"], {
        "data-slot": "sidebar-separator",
        "data-sidebar": "separator",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("mx-2 w-auto bg-sidebar-border", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 350,
        columnNumber: 5
    }, this);
}
_c8 = SidebarSeparator;
function SidebarContent({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "sidebar-content",
        "data-sidebar": "content",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 361,
        columnNumber: 5
    }, this);
}
_c9 = SidebarContent;
function SidebarGroup({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "sidebar-group",
        "data-sidebar": "group",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("relative flex w-full min-w-0 flex-col p-2", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 375,
        columnNumber: 5
    }, this);
}
_c10 = SidebarGroup;
function SidebarGroupLabel({ className, asChild = false, ...props }) {
    const Comp = asChild ? __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Slot$3e$__["Slot"].Root : "div";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Comp, {
        "data-slot": "sidebar-group-label",
        "data-sidebar": "group-label",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0", "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 392,
        columnNumber: 5
    }, this);
}
_c11 = SidebarGroupLabel;
function SidebarGroupAction({ className, asChild = false, ...props }) {
    const Comp = asChild ? __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Slot$3e$__["Slot"].Root : "button";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Comp, {
        "data-slot": "sidebar-group-action",
        "data-sidebar": "group-action",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0", // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden", "group-data-[collapsible=icon]:hidden", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 413,
        columnNumber: 5
    }, this);
}
_c12 = SidebarGroupAction;
function SidebarGroupContent({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "sidebar-group-content",
        "data-sidebar": "group-content",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("w-full text-sm", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 433,
        columnNumber: 5
    }, this);
}
_c13 = SidebarGroupContent;
function SidebarMenu({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
        "data-slot": "sidebar-menu",
        "data-sidebar": "menu",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex w-full min-w-0 flex-col gap-1", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 444,
        columnNumber: 5
    }, this);
}
_c14 = SidebarMenu;
function SidebarMenuItem({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
        "data-slot": "sidebar-menu-item",
        "data-sidebar": "menu-item",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("group/menu-item relative", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 455,
        columnNumber: 5
    }, this);
}
_c15 = SidebarMenuItem;
const sidebarMenuButtonVariants = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cva"])("peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0", {
    variants: {
        variant: {
            default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            outline: "bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]"
        },
        size: {
            default: "h-8 text-sm",
            sm: "h-7 text-xs",
            lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!"
        }
    },
    defaultVariants: {
        variant: "default",
        size: "default"
    }
});
function SidebarMenuButton({ asChild = false, isActive = false, variant = "default", size = "default", tooltip, className, ...props }) {
    _s4();
    const Comp = asChild ? __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Slot$3e$__["Slot"].Root : "button";
    const { isMobile, state } = useSidebar();
    const button = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Comp, {
        "data-slot": "sidebar-menu-button",
        "data-sidebar": "menu-button",
        "data-size": size,
        "data-active": isActive,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])(sidebarMenuButtonVariants({
            variant,
            size
        }), className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 503,
        columnNumber: 5
    }, this);
    if (!tooltip) {
        return button;
    }
    if (typeof tooltip === "string") {
        tooltip = {
            children: tooltip
        };
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Tooltip"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipTrigger"], {
                asChild: true,
                children: button
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
                lineNumber: 525,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipContent"], {
                side: "right",
                align: "center",
                hidden: state !== "collapsed" || isMobile,
                ...tooltip
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
                lineNumber: 526,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 524,
        columnNumber: 5
    }, this);
}
_s4(SidebarMenuButton, "DSCdbs8JtpmKVxCYgM7sPAZNgB0=", false, function() {
    return [
        useSidebar
    ];
});
_c16 = SidebarMenuButton;
function SidebarMenuAction({ className, asChild = false, showOnHover = false, ...props }) {
    const Comp = asChild ? __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Slot$3e$__["Slot"].Root : "button";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Comp, {
        "data-slot": "sidebar-menu-action",
        "data-sidebar": "menu-action",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform peer-hover/menu-button:text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0", // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden", "peer-data-[size=sm]/menu-button:top-1", "peer-data-[size=default]/menu-button:top-1.5", "peer-data-[size=lg]/menu-button:top-2.5", "group-data-[collapsible=icon]:hidden", showOnHover && "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground data-[state=open]:opacity-100 md:opacity-0", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 548,
        columnNumber: 5
    }, this);
}
_c17 = SidebarMenuAction;
function SidebarMenuBadge({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "sidebar-menu-badge",
        "data-sidebar": "menu-badge",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium text-sidebar-foreground tabular-nums select-none", "peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground", "group-data-[collapsible=icon]:hidden", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 573,
        columnNumber: 5
    }, this);
}
_c18 = SidebarMenuBadge;
function SidebarMenuSkeleton({ className, showIcon = false, ...props }) {
    _s5();
    // Random width between 50 to 90%.
    const [width] = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"]({
        "SidebarMenuSkeleton.useState": ()=>{
            return `${Math.floor(Math.random() * 40) + 50}%`;
        }
    }["SidebarMenuSkeleton.useState"]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "sidebar-menu-skeleton",
        "data-sidebar": "menu-skeleton",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex h-8 items-center gap-2 rounded-md px-2", className),
        ...props,
        children: [
            showIcon && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                className: "size-4 rounded-md",
                "data-sidebar": "menu-skeleton-icon"
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
                lineNumber: 607,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                className: "h-4 max-w-(--skeleton-width) flex-1",
                "data-sidebar": "menu-skeleton-text",
                style: {
                    "--skeleton-width": width
                }
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
                lineNumber: 612,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 600,
        columnNumber: 5
    }, this);
}
_s5(SidebarMenuSkeleton, "O6YACBZo7v/1SGvdGvYfDKLxpwg=");
_c19 = SidebarMenuSkeleton;
function SidebarMenuSub({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
        "data-slot": "sidebar-menu-sub",
        "data-sidebar": "menu-sub",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5", "group-data-[collapsible=icon]:hidden", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 627,
        columnNumber: 5
    }, this);
}
_c20 = SidebarMenuSub;
function SidebarMenuSubItem({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
        "data-slot": "sidebar-menu-sub-item",
        "data-sidebar": "menu-sub-item",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("group/menu-sub-item relative", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 645,
        columnNumber: 5
    }, this);
}
_c21 = SidebarMenuSubItem;
function SidebarMenuSubButton({ asChild = false, size = "md", isActive = false, className, ...props }) {
    const Comp = asChild ? __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Slot$3e$__["Slot"].Root : "a";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Comp, {
        "data-slot": "sidebar-menu-sub-button",
        "data-sidebar": "menu-sub-button",
        "data-size": size,
        "data-active": isActive,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground", "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground", size === "sm" && "text-xs", size === "md" && "text-sm", "group-data-[collapsible=icon]:hidden", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/sidebar.tsx",
        lineNumber: 668,
        columnNumber: 5
    }, this);
}
_c22 = SidebarMenuSubButton;
;
var _c, _c1, _c2, _c3, _c4, _c5, _c6, _c7, _c8, _c9, _c10, _c11, _c12, _c13, _c14, _c15, _c16, _c17, _c18, _c19, _c20, _c21, _c22;
__turbopack_context__.k.register(_c, "SidebarProvider");
__turbopack_context__.k.register(_c1, "Sidebar");
__turbopack_context__.k.register(_c2, "SidebarTrigger");
__turbopack_context__.k.register(_c3, "SidebarRail");
__turbopack_context__.k.register(_c4, "SidebarInset");
__turbopack_context__.k.register(_c5, "SidebarInput");
__turbopack_context__.k.register(_c6, "SidebarHeader");
__turbopack_context__.k.register(_c7, "SidebarFooter");
__turbopack_context__.k.register(_c8, "SidebarSeparator");
__turbopack_context__.k.register(_c9, "SidebarContent");
__turbopack_context__.k.register(_c10, "SidebarGroup");
__turbopack_context__.k.register(_c11, "SidebarGroupLabel");
__turbopack_context__.k.register(_c12, "SidebarGroupAction");
__turbopack_context__.k.register(_c13, "SidebarGroupContent");
__turbopack_context__.k.register(_c14, "SidebarMenu");
__turbopack_context__.k.register(_c15, "SidebarMenuItem");
__turbopack_context__.k.register(_c16, "SidebarMenuButton");
__turbopack_context__.k.register(_c17, "SidebarMenuAction");
__turbopack_context__.k.register(_c18, "SidebarMenuBadge");
__turbopack_context__.k.register(_c19, "SidebarMenuSkeleton");
__turbopack_context__.k.register(_c20, "SidebarMenuSub");
__turbopack_context__.k.register(_c21, "SidebarMenuSubItem");
__turbopack_context__.k.register(_c22, "SidebarMenuSubButton");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/hooks/OpenThreadCountContext.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "OpenThreadCountProvider",
    ()=>OpenThreadCountProvider,
    "useOpenThreadCountOverride",
    ()=>useOpenThreadCountOverride
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
const OpenThreadCountContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])(null);
function OpenThreadCountProvider({ children }) {
    _s();
    const [override, setOverrideState] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const setOverride = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "OpenThreadCountProvider.useCallback[setOverride]": (count)=>{
            setOverrideState(count);
        }
    }["OpenThreadCountProvider.useCallback[setOverride]"], []);
    const value = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "OpenThreadCountProvider.useMemo[value]": ()=>({
                override,
                setOverride
            })
    }["OpenThreadCountProvider.useMemo[value]"], [
        override,
        setOverride
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(OpenThreadCountContext.Provider, {
        value: value,
        children: children
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/hooks/OpenThreadCountContext.tsx",
        lineNumber: 24,
        columnNumber: 5
    }, this);
}
_s(OpenThreadCountProvider, "3DNOCLzw4qksF2LuLEdFVjOZ3mc=");
_c = OpenThreadCountProvider;
function useOpenThreadCountOverride() {
    const ctx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["use"])(OpenThreadCountContext);
    if (!ctx) {
        throw new Error("useOpenThreadCountOverride must be used inside OpenThreadCountProvider");
    }
    return ctx;
}
var _c;
__turbopack_context__.k.register(_c, "OpenThreadCountProvider");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/lib/api/fetcher.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ApiRequestError",
    ()=>ApiRequestError,
    "errorMessageFromPayload",
    ()=>errorMessageFromPayload,
    "errorMessageFromUnknown",
    ()=>errorMessageFromUnknown,
    "fetcher",
    ()=>fetcher,
    "isApiRequestError",
    ()=>isApiRequestError,
    "readJsonResponse",
    ()=>readJsonResponse,
    "requestJson",
    ()=>requestJson,
    "requestOk",
    ()=>requestOk
]);
class ApiRequestError extends Error {
    status;
    payload;
    constructor(message, status, payload){
        super(message), this.status = status, this.payload = payload;
        this.name = 'ApiRequestError';
    }
}
async function readJsonResponse(response) {
    try {
        return await response.json();
    } catch  {
        return null;
    }
}
function formatErrorValue(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
        return value.map(formatErrorValue).filter(Boolean).join('; ') || null;
    }
    if (value && typeof value === 'object') {
        const messages = Object.entries(value).flatMap(([key, nested])=>{
            const text = formatErrorValue(nested);
            return text ? [
                `${key}: ${text}`
            ] : [];
        });
        return messages.join('; ') || null;
    }
    return null;
}
function errorMessageFromPayload(payload, fallback) {
    if (payload && typeof payload === 'object') {
        const message = formatErrorValue(payload.error);
        if (message) return message;
    }
    return fallback;
}
function errorMessageFromUnknown(error, fallback) {
    return error instanceof Error && error.message ? error.message : fallback;
}
function isApiRequestError(error, status) {
    return error instanceof ApiRequestError && (status === undefined || error.status === status);
}
async function requestJson(url, init = {}, fallbackError) {
    const response = await fetch(url, init);
    const payload = await readJsonResponse(response);
    const fallback = fallbackError ?? `API error: ${response.status} ${response.statusText}`.trim();
    if (!response.ok) {
        throw new ApiRequestError(errorMessageFromPayload(payload, fallback), response.status, payload);
    }
    if (!payload) {
        throw new ApiRequestError(fallbackError ?? 'API response was not valid JSON.', response.status, payload);
    }
    return payload;
}
async function requestOk(url, init = {}, fallbackError) {
    const response = await fetch(url, init);
    if (response.ok) return;
    const payload = await readJsonResponse(response);
    const fallback = fallbackError ?? `API error: ${response.status} ${response.statusText}`.trim();
    throw new ApiRequestError(errorMessageFromPayload(payload, fallback), response.status, payload);
}
const fetcher = (url)=>requestJson(url);
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/hooks/useThreads.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useOpenThreadCountQuery",
    ()=>useOpenThreadCountQuery,
    "useThreads",
    ()=>useThreads
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/swr/dist/index/index.mjs [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/fetcher.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature(), _s2 = __turbopack_context__.k.signature();
;
;
;
function useIsDocumentVisible() {
    _s();
    const [isVisible, setIsVisible] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(typeof document !== 'undefined' ? document.visibilityState === 'visible' : true);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useIsDocumentVisible.useEffect": ()=>{
            const handler = {
                "useIsDocumentVisible.useEffect.handler": ()=>setIsVisible(document.visibilityState === 'visible')
            }["useIsDocumentVisible.useEffect.handler"];
            document.addEventListener('visibilitychange', handler);
            return ({
                "useIsDocumentVisible.useEffect": ()=>document.removeEventListener('visibilitychange', handler)
            })["useIsDocumentVisible.useEffect"];
        }
    }["useIsDocumentVisible.useEffect"], []);
    return isVisible;
}
_s(useIsDocumentVisible, "p0+kq8Bd0DSYONfiPynTezO0a7Q=");
function useThreads(status = 'open', fallbackData, enabled = true, preview = false) {
    _s1();
    const isVisible = useIsDocumentVisible();
    const key = enabled ? `/api/threads?status=${status}${preview ? '&preview=true' : ''}` : null;
    const baseInterval = status === 'open' ? 15000 : 60000;
    const fbData = fallbackData ? {
        threads: fallbackData,
        nextCursor: null
    } : undefined;
    const { data, error, isLoading, mutate: swrMutate } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"])(key, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetcher"], {
        refreshInterval: isVisible ? baseInterval : 0,
        fallbackData: fbData
    });
    const mutate = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useThreads.useCallback[mutate]": async (updater, revalidate = true)=>{
            if (updater === undefined) {
                const result = await swrMutate();
                return result?.threads;
            }
            const result = await swrMutate({
                threads: updater,
                nextCursor: data?.nextCursor ?? null
            }, revalidate);
            return result?.threads;
        }
    }["useThreads.useCallback[mutate]"], [
        swrMutate,
        data?.nextCursor
    ]);
    return {
        threads: data?.threads ?? [],
        isLoading,
        error,
        mutate
    };
}
_s1(useThreads, "9U72wY1M6U0C5o1s/DuXSb9k4x8=", false, function() {
    return [
        useIsDocumentVisible,
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"]
    ];
});
function useOpenThreadCountQuery(enabled = true) {
    _s2();
    const isVisible = useIsDocumentVisible();
    const { data, error, isLoading, mutate } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"])(enabled ? '/api/threads?status=open&count=true' : null, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetcher"], {
        refreshInterval: isVisible ? 15000 : 0
    });
    return {
        count: data?.count ?? 0,
        isLoading,
        error,
        mutate
    };
}
_s2(useOpenThreadCountQuery, "rIqE/PizBPUig45D6u17oJh8+No=", false, function() {
    return [
        useIsDocumentVisible,
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/lib/agent/autonomy-tiers.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AUTONOMY_TIERS",
    ()=>AUTONOMY_TIERS,
    "effectiveRefundCap",
    ()=>effectiveRefundCap,
    "formatRefundCapSummary",
    ()=>formatRefundCapSummary,
    "visibleAutonomyTiers",
    ()=>visibleAutonomyTiers
]);
const AUTONOMY_TIERS = [
    {
        id: "watch",
        label: "Draft only",
        cap: 0,
        blurb: "Never sends replies or acts on Shopify. I draft everything for you.",
        merchantFacing: true
    },
    {
        id: "guarded",
        label: "Ask first",
        cap: 50,
        blurb: "Default. I plan each reply and action, then wait for your OK.",
        recommended: true,
        merchantFacing: true
    },
    {
        id: "trusted",
        label: "Trusted",
        cap: 100,
        blurb: "Explicit opt-in. I can send simple replies on my own; refunds and cancellations still need approval.",
        merchantFacing: true
    },
    {
        id: "broad",
        label: "Broad",
        cap: 250,
        blurb: "Refunds up to $250, bulk quotes, custom discount codes.",
        comingSoon: true
    },
    {
        id: "full",
        label: "Full auto",
        cap: 1000,
        blurb: "I act on anything in policy. You only see exceptions.",
        comingSoon: true
    }
];
const MERCHANT_TIER_IDS = new Set(AUTONOMY_TIERS.filter((option)=>option.merchantFacing).map((option)=>option.id));
function visibleAutonomyTiers(currentTier) {
    const merchantTiers = AUTONOMY_TIERS.filter((option)=>option.merchantFacing);
    if (!currentTier || MERCHANT_TIER_IDS.has(currentTier)) return merchantTiers;
    const legacyTier = AUTONOMY_TIERS.find((option)=>option.id === currentTier);
    return legacyTier ? [
        ...merchantTiers,
        legacyTier
    ] : merchantTiers;
}
function effectiveRefundCap(settings) {
    if (settings.maxRefundAmount != null) return settings.maxRefundAmount;
    return AUTONOMY_TIERS.find((option)=>option.id === settings.autonomyTier)?.cap ?? 50;
}
function formatRefundCapSummary(settings) {
    const cap = effectiveRefundCap(settings);
    if (cap === 0) return "no refunds without your OK";
    return `refunds up to $${cap}`;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/AutonomyPill.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AutonomyPill
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bot$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Bot$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/bot.js [app-client] (ecmascript) <export default as Bot>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$agent$2f$autonomy$2d$tiers$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/agent/autonomy-tiers.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/ui/cn.ts [app-client] (ecmascript)");
"use client";
;
;
;
;
;
const TIER_TINTS = {
    watch: "border-yellow-300/25 bg-yellow-300/10 text-yellow-200 hover:bg-yellow-300/[0.14]",
    guarded: "border-sky-300/25 bg-sky-300/10 text-sky-200 hover:bg-sky-300/[0.14]",
    trusted: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200 hover:bg-emerald-300/[0.14]",
    broad: "border-violet-300/25 bg-violet-300/10 text-violet-200 hover:bg-violet-300/[0.14]",
    full: "border-rose-300/25 bg-rose-300/10 text-rose-200 hover:bg-rose-300/[0.14]"
};
function AutonomyPill({ tier, compact = false, className }) {
    const label = __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$agent$2f$autonomy$2d$tiers$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AUTONOMY_TIERS"].find((option)=>option.id === tier)?.label ?? tier;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
        href: "/dashboard/settings?tab=agent#autonomy",
        "aria-label": `Trust level: ${label}`,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("inline-flex items-center gap-1.5 rounded-full border font-semibold transition-colors", "min-w-0 max-w-full", compact ? "px-2.5 py-1 text-xs" : "px-2.5 py-1.5 text-xs", TIER_TINTS[tier], className),
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bot$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Bot$3e$__["Bot"], {
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("shrink-0", compact ? "size-3.5" : "size-4")
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/AutonomyPill.tsx",
                lineNumber: 38,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "truncate",
                children: [
                    "Trust level: ",
                    label
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/AutonomyPill.tsx",
                lineNumber: 39,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/AutonomyPill.tsx",
        lineNumber: 27,
        columnNumber: 5
    }, this);
}
_c = AutonomyPill;
var _c;
__turbopack_context__.k.register(_c, "AutonomyPill");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/sidebar/sidebar-helpers.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "dispatchNavProgressStart",
    ()=>dispatchNavProgressStart,
    "formatOpenCount",
    ()=>formatOpenCount,
    "isRouteActive",
    ()=>isRouteActive,
    "mobileTabs",
    ()=>mobileTabs
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$box$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Box$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/box.js [app-client] (ecmascript) <export default as Box>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$inbox$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Inbox$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/inbox.js [app-client] (ecmascript) <export default as Inbox>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/settings.js [app-client] (ecmascript) <export default as Settings>");
;
const mobileTabs = [
    {
        name: "Inbox",
        href: "/dashboard/tickets",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$inbox$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Inbox$3e$__["Inbox"],
        badge: true
    },
    {
        name: "Orders",
        href: "/dashboard/orders",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$box$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Box$3e$__["Box"],
        badge: false
    },
    {
        name: "Settings",
        href: "/dashboard/settings",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__["Settings"],
        badge: false
    }
];
function isRouteActive(pathname, href) {
    return pathname === href || href !== "/dashboard" && pathname.startsWith(`${href}/`);
}
function formatOpenCount(openCount) {
    return openCount > 9 ? "9+" : openCount;
}
function dispatchNavProgressStart() {
    window.dispatchEvent(new Event("nav-progress-start"));
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/sidebar/Logo.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Logo",
    ()=>Logo
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$store$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Store$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/store.js [app-client] (ecmascript) <export default as Store>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$sidebar$2d$helpers$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/sidebar/sidebar-helpers.ts [app-client] (ecmascript)");
"use client";
;
;
;
;
function Logo() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
        href: "/dashboard",
        className: "flex items-center gap-2 text-foreground",
        onClick: ()=>{
            const pathname = window.location.pathname;
            if (pathname !== "/dashboard") (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$sidebar$2d$helpers$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["dispatchNavProgressStart"])();
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$store$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Store$3e$__["Store"], {
                className: "size-6",
                strokeWidth: 1.75
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/Logo.tsx",
                lineNumber: 17,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "font-display-serif text-xl leading-none",
                children: "shopkeeper"
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/Logo.tsx",
                lineNumber: 18,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/Logo.tsx",
        lineNumber: 9,
        columnNumber: 5
    }, this);
}
_c = Logo;
var _c;
__turbopack_context__.k.register(_c, "Logo");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OpenCountBadge.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "OpenCountBadge",
    ()=>OpenCountBadge
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$sidebar$2d$helpers$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/sidebar/sidebar-helpers.ts [app-client] (ecmascript)");
;
;
function OpenCountBadge({ openCount, className, animate = false }) {
    if (openCount <= 0) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        className: className,
        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$sidebar$2d$helpers$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatOpenCount"])(openCount)
    }, animate ? openCount : "open-count", false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OpenCountBadge.tsx",
        lineNumber: 15,
        columnNumber: 5
    }, this);
}
_c = OpenCountBadge;
var _c;
__turbopack_context__.k.register(_c, "OpenCountBadge");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileBottomBar.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MobileBottomBar",
    ()=>MobileBottomBar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/ui/cn.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$OpenCountBadge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OpenCountBadge.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$sidebar$2d$helpers$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/sidebar/sidebar-helpers.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
function MobileBottomBar({ openCount, agentName }) {
    _s();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-dashboard-mobile-bottom-bar": true,
        className: "md:hidden fixed bottom-0 inset-x-0 z-40 bg-neutral-950 border-t border-white/[0.08] flex items-stretch",
        children: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$sidebar$2d$helpers$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["mobileTabs"].map((tab)=>{
            const isActive = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$sidebar$2d$helpers$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isRouteActive"])(pathname, tab.href);
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                href: tab.href,
                onClick: (e)=>{
                    if (isActive) {
                        e.preventDefault();
                        return;
                    }
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$sidebar$2d$helpers$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["dispatchNavProgressStart"])();
                },
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex-1 flex flex-col items-center justify-center gap-1 py-2.5 relative transition-colors", isActive ? "text-white" : "text-white/70"),
                children: [
                    isActive && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-sky-400"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileBottomBar.tsx",
                        lineNumber: 36,
                        columnNumber: 26
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "relative",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(tab.icon, {
                                className: "size-5"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileBottomBar.tsx",
                                lineNumber: 38,
                                columnNumber: 15
                            }, this),
                            tab.badge && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$OpenCountBadge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OpenCountBadge"], {
                                openCount: openCount,
                                className: "absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full text-xs font-bold flex items-center justify-center bg-green-400 text-black tabular-nums leading-none"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileBottomBar.tsx",
                                lineNumber: 40,
                                columnNumber: 17
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileBottomBar.tsx",
                        lineNumber: 37,
                        columnNumber: 13
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs font-medium leading-none",
                        children: tab.href === "/dashboard/agent" ? agentName : tab.name
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileBottomBar.tsx",
                        lineNumber: 46,
                        columnNumber: 13
                    }, this)
                ]
            }, tab.name, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileBottomBar.tsx",
                lineNumber: 21,
                columnNumber: 11
            }, this);
        })
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileBottomBar.tsx",
        lineNumber: 13,
        columnNumber: 5
    }, this);
}
_s(MobileBottomBar, "xbyQPtUVMO7MNj7WjJlpdWqRcTo=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"]
    ];
});
_c = MobileBottomBar;
var _c;
__turbopack_context__.k.register(_c, "MobileBottomBar");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/nav-items.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "footerNavItems",
    ()=>footerNavItems,
    "navSections",
    ()=>navSections
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$inbox$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Inbox$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/inbox.js [app-client] (ecmascript) <export default as Inbox>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$users$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Users$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/users.js [app-client] (ecmascript) <export default as Users>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bot$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Bot$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/bot.js [app-client] (ecmascript) <export default as Bot>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/settings.js [app-client] (ecmascript) <export default as Settings>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$box$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Box$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/box.js [app-client] (ecmascript) <export default as Box>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$cable$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Cable$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/cable.js [app-client] (ecmascript) <export default as Cable>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$brain$2d$circuit$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__BrainCircuit$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/brain-circuit.js [app-client] (ecmascript) <export default as BrainCircuit>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$id$2d$card$2d$lanyard$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__IdCardLanyard$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/id-card-lanyard.js [app-client] (ecmascript) <export default as IdCardLanyard>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$house$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Home$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/house.js [app-client] (ecmascript) <export default as Home>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$scan$2d$eye$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ScanEye$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/scan-eye.js [app-client] (ecmascript) <export default as ScanEye>");
;
const navSections = [
    [
        {
            name: "Home",
            href: "/dashboard",
            icon: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$house$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Home$3e$__["Home"]
        },
        {
            name: "Inbox",
            href: "/dashboard/tickets",
            icon: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$inbox$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Inbox$3e$__["Inbox"],
            badge: true
        },
        {
            name: "Concierge",
            href: "/dashboard/agent",
            icon: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bot$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Bot$3e$__["Bot"]
        },
        {
            name: "Orders",
            href: "/dashboard/orders",
            icon: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$box$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Box$3e$__["Box"]
        },
        {
            name: "Customers",
            href: "/dashboard/customers",
            icon: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$users$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Users$3e$__["Users"]
        }
    ],
    [
        {
            name: "Memory",
            href: "/dashboard/kb",
            icon: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$brain$2d$circuit$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__BrainCircuit$3e$__["BrainCircuit"]
        },
        {
            name: "Review",
            href: "/dashboard/review",
            icon: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$scan$2d$eye$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ScanEye$3e$__["ScanEye"]
        },
        {
            name: "Team",
            href: "/dashboard/team",
            icon: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$id$2d$card$2d$lanyard$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__IdCardLanyard$3e$__["IdCardLanyard"]
        },
        {
            name: "Integrations",
            href: "/dashboard/integrations",
            icon: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$cable$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Cable$3e$__["Cable"]
        }
    ]
];
const footerNavItems = [
    {
        name: "Settings",
        href: "/dashboard/settings",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__["Settings"]
    }
];
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/sidebar/FooterLinks.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "FooterLinks",
    ()=>FooterLinks
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/ui/cn.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$nav$2d$items$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/nav-items.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$sidebar$2d$helpers$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/sidebar/sidebar-helpers.ts [app-client] (ecmascript)");
"use client";
;
;
;
;
;
function FooterLinks({ pathname, onNavigate, variant }) {
    const isMobile = variant === "mobile";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$nav$2d$items$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["footerNavItems"].map((item)=>{
            const isActive = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$sidebar$2d$helpers$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isRouteActive"])(pathname, item.href);
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                href: item.href,
                onClick: (e)=>onNavigate(e, isActive),
                title: item.name,
                "aria-label": item.name,
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("rounded-md transition-colors shrink-0", isMobile ? "p-2.5 rounded-lg" : "p-1.5", isActive ? isMobile ? "text-white bg-white/[0.15]" : "text-white bg-white/[0.08]" : "text-white/30 hover:text-white/70 hover:bg-white/[0.05]"),
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(item.icon, {
                    className: isMobile ? "size-[18px]" : "size-[15px]"
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/FooterLinks.tsx",
                    lineNumber: 42,
                    columnNumber: 13
                }, this)
            }, item.name, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/FooterLinks.tsx",
                lineNumber: 26,
                columnNumber: 11
            }, this);
        })
    }, void 0, false);
}
_c = FooterLinks;
var _c;
__turbopack_context__.k.register(_c, "FooterLinks");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/sidebar/NavGroupList.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "NavGroupList",
    ()=>NavGroupList
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sidebar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/sidebar.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/ui/cn.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$nav$2d$items$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/nav-items.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$OpenCountBadge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OpenCountBadge.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$sidebar$2d$helpers$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/sidebar/sidebar-helpers.ts [app-client] (ecmascript)");
"use client";
;
;
;
;
;
;
;
function NavGroupList({ pathname, openCount, onNavigate, variant, agentName }) {
    // The agent is listed by its configured name, like any other teammate.
    const itemLabel = (item)=>item.href === "/dashboard/agent" ? agentName : item.name;
    if (variant === "mobile") {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
            children: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$nav$2d$items$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["navSections"].map((items, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: i > 0 ? "mt-3 pt-3 border-t border-border" : "",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-col gap-0.5",
                        children: items.map((item)=>{
                            const isActive = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$sidebar$2d$helpers$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isRouteActive"])(pathname, item.href);
                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                href: item.href,
                                onClick: (e)=>onNavigate(e, isActive),
                                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex items-center gap-3 px-3 py-2 rounded-lg transition-colors", isActive ? "bg-white/[0.12] text-white font-medium" : "text-white/60 hover:text-white hover:bg-white/[0.06]"),
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(item.icon, {
                                        className: "w-[16px] h-[18px] shrink-0 mr-1 stroke-1"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/NavGroupList.tsx",
                                        lineNumber: 52,
                                        columnNumber: 21
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-sm",
                                        children: itemLabel(item)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/NavGroupList.tsx",
                                        lineNumber: 53,
                                        columnNumber: 21
                                    }, this),
                                    item.badge && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$OpenCountBadge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OpenCountBadge"], {
                                        openCount: openCount,
                                        className: "ml-auto min-w-[20px] h-5 px-1.5 rounded-lg text-xs font-bold flex items-center justify-center bg-green-400 text-black tabular-nums"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/NavGroupList.tsx",
                                        lineNumber: 55,
                                        columnNumber: 23
                                    }, this)
                                ]
                            }, item.name, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/NavGroupList.tsx",
                                lineNumber: 43,
                                columnNumber: 19
                            }, this);
                        })
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/NavGroupList.tsx",
                        lineNumber: 38,
                        columnNumber: 13
                    }, this)
                }, i, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/NavGroupList.tsx",
                    lineNumber: 37,
                    columnNumber: 11
                }, this))
        }, void 0, false);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$nav$2d$items$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["navSections"].map((items, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: i > 0 ? "mt-3 pt-3 border-t border-border" : "",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sidebar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SidebarMenu"], {
                    children: items.map((item)=>{
                        const isActive = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$sidebar$2d$helpers$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isRouteActive"])(pathname, item.href);
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sidebar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SidebarMenuItem"], {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sidebar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SidebarMenuButton"], {
                                    asChild: true,
                                    isActive: isActive,
                                    className: "rounded-md h-auto py-1.5 px-3 text-sm font-light leading-snug text-white/60 hover:text-white hover:bg-white/[0.05] data-[active=true]:bg-white/[0.06] data-[active=true]:text-white data-[active=true]:font-medium",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                        href: item.href,
                                        onClick: (e)=>onNavigate(e, isActive),
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(item.icon, {
                                                className: "size-[10px] shrink-0 stroke-1 mr-1"
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/NavGroupList.tsx",
                                                lineNumber: 86,
                                                columnNumber: 23
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                children: itemLabel(item)
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/NavGroupList.tsx",
                                                lineNumber: 87,
                                                columnNumber: 23
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/NavGroupList.tsx",
                                        lineNumber: 85,
                                        columnNumber: 21
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/NavGroupList.tsx",
                                    lineNumber: 80,
                                    columnNumber: 19
                                }, this),
                                item.badge && openCount > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sidebar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SidebarMenuBadge"], {
                                    className: "pointer-events-none",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$OpenCountBadge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OpenCountBadge"], {
                                        openCount: openCount,
                                        animate: true,
                                        className: "min-w-[20px] h-5 px-1.5 rounded-lg text-xs font-bold flex items-center justify-center bg-green-400 text-black tabular-nums animate-in zoom-in-75 duration-150"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/NavGroupList.tsx",
                                        lineNumber: 92,
                                        columnNumber: 23
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/NavGroupList.tsx",
                                    lineNumber: 91,
                                    columnNumber: 21
                                }, this)
                            ]
                        }, item.name, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/NavGroupList.tsx",
                            lineNumber: 79,
                            columnNumber: 17
                        }, this);
                    })
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/NavGroupList.tsx",
                    lineNumber: 74,
                    columnNumber: 11
                }, this)
            }, i, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/NavGroupList.tsx",
                lineNumber: 73,
                columnNumber: 9
            }, this))
    }, void 0, false);
}
_c = NavGroupList;
var _c;
__turbopack_context__.k.register(_c, "NavGroupList");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/components/ui/avatar.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Avatar",
    ()=>Avatar,
    "AvatarBadge",
    ()=>AvatarBadge,
    "AvatarFallback",
    ()=>AvatarFallback,
    "AvatarGroup",
    ()=>AvatarGroup,
    "AvatarGroupCount",
    ()=>AvatarGroupCount,
    "AvatarImage",
    ()=>AvatarImage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$avatar$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Avatar$3e$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-avatar/dist/index.mjs [app-client] (ecmascript) <export * as Avatar>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/ui/cn.ts [app-client] (ecmascript)");
"use client";
;
;
;
function Avatar({ className, size = "default", ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$avatar$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Avatar$3e$__["Avatar"].Root, {
        "data-slot": "avatar",
        "data-size": size,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("group/avatar relative flex size-8 shrink-0 overflow-hidden rounded-full select-none data-[size=lg]:size-10 data-[size=sm]:size-6", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/avatar.tsx",
        lineNumber: 16,
        columnNumber: 5
    }, this);
}
_c = Avatar;
function AvatarImage({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$avatar$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Avatar$3e$__["Avatar"].Image, {
        "data-slot": "avatar-image",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("aspect-square size-full", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/avatar.tsx",
        lineNumber: 33,
        columnNumber: 5
    }, this);
}
_c1 = AvatarImage;
function AvatarFallback({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$avatar$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Avatar$3e$__["Avatar"].Fallback, {
        "data-slot": "avatar-fallback",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/avatar.tsx",
        lineNumber: 46,
        columnNumber: 5
    }, this);
}
_c2 = AvatarFallback;
function AvatarBadge({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        "data-slot": "avatar-badge",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background select-none", "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden", "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2", "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/avatar.tsx",
        lineNumber: 59,
        columnNumber: 5
    }, this);
}
_c3 = AvatarBadge;
function AvatarGroup({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "avatar-group",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/avatar.tsx",
        lineNumber: 75,
        columnNumber: 5
    }, this);
}
_c4 = AvatarGroup;
function AvatarGroupCount({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "avatar-group-count",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/avatar.tsx",
        lineNumber: 91,
        columnNumber: 5
    }, this);
}
_c5 = AvatarGroupCount;
;
var _c, _c1, _c2, _c3, _c4, _c5;
__turbopack_context__.k.register(_c, "Avatar");
__turbopack_context__.k.register(_c1, "AvatarImage");
__turbopack_context__.k.register(_c2, "AvatarFallback");
__turbopack_context__.k.register(_c3, "AvatarBadge");
__turbopack_context__.k.register(_c4, "AvatarGroup");
__turbopack_context__.k.register(_c5, "AvatarGroupCount");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/components/OrgAvatar.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "OrgAvatar",
    ()=>OrgAvatar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$avatar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/avatar.tsx [app-client] (ecmascript)");
;
;
function OrgAvatar({ name, imageUrl, className = '' }) {
    const initials = name ? name.split(" ").map((n)=>n[0]).join("").toUpperCase().slice(0, 2) : '?';
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$avatar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Avatar"], {
        className: className,
        children: [
            imageUrl && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$avatar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AvatarImage"], {
                src: imageUrl,
                alt: name ?? ''
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/components/OrgAvatar.tsx",
                lineNumber: 15,
                columnNumber: 20
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$avatar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AvatarFallback"], {
                children: initials
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/components/OrgAvatar.tsx",
                lineNumber: 16,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/components/OrgAvatar.tsx",
        lineNumber: 14,
        columnNumber: 5
    }, this);
}
_c = OrgAvatar;
var _c;
__turbopack_context__.k.register(_c, "OrgAvatar");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DropdownMenu",
    ()=>DropdownMenu,
    "DropdownMenuCheckboxItem",
    ()=>DropdownMenuCheckboxItem,
    "DropdownMenuContent",
    ()=>DropdownMenuContent,
    "DropdownMenuGroup",
    ()=>DropdownMenuGroup,
    "DropdownMenuItem",
    ()=>DropdownMenuItem,
    "DropdownMenuLabel",
    ()=>DropdownMenuLabel,
    "DropdownMenuPortal",
    ()=>DropdownMenuPortal,
    "DropdownMenuRadioGroup",
    ()=>DropdownMenuRadioGroup,
    "DropdownMenuRadioItem",
    ()=>DropdownMenuRadioItem,
    "DropdownMenuSeparator",
    ()=>DropdownMenuSeparator,
    "DropdownMenuShortcut",
    ()=>DropdownMenuShortcut,
    "DropdownMenuSub",
    ()=>DropdownMenuSub,
    "DropdownMenuSubContent",
    ()=>DropdownMenuSubContent,
    "DropdownMenuSubTrigger",
    ()=>DropdownMenuSubTrigger,
    "DropdownMenuTrigger",
    ()=>DropdownMenuTrigger
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckIcon$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/check.js [app-client] (ecmascript) <export default as CheckIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRightIcon$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/chevron-right.js [app-client] (ecmascript) <export default as ChevronRightIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CircleIcon$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/circle.js [app-client] (ecmascript) <export default as CircleIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__DropdownMenu$3e$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-dropdown-menu/dist/index.mjs [app-client] (ecmascript) <export * as DropdownMenu>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/ui/cn.ts [app-client] (ecmascript)");
"use client";
;
;
;
;
function DropdownMenu({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__DropdownMenu$3e$__["DropdownMenu"].Root, {
        "data-slot": "dropdown-menu",
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx",
        lineNumber: 12,
        columnNumber: 10
    }, this);
}
_c = DropdownMenu;
function DropdownMenuPortal({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__DropdownMenu$3e$__["DropdownMenu"].Portal, {
        "data-slot": "dropdown-menu-portal",
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx",
        lineNumber: 19,
        columnNumber: 5
    }, this);
}
_c1 = DropdownMenuPortal;
function DropdownMenuTrigger({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__DropdownMenu$3e$__["DropdownMenu"].Trigger, {
        "data-slot": "dropdown-menu-trigger",
        suppressHydrationWarning: true,
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx",
        lineNumber: 27,
        columnNumber: 5
    }, this);
}
_c2 = DropdownMenuTrigger;
function DropdownMenuContent({ className, sideOffset = 4, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__DropdownMenu$3e$__["DropdownMenu"].Portal, {
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__DropdownMenu$3e$__["DropdownMenu"].Content, {
            "data-slot": "dropdown-menu-content",
            sideOffset: sideOffset,
            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95", className),
            ...props
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx",
            lineNumber: 42,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx",
        lineNumber: 41,
        columnNumber: 5
    }, this);
}
_c3 = DropdownMenuContent;
function DropdownMenuGroup({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__DropdownMenu$3e$__["DropdownMenu"].Group, {
        "data-slot": "dropdown-menu-group",
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx",
        lineNumber: 59,
        columnNumber: 5
    }, this);
}
_c4 = DropdownMenuGroup;
function DropdownMenuItem({ className, inset, variant = "default", ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__DropdownMenu$3e$__["DropdownMenu"].Item, {
        "data-slot": "dropdown-menu-item",
        "data-inset": inset,
        "data-variant": variant,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground data-[variant=destructive]:*:[svg]:text-destructive!", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx",
        lineNumber: 73,
        columnNumber: 5
    }, this);
}
_c5 = DropdownMenuItem;
function DropdownMenuCheckboxItem({ className, children, checked, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__DropdownMenu$3e$__["DropdownMenu"].CheckboxItem, {
        "data-slot": "dropdown-menu-checkbox-item",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4", className),
        checked: checked,
        ...props,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "pointer-events-none absolute left-2 flex size-3.5 items-center justify-center",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__DropdownMenu$3e$__["DropdownMenu"].ItemIndicator, {
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckIcon$3e$__["CheckIcon"], {
                        className: "size-4"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx",
                        lineNumber: 104,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx",
                    lineNumber: 103,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx",
                lineNumber: 102,
                columnNumber: 7
            }, this),
            children
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx",
        lineNumber: 93,
        columnNumber: 5
    }, this);
}
_c6 = DropdownMenuCheckboxItem;
function DropdownMenuRadioGroup({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__DropdownMenu$3e$__["DropdownMenu"].RadioGroup, {
        "data-slot": "dropdown-menu-radio-group",
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx",
        lineNumber: 116,
        columnNumber: 5
    }, this);
}
_c7 = DropdownMenuRadioGroup;
function DropdownMenuRadioItem({ className, children, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__DropdownMenu$3e$__["DropdownMenu"].RadioItem, {
        "data-slot": "dropdown-menu-radio-item",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4", className),
        ...props,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "pointer-events-none absolute left-2 flex size-3.5 items-center justify-center",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__DropdownMenu$3e$__["DropdownMenu"].ItemIndicator, {
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CircleIcon$3e$__["CircleIcon"], {
                        className: "size-2 fill-current"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx",
                        lineNumber: 139,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx",
                    lineNumber: 138,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx",
                lineNumber: 137,
                columnNumber: 7
            }, this),
            children
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx",
        lineNumber: 129,
        columnNumber: 5
    }, this);
}
_c8 = DropdownMenuRadioItem;
function DropdownMenuLabel({ className, inset, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__DropdownMenu$3e$__["DropdownMenu"].Label, {
        "data-slot": "dropdown-menu-label",
        "data-inset": inset,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("px-2 py-1.5 text-sm font-medium data-[inset]:pl-8", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx",
        lineNumber: 155,
        columnNumber: 5
    }, this);
}
_c9 = DropdownMenuLabel;
function DropdownMenuSeparator({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__DropdownMenu$3e$__["DropdownMenu"].Separator, {
        "data-slot": "dropdown-menu-separator",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("-mx-1 my-1 h-px bg-border", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx",
        lineNumber: 172,
        columnNumber: 5
    }, this);
}
_c10 = DropdownMenuSeparator;
function DropdownMenuShortcut({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        "data-slot": "dropdown-menu-shortcut",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("ml-auto text-xs tracking-widest text-muted-foreground", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx",
        lineNumber: 185,
        columnNumber: 5
    }, this);
}
_c11 = DropdownMenuShortcut;
function DropdownMenuSub({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__DropdownMenu$3e$__["DropdownMenu"].Sub, {
        "data-slot": "dropdown-menu-sub",
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx",
        lineNumber: 199,
        columnNumber: 10
    }, this);
}
_c12 = DropdownMenuSub;
function DropdownMenuSubTrigger({ className, inset, children, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__DropdownMenu$3e$__["DropdownMenu"].SubTrigger, {
        "data-slot": "dropdown-menu-sub-trigger",
        "data-inset": inset,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[inset]:pl-8 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground", className),
        ...props,
        children: [
            children,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRightIcon$3e$__["ChevronRightIcon"], {
                className: "ml-auto size-4"
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx",
                lineNumber: 221,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx",
        lineNumber: 211,
        columnNumber: 5
    }, this);
}
_c13 = DropdownMenuSubTrigger;
function DropdownMenuSubContent({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__DropdownMenu$3e$__["DropdownMenu"].SubContent, {
        "data-slot": "dropdown-menu-sub-content",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("z-50 min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx",
        lineNumber: 231,
        columnNumber: 5
    }, this);
}
_c14 = DropdownMenuSubContent;
;
var _c, _c1, _c2, _c3, _c4, _c5, _c6, _c7, _c8, _c9, _c10, _c11, _c12, _c13, _c14;
__turbopack_context__.k.register(_c, "DropdownMenu");
__turbopack_context__.k.register(_c1, "DropdownMenuPortal");
__turbopack_context__.k.register(_c2, "DropdownMenuTrigger");
__turbopack_context__.k.register(_c3, "DropdownMenuContent");
__turbopack_context__.k.register(_c4, "DropdownMenuGroup");
__turbopack_context__.k.register(_c5, "DropdownMenuItem");
__turbopack_context__.k.register(_c6, "DropdownMenuCheckboxItem");
__turbopack_context__.k.register(_c7, "DropdownMenuRadioGroup");
__turbopack_context__.k.register(_c8, "DropdownMenuRadioItem");
__turbopack_context__.k.register(_c9, "DropdownMenuLabel");
__turbopack_context__.k.register(_c10, "DropdownMenuSeparator");
__turbopack_context__.k.register(_c11, "DropdownMenuShortcut");
__turbopack_context__.k.register(_c12, "DropdownMenuSub");
__turbopack_context__.k.register(_c13, "DropdownMenuSubTrigger");
__turbopack_context__.k.register(_c14, "DropdownMenuSubContent");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OrgSwitcher.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "OrgSwitcher",
    ()=>OrgSwitcher
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/chevron-down.js [app-client] (ecmascript) <export default as ChevronDown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/plus.js [app-client] (ecmascript) <export default as Plus>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$OrgAvatar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/OrgAvatar.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/ui/cn.ts [app-client] (ecmascript)");
"use client";
;
;
;
;
;
;
function OrgSwitcher({ navAuth, onSwitching, onClose, variant }) {
    const { organization, userMemberships, setActive, mounted, planName, seatCount } = navAuth;
    const isMobile = variant === "mobile";
    const isCompact = variant === "desktop" || variant === "mobileCompact";
    const memberships = userMemberships.data;
    const switchOrganization = async (organizationId)=>{
        if (organizationId === organization?.id || !setActive) return;
        onClose?.();
        onSwitching(true);
        try {
            await setActive({
                organization: organizationId
            });
            window.location.reload();
        } catch (error) {
            console.error("Failed to switch workspace", error);
            onSwitching(false);
        }
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DropdownMenu"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DropdownMenuTrigger"], {
                asChild: true,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    type: "button",
                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("w-full flex items-center outline-none text-left transition-colors hover:bg-white/[0.06]", isMobile ? "gap-2.5 px-3 py-2.5 mb-4 rounded-lg" : "gap-2 p-1 rounded-lg hover:bg-white/[0.04]"),
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$OrgAvatar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OrgAvatar"], {
                            name: organization?.name,
                            imageUrl: organization?.imageUrl,
                            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("rounded-md bg-green-500/20 text-[13px] font-bold text-green-300 shrink-0", isCompact ? "size-6" : "size-9")
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OrgSwitcher.tsx",
                            lineNumber: 65,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex-1 min-w-0",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("font-bold text-white truncate leading-tight", isCompact ? "text-xs" : "text-sm"),
                                    children: organization?.name ?? "Workspace"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OrgSwitcher.tsx",
                                    lineNumber: 74,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-xs font-medium text-white/40 truncate leading-tight mt-0.5",
                                    children: [
                                        planName,
                                        " plan · ",
                                        seatCount,
                                        " seat",
                                        seatCount === 1 ? "" : "s"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OrgSwitcher.tsx",
                                    lineNumber: 77,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OrgSwitcher.tsx",
                            lineNumber: 73,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__["ChevronDown"], {
                            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("text-white/30 shrink-0", isCompact ? "size-3.5" : "size-4")
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OrgSwitcher.tsx",
                            lineNumber: 81,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OrgSwitcher.tsx",
                    lineNumber: 58,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OrgSwitcher.tsx",
                lineNumber: 57,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DropdownMenuContent"], {
                side: "bottom",
                align: "start",
                className: "w-[var(--radix-dropdown-menu-trigger-width)] bg-popover border-white/[0.09] text-white",
                children: [
                    mounted && memberships?.map((mem)=>{
                        const isActive = mem.organization.id === organization?.id;
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DropdownMenuItem"], {
                            onClick: ()=>switchOrganization(mem.organization.id),
                            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex items-center gap-2.5 cursor-pointer focus:bg-white/[0.07]", isActive && "bg-white/[0.04]"),
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$OrgAvatar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OrgAvatar"], {
                                    name: mem.organization.name,
                                    imageUrl: mem.organization.imageUrl,
                                    className: "size-5 rounded bg-white/10 text-xs text-white/70 shrink-0"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OrgSwitcher.tsx",
                                    lineNumber: 102,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "flex-1 text-xs font-medium text-white/80 truncate",
                                    children: mem.organization.name
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OrgSwitcher.tsx",
                                    lineNumber: 107,
                                    columnNumber: 17
                                }, this),
                                isActive && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "size-1.5 rounded-full bg-green-400 shrink-0"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OrgSwitcher.tsx",
                                    lineNumber: 108,
                                    columnNumber: 30
                                }, this)
                            ]
                        }, mem.organization.id, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OrgSwitcher.tsx",
                            lineNumber: 94,
                            columnNumber: 15
                        }, this);
                    }),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DropdownMenuSeparator"], {
                        className: "bg-white/[0.09]"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OrgSwitcher.tsx",
                        lineNumber: 112,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DropdownMenuItem"], {
                        asChild: true,
                        className: "cursor-pointer gap-2 focus:bg-white/[0.07]",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            href: "/create-workspace",
                            onClick: ()=>onClose?.(),
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__["Plus"], {
                                    className: "size-4 shrink-0 text-white/50"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OrgSwitcher.tsx",
                                    lineNumber: 115,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-xs font-medium text-white/80",
                                    children: "Create workspace"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OrgSwitcher.tsx",
                                    lineNumber: 116,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OrgSwitcher.tsx",
                            lineNumber: 114,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OrgSwitcher.tsx",
                        lineNumber: 113,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OrgSwitcher.tsx",
                lineNumber: 84,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OrgSwitcher.tsx",
        lineNumber: 56,
        columnNumber: 5
    }, this);
}
_c = OrgSwitcher;
var _c;
__turbopack_context__.k.register(_c, "OrgSwitcher");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/sidebar/UserMenu.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "UserMenu",
    ()=>UserMenu
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$log$2d$out$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__LogOut$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/log-out.js [app-client] (ecmascript) <export default as LogOut>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2d$round$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__UserRound$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/user-round.js [app-client] (ecmascript) <export default as UserRound>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$OrgAvatar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/OrgAvatar.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/dropdown-menu.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/ui/cn.ts [app-client] (ecmascript)");
"use client";
;
;
;
;
;
;
function UserMenu({ navAuth, variant }) {
    const { user, signOut, fullName, roleLabel } = navAuth;
    const isMobile = variant === "mobile";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DropdownMenu"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DropdownMenuTrigger"], {
                asChild: true,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    type: "button",
                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex items-center gap-2.5 rounded-lg hover:bg-white/[0.08] transition-colors text-left outline-none min-w-0 flex-1", isMobile ? "px-3 py-2.5" : "px-2 py-1.5 hover:bg-white/[0.06]"),
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$OrgAvatar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OrgAvatar"], {
                            name: fullName,
                            imageUrl: user?.imageUrl,
                            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("rounded-full bg-white/20 text-white font-bold ring-1 ring-white/20 shrink-0", isMobile ? "size-8 text-xs" : "size-7 text-xs")
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/UserMenu.tsx",
                            lineNumber: 29,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex-1 min-w-0",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("font-semibold text-white truncate leading-tight", isMobile ? "text-sm" : "text-xs"),
                                    children: fullName
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/UserMenu.tsx",
                                    lineNumber: 38,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("font-medium text-white/40 truncate leading-tight mt-0.5", isMobile ? "text-xs" : "text-xs"),
                                    children: roleLabel
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/UserMenu.tsx",
                                    lineNumber: 41,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/UserMenu.tsx",
                            lineNumber: 37,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/UserMenu.tsx",
                    lineNumber: 22,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/UserMenu.tsx",
                lineNumber: 21,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DropdownMenuContent"], {
                side: "top",
                align: "start",
                sideOffset: 8,
                className: "w-52 bg-popover border-white/[0.09] text-white",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DropdownMenuItem"], {
                        asChild: true,
                        className: "cursor-pointer gap-2 focus:bg-white/[0.07]",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            href: "/login",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2d$round$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__UserRound$3e$__["UserRound"], {
                                    className: "size-4 shrink-0"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/UserMenu.tsx",
                                    lineNumber: 50,
                                    columnNumber: 13
                                }, this),
                                "Switch account"
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/UserMenu.tsx",
                            lineNumber: 49,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/UserMenu.tsx",
                        lineNumber: 48,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DropdownMenuItem"], {
                        onClick: ()=>signOut({
                                redirectUrl: "/login"
                            }),
                        className: "text-red-400 focus:text-red-400 focus:bg-white/[0.07] cursor-pointer gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$log$2d$out$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__LogOut$3e$__["LogOut"], {
                                className: "size-4 shrink-0"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/UserMenu.tsx",
                                lineNumber: 58,
                                columnNumber: 11
                            }, this),
                            "Log out"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/UserMenu.tsx",
                        lineNumber: 54,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/UserMenu.tsx",
                lineNumber: 47,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/UserMenu.tsx",
        lineNumber: 20,
        columnNumber: 5
    }, this);
}
_c = UserMenu;
var _c;
__turbopack_context__.k.register(_c, "UserMenu");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileNavSheet.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MobileNavSheet",
    ()=>MobileNavSheet
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/x.js [app-client] (ecmascript) <export default as X>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sheet$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/sheet.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$FooterLinks$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/sidebar/FooterLinks.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$NavGroupList$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/sidebar/NavGroupList.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$OrgSwitcher$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OrgSwitcher.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$sidebar$2d$helpers$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/sidebar/sidebar-helpers.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$UserMenu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/sidebar/UserMenu.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
;
;
;
function MobileNavSheet({ open, onClose, openCount, onSwitching, navAuth, agentName }) {
    _s();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    const handleNavClick = (e, isActive)=>{
        if (isActive) {
            e.preventDefault();
            return;
        }
        onClose();
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$sidebar$2d$helpers$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["dispatchNavProgressStart"])();
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sheet$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Sheet"], {
        open: open,
        onOpenChange: (o)=>!o && onClose(),
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sheet$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SheetContent"], {
            side: "top",
            showCloseButton: false,
            className: "bg-neutral-950 border-b border-white/[0.08] p-0 max-h-[90dvh] overflow-y-auto",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sheet$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SheetTitle"], {
                    className: "sr-only",
                    children: "Navigation"
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileNavSheet.tsx",
                    lineNumber: 47,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "sticky top-0 z-50 flex bg-neutral-950 items-center gap-2 px-3 py-2 border-b border-white/[0.08] shrink-0",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex-1 min-w-0",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$OrgSwitcher$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OrgSwitcher"], {
                                navAuth: navAuth,
                                onSwitching: onSwitching,
                                onClose: onClose,
                                variant: "mobileCompact"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileNavSheet.tsx",
                                lineNumber: 51,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileNavSheet.tsx",
                            lineNumber: 50,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: onClose,
                            "aria-label": "Close navigation",
                            className: "p-2 rounded-md text-white/40 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                                className: "size-5"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileNavSheet.tsx",
                                lineNumber: 59,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileNavSheet.tsx",
                            lineNumber: 53,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileNavSheet.tsx",
                    lineNumber: 49,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "px-3 py-2",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$NavGroupList$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["NavGroupList"], {
                        pathname: pathname,
                        openCount: openCount,
                        onNavigate: handleNavClick,
                        variant: "mobile",
                        agentName: agentName
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileNavSheet.tsx",
                        lineNumber: 64,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileNavSheet.tsx",
                    lineNumber: 63,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "sticky bottom-0 bg-neutral-950 w-full border-t border-white/[0.08] px-3 py-2",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-1 ",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$UserMenu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["UserMenu"], {
                                navAuth: navAuth,
                                variant: "mobile"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileNavSheet.tsx",
                                lineNumber: 69,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$FooterLinks$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["FooterLinks"], {
                                pathname: pathname,
                                onNavigate: handleNavClick,
                                variant: "mobile"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileNavSheet.tsx",
                                lineNumber: 70,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileNavSheet.tsx",
                        lineNumber: 68,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileNavSheet.tsx",
                    lineNumber: 67,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileNavSheet.tsx",
            lineNumber: 42,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileNavSheet.tsx",
        lineNumber: 41,
        columnNumber: 5
    }, this);
}
_s(MobileNavSheet, "xbyQPtUVMO7MNj7WjJlpdWqRcTo=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"]
    ];
});
_c = MobileNavSheet;
var _c;
__turbopack_context__.k.register(_c, "MobileNavSheet");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/components/ui/dialog.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Dialog",
    ()=>Dialog,
    "DialogClose",
    ()=>DialogClose,
    "DialogContent",
    ()=>DialogContent,
    "DialogDescription",
    ()=>DialogDescription,
    "DialogFooter",
    ()=>DialogFooter,
    "DialogHeader",
    ()=>DialogHeader,
    "DialogOverlay",
    ()=>DialogOverlay,
    "DialogPortal",
    ()=>DialogPortal,
    "DialogTitle",
    ()=>DialogTitle,
    "DialogTrigger",
    ()=>DialogTrigger
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__XIcon$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/x.js [app-client] (ecmascript) <export default as XIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-dialog/dist/index.mjs [app-client] (ecmascript) <export * as Dialog>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/ui/cn.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/button.tsx [app-client] (ecmascript)");
"use client";
;
;
;
;
;
function Dialog({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Root, {
        "data-slot": "dialog",
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/dialog.tsx",
        lineNumber: 13,
        columnNumber: 10
    }, this);
}
_c = Dialog;
function DialogTrigger({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Trigger, {
        "data-slot": "dialog-trigger",
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/dialog.tsx",
        lineNumber: 19,
        columnNumber: 10
    }, this);
}
_c1 = DialogTrigger;
function DialogPortal({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Portal, {
        "data-slot": "dialog-portal",
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/dialog.tsx",
        lineNumber: 25,
        columnNumber: 10
    }, this);
}
_c2 = DialogPortal;
function DialogClose({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Close, {
        "data-slot": "dialog-close",
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/dialog.tsx",
        lineNumber: 31,
        columnNumber: 10
    }, this);
}
_c3 = DialogClose;
function DialogOverlay({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Overlay, {
        "data-slot": "dialog-overlay",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/dialog.tsx",
        lineNumber: 39,
        columnNumber: 5
    }, this);
}
_c4 = DialogOverlay;
function DialogContent({ className, children, showCloseButton = true, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(DialogPortal, {
        "data-slot": "dialog-portal",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(DialogOverlay, {}, void 0, false, {
                fileName: "[project]/apps/dashboard/src/components/ui/dialog.tsx",
                lineNumber: 60,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Content, {
                "data-slot": "dialog-content",
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg", className),
                ...props,
                children: [
                    children,
                    showCloseButton && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Close, {
                        "data-slot": "dialog-close",
                        className: "absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__XIcon$3e$__["XIcon"], {}, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/components/ui/dialog.tsx",
                                lineNumber: 75,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "sr-only",
                                children: "Close"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/components/ui/dialog.tsx",
                                lineNumber: 76,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/components/ui/dialog.tsx",
                        lineNumber: 71,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/components/ui/dialog.tsx",
                lineNumber: 61,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/components/ui/dialog.tsx",
        lineNumber: 59,
        columnNumber: 5
    }, this);
}
_c5 = DialogContent;
function DialogHeader({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "dialog-header",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex flex-col gap-2 text-center sm:text-left", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/dialog.tsx",
        lineNumber: 86,
        columnNumber: 5
    }, this);
}
_c6 = DialogHeader;
function DialogFooter({ className, showCloseButton = false, children, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "dialog-footer",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className),
        ...props,
        children: [
            children,
            showCloseButton && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Close, {
                asChild: true,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                    variant: "outline",
                    children: "Close"
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/components/ui/dialog.tsx",
                    lineNumber: 114,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/components/ui/dialog.tsx",
                lineNumber: 113,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/components/ui/dialog.tsx",
        lineNumber: 103,
        columnNumber: 5
    }, this);
}
_c7 = DialogFooter;
function DialogTitle({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Title, {
        "data-slot": "dialog-title",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("text-lg leading-none font-semibold", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/dialog.tsx",
        lineNumber: 126,
        columnNumber: 5
    }, this);
}
_c8 = DialogTitle;
function DialogDescription({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Description, {
        "data-slot": "dialog-description",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("text-sm text-muted-foreground", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/dialog.tsx",
        lineNumber: 139,
        columnNumber: 5
    }, this);
}
_c9 = DialogDescription;
;
var _c, _c1, _c2, _c3, _c4, _c5, _c6, _c7, _c8, _c9;
__turbopack_context__.k.register(_c, "Dialog");
__turbopack_context__.k.register(_c1, "DialogTrigger");
__turbopack_context__.k.register(_c2, "DialogPortal");
__turbopack_context__.k.register(_c3, "DialogClose");
__turbopack_context__.k.register(_c4, "DialogOverlay");
__turbopack_context__.k.register(_c5, "DialogContent");
__turbopack_context__.k.register(_c6, "DialogHeader");
__turbopack_context__.k.register(_c7, "DialogFooter");
__turbopack_context__.k.register(_c8, "DialogTitle");
__turbopack_context__.k.register(_c9, "DialogDescription");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/components/ui/command.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Command",
    ()=>Command,
    "CommandDialog",
    ()=>CommandDialog,
    "CommandEmpty",
    ()=>CommandEmpty,
    "CommandGroup",
    ()=>CommandGroup,
    "CommandInput",
    ()=>CommandInput,
    "CommandItem",
    ()=>CommandItem,
    "CommandList",
    ()=>CommandList,
    "CommandSeparator",
    ()=>CommandSeparator,
    "CommandShortcut",
    ()=>CommandShortcut
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$cmdk$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/cmdk/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__SearchIcon$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/search.js [app-client] (ecmascript) <export default as SearchIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/ui/cn.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/dialog.tsx [app-client] (ecmascript)");
"use client";
;
;
;
;
;
function Command({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$cmdk$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Command"], {
        "data-slot": "command",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex size-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/command.tsx",
        lineNumber: 21,
        columnNumber: 5
    }, this);
}
_c = Command;
function CommandDialog({ title = "Command Palette", description = "Search for a command to run…", children, className, showCloseButton = true, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Dialog"], {
        ...props,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogContent"], {
            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("overflow-hidden p-0", className),
            showCloseButton: showCloseButton,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogHeader"], {
                    className: "sr-only",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogTitle"], {
                            children: title
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/components/ui/command.tsx",
                            lineNumber: 52,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogDescription"], {
                            children: description
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/components/ui/command.tsx",
                            lineNumber: 53,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/components/ui/command.tsx",
                    lineNumber: 51,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Command, {
                    className: "**:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5",
                    children: children
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/components/ui/command.tsx",
                    lineNumber: 55,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/dashboard/src/components/ui/command.tsx",
            lineNumber: 47,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/command.tsx",
        lineNumber: 46,
        columnNumber: 5
    }, this);
}
_c1 = CommandDialog;
function CommandInput({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "command-input-wrapper",
        className: "flex h-9 items-center gap-2 border-b px-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__SearchIcon$3e$__["SearchIcon"], {
                className: "size-4 shrink-0 opacity-50"
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/components/ui/command.tsx",
                lineNumber: 72,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$cmdk$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Command"].Input, {
                "data-slot": "command-input",
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50", className),
                ...props
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/components/ui/command.tsx",
                lineNumber: 73,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/components/ui/command.tsx",
        lineNumber: 68,
        columnNumber: 5
    }, this);
}
_c2 = CommandInput;
function CommandList({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$cmdk$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Command"].List, {
        "data-slot": "command-list",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/command.tsx",
        lineNumber: 90,
        columnNumber: 5
    }, this);
}
_c3 = CommandList;
function CommandEmpty({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$cmdk$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Command"].Empty, {
        "data-slot": "command-empty",
        className: "py-6 text-center text-sm",
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/command.tsx",
        lineNumber: 105,
        columnNumber: 5
    }, this);
}
_c4 = CommandEmpty;
function CommandGroup({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$cmdk$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Command"].Group, {
        "data-slot": "command-group",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/command.tsx",
        lineNumber: 118,
        columnNumber: 5
    }, this);
}
_c5 = CommandGroup;
function CommandSeparator({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$cmdk$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Command"].Separator, {
        "data-slot": "command-separator",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("-mx-1 h-px bg-border", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/command.tsx",
        lineNumber: 134,
        columnNumber: 5
    }, this);
}
_c6 = CommandSeparator;
function CommandItem({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$cmdk$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Command"].Item, {
        "data-slot": "command-item",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/command.tsx",
        lineNumber: 147,
        columnNumber: 5
    }, this);
}
_c7 = CommandItem;
function CommandShortcut({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        "data-slot": "command-shortcut",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("ml-auto text-xs tracking-widest text-muted-foreground", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/command.tsx",
        lineNumber: 163,
        columnNumber: 5
    }, this);
}
_c8 = CommandShortcut;
;
var _c, _c1, _c2, _c3, _c4, _c5, _c6, _c7, _c8;
__turbopack_context__.k.register(_c, "Command");
__turbopack_context__.k.register(_c1, "CommandDialog");
__turbopack_context__.k.register(_c2, "CommandInput");
__turbopack_context__.k.register(_c3, "CommandList");
__turbopack_context__.k.register(_c4, "CommandEmpty");
__turbopack_context__.k.register(_c5, "CommandGroup");
__turbopack_context__.k.register(_c6, "CommandSeparator");
__turbopack_context__.k.register(_c7, "CommandItem");
__turbopack_context__.k.register(_c8, "CommandShortcut");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/CommandPalette.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>CommandPalette
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$house$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Home$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/house.js [app-client] (ecmascript) <export default as Home>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$inbox$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Inbox$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/inbox.js [app-client] (ecmascript) <export default as Inbox>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$scan$2d$eye$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ScanEye$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/scan-eye.js [app-client] (ecmascript) <export default as ScanEye>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$users$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Users$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/users.js [app-client] (ecmascript) <export default as Users>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/settings.js [app-client] (ecmascript) <export default as Settings>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plug$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Plug$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/plug.js [app-client] (ecmascript) <export default as Plug>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/command.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
const COMMANDS = [
    {
        label: "Home",
        href: "/dashboard",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$house$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Home$3e$__["Home"],
        group: "Navigate"
    },
    {
        label: "Inbox",
        href: "/dashboard/tickets",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$inbox$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Inbox$3e$__["Inbox"],
        group: "Navigate"
    },
    {
        label: "Review",
        href: "/dashboard/review",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$scan$2d$eye$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ScanEye$3e$__["ScanEye"],
        group: "Navigate"
    },
    {
        label: "Team",
        href: "/dashboard/team",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$users$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Users$3e$__["Users"],
        group: "Navigate"
    },
    {
        label: "Settings",
        href: "/dashboard/settings",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__["Settings"],
        group: "Navigate"
    },
    {
        label: "Integrations",
        href: "/dashboard/integrations",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plug$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Plug$3e$__["Plug"],
        group: "Navigate"
    }
];
function CommandPalette({ open, onClose }) {
    _s();
    const { push } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    function navigate(href) {
        push(href);
        onClose();
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommandDialog"], {
        open: open,
        onOpenChange: (v)=>!v && onClose(),
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommandInput"], {
                placeholder: "Search pages and actions…"
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/CommandPalette.tsx",
                lineNumber: 38,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommandList"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommandEmpty"], {
                        children: "No results found."
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/CommandPalette.tsx",
                        lineNumber: 40,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommandGroup"], {
                        heading: "Navigate",
                        children: COMMANDS.map((cmd)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommandItem"], {
                                value: cmd.label,
                                onSelect: ()=>navigate(cmd.href),
                                className: "gap-3 cursor-pointer",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "size-7 rounded-md bg-white/[0.06] flex items-center justify-center shrink-0",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(cmd.icon, {
                                            className: "size-3.5 text-white/50"
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/CommandPalette.tsx",
                                            lineNumber: 50,
                                            columnNumber: 17
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/CommandPalette.tsx",
                                        lineNumber: 49,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "flex-1 text-sm font-medium",
                                        children: cmd.label
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/CommandPalette.tsx",
                                        lineNumber: 52,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-xs text-white/30",
                                        children: cmd.group
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/CommandPalette.tsx",
                                        lineNumber: 53,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, cmd.href, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/CommandPalette.tsx",
                                lineNumber: 43,
                                columnNumber: 13
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/CommandPalette.tsx",
                        lineNumber: 41,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/CommandPalette.tsx",
                lineNumber: 39,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/CommandPalette.tsx",
        lineNumber: 37,
        columnNumber: 5
    }, this);
}
_s(CommandPalette, "qsDkn33CqmlEcFEENil8IeDjAvk=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"]
    ];
});
_c = CommandPalette;
var _c;
__turbopack_context__.k.register(_c, "CommandPalette");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/CommandPaletteContext.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CommandPaletteProvider",
    ()=>CommandPaletteProvider,
    "useCommandPalette",
    ()=>useCommandPalette
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$CommandPalette$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/CommandPalette.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
const CommandPaletteContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])(null);
function useCommandPalette() {
    const ctx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["use"])(CommandPaletteContext);
    if (!ctx) throw new Error("useCommandPalette must be used inside CommandPaletteProvider");
    return ctx;
}
function CommandPaletteProvider({ children }) {
    _s();
    const [isOpen, setIsOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const open = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "CommandPaletteProvider.useCallback[open]": ()=>setIsOpen(true)
    }["CommandPaletteProvider.useCallback[open]"], []);
    const close = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "CommandPaletteProvider.useCallback[close]": ()=>setIsOpen(false)
    }["CommandPaletteProvider.useCallback[close]"], []);
    const toggle = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "CommandPaletteProvider.useCallback[toggle]": ()=>setIsOpen({
                "CommandPaletteProvider.useCallback[toggle]": (o)=>!o
            }["CommandPaletteProvider.useCallback[toggle]"])
    }["CommandPaletteProvider.useCallback[toggle]"], []);
    const value = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "CommandPaletteProvider.useMemo[value]": ()=>({
                open,
                close,
                toggle,
                isOpen
            })
    }["CommandPaletteProvider.useMemo[value]"], [
        close,
        isOpen,
        open,
        toggle
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "CommandPaletteProvider.useEffect": ()=>{
            function onKeyDown(e) {
                if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                    e.preventDefault();
                    toggle();
                }
            }
            window.addEventListener("keydown", onKeyDown);
            return ({
                "CommandPaletteProvider.useEffect": ()=>window.removeEventListener("keydown", onKeyDown)
            })["CommandPaletteProvider.useEffect"];
        }
    }["CommandPaletteProvider.useEffect"], [
        toggle
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(CommandPaletteContext.Provider, {
        value: value,
        children: [
            children,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$CommandPalette$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                open: isOpen,
                onClose: close
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/CommandPaletteContext.tsx",
                lineNumber: 42,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/CommandPaletteContext.tsx",
        lineNumber: 40,
        columnNumber: 5
    }, this);
}
_s(CommandPaletteProvider, "JdVwDgloLj2l0aOKEe2/oLwZHU0=");
_c = CommandPaletteProvider;
var _c;
__turbopack_context__.k.register(_c, "CommandPaletteProvider");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/sidebar/SidebarNavContent.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SidebarNavContent",
    ()=>SidebarNavContent
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/search.js [app-client] (ecmascript) <export default as Search>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sidebar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/sidebar.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/ui/cn.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$AutonomyPill$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/AutonomyPill.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$CommandPaletteContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/CommandPaletteContext.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$FooterLinks$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/sidebar/FooterLinks.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$NavGroupList$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/sidebar/NavGroupList.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$OrgSwitcher$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/sidebar/OrgSwitcher.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$sidebar$2d$helpers$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/sidebar/sidebar-helpers.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$UserMenu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/sidebar/UserMenu.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
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
function SidebarNavContent({ openCount, onSwitching, navAuth, agentName }) {
    _s();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    const { setOpenMobile, isMobile } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sidebar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSidebar"])();
    const { open: openCmd } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$CommandPaletteContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCommandPalette"])();
    const scrollTimer = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [isScrolling, setIsScrolling] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const clearScrollTimer = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "SidebarNavContent.useCallback[clearScrollTimer]": ()=>{
            if (scrollTimer.current) {
                clearTimeout(scrollTimer.current);
                scrollTimer.current = null;
            }
        }
    }["SidebarNavContent.useCallback[clearScrollTimer]"], []);
    const handleScroll = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "SidebarNavContent.useCallback[handleScroll]": ()=>{
            setIsScrolling(true);
            clearScrollTimer();
            scrollTimer.current = setTimeout({
                "SidebarNavContent.useCallback[handleScroll]": ()=>{
                    scrollTimer.current = null;
                    setIsScrolling(false);
                }
            }["SidebarNavContent.useCallback[handleScroll]"], 800);
        }
    }["SidebarNavContent.useCallback[handleScroll]"], [
        clearScrollTimer
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "SidebarNavContent.useEffect": ()=>clearScrollTimer
    }["SidebarNavContent.useEffect"], [
        clearScrollTimer
    ]);
    const handleNavClick = (e, isActive)=>{
        if (isActive) {
            e.preventDefault();
            return;
        }
        if (isMobile) setOpenMobile(false);
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$sidebar$2d$helpers$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["dispatchNavProgressStart"])();
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sidebar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SidebarContent"], {
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("px-2 pt-1 pb-2 gap-0 overflow-x-hidden bg-neutral-950 custom-scrollbar", isScrolling && "is-scrolling"),
                onScroll: handleScroll,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "pb-1 mb-2 border-b border-white/[0.06]",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$OrgSwitcher$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OrgSwitcher"], {
                            navAuth: navAuth,
                            onSwitching: onSwitching,
                            variant: "desktop"
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/SidebarNavContent.tsx",
                            lineNumber: 71,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/SidebarNavContent.tsx",
                        lineNumber: 70,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$AutonomyPill$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                        tier: navAuth.autonomyTier,
                        className: "mb-2.5 w-full justify-center"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/SidebarNavContent.tsx",
                        lineNumber: 74,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: openCmd,
                        className: "w-full mb-2.5 flex items-center gap-2 px-2.5 py-2 rounded-md bg-white/[0.1] hover:bg-white/[0.2] transition-colors outline-none text-left",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__["Search"], {
                                className: "size-3.5 text-white/35 shrink-0"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/SidebarNavContent.tsx",
                                lineNumber: 81,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "flex-1 text-xs text-white/40",
                                children: "Search or jump to…"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/SidebarNavContent.tsx",
                                lineNumber: 82,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("kbd", {
                                className: "text-xs font-semibold bg-white/[0.08] px-1 py-0.5 rounded text-white/40 shrink-0 leading-none",
                                children: "⌘K"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/SidebarNavContent.tsx",
                                lineNumber: 83,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/SidebarNavContent.tsx",
                        lineNumber: 76,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$NavGroupList$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["NavGroupList"], {
                        pathname: pathname,
                        openCount: openCount,
                        onNavigate: handleNavClick,
                        variant: "desktop",
                        agentName: agentName
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/SidebarNavContent.tsx",
                        lineNumber: 86,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/SidebarNavContent.tsx",
                lineNumber: 63,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sidebar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SidebarFooter"], {
                className: "border-t bg-neutral-950 border-sidebar-border p-2 gap-0",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex items-center gap-1",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$UserMenu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["UserMenu"], {
                            navAuth: navAuth,
                            variant: "desktop"
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/SidebarNavContent.tsx",
                            lineNumber: 91,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$FooterLinks$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["FooterLinks"], {
                            pathname: pathname,
                            onNavigate: handleNavClick,
                            variant: "desktop"
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/SidebarNavContent.tsx",
                            lineNumber: 92,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/SidebarNavContent.tsx",
                    lineNumber: 90,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/sidebar/SidebarNavContent.tsx",
                lineNumber: 89,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true);
}
_s(SidebarNavContent, "AOqFKVKIEF6uNc6SbmminpZ1gOQ=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sidebar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSidebar"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$CommandPaletteContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCommandPalette"]
    ];
});
_c = SidebarNavContent;
var _c;
__turbopack_context__.k.register(_c, "SidebarNavContent");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/settings.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AGENT_SETTINGS_DEFAULTS",
    ()=>AGENT_SETTINGS_DEFAULTS,
    "OrgSettingsValidationError",
    ()=>OrgSettingsValidationError,
    "TIERS_THAT_AUTO_EXECUTE",
    ()=>TIERS_THAT_AUTO_EXECUTE,
    "TIER_DEFAULTS",
    ()=>TIER_DEFAULTS,
    "isValidBusinessHoursWindow",
    ()=>isValidBusinessHoursWindow,
    "isWithinBusinessHours",
    ()=>isWithinBusinessHours,
    "normalizeStoredOrgSettings",
    ()=>normalizeStoredOrgSettings,
    "parseOrgSettingsPatch",
    ()=>parseOrgSettingsPatch,
    "resolveAgentSettings",
    ()=>resolveAgentSettings,
    "resolveAutoExecuteMode",
    ()=>resolveAutoExecuteMode
]);
class OrgSettingsValidationError extends Error {
    issues;
    constructor(issues){
        super("Invalid organization settings");
        this.issues = issues;
        this.name = "OrgSettingsValidationError";
    }
}
const AGENT_SETTINGS_DEFAULTS = {
    aiContext: "",
    brandVoice: "",
    sampleReplies: [],
    agentName: "Shopkeeper",
    autoPlanOnOpen: true,
    autoExecuteEnabled: false,
    defaultInstruction: "",
    requireApprovalForActions: true,
    toolsEnabled: {
        action: true,
        communication: true,
        internal: true,
        read: true
    },
    maxRefundAmount: null,
    dailyRefundCap: null,
    dailyLLMSpendCapUsd: null,
    blockCancellations: false,
    blockCustomLineItems: false,
    maxIterations: 10,
    replyLanguage: "auto",
    digestEnabled: false,
    digestFrequency: "daily",
    digestHour: 8,
    digestSecondHour: 17,
    digestDays: "every_day",
    digestTimezoneOffset: 0,
    businessHoursEnabled: false,
    businessHoursStart: 9,
    businessHoursEnd: 17,
    businessHoursDays: [
        "mon",
        "tue",
        "wed",
        "thu",
        "fri"
    ],
    businessHoursTimezoneOffset: 0,
    autoAckMessage: "Thanks for reaching out! We're currently outside business hours and will get back to you soon.",
    spamFilterEnabled: true,
    autonomyTier: "guarded"
};
const TIER_DEFAULTS = {
    watch: {
        maxRefundAmount: 0,
        requireApprovalForActions: true,
        toolsEnabled: {
            action: false,
            communication: false,
            internal: true,
            read: true
        }
    },
    guarded: {
        maxRefundAmount: 50,
        requireApprovalForActions: true
    },
    trusted: {
        maxRefundAmount: 100,
        requireApprovalForActions: false
    },
    broad: {
        maxRefundAmount: 250,
        requireApprovalForActions: false
    },
    full: {
        maxRefundAmount: 1000,
        requireApprovalForActions: false
    }
};
const TIERS_THAT_AUTO_EXECUTE = new Set([
    "trusted",
    "broad",
    "full"
]);
const SETTINGS_KEYS = [
    "aiContext",
    "brandVoice",
    "sampleReplies",
    "agentName",
    "autoPlanOnOpen",
    "autoExecuteEnabled",
    "autoExecuteMode",
    "defaultInstruction",
    "requireApprovalForActions",
    "toolsEnabled",
    "maxRefundAmount",
    "dailyRefundCap",
    "dailyLLMSpendCapUsd",
    "blockCancellations",
    "blockCustomLineItems",
    "maxIterations",
    "replyLanguage",
    "digestEnabled",
    "digestFrequency",
    "digestHour",
    "digestSecondHour",
    "digestDays",
    "digestTimezone",
    "digestTimezoneOffset",
    "businessHoursEnabled",
    "businessHoursStart",
    "businessHoursEnd",
    "businessHoursDays",
    "businessHoursTimezone",
    "businessHoursTimezoneOffset",
    "autoAckMessage",
    "spamFilterEnabled",
    "autonomyTier"
];
const BOOLEAN_FIELDS = [
    "autoPlanOnOpen",
    "autoExecuteEnabled",
    "requireApprovalForActions",
    "blockCancellations",
    "blockCustomLineItems",
    "digestEnabled",
    "businessHoursEnabled",
    "spamFilterEnabled"
];
const STRING_FIELDS = [
    [
        "aiContext",
        2000
    ],
    [
        "brandVoice",
        200
    ],
    [
        "agentName",
        100
    ],
    [
        "defaultInstruction",
        2000
    ],
    [
        "replyLanguage",
        100
    ],
    [
        "autoAckMessage",
        500
    ]
];
const NULLABLE_NON_NEGATIVE_FIELDS = [
    "maxRefundAmount",
    "dailyRefundCap",
    "dailyLLMSpendCapUsd"
];
const HOUR_FIELDS = [
    "digestHour",
    "digestSecondHour",
    "businessHoursStart",
    "businessHoursEnd"
];
const TIMEZONE_FIELDS = [
    "digestTimezone",
    "businessHoursTimezone"
];
const OFFSET_FIELDS = [
    "digestTimezoneOffset",
    "businessHoursTimezoneOffset"
];
const TOOL_PERMISSION_KEYS = [
    "action",
    "communication",
    "internal",
    "read"
];
const BUSINESS_HOURS_DAYS = [
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
    "sat",
    "sun"
];
const SAMPLE_REPLY_KEYS = [
    "id",
    "body",
    "context",
    "tag"
];
const AUTO_EXECUTE_MODES = [
    "off",
    "shadow",
    "live"
];
const AUTONOMY_TIERS = [
    "watch",
    "guarded",
    "trusted",
    "broad",
    "full"
];
const DIGEST_FREQUENCIES = [
    "daily",
    "twice_daily",
    "every_4h",
    "every_6h",
    "every_8h",
    "every_12h"
];
const DIGEST_DAYS = [
    "every_day",
    "weekdays"
];
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}
function addIssue(context, path, message) {
    if (context.mode === "strict") {
        context.issues.push({
            path,
            message
        });
    }
}
function rejectUnknownKeys(value, allowedKeys, path, context) {
    const allowed = new Set(allowedKeys);
    for (const key of Object.keys(value)){
        if (!allowed.has(key)) {
            addIssue(context, path ? `${path}.${key}` : key, "Unknown setting");
        }
    }
}
function readBoolean(value, key, output, context) {
    if (!hasOwn(value, key)) return;
    if (typeof value[key] === "boolean") {
        output[key] = value[key];
        return;
    }
    addIssue(context, key, "Expected a boolean");
}
function readString(value, key, maxLength, output, context) {
    if (!hasOwn(value, key)) return;
    const candidate = value[key];
    if (typeof candidate !== "string") {
        addIssue(context, key, "Expected a string");
        return;
    }
    if (candidate.length > maxLength) {
        addIssue(context, key, `Must be at most ${maxLength} characters`);
        return;
    }
    output[key] = candidate;
}
function readEnum(value, key, allowed, output, context) {
    if (!hasOwn(value, key)) return;
    const candidate = value[key];
    if (typeof candidate === "string" && allowed.includes(candidate)) {
        output[key] = candidate;
        return;
    }
    addIssue(context, key, `Expected one of: ${allowed.join(", ")}`);
}
function readNullableNonNegativeNumber(value, key, output, context) {
    if (!hasOwn(value, key)) return;
    const candidate = value[key];
    if (candidate === null || typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0) {
        output[key] = candidate;
        return;
    }
    addIssue(context, key, "Expected null or a non-negative finite number");
}
function readInteger(value, key, min, max, output, context) {
    if (!hasOwn(value, key)) return;
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isInteger(candidate) && candidate >= min && candidate <= max) {
        output[key] = candidate;
        return;
    }
    addIssue(context, key, `Expected an integer from ${min} to ${max}`);
}
function isValidTimeZone(value) {
    if (value.trim() === "") return true;
    try {
        new Intl.DateTimeFormat("en-US", {
            timeZone: value
        }).format();
        return true;
    } catch  {
        return false;
    }
}
function readTimezone(value, key, output, context) {
    if (!hasOwn(value, key)) return;
    const candidate = value[key];
    if (typeof candidate !== "string") {
        addIssue(context, key, "Expected an IANA timezone string");
        return;
    }
    if (candidate.length > 100 || !isValidTimeZone(candidate)) {
        addIssue(context, key, "Expected a valid IANA timezone");
        return;
    }
    output[key] = candidate;
}
function readToolsEnabled(value, output, context) {
    if (!hasOwn(value, "toolsEnabled")) return;
    const candidate = value.toolsEnabled;
    if (!isPlainObject(candidate)) {
        addIssue(context, "toolsEnabled", "Expected an object");
        return;
    }
    rejectUnknownKeys(candidate, TOOL_PERMISSION_KEYS, "toolsEnabled", context);
    const tools = {};
    for (const key of TOOL_PERMISSION_KEYS){
        if (!hasOwn(candidate, key)) continue;
        if (typeof candidate[key] === "boolean") {
            tools[key] = candidate[key];
        } else {
            addIssue(context, `toolsEnabled.${key}`, "Expected a boolean");
        }
    }
    output.toolsEnabled = tools;
}
function readBusinessHoursDays(value, output, context) {
    if (!hasOwn(value, "businessHoursDays")) return;
    const candidate = value.businessHoursDays;
    if (!Array.isArray(candidate)) {
        addIssue(context, "businessHoursDays", "Expected an array of weekday identifiers");
        return;
    }
    if (candidate.some((day)=>typeof day !== "string" || !BUSINESS_HOURS_DAYS.includes(day))) {
        addIssue(context, "businessHoursDays", `Expected only: ${BUSINESS_HOURS_DAYS.join(", ")}`);
        return;
    }
    output.businessHoursDays = [
        ...new Set(candidate)
    ];
}
function readSampleString(value, key, maxLength, path, context, required) {
    const candidate = value[key];
    if (candidate === undefined && !required) return undefined;
    if (typeof candidate !== "string") {
        addIssue(context, `${path}.${key}`, "Expected a string");
        return undefined;
    }
    if (candidate.length > maxLength) {
        addIssue(context, `${path}.${key}`, `Must be at most ${maxLength} characters`);
        return undefined;
    }
    return candidate;
}
function readSampleReplies(value, output, context) {
    if (!hasOwn(value, "sampleReplies")) return;
    const candidate = value.sampleReplies;
    if (!Array.isArray(candidate)) {
        addIssue(context, "sampleReplies", "Expected an array");
        return;
    }
    if (candidate.length > 10) {
        addIssue(context, "sampleReplies", "Must contain at most 10 replies");
    }
    const replies = [];
    for (const [index, rawReply] of candidate.slice(0, 10).entries()){
        const path = `sampleReplies.${index}`;
        if (!isPlainObject(rawReply)) {
            addIssue(context, path, "Expected an object");
            continue;
        }
        rejectUnknownKeys(rawReply, SAMPLE_REPLY_KEYS, path, context);
        const issueCount = context.issues.length;
        const id = readSampleString(rawReply, "id", 100, path, context, true);
        const body = readSampleString(rawReply, "body", 300, path, context, true);
        const sampleContext = readSampleString(rawReply, "context", 80, path, context, false);
        const tag = readSampleString(rawReply, "tag", 40, path, context, false);
        if (!id || body === undefined || context.issues.length > issueCount) continue;
        replies.push({
            id,
            body,
            ...sampleContext !== undefined ? {
                context: sampleContext
            } : {},
            ...tag !== undefined ? {
                tag
            } : {}
        });
    }
    output.sampleReplies = replies;
}
function parseSettingsObject(value, mode) {
    const context = {
        mode,
        issues: []
    };
    if (!isPlainObject(value)) {
        addIssue(context, "settings", "Expected an object");
        if (context.issues.length > 0) throw new OrgSettingsValidationError(context.issues);
        return {};
    }
    rejectUnknownKeys(value, SETTINGS_KEYS, "", context);
    const output = {};
    for (const key of BOOLEAN_FIELDS)readBoolean(value, key, output, context);
    for (const [key, maxLength] of STRING_FIELDS)readString(value, key, maxLength, output, context);
    for (const key of NULLABLE_NON_NEGATIVE_FIELDS){
        readNullableNonNegativeNumber(value, key, output, context);
    }
    for (const key of HOUR_FIELDS)readInteger(value, key, 0, 23, output, context);
    for (const key of OFFSET_FIELDS)readInteger(value, key, -12, 14, output, context);
    for (const key of TIMEZONE_FIELDS)readTimezone(value, key, output, context);
    readInteger(value, "maxIterations", 1, 100, output, context);
    readEnum(value, "autoExecuteMode", AUTO_EXECUTE_MODES, output, context);
    readEnum(value, "autonomyTier", AUTONOMY_TIERS, output, context);
    readEnum(value, "digestFrequency", DIGEST_FREQUENCIES, output, context);
    readEnum(value, "digestDays", DIGEST_DAYS, output, context);
    readToolsEnabled(value, output, context);
    readBusinessHoursDays(value, output, context);
    readSampleReplies(value, output, context);
    if (output.autoExecuteMode === undefined && typeof output.autoExecuteEnabled === "boolean") {
        output.autoExecuteMode = output.autoExecuteEnabled ? "live" : "off";
    }
    if (context.issues.length > 0) {
        throw new OrgSettingsValidationError(context.issues);
    }
    return output;
}
function parseOrgSettingsPatch(value) {
    return parseSettingsObject(value, "strict");
}
function normalizeStoredOrgSettings(value) {
    const normalized = parseSettingsObject(value, "stored");
    const start = normalized.businessHoursStart ?? AGENT_SETTINGS_DEFAULTS.businessHoursStart;
    const end = normalized.businessHoursEnd ?? AGENT_SETTINGS_DEFAULTS.businessHoursEnd;
    if (normalized.businessHoursEnabled === true && !isValidBusinessHoursWindow(start, end)) {
        delete normalized.businessHoursStart;
        delete normalized.businessHoursEnd;
    }
    return normalized;
}
function resolveAutoExecuteMode(settings) {
    const normalized = normalizeStoredOrgSettings(settings);
    return normalized.autoExecuteMode ?? "off";
}
function resolveAgentSettings(settings) {
    const base = normalizeStoredOrgSettings(settings);
    const requested = base.autonomyTier;
    const tier = requested && requested in TIER_DEFAULTS ? requested : "guarded";
    const tierDefaults = TIER_DEFAULTS[tier];
    return {
        ...AGENT_SETTINGS_DEFAULTS,
        ...tierDefaults,
        ...base,
        autonomyTier: tier,
        toolsEnabled: {
            ...AGENT_SETTINGS_DEFAULTS.toolsEnabled,
            ...tierDefaults.toolsEnabled ?? {},
            ...base.toolsEnabled ?? {}
        }
    };
}
function isValidBusinessHoursWindow(start, end) {
    return start !== end;
}
function offsetToIanaFallback(offset) {
    const rounded = Math.max(-12, Math.min(14, Math.round(offset)));
    if (rounded === 0) return "UTC";
    return `Etc/GMT${rounded > 0 ? "-" : "+"}${Math.abs(rounded)}`;
}
function localHourAndDay(timeZone, now) {
    try {
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone,
            hour: "numeric",
            weekday: "short",
            hour12: false
        }).formatToParts(now);
        const rawHour = Number.parseInt(parts.find((part)=>part.type === "hour")?.value ?? "0", 10);
        const day = parts.find((part)=>part.type === "weekday")?.value.toLowerCase().slice(0, 3);
        return {
            hour: (rawHour % 24 + 24) % 24,
            day: BUSINESS_HOURS_DAYS.includes(day) ? day : "sun"
        };
    } catch  {
        return {
            hour: now.getUTCHours(),
            day: BUSINESS_HOURS_DAYS[now.getUTCDay() === 0 ? 6 : now.getUTCDay() - 1]
        };
    }
}
function isWithinBusinessHours(settings, now = new Date()) {
    if (!settings.businessHoursEnabled) return true;
    if (!isValidBusinessHoursWindow(settings.businessHoursStart, settings.businessHoursEnd)) return false;
    const timezone = settings.businessHoursTimezone?.trim() ? settings.businessHoursTimezone : offsetToIanaFallback(settings.businessHoursTimezoneOffset);
    const { hour, day } = localHourAndDay(timezone, now);
    const dayIndex = BUSINESS_HOURS_DAYS.indexOf(day);
    const previousDay = BUSINESS_HOURS_DAYS[(dayIndex + BUSINESS_HOURS_DAYS.length - 1) % BUSINESS_HOURS_DAYS.length];
    if (settings.businessHoursStart < settings.businessHoursEnd) {
        return settings.businessHoursDays.includes(day) && hour >= settings.businessHoursStart && hour < settings.businessHoursEnd;
    }
    return settings.businessHoursDays.includes(day) && hour >= settings.businessHoursStart || settings.businessHoursDays.includes(previousDay) && hour < settings.businessHoursEnd;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/lib/format/role.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "formatRole",
    ()=>formatRole
]);
function formatRole(role) {
    if (!role) return "Member";
    return role.replace(/^org:/, "").replace(/_/g, " ").replace(/\b\w/g, (letter)=>letter.toUpperCase());
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/hooks/useOrg.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useOrg",
    ()=>useOrg
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/swr/dist/index/index.mjs [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/fetcher.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
"use client";
;
;
function useOrg({ enabled = true, revalidateOnFocus = true } = {}) {
    _s();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"])(enabled ? "/api/org" : null, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetcher"], {
        revalidateOnFocus
    });
}
_s(useOrg, "7xERTuQa/rCStZtEZdi0LgBAmUk=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/sidebar/useNavAuth.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useNavAuth",
    ()=>useNavAuth
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$shared$2f$dist$2f$runtime$2f$react$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@clerk/shared/dist/runtime/react/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/settings.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$format$2f$role$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/format/role.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useOrg$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/hooks/useOrg.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
function useNavAuth(initialAutonomyTier) {
    _s();
    const { user } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$shared$2f$dist$2f$runtime$2f$react$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useUser"])();
    const { signOut } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$shared$2f$dist$2f$runtime$2f$react$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useClerk"])();
    const { organization, membership, memberships } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$shared$2f$dist$2f$runtime$2f$react$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useOrganization"])({
        memberships: {
            infinite: false,
            pageSize: 20
        }
    });
    const { userMemberships, setActive } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$shared$2f$dist$2f$runtime$2f$react$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useOrganizationList"])({
        userMemberships: {
            infinite: true
        }
    });
    const { data: orgData } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useOrg$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useOrg"])({
        revalidateOnFocus: false
    });
    const mounted = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSyncExternalStore"])({
        "useNavAuth.useSyncExternalStore[mounted]": ()=>({
                "useNavAuth.useSyncExternalStore[mounted]": ()=>{}
            })["useNavAuth.useSyncExternalStore[mounted]"]
    }["useNavAuth.useSyncExternalStore[mounted]"], {
        "useNavAuth.useSyncExternalStore[mounted]": ()=>true
    }["useNavAuth.useSyncExternalStore[mounted]"], {
        "useNavAuth.useSyncExternalStore[mounted]": ()=>false
    }["useNavAuth.useSyncExternalStore[mounted]"]);
    const membershipPage = memberships;
    const seatCount = membershipPage?.count ?? membershipPage?.data?.length ?? 1;
    const autonomyTier = orgData?.settings ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["resolveAgentSettings"])(orgData.settings).autonomyTier ?? initialAutonomyTier : initialAutonomyTier;
    return {
        user,
        signOut,
        organization,
        userMemberships,
        setActive,
        mounted,
        fullName: user?.fullName ?? user?.firstName ?? "User",
        roleLabel: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$format$2f$role$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatRole"])(membership?.role),
        planName: orgData?.planName ?? "Free",
        seatCount,
        autonomyTier
    };
}
_s(useNavAuth, "B2eKaPj7rb8iPrBJ3p5XuJ2Crqc=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$shared$2f$dist$2f$runtime$2f$react$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useUser"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$shared$2f$dist$2f$runtime$2f$react$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useClerk"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$shared$2f$dist$2f$runtime$2f$react$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useOrganization"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$shared$2f$dist$2f$runtime$2f$react$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useOrganizationList"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useOrg$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useOrg"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSyncExternalStore"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/DashboardSidebar.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>DashboardSidebar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$menu$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Menu$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/menu.js [app-client] (ecmascript) <export default as Menu>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sidebar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/sidebar.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$OpenThreadCountContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/hooks/OpenThreadCountContext.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useThreads$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/hooks/useThreads.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/ui/cn.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$AutonomyPill$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/AutonomyPill.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$Logo$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/sidebar/Logo.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$MobileBottomBar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileBottomBar.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$MobileNavSheet$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/sidebar/MobileNavSheet.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$SidebarNavContent$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/sidebar/SidebarNavContent.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$useNavAuth$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/sidebar/useNavAuth.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
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
function useDashboardOpenCount() {
    _s();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    const onTickets = pathname.startsWith("/dashboard/tickets");
    const { override } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$OpenThreadCountContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useOpenThreadCountOverride"])();
    const { count: polledCount } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useThreads$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useOpenThreadCountQuery"])(!onTickets);
    return onTickets ? override ?? polledCount : polledCount;
}
_s(useDashboardOpenCount, "jCJS0GN9HVTybNyMvS7ihZzY9ss=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$OpenThreadCountContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useOpenThreadCountOverride"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useThreads$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useOpenThreadCountQuery"]
    ];
});
function DashboardSidebarContent({ children, initialAutonomyTier, agentName }) {
    _s1();
    const openCount = useDashboardOpenCount();
    const navAuth = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$useNavAuth$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useNavAuth"])(initialAutonomyTier);
    const [isSwitching, setIsSwitching] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [mobileNavOpen, setMobileNavOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "DashboardSidebarContent.useEffect": ()=>{
            document.documentElement.classList.add("dashboard-locked");
            document.body.classList.add("dashboard-locked");
            return ({
                "DashboardSidebarContent.useEffect": ()=>{
                    document.documentElement.classList.remove("dashboard-locked");
                    document.body.classList.remove("dashboard-locked");
                }
            })["DashboardSidebarContent.useEffect"];
        }
    }["DashboardSidebarContent.useEffect"], []);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            isSwitching && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-center justify-center",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex items-center gap-3 text-white/60",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "size-4 rounded-full border-2 border-white/20 border-t-white/70 animate-spin"
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/DashboardSidebar.tsx",
                            lineNumber: 55,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "text-sm font-medium",
                            children: "Switching workspace…"
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/DashboardSidebar.tsx",
                            lineNumber: 56,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/DashboardSidebar.tsx",
                    lineNumber: 54,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/DashboardSidebar.tsx",
                lineNumber: 53,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sidebar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SidebarProvider"], {
                className: "flex-1 min-h-0 w-full overflow-x-hidden",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sidebar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Sidebar"], {
                        className: "max-md:hidden border-r-0 bg-background",
                        collapsible: "offcanvas",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$SidebarNavContent$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SidebarNavContent"], {
                            openCount: openCount,
                            onSwitching: setIsSwitching,
                            navAuth: navAuth,
                            agentName: agentName
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/DashboardSidebar.tsx",
                            lineNumber: 63,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/DashboardSidebar.tsx",
                        lineNumber: 62,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$sidebar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SidebarInset"], {
                        className: "flex-1 min-h-0 overflow-hidden bg-background flex flex-col",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                "data-dashboard-mobile-header": true,
                                className: "md:hidden flex items-center justify-between px-4 h-14 border-b border-border shrink-0 bg-sidebar",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$Logo$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Logo"], {}, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/DashboardSidebar.tsx",
                                        lineNumber: 71,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-center gap-1",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$AutonomyPill$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                                tier: navAuth.autonomyTier,
                                                compact: true
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/DashboardSidebar.tsx",
                                                lineNumber: 73,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                onClick: ()=>setMobileNavOpen(true),
                                                "aria-label": "Open navigation",
                                                className: "p-2 rounded-md text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$menu$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Menu$3e$__["Menu"], {
                                                    className: "size-5"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/DashboardSidebar.tsx",
                                                    lineNumber: 80,
                                                    columnNumber: 17
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/DashboardSidebar.tsx",
                                                lineNumber: 74,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/DashboardSidebar.tsx",
                                        lineNumber: 72,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/DashboardSidebar.tsx",
                                lineNumber: 67,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("dashboard-content flex-1 min-h-0 overflow-hidden flex flex-col md:pb-0", "pb-16"),
                                children: children
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/DashboardSidebar.tsx",
                                lineNumber: 85,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/DashboardSidebar.tsx",
                        lineNumber: 66,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/DashboardSidebar.tsx",
                lineNumber: 61,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$MobileNavSheet$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MobileNavSheet"], {
                open: mobileNavOpen,
                onClose: ()=>setMobileNavOpen(false),
                openCount: openCount,
                onSwitching: setIsSwitching,
                navAuth: navAuth,
                agentName: agentName
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/DashboardSidebar.tsx",
                lineNumber: 96,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$MobileBottomBar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MobileBottomBar"], {
                openCount: openCount,
                agentName: agentName
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/DashboardSidebar.tsx",
                lineNumber: 105,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true);
}
_s1(DashboardSidebarContent, "mz8Fn6Z8N9qwde4yXe3VfLePGHQ=", false, function() {
    return [
        useDashboardOpenCount,
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$sidebar$2f$useNavAuth$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useNavAuth"]
    ];
});
_c = DashboardSidebarContent;
function DashboardSidebar({ children, initialAutonomyTier, agentName }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$OpenThreadCountContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OpenThreadCountProvider"], {
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(DashboardSidebarContent, {
            initialAutonomyTier: initialAutonomyTier,
            agentName: agentName,
            children: children
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/DashboardSidebar.tsx",
            lineNumber: 121,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/DashboardSidebar.tsx",
        lineNumber: 120,
        columnNumber: 5
    }, this);
}
_c1 = DashboardSidebar;
var _c, _c1;
__turbopack_context__.k.register(_c, "DashboardSidebarContent");
__turbopack_context__.k.register(_c1, "DashboardSidebar");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/help/content/getting-started.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "gettingStarted",
    ()=>gettingStarted
]);
const gettingStarted = {
    id: "getting-started",
    title: "Getting Started",
    description: "Connect your first channel and receive your first ticket",
    icon: "🚀",
    articles: [
        {
            id: "quick-start",
            title: "Quick start guide",
            body: [
                {
                    text: "Get Shopkeeper up and running in three steps. You'll be receiving and replying to customer messages in minutes."
                },
                {
                    heading: "Step 1 — Connect a channel",
                    steps: [
                        "Go to the Integrations page from the sidebar.",
                        "Choose a channel — Gmail or Instagram are the best starting points.",
                        "Follow the on-screen connection flow.",
                        "Once connected, a green indicator will appear on the integration card."
                    ]
                },
                {
                    heading: "Step 2 — Receive your first ticket",
                    steps: [
                        "Ask someone to send a message to your connected email or Instagram account.",
                        "Within seconds, a new ticket will appear in the Inbox.",
                        "A badge on the sidebar icon shows the number of open tickets."
                    ]
                },
                {
                    heading: "Step 3 — Reply and resolve",
                    steps: [
                        "Click a ticket to open the conversation.",
                        "Type a reply in the composer at the bottom, or use Draft with Shopkeeper to generate an AI reply.",
                        "Hit Send to deliver your message back to the customer.",
                        "When the issue is resolved, click the Resolve button in the top-right of the conversation."
                    ]
                }
            ]
        },
        {
            id: "platform-overview",
            title: "Platform overview",
            body: [
                {
                    text: "Shopkeeper is a unified helpdesk that pulls customer messages from multiple channels into one inbox. Here's a quick map of the interface."
                },
                {
                    heading: "Sidebar",
                    text: "The dark sidebar on the left holds your main navigation. Use the collapse toggle on its edge to save space. Hover any icon for a tooltip label."
                },
                {
                    heading: "Home",
                    text: "Your home page shows open ticket count, total resolved, and messages handled at a glance. Recent Activity shows the latest tickets across all channels. Needs Attention surfaces the most active open tickets."
                },
                {
                    heading: "Inbox",
                    text: "The Inbox is your main workspace. The left panel lists all tickets — filter by Open or Closed, and by channel using the icon chips. Click any ticket to open the conversation. The right panel shows customer info and the AI-generated context summary."
                },
                {
                    heading: "Integrations",
                    text: "Connect and manage your channels here. Each card shows connection status and lets you add or remove accounts."
                },
                {
                    heading: "Settings",
                    text: "Configure your business name, AI context, and brand voice here. These settings directly affect how Shopkeeper drafts replies."
                }
            ]
        }
    ]
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/help/content/tickets.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "tickets",
    ()=>tickets
]);
const tickets = {
    id: "tickets",
    title: "Tickets",
    description: "How to manage, reply to, and resolve customer tickets",
    icon: "🎫",
    articles: [
        {
            id: "open-reply-resolve",
            title: "Opening, replying, and resolving tickets",
            body: [
                {
                    text: "Every inbound customer message becomes a ticket in Shopkeeper. Here's the full lifecycle."
                },
                {
                    heading: "Opening a ticket",
                    steps: [
                        "Open the Inbox from the sidebar.",
                        "New messages appear automatically in the Open tab.",
                        "Click any ticket row to open the conversation on the right."
                    ]
                },
                {
                    heading: "Replying to a customer",
                    steps: [
                        "Type your message in the composer at the bottom of the conversation.",
                        "Alternatively, click Draft with Shopkeeper to generate an AI-assisted reply.",
                        "Review the message, edit if needed, then click Send.",
                        "Your reply is delivered back to the customer on their original channel (email, Instagram, etc.)."
                    ]
                },
                {
                    heading: "Resolving a ticket",
                    steps: [
                        "Once the issue is handled, click the Resolve button in the top-right of the conversation.",
                        "The ticket moves to the Closed tab.",
                        "Closed tickets are read-only — you can view the full history but cannot reply."
                    ]
                }
            ]
        },
        {
            id: "ticket-statuses",
            title: "Ticket statuses explained",
            body: [
                {
                    text: "Each ticket has a status that tells you where it is in the support workflow."
                },
                {
                    heading: "Open",
                    text: "The ticket is active and awaiting a reply or resolution. Open tickets appear in the Open tab and count toward the badge on the sidebar icon."
                },
                {
                    heading: "Closed",
                    text: "The ticket has been resolved. It moves to the Closed tab and is no longer counted as active. You can reopen a closed ticket by switching to the Closed tab and viewing the thread."
                }
            ]
        },
        {
            id: "filtering-tickets",
            title: "Filtering and finding tickets",
            body: [
                {
                    text: "Use the filter controls at the top of the ticket list to narrow down what you see."
                },
                {
                    heading: "Open / Closed tab",
                    text: "Switch between active and resolved tickets with the tab selector at the top of the list."
                },
                {
                    heading: "Channel filter",
                    text: "Click any channel icon chip (Gmail, Instagram, etc.) to show only tickets from that source. Click All to clear the filter."
                },
                {
                    heading: "Deep-linking from home",
                    text: "Clicking a ticket in Recent Activity or Needs Attention on the Home page will take you directly to that conversation — no need to search manually."
                },
                {
                    tips: [
                        "The ticket count shown above the list updates as you apply filters.",
                        "Each ticket displays a #ID number — useful for referencing specific tickets."
                    ]
                }
            ]
        }
    ]
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/help/content/ai-features.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "aiFeatures",
    ()=>aiFeatures
]);
const aiFeatures = {
    id: "ai-features",
    title: "AI Features",
    description: "How Shopkeeper uses AI to help you respond faster",
    icon: "✦",
    articles: [
        {
            id: "shopkeeper-context",
            title: "How Shopkeeper Context works",
            body: [
                {
                    text: "Every open ticket has a Shopkeeper Context panel on the right side of the conversation. This is an AI-generated summary of the conversation that gives you instant context without reading every message."
                },
                {
                    heading: "What it summarises",
                    steps: [
                        "The customer's core question or complaint.",
                        "Key details mentioned (order numbers, product names, dates).",
                        "The current state of the conversation — whether it's been responded to or is still pending."
                    ]
                },
                {
                    heading: "Refreshing the summary",
                    steps: [
                        "Click the refresh icon (↺) next to the Shopkeeper Context heading.",
                        "Shopkeeper will re-analyse the full conversation and update the summary.",
                        "This is useful after you've sent a reply and the conversation has moved forward."
                    ]
                },
                {
                    tips: [
                        "Summaries are generated automatically when a new message arrives.",
                        "Long conversations benefit most from refreshing — early summaries may not reflect recent messages."
                    ]
                }
            ]
        },
        {
            id: "draft-with-shopkeeper",
            title: "Drafting replies with AI",
            body: [
                {
                    text: "Draft with Shopkeeper reads the full conversation and generates a suggested reply in your brand's voice. You can edit it before sending."
                },
                {
                    heading: "How to use it",
                    steps: [
                        "Open any ticket in the Open tab.",
                        "Click Draft with Shopkeeper in the bottom-left of the composer.",
                        "Wait a moment while Shopkeeper analyses the thread.",
                        "The suggested reply appears in the text box — edit it as needed.",
                        "Click Send when you're happy with it."
                    ]
                },
                {
                    heading: "How to get better drafts",
                    steps: [
                        "Go to Settings and fill in the AI Context field with your brand name, what you sell, and any key policies (e.g. return window, shipping times).",
                        "Set a Brand Voice to tell Shopkeeper how to write — e.g. 'friendly and concise' or 'professional and formal'.",
                        "The more context you provide, the more accurate and on-brand the drafts will be."
                    ]
                },
                {
                    tips: [
                        "Always review AI drafts before sending — they're a starting point, not a final answer.",
                        "If a draft misses the point, try refreshing the Shopkeeper Context summary first, then draft again."
                    ]
                }
            ]
        }
    ]
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/help/content/integrations.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "integrations",
    ()=>integrations
]);
const integrations = {
    id: "integrations",
    title: "Channels & Integrations",
    description: "Connecting Gmail, Instagram, and other channels",
    icon: "🔗",
    articles: [
        {
            id: "connect-gmail",
            title: "Connecting Gmail / Email",
            body: [
                {
                    text: "Email is the most common support channel. Connecting it routes messages sent to your support address directly into Shopkeeper as tickets."
                },
                {
                    heading: "How to connect",
                    steps: [
                        "Go to the Integrations page.",
                        "Click Connect on the Gmail / Email card.",
                        "Enter your support email address (e.g. support@yourstore.com).",
                        "Click Save.",
                        "Set up email forwarding from that address to the inbound address shown in Shopkeeper."
                    ]
                },
                {
                    heading: "Setting up forwarding in Gmail",
                    steps: [
                        "In Gmail, go to Settings → See all settings → Forwarding and POP/IMAP.",
                        "Click Add a forwarding address and paste your Shopkeeper inbound address.",
                        "Confirm the verification email that Gmail sends.",
                        "Set 'Forward a copy of incoming mail' to your Shopkeeper address."
                    ]
                },
                {
                    tips: [
                        "Only new emails received after forwarding is set up will appear as tickets.",
                        "You can connect multiple email addresses — each appears as a separate integration."
                    ]
                }
            ]
        },
        {
            id: "connect-instagram",
            title: "Connecting Instagram DMs",
            body: [
                {
                    text: "Connect your Instagram Business account to receive Direct Messages as tickets in Shopkeeper."
                },
                {
                    heading: "Requirements",
                    steps: [
                        "An Instagram Business account (not a personal account).",
                        "The Instagram account must be linked to a Facebook Page.",
                        "You must be an admin of that Facebook Page."
                    ]
                },
                {
                    heading: "How to connect",
                    steps: [
                        "Go to the Integrations page.",
                        "Click Connect on the Instagram card.",
                        "You'll be redirected to Facebook to authorise Shopkeeper.",
                        "Select the Facebook Page linked to your Instagram account.",
                        "Grant the requested permissions and confirm.",
                        "You'll be redirected back to Shopkeeper — a green Connected badge will appear."
                    ]
                },
                {
                    tips: [
                        "If you see a 'No Instagram Business account found' error, make sure your Instagram account is set to Business (not Creator or Personal) and is linked to your Facebook Page.",
                        "Classic Page admin access is required — Business Portfolio access alone is not sufficient."
                    ]
                }
            ]
        },
        {
            id: "channel-disconnected",
            title: "What to do if a channel disconnects",
            body: [
                {
                    text: "Channels can occasionally disconnect due to expired tokens or permission changes. Here's how to fix it."
                },
                {
                    heading: "Signs a channel has disconnected",
                    steps: [
                        "No new tickets are arriving from a channel you expect messages from.",
                        "The integration card on the Integrations page may show a warning."
                    ]
                },
                {
                    heading: "How to reconnect",
                    steps: [
                        "Go to the Integrations page.",
                        "Find the affected channel and click Reconnect.",
                        "Complete the authorisation flow again.",
                        "New messages will resume appearing as tickets."
                    ]
                },
                {
                    tips: [
                        "Instagram tokens can expire if you change your Facebook password or revoke app permissions. Reconnecting always fixes this.",
                        "For email, check that your forwarding rule is still active in Gmail settings."
                    ]
                }
            ]
        }
    ]
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/help/content/settings.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "settings",
    ()=>settings
]);
const settings = {
    id: "settings",
    title: "Settings",
    description: "Configure your business name, AI context, and brand voice",
    icon: "⚙️",
    articles: [
        {
            id: "business-name",
            title: "Updating your business name",
            body: [
                {
                    text: "Your business name appears in the top header bar and is used by Shopkeeper's AI when drafting replies."
                },
                {
                    heading: "How to update it",
                    steps: [
                        "Click Settings in the sidebar.",
                        "Find the Business Name field at the top of the page.",
                        "Type your new name and click Save.",
                        "The name in the header bar will update immediately."
                    ]
                }
            ]
        },
        {
            id: "ai-context",
            title: "AI context and brand voice",
            body: [
                {
                    text: "These two settings are the most important for getting high-quality AI drafts. They tell Shopkeeper who you are and how you communicate."
                },
                {
                    heading: "AI Context",
                    text: "This is a short description of your business that Shopkeeper reads before every draft. Include: what you sell, your return / refund policy, typical shipping times, and any information customers frequently ask about."
                },
                {
                    heading: "Example AI Context",
                    text: "\"We are The Case Market, a phone case brand. We ship within 2–3 business days. Returns are accepted within 30 days for unused items. We do not offer exchanges, only refunds.\""
                },
                {
                    heading: "Brand Voice",
                    text: "A short instruction on tone. This is appended to every AI draft prompt."
                },
                {
                    heading: "Example Brand Voices",
                    steps: [
                        "Friendly and conversational — use casual language, avoid jargon.",
                        "Professional and concise — keep replies brief and formal.",
                        "Warm and empathetic — acknowledge the customer's frustration before solving."
                    ]
                },
                {
                    tips: [
                        "Even a single sentence of AI context makes a big difference to draft quality.",
                        "Update your AI context whenever your policies change."
                    ]
                }
            ]
        }
    ]
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/help/content/troubleshooting.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "troubleshooting",
    ()=>troubleshooting
]);
const troubleshooting = {
    id: "troubleshooting",
    title: "Troubleshooting",
    description: "Fixes for common issues with tickets and channels",
    icon: "🔧",
    articles: [
        {
            id: "tickets-not-appearing",
            title: "Tickets not appearing",
            body: [
                {
                    text: "If messages aren't showing up as tickets, work through these checks in order."
                },
                {
                    heading: "1. Check your integration is connected",
                    steps: [
                        "Go to the Integrations page.",
                        "Confirm the relevant channel shows a green Connected status.",
                        "If it shows disconnected, click Reconnect and complete the flow."
                    ]
                },
                {
                    heading: "2. Check email forwarding (for Gmail)",
                    steps: [
                        "In Gmail, go to Settings → Forwarding and POP/IMAP.",
                        "Confirm forwarding is enabled and pointing to your Shopkeeper inbound address.",
                        "Send a test email to your support address and wait 30 seconds."
                    ]
                },
                {
                    heading: "3. Check the correct tab",
                    steps: [
                        "In the Inbox, make sure you're on the Open tab, not Closed.",
                        "Clear any channel filters by clicking All."
                    ]
                },
                {
                    tips: [
                        "Tickets arrive in real-time — if you're connected and the email was forwarded correctly, it should appear within a few seconds.",
                        "Spam filters in Gmail can sometimes block forwarding. Check your spam folder."
                    ]
                }
            ]
        },
        {
            id: "instagram-issues",
            title: "Instagram connection issues",
            body: [
                {
                    heading: "'No Instagram Business account found' error",
                    steps: [
                        "Make sure your Instagram account is set to Business mode (Instagram Settings → Account → Switch to Professional Account → Business).",
                        "Confirm your Instagram Business account is linked to a Facebook Page (not just a Business Portfolio).",
                        "Ensure you have classic Page admin access on that Facebook Page.",
                        "Try disconnecting and reconnecting from the Integrations page."
                    ]
                },
                {
                    heading: "DMs are connected but not appearing",
                    steps: [
                        "Instagram only forwards new DMs after the connection is made — historical messages will not appear.",
                        "Make sure the customer messaged your connected Instagram account directly (not a comment).",
                        "Try reconnecting the integration — the token may have expired."
                    ]
                }
            ]
        },
        {
            id: "email-not-routing",
            title: "Email not routing correctly",
            body: [
                {
                    heading: "Emails arriving in Gmail but not in Shopkeeper",
                    steps: [
                        "Confirm forwarding is set up correctly in Gmail Settings → Forwarding and POP/IMAP.",
                        "Check that the forwarding address matches your Shopkeeper inbound address exactly.",
                        "Make sure Gmail hasn't paused forwarding — this can happen after a password change."
                    ]
                },
                {
                    heading: "Duplicate tickets appearing",
                    steps: [
                        "If you have multiple forwarding rules pointing to Shopkeeper, each will create a ticket.",
                        "Go to Integrations and remove any duplicate email connections.",
                        "In Gmail, ensure only one forwarding rule is active for your support address."
                    ]
                },
                {
                    tips: [
                        "Send a test email from an external account (not the same Gmail) to verify the full routing chain works end-to-end."
                    ]
                }
            ]
        }
    ]
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/help/content/reference.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "reference",
    ()=>reference
]);
const reference = {
    id: "reference",
    title: "Reference",
    description: "Ticket IDs, data handling, and how things work under the hood",
    icon: "📖",
    articles: [
        {
            id: "ticket-ids",
            title: "How ticket IDs work",
            body: [
                {
                    text: "Every ticket in Shopkeeper has a #ID number displayed in the bottom-right corner of each ticket row. These are sequential within your organisation."
                },
                {
                    heading: "What IDs are used for",
                    steps: [
                        "Referencing a specific conversation when talking to your team.",
                        "Identifying tickets in order (lower number = older ticket).",
                        "IDs are assigned at the time the ticket is created and never change."
                    ]
                },
                {
                    tips: [
                        "IDs are scoped to your organisation — #1 in your account is not the same as #1 in another account."
                    ]
                }
            ]
        },
        {
            id: "data-privacy",
            title: "Data and privacy",
            body: [
                {
                    text: "Shopkeeper stores the minimum data needed to operate your helpdesk."
                },
                {
                    heading: "What Shopkeeper stores",
                    steps: [
                        "Customer platform IDs and names (from the connected channel).",
                        "Message content — the text of each message in a thread.",
                        "AI summaries — generated and stored per thread.",
                        "Integration tokens — encrypted access credentials for connected channels."
                    ]
                },
                {
                    heading: "What Shopkeeper does not store",
                    steps: [
                        "Customer payment information.",
                        "Passwords or authentication credentials of your customers.",
                        "Data from channels you have not connected."
                    ]
                },
                {
                    heading: "AI and your data",
                    text: "When you use Draft with Shopkeeper or refresh a Shopkeeper Context summary, the conversation content is sent to an AI model to generate a response. This is used solely to produce the summary or draft — it is not used to train models."
                }
            ]
        },
        {
            id: "channel-types",
            title: "Supported channel types",
            body: [
                {
                    text: "Shopkeeper currently supports the following channels for receiving customer messages."
                },
                {
                    heading: "Gmail / Email",
                    text: "Inbound emails forwarded to your Shopkeeper address become tickets. Replies are sent back via your configured sender address."
                },
                {
                    heading: "Instagram DMs",
                    text: "Direct Messages sent to your Instagram Business account appear as tickets. Replies are delivered back as Instagram DMs."
                },
                {
                    heading: "Coming soon",
                    steps: [
                        "TikTok — Shop messages and video comments.",
                        "Shopify — Order and Inbox messages."
                    ]
                }
            ]
        }
    ]
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/help/content/tips.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "tips",
    ()=>tips
]);
const tips = {
    id: "tips",
    title: "Tips & Strategies",
    description: "Best practices for social commerce and customer support",
    icon: "💡",
    articles: [
        {
            id: "tiktok-dm-strategy",
            title: "TikTok DM strategy: turning comments into conversions",
            summary: "TikTok comments are buying signals. Learn how to move high-intent commenters into DMs and close the sale.",
            tag: "Strategy",
            readingTime: 4,
            body: [
                {
                    text: "TikTok comments are one of the highest-intent signals a brand can get. When someone asks 'where can I buy this?' or 'does this come in blue?', that's a buying signal — and moving them into a DM conversation is where the sale happens."
                },
                {
                    callout: "TikTok's algorithm boosts videos with active comment threads. Responding fast doesn't just convert commenters — it pushes your video to more people."
                },
                {
                    heading: "Reply fast to high-intent comments",
                    text: "Aim to respond to product questions within 30 minutes. The faster you engage, the higher the chance the commenter is still in a buying mindset.",
                    steps: [
                        "Pin a comment that says 'DM us for details' on product videos",
                        "Use the TikTok comment reply feature to send a short video reply, then direct to DMs for specifics",
                        "Set up your agent to handle common DM questions instantly (sizing, shipping, availability)"
                    ]
                },
                {
                    heading: "What to say in the first DM",
                    tips: [
                        "Reference the video they came from — it shows you're paying attention",
                        "Ask one qualifying question (e.g., 'Which color were you interested in?') before pitching",
                        "Keep it conversational — TikTok audiences expect casual, not corporate"
                    ]
                },
                {
                    heading: "When to escalate to a human",
                    text: "Let your agent handle FAQs. Escalate to a human when: the customer mentions a problem with a past order, they ask for a discount or custom deal, or they've sent 3+ messages without converting.",
                    warning: "Never let an upset customer wait more than 10 minutes without a human response. Sentiment can shift fast on social platforms."
                }
            ]
        },
        {
            id: "instagram-dm-volume",
            title: "Managing high-volume Instagram DMs without burnout",
            summary: "When a post goes viral, DM volume can spike 10x overnight. Here's how to build a system that scales with you.",
            tag: "Strategy",
            readingTime: 5,
            body: [
                {
                    text: "When a post goes viral or a campaign hits, DM volume can spike 10x overnight. Without a system, this overwhelms your team and tanks your response time — which Instagram's algorithm tracks and uses to rank your account."
                },
                {
                    heading: "Triage before you reply",
                    steps: [
                        "Use tags to separate order issues, product questions, collabs, and spam",
                        "Prioritize DMs from verified accounts and existing customers first",
                        "Set your agent to instantly acknowledge all new DMs so customers know they're in the queue"
                    ]
                },
                {
                    heading: "Build a response library",
                    text: "Your team spends 80% of their time answering 20% of the same questions. Identify your top 10 most common DM topics and write templated replies for each. Store these in your agent's memory so it handles them automatically.",
                    tips: [
                        "Shipping timelines",
                        "Return and refund policy",
                        "Size guides and product availability",
                        "Discount code requests",
                        "Collab and PR inquiries"
                    ]
                },
                {
                    heading: "Set working hours expectations",
                    text: "Add an auto-reply that tells customers your response hours. Keep it specific and friendly.",
                    callout: "Example: 'We reply to all DMs Monday–Friday, 9am–6pm EST. For urgent order issues, email us at support@…'"
                },
                {
                    warning: "Avoid the trap of responding to every DM manually during a spike — you'll burn out fast and still fall behind. Build the system first, then reply."
                }
            ]
        },
        {
            id: "response-time-expectations",
            title: "Setting customer response time expectations that stick",
            summary: "The #1 driver of customer frustration isn't slow responses — it's not knowing how long to wait.",
            tag: "Customer Service",
            readingTime: 3,
            body: [
                {
                    text: "The number one driver of customer frustration isn't slow response times — it's not knowing how long to wait. Setting clear expectations upfront prevents the follow-up 'hello??' message and buys your team breathing room."
                },
                {
                    heading: "The expectation-setting formula",
                    steps: [
                        "Acknowledge instantly: use an auto-reply to confirm their message was received",
                        "Set a specific window: '1 business day' is better than 'as soon as possible'",
                        "Deliver before the deadline: if you say 24 hours, aim for 12"
                    ]
                },
                {
                    callout: "Customers who get an instant acknowledgement report 40% higher satisfaction even when the actual resolution takes longer."
                },
                {
                    heading: "Where to set expectations",
                    tips: [
                        "DM auto-reply (Instagram, TikTok)",
                        "Your bio or link-in-bio page",
                        "Order confirmation emails",
                        "Your website's Contact page"
                    ]
                },
                {
                    heading: "When you'll miss the window",
                    text: "Send a proactive update before the deadline, not after. This resets the clock and builds trust instead of eroding it.",
                    callout: "Template: 'Hey! Still working on your question — we'll have an answer by tomorrow morning. Thanks for your patience.'"
                }
            ]
        },
        {
            id: "support-phrases",
            title: "5 customer service phrases that build loyalty",
            summary: "The words you use in support conversations directly affect whether customers come back. These five phrases work.",
            tag: "Customer Service",
            readingTime: 3,
            body: [
                {
                    text: "The words you use in support conversations directly affect whether customers come back. These five phrases are proven to de-escalate frustration, show empathy, and leave customers feeling heard."
                },
                {
                    heading: "1. 'I completely understand why that's frustrating.'",
                    text: "Validates the customer's emotion without admitting fault. Use this before any explanation or solution — it's the difference between a customer feeling dismissed and a customer feeling heard."
                },
                {
                    heading: "2. 'Let me look into this personally for you.'",
                    text: "Signals ownership. Even if you're handing off to a colleague, this phrase makes the customer feel like they have an advocate working on their side."
                },
                {
                    heading: "3. 'Here's exactly what's going to happen next.'",
                    text: "Removes uncertainty. Customers hate not knowing what comes next — giving a clear next step, even a small one, dramatically reduces anxiety and follow-up messages."
                },
                {
                    heading: "4. 'Is there anything else I can help you with today?'",
                    text: "Closes the loop professionally and catches secondary issues before they become new tickets."
                },
                {
                    heading: "5. 'Thank you for letting us know.'",
                    text: "Reframes complaints as gifts. Customers who complain are telling you how to improve — those who don't just leave quietly.",
                    callout: "Customers who have a complaint resolved well are actually more loyal than those who never had an issue at all."
                }
            ]
        },
        {
            id: "ai-agent-templates",
            title: "How to respond faster with agent templates",
            summary: "Your agent is only as good as what you teach it. Here's how to build a template library that actually deflects tickets.",
            tag: "Agent Setup",
            readingTime: 5,
            body: [
                {
                    text: "Your agent is only as good as what you teach it. The fastest way to increase deflection rate — the % of conversations your agent resolves without human help — is to build a strong library of response templates."
                },
                {
                    heading: "Start with your 10 most common tickets",
                    steps: [
                        "Export your last 30 days of closed tickets from the inbox",
                        "Group them by topic — you'll likely find 5–10 categories cover 70%+ of volume",
                        "Write a clear, friendly response for each and add it to your agent's memory"
                    ]
                },
                {
                    heading: "Template structure that works",
                    tips: [
                        "Acknowledge: reference what they asked about",
                        "Answer: give the direct answer in plain language",
                        "Offer more: 'Does that help? Let me know if you need anything else.'"
                    ]
                },
                {
                    callout: "A good template sounds like a person, not a policy document. Read it out loud — if it sounds robotic, rewrite it."
                },
                {
                    heading: "What to keep for humans",
                    text: "Don't try to automate everything. Your agent should escalate to a human when the customer is upset, they've asked the same question twice, or the issue involves a specific order that needs investigation.",
                    warning: "Never let the agent apologize for something that wasn't the company's fault — it can create liability. Train it to empathize without assigning blame."
                },
                {
                    heading: "Measure and improve",
                    text: "Check your agent's resolution rate weekly. If a topic keeps escalating to humans, your template for it needs work. Refine the answer, add more detail, and re-test."
                }
            ]
        },
        {
            id: "tags-routing",
            title: "Using tags to route tickets to the right team",
            summary: "As your team grows past 2–3 people, ad-hoc ticket assignment stops working. Tags give you lightweight routing without a complex setup.",
            tag: "Workflow",
            readingTime: 4,
            body: [
                {
                    text: "As your team grows past 2–3 people, ad-hoc ticket assignment stops working. Tags give you a lightweight routing system without needing a complex helpdesk setup."
                },
                {
                    heading: "Set up a simple tag taxonomy",
                    steps: [
                        "Create channel tags: instagram, tiktok, sms, email",
                        "Create topic tags: order-issue, returns, product-question, collab, billing",
                        "Create priority tags: urgent, vip, escalated"
                    ]
                },
                {
                    callout: "Start with fewer tags than you think you need. You can always add more. Over-tagging leads to confusion and inconsistency."
                },
                {
                    heading: "Routing rules to start with",
                    tips: [
                        "All 'returns' tags → your fulfilment team member",
                        "All 'collab' tags → your marketing lead",
                        "All 'urgent' tags → the current on-call person",
                        "Untagged tickets → general queue for first available agent"
                    ]
                },
                {
                    heading: "Let your agent tag automatically",
                    text: "Train your agent to apply topic tags based on message content. When a customer says 'I want to return my order', the agent tags it 'returns' and routes it instantly — no human triage needed.",
                    warning: "Review your agent's auto-tags weekly at first. Misrouted tickets are worse than untagged ones — they create confusion and delay."
                }
            ]
        }
    ]
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/help/content/index.ts [app-client] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ALL_CATEGORIES",
    ()=>ALL_CATEGORIES
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$content$2f$getting$2d$started$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/help/content/getting-started.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$content$2f$tickets$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/help/content/tickets.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$content$2f$ai$2d$features$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/help/content/ai-features.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$content$2f$integrations$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/help/content/integrations.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$content$2f$settings$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/help/content/settings.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$content$2f$troubleshooting$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/help/content/troubleshooting.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$content$2f$reference$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/help/content/reference.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$content$2f$tips$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/help/content/tips.ts [app-client] (ecmascript)");
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
const ALL_CATEGORIES = [
    __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$content$2f$getting$2d$started$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["gettingStarted"],
    __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$content$2f$tickets$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["tickets"],
    __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$content$2f$ai$2d$features$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["aiFeatures"],
    __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$content$2f$integrations$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["integrations"],
    __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$content$2f$settings$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["settings"],
    __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$content$2f$troubleshooting$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["troubleshooting"],
    __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$content$2f$reference$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["reference"],
    __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$content$2f$tips$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["tips"]
];
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/help/HelpHome.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>HelpHome
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
"use client";
;
function HelpHome({ categories, onSelectCategory }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "p-5 space-y-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-xs font-bold text-muted-foreground uppercase tracking-widest",
                children: "Topics"
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpHome.tsx",
                lineNumber: 13,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-1.5",
                children: categories.map((cat)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>onSelectCategory(cat),
                        className: "w-full flex items-center gap-3 px-3.5 py-3 rounded-md border border-border hover:border-border/70 hover:bg-muted transition-all text-left group",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-lg shrink-0",
                                children: cat.icon
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpHome.tsx",
                                lineNumber: 21,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex-1 min-w-0",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-sm font-semibold text-foreground group-hover:text-foreground transition-colors",
                                        children: cat.title
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpHome.tsx",
                                        lineNumber: 23,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-xs text-muted-foreground truncate mt-0.5",
                                        children: cat.description
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpHome.tsx",
                                        lineNumber: 26,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpHome.tsx",
                                lineNumber: 22,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-xs font-semibold text-muted-foreground/60 shrink-0",
                                children: cat.articles.length
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpHome.tsx",
                                lineNumber: 28,
                                columnNumber: 13
                            }, this)
                        ]
                    }, cat.id, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpHome.tsx",
                        lineNumber: 16,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpHome.tsx",
                lineNumber: 14,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpHome.tsx",
        lineNumber: 12,
        columnNumber: 5
    }, this);
}
_c = HelpHome;
var _c;
__turbopack_context__.k.register(_c, "HelpHome");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/help/HelpCategory.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>HelpCategory
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/chevron-right.js [app-client] (ecmascript) <export default as ChevronRight>");
"use client";
;
;
function HelpCategory({ category, onSelectArticle }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "p-5 space-y-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xl",
                        children: category.icon
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpCategory.tsx",
                        lineNumber: 15,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: "text-base font-bold text-foreground",
                        children: category.title
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpCategory.tsx",
                        lineNumber: 16,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpCategory.tsx",
                lineNumber: 14,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-sm text-muted-foreground -mt-2",
                children: category.description
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpCategory.tsx",
                lineNumber: 18,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "divide-y divide-border border border-border rounded-md overflow-hidden",
                children: category.articles.map((article)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>onSelectArticle(article),
                        className: "w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted transition-colors text-left group",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors leading-snug",
                                children: article.title
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpCategory.tsx",
                                lineNumber: 27,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                                className: "size-4 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 ml-3 transition-colors"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpCategory.tsx",
                                lineNumber: 30,
                                columnNumber: 13
                            }, this)
                        ]
                    }, article.id, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpCategory.tsx",
                        lineNumber: 22,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpCategory.tsx",
                lineNumber: 20,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpCategory.tsx",
        lineNumber: 13,
        columnNumber: 5
    }, this);
}
_c = HelpCategory;
var _c;
__turbopack_context__.k.register(_c, "HelpCategory");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/help/HelpArticle.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>HelpArticle
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
"use client";
;
function HelpArticle({ article }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "p-5 space-y-5",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                className: "text-base font-bold text-foreground leading-snug",
                children: article.title
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpArticle.tsx",
                lineNumber: 8,
                columnNumber: 7
            }, this),
            article.body.map((section)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "space-y-2",
                    children: [
                        section.heading && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-xs font-bold text-foreground uppercase tracking-wide",
                            children: section.heading
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpArticle.tsx",
                            lineNumber: 13,
                            columnNumber: 13
                        }, this),
                        section.text && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-sm text-muted-foreground leading-relaxed",
                            children: section.text
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpArticle.tsx",
                            lineNumber: 17,
                            columnNumber: 13
                        }, this),
                        section.steps && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ol", {
                            className: "space-y-2",
                            children: section.steps.map((step, j)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                    className: "flex gap-3 text-sm text-muted-foreground leading-relaxed",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "shrink-0 size-5 rounded-full bg-muted text-muted-foreground text-xs font-bold flex items-center justify-center mt-0.5",
                                            children: j + 1
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpArticle.tsx",
                                            lineNumber: 24,
                                            columnNumber: 19
                                        }, this),
                                        step
                                    ]
                                }, step, true, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpArticle.tsx",
                                    lineNumber: 23,
                                    columnNumber: 19
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpArticle.tsx",
                            lineNumber: 21,
                            columnNumber: 13
                        }, this),
                        section.tips && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "bg-amber-400/10 border border-amber-400/20 rounded-md px-3.5 py-3 space-y-1.5",
                            children: section.tips.map((tip)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-xs text-amber-400 leading-relaxed flex gap-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "shrink-0 mt-px",
                                            children: "💡"
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpArticle.tsx",
                                            lineNumber: 37,
                                            columnNumber: 19
                                        }, this),
                                        tip
                                    ]
                                }, tip, true, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpArticle.tsx",
                                    lineNumber: 36,
                                    columnNumber: 17
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpArticle.tsx",
                            lineNumber: 34,
                            columnNumber: 13
                        }, this)
                    ]
                }, section.heading ?? section.text ?? section.steps?.join("|") ?? section.tips?.join("|"), true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpArticle.tsx",
                    lineNumber: 11,
                    columnNumber: 9
                }, this))
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpArticle.tsx",
        lineNumber: 7,
        columnNumber: 5
    }, this);
}
_c = HelpArticle;
var _c;
__turbopack_context__.k.register(_c, "HelpArticle");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/help/HelpPanel.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>HelpPanel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/x.js [app-client] (ecmascript) <export default as X>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$left$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronLeft$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/chevron-left.js [app-client] (ecmascript) <export default as ChevronLeft>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$content$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/help/content/index.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$HelpHome$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/help/HelpHome.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$HelpCategory$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/help/HelpCategory.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$HelpArticle$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/help/HelpArticle.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$HelpContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/help/HelpContext.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
;
;
function HelpPanel() {
    _s();
    const { isOpen, closeHelp } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$HelpContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useHelp"])();
    const [view, setView] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        type: "home"
    });
    function handleSelectArticle(category, article) {
        setView({
            type: "article",
            category,
            article
        });
    }
    const handleClose = ()=>{
        setView({
            type: "home"
        });
        closeHelp();
    };
    const goBack = ()=>{
        if (view.type === "article") setView({
            type: "category",
            category: view.category
        });
        else if (view.type === "category") setView({
            type: "home"
        });
    };
    const subtitle = view.type === "home" ? "Home" : view.type === "category" ? view.category.title : view.article.title;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `shrink-0 border-l border-border bg-background flex flex-col overflow-hidden transition-all duration-300 ease-in-out
        ${isOpen ? "fixed inset-0 z-50 w-full md:static md:w-72" : "w-0"}
      `,
        children: isOpen && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex items-start justify-between px-5 pt-5 pb-4 border-b border-border shrink-0",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-start gap-2 min-w-0",
                            children: [
                                view.type !== "home" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: goBack,
                                    className: "mt-0.5 text-muted-foreground hover:text-foreground transition-colors shrink-0",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$left$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronLeft$3e$__["ChevronLeft"], {
                                        className: "size-4"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpPanel.tsx",
                                        lineNumber: 55,
                                        columnNumber: 19
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpPanel.tsx",
                                    lineNumber: 51,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "min-w-0",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "text-base font-bold text-foreground leading-none",
                                            children: "Help"
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpPanel.tsx",
                                            lineNumber: 59,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "text-xs text-muted-foreground mt-1 truncate",
                                            children: subtitle
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpPanel.tsx",
                                            lineNumber: 60,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpPanel.tsx",
                                    lineNumber: 58,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpPanel.tsx",
                            lineNumber: 49,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: handleClose,
                            className: "size-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-border/70 transition-colors shrink-0 mt-0.5",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                                className: "size-3.5"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpPanel.tsx",
                                lineNumber: 67,
                                columnNumber: 15
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpPanel.tsx",
                            lineNumber: 63,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpPanel.tsx",
                    lineNumber: 48,
                    columnNumber: 11
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex-1 overflow-y-auto",
                    children: [
                        view.type === "home" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$HelpHome$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            categories: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$content$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["ALL_CATEGORIES"],
                            onSelectCategory: (cat)=>setView({
                                    type: "category",
                                    category: cat
                                })
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpPanel.tsx",
                            lineNumber: 74,
                            columnNumber: 15
                        }, this),
                        view.type === "category" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$HelpCategory$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            category: view.category,
                            onSelectArticle: (article)=>handleSelectArticle(view.category, article)
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpPanel.tsx",
                            lineNumber: 80,
                            columnNumber: 15
                        }, this),
                        view.type === "article" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$HelpArticle$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            article: view.article
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpPanel.tsx",
                            lineNumber: 86,
                            columnNumber: 15
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpPanel.tsx",
                    lineNumber: 72,
                    columnNumber: 11
                }, this)
            ]
        }, void 0, true)
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/help/HelpPanel.tsx",
        lineNumber: 40,
        columnNumber: 5
    }, this);
}
_s(HelpPanel, "bjagKandbJ02FPf4xq+vov051xE=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$help$2f$HelpContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useHelp"]
    ];
});
_c = HelpPanel;
var _c;
__turbopack_context__.k.register(_c, "HelpPanel");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/tools/result.js [app-client] (ecmascript)", ((__turbopack_context__) => {
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/tools/registry/helpers.js [app-client] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-client] (ecmascript)");
;
const noShopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])("Error: no Shopify integration connected.");
const noThread = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])("Error: this tool requires a conversation thread.");
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/tools/registry/schema.js [app-client] (ecmascript)", ((__turbopack_context__) => {
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/tools/registry/customer.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CUSTOMER_TOOL_DEFINITIONS",
    ()=>CUSTOMER_TOOL_DEFINITIONS
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/helpers.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/schema.js [app-client] (ecmascript)");
;
;
const CUSTOMER_TOOL_DEFINITIONS = [
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "search_shopify_customers",
        description: "Search for Shopify customers by name or email. Use this when given a customer's name or email address to resolve their Shopify customer ID before calling other customer tools.",
        fields: {
            query: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Name or email to search for (e.g. 'Jane Smith' or 'jane@example.com').", {
                required: true
            }),
            limit: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["numberArg"])("Maximum number of results to return (default 5, max 10).")
        },
        category: "read",
        group: "customer",
        label: "Searched customers",
        planStepLabel: "Search Shopify customers",
        execute: async (input, ctx, _settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.searchShopifyCustomers(input, shopify) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["noShopify"];
        }
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "get_shopify_customer",
        description: "Fetch the Shopify customer profile (name, email, phone, address, order count, total spent). Call this first whenever you need customer details.",
        fields: {
            customer_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("The Shopify customer ID (already available in context if the thread is linked).", {
                required: true
            })
        },
        category: "read",
        group: "customer",
        label: "Fetched customer",
        planStepLabel: "Fetch customer profile",
        execute: async (input, ctx, _settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.getShopifyCustomer(input, shopify) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["noShopify"];
        }
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "update_shopify_customer_info",
        description: "Update basic Shopify customer info: first name, last name, email, or phone.",
        fields: {
            customer_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Shopify customer ID.", {
                required: true
            }),
            first_name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("First name."),
            last_name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Last name."),
            email: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Email address."),
            phone: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Phone number.")
        },
        category: "action",
        group: "customer",
        label: "Updated customer info",
        planStepLabel: "Update customer info on Shopify",
        execute: async (input, ctx, _settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.updateShopifyCustomerInfo(input, shopify) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["noShopify"];
        }
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "add_shopify_customer_note",
        description: "Append a note to the Shopify customer record (visible in the Shopify admin).",
        fields: {
            customer_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Shopify customer ID.", {
                required: true
            }),
            note: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("The note text to append.", {
                required: true
            })
        },
        category: "action",
        group: "customer",
        label: "Added Shopify note",
        planStepLabel: "Add note to Shopify customer",
        execute: async (input, ctx, _settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.addShopifyCustomerNote(input, shopify) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["noShopify"];
        }
    })
];
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/tools/registry/knowledge.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "KNOWLEDGE_TOOL_DEFINITIONS",
    ()=>KNOWLEDGE_TOOL_DEFINITIONS
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/helpers.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/schema.js [app-client] (ecmascript)");
;
;
;
const KNOWLEDGE_TOOL_DEFINITIONS = [
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "search_kb",
        description: "Search the organization's knowledge base for articles matching a query. Use this to find store policies, FAQs, or how-to guides before answering customer questions about returns, shipping, or store procedures.",
        fields: {
            query: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Search terms to look for in knowledge base article titles and bodies (e.g. 'return policy', 'shipping times').", {
                required: true
            })
        },
        category: "read",
        group: "knowledge",
        label: "Searched knowledge base",
        planStepLabel: "Search knowledge base",
        execute: async (input, ctx, _settings, deps)=>{
            const words = input.query.trim().split(/\s+/).filter((word)=>word.length >= 2);
            if (words.length === 0) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolNotFound"])("No knowledge base articles found for that query.");
            const articles = await deps.searchKnowledgeBaseArticles(ctx.orgId, words);
            if (articles.length === 0) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolNotFound"])("No knowledge base articles found for that query.");
            const kbThreadCtx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["threadContextOf"])(ctx);
            if (kbThreadCtx) {
                await deps.recordKnowledgeBaseCitations(ctx.orgId, kbThreadCtx.threadId, articles.map((article)=>article.id));
            }
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify(articles.map((article)=>({
                    title: article.title,
                    body: article.body,
                    tags: article.tags
                }))));
        }
    })
];
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/tools/registry/messaging.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MESSAGING_TOOL_DEFINITIONS",
    ()=>MESSAGING_TOOL_DEFINITIONS
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/helpers.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/schema.js [app-client] (ecmascript)");
;
;
const MESSAGING_TOOL_DEFINITIONS = [
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "send_reply",
        description: "Send a message to the customer on their channel (Instagram DM, email, etc.).",
        fields: {
            text: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("The message text to send.", {
                required: true
            })
        },
        category: "communication",
        group: "messaging",
        label: "Sent reply",
        planStepLabel: "Notify customer",
        execute: async (input, ctx)=>ctx.io ? ctx.io.sendReply(input) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["noThread"]
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "send_email",
        description: "Send an outbound email to any email address. Use this to proactively contact a customer (e.g. shipping delay notice) even when the current thread is not an email thread.",
        fields: {
            to: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Recipient email address in user@domain format (e.g. 'jane@example.com'). Must be a valid SMTP address — never a name or phone number.", {
                required: true
            }),
            subject: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Email subject line.", {
                required: true
            }),
            body: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Email body text.", {
                required: true
            })
        },
        category: "communication",
        group: "messaging",
        label: "Sent email",
        planStepLabel: "Send email to customer",
        execute: async (input, ctx)=>ctx.io ? ctx.io.sendEmail(input) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["noThread"]
    })
];
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/tools/registry/order.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ORDER_TOOL_DEFINITIONS",
    ()=>ORDER_TOOL_DEFINITIONS
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/helpers.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/schema.js [app-client] (ecmascript)");
;
;
const ORDER_TOOL_DEFINITIONS = [
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "get_shopify_orders",
        description: "Fetch the most recent Shopify orders for a customer (up to 5), including financial status, fulfillment status, line items, and the order's shipping_address (address1, address2, city, province, zip, country). Use this first for basic order-status questions or to look up the shipping address; if fulfillment_status is null, the order has not shipped yet and you usually do not need get_order_tracking.",
        fields: {
            customer_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Shopify customer ID.", {
                required: true
            })
        },
        category: "read",
        group: "order",
        label: "Fetched orders",
        planStepLabel: "Fetch recent orders",
        execute: async (input, ctx, _settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.getShopifyOrders(input, shopify) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["noShopify"];
        }
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "update_shopify_order_address",
        description: "Update the shipping address on a specific Shopify order AND sync the customer's default address to match (only works for unfulfilled/unshipped orders). The order ID is available in the 'Customer's recent orders' context — use it directly. Pass ALL address components in a single call.",
        fields: {
            order_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Shopify order ID (numeric, e.g. '5678901234'). Use the id field from the orders context.", {
                required: true
            }),
            customer_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Shopify customer ID.", {
                required: true
            }),
            address1: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Street line (e.g. '123 Main St').", {
                required: true
            }),
            address2: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Apartment, suite, unit, etc. (e.g. 'Apt 4B'). Omit if not provided."),
            city: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("City.", {
                required: true
            }),
            province: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("State or province abbreviation (e.g. 'NY', 'CA').", {
                required: true
            }),
            zip: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("ZIP or postal code.", {
                required: true
            }),
            country: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Country name (e.g. 'United States').", {
                required: true
            })
        },
        category: "action",
        group: "order",
        label: "Updated shipping address",
        planStepLabel: "Update shipping address on Shopify",
        execute: async (input, ctx, _settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.updateShopifyOrderAddress(input, shopify) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["noShopify"];
        }
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "get_order_by_name",
        description: "Look up a Shopify order by its human-readable order number (e.g. '#1234'). Use this when the customer mentions an order number. Returns the order ID, financial/fulfillment status, line items, and shipping_address.",
        fields: {
            order_name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("The order number as shown to the customer, e.g. '#1234' or '1234'.", {
                required: true
            })
        },
        category: "read",
        group: "order",
        label: "Looked up order",
        planStepLabel: "Look up order",
        execute: async (input, ctx, _settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.getOrderByName(input, shopify) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["noShopify"];
        }
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "get_order_tracking",
        description: "Fetch live fulfillment and tracking details for a Shopify order. Returns tracking number, carrier, shipment status, estimated delivery date, and the full scan event timeline (including exceptions like return to sender, delivery attempt failed, weather delay, etc.). Use this only when an order is already fulfilled or partially fulfilled, or when someone explicitly needs tracking details such as tracking numbers, carrier scans, delivery events, or delivery exceptions. Do not use it for unfulfilled orders or basic status checks that can be answered from get_shopify_orders.",
        fields: {
            order_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Shopify order ID (numeric, e.g. '5678901234'). Use the id field from the orders context or from get_order_by_name.", {
                required: true
            })
        },
        category: "read",
        group: "order",
        label: "Fetched tracking info",
        planStepLabel: "Fetch order tracking",
        execute: async (input, ctx, _settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.getOrderTracking(input, shopify) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["noShopify"];
        }
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "create_refund",
        description: "Issue a refund on a Shopify order. Always pass an explicit amount (for a full refund, use the order's total from the orders context) so the refund can be validated against the workspace refund limit.",
        fields: {
            order_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Shopify order ID (numeric).", {
                required: true
            }),
            amount: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Amount to refund in the store's currency (e.g. '19.99'). For a full refund, use the order's total from context. Always provide this.", {
                required: true
            }),
            reason: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Reason for the refund (e.g. 'Item not received', 'Wrong item sent').")
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
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            if (!shopify) return __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["noShopify"];
            const refund = await deps.createRefund(input, shopify);
            if (refund.refundedCents !== null && refund.refundedCents > 0) {
                await deps.incrementDailyRefundSpendCents(ctx.orgId, refund.refundedCents);
            }
            return refund;
        }
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "cancel_order",
        description: "Cancel an unfulfilled Shopify order. Only works for orders that have not yet been fulfilled.",
        fields: {
            order_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Shopify order ID (numeric).", {
                required: true
            }),
            reason: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Reason for cancellation.", {
                enum: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cancelReasons"]
            }),
            restock: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["booleanArg"])("Whether to restock the items. Defaults to true.")
        },
        category: "action",
        group: "order",
        label: "Cancelled order",
        planStepLabel: "Cancel order",
        policy: {
            cancellationDisabled: true
        },
        execute: async (input, ctx, _settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.cancelOrder(input, shopify) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["noShopify"];
        }
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "create_shopify_order",
        description: "Create a new Shopify order on behalf of a customer. Each line item must include either a variant_id (for a real catalog product) or a title + price (for a custom item, if allowed). Set financial_status to pending — do not charge the customer.",
        fields: {
            email: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Customer email address.", {
                required: true
            }),
            first_name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Customer first name.", {
                required: true
            }),
            last_name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Customer last name.", {
                required: true
            }),
            address1: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Shipping street address.", {
                required: true
            }),
            address2: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Apartment or suite (optional)."),
            city: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("City.", {
                required: true
            }),
            province: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("State or province abbreviation (e.g. 'NY').", {
                required: true
            }),
            zip: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("ZIP or postal code.", {
                required: true
            }),
            country: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Country name (e.g. 'United States').", {
                required: true
            }),
            line_items: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["arrayArg"])("Items to include in the order.", {
                variant_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Shopify product variant ID. Use this for real catalog products."),
                title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Custom item title. Only provide when variant_id is omitted."),
                price: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Unit price as a decimal string (e.g. '29.99'). Only for custom items."),
                quantity: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["numberArg"])("Quantity.", {
                    required: true
                })
            }, {
                required: true,
                minItems: 1
            }),
            note: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Optional note to attach to the order.")
        },
        category: "action",
        group: "order",
        label: "Created order",
        planStepLabel: "Create Shopify order",
        policy: {
            customLineItemsDisabled: true
        },
        execute: async (input, ctx, settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.createShopifyOrder(input, shopify, {
                allowCustomLineItems: !settings.blockCustomLineItems
            }) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["noShopify"];
        }
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "edit_shopify_order",
        description: "Add, remove, or swap a line item on an existing Shopify order using the Order Editing API. To add an item: provide variant_id and quantity. To remove an item: provide only remove_variant_id from the orders context, no search needed. To swap size/color: provide variant_id (new) and remove_variant_id (old). At least one of variant_id or remove_variant_id must be provided.",
        fields: {
            order_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Shopify order ID (numeric, e.g. '5678901234'). Use the id field from the orders context.", {
                required: true
            }),
            variant_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Variant ID to add. Required when adding or swapping. Omit for pure removal."),
            quantity: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["numberArg"])("Number of units to add. Required when variant_id is provided."),
            remove_variant_id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Variant ID of the existing item to remove. Use for removals and swaps. Available in the orders context — no search needed.")
        },
        category: "action",
        group: "order",
        label: "Edited order",
        planStepLabel: "Edit existing order",
        execute: async (input, ctx, _settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.editShopifyOrder(input, shopify) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["noShopify"];
        }
    })
];
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/tools/registry/product.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PRODUCT_TOOL_DEFINITIONS",
    ()=>PRODUCT_TOOL_DEFINITIONS
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/helpers.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/schema.js [app-client] (ecmascript)");
;
;
const PRODUCT_TOOL_DEFINITIONS = [
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "search_shopify_products",
        description: "Search the Shopify product catalog by title or keyword. Returns matching products with their variants and variant IDs. Use this when the operator describes a product by name (e.g. 'pencil half zip, size L') so you can resolve the correct variant_id before creating an order.",
        fields: {
            query: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Product title or keyword to search for (e.g. 'pencil half zip').", {
                required: true
            }),
            limit: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["numberArg"])("Maximum number of products to return (default 5, max 10).")
        },
        category: "read",
        group: "product",
        label: "Searched products",
        planStepLabel: "Search Shopify products",
        execute: async (input, ctx, _settings, deps)=>{
            const shopify = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireShopify"])(ctx);
            return shopify ? deps.searchShopifyProducts(input, shopify) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["noShopify"];
        }
    })
];
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/tools/support-stats-types.js [app-client] (ecmascript)", ((__turbopack_context__) => {
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/tools/registry/stats.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "STATS_TOOL_DEFINITIONS",
    ()=>STATS_TOOL_DEFINITIONS
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$support$2d$stats$2d$types$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/support-stats-types.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/schema.js [app-client] (ecmascript)");
;
;
;
const STATS_TOOL_DEFINITIONS = [
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "get_support_stats",
        description: "Summarize support activity over the last N days: ticket volume by day, topic, and channel, message counts by sender, and average resolution time. Use this for questions like 'how many tickets came in last week?' or 'what were customers asking about this month?'.",
        fields: {
            days: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["numberArg"])(`Number of days to look back (1-${__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$support$2d$stats$2d$types$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SUPPORT_STATS_MAX_DAYS"]}). Use ${__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$support$2d$stats$2d$types$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SUPPORT_STATS_DEFAULT_DAYS"]} for 'this week', 30 for 'this month'.`, {
                required: true
            })
        },
        category: "read",
        group: "insights",
        label: "Summarized support activity",
        planStepLabel: "Summarize support activity",
        execute: async (input, ctx, _settings, deps)=>{
            const stats = await deps.getSupportStats(ctx.orgId, (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$support$2d$stats$2d$types$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clampSupportStatsDays"])(input.days));
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify(stats));
        }
    })
];
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/tools/registry/thread.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "THREAD_TOOL_DEFINITIONS",
    ()=>THREAD_TOOL_DEFINITIONS
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/helpers.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/schema.js [app-client] (ecmascript)");
;
;
;
const THREAD_TOOL_DEFINITIONS = [
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "add_internal_note",
        description: "Add an internal note to the support thread. Notes are visible only to agents, not the customer. Always call this to document what you did.",
        fields: {
            text: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("Note content.", {
                required: true
            })
        },
        category: "internal",
        group: "thread",
        label: "Added internal note",
        planStepLabel: "Add internal note",
        execute: async (input, ctx)=>ctx.io ? ctx.io.addInternalNote(input) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["noThread"]
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "update_thread_status",
        description: "Update the status of the support thread.",
        fields: {
            status: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("New status for the thread.", {
                required: true,
                enum: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["threadStatuses"]
            })
        },
        category: "internal",
        group: "thread",
        label: "Updated thread status",
        planStepLabel: "Update ticket status",
        execute: async (input, ctx)=>ctx.io ? ctx.io.updateThreadStatus(input) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["noThread"]
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "update_thread_tag",
        description: "Update the topic tag on the support thread.",
        fields: {
            tag: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("New tag (e.g. 'Shipping', 'Returns', 'Billing').", {
                required: true
            })
        },
        category: "internal",
        group: "thread",
        label: "Updated thread tag",
        planStepLabel: "Update ticket tag",
        execute: async (input, ctx)=>ctx.io ? ctx.io.updateThreadTag(input) : __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$helpers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["noThread"]
    }),
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["defineTool"])({
        name: "escalate_to_human",
        description: "Hand off the ticket to the merchant when a tool failure, missing data, or out-of-scope question prevents you from helping. Marks the thread as pending with a 'needs_human' tag and logs the reason. Stop after calling this — do not attempt any other tools or send a reply.",
        fields: {
            reason: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stringArg"])("A short explanation of why a human needs to take over (e.g. 'Customer is asking about wholesale pricing — out of scope', 'Shopify returned 503 on refund attempt').", {
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
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolEscalated"])(reason);
        }
    })
];
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/tools/registry/index.js [app-client] (ecmascript) <locals>", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/settings.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$customer$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/customer.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$knowledge$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/knowledge.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$messaging$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/messaging.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$order$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/order.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$product$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/product.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/schema.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$stats$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/stats.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$thread$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/thread.js [app-client] (ecmascript)");
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
    ...__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$knowledge$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["KNOWLEDGE_TOOL_DEFINITIONS"],
    ...__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$product$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PRODUCT_TOOL_DEFINITIONS"],
    ...__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$customer$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CUSTOMER_TOOL_DEFINITIONS"],
    ...__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$order$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ORDER_TOOL_DEFINITIONS"],
    ...__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$thread$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["THREAD_TOOL_DEFINITIONS"],
    ...__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$messaging$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MESSAGING_TOOL_DEFINITIONS"],
    ...__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$stats$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["STATS_TOOL_DEFINITIONS"]
];
const TOOL_DEFINITION_REGISTRY = Object.fromEntries(_c1 = TOOL_DEFINITIONS.map(_c = (definition)=>[
        definition.name,
        definition
    ]));
_c2 = TOOL_DEFINITION_REGISTRY;
const TOOL_GROUP_ORDER = [
    "knowledge",
    "product",
    "customer",
    "order",
    "thread",
    "messaging",
    "insights"
];
const TOOL_CATEGORIES = Object.fromEntries(_c4 = TOOL_DEFINITIONS.map(_c3 = (definition)=>[
        definition.name,
        definition.category
    ]));
_c5 = TOOL_CATEGORIES;
const TOOL_GROUPS = TOOL_GROUP_ORDER.reduce(_c6 = (groups, group)=>({
        ...groups,
        [group]: TOOL_DEFINITIONS.filter((definition)=>definition.group === group).map((definition)=>definition.name)
    }), {});
_c7 = TOOL_GROUPS;
const TOOL_LABELS = Object.fromEntries(_c9 = TOOL_DEFINITIONS.map(_c8 = (definition)=>[
        definition.name,
        definition.labels.executed
    ]));
_c10 = TOOL_LABELS;
const PLAN_STEP_LABELS = Object.fromEntries(_c12 = TOOL_DEFINITIONS.map(_c11 = (definition)=>[
        definition.name,
        definition.labels.planStep
    ]));
_c13 = PLAN_STEP_LABELS;
const AGENT_TOOLS = TOOL_DEFINITIONS.map(_c14 = (definition)=>({
        name: definition.name,
        description: definition.description,
        input_schema: definition.inputSchema
    }));
_c15 = AGENT_TOOLS;
function getToolDefinition(name) {
    return TOOL_DEFINITION_REGISTRY[name];
}
function isAgentToolName(name) {
    return Object.prototype.hasOwnProperty.call(TOOL_DEFINITION_REGISTRY, name);
}
function parseToolInput(name, input) {
    const definition = getToolDefinition(name);
    if (!definition) {
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$schema$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ToolInputValidationError"](`unknown tool "${name}".`);
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
    const s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["resolveAgentSettings"])(settings);
    const allowed = allowedToolNames ? new Set(allowedToolNames) : null;
    return AGENT_TOOLS.filter((tool)=>{
        const category = TOOL_CATEGORIES[tool.name];
        if (category && !s.toolsEnabled[category]) return false;
        if (allowed && !allowed.has(tool.name)) return false;
        return true;
    });
}
var _c, _c1, _c2, _c3, _c4, _c5, _c6, _c7, _c8, _c9, _c10, _c11, _c12, _c13, _c14, _c15;
__turbopack_context__.k.register(_c, "TOOL_DEFINITION_REGISTRY$Object.fromEntries$TOOL_DEFINITIONS.map");
__turbopack_context__.k.register(_c1, "TOOL_DEFINITION_REGISTRY$Object.fromEntries");
__turbopack_context__.k.register(_c2, "TOOL_DEFINITION_REGISTRY");
__turbopack_context__.k.register(_c3, "TOOL_CATEGORIES$Object.fromEntries$TOOL_DEFINITIONS.map");
__turbopack_context__.k.register(_c4, "TOOL_CATEGORIES$Object.fromEntries");
__turbopack_context__.k.register(_c5, "TOOL_CATEGORIES");
__turbopack_context__.k.register(_c6, "TOOL_GROUPS$TOOL_GROUP_ORDER.reduce");
__turbopack_context__.k.register(_c7, "TOOL_GROUPS");
__turbopack_context__.k.register(_c8, "TOOL_LABELS$Object.fromEntries$TOOL_DEFINITIONS.map");
__turbopack_context__.k.register(_c9, "TOOL_LABELS$Object.fromEntries");
__turbopack_context__.k.register(_c10, "TOOL_LABELS");
__turbopack_context__.k.register(_c11, "PLAN_STEP_LABELS$Object.fromEntries$TOOL_DEFINITIONS.map");
__turbopack_context__.k.register(_c12, "PLAN_STEP_LABELS$Object.fromEntries");
__turbopack_context__.k.register(_c13, "PLAN_STEP_LABELS");
__turbopack_context__.k.register(_c14, "AGENT_TOOLS$TOOL_DEFINITIONS.map");
__turbopack_context__.k.register(_c15, "AGENT_TOOLS");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/tools/static-policy.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "checkParsedStaticToolPolicy",
    ()=>checkParsedStaticToolPolicy,
    "checkStaticToolPolicy",
    ()=>checkStaticToolPolicy
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/index.js [app-client] (ecmascript) <locals>");
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
    const definition = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["getToolDefinition"])(name);
    if (!definition) return {
        blocked: false
    };
    let input;
    try {
        input = definition.parse(args);
    } catch (error) {
        return {
            blocked: true,
            reason: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["formatToolInputValidationError"])(name, error)
        };
    }
    return checkParsedStaticToolPolicy(definition, input, settings);
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/tools/turn-content.js [app-client] (ecmascript)", ((__turbopack_context__) => {
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/shopify/client.js [app-client] (ecmascript)", ((__turbopack_context__) => {
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/shopify/serializers.js [app-client] (ecmascript)", ((__turbopack_context__) => {
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/shopify/validation.js [app-client] (ecmascript)", ((__turbopack_context__) => {
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/shopify/products.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "searchShopifyProducts",
    ()=>searchShopifyProducts
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/client.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$serializers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/serializers.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/validation.js [app-client] (ecmascript)");
;
;
;
;
async function searchShopifyProducts(input, ctx) {
    try {
        const query = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(input.query, "query");
        const limit = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clampLimit"])(input.limit, 5, 10);
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, "products.json", {
            query: {
                title: query,
                limit,
                fields: "id,title,variants"
            }
        });
        const products = data.products ?? [];
        if (products.length === 0) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolNotFound"])(`No products found matching "${query}".`);
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify(products.map(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$serializers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["serializeProduct"])));
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("could not search products", err));
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/shopify/customers.js [app-client] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/client.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$serializers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/serializers.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/validation.js [app-client] (ecmascript)");
;
;
;
;
async function searchShopifyCustomers(input, ctx) {
    try {
        const query = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(input.query, "query");
        const limit = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clampLimit"])(input.limit, 5, 10);
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, "customers/search.json", {
            query: {
                query,
                limit,
                fields: "id,first_name,last_name,email,phone"
            }
        });
        const customers = data.customers ?? [];
        if (customers.length === 0) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolNotFound"])(`No customers found matching "${query}".`);
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify(customers.map((customer)=>({
                customer_id: String(customer.id),
                name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$serializers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["customerName"])(customer),
                email: customer.email ?? null,
                phone: customer.phone ?? null
            }))));
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("could not search customers", err));
    }
}
async function getShopifyCustomer(input, ctx) {
    try {
        const customerId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNumericId"])(input.customer_id, "customer_id");
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `customers/${customerId}.json`, {
            query: {
                fields: "id,first_name,last_name,email,phone,orders_count,total_spent,default_address,note"
            }
        });
        if (!data.customer) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])(`Error: could not fetch customer - customer ${customerId} was not returned by Shopify.`);
        }
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$serializers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["serializeCustomer"])(data.customer)));
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("could not fetch customer", err));
    }
}
async function updateShopifyCustomerInfo(input, ctx) {
    try {
        const customerId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNumericId"])(input.customer_id, "customer_id");
        const payload = {
            id: customerId
        };
        const firstName = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["optionalString"])(input.first_name);
        const lastName = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["optionalString"])(input.last_name);
        const email = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["optionalString"])(input.email);
        const phone = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["optionalString"])(input.phone);
        if (firstName !== undefined) payload.first_name = firstName;
        if (lastName !== undefined) payload.last_name = lastName;
        if (email !== undefined) payload.email = email;
        if (phone !== undefined) payload.phone = phone;
        if (Object.keys(payload).length === 1) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])("Error: failed to update customer info - provide at least one customer field to update.");
        }
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `customers/${customerId}.json`, {
            method: "PUT",
            body: {
                customer: payload
            }
        });
        if (!data.customer) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])(`Error: failed to update customer info - customer ${customerId} was not returned by Shopify.`);
        }
        const c = data.customer;
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolOk"])(`Customer info updated. Name: ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$serializers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["customerName"])(c)}, Email: ${c.email ?? "none"}, Phone: ${c.phone ?? "none"}.`);
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("failed to update customer info", err));
    }
}
async function addShopifyCustomerNote(input, ctx) {
    try {
        const customerId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNumericId"])(input.customer_id, "customer_id");
        const note = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(input.note, "note");
        const existing = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `customers/${customerId}.json`, {
            query: {
                fields: "id,note"
            }
        });
        if (!existing.customer) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])(`Error: failed to add note - customer ${customerId} was not returned by Shopify.`);
        }
        const existingNote = existing.customer.note ?? "";
        const newNote = existingNote ? `${existingNote}\n\n${note}` : note;
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `customers/${customerId}.json`, {
            method: "PUT",
            body: {
                customer: {
                    id: customerId,
                    note: newNote
                }
            }
        });
        if (!data.customer) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])(`Error: failed to add note - customer ${customerId} was not returned after update.`);
        }
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolOk"])(`Note added to Shopify customer record: "${note}"`);
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("failed to add note", err));
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/shopify/orders.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getOrderByName",
    ()=>getOrderByName,
    "getShopifyOrders",
    ()=>getShopifyOrders,
    "listRecentUnfulfilledOrderIds",
    ()=>listRecentUnfulfilledOrderIds
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/client.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$serializers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/serializers.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/validation.js [app-client] (ecmascript)");
;
;
;
;
function orderFields() {
    return "id,name,created_at,financial_status,fulfillment_status,total_price,current_total_price,currency,line_items,shipping_address";
}
async function getShopifyOrders(input, ctx) {
    try {
        const customerId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNumericId"])(input.customer_id, "customer_id");
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, "orders.json", {
            query: {
                customer_id: customerId,
                status: "any",
                limit: 5,
                fields: orderFields()
            }
        });
        const orders = data.orders ?? [];
        if (orders.length === 0) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolNotFound"])("No orders found for this customer.");
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify(orders.map(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$serializers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["serializeOrder"])));
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("could not fetch orders", err));
    }
}
async function getOrderByName(input, ctx) {
    try {
        const rawName = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(input.order_name, "order_name");
        const name = rawName.startsWith("#") ? rawName : `#${rawName}`;
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, "orders.json", {
            query: {
                name,
                status: "any",
                limit: 1,
                fields: orderFields()
            }
        });
        const orders = data.orders ?? [];
        if (orders.length === 0) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolNotFound"])(`No order found with number ${name}.`);
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$serializers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["serializeOrder"])(orders[0])));
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("could not search orders", err));
    }
}
async function listRecentUnfulfilledOrderIds(ctx, limit = 10) {
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, "orders.json", {
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/shopify/order-address.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "buildOrderAddress",
    ()=>buildOrderAddress,
    "updateShopifyOrderAddress",
    ()=>updateShopifyOrderAddress
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/client.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$serializers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/serializers.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/validation.js [app-client] (ecmascript)");
;
;
;
;
function buildOrderAddress(input) {
    const address2 = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["optionalString"])(input.address2);
    return {
        ...input.first_name !== undefined ? {
            first_name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(input.first_name, "first_name")
        } : {},
        ...input.last_name !== undefined ? {
            last_name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(input.last_name, "last_name")
        } : {},
        address1: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(input.address1, "address1"),
        ...address2 ? {
            address2
        } : {},
        city: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(input.city, "city"),
        province: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(input.province, "province"),
        zip: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(input.zip, "zip"),
        country: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(input.country, "country")
    };
}
async function syncCustomerDefaultAddress(ctx, customerId, addressPayload) {
    try {
        const customerData = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `customers/${customerId}.json`, {
            query: {
                fields: "id,default_address"
            }
        });
        const defaultAddressId = customerData.customer?.default_address?.id;
        if (defaultAddressId === undefined || defaultAddressId === null) {
            return "Customer profile was not updated because no default address exists.";
        }
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `customers/${customerId}/addresses/${defaultAddressId}.json`, {
            method: "PUT",
            body: {
                address: addressPayload
            }
        });
        return "Customer profile also updated.";
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("customer profile sync failed", err).replace(/^Error: /, "");
    }
}
async function updateShopifyOrderAddress(input, ctx) {
    try {
        const orderId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNumericId"])(input.order_id, "order_id");
        const customerId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNumericId"])(input.customer_id, "customer_id");
        const addressPayload = buildOrderAddress(input);
        const orderData = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `orders/${orderId}.json`, {
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
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])(`Error: order ${orderId} not found or shipping address was not returned after update.`);
        }
        const customerSync = await syncCustomerDefaultAddress(ctx, customerId, addressPayload);
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolOk"])(`Order #${orderData.order.order_number ?? orderId} shipping address updated to: ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$serializers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatAddressForMessage"])(addr)}. ${customerSync}`);
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("failed to update order shipping address", err));
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/shopify/order-cancellation.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "cancelOrder",
    ()=>cancelOrder
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/client.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/validation.js [app-client] (ecmascript)");
;
;
;
async function cancelOrder(input, ctx) {
    try {
        const orderId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNumericId"])(input.order_id, "order_id");
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `orders/${orderId}/cancel.json`, {
            method: "POST",
            body: {
                reason: input.reason ?? "other",
                restock: input.restock ?? true,
                email: false
            }
        });
        if (!data.order) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])(`Error: failed to cancel order - order ${orderId} was not returned by Shopify.`);
        }
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolOk"])(`Order ${data.order.name ?? orderId} cancelled successfully. Reason: ${input.reason ?? "other"}. Items ${input.restock !== false ? "restocked" : "not restocked"}. Refund status: Shopify returned financial_status "${data.order.financial_status ?? "unknown"}".`);
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("failed to cancel order", err));
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/shopify/order-creation.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createShopifyOrder",
    ()=>createShopifyOrder
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/client.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$order$2d$address$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/order-address.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/validation.js [app-client] (ecmascript)");
;
;
;
;
function buildLineItems(lineItems, options) {
    if (!Array.isArray(lineItems) || lineItems.length === 0) {
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ShopifyInputError"]("line_items must include at least one item.");
    }
    return lineItems.map((item, index)=>{
        const quantity = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["optionalPositiveInteger"])(item.quantity, `line_items[${index}].quantity`, 1);
        const variantId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["optionalString"])(item.variant_id);
        if (variantId) {
            return {
                variant_id: Number((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNumericId"])(variantId, `line_items[${index}].variant_id`)),
                quantity
            };
        }
        if (!options.allowCustomLineItems) {
            throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ShopifyInputError"]("Custom line items are disabled. Each line item must include a variant_id.");
        }
        return {
            title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNonEmptyString"])(item.title, `line_items[${index}].title`),
            price: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireAmount"])(item.price, `line_items[${index}].price`),
            quantity,
            requires_shipping: true
        };
    });
}
async function createShopifyOrder(input, ctx, options = {}) {
    try {
        const email = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireEmail"])(input.email, "email");
        const shippingAddress = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$order$2d$address$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildOrderAddress"])({
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
        const note = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["optionalString"])(input.note);
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, "orders.json", {
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
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])("Error: failed to create order - Shopify did not return an order.");
        }
        const orderName = data.order.name ?? `#${data.order.id}`;
        const total = data.order.total_price ? `$${data.order.total_price}` : "unknown total";
        const adminUrl = `https://${ctx.shop}/admin/orders/${data.order.id}`;
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolOk"])(`Done — order ${orderName} is in for ${email}, total ${total}.\n\n[View in Shopify](${adminUrl})`);
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("failed to create order", err));
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/shopify/order-edit.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "editShopifyOrder",
    ()=>editShopifyOrder
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/client.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/validation.js [app-client] (ecmascript)");
;
;
;
async function editShopifyOrder(input, ctx) {
    try {
        const orderId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNumericId"])(input.order_id, "order_id");
        const addVariantId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["optionalString"])(input.variant_id);
        const removeVariantId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["optionalString"])(input.remove_variant_id);
        if (!addVariantId && !removeVariantId) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])("Error: edit_shopify_order requires at least variant_id (to add) or remove_variant_id (to remove).");
        }
        const productVariantIdPrefix = "gid://shopify/ProductVariant/";
        const orderGid = `gid://shopify/Order/${orderId}`;
        const beginData = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shopifyGraphql"])(ctx, `mutation orderEditBegin($id: ID!) {
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
        const beginErrors = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatUserErrors"])(beginPayload?.userErrors);
        if (beginErrors) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])(`Error: could not begin order edit - ${beginErrors}`);
        const calculatedOrder = beginPayload?.calculatedOrder;
        const calculatedOrderId = calculatedOrder?.id;
        if (!calculatedOrderId) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])("Error: failed to begin order edit - Shopify did not return a calculated order.");
        }
        let itemToRemove;
        if (removeVariantId) {
            const removeVariantGid = `${productVariantIdPrefix}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNumericId"])(removeVariantId, "remove_variant_id")}`;
            const matches = (calculatedOrder.lineItems.edges ?? []).filter((edge)=>edge.node.quantity > 0 && edge.node.variant?.id === removeVariantGid);
            if (matches.length === 0) {
                const paginationNote = calculatedOrder.lineItems.pageInfo.hasNextPage ? " The order has more than 250 line items, so the target item may be outside the fetched page." : "";
                return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])(`Error: could not remove old item - variant ${removeVariantId} was not found on order ${orderId}.${paginationNote}`);
            }
            if (matches.length > 1) {
                return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])(`Error: could not remove old item - variant ${removeVariantId} appears multiple times on order ${orderId}; manual review is required.`);
            }
            itemToRemove = matches[0];
        }
        if (addVariantId) {
            const addData = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shopifyGraphql"])(ctx, `mutation orderEditAddVariant($id: ID!, $variantId: ID!, $quantity: Int!) {
          orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity) {
            calculatedOrder { id }
            userErrors { field message }
          }
        }`, {
                id: calculatedOrderId,
                variantId: `${productVariantIdPrefix}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNumericId"])(addVariantId, "variant_id")}`,
                quantity: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["optionalPositiveInteger"])(input.quantity, "quantity", 1)
            });
            const addPayload = addData.orderEditAddVariant;
            const addErrors = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatUserErrors"])(addPayload?.userErrors);
            if (addErrors) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])(`Error: could not add item to order - ${addErrors}`);
            if (!addPayload?.calculatedOrder) {
                return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])("Error: could not add item to order - Shopify did not return a calculated order.");
            }
        }
        if (itemToRemove) {
            const setQtyData = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shopifyGraphql"])(ctx, `mutation orderEditSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!) {
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
            const setQtyErrors = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatUserErrors"])(setQtyPayload?.userErrors);
            if (setQtyErrors) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])(`Error: could not remove old item - ${setQtyErrors}`);
            if (!setQtyPayload?.calculatedOrder) {
                return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])("Error: could not remove old item - Shopify did not return a calculated order.");
            }
        }
        const commitData = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shopifyGraphql"])(ctx, `mutation orderEditCommit($id: ID!) {
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
        const commitErrors = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatUserErrors"])(commitPayload?.userErrors);
        if (commitErrors) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])(`Error: could not commit order edit - ${commitErrors}`);
        const order = commitPayload?.order;
        if (!order) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])("Error: could not commit order edit - Shopify did not return the updated order.");
        const itemList = order.lineItems.edges.flatMap(({ node })=>{
            if (node.quantity <= 0) return [];
            const variantTitle = node.variant?.title && node.variant.title !== "Default Title" ? ` (${node.variant.title})` : "";
            return [
                `${node.quantity}x ${node.title}${variantTitle}`
            ];
        }).join(", ");
        const action = addVariantId && removeVariantId ? "swapped item on" : removeVariantId ? "removed item from" : "added item to";
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolOk"])(`Successfully ${action} order ${order.name ?? `#${orderId}`}. Current order items: ${itemList || "none"}.`);
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("failed to edit order", err));
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/shopify/refunds.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createRefund",
    ()=>createRefund
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/client.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/validation.js [app-client] (ecmascript)");
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
    return calculatedTransactions(calculation).flatMap((transaction)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["moneyToCents"])(transaction.amount) > 0 ? [
            normalizeRefundTransaction(transaction)
        ] : []);
}
function buildPartialRefundTransactions(calculation, amount) {
    let remainingCents = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["moneyToCents"])(amount);
    const transactions = [];
    for (const transaction of calculatedTransactions(calculation)){
        const maxRefundable = transaction.maximum_refundable ?? transaction.amount;
        const availableCents = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["moneyToCents"])(maxRefundable);
        const refundCents = Math.min(remainingCents, availableCents);
        if (refundCents > 0) {
            transactions.push(normalizeRefundTransaction(transaction, (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["centsToMoney"])(refundCents)));
            remainingCents -= refundCents;
        }
        if (remainingCents === 0) break;
    }
    if (remainingCents > 0) {
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ShopifyInputError"]("Requested refund amount exceeds the amount Shopify reports as refundable.");
    }
    return transactions;
}
async function calculateRefund(ctx, orderId, refundLineItems) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `orders/${orderId}/refunds/calculate.json`, {
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
        const orderId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNumericId"])(input.order_id, "order_id");
        const amount = input.amount !== undefined ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireAmount"])(input.amount, "amount") : undefined;
        const note = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["optionalString"])(input.reason) ?? "";
        const orderData = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `orders/${orderId}.json`, {
            query: {
                fields: "id,name,currency,line_items,total_price,current_total_price,financial_status"
            }
        });
        if (!orderData.order) {
            return {
                ...(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])(`Error: could not create refund - order ${orderId} was not returned by Shopify.`),
                refundedCents: null
            };
        }
        const refundLineItems = buildRefundLineItems(orderData.order);
        if (refundLineItems.length === 0 && !amount) {
            return {
                ...(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])("Error: could not create refund - no refundable line items were found on this order."),
                refundedCents: null
            };
        }
        const calculation = await calculateRefund(ctx, orderId, refundLineItems);
        const currency = calculation.refund?.currency ?? orderData.order.currency;
        const transactions = amount ? buildPartialRefundTransactions(calculation, amount) : buildFullRefundTransactions(calculation);
        if (transactions.length === 0) {
            return {
                ...(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])("Error: could not create refund - Shopify did not return refundable transactions."),
                refundedCents: null
            };
        }
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `orders/${orderId}/refunds.json`, {
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
                ...(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])(`Error: failed to create refund - Shopify did not return a refund for order ${orderId}.`),
                refundedCents: null
            };
        }
        const totalRefunded = (data.refund.transactions ?? []).reduce((sum, transaction)=>sum + (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["moneyToCents"])(transaction.amount), 0);
        return {
            ...(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolOk"])(`Refund of $${(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["centsToMoney"])(totalRefunded)} issued successfully for order ${orderId}.${note ? ` Reason: ${note}.` : ""}`),
            refundedCents: totalRefunded
        };
    } catch (err) {
        return {
            ...(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("failed to create refund", err)),
            refundedCents: null
        };
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/shopify/tracking.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getOrderTracking",
    ()=>getOrderTracking
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/client.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/validation.js [app-client] (ecmascript)");
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
    const clientId = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.USPS_CLIENT_ID;
    const clientSecret = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.USPS_CLIENT_SECRET;
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
        const orderId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$validation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requireNumericId"])(input.order_id, "order_id");
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shopifyRestJson"])(ctx, `orders/${orderId}/fulfillments.json`);
        const fulfillments = data.fulfillments ?? [];
        if (fulfillments.length === 0) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolNotFound"])("This order has not been fulfilled yet - no tracking information is available.");
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
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify({
                shipments,
                note: "Live tracking events are only available for USPS shipments. Use each carrier tracking URL for carrier updates."
            }));
        }
        let accessToken;
        try {
            accessToken = await getUspsAccessToken();
        } catch  {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify({
                shipments,
                note: "Live tracking unavailable - USPS authentication failed."
            }));
        }
        if (!accessToken) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify({
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
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify({
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
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolOk"])(JSON.stringify({
                shipments,
                note: "Live tracking lookup failed - USPS data unavailable."
            }));
        }
    } catch (err) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toolError"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatShopifyToolError"])("could not fetch fulfillments", err));
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/shopify/index.js [app-client] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/client.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$products$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/products.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$customers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/customers.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$orders$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/orders.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$order$2d$address$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/order-address.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$order$2d$cancellation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/order-cancellation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$order$2d$creation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/order-creation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$order$2d$edit$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/order-edit.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$refunds$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/refunds.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$tracking$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/tracking.js [app-client] (ecmascript)");
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/tools/shopify.js [app-client] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$shopify$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/agent/dist/shopify/index.js [app-client] (ecmascript) <locals>");
;
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/tools/index.js [app-client] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/index.js [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$result$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/result.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$static$2d$policy$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/static-policy.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$turn$2d$content$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/turn-content.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$shopify$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/shopify.js [app-client] (ecmascript) <locals>");
;
;
;
;
;
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/lib/format/date.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "formatClockTime",
    ()=>formatClockTime,
    "formatDate",
    ()=>formatDate,
    "formatLastActivityTime",
    ()=>formatLastActivityTime,
    "formatMonthYear",
    ()=>formatMonthYear,
    "formatRelativeTime",
    ()=>formatRelativeTime,
    "formatRelativeTimestamp",
    ()=>formatRelativeTimestamp,
    "formatShortDate",
    ()=>formatShortDate,
    "formatShortRelativeTime",
    ()=>formatShortRelativeTime,
    "formatSyncRelativeTime",
    ()=>formatSyncRelativeTime,
    "formatTicketAge",
    ()=>formatTicketAge,
    "formatTime",
    ()=>formatTime,
    "formatUnixDate",
    ()=>formatUnixDate,
    "timeAgo",
    ()=>timeAgo
]);
function dateFromInput(input) {
    if (input == null || input === "") return null;
    const date = input instanceof Date ? input : new Date(input);
    return Number.isFinite(date.getTime()) ? date : null;
}
function relativeParts(input) {
    const date = dateFromInput(input);
    if (!date) return null;
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    return {
        date,
        seconds,
        minutes,
        hours,
        days
    };
}
function formatMonthDay(date, now = new Date()) {
    const options = {
        month: "short",
        day: "numeric"
    };
    if (date.getFullYear() !== now.getFullYear()) {
        options.year = "numeric";
    }
    return date.toLocaleDateString("en-US", options);
}
function formatTime(dateString) {
    const date = dateFromInput(dateString);
    if (!date) return "Just now";
    const now = new Date();
    const isToday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
    const time = formatClockTime(date);
    if (isToday) return time;
    const dateLabel = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric"
    });
    return `${dateLabel} · ${time}`;
}
function formatDate(input, { fallback = "Unknown date", timeZone } = {}) {
    const date = dateFromInput(input);
    if (!date) return fallback;
    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        ...timeZone ? {
            timeZone
        } : {}
    });
}
function formatShortDate(input, { fallback = "Unknown date", includeYear = false, timeZone } = {}) {
    const date = dateFromInput(input);
    if (!date) return fallback;
    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        ...includeYear ? {
            year: "numeric"
        } : {},
        ...timeZone ? {
            timeZone
        } : {}
    });
}
function formatMonthYear(input, { fallback = "Unknown date", timeZone } = {}) {
    const date = dateFromInput(input);
    if (!date) return fallback;
    return date.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
        ...timeZone ? {
            timeZone
        } : {}
    });
}
function formatUnixDate(unixSeconds, options) {
    if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds)) {
        return options?.fallback ?? "Unknown date";
    }
    return formatDate(unixSeconds * 1000, options);
}
function formatClockTime(input, { fallback = "Just now", hour = "2-digit", timeZone } = {}) {
    const date = dateFromInput(input);
    if (!date) return fallback;
    return date.toLocaleTimeString([], {
        hour,
        minute: "2-digit",
        ...timeZone ? {
            timeZone
        } : {}
    });
}
function formatRelativeTime(iso) {
    const parts = relativeParts(iso);
    if (!parts) return "just now";
    if (parts.minutes < 1) return "just now";
    if (parts.minutes < 60) return `${parts.minutes}m ago`;
    if (parts.hours < 24) return `${parts.hours}h ago`;
    if (parts.days === 1) return "yesterday";
    if (parts.days < 7) return `${parts.days}d ago`;
    return parts.date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric"
    });
}
function formatRelativeTimestamp(input) {
    const parts = relativeParts(input);
    if (!parts) return "just now";
    if (parts.minutes < 1) return "just now";
    if (parts.minutes < 60) return `${parts.minutes}m ago`;
    if (parts.hours < 24) return `${parts.hours}h ago`;
    return formatMonthDay(parts.date);
}
function formatShortRelativeTime(input, { includeSeconds = false, justNowSeconds = 60, minuteUnit = "m" } = {}) {
    const parts = relativeParts(input);
    if (!parts) return "just now";
    if (parts.seconds < justNowSeconds) return "just now";
    if (includeSeconds && parts.seconds < 60) return `${parts.seconds}s ago`;
    if (parts.minutes < 1) return "just now";
    if (parts.minutes < 60) {
        return minuteUnit === "min" ? `${parts.minutes} min ago` : `${parts.minutes}m ago`;
    }
    if (parts.hours < 24) return `${parts.hours}h ago`;
    return `${parts.days}d ago`;
}
function formatSyncRelativeTime(input) {
    return formatShortRelativeTime(input, {
        includeSeconds: true,
        justNowSeconds: 30,
        minuteUnit: "min"
    });
}
function formatLastActivityTime(input) {
    return formatShortRelativeTime(input, {
        justNowSeconds: 120
    });
}
function formatTicketAge(iso) {
    const parts = relativeParts(iso);
    if (!parts) return "just now";
    if (parts.minutes < 1) return "just now";
    if (parts.minutes < 60) return `${parts.minutes}m`;
    if (parts.hours < 24) return `${parts.hours}h`;
    if (parts.days < 7) return `${parts.days}d`;
    const now = new Date();
    const sameYear = parts.date.getFullYear() === now.getFullYear();
    return parts.date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        ...sameYear ? {} : {
            year: "numeric"
        }
    });
}
function timeAgo(iso) {
    return formatShortRelativeTime(iso);
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/components/agent/AgentMessageMarkdown.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AgentMessageMarkdown",
    ()=>AgentMessageMarkdown
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$markdown$2f$lib$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__Markdown__as__default$3e$__ = __turbopack_context__.i("[project]/node_modules/react-markdown/lib/index.js [app-client] (ecmascript) <export Markdown as default>");
"use client";
;
;
const ALLOWED_ELEMENTS = [
    "p",
    "strong",
    "em",
    "a",
    "br",
    "ul",
    "ol",
    "li",
    "code"
];
const COMPONENTS = {
    a: ({ href, children })=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
            href: href,
            target: "_blank",
            rel: "noreferrer noopener",
            children: children
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/components/agent/AgentMessageMarkdown.tsx",
            lineNumber: 9,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0))
};
const WRAPPER_CLASS = "text-sm text-foreground leading-relaxed " + "[&_p]:mt-0 [&_p+p]:mt-2 " + "[&_strong]:font-medium [&_strong]:text-foreground/90 " + "[&_a]:text-violet-400 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-violet-300 " + "[&_ul]:my-1.5 [&_ul]:pl-4 [&_ul]:list-disc [&_ul]:marker:text-white/30 " + "[&_ol]:my-1.5 [&_ol]:pl-4 [&_ol]:list-decimal [&_ol]:marker:text-white/30 " + "[&_li]:my-0.5 " + "[&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]";
function AgentMessageMarkdown({ text }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: WRAPPER_CLASS,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$markdown$2f$lib$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__Markdown__as__default$3e$__["default"], {
            allowedElements: ALLOWED_ELEMENTS,
            unwrapDisallowed: true,
            components: COMPONENTS,
            children: text
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/components/agent/AgentMessageMarkdown.tsx",
            lineNumber: 26,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/agent/AgentMessageMarkdown.tsx",
        lineNumber: 25,
        columnNumber: 5
    }, this);
}
_c = AgentMessageMarkdown;
var _c;
__turbopack_context__.k.register(_c, "AgentMessageMarkdown");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/hooks/useFillerPhrase.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useFillerPhrase",
    ()=>useFillerPhrase
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
;
function useFillerPhrase(phrases, active, intervalMs = 2500) {
    _s();
    const [index, setIndex] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useFillerPhrase.useEffect": ()=>{
            if (!active) return;
            const id = setInterval({
                "useFillerPhrase.useEffect.id": ()=>{
                    setIndex({
                        "useFillerPhrase.useEffect.id": (i)=>(i + 1) % phrases.length
                    }["useFillerPhrase.useEffect.id"]);
                }
            }["useFillerPhrase.useEffect.id"], intervalMs);
            return ({
                "useFillerPhrase.useEffect": ()=>clearInterval(id)
            })["useFillerPhrase.useEffect"];
        }
    }["useFillerPhrase.useEffect"], [
        active,
        phrases.length,
        intervalMs
    ]);
    return active ? phrases[index] : phrases[0];
}
_s(useFillerPhrase, "c3fuAdVwNN91t4bNS1qBXl5hAWY=");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/components/agent/agent-chat-session.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SESSION_KEY",
    ()=>SESSION_KEY,
    "deleteAgentSessionHistory",
    ()=>deleteAgentSessionHistory,
    "fetchAgentSessionDetail",
    ()=>fetchAgentSessionDetail,
    "sendAgentChatInstruction",
    ()=>sendAgentChatInstruction,
    "sessionToChatMessages",
    ()=>sessionToChatMessages
]);
const SESSION_KEY = "dashboard_agent_session";
function sessionToChatMessages(session) {
    return session.messages.map((message)=>message.role === "user" ? {
            role: "user",
            text: message.text,
            timestamp: new Date(session.createdAt)
        } : {
            role: "agent",
            summary: message.text,
            actions: [],
            timestamp: new Date(session.createdAt)
        });
}
async function fetchAgentSessionDetail(id, fetchImpl = fetch) {
    const res = await fetchImpl(`/api/agent/sessions/${id}`);
    if (res.status === 404) return {
        status: "missing"
    };
    if (!res.ok) return {
        status: "unavailable"
    };
    return {
        status: "ok",
        session: await res.json()
    };
}
function chatRequestBody(instruction, sessionId) {
    return sessionId ? {
        instruction,
        sessionId
    } : {
        instruction,
        sessionId: null
    };
}
function postAgentChat(instruction, sessionId, fetchImpl) {
    return fetchImpl("/api/agent/chat", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(chatRequestBody(instruction, sessionId))
    });
}
async function sendAgentChatInstruction({ fetchImpl = fetch, instruction, onStaleSession, sessionId, storage = localStorage }) {
    let res = await postAgentChat(instruction, sessionId, fetchImpl);
    if (res.status === 404 && sessionId) {
        onStaleSession?.();
        storage.removeItem(SESSION_KEY);
        res = await fetchImpl("/api/agent/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                instruction
            })
        });
    }
    const data = await res.json().catch(()=>null);
    if (!res.ok) {
        return {
            ok: false,
            error: data?.error ?? "Something went wrong."
        };
    }
    return {
        ok: true,
        sessionId: data?.sessionId ?? "",
        summary: data?.summary ?? "",
        actionsPerformed: data?.actionsPerformed ?? []
    };
}
function deleteAgentSessionHistory(fetchImpl = fetch) {
    return fetchImpl("/api/agent/sessions", {
        method: "DELETE"
    });
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/components/agent/useAgentChatState.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "messageKey",
    ()=>messageKey,
    "useAgentChatState",
    ()=>useAgentChatState
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$shared$2f$dist$2f$runtime$2f$react$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@clerk/shared/dist/runtime/react/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useFillerPhrase$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/hooks/useFillerPhrase.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$agent$2d$chat$2d$session$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/agent/agent-chat-session.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
function messageKey(message) {
    if (message.role === "thinking") return "thinking";
    const time = message.timestamp.toISOString();
    return message.role === "user" ? `user-${time}-${message.text}` : `agent-${time}-${message.summary}`;
}
function useAgentChatState({ restoreSession = true }) {
    _s();
    const { user } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$shared$2f$dist$2f$runtime$2f$react$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useUser"])();
    const firstName = user?.firstName ?? "there";
    const initial = (user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0] ?? "U").toUpperCase();
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const [messages, setMessages] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [input, setInput] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [isRunning, setIsRunning] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const fillerPhrase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useFillerPhrase$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useFillerPhrase"])([
        "Making it happen…",
        "Doing the thing…",
        "Almost there…",
        "Just a sec…",
        "Finishing touches…"
    ], isRunning);
    const [showClearConfirm, setShowClearConfirm] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const messagesEndRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const textareaRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const sessionIdRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const restoreSessionRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(restoreSession);
    const fetchSessionDetail = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAgentChatState.useCallback[fetchSessionDetail]": async (id)=>{
            try {
                const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$agent$2d$chat$2d$session$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetchAgentSessionDetail"])(id);
                if (result.status === "missing") {
                    localStorage.removeItem(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$agent$2d$chat$2d$session$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SESSION_KEY"]);
                    sessionIdRef.current = null;
                    return null;
                }
                return result.status === "ok" ? result.session : null;
            } catch (err) {
                console.error("[AgentChat] fetchSessionDetail failed:", err);
                return null;
            }
        }
    }["useAgentChatState.useCallback[fetchSessionDetail]"], []);
    const handleNewSession = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAgentChatState.useCallback[handleNewSession]": ()=>{
            sessionIdRef.current = null;
            setMessages([]);
            localStorage.removeItem(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$agent$2d$chat$2d$session$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SESSION_KEY"]);
            textareaRef.current?.focus();
        }
    }["useAgentChatState.useCallback[handleNewSession]"], []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useAgentChatState.useEffect": ()=>{
            if (!restoreSessionRef.current) {
                localStorage.removeItem(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$agent$2d$chat$2d$session$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SESSION_KEY"]);
                textareaRef.current?.focus();
                return;
            }
            const params = new URLSearchParams(window.location.search);
            const deepLinked = params.get("session");
            const stored = localStorage.getItem(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$agent$2d$chat$2d$session$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SESSION_KEY"]);
            const target = deepLinked ?? stored;
            if (!target) return;
            void fetchSessionDetail(target).then({
                "useAgentChatState.useEffect": (session)=>{
                    if (!session) {
                        if (deepLinked && stored && stored !== deepLinked) {
                            void fetchSessionDetail(stored).then({
                                "useAgentChatState.useEffect": (fallback)=>{
                                    if (!fallback) return;
                                    sessionIdRef.current = fallback.id;
                                    setMessages((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$agent$2d$chat$2d$session$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["sessionToChatMessages"])(fallback));
                                }
                            }["useAgentChatState.useEffect"]);
                        }
                        return;
                    }
                    sessionIdRef.current = session.id;
                    localStorage.setItem(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$agent$2d$chat$2d$session$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SESSION_KEY"], session.id);
                    setMessages((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$agent$2d$chat$2d$session$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["sessionToChatMessages"])(session));
                }
            }["useAgentChatState.useEffect"]);
            if (deepLinked) {
                params.delete("session");
                const search = params.toString();
                const newUrl = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
                window.history.replaceState(null, "", newUrl);
            }
        }
    }["useAgentChatState.useEffect"], [
        fetchSessionDetail
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useAgentChatState.useEffect": ()=>{
            messagesEndRef.current?.scrollIntoView({
                behavior: "smooth"
            });
        }
    }["useAgentChatState.useEffect"], [
        messages
    ]);
    const handleSend = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAgentChatState.useCallback[handleSend]": async ()=>{
            const text = input.trim();
            if (!text || isRunning) return;
            const sentAt = new Date();
            const sessionId = sessionIdRef.current;
            setInput("");
            setIsRunning(true);
            setMessages({
                "useAgentChatState.useCallback[handleSend]": (prev)=>[
                        ...prev,
                        {
                            role: "user",
                            text,
                            timestamp: sentAt
                        },
                        {
                            role: "thinking"
                        }
                    ]
            }["useAgentChatState.useCallback[handleSend]"]);
            try {
                const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$agent$2d$chat$2d$session$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["sendAgentChatInstruction"])({
                    instruction: text,
                    onStaleSession: {
                        "useAgentChatState.useCallback[handleSend]": ()=>{
                            sessionIdRef.current = null;
                        }
                    }["useAgentChatState.useCallback[handleSend]"],
                    sessionId,
                    storage: localStorage
                });
                if (!result.ok) {
                    setMessages({
                        "useAgentChatState.useCallback[handleSend]": (prev)=>[
                                ...prev.slice(0, -1),
                                {
                                    role: "agent",
                                    summary: result.error,
                                    actions: [],
                                    timestamp: new Date()
                                }
                            ]
                    }["useAgentChatState.useCallback[handleSend]"]);
                    return;
                }
                sessionIdRef.current = result.sessionId;
                localStorage.setItem(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$agent$2d$chat$2d$session$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SESSION_KEY"], result.sessionId);
                setMessages({
                    "useAgentChatState.useCallback[handleSend]": (prev)=>[
                            ...prev.slice(0, -1),
                            {
                                role: "agent",
                                summary: result.summary,
                                actions: result.actionsPerformed,
                                timestamp: new Date()
                            }
                        ]
                }["useAgentChatState.useCallback[handleSend]"]);
            } catch  {
                setMessages({
                    "useAgentChatState.useCallback[handleSend]": (prev)=>[
                            ...prev.slice(0, -1),
                            {
                                role: "agent",
                                summary: "Request failed. Please try again.",
                                actions: [],
                                timestamp: new Date()
                            }
                        ]
                }["useAgentChatState.useCallback[handleSend]"]);
            } finally{
                setIsRunning(false);
                textareaRef.current?.focus();
            }
        }
    }["useAgentChatState.useCallback[handleSend]"], [
        input,
        isRunning
    ]);
    const handleKeyDown = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAgentChatState.useCallback[handleKeyDown]": (e)=>{
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        }
    }["useAgentChatState.useCallback[handleKeyDown]"], [
        handleSend
    ]);
    const handleClearHistory = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAgentChatState.useCallback[handleClearHistory]": async ()=>{
            setShowClearConfirm(false);
            try {
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$agent$2d$chat$2d$session$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["deleteAgentSessionHistory"])();
                handleNewSession();
            } catch  {
            // silent
            }
        }
    }["useAgentChatState.useCallback[handleClearHistory]"], [
        handleNewSession
    ]);
    return {
        fillerPhrase,
        firstName,
        greeting,
        handleClearHistory,
        handleKeyDown,
        handleNewSession,
        handleSend,
        initial,
        input,
        isRunning,
        messages,
        messagesEndRef,
        setInput,
        setShowClearConfirm,
        showClearConfirm,
        textareaRef
    };
}
_s(useAgentChatState, "UuMYTA2xH7hyxrPqAxkk92EBKUk=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$shared$2f$dist$2f$runtime$2f$react$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useUser"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useFillerPhrase$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useFillerPhrase"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/components/agent/AgentChatView.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AgentChatView",
    ()=>AgentChatView
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertCircle$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/circle-alert.js [app-client] (ecmascript) <export default as AlertCircle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$up$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowUp$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/arrow-up.js [app-client] (ecmascript) <export default as ArrowUp>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/check.js [app-client] (ecmascript) <export default as Check>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/loader-circle.js [app-client] (ecmascript) <export default as Loader2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/plus.js [app-client] (ecmascript) <export default as Plus>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/sparkles.js [app-client] (ecmascript) <export default as Sparkles>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/x.js [app-client] (ecmascript) <export default as X>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/index.js [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/agent/dist/tools/registry/index.js [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/button.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/dialog.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$format$2f$date$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/format/date.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$AgentMessageMarkdown$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/agent/AgentMessageMarkdown.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$useAgentChatState$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/agent/useAgentChatState.ts [app-client] (ecmascript)");
;
;
;
;
;
;
;
;
function getToolResultHint(tool, result) {
    if (result.startsWith("Error")) return null;
    const countMatch = result.match(/\b(\d+)\b/);
    if (!countMatch) return null;
    const n = countMatch[1];
    const hints = {
        search_shopify_customers: (n)=>`${n} customer${n === "1" ? "" : "s"}`,
        search_shopify_products: (n)=>`${n} product${n === "1" ? "" : "s"}`,
        get_shopify_orders: (n)=>`${n} order${n === "1" ? "" : "s"}`,
        search_kb: (n)=>`from ${n} KB article${n === "1" ? "" : "s"}`
    };
    return hints[tool]?.(n) ?? null;
}
function AgentMessage({ agentName, message }) {
    const visibleActions = message.actions.filter((a)=>a.tool !== "send_reply" && a.tool !== "add_internal_note");
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex items-start gap-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "shrink-0 size-7 rounded-full bg-green-500 flex items-center justify-center mt-0.5",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"], {
                    className: "size-4 text-green-800"
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                    lineNumber: 44,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                lineNumber: 43,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 min-w-0 max-w-[75%]",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2 mb-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-xs font-medium text-foreground",
                                children: agentName
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                lineNumber: 48,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-xs text-muted-foreground",
                                children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$format$2f$date$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatClockTime"])(message.timestamp)
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                lineNumber: 49,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                        lineNumber: 47,
                        columnNumber: 9
                    }, this),
                    visibleActions.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-wrap gap-1.5 mb-2.5",
                        children: visibleActions.map((action)=>{
                            const isError = action.result.startsWith("Error");
                            const hint = !isError ? getToolResultHint(action.tool, action.result) : null;
                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: `inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${isError ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`,
                                children: [
                                    isError ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertCircle$3e$__["AlertCircle"], {
                                        className: "size-3 shrink-0"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                        lineNumber: 66,
                                        columnNumber: 23
                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__["Check"], {
                                        className: "size-3 shrink-0"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                        lineNumber: 67,
                                        columnNumber: 23
                                    }, this),
                                    __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$tools$2f$registry$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["TOOL_LABELS"][action.tool] ?? action.tool,
                                    hint && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-muted-foreground",
                                        children: [
                                            "· ",
                                            hint
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                        lineNumber: 70,
                                        columnNumber: 28
                                    }, this)
                                ]
                            }, `${action.tool}-${action.result}`, true, {
                                fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                lineNumber: 57,
                                columnNumber: 17
                            }, this);
                        })
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                        lineNumber: 52,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "bg-green-600/20 border border-border text-foreground text-sm rounded-2xl rounded-tl-sm pl-4 py-2.5 shadow-sm",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$AgentMessageMarkdown$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AgentMessageMarkdown"], {
                            text: message.summary
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                            lineNumber: 77,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                        lineNumber: 76,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                lineNumber: 46,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
        lineNumber: 42,
        columnNumber: 5
    }, this);
}
_c = AgentMessage;
function AgentChatView({ agentName, compact, embedded, onClose, state }) {
    const { fillerPhrase, firstName, greeting, handleClearHistory, handleKeyDown, handleNewSession, handleSend, initial, input, isRunning, messages, messagesEndRef, setInput, setShowClearConfirm, showClearConfirm, textareaRef } = state;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex flex-col h-full",
        children: [
            compact && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "shrink-0 h-11 flex items-center justify-between px-4 bg-card border-b border-border",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "size-6 rounded-full bg-green-500 flex items-center justify-center",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__["Plus"], {
                                    className: "size-3.5 text-white"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                    lineNumber: 116,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                lineNumber: 115,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-sm font-semibold text-foreground",
                                children: agentName
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                lineNumber: 118,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                        lineNumber: 114,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-1",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: handleNewSession,
                                className: "text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1",
                                children: "New session"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                lineNumber: 121,
                                columnNumber: 13
                            }, this),
                            onClose && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: onClose,
                                className: "size-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                                    className: "size-4"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                    lineNumber: 132,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                lineNumber: 128,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                        lineNumber: 120,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                lineNumber: 113,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 overflow-y-auto px-5 md:px-6 py-6 space-y-6",
                children: [
                    messages.length === 0 && !compact && !embedded && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "max-w-xl mx-auto",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "bg-card border border-border rounded-xl p-5",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "size-8 rounded-full bg-green-500 flex items-center justify-center mb-3",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__["Plus"], {
                                        className: "size-4 text-white"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                        lineNumber: 144,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                    lineNumber: 143,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                    className: "text-base font-semibold text-foreground mb-1",
                                    children: [
                                        greeting,
                                        ", ",
                                        firstName,
                                        "."
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                    lineNumber: 146,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-sm text-muted-foreground leading-relaxed",
                                    children: "Ask me to look up orders, issue refunds, search your knowledge base, or draft customer replies."
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                    lineNumber: 149,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                            lineNumber: 142,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                        lineNumber: 141,
                        columnNumber: 11
                    }, this),
                    messages.length === 0 && (compact || embedded) && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-col items-center justify-center h-full text-center gap-2 pb-8",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "size-10 rounded-full bg-green-500/10 flex items-center justify-center",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__["Plus"], {
                                    className: "size-5 text-green-500"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                    lineNumber: 159,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                lineNumber: 158,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-xs text-muted-foreground max-w-[200px]",
                                children: [
                                    "Ask ",
                                    agentName,
                                    " to take actions on your store."
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                lineNumber: 161,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                        lineNumber: 157,
                        columnNumber: 11
                    }, this),
                    messages.map((msg)=>{
                        if (msg.role === "user") {
                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex justify-end items-end gap-2.5",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex flex-col items-end gap-1 max-w-[70%]",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-xs text-muted-foreground",
                                                children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$format$2f$date$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatClockTime"])(msg.timestamp)
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                                lineNumber: 172,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "bg-card border border-border text-foreground text-sm rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-sm",
                                                children: msg.text
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                                lineNumber: 173,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                        lineNumber: 171,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "shrink-0 size-7 rounded-full bg-muted border border-border flex items-center justify-center text-xs font-semibold text-foreground mb-0.5",
                                        children: initial
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                        lineNumber: 177,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$useAgentChatState$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["messageKey"])(msg), true, {
                                fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                lineNumber: 170,
                                columnNumber: 15
                            }, this);
                        }
                        if (msg.role === "thinking") {
                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-start gap-3",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "shrink-0 size-7 rounded-full bg-green-500 flex items-center justify-center mt-0.5",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__["Plus"], {
                                            className: "size-4 text-white"
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                            lineNumber: 188,
                                            columnNumber: 19
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                        lineNumber: 187,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-center gap-2 text-sm text-muted-foreground pt-1",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                                className: "size-3.5 animate-spin text-green-500"
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                                lineNumber: 191,
                                                columnNumber: 19
                                            }, this),
                                            fillerPhrase
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                        lineNumber: 190,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$useAgentChatState$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["messageKey"])(msg), true, {
                                fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                lineNumber: 186,
                                columnNumber: 15
                            }, this);
                        }
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(AgentMessage, {
                            agentName: agentName,
                            message: msg
                        }, (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$useAgentChatState$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["messageKey"])(msg), false, {
                            fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                            lineNumber: 198,
                            columnNumber: 18
                        }, this);
                    }),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        ref: messagesEndRef
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                        lineNumber: 201,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                lineNumber: 139,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "shrink-0 px-5 md:px-6 pt-3 pb-5 md:pb-4 space-y-2.5",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "bg-card border border-border rounded-xl px-4 pt-3 pb-3 focus-within:border-green-400/50 focus-within:ring-1 focus-within:ring-violet-400/20 transition-all",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                            "aria-label": "Agent message",
                            ref: textareaRef,
                            rows: 1,
                            value: input,
                            onChange: (e)=>setInput(e.target.value),
                            onKeyDown: handleKeyDown,
                            disabled: isRunning,
                            placeholder: "Ask about orders, draft replies, update customers…",
                            className: "w-full bg-transparent text-base md:text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none min-h-[40px] max-h-50",
                            style: {
                                fieldSizing: "content"
                            }
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                            lineNumber: 206,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center justify-end mt-2.5 gap-2",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center gap-2 shrink-0",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "hidden md:block text-xs text-muted-foreground whitespace-nowrap",
                                        children: "Shift + ↵ for new line"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                        lineNumber: 220,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        onClick: handleSend,
                                        disabled: !input.trim() || isRunning,
                                        className: "flex items-center gap-1 text-xs font-medium bg-green-600 text-white rounded-lg px-3 py-1.5 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors",
                                        children: [
                                            isRunning ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                                className: "size-3.5 animate-spin"
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                                lineNumber: 229,
                                                columnNumber: 21
                                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$up$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowUp$3e$__["ArrowUp"], {
                                                className: "size-3.5"
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                                lineNumber: 230,
                                                columnNumber: 21
                                            }, this),
                                            "Send"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                        lineNumber: 223,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                lineNumber: 219,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                            lineNumber: 218,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                    lineNumber: 205,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                lineNumber: 204,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Dialog"], {
                open: showClearConfirm,
                onOpenChange: (open)=>!open && setShowClearConfirm(false),
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogContent"], {
                    showCloseButton: false,
                    className: "max-w-sm",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogHeader"], {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogTitle"], {
                                    children: "Clear all history?"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                    lineNumber: 242,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogDescription"], {
                                    children: "All past sessions will be permanently deleted and cannot be recovered."
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                    lineNumber: 243,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                            lineNumber: 241,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogFooter"], {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                    variant: "ghost",
                                    size: "sm",
                                    onClick: ()=>setShowClearConfirm(false),
                                    children: "Cancel"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                    lineNumber: 248,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                    variant: "destructive",
                                    size: "sm",
                                    onClick: handleClearHistory,
                                    children: "Delete all"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                                    lineNumber: 249,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                            lineNumber: 247,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                    lineNumber: 240,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
                lineNumber: 239,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/components/agent/AgentChatView.tsx",
        lineNumber: 111,
        columnNumber: 5
    }, this);
}
_c1 = AgentChatView;
var _c, _c1;
__turbopack_context__.k.register(_c, "AgentMessage");
__turbopack_context__.k.register(_c1, "AgentChatView");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/components/agent/AgentChatClient.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AgentChatClient
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$AgentChatView$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/agent/AgentChatView.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$useAgentChatState$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/agent/useAgentChatState.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
function AgentChatClient({ restoreSession = true, ...props }) {
    _s();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$AgentChatView$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AgentChatView"], {
        ...props,
        state: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$useAgentChatState$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAgentChatState"])({
            restoreSession
        })
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/agent/AgentChatClient.tsx",
        lineNumber: 7,
        columnNumber: 10
    }, this);
}
_s(AgentChatClient, "C5hKp1fftB4GxxhEMTjzdgUdrA0=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$useAgentChatState$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAgentChatState"]
    ];
});
_c = AgentChatClient;
var _c;
__turbopack_context__.k.register(_c, "AgentChatClient");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/agent-panel/AgentPanelContext.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AgentPanelProvider",
    ()=>AgentPanelProvider,
    "useAgentPanel",
    ()=>useAgentPanel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
const AgentPanelContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])(null);
function AgentPanelProvider({ children }) {
    _s();
    const [isOpen, setIsOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const open = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "AgentPanelProvider.useCallback[open]": ()=>setIsOpen(true)
    }["AgentPanelProvider.useCallback[open]"], []);
    const close = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "AgentPanelProvider.useCallback[close]": ()=>setIsOpen(false)
    }["AgentPanelProvider.useCallback[close]"], []);
    const toggle = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "AgentPanelProvider.useCallback[toggle]": ()=>setIsOpen({
                "AgentPanelProvider.useCallback[toggle]": (o)=>!o
            }["AgentPanelProvider.useCallback[toggle]"])
    }["AgentPanelProvider.useCallback[toggle]"], []);
    const value = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AgentPanelProvider.useMemo[value]": ()=>({
                isOpen,
                open,
                close,
                toggle
            })
    }["AgentPanelProvider.useMemo[value]"], [
        close,
        isOpen,
        open,
        toggle
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(AgentPanelContext.Provider, {
        value: value,
        children: children
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/agent-panel/AgentPanelContext.tsx",
        lineNumber: 22,
        columnNumber: 5
    }, this);
}
_s(AgentPanelProvider, "Wmci+iqIvpixAaBgCVHKbxnBs8Y=");
_c = AgentPanelProvider;
function useAgentPanel() {
    const ctx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["use"])(AgentPanelContext);
    if (!ctx) throw new Error("useAgentPanel must be used inside AgentPanelProvider");
    return ctx;
}
var _c;
__turbopack_context__.k.register(_c, "AgentPanelProvider");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/agent-panel/AgentPanelRoot.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AgentPanelRoot
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$AnimatePresence$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/components/AnimatePresence/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$LazyMotion$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/components/LazyMotion/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$dom$2f$features$2d$animation$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/render/dom/features-animation.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$m$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/render/components/m/proxy.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$ghost$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Ghost$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/ghost.js [app-client] (ecmascript) <export default as Ghost>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$AgentChatClient$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/agent/AgentChatClient.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$agent$2d$panel$2f$AgentPanelContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/agent-panel/AgentPanelContext.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
function AgentPanelRoot({ agentName }) {
    _s();
    const { isOpen, open, close } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$agent$2d$panel$2f$AgentPanelContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAgentPanel"])();
    const isLargeScreen = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSyncExternalStore"]({
        "AgentPanelRoot.useSyncExternalStore[isLargeScreen]": (onStoreChange)=>{
            if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
            ;
            const mql = window.matchMedia("(min-width: 1024px)");
            const onChange = {
                "AgentPanelRoot.useSyncExternalStore[isLargeScreen].onChange": ()=>onStoreChange()
            }["AgentPanelRoot.useSyncExternalStore[isLargeScreen].onChange"];
            mql.addEventListener("change", onChange);
            return ({
                "AgentPanelRoot.useSyncExternalStore[isLargeScreen]": ()=>mql.removeEventListener("change", onChange)
            })["AgentPanelRoot.useSyncExternalStore[isLargeScreen]"];
        }
    }["AgentPanelRoot.useSyncExternalStore[isLargeScreen]"], {
        "AgentPanelRoot.useSyncExternalStore[isLargeScreen]": ()=>window.matchMedia("(min-width: 1024px)").matches
    }["AgentPanelRoot.useSyncExternalStore[isLargeScreen]"], {
        "AgentPanelRoot.useSyncExternalStore[isLargeScreen]": ()=>false
    }["AgentPanelRoot.useSyncExternalStore[isLargeScreen]"]);
    const isMobile = !isLargeScreen;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$LazyMotion$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["LazyMotion"], {
        features: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$dom$2f$features$2d$animation$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["domAnimation"],
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$AnimatePresence$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AnimatePresence"], {
                children: isOpen && (isMobile ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$m$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["m"].div, {
                    initial: {
                        opacity: 0,
                        y: 16
                    },
                    animate: {
                        opacity: 1,
                        y: 0
                    },
                    exit: {
                        opacity: 0,
                        y: 16
                    },
                    transition: {
                        type: "spring",
                        stiffness: 300,
                        damping: 35
                    },
                    className: "fixed inset-0 z-50 bg-background flex flex-col",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$AgentChatClient$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                        agentName: agentName,
                        compact: true,
                        onClose: close
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/agent-panel/AgentPanelRoot.tsx",
                        lineNumber: 43,
                        columnNumber: 15
                    }, this)
                }, "agent-panel-mobile", false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/agent-panel/AgentPanelRoot.tsx",
                    lineNumber: 35,
                    columnNumber: 13
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$m$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["m"].div, {
                    initial: {
                        width: 0
                    },
                    animate: {
                        width: 420
                    },
                    exit: {
                        width: 0
                    },
                    transition: {
                        type: "spring",
                        stiffness: 300,
                        damping: 35
                    },
                    className: "flex-shrink-0 overflow-hidden h-full bg-background border-l border-border shadow-xl flex flex-col",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "w-[420px] h-full flex flex-col",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$agent$2f$AgentChatClient$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            agentName: agentName,
                            compact: true,
                            onClose: close
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/agent-panel/AgentPanelRoot.tsx",
                            lineNumber: 55,
                            columnNumber: 17
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/agent-panel/AgentPanelRoot.tsx",
                        lineNumber: 54,
                        columnNumber: 15
                    }, this)
                }, "agent-panel-desktop", false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/agent-panel/AgentPanelRoot.tsx",
                    lineNumber: 46,
                    columnNumber: 13
                }, this))
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/agent-panel/AgentPanelRoot.tsx",
                lineNumber: 32,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$AnimatePresence$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AnimatePresence"], {
                children: !isOpen && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$m$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["m"].button, {
                    initial: {
                        scale: 0.95,
                        opacity: 0
                    },
                    animate: {
                        scale: 1,
                        opacity: 1
                    },
                    exit: {
                        scale: 0.95,
                        opacity: 0
                    },
                    whileHover: {
                        scale: 1.08
                    },
                    whileTap: {
                        scale: 0.92
                    },
                    transition: {
                        type: "spring",
                        stiffness: 400,
                        damping: 25
                    },
                    onClick: open,
                    title: "Open AI Agent",
                    className: "hidden md:flex fixed bottom-6 right-6 z-40 size-12 rounded-full bg-green-600 text-white shadow-lg items-center justify-center",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$ghost$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Ghost$3e$__["Ghost"], {
                        className: "size-5"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/agent-panel/AgentPanelRoot.tsx",
                        lineNumber: 77,
                        columnNumber: 13
                    }, this)
                }, "agent-fab", false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/agent-panel/AgentPanelRoot.tsx",
                    lineNumber: 65,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/agent-panel/AgentPanelRoot.tsx",
                lineNumber: 63,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/agent-panel/AgentPanelRoot.tsx",
        lineNumber: 30,
        columnNumber: 5
    }, this);
}
_s(AgentPanelRoot, "gmrLiPJPq4hpgrjepfaESbZumOE=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$agent$2d$panel$2f$AgentPanelContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAgentPanel"]
    ];
});
_c = AgentPanelRoot;
var _c;
__turbopack_context__.k.register(_c, "AgentPanelRoot");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=_0v1d1zn._.js.map