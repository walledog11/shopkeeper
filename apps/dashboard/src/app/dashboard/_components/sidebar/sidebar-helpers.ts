import { cn } from "@/lib/ui/cn";

export function isRouteActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

export function topBarNavTriggerClass(active: boolean) {
  return cn(
    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm transition-colors shrink-0 whitespace-nowrap outline-none",
    active
      ? "text-sidebar-foreground bg-sidebar-accent font-medium"
      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/80",
  );
}

export const topBarDropdownPanelClass =
  "w-72 rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-[0_12px_40px_rgba(43,33,24,0.12)]";

export const topBarDropdownItemClass =
  "cursor-pointer rounded-xl p-0 focus:bg-transparent data-[highlighted]:bg-accent";

export const desktopTopBarPillClass =
  "flex w-fit max-w-full items-center h-12 rounded-xl border border-border/80 bg-sidebar/95 shadow-[0_8px_24px_-6px_rgba(43,33,24,0.14),0_2px_8px_-2px_rgba(43,33,24,0.08)] backdrop-blur-md supports-[backdrop-filter]:bg-sidebar/85";

/** Icon-only controls inside desktop or mobile top-bar pills. */
export const topBarIconButtonClass =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors outline-none hover:bg-sidebar-accent/80 hover:text-sidebar-foreground";

/** Shared width for desktop chrome so the top bar and main column feel like one layout. */
export const dashboardChromeMaxWidthClass = "max-w-6xl";

/** Centered page column — matches desktop top bar width and padding. */
export function dashboardPageShellClassName(className?: string) {
  return cn(
    "flex flex-col min-h-full w-full mx-auto px-5 md:px-6 lg:px-8 pt-3 pb-4 gap-3",
    dashboardChromeMaxWidthClass,
    className,
  );
}

/** Archive/search lists stay a touch narrower than the queue for scanability. */
export const inboxArchiveContentClassName = "mx-auto w-full max-w-4xl";

/** Slightly quieter chrome for search / workspace / account so the nav pill reads first. */
export const desktopTopBarUtilityPillClass =
  "flex w-fit max-w-full items-center h-12 rounded-xl border border-border/70 bg-sidebar/90 shadow-[0_4px_16px_-4px_rgba(43,33,24,0.10)] backdrop-blur-md supports-[backdrop-filter]:bg-sidebar/80";

export const desktopTopBarDropdownPanelClass =
  "w-56 rounded-xl border border-border/80 bg-sidebar/95 p-2 text-sidebar-foreground shadow-[0_8px_24px_-6px_rgba(43,33,24,0.14),0_2px_8px_-2px_rgba(43,33,24,0.08)] backdrop-blur-md supports-[backdrop-filter]:bg-sidebar/85";

export const desktopTopBarDropdownItemClass =
  "flex items-center gap-2 rounded-md px-2.5 py-2 text-sm cursor-pointer outline-none transition-colors hover:bg-sidebar-accent/80 focus:bg-sidebar-accent/80 data-[highlighted]:bg-sidebar-accent/80";

export const desktopTopBarDropdownItemActiveClass =
  "bg-sidebar-accent font-medium text-sidebar-foreground";

export function desktopTopBarDropdownMenuItemClass(active = false) {
  return cn(desktopTopBarDropdownItemClass, active && desktopTopBarDropdownItemActiveClass);
}

export function navPillDropdownPanelClass(isTopBar: boolean) {
  return cn(
    desktopTopBarDropdownPanelClass,
    !isTopBar && "bg-popover text-popover-foreground border-border shadow-md backdrop-blur-none",
  );
}

export function formatOpenCount(openCount: number) {
  return openCount > 9 ? "9+" : openCount;
}

export function mobileNavLinkClass(active: boolean) {
  return cn(
    "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors outline-none",
    active
      ? "bg-sidebar-accent font-medium text-sidebar-foreground"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground",
  );
}

export const mobileNavGroupCardClass =
  "overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)] divide-y divide-border";

export const inboxOpenCountBadgeClass =
  "min-w-[22px] h-[22px] px-1 rounded-md text-[11px] font-bold flex items-center justify-center bg-green-600 text-background tabular-nums leading-none";

export const reviewCountBadgeClass =
  "min-w-[22px] h-[22px] px-1 rounded-md text-[11px] font-bold flex items-center justify-center bg-amber-600 text-background tabular-nums leading-none";

export function dispatchNavProgressStart() {
  window.dispatchEvent(new Event("nav-progress-start"));
}
