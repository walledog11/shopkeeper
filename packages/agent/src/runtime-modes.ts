import { ConflictError } from "./errors.js";

/** Persisted task versions remain readable; all new work uses this runtime. */
export const DURABLE_AGENT_RUNTIME_VERSION = 2;

export function requireDurableAgentRuntime(runtimeVersion = DURABLE_AGENT_RUNTIME_VERSION): void {
  if (runtimeVersion !== DURABLE_AGENT_RUNTIME_VERSION) {
    throw new ConflictError("This task uses a retired agent runtime. Regenerate its plan before continuing.");
  }
}
