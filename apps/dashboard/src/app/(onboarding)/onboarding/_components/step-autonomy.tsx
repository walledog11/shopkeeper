import { cn } from "@/lib/ui/cn";
import { BigTitle, Kicker, Lede } from "./primitives";
import { AUTONOMY_TIERS, type AutonomyTier, type OnboardingData } from "./model";

const DEFAULT_TIER = AUTONOMY_TIERS.find(t => t.id === "guarded") ?? AUTONOMY_TIERS[1];

function wismoVerdict(tierId: AutonomyTier): { ok: boolean; verdict: string } {
  if (tierId === "watch") return { ok: false, verdict: "I draft a reply — you send" };
  if (tierId === "guarded") return { ok: false, verdict: "I draft a reply — you approve" };
  return { ok: true, verdict: "I reply instantly" };
}

export function StepAutonomy({ data, update }: { data: OnboardingData; update: (p: Partial<OnboardingData>) => void }) {
  const tier = AUTONOMY_TIERS.find(t => t.id === data.autonomy) ?? DEFAULT_TIER;
  const tierIdx = AUTONOMY_TIERS.findIndex(t => t.id === data.autonomy);
  const pct = (tierIdx / (AUTONOMY_TIERS.length - 1)) * 100;
  const wismo = wismoVerdict(tier.id);
  const sendsOnOwn = tier.id === "trusted" || tier.id === "broad" || tier.id === "full";

  return (
    <div>
      <Kicker step={5} label="WHAT I CAN DO" />
      <BigTitle>What can I do on my own?</BigTitle>
      <Lede>
        The most important decision in this whole setup. You can change it any time. Most stores start at{" "}
        <b className="text-white">Ask first</b> — I draft, you approve via Telegram or inbox.
      </Lede>

      <div className="mt-7 rounded-2xl border border-l-[3px] border-white/10 border-l-green-400 bg-white/[0.04] px-6 py-5">
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-green-400">TRUST LEVEL</span>
          <span className="flex-1" />
          <span className="font-mono text-xs text-white/45">
            refund cap: <b className="text-white">${tier.cap}</b>
          </span>
        </div>
        <div className="mt-1.5 text-[28px] font-semibold leading-[1.15] tracking-tight text-white">{tier.label}</div>
        <p className="m-0 mt-2 max-w-[580px] text-pretty text-[14px] leading-relaxed text-white/70">{tier.blurb}</p>

        <div className="mt-6">
          <div className="relative mx-2 mb-6 mt-2.5 h-1.5 rounded-full bg-white/[0.06]">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-green-400 transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
            {AUTONOMY_TIERS.map((t, i) => {
              const left = (i / (AUTONOMY_TIERS.length - 1)) * 100;
              const active = i <= tierIdx;
              const current = i === tierIdx;
              return (
                <button type="button"
                  key={t.id}
                  onClick={() => update({ autonomy: t.id })}
                  className={cn(
                    "absolute top-1/2 size-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 p-0 transition-all",
                    active ? "border-green-400 bg-green-400" : "border-white/15 bg-background",
                    current ? "ring-4 ring-green-400/30" : ""
                  )}
                  style={{ left: `${left}%` }}
                  aria-label={t.label}
                />
              );
            })}
          </div>
          <div className="flex justify-between px-1">
            {AUTONOMY_TIERS.map((t, i) => (
              <button type="button"
                key={t.id}
                onClick={() => update({ autonomy: t.id })}
                className={cn(
                  "flex flex-1 flex-col gap-0.5 bg-transparent px-0.5",
                  i === 0 ? "items-start text-left" : i === AUTONOMY_TIERS.length - 1 ? "items-end text-right" : "items-center text-center"
                )}
              >
                <span className={cn(
                  "text-xs tracking-[0.01em]",
                  i === tierIdx ? "font-bold text-green-400" : "font-medium text-white/45"
                )}>{t.label}</span>
                {t.recommended && (
                  <span className="mt-0.5 rounded-sm bg-green-400/15 px-1 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-wider text-green-400">PICK FOR ME</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 border-t border-dashed border-white/[0.07] pt-4">
          <div className="mb-2.5 font-mono text-[10.5px] font-bold uppercase tracking-wider text-white/45">
            WHAT THAT MEANS IN PRACTICE
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <Scenario ok={wismo.ok} title='"Where is my order?"' verdict={wismo.verdict} />
            <Scenario ok={sendsOnOwn && tier.cap >= 80} title="$80 refund — defective item"
              verdict={sendsOnOwn && tier.cap >= 80 ? "I refund + apologize" : "I'll pause for you"} />
            <Scenario ok={sendsOnOwn && tier.cap >= 200} title="$200 refund — wrong color"
              verdict={sendsOnOwn && tier.cap >= 200 ? "I refund (within cap)" : `I'll pause — over your $${tier.cap} cap`} />
            <Scenario ok={sendsOnOwn && tier.cap >= 250} title="40-unit bulk inquiry"
              verdict={sendsOnOwn && tier.cap >= 250 ? "I quote the 15% tier" : "I'll pause and draft a quote"} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Scenario({ title, verdict, ok }: { title: string; verdict: string; ok: boolean }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
      <span className={cn(
        "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md text-xs font-bold",
        ok ? "bg-green-400/15 text-green-400" : "bg-amber-300/15 text-amber-300"
      )}>
        {ok ? "✓" : "↗"}
      </span>
      <div className="min-w-0">
        <div className="text-[12px] italic text-white/70">{title}</div>
        <div className="mt-0.5 text-[12.5px] font-medium text-white">
          <span className={ok ? "text-green-400" : "text-amber-300"}>→</span> {verdict}
        </div>
      </div>
    </div>
  );
}
