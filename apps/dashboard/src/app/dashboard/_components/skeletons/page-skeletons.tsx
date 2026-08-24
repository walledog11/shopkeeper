import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { InboxStreamLoading } from "@/app/dashboard/(shell)/tickets/_components/stream/InboxStreamLoading"
import { needsYouCardShellClassName } from "@/app/dashboard/_components/home/needs-you-card-styles"
import { MemoryLibrarySkeleton } from "./MemoryLibrarySkeleton"
import { Pulse } from "./Pulse"
import { AccountSettingsSkeleton } from "./AccountSettingsSkeleton"
import { dashboardChromeColumnClassName, dashboardChromeMaxWidthClass, dashboardPageShellClassName, desktopTopBarScrollClearanceClass } from "@/app/dashboard/_components/sidebar/sidebar-helpers"
import { SearchFilterBarSkeleton } from "@/components/ui/search-filter-bar"
import { cn } from "@/lib/ui/cn"

function PageShell({
  children,
  className = "h-full flex flex-col overflow-hidden bg-background",
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={className}>{children}</div>
}

export function HomePageSkeleton() {
  return (
    <PageShell className="@container h-full flex flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className={cn(
          "flex flex-col min-h-full w-full mx-auto px-5 md:px-6 lg:px-8 pt-2 pb-4 gap-3",
          desktopTopBarScrollClearanceClass,
          dashboardChromeMaxWidthClass,
        )}>
          <Pulse className="h-11 w-full rounded-md border border-foreground/[0.07] bg-foreground/[0.02]" />

          <Card className={needsYouCardShellClassName("briefing")} aria-busy="true" aria-label="Loading home briefing">
              <div className="px-5 py-3 sm:px-6 sm:py-4">
                <Pulse className="h-7 w-[72%] max-w-md rounded-lg sm:h-8" />
                <div className="mt-3 max-w-2xl space-y-2">
                  <Pulse className="h-4 w-full rounded-full" />
                  <Pulse className="h-4 w-[62%] rounded-full" />
                </div>
              </div>
              <div className="flex gap-2 rounded-b-3xl border-t border-border/50 bg-muted/30 px-5 py-3 sm:px-6 sm:py-4">
                <Pulse className="h-12 min-w-0 flex-1 rounded-2xl" />
                <Pulse className="h-12 min-w-0 flex-1 rounded-2xl" />
              </div>
            </Card>

            <section className="mt-5 sm:mt-10 flex flex-col gap-2.5" aria-busy="true" aria-label="Loading action plan cards">
              <Card className={needsYouCardShellClassName("front")}>
                <div className="rounded-t-3xl border-b border-border/60 bg-card px-5 py-3.5 sm:px-6">
                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex w-full items-center gap-2">
                      <Skeleton className="h-10 w-10 shrink-0 rounded-2xl bg-foreground/[0.06]" />
                      <Skeleton className="h-10 min-w-0 flex-1 rounded-2xl bg-foreground/[0.06]" />
                    </div>
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                      <Skeleton className="h-10 min-w-0 flex-1 rounded-2xl bg-foreground/[0.06] sm:w-14 sm:flex-none" />
                      <Skeleton className="h-10 w-16 shrink-0 rounded-2xl bg-foreground/[0.06]" />
                    </div>
                  </div>
                </div>
                <div className="space-y-4 bg-card px-5 py-4 sm:px-6">
                  <Skeleton className="h-20 w-[85%] rounded-[18px_18px_18px_0] bg-foreground/[0.06]" />
                  <Skeleton className="ml-auto h-24 w-[85%] rounded-[18px_18px_0_18px] bg-foreground/[0.05]" />
                </div>
                <div className="space-y-2 rounded-b-3xl border-t border-border/50 bg-muted/30 px-5 py-4 sm:px-6">
                  <Skeleton className="h-12 w-full rounded-2xl bg-foreground/[0.08]" />
                  <Skeleton className="h-12 w-full rounded-2xl bg-foreground/[0.05]" />
                </div>
              </Card>
            </section>
        </div>
      </div>
    </PageShell>
  )
}

export function TicketsPageSkeleton() {
  return (
    <PageShell>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className={cn(
          "flex flex-col min-h-full w-full mx-auto px-5 md:px-6 lg:px-8 pt-3 pb-4 gap-3 md:pt-16",
          dashboardChromeMaxWidthClass,
        )}>
          <SearchFilterBarSkeleton pills={1} />
          <InboxStreamLoading />
        </div>
      </div>
    </PageShell>
  )
}

export function OrdersPageSkeleton() {
  return (
    <PageShell>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className={cn(
          "flex min-h-full w-full flex-col gap-3 px-5 pb-4 pt-3 md:px-6 lg:px-8 md:pt-16 mx-auto",
          dashboardChromeMaxWidthClass,
        )}>
          <SearchFilterBarSkeleton />
          <InboxStreamLoading />
        </div>
      </div>
    </PageShell>
  )
}

export function KbPageSkeleton() {
  return (
    <PageShell>
      <div className={cn(dashboardChromeColumnClassName(), "flex min-h-0 flex-1 flex-col")}>
        <div className={cn("relative z-20 shrink-0 pb-3 pt-3", desktopTopBarScrollClearanceClass)}>
          <SearchFilterBarSkeleton trailing />
        </div>
        <div className="custom-scrollbar flex-1 overflow-y-auto">
          <div className="py-6 pb-16">
            <MemoryLibrarySkeleton />
          </div>
        </div>
      </div>
    </PageShell>
  )
}

