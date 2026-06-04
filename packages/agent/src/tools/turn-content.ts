export const AGENT_TURN_PREFIX = "__clerk_agent__";

export function isAgentTurnContent(contentText: string | null | undefined): boolean {
  return !!contentText?.startsWith(AGENT_TURN_PREFIX);
}
