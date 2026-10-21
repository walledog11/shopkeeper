import { GLASS_SETTINGS_ACTION } from "@/lib/ui/glass-card-styles";

type ClerkElementOverrides = Record<string, string | Record<string, string>>;

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

const authVariables = {
  ...paperVariables,
  colorPrimary: "#1b1a19",
  colorTextOnPrimaryBackground: "#fcfaf8",
  colorNeutral: "#1b1a19",
  colorInputBackground: "#fff",
  colorInputText: "#1b1a19",
  colorText: "#1b1a19",
  colorTextSecondary: "#57534e",
  fontFamily: '"General Sans", system-ui, sans-serif',
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
    "h-11 rounded-full border border-stone-900/12 bg-foreground text-[#2b2118] shadow-none hover:bg-stone-50",
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
    "h-11 rounded-full border border-stone-900/12 bg-foreground text-[#2b2118] shadow-none hover:bg-stone-50",
  ...hiddenFooterElements,
};

const authInputClassName =
  "h-12 max-h-none rounded-xl border border-[color:var(--m-line-strong)] bg-white px-3.5 text-base text-[color:var(--m-ink)] shadow-none placeholder:text-[color:var(--m-ink-3)] focus:border-[color:var(--m-ink)] focus:ring-2 focus:ring-stone-900/10 aria-invalid:border-red-700";

const authLinkClassName =
  "font-medium text-[color:var(--m-ink)] underline underline-offset-4 hover:text-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--m-focus)]";

const authElements: ClerkElementOverrides = {
  rootBox: "w-full max-w-full min-w-0",
  cardBox: "w-full max-w-full min-w-0 overflow-visible rounded-none border-0 bg-transparent shadow-none",
  card: "m-0 w-full max-w-full min-w-0 rounded-none border-0 bg-transparent p-0 shadow-none",
  headerTitle: "text-[color:var(--m-ink)] font-medium",
  headerSubtitle: "text-[color:var(--m-ink-2)]",
  socialButtonsBlockButton:
    "m-btn m-btn-outline h-12 w-full shadow-none",
  socialButtonsBlockButtonText: "text-[15px] font-medium",
  dividerLine: "bg-[color:var(--m-line)]",
  dividerText: "text-xs font-normal text-[color:var(--m-ink-3)]",
  formFieldLabel: "text-sm font-medium text-[color:var(--m-ink)]",
  formFieldInput: authInputClassName,
  formFieldHintText: "text-xs text-[color:var(--m-ink-2)]",
  formButtonPrimary:
    "m-btn m-btn-primary h-12 w-full bg-none shadow-none before:hidden after:hidden",
  formButtonPrimaryText: "text-[15px] font-medium leading-none",
  formButtonPrimaryIcon: "static m-0 shrink-0 text-current",
  identityPreviewText: "text-[color:var(--m-ink)]",
  identityPreviewEditButton: authLinkClassName,
  identityPreviewEditButtonIcon: "text-[color:var(--m-ink)]",
  alertText: "text-sm",
  formResendCodeLink: authLinkClassName,
  formFieldAction: authLinkClassName,
  backLink: authLinkClassName,
  otpCodeFieldInput:
    "h-12 max-h-none rounded-xl border border-[color:var(--m-line-strong)] bg-white text-base text-[color:var(--m-ink)] shadow-none focus:border-[color:var(--m-ink)] focus:ring-2 focus:ring-stone-900/10",
  formFieldInputShowPasswordButton: "text-[color:var(--m-ink-3)] hover:text-[color:var(--m-ink)]",
  alternativeMethodsBlockButton:
    "m-btn m-btn-outline min-h-12 w-full shadow-none",
  ...hiddenFooterElements,
};

export function getAuthClerkAppearance(
  overrides: ClerkElementOverrides = {},
) {
  return {
    variables: authVariables,
    elements: {
      ...authElements,
      ...overrides,
    },
  };
}

export function getUserProfileClerkAppearance(): {
  variables: typeof paperVariables;
  elements: ClerkElementOverrides;
} {
  const sharedPaperElements: ClerkElementOverrides = { ...paperElements };
  delete sharedPaperElements.badge;

  return {
    variables: {
      ...paperVariables,
      colorBackground: "transparent",
    },
    elements: {
      ...sharedPaperElements,
      rootBox: "w-full max-w-full min-w-0 bg-transparent",
      cardBox:
        "w-full max-w-full min-w-0 overflow-visible rounded-none border-0 bg-transparent shadow-none",
      card: "w-full max-w-full min-w-0 rounded-none border-0 bg-transparent p-0 shadow-none",
      navbar: { display: "none" },
      navbarHeader: { display: "none" },
      navbarButtons: { display: "none" },
      navbarMobileMenuRow: { display: "none" },
      navbarMobileMenuButton: { display: "none" },
      scrollBox: "bg-transparent shadow-none",
      pageScrollBox: "bg-transparent shadow-none",
      headerTitle: "text-lg font-semibold tracking-tight text-strong",
      headerSubtitle: "text-sm text-muted-foreground",
      profilePageContent: "p-0",
      profileSection: "w-full rounded-2xl",
      profileSectionHeader: "w-full text-left",
      profileSectionTitleText: "text-left text-sm font-semibold text-strong",
      profileSectionContent: "min-w-0 w-full text-sm text-muted-foreground",
      profileSectionPrimaryButton: GLASS_SETTINGS_ACTION,
      userPreview: "min-w-0 w-full max-w-full",
      userPreviewMainIdentifier: "overflow-visible whitespace-normal",
      userPreviewMainIdentifierText: "overflow-visible whitespace-normal",
      actionCard: "rounded-none border-0 bg-transparent p-0 shadow-none",
      accordionTriggerButton: "text-sm font-medium text-strong",
      formButtonPrimary:
        "!bg-[#2b2118] !text-[#f6f2eb] inline-flex h-9 items-center justify-center gap-1.5 rounded-full text-sm font-semibold leading-none shadow-[inset_0_1px_0_rgba(255,245,235,0.14),0_8px_24px_-8px_rgba(12,8,5,0.4)] hover:!bg-[#1a120c]",
    },
  };
}
