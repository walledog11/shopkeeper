// @shopkeeper/agent — shared agent core (Track 2 extraction, in progress).
//
// The orchestration, tools, Shopify client, prompt, context, settings, and
// policy surface move here out of apps/dashboard so the host (dashboard route
// or gateway worker) becomes a deployment choice. Public entry points land in
// this barrel as files move: runAgent, planAgent, buildContext, selectAgentTools,
// classifyHomePlan, and the policy surface.
//
// Authoring convention (mirrors @shopkeeper/db): this is an ESM package built with
// plain tsc under NodeNext, so every relative import MUST carry a .js extension
// (e.g. `from "./settings.js"`).

export * from "./types.js";
export * from "./agent-context.js";
export * from "./thread-constants.js";
export * from "./usage.js";
export * from "./settings.js";
export * from "./spend.js";
export * from "./ai/index.js";
export * from "./message-history.js";
export * from "./prompt.js";
export * from "./plan-preview.js";
export * from "./order-status-fast-path.js";
export * from "./agent-actions.js";
export * from "./context.js";
export * from "./planner.js";
export * from "./run.js";
export * from "./logger.js";
// Orchestration (Track 4.1) — server-safe; exposed for the gateway's eventual
// in-process call. The dashboard reaches these through subpaths/shims.
export * from "./thread-auth.js";
export * from "./internal-thread.js";
export * from "./turn.js";
export * from "./plan-execution.js";
