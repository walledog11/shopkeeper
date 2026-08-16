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

export function dispatchNavProgressStart() {
  window.dispatchEvent(new Event("nav-progress-start"));
}
