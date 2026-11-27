import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { settingsSectionMetadata, settingsSections } from "@/app/dashboard/_components/nav-items"
import BillingTab from "../_components/BillingTab"
import AgentSettingsForm from "../_components/agent/AgentSettingsForm"
import { loadAgentSettingsForm } from "../_components/agent/load-agent-settings"

export const metadata = settingsSectionMetadata("billing")

const ACCOUNT_PAGES = settingsSections.find((section) => section.id === "billing")?.pages ?? []

export default async function AccountAndBillingSettingsPage() {
  return (
    <>
      <AgentSettingsForm {...await loadAgentSettingsForm("billing")} />
      <BillingTab />
      <nav aria-label="More account settings" className="flex flex-col overflow-hidden rounded-xl border border-foreground/[0.08]">
        {ACCOUNT_PAGES.map((page) => (
          <Link
            key={page.href}
            href={page.href}
            className="flex items-center justify-between border-b border-foreground/[0.06] px-4 py-3 text-sm font-medium text-strong last:border-b-0 hover:bg-foreground/[0.03]"
          >
            {page.label}
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </nav>
    </>
  )
}
