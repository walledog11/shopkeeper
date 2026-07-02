import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

// Handwritten display headline in Caveat (loaded via --m-caveat), matching the
// marketing landing page. The step's identity lives here — not in the chrome.
export function Headline({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={cn(
      "text-center text-[38px] font-black leading-[1.05] tracking-[-0.01em] text-foreground [font-family:var(--m-caveat)] md:text-[52px]",
      className,
    )}>
      {children}
    </h1>
  );
}

// The muted second clause of a two-tone Poke headline — warm gray, same hand.
export function Accent({ children }: { children: ReactNode }) {
  return <span className="block font-black text-[#9c9285] [font-family:var(--m-caveat)]">{children}</span>;
}

export function Lede({ children }: { children: ReactNode }) {
  return <p className="mx-auto mt-3 max-w-[520px] text-pretty text-center text-[15px] leading-relaxed text-foreground/60">{children}</p>;
}

export function Field({ label, hint, required, children }: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-center gap-2">
        <span className="text-[13px] font-semibold text-foreground">{label}</span>
        {required && <span className="text-[10px] font-medium uppercase tracking-wider text-foreground/40">Required</span>}
      </div>
      {children}
      {hint && <div className="mt-1.5 text-[12.5px] leading-snug text-foreground/50">{hint}</div>}
    </div>
  );
}
