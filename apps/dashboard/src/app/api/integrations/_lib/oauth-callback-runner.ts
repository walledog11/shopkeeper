import type {
  IntegrationFailureCategory,
  IntegrationPlatform,
} from '@shopkeeper/analytics';
import type { OAuthErrorCode, OAuthProvider } from '@/lib/integrations/oauth-contract';
import logger from '@/lib/server/logger';
import {
  captureIntegrationConnectionCompleted,
  captureIntegrationConnectionFailed,
  captureOAuthIntegrationConnectionFailed,
} from '@/lib/server/product-analytics';
import { oauthCompleteResponse, resolveOAuthOrganization } from './oauth-callback';
import {
  validateOAuthCallbackSession,
  type OAuthCallbackSession,
} from './oauth-session';

export type OAuthCallbackCompletionResult<ErrorCode extends OAuthErrorCode = OAuthErrorCode> =
  | { ok: true; integrationId: string }
  | {
      ok: false;
      error: ErrorCode;
      failureCategory: IntegrationFailureCategory;
    };

export interface OAuthCallbackCompletionInput {
  code: string;
  organizationId: string;
  searchParams: URLSearchParams;
  session: OAuthCallbackSession;
}

export interface OAuthCallbackProviderDescriptor<ErrorCode extends OAuthErrorCode> {
  analyticsPlatform: IntegrationPlatform;
  appUrl: string;
  codeAliases?: readonly string[];
  extraSessionFields?: readonly string[];
  invalidCallbackError: ErrorCode;
  logPrefix: string;
  provider: OAuthProvider;
  serverError: ErrorCode;
  stateMismatchError: ErrorCode;
}

export async function runOAuthCallback<ErrorCode extends OAuthErrorCode>(options: {
  complete: (
    input: OAuthCallbackCompletionInput,
  ) => Promise<OAuthCallbackCompletionResult<ErrorCode>>;
  descriptor: OAuthCallbackProviderDescriptor<ErrorCode>;
  request: Request;
}): Promise<Response> {
  const { complete, descriptor, request } = options;
  const { searchParams } = new URL(request.url);
  const state = searchParams.get('state');
  const providerError = searchParams.get('error');
  const code = firstSearchParam(searchParams, descriptor.codeAliases ?? ['code']);

  // Providers can redirect a cancellation after the browser has lost its
  // correlation cookie. It is safe to report the cancellation, but there is no
  // attempt or organization to attribute it to.
  if (providerError && !state) {
    logger.warn({ error: providerError }, `[${descriptor.logPrefix}] User denied access`);
    return completeResponse(descriptor, { status: 'failed', error: 'access_denied' });
  }

  let callbackSession;
  try {
    callbackSession = await validateOAuthCallbackSession({
      extraCookieKeys: descriptor.extraSessionFields,
      logPrefix: descriptor.logPrefix,
      provider: descriptor.provider,
      state,
    });
  } catch (error) {
    logUnexpectedError(descriptor, error);
    return completeResponse(descriptor, {
      status: 'failed',
      error: descriptor.serverError,
    });
  }

  if (!callbackSession.ok) {
    await bestEffortAnalytics(descriptor, 'failure', () =>
      captureOAuthIntegrationConnectionFailed({
        ...callbackSession.analyticsContext,
        failureCategory: 'state_mismatch',
        platform: descriptor.analyticsPlatform,
      }));
    return navigationResponse(descriptor, callbackSession.navigation, {
      status: 'failed',
      error: descriptor.stateMismatchError,
    });
  }

  const session = callbackSession.session;
  let organizationId: string;
  try {
    const organization = await resolveOAuthOrganization(
      session.clerkOrgId,
      descriptor.logPrefix,
    );
    if (!organization.ok) {
      await bestEffortAnalytics(descriptor, 'failure', () =>
        captureOAuthIntegrationConnectionFailed({
          attemptId: session.attemptId,
          clerkOrganizationId: session.clerkOrgId,
          failureCategory: 'unknown',
          platform: descriptor.analyticsPlatform,
        }));
      return sessionResponse(descriptor, session, {
        status: 'failed',
        error: descriptor.serverError,
      });
    }
    organizationId = organization.org.id;
  } catch (error) {
    logUnexpectedError(descriptor, error);
    await bestEffortAnalytics(descriptor, 'failure', () =>
      captureOAuthIntegrationConnectionFailed({
        attemptId: session.attemptId,
        clerkOrganizationId: session.clerkOrgId,
        failureCategory: 'unknown',
        platform: descriptor.analyticsPlatform,
      }));
    return sessionResponse(descriptor, session, {
      status: 'failed',
      error: descriptor.serverError,
    });
  }

  if (providerError) {
    logger.warn({ error: providerError }, `[${descriptor.logPrefix}] User denied access`);
    await recordFailure(descriptor, session, organizationId, 'access_denied');
    return sessionResponse(descriptor, session, {
      status: 'failed',
      error: 'access_denied',
    });
  }

  if (!code) {
    await recordFailure(descriptor, session, organizationId, 'invalid_callback');
    return sessionResponse(descriptor, session, {
      status: 'failed',
      error: descriptor.invalidCallbackError,
    });
  }

  try {
    const result = await complete({ code, organizationId, searchParams, session });
    if (!result.ok) {
      await recordFailure(
        descriptor,
        session,
        organizationId,
        result.failureCategory,
      );
      return sessionResponse(descriptor, session, {
        status: 'failed',
        error: result.error,
      });
    }

    await bestEffortAnalytics(descriptor, 'completion', () =>
      captureIntegrationConnectionCompleted({
        integrationId: result.integrationId,
        organizationId,
        platform: descriptor.analyticsPlatform,
      }));
    return sessionResponse(descriptor, session, { status: 'connected' });
  } catch (error) {
    logUnexpectedError(descriptor, error);
    await recordFailure(descriptor, session, organizationId, 'unknown');
    return sessionResponse(descriptor, session, {
      status: 'failed',
      error: descriptor.serverError,
    });
  }
}

