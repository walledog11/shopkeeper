import type { WaitlistEntry } from '@prisma/client';
import type { WaitlistLoopsConfig } from './config.js';

export interface LoopsContact {
  id: string;
  email: string;
  subscribed: boolean;
  optInStatus: 'accepted' | 'pending' | 'rejected' | null;
  mailingLists: Record<string, boolean>;
}

export class LoopsRequestError extends Error {
  constructor(public code: string) { super(code); }
}

async function request(url: string, options: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(10_000) });
  } catch { throw new LoopsRequestError('loops_network_error'); }
  if (!response.ok) throw new LoopsRequestError(`loops_http_${response.status}`);
  const result: unknown = await response.json().catch(() => null);
  if (result === null || (typeof result === 'object' && 'success' in result && result.success === false)) {
    throw new LoopsRequestError('loops_invalid_response');
  }
  return result;
}

function waitlistContactProperties(entry: WaitlistEntry) {
  const tags = (entry.attribution ?? {}) as Record<string, unknown>;
  return {
    waitlistStage: entry.stage,
    waitlistJoinedAt: entry.createdAt.toISOString(),
    waitlistConsentVersion: entry.consentVersion,
    waitlistSource: entry.source,
    newsletterOptIn: entry.newsletterOptIn,
    utmSource: typeof tags.utm_source === 'string' ? tags.utm_source : '',
    utmMedium: typeof tags.utm_medium === 'string' ? tags.utm_medium : '',
    utmCampaign: typeof tags.utm_campaign === 'string' ? tags.utm_campaign : '',
  };
}

export async function findLoopsContact(config: WaitlistLoopsConfig, email: string): Promise<LoopsContact | null> {
  const result = await request(`https://app.loops.so/api/v1/contacts/find?email=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });
  if (!Array.isArray(result)) throw new LoopsRequestError('loops_invalid_contact_response');
  const contact = result.find(item => item && typeof item.email === 'string' && item.email.toLowerCase() === email);
  if (!contact) {
    if (result.length) throw new LoopsRequestError('loops_contact_mismatch');
    return null;
  }
  if (typeof contact.id !== 'string' || typeof contact.subscribed !== 'boolean'
    || ![null, 'pending', 'accepted', 'rejected'].includes(contact.optInStatus)
    || !contact.mailingLists || typeof contact.mailingLists !== 'object' || Array.isArray(contact.mailingLists)) {
    throw new LoopsRequestError('loops_invalid_contact_response');
  }
  return contact as LoopsContact;
}

export async function submitLoopsWaitlist(config: WaitlistLoopsConfig, entry: WaitlistEntry, currentSubscriptions: Record<string, boolean> = {}): Promise<void> {
  // An explicit false is an existing list opt-out. A public form submission
  // must not silently reverse it, even if the contact is globally subscribed.
  const mailingLists = [config.earlyAccessListId, ...(entry.newsletterOptIn ? [config.updatesListId] : [])]
    .filter(id => currentSubscriptions[id] !== false);
  if (!mailingLists.length) return;
  const body = new URLSearchParams({ email: entry.email, source: 'Shopkeeper waitlist', mailingLists: mailingLists.join(',') });
  for (const [key, value] of Object.entries(waitlistContactProperties(entry))) body.set(key, String(value));
  // The form endpoint is the provider's double-opt-in path. Do not replace this
  // with contacts/create or contacts/update, which bypass that confirmation.
  await request(config.formUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
}

export async function updateLoopsWaitlistProperties(config: WaitlistLoopsConfig, entry: WaitlistEntry): Promise<void> {
  await request('https://app.loops.so/api/v1/contacts/update', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    // Deliberately omit subscribed and mailingLists: syncing lifecycle data
    // must never restore a subscription that the recipient opted out of.
    body: JSON.stringify({ email: entry.email, ...waitlistContactProperties(entry) }),
  });
}
