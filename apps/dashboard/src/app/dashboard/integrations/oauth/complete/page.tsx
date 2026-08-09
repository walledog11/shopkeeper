'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { OAuthPopupShell } from '@/components/integrations/OAuthPopupShell';
import {
  OAUTH_ERROR_MESSAGES,
  parseOAuthOutcome,
  type OAuthProvider,
} from '@/lib/integrations/oauth-contract';
import { safeReturnTo } from '@/lib/security/safe-return-to';
import {
  finishOAuthPopup,
  OAUTH_DONE_MESSAGE_TYPE,
  resolveOAuthCompletionMode,
} from '@/lib/integrations/oauth-flow';

const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  gmail: 'Gmail',
  instagram: 'Instagram',
  shopify: 'Shopify',
  'tiktok-shop': 'TikTok Shop',
};

const OAUTH_COMPLETE_DELAY_MS = 250;

function OAuthCompleteContent() {
  const searchParams = useSearchParams();
  const serializedParams = searchParams.toString();
  const outcome = useMemo(
    () => parseOAuthOutcome(new URLSearchParams(serializedParams)),
    [serializedParams],
  );
  const mode = resolveOAuthCompletionMode(searchParams.get('mode'));
  const returnTo = safeReturnTo(searchParams.get('returnTo'));
  const [closeBlocked, setCloseBlocked] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (outcome && mode === 'popup') {
        finishOAuthPopup({ type: OAUTH_DONE_MESSAGE_TYPE, outcome });
        window.setTimeout(() => {
          if (!window.closed) setCloseBlocked(true);
        }, 300);
        return;
      }

      const nextUrl = new URL(returnTo ?? '/dashboard/integrations', window.location.origin);
      if (outcome) {
        nextUrl.searchParams.set('provider', outcome.provider);
        nextUrl.searchParams.set('status', outcome.status);
        if (outcome.status === 'failed') nextUrl.searchParams.set('error', outcome.error);
      }
      window.location.replace(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    }, OAUTH_COMPLETE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [mode, outcome, returnTo]);

  const success = outcome?.status === 'connected';
  const error = outcome?.status === 'failed' ? outcome.error : null;
  const title = success
    ? `${PROVIDER_LABELS[outcome.provider]} connected`
    : error
      ? 'Connection failed'
      : 'Finishing up';
  const message = success
    ? "You're all set. Returning you to Shopkeeper."
    : error
      ? OAUTH_ERROR_MESSAGES[error]
      : 'Completing your connection.';
  const footer = closeBlocked
    ? 'You can close this window and return to Shopkeeper.'
    : success || error
      ? mode === 'popup' ? 'Closing this window…' : 'Returning to Shopkeeper…'
      : 'Just a moment…';
  const state = success ? 'success' : error ? 'error' : 'loading';

  return <OAuthPopupShell title={title} message={message} footer={footer} state={state} />;
}

export default function OAuthCompletePage() {
  return (
    <Suspense
      fallback={
        <OAuthPopupShell
          title="Finishing up"
          message="Completing your connection."
          footer="Just a moment…"
          state="loading"
        />
      }
    >
      <OAuthCompleteContent />
    </Suspense>
  );
}
