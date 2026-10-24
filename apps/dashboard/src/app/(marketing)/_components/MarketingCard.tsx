import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

/** Surface card used across home sections and product detail blocks. */
export function MarketingCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("m-card p-5 sm:p-6", className)}>{children}</div>;
}
