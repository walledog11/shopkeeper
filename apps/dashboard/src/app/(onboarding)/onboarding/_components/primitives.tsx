import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

// Display headline in the marketing site's serif, set the way its headings are
// (a light weight, tight tracking). The step's identity lives here — not in the chrome.
export function Headline({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1 tabIndex={-1} className={cn(
      "font-display-serif text-balance text-center text-[38px] font-[350] leading-[1.12] tracking-[-0.02em] text-foreground md:text-[52px]",
      className,
    )}>
      {children}
    </h1>
  );
}

// The muted second clause of a two-tone headline — warm gray, same face.
export function Accent({ children }: { children: ReactNode }) {
  return <span className="block text-[#9c9285]">{children}</span>;
}

export function Lede({ children }: { children: ReactNode }) {
  return <p className="mx-auto mt-3 max-w-[520px] text-pretty text-center text-[15px] leading-relaxed text-foreground/60">{children}</p>;
}
