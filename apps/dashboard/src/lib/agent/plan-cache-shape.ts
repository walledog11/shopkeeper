// Moved to @shopkeeper/agent/plan-cache-shape (Track 4.1). Re-export shim so existing
// dashboard imports (incl. client components) stay unchanged.
export {
  AGENT_PLAN_CACHE_VERSION,
  readAgentPlanCacheRecordShape,
  extractCachedDraftReply,
  getCurrentPlanForThread,
} from "@shopkeeper/agent/plan-cache-shape";
export type { AgentPlanCacheRecordShape } from "@shopkeeper/agent/plan-cache-shape";
