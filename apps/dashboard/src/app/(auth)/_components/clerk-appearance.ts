type ClerkElementOverrides = Record<string, string>;

const baseElements: ClerkElementOverrides = {
  rootBox: "w-full",
  cardBox: "w-full",
  card: "w-full rounded-md border border-border bg-card text-card-foreground shadow-sm",
  headerTitle: "text-foreground font-semibold tracking-tight",
  headerSubtitle: "text-muted-foreground",
  socialButtonsBlockButton:
    "h-10 rounded-md border border-border bg-muted/40 text-foreground shadow-none hover:bg-accent",
  socialButtonsBlockButtonText: "font-medium",
  dividerLine: "bg-border",
  dividerText: "text-xs font-medium text-muted-foreground",
  formFieldLabel: "text-sm font-medium text-foreground/80",
  formFieldInput:
    "h-10 rounded-md border border-border bg-muted/40 text-foreground shadow-none placeholder:text-muted-foreground focus:border-green-400 focus:ring-2 focus:ring-green-400/20",
  formFieldHintText: "text-xs text-muted-foreground",
  formButtonPrimary:
    "h-10 rounded-md bg-green-400 text-green-950 shadow-none font-semibold hover:bg-green-300",
  footerActionLink: "font-medium text-green-400 hover:text-green-300",
  identityPreviewText: "text-foreground",
  identityPreviewEditButtonIcon: "text-green-400",
  alertText: "text-sm",
  formResendCodeLink: "font-medium text-green-400 hover:text-green-300",
  otpCodeFieldInput:
    "rounded-md border border-border bg-muted/40 text-foreground shadow-none focus:border-green-400 focus:ring-2 focus:ring-green-400/20",
};

export function getAuthClerkAppearance(overrides: ClerkElementOverrides = {}) {
  return {
    elements: {
      ...baseElements,
      ...overrides,
    },
  };
}
