type ClerkElementOverrides = Record<string, string>;

const baseElements: ClerkElementOverrides = {
  rootBox: "w-full",
  cardBox: "w-full",
  card:
    "w-full rounded-[1.75rem] border border-white/10 bg-[#0f0f0f]/95 text-white shadow-[0_24px_100px_-48px_rgba(0,0,0,0.95)] backdrop-blur-xl",
  headerTitle: "text-white font-semibold tracking-tight",
  headerSubtitle: "text-white/55",
  socialButtonsBlockButton:
    "h-11 rounded-xl border border-white/10 bg-white/[0.03] text-white shadow-none hover:bg-white/[0.06]",
  socialButtonsBlockButtonText: "font-medium",
  dividerLine: "bg-white/10",
  dividerText: "text-xs font-medium text-white/40",
  formFieldLabel: "text-sm font-medium text-white/75",
  formFieldInput:
    "h-11 rounded-xl border border-white/10 bg-white/[0.03] text-white shadow-none placeholder:text-white/35 focus:border-green-400 focus:ring-2 focus:ring-green-400/20",
  formFieldHintText: "text-xs text-white/40",
  formButtonPrimary:
    "h-11 rounded-xl bg-green-400 text-black shadow-none font-semibold hover:bg-green-300",
  footerActionLink: "font-medium text-green-400 hover:text-green-300",
  identityPreviewText: "text-white",
  identityPreviewEditButtonIcon: "text-green-400",
  alertText: "text-sm",
  formResendCodeLink: "font-medium text-green-400 hover:text-green-300",
  otpCodeFieldInput:
    "rounded-xl border border-white/10 bg-white/[0.03] text-white shadow-none focus:border-green-400 focus:ring-2 focus:ring-green-400/20",
};

export function getAuthClerkAppearance(overrides: ClerkElementOverrides = {}) {
  return {
    elements: {
      ...baseElements,
      ...overrides,
    },
  };
}
