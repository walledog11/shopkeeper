# @shopkeeper/agent package surface

This package owns the shared agent core: orchestration, tools, Shopify client,
prompt/context assembly, settings, policy, and host-injected infra seams. Dashboard
routes and the gateway worker are deployment hosts; they import subpaths and inject
logging, locks, and thread sinks where needed.

## Public imports

- `@shopkeeper/agent` is a narrow root export for shared domain types (`OrgSettings`,
  `AgentPlan`, `AgentTurn`, etc.). Dashboard `@/types` re-exports these so UI and
  API DTO code can keep importing from `@/types`.
- `@shopkeeper/agent/types` is the same type surface as the root export. Prefer this
  subpath in new code when you only need domain types.
- Runtime modules are public subpaths only. Common entry points:
  - `@shopkeeper/agent/run`, `@shopkeeper/agent/planner`, `@shopkeeper/agent/build-context`
  - `@shopkeeper/agent/tools`, `@shopkeeper/agent/executor`, `@shopkeeper/agent/shopify`
  - `@shopkeeper/agent/settings`, `@shopkeeper/agent/spend`, `@shopkeeper/agent/usage`
  - `@shopkeeper/agent/ai`, `@shopkeeper/agent/logger`, `@shopkeeper/agent/lock`
  - `@shopkeeper/agent/observability`, `@shopkeeper/agent/order-ops`
  - `@shopkeeper/agent/turn`, `@shopkeeper/agent/plan-execution`, `@shopkeeper/agent/thread-auth`

See `package.json` `exports` for the full list of supported subpaths.

## Private modules

Implementation files under `src/` that are not listed in `package.json` `exports`
are private. Do not import them directly from apps; add or extend a subpath export
when a module becomes part of the public contract.

When adding a new public module, update `package.json` `exports`, keep `src/index.ts`
limited to shared domain types unless the root contract intentionally expands, and
update this note in the same change.
