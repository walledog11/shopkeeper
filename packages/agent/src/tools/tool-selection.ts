import type Anthropic from "@anthropic-ai/sdk";
import type { OrgSettings } from "../types.js";
import { resolveAgentSettings } from "../settings.js";
import { TOOL_CATEGORIES } from "./tool-metadata.js";
import { AGENT_TOOLS } from "./tool-schemas.js";

// Filter tools by org settings and optional allow-list.
export function selectAgentTools(
  settings?: OrgSettings,
  allowedToolNames?: readonly string[] | null,
): Anthropic.Tool[] {
  const s = resolveAgentSettings(settings);
  const allowed = allowedToolNames ? new Set(allowedToolNames) : null;
  return AGENT_TOOLS.filter((t) => {
    const category = TOOL_CATEGORIES[t.name];
    if (category && !s.toolsEnabled[category]) return false;
    if (allowed && !allowed.has(t.name)) return false;
    return true;
  });
}
