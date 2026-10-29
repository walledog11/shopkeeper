import AgentSettingsForm from "../_components/agent/AgentSettingsForm"
import { loadAgentSettingsForm } from "../_components/agent/load-agent-settings"

export default async function GeneralSettingsPage() {
  return <AgentSettingsForm {...await loadAgentSettingsForm("general")} />
}
