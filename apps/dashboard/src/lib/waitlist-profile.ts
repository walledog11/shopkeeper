// What the early-access form asks after the email. The codes are stored on
// `WaitlistEntry`; the labels are display-only.

export const WAITLIST_CHANNELS = [
  { code: "instagram", label: "Instagram" },
  { code: "email", label: "Email" },
  { code: "website_chat", label: "Website chat" },
  { code: "tiktok", label: "TikTok" },
  { code: "other", label: "Other" },
] as const;

export const WAITLIST_VOLUMES = [
  { code: "under_25", label: "Under 25" },
  { code: "25_100", label: "25–100" },
  { code: "100_500", label: "100–500" },
  { code: "500_plus", label: "500+" },
] as const;

export type WaitlistChannel = (typeof WAITLIST_CHANNELS)[number]["code"];
export type WaitlistVolume = (typeof WAITLIST_VOLUMES)[number]["code"];
