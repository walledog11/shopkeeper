type ClerkElementOverrides = Record<string, string>;
type AuthClerkVariant = "paper" | "ink";

const paperVariables = {
  colorPrimary: "#2b2118",
  colorTextOnPrimaryBackground: "#f6f2eb",
  colorDanger: "#b91c1c",
  colorSuccess: "#2f7a4a",
  colorWarning: "#d97706",
  colorNeutral: "#2b2118",
  colorBackground: "transparent",
  colorInputBackground: "#f6f2eb",
  colorInputText: "#2b2118",
  colorText: "#2b2118",
  colorTextSecondary: "rgba(43, 33, 24, 0.55)",
  borderRadius: "0.75rem",
};

const inkVariables = {
  colorPrimary: "#d6c4aa",
  colorTextOnPrimaryBackground: "#1a120c",
  colorDanger: "#fca5a5",
  colorSuccess: "#86efac",
  colorWarning: "#fcd34d",
  colorNeutral: "#f6f2eb",
  colorBackground: "transparent",
  colorInputBackground: "rgba(255, 245, 235, 0.07)",
  colorInputText: "#f6f2eb",
  colorText: "#f6f2eb",
  colorTextSecondary: "rgba(246, 242, 235, 0.55)",
  borderRadius: "0.75rem",
};

const hiddenFooterElements: ClerkElementOverrides = {
  footer: "hidden",
  footerAction: "hidden",
  footerActionText: "hidden",
  footerActionLink: "hidden",
  footerPages: "hidden",
  badge: "hidden",
};

const paperElements: ClerkElementOverrides = {
  rootBox: "w-full max-w-full min-w-0",
  cardBox: "w-full max-w-full min-w-0 shadow-none",
  card: "w-full max-w-full min-w-0 bg-transparent shadow-none border-0 p-0",
  headerTitle: "text-[#2b2118] font-semibold tracking-tight",
  headerSubtitle: "text-stone-500",
  socialButtonsBlockButton:
    "h-11 rounded-full border border-stone-900/12 bg-white text-[#2b2118] shadow-none hover:bg-stone-50",
  socialButtonsBlockButtonText: "font-medium",
  dividerLine: "bg-stone-900/10",
  dividerText: "text-xs font-medium text-stone-400",
  formFieldLabel: "text-sm font-medium text-[#2b2118]",
  formFieldInput:
    "h-11 rounded-xl border border-stone-900/12 bg-[#f6f2eb] text-[#2b2118] shadow-none placeholder:text-stone-400 focus:border-[#2b2118]/25 focus:ring-2 focus:ring-[#2b2118]/8",
  formFieldHintText: "text-xs text-stone-500",
  formButtonPrimary:
    "!bg-[#2b2118] !text-[#f6f2eb] inline-flex h-11 items-center justify-center gap-1.5 rounded-full font-semibold leading-none shadow-[inset_0_1px_0_rgba(255,245,235,0.14),0_8px_24px_-8px_rgba(12,8,5,0.4)] hover:!bg-[#1a120c]",
  formButtonPrimaryText: "leading-none",
  formButtonPrimaryIcon: "!text-[#f6f2eb] !relative !m-0 !static shrink-0",
  identityPreviewText: "text-[#2b2118]",
  identityPreviewEditButtonIcon: "text-[#2f7a4a]",
  alertText: "text-sm",
  formResendCodeLink: "font-medium text-[#2f7a4a] hover:text-[#166534]",
  otpCodeFieldInput:
    "rounded-xl border border-stone-900/12 bg-[#f6f2eb] text-[#2b2118] shadow-none focus:border-[#2b2118]/25 focus:ring-2 focus:ring-[#2b2118]/8",
  formFieldInputShowPasswordButton: "text-stone-500 hover:text-[#2b2118]",
  alternativeMethodsBlockButton:
    "h-11 rounded-full border border-stone-900/12 bg-white text-[#2b2118] shadow-none hover:bg-stone-50",
  ...hiddenFooterElements,
};

const inkElements: ClerkElementOverrides = {
  rootBox: "w-full",
  cardBox: "w-full shadow-none",
  card: "w-full bg-transparent shadow-none border-0 p-0",
  headerTitle: "text-[#f6f2eb] font-semibold tracking-tight",
  headerSubtitle: "text-[#f6f2eb]/55",
  socialButtonsBlockButton:
    "h-11 rounded-full border border-white/14 bg-white/[0.05] text-[#f6f2eb] shadow-none hover:bg-white/[0.09]",
  socialButtonsBlockButtonText: "font-medium text-[#f6f2eb]",
  dividerLine: "bg-white/10",
  dividerText: "text-xs font-medium text-[#f6f2eb]/45",
  formFieldLabel: "text-sm font-medium text-[#f6f2eb]/75",
  formFieldInput:
    "h-11 rounded-xl border border-white/12 bg-white/[0.06] text-[#f6f2eb] shadow-none placeholder:text-[#f6f2eb]/30 focus:border-white/25 focus:ring-2 focus:ring-white/10",
  formFieldHintText: "text-xs text-[#f6f2eb]/45",
  formButtonPrimary:
    "!bg-[#d6c4aa] !text-[#1a120c] h-11 rounded-full border border-white/20 font-semibold shadow-[inset_0_1px_0_rgba(255,245,235,0.5)] hover:!bg-[#e4d2b6]",
  formButtonPrimaryIcon: "!text-[#1a120c]",
  identityPreviewText: "text-[#f6f2eb]",
  identityPreviewEditButtonIcon: "text-[#cdbfa3]",
  alertText: "text-sm text-[#f6f2eb]",
  formResendCodeLink: "font-medium text-[#cdbfa3] hover:text-[#f6f2eb]",
  otpCodeFieldInput:
    "rounded-xl border border-white/12 bg-white/[0.06] text-[#f6f2eb] shadow-none focus:border-white/25 focus:ring-2 focus:ring-white/10",
  formFieldInputShowPasswordButton: "text-[#f6f2eb]/45 hover:text-[#f6f2eb]",
  alternativeMethodsBlockButton:
    "h-11 rounded-full border border-white/14 bg-white/[0.05] text-[#f6f2eb] shadow-none hover:bg-white/[0.09]",
  ...hiddenFooterElements,
};

export function getAuthClerkAppearance(
  overrides: ClerkElementOverrides = {},
  variant: AuthClerkVariant = "paper",
) {
  const variables = variant === "ink" ? inkVariables : paperVariables;
  const elements = variant === "ink" ? inkElements : paperElements;

  return {
    variables,
    elements: {
      ...elements,
      ...overrides,
    },
  };
}
