import { GLASS_SETTINGS_ACTION } from "@/lib/ui/glass-card-styles";
import { clerkPrimaryButtonClassName } from "@/lib/ui/app-button-styles";

type ClerkElementOverrides = Record<string, string | Record<string, string>>;

const paperVariables = {
  colorPrimary: "#1b1a19",
  colorTextOnPrimaryBackground: "#fcfaf8",
  colorDanger: "#b91c1c",
  colorSuccess: "#2f7a4a",
  colorWarning: "#d97706",
  colorNeutral: "#1b1a19",
  colorBackground: "transparent",
  colorInputBackground: "#ffffff",
  colorInputText: "#1b1a19",
  colorText: "#1b1a19",
  colorTextSecondary: "#57534e",
  borderRadius: "0.75rem",
};

const authVariables = {
  ...paperVariables,
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

const paperInputClassName =
  "h-11 rounded-xl border border-stone-900/12 bg-white text-foreground shadow-none placeholder:text-stone-400 focus:border-foreground/25 focus:ring-2 focus:ring-foreground/8";

const paperElements: ClerkElementOverrides = {
  rootBox: "w-full max-w-full min-w-0",
  cardBox: "w-full max-w-full min-w-0 shadow-none",
  card: "w-full max-w-full min-w-0 bg-transparent shadow-none border-0 p-0",
  headerTitle: "text-foreground font-semibold tracking-tight",
  headerSubtitle: "text-muted-foreground",
  socialButtonsBlockButton:
    "h-11 rounded-full border border-stone-900/12 bg-white text-foreground shadow-none hover:bg-stone-50",
  socialButtonsBlockButtonText: "font-medium",
  dividerLine: "bg-stone-900/10",
  dividerText: "text-xs font-medium text-stone-400",
  formFieldLabel: "text-sm font-medium text-foreground",
  formFieldInput: paperInputClassName,
  formFieldHintText: "text-xs text-stone-500",
  formButtonPrimary: cnClerkPrimary(clerkPrimaryButtonClassName, "h-11 gap-1.5 font-semibold leading-none"),
  formButtonPrimaryText: "leading-none",
  formButtonPrimaryIcon: "!text-primary-foreground !relative !m-0 !static shrink-0",
  identityPreviewText: "text-foreground",
  identityPreviewEditButtonIcon: "text-[#2f7a4a]",
  alertText: "text-sm",
  formResendCodeLink: "font-medium text-[#2f7a4a] hover:text-[#166534]",
  otpCodeFieldInput: paperInputClassName,
  formFieldInputShowPasswordButton: "text-stone-500 hover:text-foreground",
  alternativeMethodsBlockButton:
    "h-11 rounded-full border border-stone-900/12 bg-white text-foreground shadow-none hover:bg-stone-50",
  ...hiddenFooterElements,
};

function cnClerkPrimary(base: string, extra: string) {
  return `!shadow-none ${base} ${extra}`.replace(/\s+/g, " ").trim();
}

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
      formButtonPrimary: cnClerkPrimary(clerkPrimaryButtonClassName, "h-9 gap-1.5 text-sm font-semibold leading-none"),
    },
  };
}
