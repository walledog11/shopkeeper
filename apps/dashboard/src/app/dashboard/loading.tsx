import { Loader2, Store } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <main
      className="dashboard-shell flex h-dvh w-full flex-col overflow-hidden bg-background font-sans text-foreground"
      aria-busy="true"
      aria-label="Opening your dashboard"
    >
      <header className="flex h-16 shrink-0 items-center gap-6 border-b border-border bg-sidebar px-5">
        <Store aria-hidden className="size-6 shrink-0 text-sidebar-foreground/70" strokeWidth={1.75} />
        <Skeleton className="hidden h-8 w-80 bg-sidebar-accent md:block" />
        <Skeleton className="ml-auto size-8 rounded-full bg-sidebar-accent" />
      </header>

      <div className="relative flex flex-1 flex-col gap-6 overflow-hidden p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="min-h-48 flex-1 rounded-xl" />

        <div
          className="absolute inset-0 flex items-center justify-center bg-background/55 backdrop-blur-[2px]"
          role="status"
        >
          <div className="flex items-center gap-3 rounded-full border border-border bg-card px-5 py-3 shadow-sm">
            <Loader2 aria-hidden className="size-4 animate-spin text-foreground/55" />
            <span className="text-sm font-medium text-foreground/70">Opening your dashboard…</span>
          </div>
        </div>
      </div>
    </main>
  );
}
