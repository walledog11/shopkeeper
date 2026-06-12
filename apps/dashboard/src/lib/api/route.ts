import type { NextRequest } from 'next/server';
import { getOrCreateOrg } from '@/lib/server/org';
import { handleApiError, NotFoundError } from '@/lib/api/errors';
import { assertBillingWriteAllowed } from '@/lib/billing/write-gate';
import { rateLimit, tooManyRequests } from '@/lib/server/rate-limit';

type Org = Awaited<ReturnType<typeof getOrCreateOrg>>;

export interface OrgRouteOptions {
  context: string;
  errorMessage: string;
  requireBillingWriteAllowed?: boolean;
  rateLimit?: { key: string; limit: number; windowSecs: number };
  // Called from the catch before handleApiError so routes can record failure
  // side effects (e.g. agent-failure alerts) without re-wrapping the handler.
  onError?: (err: unknown, orgId: string | null) => Promise<void> | void;
}

export interface OrgRouteContext<P> {
  org: Org;
  request: Request;
  params: P;
}

const PLACEHOLDER_REQUEST_URL = 'http://localhost/';

export function withOrgRoute<P = Record<string, never>>(
  options: OrgRouteOptions,
  handler: (ctx: OrgRouteContext<P>) => Promise<Response> | Response,
) {
  return async (
    request?: Request | NextRequest,
    // Loose typing here matches Next.js's generated route validator (params: Promise<{}>),
    // so the wrapper is assignable for both no-param and dynamic-segment routes.
    routeCtx?: { params: Promise<unknown> },
  ): Promise<Response> => {
    let orgId: string | null = null;
    try {
      const org = await getOrCreateOrg();
      orgId = org.id;
      if (options.requireBillingWriteAllowed) assertBillingWriteAllowed(org);
      if (options.rateLimit) {
        const { key, limit, windowSecs } = options.rateLimit;
        const rl = await rateLimit(`${key}:${org.id}`, limit, windowSecs);
        if (!rl.success) return tooManyRequests(rl.reset);
      }
      const params = (routeCtx ? await routeCtx.params : {}) as P;
      const req = request ?? new Request(PLACEHOLDER_REQUEST_URL);
      return await handler({ org, request: req, params });
    } catch (error) {
      if (options.onError) {
        try {
          await options.onError(error, orgId);
        } catch {
          // Swallow — onError must not mask the original error.
        }
      }
      return handleApiError(error, options.context, options.errorMessage);
    }
  };
}

export function assertEntityInOrg<T extends { organizationId: string } | null>(
  entity: T,
  orgId: string,
  message = 'Not found',
): asserts entity is Exclude<T, null> {
  if (!entity || entity.organizationId !== orgId) {
    throw new NotFoundError(message);
  }
}
