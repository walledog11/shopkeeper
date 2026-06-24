import type Anthropic from "@anthropic-ai/sdk";
import { resolveAgentSettings } from "../../settings.js";
import type { OrgSettings } from "../../types.js";
import { CUSTOMER_TOOL_DEFINITIONS } from "./customer.js";
import { KNOWLEDGE_TOOL_DEFINITIONS } from "./knowledge.js";
import { MESSAGING_TOOL_DEFINITIONS } from "./messaging.js";
import { ORDER_TOOL_DEFINITIONS } from "./order.js";
import { PRODUCT_TOOL_DEFINITIONS } from "./product.js";
import { ToolInputValidationError } from "./schema.js";
import { STATS_TOOL_DEFINITIONS } from "./stats.js";
import { THREAD_TOOL_DEFINITIONS } from "./thread.js";
import type { AgentToolDefinition, ToolGroup } from "./types.js";

export type {
  AddInternalNoteInput,
  AddShopifyCustomerNoteInput,
  AgentToolDefinition,
  AskOperatorInput,
  CancelOrderInput,
  CreateRefundInput,
  CreateReturnInput,
  CreateShopifyOrderInput,
  CreateShopifyOrderLineItem,
  EditShopifyOrderInput,
  EscalateToHumanInput,
  GetOrderByNameInput,
  GetOrderTrackingInput,
  GetShopifyCustomerInput,
  GetShopifyOrdersInput,
  IssueDiscountInput,
  KnowledgeBaseToolArticle,
  RefundToolResult,
  SearchKbInput,
  SearchShopifyCustomersInput,
  SearchShopifyProductsInput,
  SendEmailInput,
  SendReplyInput,
  SupportStatsInput,
  ToolExecutionDeps,
  ToolGroup,
  ToolParser,
  ToolPolicyMetadata,
  UpdateShopifyCustomerInfoInput,
  UpdateShopifyOrderAddressInput,
  UpdateThreadStatusInput,
  UpdateThreadTagInput,
} from "./types.js";
export { ToolInputValidationError } from "./schema.js";

export const TOOL_DEFINITIONS = [
  ...KNOWLEDGE_TOOL_DEFINITIONS,
  ...PRODUCT_TOOL_DEFINITIONS,
  ...CUSTOMER_TOOL_DEFINITIONS,
  ...ORDER_TOOL_DEFINITIONS,
  ...THREAD_TOOL_DEFINITIONS,
  ...MESSAGING_TOOL_DEFINITIONS,
  ...STATS_TOOL_DEFINITIONS,
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]["name"];

export const TOOL_DEFINITION_REGISTRY: Record<string, AgentToolDefinition> = Object.fromEntries(
  TOOL_DEFINITIONS.map((definition) => [definition.name, definition])
);

const TOOL_GROUP_ORDER = ["knowledge", "product", "customer", "order", "thread", "messaging", "insights"] as const;

export const TOOL_CATEGORIES = Object.fromEntries(
  TOOL_DEFINITIONS.map((definition) => [definition.name, definition.category])
);

export const TOOL_GROUPS: Record<ToolGroup, readonly string[]> = TOOL_GROUP_ORDER.reduce(
  (groups, group) => ({
    ...groups,
    [group]: TOOL_DEFINITIONS
      .filter((definition) => definition.group === group)
      .map((definition) => definition.name),
  }),
  {} as Record<ToolGroup, readonly string[]>,
);

export const TOOL_LABELS: Record<string, string> = Object.fromEntries(
  TOOL_DEFINITIONS.map((definition) => [definition.name, definition.labels.executed])
);

export const PLAN_STEP_LABELS: Record<string, string> = Object.fromEntries(
  TOOL_DEFINITIONS.map((definition) => [definition.name, definition.labels.planStep])
);

export const AGENT_TOOLS: Anthropic.Tool[] = TOOL_DEFINITIONS.map((definition) => ({
  name: definition.name,
  description: definition.description,
  input_schema: definition.inputSchema,
}));

export function getToolDefinition(name: string): AgentToolDefinition | undefined {
  return TOOL_DEFINITION_REGISTRY[name];
}

export function isAgentToolName(name: string): name is ToolName {
  return Object.prototype.hasOwnProperty.call(TOOL_DEFINITION_REGISTRY, name);
}

export function parseToolInput(name: string, input: unknown): unknown {
  const definition = getToolDefinition(name);
  if (!definition) {
    throw new ToolInputValidationError(`unknown tool "${name}".`);
  }
  return definition.parse(input);
}

export function formatToolInputValidationError(name: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `invalid arguments for ${name}: ${message}`;
}

export function toolNamesForGroups(...groups: ToolGroup[]): string[] {
  return groups.flatMap((group) => [...TOOL_GROUPS[group]]);
}

export function selectAgentTools(
  settings?: OrgSettings,
  allowedToolNames?: readonly string[] | null,
): Anthropic.Tool[] {
  const s = resolveAgentSettings(settings);
  const allowed = allowedToolNames ? new Set(allowedToolNames) : null;
  return AGENT_TOOLS.filter((tool) => {
    const category = TOOL_CATEGORIES[tool.name];
    if (category && !s.toolsEnabled[category]) return false;
    if (allowed && !allowed.has(tool.name)) return false;
    return true;
  });
}
