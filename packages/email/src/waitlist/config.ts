export interface WaitlistLoopsConfig {
  apiKey: string;
  formUrl: string;
  earlyAccessListId: string;
  updatesListId: string;
}

export function getWaitlistLoopsConfig(env = process.env): WaitlistLoopsConfig | null {
  if (env.LOOPS_WAITLIST_ENABLED !== 'true') return null;
  const apiKey = env.LOOPS_API_KEY?.trim();
  const formUrl = env.LOOPS_FORM_URL?.trim();
  const earlyAccessListId = env.LOOPS_EARLY_ACCESS_LIST_ID?.trim();
  const updatesListId = env.LOOPS_UPDATES_LIST_ID?.trim();
  if (!apiKey || !formUrl || !earlyAccessListId || !updatesListId) {
    throw new Error('waitlist_loops_configuration_incomplete');
  }
  const url = new URL(formUrl);
  if (url.origin !== 'https://app.loops.so' || !/^\/api\/newsletter-form\/[a-zA-Z0-9]+$/.test(url.pathname) || url.search || url.hash || url.username || url.password) {
    throw new Error('waitlist_loops_form_url_invalid');
  }
  if (earlyAccessListId === updatesListId) throw new Error('waitlist_loops_lists_must_differ');
  return { apiKey, formUrl, earlyAccessListId, updatesListId };
}
