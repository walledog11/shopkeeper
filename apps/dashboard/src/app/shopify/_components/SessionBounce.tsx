"use client";

import { useEffect, useState } from 'react';
import { shopifyIdToken } from './app-bridge';

/**
 * The page needs a valid ID token in its URL. When Shopify's has expired or is
 * missing, ask App Bridge for a fresh one and load again, once: `reloadParam`
 * marks the retry so a token that still fails shows an error instead of looping.
 */
export function SessionBounce({ reloadParam }: { reloadParam: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    shopifyIdToken().then((token) => {
      if (cancelled) return;
      const url = new URL(window.location.href);
      url.searchParams.set('id_token', token);
      url.searchParams.set(reloadParam, '1');
      window.location.replace(url.toString());
    }, () => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [reloadParam]);

  return <p role="status" className="p-6 text-sm text-muted-foreground">
    {failed ? 'Open Shopkeeper from your Shopify admin to continue.' : 'Loading Shopkeeper…'}
  </p>;
}
