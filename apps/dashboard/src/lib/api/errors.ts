import { NextResponse } from 'next/server';
import { isSpendCapError, nanoDollarsToUsd } from '@clerk/db';
import logger from '@/lib/server/logger';

export interface ApiErrorDetail {
  code: string;
  field?: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

export class NoActiveOrganizationError extends ApiError {
  constructor(message = 'No active organization') {
    super(message, 403);
    this.name = 'NoActiveOrganizationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

export class BadRequestError extends ApiError {
  constructor(message = 'Bad request', details?: ApiErrorDetail[]) {
    super(message, 400, details);
    this.name = 'BadRequestError';
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'Conflict') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

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
