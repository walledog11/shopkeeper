import { NextResponse } from 'next/server';

export function handleApiError(error: unknown, context: string, message: string): NextResponse {
  if (error instanceof Error && error.message === 'Unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  console.error(`[${context}]`, error);
  return NextResponse.json({ error: message }, { status: 500 });
}
