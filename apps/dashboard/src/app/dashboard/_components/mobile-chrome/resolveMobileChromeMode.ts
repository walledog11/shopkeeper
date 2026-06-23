import type { MobileChromeMode } from "./types";

export function resolveMobileChromeMode(pathname: string): MobileChromeMode {
  if (pathname === "/dashboard/tickets" || pathname.startsWith("/dashboard/tickets/")) {
    return "local";
  }
  return "standard";
}
