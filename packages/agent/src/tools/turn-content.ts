export const AGENT_TURN_PREFIX = "__shopkeeper_agent__";

export function isAgentTurnContent(contentText: string | null | undefined): boolean {
  if (!contentText) return false;
  return contentText.startsWith(AGENT_TURN_PREFIX);
}

export function getAgentTurnPrefixLength(contentText: string): number | null {
  return contentText.startsWith(AGENT_TURN_PREFIX) ? AGENT_TURN_PREFIX.length : null;
}
