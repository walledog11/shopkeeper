import { dashboardPageShellClassName } from "@/app/dashboard/_components/sidebar/sidebar-helpers"
import { cn } from "@/lib/ui/cn"
import { SettingsNav, SettingsPageTitle } from "./_components/SettingsNav"

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex size-full min-w-0 flex-col overflow-hidden bg-background">
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        <div className={cn(dashboardPageShellClassName(), "pb-20 md:flex-row md:items-start md:gap-8")}>
          <SettingsNav />
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <SettingsPageTitle />
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
