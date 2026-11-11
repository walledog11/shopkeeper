import { settingsSectionMetadata } from "@/app/dashboard/_components/nav-items"
import AgentSettingsForm from "../_components/agent/AgentSettingsForm"
import { loadAgentSettingsForm } from "../_components/agent/load-agent-settings"

export const metadata = settingsSectionMetadata("general")

export default async function GeneralSettingsPage() {
  return <AgentSettingsForm {...await loadAgentSettingsForm("general")} />
}
