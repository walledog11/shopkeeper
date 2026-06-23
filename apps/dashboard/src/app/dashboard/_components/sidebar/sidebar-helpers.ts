import { cn } from "@/lib/ui/cn";

export function isRouteActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

export function topBarNavTriggerClass(active: boolean) {
  return cn(
    "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm transition-colors shrink-0 whitespace-nowrap outline-none",
    active
      ? "text-sidebar-foreground bg-sidebar-accent font-medium"
      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/80",
  );
}

export const topBarDropdownPanelClass =
  "w-72 rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-[0_12px_40px_rgba(43,33,24,0.12)]";

export const topBarDropdownItemClass =
  "cursor-pointer rounded-xl p-0 focus:bg-transparent data-[highlighted]:bg-accent";

export function formatOpenCount(openCount: number) {
  return openCount > 9 ? "9+" : openCount;
}

export function dispatchNavProgressStart() {
  window.dispatchEvent(new Event("nav-progress-start"));
}
