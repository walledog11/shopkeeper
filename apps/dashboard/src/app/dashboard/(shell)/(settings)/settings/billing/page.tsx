import BillingTab from "../_components/BillingTab"
import AgentSettingsForm from "../_components/agent/AgentSettingsForm"
import { loadAgentSettingsForm } from "../_components/agent/load-agent-settings"

export default async function UsageAndBillingSettingsPage() {
  return (
    <>
      <BillingTab />
      <AgentSettingsForm {...await loadAgentSettingsForm("usage")} />
    </>
  )
}
