import * as Sentry from '@sentry/nextjs';

const DEFAULT_SENTRY_DSN =
  'https://619e1c4cac794b4674272c2e3d13f7ff@o4511634087149568.ingest.us.sentry.io/4511634235719680';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || DEFAULT_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  sendDefaultPii: false,
  enableLogs: true,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1 : 0.1,
  integrations: [Sentry.replayIntegration()],
  replaysSessionSampleRate: process.env.NODE_ENV === 'development' ? 1 : 0.1,
  replaysOnErrorSampleRate: 1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
