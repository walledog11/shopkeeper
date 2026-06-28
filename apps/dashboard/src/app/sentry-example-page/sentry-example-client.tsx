'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect, useState } from 'react';

class SentryExampleFrontendError extends Error {
  constructor() {
    super('This error is raised on the frontend by the Sentry example page.');
    this.name = 'SentryExampleFrontendError';
  }
}

export default function SentryExampleClient() {
  const [isReady] = useState(() => Boolean(Sentry.getClient()?.getDsn()));
  const [hasSentBackendError, setHasSentBackendError] = useState(false);

  useEffect(() => {
    Sentry.logger.info('Sentry example page loaded');
  }, []);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 py-16 text-foreground">
      <section className="w-full max-w-xl rounded-xl border border-border bg-card p-8 shadow-sm">
        <p className="mb-2 text-sm font-medium text-foreground/50">Error monitoring test</p>
        <h1 className="text-3xl font-semibold tracking-tight">Sentry example page</h1>
        <p className="mt-3 text-sm leading-6 text-foreground/65">
          This sends an expected backend error, then throws an expected browser error. Both should
          appear in the Sentry Issues view.
        </p>

        <button
          type="button"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!isReady}
          onClick={async () => {
            Sentry.logger.info('Sentry example error triggered');

            await Sentry.startSpan(
              { name: 'Sentry example frontend/backend span', op: 'test' },
              async () => {
                const response = await fetch('/api/sentry-example-api');
                if (!response.ok) {
                  setHasSentBackendError(true);
                }
              },
            );

            throw new SentryExampleFrontendError();
          }}
        >
          {isReady ? 'Throw sample errors' : 'Sentry SDK is not initialized'}
        </button>

        {hasSentBackendError && (
          <p className="mt-4 text-sm text-emerald-700">
            Backend error sent. The browser error is being sent now.
          </p>
        )}

        {!isReady && (
          <p className="mt-4 text-sm text-destructive">
            The browser SDK has no configured DSN. Check the client instrumentation configuration.
          </p>
        )}
      </section>
    </main>
  );
}