const INTEGRATION_SECTION_KEYS = ["integrations-section-1", "integrations-section-2"]

export function IntegrationsPageSkeleton() {
  return (
    <PageShell>
      <div className="flex-1 overflow-y-auto">
        <div className={cn(dashboardChromeColumnClassName(), "space-y-6 py-6 md:pt-16")}>
          <div className="grid gap-8 lg:grid-cols-2 items-start">
            {INTEGRATION_SECTION_KEYS.map(sectionKey => (
              <section key={sectionKey} className="space-y-4" aria-hidden>
                <div className="space-y-2">
                  <Pulse className="h-4 w-32 rounded-md" />
                  <Pulse className="h-3 w-full max-w-sm rounded-md bg-foreground/[0.05]" />
                </div>
                <div className="grid items-stretch auto-rows-fr grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4">
                  {["card-a", "card-b", "card-c", "card-d"].map(cardKey => (
                    <div key={`${sectionKey}-${cardKey}`} className="flex h-full flex-col gap-4 rounded-2xl border border-white/70 bg-white/65 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.86),0_1px_2px_rgba(43,33,24,0.05),0_10px_28px_-10px_rgba(43,33,24,0.16),0_24px_56px_-18px_rgba(43,33,24,0.18)] backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-white/40">
                      <div className="flex items-center gap-3">
                        <Pulse className="size-8 rounded-lg shrink-0" />
                        <Pulse className="h-5 w-28" />
                      </div>
                      <div className="space-y-2">
                        <Pulse className="h-3 w-full bg-foreground/[0.05]" />
                        <Pulse className="h-3 w-4/5 bg-foreground/[0.05]" />
                      </div>
                      <Pulse className="h-10 w-full rounded-[10px]" />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  )
}

export function ReviewPageSkeleton() {
  return (
    <PageShell>
      <div className="custom-scrollbar flex-1 overflow-y-auto px-4 pb-6 sm:px-6 md:pt-16">
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex flex-wrap gap-2.5 py-4">
            {[0, 1, 2, 3].map(index => (
              <Pulse key={`review-filter-${index}`} className="h-10 w-24 rounded-full bg-white" />
            ))}
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
            {[0, 1, 2, 3].map(index => (
              <Skeleton key={`review-row-${index}`} className="h-16 rounded-xl bg-foreground/[0.06]" />
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  )
}

export function AccountPageSkeleton() {
  return (
    <PageShell>
      <div className="flex-1 overflow-y-auto">
        <div className={cn(dashboardPageShellClassName(), "gap-6 pb-20")}>
          <AccountSettingsSkeleton />
        </div>
      </div>
    </PageShell>
  )
}

const SETTINGS_SECTION_KEYS = ["settings-billing", "settings-workspace"]

export function SettingsPageSkeleton() {
  return (
    <PageShell>
      <div className="flex-1 overflow-y-auto">
        <div className={cn(dashboardPageShellClassName(), "gap-6 pb-20")}>
          {SETTINGS_SECTION_KEYS.map(key => (
            <div key={key} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-[180px_1fr] sm:gap-8 sm:p-6">
                <div className="space-y-2">
                  <Pulse className="h-4 w-24 rounded-md" />
                  <Pulse className="h-3 w-full rounded-md bg-foreground/[0.05]" />
                </div>
                <div className="space-y-3">
                  <Pulse className="h-10 w-full rounded-lg" />
                  <Pulse className="h-10 w-full rounded-lg" />
                  <Pulse className="h-24 w-full rounded-lg bg-foreground/[0.05]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  )
}

const AGENT_SECTION_KEYS = ["agent-identity", "agent-autonomy", "agent-duty", "agent-advanced"]

export function AgentConfigurePageSkeleton() {
  return (
    <PageShell>
      <div className="custom-scrollbar flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:pt-16">
        <div className="mx-auto w-full max-w-3xl space-y-6 pb-20">
          <div>
            <Pulse className="h-6 w-36 rounded-md" />
            <Pulse className="mt-2 h-4 w-full max-w-lg rounded-md bg-foreground/[0.05]" />
          </div>
          {AGENT_SECTION_KEYS.map(key => (
            <div key={key} className="overflow-hidden rounded-xl border border-border bg-card p-5 sm:p-6 space-y-4">
              <Pulse className="h-4 w-32 rounded-md" />
              <Pulse className="h-10 w-full rounded-lg" />
              <Pulse className="h-10 w-full rounded-lg" />
              <Pulse className="h-20 w-full rounded-lg bg-foreground/[0.05]" />
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  )
}

const TEAM_MEMBER_ROW_KEYS = ["member-skeleton-1", "member-skeleton-2", "member-skeleton-3"]

export function TeamPageSkeleton() {
  return (
    <PageShell className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-5 pb-10 md:px-8 md:pt-16" aria-busy="true" aria-label="Loading team">
        <div className="flex items-center justify-end">
          <Pulse className="h-9 w-32 rounded-md" />
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3.5">
            <Pulse className="h-4 w-20 rounded-md" />
          </div>
          <div className="divide-y divide-border">
            {TEAM_MEMBER_ROW_KEYS.map(key => (
              <div key={key} className="flex items-center gap-3 px-5 py-3.5">
                <Pulse className="size-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Pulse className="h-3.5 w-40 rounded-md" />
                  <Pulse className="h-3 w-56 max-w-full rounded-md bg-foreground/[0.04]" />
                </div>
                <Pulse className="h-5 w-16 shrink-0 rounded-md bg-foreground/[0.05]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  )
}
