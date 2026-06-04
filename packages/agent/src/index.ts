// @clerk/agent — shared agent core (Track 2 extraction, in progress).
//
// The orchestration, tools, Shopify client, prompt, context, settings, and
// policy surface move here out of apps/dashboard so the host (dashboard route
// or gateway worker) becomes a deployment choice. Public entry points land in
// this barrel as files move: runAgent, planAgent, buildContext, selectAgentTools,
// classifyHomePlan, and the policy surface.
//
// Authoring convention (mirrors @clerk/db): this is an ESM package built with
// plain tsc under NodeNext, so every relative import MUST carry a .js extension
// (e.g. `from "./settings.js"`).

export * from "./types.js";
export * from "./usage.js";
export * from "./settings.js";
export * from "./spend.js";
export * from "./ai/anthropic.js";
export * from "./ai/index.js";
