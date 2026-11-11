"use client";

import * as Sentry from '@sentry/nextjs';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reloadWithFreshToken } from './_components/app-bridge';
import { ProblemPage } from './_components/ShopifyAppHome';

/**
 * Without this, an error here reached the dashboard's global error page, whose
 * links load the dashboard inside Shopify admin's frame, which refuses it.
 */
export default function ShopifyAppHomeError({ error, retry }: { error: unknown; retry: () => void }) {
  const [retrying, setRetrying] = useState(false);
  useEffect(() => { Sentry.captureException(error); }, [error]);

  function tryAgain() {
    setRetrying(true);
    // The ID token in this URL lasts a minute, so load again with a fresh one.
    reloadWithFreshToken().catch(() => { setRetrying(false); retry(); });
  }

  return <ProblemPage title="Shopkeeper couldn't load" detail="Try again. If it keeps happening, open Shopkeeper directly."
    action={<Button type="button" size="sm" disabled={retrying} onClick={tryAgain}>
      {retrying && <Loader2 className="animate-spin" />}Try again
    </Button>} />;
}
