import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SentryExampleClient from './sentry-example-client';

export const metadata: Metadata = {
  title: 'Sentry example',
  robots: { index: false, follow: false },
};

export default function SentryExamplePage() {
  if (
    process.env.NODE_ENV !== 'development' &&
    process.env.SENTRY_EXAMPLE_PAGE_ENABLED !== 'true'
  ) {
    notFound();
  }

  return <SentryExampleClient />;
}
