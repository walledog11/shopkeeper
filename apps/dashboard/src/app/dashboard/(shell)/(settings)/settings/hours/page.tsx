import { settingsSectionMetadata } from "@/app/dashboard/_components/nav-items"
import AgentSettingsForm from "../_components/agent/AgentSettingsForm"
import { loadAgentSettingsForm } from "../_components/agent/load-agent-settings"

export const metadata = settingsSectionMetadata("hours")

export default async function HoursSettingsPage() {
  return <AgentSettingsForm {...await loadAgentSettingsForm("hours")} />
}
