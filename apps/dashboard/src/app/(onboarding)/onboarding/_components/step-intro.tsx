import { Sparkles } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { Kicker } from "./primitives";

export function StepIntro() {
  return (
    <div className="pt-4">
      <Kicker step={1} label="MEET ME" />

      <div className="mb-2 mt-3 flex items-center gap-4">
        <span className="relative inline-flex size-14 shrink-0 items-center justify-center rounded-2xl bg-green-400 text-[28px] font-bold text-green-950 shadow-[0_6px_20px_rgba(74,222,128,0.3)]">
          <Sparkles className="size-7" />
          <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-[3px] border-background bg-green-400" />
        </span>
        <div>
          <h1 className="m-0 text-[38px] font-semibold leading-[1.1] tracking-tight text-white">Hi, I&apos;m Concierge.</h1>
          <div className="mt-1.5 font-mono text-[13px] text-white/45">Your new hire on the support team.</div>
        </div>
      </div>

      <p className="m-0 mt-4 max-w-[620px] text-pretty text-[16px] leading-relaxed text-white/70">
        I&apos;ll handle your customer support , refunds, exchanges, where-is-my-order, product questions, the rest.
        Spend <b className="text-white">four minutes</b> briefing me and I can start working tonight.
      </p>

      <div className="mt-7 grid grid-cols-1 gap-3 md:grid-cols-3">
        <IntroCol kicker="WHAT I DO WELL" tone="ok" mark="check" items={[
          "Answer shipping & WISMO instantly",
          "Pull tracking from Shopify",
          "Process exchanges with prepaid labels",
          "Refund within the limits you set",
        ]}/>
        <IntroCol kicker="WHAT I WON'T DO" tone="muted" mark="cross" items={[
          "Spend over your refund cap",
          "Make policy on the fly",
          "Talk to angry customers without you",
          "Pretend I'm human if asked",
        ]}/>
        <IntroCol kicker="WHEN I'LL TAP YOU" tone="warn" mark="flag" items={[
          "Anything mentioning press or legal",
          "Refunds above your cap",
          "Bulk inquiries > 20 units",
          "Confidence below 60%",
        ]}/>
      </div>

      <div className="mt-8 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5">
        <div className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-green-400/15 text-[16px] font-bold text-green-400">◔</div>
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-white">You stay in charge. Always.</div>
          <div className="mt-0.5 text-[12px] leading-snug text-white/70">
            Every Concierge reply is auditable. Every limit is yours to change. You can pause me with one click.
          </div>
        </div>
      </div>
    </div>
  );
}

function IntroCol({ kicker, items, tone, mark }: {
  kicker: string;
  items: string[];
  tone: "ok" | "muted" | "warn";
  mark: "check" | "cross" | "flag";
}) {
  const toneText = tone === "ok" ? "text-green-400" : tone === "warn" ? "text-amber-300" : "text-white/55";
  const toneBg   = tone === "ok" ? "bg-green-400/15" : tone === "warn" ? "bg-amber-300/15" : "bg-white/[0.06]";
  const glyph    = mark === "cross" ? "✕" : mark === "flag" ? "↗" : "✓";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5">
      <div className={cn("mb-2.5 font-mono text-xs font-bold uppercase tracking-wider", toneText)}>{kicker}</div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map(item => (
          <li key={item} className="flex items-start gap-2 text-[12.5px] leading-snug text-white/70">
            <span className={cn("mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded text-xs font-bold", toneBg, toneText)}>
              {glyph}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
