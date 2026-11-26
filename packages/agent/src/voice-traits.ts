/**
 * How the merchant wants replies to sound, as choices rather than prose. Each
 * trait has two options; the Voice page sets one trait per pick between two
 * sample replies, and the prompt's Voice section is composed from the chosen
 * options' guidance, in this order.
 */
export const VOICE_TRAITS = [
  {
    id: "warmth",
    label: "Warmth",
    options: [
      { value: "warm", label: "Warm", guidance: "Warm and friendly." },
      { value: "neutral", label: "Matter-of-fact", guidance: "Calm and matter-of-fact." },
    ],
  },
  {
    id: "length",
    label: "Length",
    options: [
      { value: "short", label: "Short", guidance: "Keep replies short: two or three sentences." },
      { value: "thorough", label: "Thorough", guidance: "Give a complete answer with every detail the customer needs." },
    ],
  },
  {
    id: "formality",
    label: "Wording",
    options: [
      { value: "casual", label: "Casual", guidance: "Casual, everyday words." },
      { value: "polished", label: "Polished", guidance: "Polished, professional wording." },
    ],
  },
  {
    id: "emoji",
    label: "Emoji",
    options: [
      { value: "some", label: "Now and then", guidance: "An emoji now and then is welcome." },
      { value: "none", label: "Never", guidance: "Never use emoji." },
    ],
  },
  {
    id: "apology",
    label: "When something went wrong",
    options: [
      { value: "apologize", label: "Apologize first", guidance: "When something went wrong, apologize before fixing it." },
      { value: "fix", label: "Straight to the fix", guidance: "Skip apologies and go straight to the fix." },
    ],
  },
] as const;

export type VoiceTrait = (typeof VOICE_TRAITS)[number];
export type VoiceTraitId = VoiceTrait["id"];
export type VoiceTraits = { [T in VoiceTrait as T["id"]]?: T["options"][number]["value"] };

/** The guidance lines for the traits the merchant has chosen, in trait order. */
export function voiceGuidance(traits: VoiceTraits | undefined): string[] {
  if (!traits) return [];
  return VOICE_TRAITS.flatMap((trait) => {
    const option = trait.options.find((candidate) => candidate.value === traits[trait.id]);
    return option ? [option.guidance] : [];
  });
}
