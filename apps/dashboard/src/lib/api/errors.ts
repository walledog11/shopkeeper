import { NextResponse } from 'next/server';
import { isSpendCapError, nanoDollarsToUsd } from '@clerk/db';
import { ApiError } from '@clerk/agent/errors';
import logger from '@/lib/server/logger';

// The error classes moved to @clerk/agent/errors (Track 4.1) so the shared
// orchestration can throw/catch one class identity across hosts. Re-exported
// here so the ~56 dashboard importers stay unchanged; the Next-coupled mapper
// below stays dashboard-side.
export {
  ApiError,
  UnauthorizedError,
  ForbiddenError,
  NoActiveOrganizationError,
  NotFoundError,
  BadRequestError,
  ConflictError,
} from '@clerk/agent/errors';
export type { ApiErrorDetail } from '@clerk/agent/errors';

export function handleApiError(error: unknown, context: string, message: string): NextResponse {
  if (isSpendCapError(error)) {
    logger.warn({ context }, '[api] spend cap reached');
    return NextResponse.json(
      {
        error: 'AI spend cap reached for today. Increase the daily limit in Settings or wait until midnight UTC.',
        code: 'spend_cap_reached',
        currentUsd: nanoDollarsToUsd(error.currentNanoUsd),
        capUsd: nanoDollarsToUsd(error.capNanoUsd),
      },
      { status: 429 },
    );
  }
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      logger.error({ err: error }, `[${context}]`);
    }
    return NextResponse.json(
      {
        error: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
      { status: error.status }
    );
  }
  if (error instanceof Error && error.message === 'Unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  logger.error({ err: error }, `[${context}]`);
  return NextResponse.json({ error: message }, { status: 500 });
}
