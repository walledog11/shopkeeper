import type { ParsedEmail } from './types.js';

function normalizeAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/<([^>]+)>/);
  const address = (match ? match[1] : value).trim().toLowerCase();
  return address || null;
}

/**
 * Decide whether a parsed message is addressed to the merchant's support
 * address. Google Workspace delivers aliases via `To`, `Delivered-To`, or
 * `X-Original-To`, so check all of them.
 */
export function isForSupportAddress(
  parsed: ParsedEmail,
  supportAddress: string,
  extraHeaders = parsed.routingHeaders,
): boolean {
  const target = normalizeAddress(supportAddress);
  if (!target) return false;

  const candidates = new Set<string>();
  for (const to of parsed.to) {
    const normalized = normalizeAddress(to);
    if (normalized) candidates.add(normalized);
  }

  for (const header of ['delivered-to', 'x-original-to']) {
    const raw = extraHeaders?.[header];
    const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const value of values) {
      const normalized = normalizeAddress(value);
      if (normalized) candidates.add(normalized);
    }
  }

  return candidates.has(target);
}
