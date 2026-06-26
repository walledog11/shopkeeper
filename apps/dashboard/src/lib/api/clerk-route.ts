import type { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  ForbiddenError,
  UnauthorizedError,
  handleApiError,
} from './errors';

interface ClerkOrgRouteOptions {
  context: string;
  errorMessage: string;
  requireAdmin?: boolean;
  requireUser?: boolean;
  unauthorizedMessage?: string;
}

interface ClerkOrgRouteAuth {
  orgId: string;
  orgRole: string | null | undefined;
  userId: string | null;
}

interface ClerkOrgRouteContext {
  auth: ClerkOrgRouteAuth;
  request: Request;
}

const PLACEHOLDER_REQUEST_URL = 'http://localhost/';

export function withClerkOrgRoute(
  options: ClerkOrgRouteOptions,
  handler: (ctx: ClerkOrgRouteContext) => Promise<Response> | Response,
) {
  return async (request?: Request | NextRequest): Promise<Response> => {
    try {
      const session = await auth();
      if (!session.orgId || (options.requireUser !== false && !session.userId)) {
        throw new UnauthorizedError(options.unauthorizedMessage);
      }
      if (options.requireAdmin && session.orgRole !== 'org:admin') {
        throw new ForbiddenError('Admin role required');
      }

      return await handler({
        auth: {
          orgId: session.orgId,
          orgRole: session.orgRole,
          userId: session.userId ?? null,
        },
        request: request ?? new Request(PLACEHOLDER_REQUEST_URL),
      });
    } catch (error) {
      return handleApiError(error, options.context, options.errorMessage);
    }
  };
}
