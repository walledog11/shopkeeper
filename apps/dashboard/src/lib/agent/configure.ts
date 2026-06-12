export const AGENT_CONFIGURE_PATH = "/dashboard/agent/configure";

export function agentConfigureHref(hash?: string): string {
  return hash ? `${AGENT_CONFIGURE_PATH}#${hash}` : AGENT_CONFIGURE_PATH;
}
