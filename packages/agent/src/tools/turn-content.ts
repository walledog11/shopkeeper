export const LEGACY_AGENT_TURN_PREFIX = "__clerk_agent__";
export const AGENT_TURN_PREFIX = "__shopkeeper_agent__";

const AGENT_TURN_PREFIXES = [AGENT_TURN_PREFIX, LEGACY_AGENT_TURN_PREFIX] as const;

export function isAgentTurnContent(contentText: string | null | undefined): boolean {
  if (!contentText) return false;
  return AGENT_TURN_PREFIXES.some((prefix) => contentText.startsWith(prefix));
}

export function getAgentTurnPrefixLength(contentText: string): number | null {
  for (const prefix of AGENT_TURN_PREFIXES) {
    if (contentText.startsWith(prefix)) {
      return prefix.length;
    }
  }
  return null;
}
