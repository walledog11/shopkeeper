import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kicker } from "./primitives";
import { AUTONOMY_TIERS, CHANNEL_META, type ChannelKey, type OnboardingData } from "./model";

export function StepPlan({ data, connected, onStart, onBack }: {
  data: OnboardingData; connected: Set<ChannelKey>; onStart: () => void; onBack: () => void;
}) {
  const storeName = data.storeName || "your store";
  const founder = data.founderName || "there";
  const tier = AUTONOMY_TIERS.find(t => t.id === data.autonomy) ?? AUTONOMY_TIERS[2];
  const channelNames = CHANNEL_META.flatMap(c => connected.has(c.key) ? [c.label] : []).join(", ");
  const hasShopify = connected.has("shopify");

  const planItems = [
    {
      time: "Tonight",
      title: `Start watching ${channelNames.toLowerCase() || "your inbox"}`,
      detail: `New tickets land in your inbox the moment a customer writes in.${hasShopify ? " I'll cross-reference every email against Shopify orders." : ""}`,
    },
    {
      time: "First hour",
      title: "Build memory from your past replies",
      detail: hasShopify
        ? "I'll skim the last 90 days of your customer threads, learn your voice, and build a draft knowledge base. You can edit it tomorrow in Memory."
        : "Once you connect Shopify, I'll skim past threads and build memory. Until then I'll ask before sending.",
    },
    {
      time: "Overnight",
      title: "Clear what I can, flag what I can't",
      detail: `I'll auto-resolve WISMO, exchanges, address changes, and refunds up to $${tier.cap}. Bulk inquiries, anything over $${tier.cap}, and press/legal mentions all wait for you.`,
    },
    {
      time: `Tomorrow ${greetingTime()}`,
      title: "Brief you with what happened",
      detail: `You'll wake up to a summary: how many I cleared, what's waiting, who needs ${founder} specifically. The same format you'll see every morning.`,
    },
  ];

  return (
    <div>
      <Kicker step={6} label="READY TO START" />

      <div className="relative mt-3.5 overflow-hidden rounded-[18px] border border-white/10 bg-gradient-to-b from-green-400/10 to-white/[0.04] px-8 pb-6 pt-7">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-14 size-72 rounded-full bg-[radial-gradient(circle,rgba(74,222,128,0.18)_0%,transparent_65%)]" />

        <div className="relative flex items-center gap-2">
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-green-400 text-green-950">
            <Sparkles className="size-3.5" />
          </span>
          <span className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-green-400">
            FIRST-NIGHT BRIEFING · WRITTEN BY ME
          </span>
          <span className="flex-1" />
          <span className="inline-flex items-center gap-1.5 font-mono text-xs text-white/45">
            <span className="inline-block size-1.5 rounded-full bg-green-400 animate-[ob-pulse-bg_2s_ease-in-out_infinite]" /> ready
          </span>
        </div>

        <h1 className="relative my-3 text-[32px] font-semibold leading-[1.15] tracking-tight text-white">
          Here&apos;s my plan, {founder}.
        </h1>

        <p className="relative m-0 max-w-[640px] text-pretty text-[15px] leading-relaxed text-white/70">
          When the next message lands at <b className="text-white">{storeName}</b>, I&apos;ll get to work.
          For tonight I&apos;m running at <SumPill>{tier.label}</SumPill> ,
          refunds capped at <SumPill>${tier.cap}</SumPill>,
          watching <SumPill>{channelNames || "your inbox"}</SumPill>.
          Here&apos;s what to expect.
        </p>

        <div className="relative mt-6 flex flex-col gap-3">
          {planItems.map((p, i) => <PlanRow key={p.title} idx={i} {...p} />)}
        </div>

        <div className="relative mt-6 flex flex-wrap items-center gap-2.5 border-t border-dashed border-white/[0.07] pt-4">
          <Button
            onClick={onStart}
            className="h-11 gap-2 rounded-md bg-green-400 px-5 text-[14px] font-semibold text-green-950 shadow-[0_4px_12px_rgba(74,222,128,0.4)] hover:bg-green-300"
          >
            Let me start working <ChevronRight className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onBack} className="text-white/70 hover:bg-white/[0.06] hover:text-white">
            <ChevronLeft className="mr-1 size-4" /> Change something
          </Button>
          <span className="flex-1" />
          <span className="font-mono text-[11.5px] text-white/45">you can pause me with one click in Settings</span>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-4">
        <div className="mb-2.5 font-mono text-[10.5px] font-bold uppercase tracking-wider text-white/45">
          WHAT&apos;S WAITING FOR YOU INSIDE
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Waiting k="Inbox"     v="0 tickets" hint="filling up as I watch" />
          <Waiting k="Memory"    v="0 articles" hint="builds from your replies" />
          <Waiting k="Playbooks" v="3 starters" hint="VIP, WISMO, returns" />
        </div>
      </div>
    </div>
  );
}

function PlanRow({ time, title, detail, idx }: { time: string; title: string; detail: string; idx: number }) {
  return (
    <div className="flex items-start gap-3.5 rounded-lg border border-white/[0.07] bg-white/[0.04] px-3.5 py-3">
      <div className="w-16 shrink-0 pt-0.5 font-mono text-xs font-bold uppercase tracking-wider text-green-400">{time}</div>
      <div className="mt-0.5 inline-flex size-[22px] shrink-0 items-center justify-center rounded-md bg-green-400/15 font-mono text-xs font-bold text-green-400">
        {idx + 1}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-white">{title}</div>
        <div className="mt-0.5 text-[12.5px] leading-snug text-white/70">{detail}</div>
      </div>
    </div>
  );
}

function Waiting({ k, v, hint }: { k: string; v: string; hint: string }) {
  return (
    <div>
      <div className="text-[11.5px] font-medium text-white/45">{k}</div>
      <div className="mt-0.5 text-[16px] font-semibold tracking-tight text-white">{v}</div>
      <div className="mt-0.5 font-mono text-[10.5px] text-white/45">{hint}</div>
    </div>
  );
}

function SumPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="mx-0.5 inline-flex items-baseline rounded-md border border-white/[0.07] bg-white/[0.04] px-1.5 py-px text-[14px] font-medium text-white">
      {children}
    </span>
  );
}

function greetingTime(): string {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
