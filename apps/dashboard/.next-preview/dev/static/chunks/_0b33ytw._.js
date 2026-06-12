(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>WorkflowSetupBanner
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/check.js [app-client] (ecmascript) <export default as Check>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/chevron-down.js [app-client] (ecmascript) <export default as ChevronDown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/chevron-right.js [app-client] (ecmascript) <export default as ChevronRight>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/x.js [app-client] (ecmascript) <export default as X>");
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
const DISMISS_KEY = 'workflowSetupBannerDismissed';
const EXPAND_KEY = 'workflowSetupBannerExpanded';
const PROGRESS_RING_RADIUS = 8;
const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RING_RADIUS;
function readStoredBoolean(key) {
    try {
        return localStorage.getItem(key) === 'true';
    } catch  {
        return false;
    }
}
function writeStoredBoolean(key, value) {
    try {
        localStorage.setItem(key, value ? 'true' : 'false');
    } catch  {
    // Storage can be unavailable in private browsing or restricted contexts.
    }
}
const bannerTransition = {
    type: "spring",
    stiffness: 520,
    damping: 38
};
const stepsListVariants = {
    collapsed: {
        height: 0,
        opacity: 0,
        transition: {
            height: {
                duration: 0.12,
                ease: "easeInOut"
            },
            opacity: {
                duration: 0.06
            },
            staggerChildren: 0.01,
            staggerDirection: -1
        }
    },
    open: {
        height: "auto",
        opacity: 1,
        transition: {
            height: {
                duration: 0.16,
                ease: "easeOut"
            },
            opacity: {
                duration: 0.08
            },
            staggerChildren: 0.018
        }
    }
};
const stepItemVariants = {
    collapsed: {
        opacity: 0,
        y: -2,
        transition: {
            duration: 0.06
        }
    },
    open: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.1,
            ease: "easeOut"
        }
    }
};
function getStepKey(step) {
    return `${step.label}:${step.href}`;
}
function WorkflowSetupBanner({ steps, doneCount }) {
    _s();
    const [dismissed, setDismissed] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        "WorkflowSetupBanner.useState": ()=>readStoredBoolean(DISMISS_KEY)
    }["WorkflowSetupBanner.useState"]);
    const [expanded, setExpanded] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        "WorkflowSetupBanner.useState": ()=>readStoredBoolean(EXPAND_KEY)
    }["WorkflowSetupBanner.useState"]);
    const totalCount = steps.length;
    const isVisible = dismissed === false && doneCount < totalCount;
    const remaining = Math.max(totalCount - doneCount, 0);
    const progress = totalCount > 0 ? Math.min(Math.max(doneCount / totalCount, 0), 1) : 0;
    const progressOffset = PROGRESS_RING_CIRCUMFERENCE * (1 - progress);
    const summary = `${remaining} left to finish setup`;
    function dismiss() {
        writeStoredBoolean(DISMISS_KEY, true);
        setDismissed(true);
    }
    function toggle() {
        const next = !expanded;
        setExpanded(next);
        writeStoredBoolean(EXPAND_KEY, next);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$LazyMotion$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["LazyMotion"], {
        features: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$dom$2f$features$2d$animation$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["domAnimation"],
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$AnimatePresence$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AnimatePresence"], {
            children: isVisible && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$m$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["m"].div, {
                initial: {
                    opacity: 0,
                    height: 0,
                    y: -6
                },
                animate: {
                    opacity: 1,
                    height: "auto",
                    y: 0
                },
                exit: {
                    opacity: 0,
                    height: 0,
                    y: -6
                },
                transition: bannerTransition,
                className: "rounded-md border border-white/[0.07] bg-white/[0.02] shrink-0 overflow-hidden",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-3 px-4 py-2.5",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: toggle,
                                className: "flex items-center gap-3 min-w-0 flex-1 text-left",
                                "aria-expanded": expanded,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$m$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["m"].div, {
                                        "aria-hidden": "true",
                                        whileHover: {
                                            scale: 1.08
                                        },
                                        transition: {
                                            duration: 0.16,
                                            ease: "easeOut"
                                        },
                                        className: "size-5 shrink-0",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                            viewBox: "0 0 20 20",
                                            className: "size-5",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                                                    cx: "10",
                                                    cy: "10",
                                                    r: PROGRESS_RING_RADIUS,
                                                    fill: "none",
                                                    strokeWidth: "2",
                                                    className: "stroke-green-400/15"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                                                    lineNumber: 135,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$m$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["m"].circle, {
                                                    cx: "10",
                                                    cy: "10",
                                                    r: PROGRESS_RING_RADIUS,
                                                    fill: "none",
                                                    strokeWidth: "2",
                                                    strokeLinecap: "round",
                                                    className: "stroke-green-400",
                                                    strokeDasharray: PROGRESS_RING_CIRCUMFERENCE,
                                                    initial: false,
                                                    animate: {
                                                        strokeDashoffset: progressOffset
                                                    },
                                                    transition: {
                                                        duration: 0.28,
                                                        ease: "easeOut"
                                                    },
                                                    transform: "rotate(-90 10 10)"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                                                    lineNumber: 143,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                                            lineNumber: 134,
                                            columnNumber: 17
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                                        lineNumber: 128,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-center gap-2.5 min-w-0 flex-1",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-xs font-semibold text-white/80 shrink-0",
                                                children: [
                                                    "Workflow setup · ",
                                                    doneCount,
                                                    " of ",
                                                    totalCount
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                                                lineNumber: 160,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-white/15",
                                                children: "—"
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                                                lineNumber: 163,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-xs text-white/45 truncate",
                                                children: summary
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                                                lineNumber: 164,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                                        lineNumber: 159,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$m$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["m"].div, {
                                        animate: {
                                            rotate: expanded ? 180 : 0
                                        },
                                        transition: {
                                            duration: 0.18,
                                            ease: "easeInOut"
                                        },
                                        className: "shrink-0",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__["ChevronDown"], {
                                            className: "size-3.5 text-white/40"
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                                            lineNumber: 171,
                                            columnNumber: 17
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                                        lineNumber: 166,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                                lineNumber: 122,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$m$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["m"].button, {
                                type: "button",
                                onClick: dismiss,
                                whileHover: {
                                    scale: 1.06
                                },
                                whileTap: {
                                    scale: 0.94
                                },
                                className: "size-6 rounded flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/[0.04] transition-colors shrink-0",
                                "aria-label": "Dismiss",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                                    className: "size-3.5"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                                    lineNumber: 182,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                                lineNumber: 174,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                        lineNumber: 121,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$AnimatePresence$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AnimatePresence"], {
                        initial: false,
                        children: expanded && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$m$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["m"].div, {
                            variants: stepsListVariants,
                            initial: "collapsed",
                            animate: "open",
                            exit: "collapsed",
                            className: "overflow-hidden",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                className: "border-t border-white/[0.06] px-2 py-1.5",
                                children: steps.map((step)=>{
                                    const isDone = step.status === "done";
                                    const stepKey = getStepKey(step);
                                    if (isDone) {
                                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$m$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["m"].li, {
                                            variants: stepItemVariants,
                                            className: "flex items-center gap-3 px-2.5 py-2 rounded-md",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "size-4 rounded-full bg-green-400/15 border border-green-400/40 flex items-center justify-center shrink-0",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__["Check"], {
                                                        className: "size-2.5 text-green-400"
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                                                        lineNumber: 208,
                                                        columnNumber: 29
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                                                    lineNumber: 207,
                                                    columnNumber: 27
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-xs text-white/40 line-through truncate flex-1",
                                                    children: step.label
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                                                    lineNumber: 210,
                                                    columnNumber: 27
                                                }, this)
                                            ]
                                        }, stepKey, true, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                                            lineNumber: 202,
                                            columnNumber: 25
                                        }, this);
                                    }
                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$m$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["m"].li, {
                                        variants: stepItemVariants,
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                            href: step.href,
                                            className: "group flex items-center gap-3 px-2.5 py-2 rounded-md hover:bg-white/[0.03] transition-colors",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "size-4 rounded-full border border-white/25 shrink-0"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                                                    lineNumber: 222,
                                                    columnNumber: 27
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-xs text-white/80 group-hover:text-white truncate flex-1",
                                                    children: step.label
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                                                    lineNumber: 223,
                                                    columnNumber: 27
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                                                    className: "size-3.5 text-white/30 group-hover:text-white/60 shrink-0 transition-colors"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                                                    lineNumber: 226,
                                                    columnNumber: 27
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                                            lineNumber: 218,
                                            columnNumber: 25
                                        }, this)
                                    }, stepKey, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                                        lineNumber: 217,
                                        columnNumber: 23
                                    }, this);
                                })
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                                lineNumber: 196,
                                columnNumber: 17
                            }, this)
                        }, "workflow-setup-steps", false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                            lineNumber: 188,
                            columnNumber: 15
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                        lineNumber: 186,
                        columnNumber: 11
                    }, this)
                ]
            }, "workflow-setup-banner", true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
                lineNumber: 113,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
            lineNumber: 111,
            columnNumber: 5
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx",
        lineNumber: 110,
        columnNumber: 5
    }, this);
}
_s(WorkflowSetupBanner, "yC5agvOieR2nR8vAQllp4H0qdo4=");
_c = WorkflowSetupBanner;
var _c;
__turbopack_context__.k.register(_c, "WorkflowSetupBanner");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/components/ui/card.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Card",
    ()=>Card,
    "CardAction",
    ()=>CardAction,
    "CardContent",
    ()=>CardContent,
    "CardDescription",
    ()=>CardDescription,
    "CardFooter",
    ()=>CardFooter,
    "CardHeader",
    ()=>CardHeader,
    "CardTitle",
    ()=>CardTitle
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/ui/cn.ts [app-client] (ecmascript)");
;
;
function Card({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "card",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex flex-col rounded-md border bg-card text-card-foreground shadow-sm", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/card.tsx",
        lineNumber: 7,
        columnNumber: 5
    }, this);
}
_c = Card;
function CardHeader({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "card-header",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 pt-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/card.tsx",
        lineNumber: 20,
        columnNumber: 5
    }, this);
}
_c1 = CardHeader;
function CardTitle({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "card-title",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("leading-none font-semibold", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/card.tsx",
        lineNumber: 33,
        columnNumber: 5
    }, this);
}
_c2 = CardTitle;
function CardDescription({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "card-description",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("text-sm text-muted-foreground", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/card.tsx",
        lineNumber: 43,
        columnNumber: 5
    }, this);
}
_c3 = CardDescription;
function CardAction({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "card-action",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/card.tsx",
        lineNumber: 53,
        columnNumber: 5
    }, this);
}
_c4 = CardAction;
function CardContent({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "card-content",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("px-6 pb-6", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/card.tsx",
        lineNumber: 66,
        columnNumber: 5
    }, this);
}
_c5 = CardContent;
function CardFooter({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "card-footer",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$ui$2f$cn$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex items-center px-6 [.border-t]:pt-6", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/components/ui/card.tsx",
        lineNumber: 76,
        columnNumber: 5
    }, this);
}
_c6 = CardFooter;
;
var _c, _c1, _c2, _c3, _c4, _c5, _c6;
__turbopack_context__.k.register(_c, "Card");
__turbopack_context__.k.register(_c1, "CardHeader");
__turbopack_context__.k.register(_c2, "CardTitle");
__turbopack_context__.k.register(_c3, "CardDescription");
__turbopack_context__.k.register(_c4, "CardAction");
__turbopack_context__.k.register(_c5, "CardContent");
__turbopack_context__.k.register(_c6, "CardFooter");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ConciergeBriefing
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageCircle$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/message-circle.js [app-client] (ecmascript) <export default as MessageCircle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/sparkles.js [app-client] (ecmascript) <export default as Sparkles>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/card.tsx [app-client] (ecmascript)");
"use client";
;
;
;
;
function formatChannelList(channels) {
    if (channels.length === 0) return "";
    if (channels.length === 1) return channels[0];
    if (channels.length === 2) return `${channels[0]} and ${channels[1]}`;
    return `${channels.slice(0, -1).join(', ')}, and ${channels[channels.length - 1]}`;
}
function ConciergeBriefing({ greeting, userName, agentName, hasTelegramBound, needsYouCount, overnightClearedCount, briefingChannels }) {
    const channelText = formatChannelList(briefingChannels);
    let narrative;
    if (overnightClearedCount === 0 && needsYouCount === 0) {
        narrative = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
            children: "You're all caught up — no new tickets since yesterday. I'm on duty for anything that comes in."
        }, void 0, false);
    } else if (overnightClearedCount === 0) {
        narrative = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
            children: [
                "Nothing new since yesterday, but",
                ' ',
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                    className: "font-semibold text-foreground tabular-nums",
                    children: [
                        needsYouCount,
                        " ticket",
                        needsYouCount === 1 ? '' : 's'
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx",
                    lineNumber: 44,
                    columnNumber: 9
                }, this),
                ' ',
                "need",
                needsYouCount === 1 ? 's' : '',
                " your eye."
            ]
        }, void 0, true);
    } else if (needsYouCount > 0) {
        narrative = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
            children: [
                "I drafted replies for",
                ' ',
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                    className: "font-semibold text-foreground tabular-nums",
                    children: [
                        overnightClearedCount,
                        " ticket",
                        overnightClearedCount === 1 ? '' : 's'
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx",
                    lineNumber: 52,
                    columnNumber: 9
                }, this),
                channelText && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                    children: [
                        " across ",
                        channelText
                    ]
                }, void 0, true),
                ".",
                ' ',
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                    className: "font-semibold text-foreground tabular-nums",
                    children: needsYouCount
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx",
                    lineNumber: 55,
                    columnNumber: 9
                }, this),
                ' ',
                "still need",
                needsYouCount === 1 ? 's' : '',
                " your eye."
            ]
        }, void 0, true);
    } else {
        narrative = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                    className: "font-semibold text-foreground tabular-nums",
                    children: [
                        overnightClearedCount,
                        " ticket",
                        overnightClearedCount === 1 ? ' is' : 's are'
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx",
                    lineNumber: 62,
                    columnNumber: 9
                }, this),
                ' ',
                "ready for you",
                channelText && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                    children: [
                        " from ",
                        channelText
                    ]
                }, void 0, true),
                "."
            ]
        }, void 0, true);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
        className: "bg-card border-border rounded-2xl",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex items-start gap-3.5 px-6 pt-5 pb-5",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "size-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-display-serif text-lg leading-none shrink-0 select-none",
                    "aria-hidden": true,
                    children: agentName.charAt(0).toUpperCase()
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx",
                    lineNumber: 71,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "min-w-0 flex-1",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-xs text-foreground/45 leading-none mt-1",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "font-semibold text-foreground/70",
                                    children: agentName
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx",
                                    lineNumber: 77,
                                    columnNumber: 13
                                }, this),
                                " · briefing"
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx",
                            lineNumber: 76,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                            className: "mt-2.5 font-display-serif text-[27px] leading-tight text-foreground",
                            children: [
                                greeting,
                                ", ",
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "italic text-[#9c9285]",
                                    children: userName
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx",
                                    lineNumber: 80,
                                    columnNumber: 25
                                }, this),
                                "."
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx",
                            lineNumber: 79,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "mt-1.5 text-sm text-foreground/60 leading-relaxed max-w-2xl",
                            children: narrative
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx",
                            lineNumber: 82,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center gap-2 mt-4 flex-wrap",
                            children: [
                                needsYouCount > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                    href: "#needs-you",
                                    className: "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-amber-600 hover:bg-amber-700 text-primary-foreground text-xs font-semibold transition-colors",
                                    children: [
                                        "Review ",
                                        needsYouCount
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx",
                                    lineNumber: 88,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                    href: "/dashboard/tickets",
                                    className: "px-4 py-1.5 rounded-full border border-border hover:bg-foreground/[0.04] text-xs font-semibold text-foreground/75 transition-colors",
                                    children: "Open inbox"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx",
                                    lineNumber: 95,
                                    columnNumber: 13
                                }, this),
                                hasTelegramBound ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                    href: "/dashboard/integrations#telegram",
                                    className: "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-blue-600/10 hover:bg-blue-600/20 text-xs font-semibold text-blue-700 transition-colors",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageCircle$3e$__["MessageCircle"], {
                                            className: "size-3"
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx",
                                            lineNumber: 106,
                                            columnNumber: 17
                                        }, this),
                                        " Message on Telegram"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx",
                                    lineNumber: 102,
                                    columnNumber: 15
                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                            href: "/dashboard/integrations#telegram",
                                            className: "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-blue-600/10 hover:bg-blue-600/20 text-xs font-semibold text-blue-700 transition-colors",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageCircle$3e$__["MessageCircle"], {
                                                    className: "size-3"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx",
                                                    lineNumber: 114,
                                                    columnNumber: 19
                                                }, this),
                                                " Connect Telegram"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx",
                                            lineNumber: 110,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                            href: "/dashboard/agent",
                                            className: "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-foreground/55 hover:text-foreground/85 transition-colors",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"], {
                                                    className: "size-3"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx",
                                                    lineNumber: 120,
                                                    columnNumber: 19
                                                }, this),
                                                " Open desk chat"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx",
                                            lineNumber: 116,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx",
                            lineNumber: 86,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx",
                    lineNumber: 75,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx",
            lineNumber: 70,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx",
        lineNumber: 69,
        columnNumber: 5
    }, this);
}
_c = ConciergeBriefing;
var _c;
__turbopack_context__.k.register(_c, "ConciergeBriefing");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/home/HomeDigest.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>HomeDigest
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
;
function formatMinutes(minutes) {
    if (minutes < 60) {
        const whole = Math.floor(minutes);
        const secs = Math.round((minutes - whole) * 60);
        return secs > 0 ? `${whole}m ${secs}s` : `${whole}m`;
    }
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
function HomeDigest({ isLoading, openCount, openDelta, firstReplyMinutes, autoResolvedPct, weeklyVolume }) {
    if (isLoading) return null;
    const parts = [
        `${openCount} open${openDelta !== 0 ? ` (${openDelta > 0 ? "+" : ""}${openDelta} vs yesterday)` : ""}`,
        `${weeklyVolume.toLocaleString()} ticket${weeklyVolume === 1 ? "" : "s"} this week`
    ];
    if (firstReplyMinutes != null) parts.push(`first reply ${formatMinutes(firstReplyMinutes)}`);
    if (autoResolvedPct != null) parts.push(`${autoResolvedPct}% handled with your OK`);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
        className: "px-1 text-xs text-white/40 tabular-nums",
        children: parts.join(" · ")
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/HomeDigest.tsx",
        lineNumber: 31,
        columnNumber: 10
    }, this);
}
_c = HomeDigest;
var _c;
__turbopack_context__.k.register(_c, "HomeDigest");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>NeedsYou
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertCircle$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/circle-alert.js [app-client] (ecmascript) <export default as AlertCircle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$camera$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Camera$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/camera.js [app-client] (ecmascript) <export default as Camera>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/loader-circle.js [app-client] (ecmascript) <export default as Loader2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$mail$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Mail$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/mail.js [app-client] (ecmascript) <export default as Mail>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$square$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageSquare$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/message-square.js [app-client] (ecmascript) <export default as MessageSquare>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$shopping$2d$bag$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ShoppingBag$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/shopping-bag.js [app-client] (ecmascript) <export default as ShoppingBag>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/card.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
const CHANNEL_META = {
    Email: {
        Icon: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$mail$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Mail$3e$__["Mail"],
        className: "text-blue-600"
    },
    Instagram: {
        Icon: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$camera$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Camera$3e$__["Camera"],
        className: "text-pink-600"
    },
    Shopify: {
        Icon: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$shopping$2d$bag$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ShoppingBag$3e$__["ShoppingBag"],
        className: "text-green-600"
    }
};
function NeedsYou({ items, agentName, onApproved }) {
    if (items.length === 0) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        id: "needs-you",
        className: "flex flex-col gap-2.5",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-baseline gap-3",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                    className: "font-display-serif text-lg text-foreground",
                    children: "Needs you"
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                    lineNumber: 28,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                lineNumber: 27,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-2",
                children: items.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(NeedsYouRow, {
                        item: item,
                        agentName: agentName,
                        onApproved: onApproved
                    }, item.threadId, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                        lineNumber: 33,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                lineNumber: 31,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
        lineNumber: 26,
        columnNumber: 5
    }, this);
}
_c = NeedsYou;
function NeedsYouRow({ item, agentName, onApproved }) {
    _s();
    const channelMeta = CHANNEL_META[item.channelName] ?? {
        Icon: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$square$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageSquare$3e$__["MessageSquare"],
        className: "text-foreground/40"
    };
    const ChannelIcon = channelMeta.Icon;
    const [isApproving, setIsApproving] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [approvalError, setApprovalError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const approveQuickReply = async ()=>{
        if (item.kind !== "quick_reply" || isApproving) return;
        setIsApproving(true);
        setApprovalError(null);
        try {
            const response = await fetch("/api/agent/quick-approve", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    threadId: item.threadId
                })
            });
            const data = await response.json().catch(()=>null);
            if (!response.ok) {
                setApprovalError(data?.error ?? "Could not send reply.");
                return;
            }
            onApproved();
        } catch  {
            setApprovalError("Network error. Try again.");
        } finally{
            setIsApproving(false);
        }
    };
    const isQuickReply = item.kind === "quick_reply" && item.replyText;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
        className: "bg-card border-border rounded-xl overflow-hidden",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex md:flex-row flex-col items-stretch",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex-1 min-w-0 px-4 py-3.5",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            href: `/dashboard/tickets?thread=${item.threadId}`,
                            className: "text-sm font-semibold text-foreground/90 hover:text-foreground transition-colors leading-snug",
                            children: item.headline
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                            lineNumber: 79,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center gap-1.5 text-xs text-foreground/45 mt-1 mb-2.5",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "font-medium text-foreground/65 truncate",
                                    children: item.customerName
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                                    lineNumber: 87,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-foreground/20",
                                    children: "·"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                                    lineNumber: 88,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ChannelIcon, {
                                    "aria-hidden": true,
                                    className: `size-[11px] shrink-0 ${channelMeta.className}`
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                                    lineNumber: 89,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: item.channelName
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                                    lineNumber: 90,
                                    columnNumber: 13
                                }, this),
                                item.orderRef && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-foreground/20",
                                            children: "·"
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                                            lineNumber: 93,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "tabular-nums",
                                            children: item.orderRef
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                                            lineNumber: 94,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-foreground/20",
                                    children: "·"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                                    lineNumber: 97,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: item.timeAgo
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                                    lineNumber: 98,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                            lineNumber: 86,
                            columnNumber: 11
                        }, this),
                        item.contextLine && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-xs text-foreground/55 leading-snug mb-2",
                            children: item.contextLine
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                            lineNumber: 102,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-start gap-2.5",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "size-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-display-serif text-[11px] leading-none shrink-0 select-none mt-4",
                                    "aria-hidden": true,
                                    children: agentName.charAt(0).toUpperCase()
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                                    lineNumber: 106,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "min-w-0 flex-1",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "text-[11px] text-foreground/45 mb-1",
                                            children: [
                                                agentName,
                                                " ",
                                                isQuickReply ? "drafted this reply" : "proposes"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                                            lineNumber: 110,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: isQuickReply ? "px-3.5 py-2.5 rounded-2xl rounded-tl-md bg-foreground/[0.04] border border-border w-fit" : "px-3.5 py-2.5 rounded-2xl rounded-tl-md bg-amber-600/[0.07] border border-amber-600/25 w-fit",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: "text-[13px] text-foreground/80 leading-relaxed",
                                                children: isQuickReply ? item.replyText : item.proposalSummary
                                            }, void 0, false, {
                                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                                                lineNumber: 120,
                                                columnNumber: 17
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                                            lineNumber: 113,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                                    lineNumber: 109,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                            lineNumber: 105,
                            columnNumber: 11
                        }, this),
                        approvalError && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "mt-2 flex items-center gap-1.5 text-xs text-red-600",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertCircle$3e$__["AlertCircle"], {
                                    "aria-hidden": true,
                                    className: "size-3 shrink-0"
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                                    lineNumber: 129,
                                    columnNumber: 15
                                }, this),
                                approvalError
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                            lineNumber: 128,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                    lineNumber: 78,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex flex-col gap-1.5 justify-center p-3 md:border-l max-md:border-t border-border",
                    children: item.kind === "quick_reply" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: approveQuickReply,
                                disabled: isApproving,
                                className: "inline-flex items-center justify-center gap-1.5 text-center md:text-xs text-sm font-semibold px-4 md:py-2.5 py-3.5 rounded-full bg-green-600 hover:bg-green-700 disabled:opacity-40 text-primary-foreground transition-colors",
                                children: [
                                    isApproving && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                        "aria-hidden": true,
                                        className: "size-3 animate-spin"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                                        lineNumber: 144,
                                        columnNumber: 33
                                    }, this),
                                    isApproving ? "Sending" : "Send as-is"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                                lineNumber: 138,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                href: `/dashboard/tickets?thread=${item.threadId}`,
                                className: "text-center md:text-xs text-sm font-semibold px-4 md:py-2.5 py-3.5 rounded-full border border-border hover:bg-foreground/[0.04] text-foreground/70 transition-colors",
                                children: "View ticket"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                                lineNumber: 147,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                        href: `/dashboard/tickets?thread=${item.threadId}`,
                        className: "text-center md:text-xs text-sm font-semibold px-4 md:py-2.5 py-3.5 rounded-full bg-amber-600 hover:bg-amber-700 text-primary-foreground transition-colors",
                        children: "Review decision"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                        lineNumber: 155,
                        columnNumber: 13
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
                    lineNumber: 135,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
            lineNumber: 77,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx",
        lineNumber: 76,
        columnNumber: 5
    }, this);
}
_s(NeedsYouRow, "FWaWR81YfVxnLWbYGohIopjR9H0=");
_c1 = NeedsYouRow;
var _c, _c1;
__turbopack_context__.k.register(_c, "NeedsYou");
__turbopack_context__.k.register(_c1, "NeedsYouRow");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/home/ClearedOvernight.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ClearedOvernight
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/components/ui/card.tsx [app-client] (ecmascript)");
;
;
;
const TOPIC_COLORS = {
    Shipping: {
        bar: 'border-l-blue-400/70',
        text: 'text-blue-400',
        bg: 'bg-blue-400/10'
    },
    Returns: {
        bar: 'border-l-amber-400/70',
        text: 'text-amber-400',
        bg: 'bg-amber-400/10'
    },
    "Order Status": {
        bar: 'border-l-emerald-400/70',
        text: 'text-emerald-400',
        bg: 'bg-emerald-400/10'
    },
    "Product Inquiry": {
        bar: 'border-l-violet-400/70',
        text: 'text-violet-400',
        bg: 'bg-violet-400/10'
    },
    General: {
        bar: 'border-l-slate-400/70',
        text: 'text-slate-300',
        bg: 'bg-slate-400/10'
    }
};
function formatHours(hours) {
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    return `${hours.toFixed(1)} hours`;
}
function ClearedOvernight({ agentName, totalCount, topics, timeSavedHours, repliesSent }) {
    if (totalCount === 0) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: "flex flex-col gap-2.5",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-baseline gap-3 flex-wrap",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: "text-sm font-bold text-white/85",
                        children: [
                            agentName,
                            " cleared overnight"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ClearedOvernight.tsx",
                        lineNumber: 32,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs text-white/35 tabular-nums",
                        children: totalCount
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ClearedOvernight.tsx",
                        lineNumber: 33,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs text-white/35",
                        children: [
                            "· Saved you ~",
                            formatHours(timeSavedHours),
                            " · ",
                            repliesSent,
                            " repl",
                            repliesSent === 1 ? 'y' : 'ies',
                            " sent"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ClearedOvernight.tsx",
                        lineNumber: 34,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                        href: "/dashboard/review?focus=auto&from=24h",
                        className: "text-xs font-semibold text-white/45 hover:text-white/75 transition-colors",
                        children: "See what was sent"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ClearedOvernight.tsx",
                        lineNumber: 37,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ClearedOvernight.tsx",
                lineNumber: 31,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid grid-cols-2 @min-[800px]:grid-cols-4 gap-2",
                children: topics.map((t)=>{
                    const color = TOPIC_COLORS[t.tag] ?? TOPIC_COLORS.General;
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                        className: `bg-card border-border rounded-md p-3 border-l-2 ${color.bar}`,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: `inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold ${color.text} ${color.bg} mb-2`,
                                children: t.tag
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ClearedOvernight.tsx",
                                lineNumber: 50,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-2xl font-bold tabular-nums text-white leading-none",
                                children: t.count
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ClearedOvernight.tsx",
                                lineNumber: 53,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-xs text-white/40 mt-1.5 leading-snug",
                                children: t.subtitle
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ClearedOvernight.tsx",
                                lineNumber: 54,
                                columnNumber: 15
                            }, this)
                        ]
                    }, t.tag, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ClearedOvernight.tsx",
                        lineNumber: 49,
                        columnNumber: 13
                    }, this);
                })
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ClearedOvernight.tsx",
                lineNumber: 45,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/ClearedOvernight.tsx",
        lineNumber: 30,
        columnNumber: 5
    }, this);
}
_c = ClearedOvernight;
var _c;
__turbopack_context__.k.register(_c, "ClearedOvernight");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/home/TodayShape.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>TodayShape
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
;
;
const TONE_CLASS = {
    good: 'text-green-400',
    warn: 'text-amber-400',
    neutral: 'text-white'
};
function TodayShape({ ordersToShip, refundsPending, vipsInQueue }) {
    const now = new Date();
    const dateLabel = now.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
    const rows = [];
    if (ordersToShip != null) {
        rows.push({
            label: 'Orders to ship',
            href: '/dashboard/orders',
            sublabel: 'unfulfilled',
            count: ordersToShip,
            tone: ordersToShip > 0 ? 'neutral' : 'good'
        });
    }
    rows.push({
        label: 'Refunds pending',
        href: '/dashboard/tickets?tag=Returns',
        sublabel: 'awaiting your call',
        count: refundsPending,
        tone: refundsPending > 0 ? 'warn' : 'neutral'
    });
    rows.push({
        label: 'VIPs in queue',
        href: '/dashboard/tickets',
        sublabel: 'repeat customers',
        count: vipsInQueue,
        tone: vipsInQueue > 0 ? 'warn' : 'neutral'
    });
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex flex-col gap-2.5",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-2",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-xs uppercase tracking-wider font-semibold text-white/40",
                    children: dateLabel
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayShape.tsx",
                    lineNumber: 57,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayShape.tsx",
                lineNumber: 56,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-1.5",
                children: rows.map((row)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                        href: row.href,
                        className: "flex items-center justify-between px-3 py-2.5 rounded-md bg-card border border-border hover:border-white/[0.14] transition-colors",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "min-w-0",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-[12px] font-semibold text-white/85 truncate",
                                        children: row.label
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayShape.tsx",
                                        lineNumber: 67,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-xs text-white/35 truncate",
                                        children: row.sublabel
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayShape.tsx",
                                        lineNumber: 68,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayShape.tsx",
                                lineNumber: 66,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: `text-xl font-bold tabular-nums shrink-0 ${TONE_CLASS[row.tone]}`,
                                children: row.count
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayShape.tsx",
                                lineNumber: 70,
                                columnNumber: 13
                            }, this)
                        ]
                    }, row.label, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayShape.tsx",
                        lineNumber: 61,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayShape.tsx",
                lineNumber: 59,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayShape.tsx",
        lineNumber: 55,
        columnNumber: 5
    }, this);
}
_c = TodayShape;
var _c;
__turbopack_context__.k.register(_c, "TodayShape");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/home/TodayOrders.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>TodayOrders
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowRight$3e$__ = __turbopack_context__.i("[project]/apps/dashboard/node_modules/lucide-react/dist/esm/icons/arrow-right.js [app-client] (ecmascript) <export default as ArrowRight>");
;
;
;
const STATUS_LABEL = {
    ship: 'SHIP',
    refund: 'REFUND'
};
const STATUS_COLOR = {
    ship: 'text-white/45 bg-white/[0.06] border-white/[0.08]',
    refund: 'text-amber-400 bg-amber-400/10 border-amber-400/20'
};
function TodayOrders({ orders, hasShopify }) {
    if (!hasShopify) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex flex-col gap-2.5",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-xs uppercase tracking-wider font-semibold text-white/40",
                    children: "Today's orders"
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayOrders.tsx",
                    lineNumber: 32,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                    href: "/dashboard/integrations",
                    className: "px-3 py-4 rounded-md bg-card border border-border hover:border-white/[0.14] transition-colors text-center",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-xs text-white/55",
                            children: "Connect Shopify to see today's orders here."
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayOrders.tsx",
                            lineNumber: 37,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-xs font-semibold text-green-400 mt-2",
                            children: "Connect Shopify →"
                        }, void 0, false, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayOrders.tsx",
                            lineNumber: 38,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayOrders.tsx",
                    lineNumber: 33,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayOrders.tsx",
            lineNumber: 31,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex flex-col gap-2.5",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-xs uppercase tracking-wider font-semibold text-white/40",
                        children: "Today's orders"
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayOrders.tsx",
                        lineNumber: 47,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                        href: "/dashboard/orders",
                        className: "text-xs text-white/35 hover:text-white/70 inline-flex items-center gap-0.5",
                        children: [
                            "View all ",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowRight$3e$__["ArrowRight"], {
                                className: "size-2.5"
                            }, void 0, false, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayOrders.tsx",
                                lineNumber: 49,
                                columnNumber: 20
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayOrders.tsx",
                        lineNumber: 48,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayOrders.tsx",
                lineNumber: 46,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "rounded-md bg-card border border-border overflow-hidden",
                children: orders.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "px-3 py-6 text-center",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-xs text-white/30",
                        children: "No orders to show."
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayOrders.tsx",
                        lineNumber: 55,
                        columnNumber: 13
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayOrders.tsx",
                    lineNumber: 54,
                    columnNumber: 11
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "divide-y divide-white/[0.04]",
                    children: orders.map((o)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            href: "/dashboard/orders",
                            className: "flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.03] transition-colors",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: `shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider border ${STATUS_COLOR[o.status]}`,
                                    children: STATUS_LABEL[o.status]
                                }, void 0, false, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayOrders.tsx",
                                    lineNumber: 65,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "min-w-0 flex-1",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "text-[12px] text-white/80 truncate",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-white/40 tabular-nums mr-1",
                                                    children: o.name
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayOrders.tsx",
                                                    lineNumber: 70,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "font-semibold",
                                                    children: o.customerName
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayOrders.tsx",
                                                    lineNumber: 71,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayOrders.tsx",
                                            lineNumber: 69,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "text-xs text-white/35 truncate",
                                            children: o.status === 'refund' && o.amount ? `$${o.amount} · awaiting your call` : o.summary || ','
                                        }, void 0, false, {
                                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayOrders.tsx",
                                            lineNumber: 73,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayOrders.tsx",
                                    lineNumber: 68,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, o.id, true, {
                            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayOrders.tsx",
                            lineNumber: 60,
                            columnNumber: 15
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayOrders.tsx",
                    lineNumber: 58,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayOrders.tsx",
                lineNumber: 52,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/TodayOrders.tsx",
        lineNumber: 45,
        columnNumber: 5
    }, this);
}
_c = TodayOrders;
var _c;
__turbopack_context__.k.register(_c, "TodayOrders");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/lib/home/summary-contract.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/lib/home/summary-view.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "buildHomeSummaryView",
    ()=>buildHomeSummaryView
]);
const MINUTES_SAVED_PER_AUTO_TICKET = 14;
function buildHomeSummaryView(summary) {
    return {
        ...summary.metrics,
        needsYouItems: summary.needsAttention,
        clearedTopics: summary.overnight.topics,
        briefingChannels: summary.overnight.channelNames,
        repeatCustomers: summary.repeatCustomers,
        timeSavedHours: summary.metrics.overnightClearedCount * MINUTES_SAVED_PER_AUTO_TICKET / 60
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/agent/dist/thread-constants.js [app-client] (ecmascript)", ((__turbopack_context__) => {
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/home/useHomeData.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useHomeData",
    ()=>useHomeData
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/swr/dist/index/index.mjs [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$shared$2f$dist$2f$runtime$2f$react$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@clerk/shared/dist/runtime/react/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/settings.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/api/fetcher.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$home$2f$summary$2d$contract$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/home/summary-contract.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$home$2f$summary$2d$view$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/lib/home/summary-view.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/agent/dist/thread-constants.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useOrg$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/hooks/useOrg.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
;
;
;
;
;
;
;
;
;
function useHomeData({ initialSummary }) {
    _s();
    const { data: summaryData, isLoading, mutate: mutateSummary } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"])("/api/home-summary", __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetcher"], {
        fallbackData: initialSummary,
        refreshInterval: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$home$2f$summary$2d$contract$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HOME_SUMMARY_REFRESH_INTERVAL_MS"]
    });
    const { data: integrations = [] } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"])("/api/integrations", __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetcher"]);
    const { data: orgData } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useOrg$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useOrg"])();
    const { data: kbData } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"])("/api/kb", __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetcher"], {
        revalidateOnFocus: false
    });
    const { data: telegramData } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"])("/api/integrations/telegram", __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetcher"], {
        revalidateOnFocus: false
    });
    const { memberships } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$shared$2f$dist$2f$runtime$2f$react$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useOrganization"])({
        memberships: {
            infinite: false,
            pageSize: 10
        }
    });
    const channelConnected = integrations.length > 0;
    const hasShopify = integrations.some((integration)=>integration.platform === __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$thread$2d$constants$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CHANNEL_TYPE"].SHOPIFY);
    const summary = summaryData ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$home$2f$summary$2d$contract$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createEmptyHomeSummary"])();
    const home = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "useHomeData.useMemo[home]": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$home$2f$summary$2d$view$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildHomeSummaryView"])(summary)
    }["useHomeData.useMemo[home]"], [
        summary
    ]);
    const { data: ordersData } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"])(hasShopify ? "/api/orders?limit=10" : null, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$lib$2f$api$2f$fetcher$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetcher"], {
        refreshInterval: 300_000,
        revalidateOnFocus: false
    });
    const ordersToShip = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "useHomeData.useMemo[ordersToShip]": ()=>{
            if (!ordersData?.orders) return null;
            return ordersData.orders.filter({
                "useHomeData.useMemo[ordersToShip]": (order)=>order.fulfillment_status == null && order.financial_status === "paid"
            }["useHomeData.useMemo[ordersToShip]"]).length;
        }
    }["useHomeData.useMemo[ordersToShip]"], [
        ordersData
    ]);
    const todaysOrders = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "useHomeData.useMemo[todaysOrders]": ()=>{
            if (!ordersData?.orders) return [];
            return ordersData.orders.slice(0, 5).map({
                "useHomeData.useMemo[todaysOrders]": (order)=>{
                    const lineItem = order.line_items[0];
                    const summary = lineItem ? `${lineItem.title}${lineItem.variant_title ? ` — ${lineItem.variant_title}` : ""}` : "";
                    const status = order.financial_status === "refunded" || order.financial_status === "partially_refunded" ? "refund" : "ship";
                    return {
                        id: order.id,
                        name: order.name,
                        customerName: order.customer?.name || "Guest",
                        summary,
                        status,
                        amount: status === "refund" ? order.total_price : null
                    };
                }
            }["useHomeData.useMemo[todaysOrders]"]);
        }
    }["useHomeData.useMemo[todaysOrders]"], [
        ordersData
    ]);
    const hasKbArticle = (kbData?.knowledgeBases ?? []).some((kb)=>kb.articles.length > 0);
    const hasTelegramBound = telegramData?.connected ?? false;
    const hasInvitedTeam = (memberships?.data?.length ?? 1) > 1;
    const hasMultipleChannels = integrations.length > 1;
    const hasConfiguredAgent = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "useHomeData.useMemo[hasConfiguredAgent]": ()=>{
            const settings = orgData?.settings ?? {};
            return !!(settings.aiContext && settings.aiContext.trim().length > 0 || settings.brandVoice && settings.brandVoice.trim().length > 0 || settings.agentName && settings.agentName !== __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AGENT_SETTINGS_DEFAULTS"].agentName);
        }
    }["useHomeData.useMemo[hasConfiguredAgent]"], [
        orgData
    ]);
    const workflowSteps = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "useHomeData.useMemo[workflowSteps]": ()=>[
                {
                    label: "Connect a channel",
                    href: "/dashboard/integrations",
                    status: channelConnected ? "done" : "pending"
                },
                {
                    label: "Connect Shopify",
                    href: "/dashboard/integrations",
                    status: hasShopify ? "done" : "pending"
                },
                {
                    label: "Configure agent",
                    href: "/dashboard/settings?tab=agent",
                    status: hasConfiguredAgent ? "done" : "pending"
                },
                {
                    label: "Add memory notes",
                    href: "/dashboard/kb",
                    status: hasKbArticle ? "done" : "pending"
                },
                {
                    label: "Send your first reply",
                    href: "/dashboard/tickets",
                    status: home.hasSentReply ? "done" : "pending"
                },
                {
                    label: "Invite team members",
                    href: "/dashboard/team",
                    status: hasInvitedTeam ? "done" : "pending"
                },
                {
                    label: "Connect Telegram for notifications",
                    href: "/dashboard/integrations",
                    status: hasTelegramBound ? "done" : "pending"
                },
                {
                    label: "Add more channels",
                    href: "/dashboard/integrations",
                    status: hasMultipleChannels ? "done" : "pending"
                }
            ]
    }["useHomeData.useMemo[workflowSteps]"], [
        channelConnected,
        hasShopify,
        hasConfiguredAgent,
        hasKbArticle,
        home.hasSentReply,
        hasInvitedTeam,
        hasTelegramBound,
        hasMultipleChannels
    ]);
    const workflowDoneCount = workflowSteps.filter((step)=>step.status === "done").length;
    const agentName = orgData?.settings?.agentName ?? __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$agent$2f$dist$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AGENT_SETTINGS_DEFAULTS"].agentName;
    const refreshHomeSummary = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useHomeData.useCallback[refreshHomeSummary]": ()=>{
            void mutateSummary();
        }
    }["useHomeData.useCallback[refreshHomeSummary]"], [
        mutateSummary
    ]);
    return {
        isLoading,
        ...home,
        ordersToShip,
        todaysOrders,
        hasShopify,
        hasTelegramBound,
        workflowSteps,
        workflowDoneCount,
        agentName,
        refreshHomeSummary
    };
}
_s(useHomeData, "NP5OfveFZ2YVYNRKXQO0elCx+hU=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$hooks$2f$useOrg$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useOrg"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$shared$2f$dist$2f$runtime$2f$react$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useOrganization"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>DashboardHomeClient
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$home$2f$WorkflowSetupBanner$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/home/WorkflowSetupBanner.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$home$2f$ConciergeBriefing$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/home/ConciergeBriefing.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$home$2f$HomeDigest$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/home/HomeDigest.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$home$2f$NeedsYou$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/home/NeedsYou.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$home$2f$ClearedOvernight$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/home/ClearedOvernight.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$home$2f$TodayShape$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/home/TodayShape.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$home$2f$TodayOrders$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/home/TodayOrders.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$home$2f$useHomeData$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/dashboard/src/app/dashboard/_components/home/useHomeData.ts [app-client] (ecmascript)");
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
function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
}
function DashboardHomeClient({ userName, initialSummary }) {
    _s();
    const greeting = getGreeting();
    const data = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$home$2f$useHomeData$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useHomeData"])({
        initialSummary
    });
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "@container h-full flex flex-col overflow-hidden bg-background",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex-1 overflow-y-auto overflow-x-hidden",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex flex-col min-h-full px-5 md:px-6 pt-3 pb-6 gap-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$home$2f$WorkflowSetupBanner$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                        steps: data.workflowSteps,
                        doneCount: data.workflowDoneCount
                    }, void 0, false, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx",
                        lineNumber: 34,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid grid-cols-1 @min-[1000px]:grid-cols-[1fr_280px] gap-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex flex-col gap-4 min-w-0",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$home$2f$ConciergeBriefing$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                        greeting: greeting,
                                        userName: userName,
                                        agentName: data.agentName,
                                        hasTelegramBound: data.hasTelegramBound,
                                        needsYouCount: data.needsYouCount,
                                        overnightClearedCount: data.overnightClearedCount,
                                        briefingChannels: data.briefingChannels
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx",
                                        lineNumber: 41,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$home$2f$HomeDigest$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                        isLoading: data.isLoading,
                                        openCount: data.openCount,
                                        openDelta: data.openDelta,
                                        firstReplyMinutes: data.firstReplyMinutes,
                                        autoResolvedPct: data.autoResolvedPct,
                                        weeklyVolume: data.weeklyVolume
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx",
                                        lineNumber: 51,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$home$2f$NeedsYou$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                        items: data.needsYouItems,
                                        agentName: data.agentName,
                                        onApproved: data.refreshHomeSummary
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx",
                                        lineNumber: 60,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$home$2f$ClearedOvernight$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                        agentName: data.agentName,
                                        totalCount: data.overnightClearedCount,
                                        topics: data.clearedTopics,
                                        timeSavedHours: data.timeSavedHours,
                                        repliesSent: data.repliesSent24h
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx",
                                        lineNumber: 66,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx",
                                lineNumber: 40,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex flex-col gap-4",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$home$2f$TodayShape$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                        ordersToShip: data.ordersToShip,
                                        refundsPending: data.refundsPending,
                                        vipsInQueue: data.vipsInQueue
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx",
                                        lineNumber: 76,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$home$2f$TodayOrders$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                        orders: data.todaysOrders,
                                        hasShopify: data.hasShopify
                                    }, void 0, false, {
                                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx",
                                        lineNumber: 81,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx",
                                lineNumber: 75,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx",
                        lineNumber: 39,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx",
                lineNumber: 32,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx",
            lineNumber: 31,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/dashboard/src/app/dashboard/_components/home/DashboardHomeClient.tsx",
        lineNumber: 30,
        columnNumber: 5
    }, this);
}
_s(DashboardHomeClient, "ZP/OewGNm1AajjShfzk7/GyQn/Y=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$dashboard$2f$src$2f$app$2f$dashboard$2f$_components$2f$home$2f$useHomeData$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useHomeData"]
    ];
});
_c = DashboardHomeClient;
var _c;
__turbopack_context__.k.register(_c, "DashboardHomeClient");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=_0b33ytw._.js.map