function firstSearchParam(searchParams: URLSearchParams, aliases: readonly string[]): string | null {
  for (const alias of aliases) {
    const value = searchParams.get(alias);
    if (value) return value;
  }
  return null;
}

function completeResponse(
  descriptor: OAuthCallbackProviderDescriptor<OAuthErrorCode>,
  outcome:
    | { status: 'connected' }
    | { status: 'failed'; error: OAuthErrorCode },
): Response {
  return oauthCompleteResponse(descriptor.appUrl, {
    outcome: { ...outcome, provider: descriptor.provider },
  });
}

function sessionResponse(
  descriptor: OAuthCallbackProviderDescriptor<OAuthErrorCode>,
  session: OAuthCallbackSession,
  outcome:
    | { status: 'connected' }
    | { status: 'failed'; error: OAuthErrorCode },
): Response {
  return oauthCompleteResponse(descriptor.appUrl, {
    outcome: { ...outcome, provider: descriptor.provider },
    mode: session.mode,
    returnTo: session.returnTo,
  });
}

function navigationResponse(
  descriptor: OAuthCallbackProviderDescriptor<OAuthErrorCode>,
  navigation: { mode: OAuthCallbackSession['mode']; returnTo: string | null } | undefined,
  outcome: { status: 'failed'; error: OAuthErrorCode },
): Response {
  if (!navigation) return completeResponse(descriptor, outcome);
  return oauthCompleteResponse(descriptor.appUrl, {
    outcome: { ...outcome, provider: descriptor.provider },
    mode: navigation.mode,
    returnTo: navigation.returnTo,
  });
}

async function recordFailure(
  descriptor: OAuthCallbackProviderDescriptor<OAuthErrorCode>,
  session: OAuthCallbackSession,
  organizationId: string,
  failureCategory: IntegrationFailureCategory,
): Promise<void> {
  await bestEffortAnalytics(descriptor, 'failure', () =>
    captureIntegrationConnectionFailed({
      attemptId: session.attemptId,
      failureCategory,
      organizationId,
      platform: descriptor.analyticsPlatform,
    }));
}

async function bestEffortAnalytics(
  descriptor: OAuthCallbackProviderDescriptor<OAuthErrorCode>,
  event: 'completion' | 'failure',
  capture: () => Promise<void>,
): Promise<void> {
  try {
    await capture();
  } catch (error) {
    logger.warn(
      {
        errorClass: error instanceof Error ? error.name : 'UnknownError',
        event,
        platform: descriptor.analyticsPlatform,
      },
      `[${descriptor.logPrefix}] Analytics capture failed`,
    );
  }
}

function logUnexpectedError(
  descriptor: OAuthCallbackProviderDescriptor<OAuthErrorCode>,
  error: unknown,
): void {
  logger.error(
    { errorClass: error instanceof Error ? error.name : 'UnknownError' },
    `[${descriptor.logPrefix}] Unexpected error`,
  );
}
