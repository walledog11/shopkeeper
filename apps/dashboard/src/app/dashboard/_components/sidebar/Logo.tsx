"use client";

import Link from "next/link";
import { Store } from "lucide-react";
import { cn } from "@/lib/ui/cn";

export function Logo({
  iconOnly = false,
  inPill = false,
  onClick,
}: {
  iconOnly?: boolean;
  inPill?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href="/dashboard"
      aria-label="Shopkeeper"
      onClick={onClick}
      className={cn(
        "flex items-center shrink-0 text-foreground transition-colors hover:text-foreground/75",
        iconOnly
          ? cn("justify-center", inPill ? "p-0" : "p-1 mr-2")
          : "gap-2",
      )}
    >
      <Store className="size-6" strokeWidth={1.75} />
      {!iconOnly && <span className="font-display-serif text-xl leading-none">shopkeeper</span>}
    </Link>
  );
}
