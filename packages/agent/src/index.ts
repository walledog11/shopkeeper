// @shopkeeper/agent — shared agent core for dashboard routes and the gateway worker.
//
// Import from subpaths for runtime modules (run, planner, tools, shopify, lock, etc.).
// The root export is intentionally narrow: shared domain types that dashboard DTOs
// re-export through `@/types`.
//
// Authoring convention (mirrors @shopkeeper/db): this is an ESM package built with
// plain tsc under NodeNext, so every relative import MUST carry a .js extension
// (e.g. `from "./settings.js"`).

export * from "./types.js";
