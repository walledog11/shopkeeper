import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { CustomerBubble, VoiceReplyBubble } from "@/components/agent/VoiceReplyBubble";
import { VOICE_PRESETS, VOICE_SCENARIOS } from "@/lib/agent/voice";
import { draftVoiceReply, type VoiceReply } from "@/lib/agent/voice-requests";
import { cn } from "@/lib/ui/cn";
import { Accent, Headline, Lede } from "./primitives";
import type { OnboardingData } from "../_lib/onboarding-model";

const SCENARIO = VOICE_SCENARIOS[0];

// The same customer answered in each starting voice, so the merchant picks the
// voice by hearing it. The Voice page refines it one choice at a time later.
export function StepVoice({ data, update, disabled }: {
  data: OnboardingData;
  update: (patch: Partial<OnboardingData>) => void;
  disabled: boolean;
}) {
  const [replies, setReplies] = useState<Record<string, VoiceReply>>({});
  const requested = useRef(false);

  const draft = useCallback((preset: (typeof VOICE_PRESETS)[number]) => {
    setReplies(current => ({ ...current, [preset.label]: { status: "loading" } }));
    void draftVoiceReply(preset.traits, SCENARIO.id).then(reply => setReplies(current => ({ ...current, [preset.label]: reply })));
  }, []);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    for (const preset of VOICE_PRESETS) draft(preset);
  }, [draft]);

  return (
    <div className="flex flex-col items-center">
      <Headline>How should I sound?<Accent>Pick the reply you’d send.</Accent></Headline>
      <Lede>Here’s how I’d answer the same customer in a few different voices. The customer is made up, and nothing is sent.</Lede>

      <div className="mt-7 flex w-full max-w-[640px] flex-col gap-4 text-left">
        <div className="flex flex-col rounded-2xl border border-foreground/10 bg-card/60 p-4">
          <CustomerBubble name={SCENARIO.customerName} message={SCENARIO.message} />
        </div>

        <fieldset disabled={disabled} className="min-w-0">
          <legend className="sr-only">Pick the reply that sounds like you</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {VOICE_PRESETS.map(preset => {
              const selected = data.voice === preset.label;
              return (
                <label
                  key={preset.label}
                  className={cn(
                    "flex cursor-pointer flex-col gap-3 rounded-2xl border bg-card p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                    selected ? "border-foreground shadow-[0_10px_28px_-18px_rgba(43,33,24,0.55)]" : "border-foreground/10 hover:border-foreground/25",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="voice"
                      value={preset.label}
                      checked={selected}
                      onChange={() => update({ voice: preset.label })}
                      className="sr-only"
                    />
                    <span className="text-[14px] font-semibold text-foreground">{preset.label}</span>
                    {selected && <Check aria-hidden className="ml-auto size-4 text-foreground" />}
                  </span>
                  <VoiceReplyBubble reply={replies[preset.label] ?? { status: "loading" }} onRetry={() => draft(preset)} />
                </label>
              );
            })}
          </div>
        </fieldset>

        <p className="text-center text-[12.5px] leading-relaxed text-foreground/50">You can fine-tune this any time on the Voice page.</p>
      </div>
    </div>
  );
}
