// Sign-in and the dashboard only run on the app host (`canonical-host.ts`).
// Linking there directly skips the cross-host redirect, which a Next prefetch
// from the marketing host cannot follow under the content security policy.
const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

export const LOGIN_HREF = `${APP_ORIGIN}/login`;
export const DASHBOARD_HREF = `${APP_ORIGIN}/dashboard`;
