import { NextResponse } from 'next/server';
import logger from './logger';

export function handleApiError(error: unknown, context: string, message: string): NextResponse {
  if (error instanceof Error && error.message === 'Unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  logger.error({ err: error }, `[${context}]`);
  return NextResponse.json({ error: message }, { status: 500 });
}
