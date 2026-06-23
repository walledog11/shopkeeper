export type MobileChromeMode = "standard" | "local" | "detail" | "immersive";

export const MOBILE_CHROME_PRIORITY: Record<MobileChromeMode, number> = {
  standard: 0,
  local: 1,
  detail: 2,
  immersive: 3,
};
