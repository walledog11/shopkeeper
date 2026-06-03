"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { cn } from "@/lib/ui/cn";
import { footerNavItems } from "../nav-items";
import { isRouteActive } from "./sidebar-helpers";

export function FooterLinks({
  pathname,
  onNavigate,
  variant,
}: {
  pathname: string;
  onNavigate: (e: MouseEvent<HTMLAnchorElement>, isActive: boolean) => void;
  variant: "desktop" | "mobile";
}) {
  const isMobile = variant === "mobile";

  return (
    <>
      {footerNavItems.map((item) => {
        const isActive = isRouteActive(pathname, item.href);

        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={(e) => onNavigate(e, isActive)}
            title={item.name}
            aria-label={item.name}
            className={cn(
              "rounded-md transition-colors shrink-0",
              isMobile ? "p-2.5 rounded-lg" : "p-1.5",
              isActive
                ? isMobile
                  ? "text-white bg-white/[0.15]"
                  : "text-white bg-white/[0.08]"
                : "text-white/30 hover:text-white/70 hover:bg-white/[0.05]",
            )}
          >
            <item.icon className={isMobile ? "size-[18px]" : "size-[15px]"} />
          </Link>
        );
      })}
    </>
  );
}
