"use client";

import { useEffect, useState } from 'react';
import { reloadWithFreshToken } from './app-bridge';

/**
 * The page needs a valid ID token in its URL. When Shopify's has expired or is
 * missing, ask App Bridge for a fresh one and load again, once: `reloadParam`
 * marks the retry so a token that still fails shows an error instead of looping.
 */
export function SessionBounce({ reloadParam }: { reloadParam: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    reloadWithFreshToken(reloadParam).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [reloadParam]);

  return <p role="status" className="p-6 text-sm text-muted-foreground">
    {failed ? 'Open Shopkeeper from your Shopify admin to continue.' : 'Loading Shopkeeper…'}
  </p>;
}
