import AccountSettingsSection from "../settings/_components/AccountSettingsSection"
import { dashboardPageShellClassName } from "@/app/dashboard/_components/sidebar/sidebar-helpers"
import { cn } from "@/lib/ui/cn"

export default function AccountPage() {
  return (
    <div className="flex size-full min-w-0 flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className={cn(dashboardPageShellClassName(), "gap-6 pb-20")}>
          <AccountSettingsSection />
        </div>
      </div>
    </div>
  )
}
