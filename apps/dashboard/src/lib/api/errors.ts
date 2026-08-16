import { NextResponse } from 'next/server';
import { isSpendCapError, nanoDollarsToUsd } from '@shopkeeper/db';
import { ApiError } from '@shopkeeper/agent/errors';
import logger from '@/lib/server/logger';

// The error classes moved to @shopkeeper/agent/errors (Track 4.1) so the shared
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
  ServiceUnavailableError,
} from '@shopkeeper/agent/errors';
export type { ApiErrorDetail } from '@shopkeeper/agent/errors';

type ProviderApiError = {
  name?: string;
  status?: number;
  message?: string;
  error?: { message?: string; type?: string };
};

function providerErrorResponse(error: unknown): { error: string; status: number; code: string } | null {
  if (!error || typeof error !== 'object') return null;

  const candidate = error as ProviderApiError;
  const isAnthropicError = (
    candidate.name === 'APIError'
    || candidate.name === 'AuthenticationError'
    || candidate.name === 'PermissionDeniedError'
    || candidate.name === 'RateLimitError'
    || candidate.name === 'BadRequestError'
    || candidate.name === 'InternalServerError'
  );
  if (!isAnthropicError) return null;

  const nestedMessage = candidate.error?.message?.trim();
  const detail = nestedMessage || candidate.message?.trim() || 'AI provider request failed';
  const status = typeof candidate.status === 'number' ? candidate.status : 503;
  const lower = detail.toLowerCase();

  if (lower.includes('credit balance') || lower.includes('insufficient credits')) {
    return {
      error: 'Anthropic API credits are exhausted. Add credits in the Anthropic console, then regenerate the plan.',
      status: 503,
      code: 'ai_provider_credits',
    };
  }

  if (status === 401 || candidate.error?.type === 'authentication_error' || lower.includes('invalid x-api-key')) {
    return {
      error: 'Anthropic API key is invalid or not configured. Update ANTHROPIC_API_KEY for the dashboard app.',
      status: 503,
      code: 'ai_provider_auth',
    };
  }

  if (status === 429) {
    return {
      error: `AI provider rate limit: ${detail}`,
      status: 429,
      code: 'ai_provider_rate_limit',
    };
  }

  return {
    error: `AI provider error: ${detail}`,
    status: status >= 400 && status < 600 ? status : 503,
    code: 'ai_provider_error',
  };
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
  const providerError = providerErrorResponse(error);
  if (providerError) {
    logger.error({ err: error, context, code: providerError.code }, '[api] ai provider error');
    return NextResponse.json(
      { error: providerError.error, code: providerError.code },
      { status: providerError.status },
    );
  }
  logger.error({ err: error }, `[${context}]`);
  return NextResponse.json({ error: message }, { status: 500 });
}
