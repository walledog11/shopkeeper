import { Input } from "@/components/ui/input";
import { BigTitle, Field, Kicker, Lede } from "./primitives";
import type { OnboardingData } from "./model";

export function StepStore({ data, update }: { data: OnboardingData; update: (p: Partial<OnboardingData>) => void }) {
  return (
    <div>
      <Kicker step={2} label="WHERE I'LL WORK" />
      <BigTitle>First, tell me where I&apos;ll be working.</BigTitle>
      <Lede>I&apos;ll use this for replies, greetings, and customer-facing language. You can edit any of it later.</Lede>

      <div className="mt-7 grid grid-cols-1 gap-7 md:grid-cols-2">
        <div className="flex flex-col gap-[18px]">
          <Field label="Store name" required>
            <Input
              value={data.storeName}
              onChange={e => update({ storeName: e.target.value })}
              placeholder="Oat Milk Co."
              className="h-11 border-white/10 bg-white/[0.04] text-[15px] text-white placeholder:text-white/30 focus-visible:border-green-400/40 focus-visible:ring-green-400/30"
            />
          </Field>
          <Field label="What you sell" hint='One sentence. I&apos;ll use this when customers ask "what do you do?"'>
            <Input
              value={data.sells}
              onChange={e => update({ sells: e.target.value })}
              placeholder="Heavyweight cotton hoodies, ceramic mugs, soy candles."
              className="h-11 border-white/10 bg-white/[0.04] text-[15px] text-white placeholder:text-white/30 focus-visible:border-green-400/40 focus-visible:ring-green-400/30"
            />
          </Field>
          <Field label="Your name" required hint="So I can sign off with you.">
            <Input
              value={data.founderName}
              onChange={e => update({ founderName: e.target.value })}
              placeholder="Willa"
              className="h-11 border-white/10 bg-white/[0.04] text-[15px] text-white placeholder:text-white/30 focus-visible:border-green-400/40 focus-visible:ring-green-400/30"
            />
          </Field>
        </div>

        <div className="sticky top-6 self-start rounded-2xl border border-white/10 bg-white/[0.04] px-5 pb-5 pt-5">
          <div className="mb-3.5 font-mono text-xs font-bold uppercase tracking-wider text-white/45">
            HOW CUSTOMERS WILL SEE ME
          </div>

          <div className="rounded-lg border border-white/[0.07] bg-black/30 px-3.5 py-3 font-serif text-[13px] leading-relaxed text-white">
            <div className="mb-2.5 border-b border-dashed border-white/[0.07] pb-1.5 font-mono text-xs text-white/45">
              From: <b className="text-white">{data.founderName || "Willa"} at {data.storeName || "Oat Milk Co."}</b>
              <span className="float-right">Re: order #10482</span>
            </div>
            Hi Maya , so sorry the hoodie didn&apos;t fit. That&apos;s a quick fix: I&apos;ve created a free exchange and emailed you a return label.
            <span className="ml-0.5 inline-block h-3.5 w-[1.5px] translate-y-[2px] bg-white animate-[ob-blink_1s_steps(2)_infinite]" />
            <div className="mt-3 text-white/70">, {data.founderName || "Willa"} &amp; the {data.storeName || "Oat Milk Co."} team</div>
          </div>

          <div className="mt-3.5 border-t border-dashed border-white/[0.07] pt-3 text-[11.5px] leading-snug text-white/45">
            Updates as you type. I&apos;ll match your tone over time , you can dial warmth, formality, and length in Settings.
          </div>
        </div>
      </div>
    </div>
  );
}
