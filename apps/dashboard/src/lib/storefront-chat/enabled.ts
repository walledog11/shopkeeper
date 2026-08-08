// Two independent switches, both defaulting to off. The env flag is the
// platform kill switch; the integration flag is the merchant's own. A storefront
// is chattable only when both are on, so either one alone turns it off.
export function isStorefrontChatGloballyEnabled(): boolean {
  return process.env.STOREFRONT_CHAT_ENABLED === "true";
}

export function isStorefrontChatEnabledForIntegration(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const settings = (metadata as Record<string, unknown>).storefrontChat;
  if (!settings || typeof settings !== "object") return false;
  return (settings as Record<string, unknown>).enabled === true;
}
