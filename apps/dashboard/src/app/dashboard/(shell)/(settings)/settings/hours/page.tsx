import AgentSettingsForm from "../_components/agent/AgentSettingsForm"
import { loadAgentSettingsForm } from "../_components/agent/load-agent-settings"

export default async function HoursSettingsPage() {
  return <AgentSettingsForm {...await loadAgentSettingsForm("hours")} />
}
