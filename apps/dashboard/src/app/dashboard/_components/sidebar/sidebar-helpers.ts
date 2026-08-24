import { cn } from "@/lib/ui/cn";
import { GLASS_PILL_SURFACE } from "@/lib/ui/glass-card-styles";

export function isRouteActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

export const topBarGlassHoverClass = "hover:bg-foreground/[0.04]";

export function topBarNavTriggerClass(active: boolean) {
  return cn(
    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm transition-colors shrink-0 whitespace-nowrap outline-none",
    active
      ? "text-sidebar-foreground font-medium"
      : cn("text-sidebar-foreground/70 hover:text-sidebar-foreground", topBarGlassHoverClass),
  );
}

export const topBarDropdownPanelClass = cn(
  "w-72 rounded-2xl p-2 text-popover-foreground",
  GLASS_PILL_SURFACE,
);

export const topBarDropdownItemClass =
  "cursor-pointer rounded-xl p-0 focus:bg-transparent data-[highlighted]:bg-accent";

export const desktopTopBarPillClass = cn(
  "flex w-fit max-w-full items-center h-12 rounded-xl",
  GLASS_PILL_SURFACE,
);

/** Icon-only controls inside desktop or mobile top-bar pills. */
export const topBarIconButtonClass = cn(
  "inline-flex size-9 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors outline-none hover:text-sidebar-foreground",
  topBarGlassHoverClass,
);

/** Shared width for desktop chrome so the top bar and main column feel like one layout. */
export const dashboardChromeMaxWidthClass = "max-w-6xl";

/** Centered column that lines up with the desktop top bar. */
export function dashboardChromeColumnClassName(className?: string) {
  return cn(
    "mx-auto w-full px-5 md:px-6 lg:px-8",
    dashboardChromeMaxWidthClass,
    className,
  );
}

/** Centered page column — matches desktop top bar width and padding. */
export function dashboardPageShellClassName(className?: string) {
  return cn(
    dashboardChromeColumnClassName("flex flex-col min-h-full pt-3 pb-4 gap-3 md:pt-0"),
    className,
  );
}

/** Slightly quieter chrome for search / workspace / account so the nav pill reads first. */
export const desktopTopBarUtilityPillClass = cn(
  "flex w-fit max-w-full items-center h-12 rounded-xl",
  GLASS_PILL_SURFACE,
);

export const desktopTopBarDropdownPanelClass = cn(
  "w-56 rounded-xl p-2 text-sidebar-foreground",
  GLASS_PILL_SURFACE,
);

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

export const reviewCountBadgeClass =
  "min-w-[22px] h-[22px] px-1 rounded-md text-[11px] font-bold flex items-center justify-center bg-amber-600 text-background tabular-nums leading-none";

export function dispatchNavProgressStart() {
  window.dispatchEvent(new Event("nav-progress-start"));
}
