import { Textarea } from "@/components/ui/textarea";
import { Accent, Headline, Lede } from "./primitives";
import type { KbSyncViewModel, OnboardingData } from "../_lib/onboarding-model";

// Each answer is one line of the store profile, which holds 2,000 characters.
const ANSWER_MAX_CHARS = 500;

const QUESTIONS = [
  {
    field: "sells",
    question: "What do you sell, and who buys it?",
    placeholder: "For example: handmade ceramic mugs and planters, mostly bought as gifts.",
  },
  {
    field: "returns",
    question: "How do returns and refunds work?",
    placeholder: "For example: 30 days for unused items, and a free replacement if something arrives broken.",
  },
  {
    field: "never",
    question: "Is there anything I should never promise or do?",
    placeholder: "For example: never promise a delivery date, and don’t offer discounts without asking me.",
  },
] as const satisfies readonly { field: keyof OnboardingData; question: string; placeholder: string }[];

export function StepAbout({ data, update, kbSync, disabled }: {
  data: OnboardingData;
  update: (patch: Partial<OnboardingData>) => void;
  kbSync: KbSyncViewModel;
  disabled: boolean;
}) {
  const readStore = kbSync.status === "succeeded" && kbSync.policies + kbSync.pages > 0;
  return (
    <div className="flex flex-col items-center">
      <Headline>Tell me about your shop.<Accent>Like you’d brief a new hire.</Accent></Headline>
      <Lede>
        {readStore
          ? "I’ve read the policies and pages on your store. Tell me what they don’t say, in your own words."
          : "Answer in your own words. Skip anything you’d rather explain later."}
      </Lede>
      <div className="mt-7 w-full max-w-[560px] space-y-5 text-left">
        {QUESTIONS.map(({ field, question, placeholder }) => (
          <div key={field}>
            <label htmlFor={`about-${field}`} className="mb-1.5 block text-[14px] font-semibold text-foreground">{question}</label>
            <Textarea
              id={`about-${field}`}
              value={data[field]}
              maxLength={ANSWER_MAX_CHARS}
              rows={2}
              disabled={disabled}
              placeholder={placeholder}
              onChange={event => update({ [field]: event.target.value })}
              className="min-h-16 bg-card text-base leading-relaxed placeholder:text-foreground/35 md:text-[14px]"
            />
          </div>
        ))}
        <p className="text-[12.5px] leading-relaxed text-foreground/50">You can change these any time in Memory.</p>
      </div>
    </div>
  );
}
