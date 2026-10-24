"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { useMarketingInViewOnce } from "./useMarketingInView";

/** Fades content up into place the first time it scrolls into view. */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, inView: shown, armed } = useMarketingInViewOnce<HTMLDivElement>({
    threshold: 0.12,
    rootMargin: "0px 0px -10% 0px",
    checkInitialViewport: true,
  });

  return (
    <div
      ref={ref}
      className={cn(
        shown
          ? "animate-[m-rise_0.7s_ease-out_both] motion-reduce:animate-none"
          : armed
            ? "opacity-0"
            : "",
        className,
      )}
      style={shown && delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
