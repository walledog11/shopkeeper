import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomerBubble, VoiceReplyBubble } from "@/components/agent/VoiceReplyBubble";
import { VOICE_PRESETS, VOICE_SCENARIOS } from "@/lib/agent/voice";
import { draftVoiceReply, errorMessage, rewriteVoiceBrief, type VoiceReply } from "@/lib/agent/voice-requests";
import { cn } from "@/lib/ui/cn";
import { Accent, Headline, Lede } from "./primitives";
import type { OnboardingData } from "../_lib/onboarding-model";

const SCENARIO = VOICE_SCENARIOS[0];
const PRESET_BRIEFS = new Set(VOICE_PRESETS.map(preset => preset.brief));

// The same customer answered in each starting voice, so the merchant picks the
// voice by hearing it. A change in plain words becomes their own version.
export function StepVoice({ data, update, disabled }: {
  data: OnboardingData;
  update: (patch: Partial<OnboardingData>) => void;
  disabled: boolean;
}) {
  const [custom, setCustom] = useState<string | null>(data.voice && !PRESET_BRIEFS.has(data.voice) ? data.voice : null);
  const [replies, setReplies] = useState<Record<string, VoiceReply>>({});
  const requested = useRef(new Set<string>());
  const [change, setChange] = useState("");
  const [changing, setChanging] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  // The merchant's version lands below the cards they were reading, so a change
  // that creates it scrolls it to the top, with the change box under it.
  const [revealCustom, setRevealCustom] = useState(false);
  const options = custom ? [...VOICE_PRESETS, { label: "Your version", brief: custom }] : VOICE_PRESETS;

  const draft = useCallback((brief: string) => {
    requested.current.add(brief);
    setReplies(current => ({ ...current, [brief]: { status: "loading" } }));
    void draftVoiceReply(brief, SCENARIO.id).then(reply => setReplies(current => ({ ...current, [brief]: reply })));
  }, []);

  useEffect(() => {
    for (const brief of [...PRESET_BRIEFS, ...(custom ? [custom] : [])]) {
      if (!requested.current.has(brief)) draft(brief);
    }
  }, [custom, draft]);

  async function applyChange() {
    if (!change.trim() || !data.voice) return;
    setChanging(true);
    setChangeError(null);
    try {
      const brief = await rewriteVoiceBrief(data.voice, change);
      setChange("");
      setCustom(brief);
      setRevealCustom(true);
      update({ voice: brief });
    } catch (error) {
      setChangeError(errorMessage(error, "Couldn't change the voice."));
    } finally {
      setChanging(false);
    }
  }

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
            {options.map(option => {
              const selected = data.voice === option.brief;
              return (
                <label
                  key={option.brief}
                  ref={option.brief === custom && revealCustom ? node => {
                    node?.scrollIntoView({ block: "start", behavior: "smooth" });
                    setRevealCustom(false);
                  } : undefined}
                  className={cn(
                    "flex cursor-pointer flex-col gap-3 rounded-2xl border bg-card p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                    selected ? "border-foreground shadow-[0_10px_28px_-18px_rgba(43,33,24,0.55)]" : "border-foreground/10 hover:border-foreground/25",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="voice"
                      value={option.brief}
                      checked={selected}
                      onChange={() => update({ voice: option.brief })}
                      className="sr-only"
                    />
                    <span className="text-[14px] font-semibold text-foreground">{option.label}</span>
                    {selected && <Check aria-hidden className="ml-auto size-4 text-foreground" />}
                  </span>
                  <VoiceReplyBubble reply={replies[option.brief] ?? { status: "loading" }} onRetry={() => draft(option.brief)} />
                </label>
              );
            })}
          </div>
        </fieldset>

        {data.voice && (
          <form
            className="rounded-2xl border border-foreground/10 bg-card p-4"
            onSubmit={event => {
              event.preventDefault();
              void applyChange();
            }}
          >
            <label htmlFor="voice-change" className="mb-1.5 block text-[14px] font-semibold text-foreground">Want it a little different?</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="voice-change"
                value={change}
                maxLength={300}
                disabled={disabled || changing}
                onChange={event => setChange(event.target.value)}
                placeholder="Tell me what to change, like “sign off as Sam”"
                className="h-11 min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
              />
              <Button type="submit" variant="outline" disabled={disabled || changing || !change.trim()} className="h-11 rounded-full px-5">
                {changing ? <Loader2 className="animate-spin" /> : null}
                Change it
              </Button>
            </div>
            {changeError && <p role="alert" className="mt-2 text-[13px] text-destructive">{changeError}</p>}
          </form>
        )}

        <p className="text-center text-[12.5px] leading-relaxed text-foreground/50">You can fine-tune this any time on the Voice page.</p>
      </div>
    </div>
  );
}
