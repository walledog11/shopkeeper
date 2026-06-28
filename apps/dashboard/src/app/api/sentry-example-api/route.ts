import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';

class SentryExampleApiError extends Error {
  constructor() {
    super('This error is raised on the backend by the Sentry example API.');
    this.name = 'SentryExampleApiError';
  }
}

export function GET() {
  if (
    process.env.NODE_ENV !== 'development' &&
    process.env.SENTRY_EXAMPLE_PAGE_ENABLED !== 'true'
  ) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  Sentry.logger.info('Sentry example API called');
  throw new SentryExampleApiError();
}
