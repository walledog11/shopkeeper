"use client";

import Link from "next/link";
import { Store } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { dispatchNavProgressStart } from "./sidebar-helpers";

export function Logo({ iconOnly = false }: { iconOnly?: boolean }) {
  return (
    <Link
      href="/dashboard"
      aria-label="Shopkeeper"
      className={cn(
        "flex items-center shrink-0 text-[#2b2118] transition-colors hover:text-[#2b2118]/75",
        iconOnly ? "justify-center p-1" : "gap-2",
      )}
      onClick={() => {
        const pathname = window.location.pathname;
        if (pathname !== "/dashboard") dispatchNavProgressStart();
      }}
    >
      <Store className="size-6" strokeWidth={1.75} />
      {!iconOnly && <span className="font-display-serif text-xl leading-none">shopkeeper</span>}
    </Link>
  );
}
