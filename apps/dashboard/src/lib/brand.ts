/** User-facing product name. */
export const PRODUCT_NAME = 'Shopkeeper';

/**
 * Public contact address for marketing and legal pages.
 * Override in Vercel via NEXT_PUBLIC_CONTACT_EMAIL when the primary domain changes (Phase 6).
 */
export const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'hello@useclerk.co';
