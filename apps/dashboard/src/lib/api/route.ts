import type { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getE2EAuthIdentity } from '@/lib/e2e-auth';
import { getOrCreateOrg } from '@/lib/server/org';
import { ConflictError, handleApiError, NotFoundError, UnauthorizedError } from '@/lib/api/errors';
import { assertOrgAdmin } from '@/lib/api/permissions';
import { assertBillingWriteAllowed } from '@shopkeeper/db/billing-write-gate';
import { recordCustomerDataAccess, type CustomerDataResource } from '@shopkeeper/db';
import logger from '@/lib/server/logger';
import { rateLimit, tooManyRequests } from '@/lib/server/rate-limit';

type Org = Awaited<ReturnType<typeof getOrCreateOrg>>;

export interface OrgRouteOptions {
  context: string;
  errorMessage: string;
  // Restrict this handler to Clerk org admins. See lib/api/permissions.ts for
  // which operations are admin-only and why.
  requireAdmin?: boolean;
  requireBillingWriteAllowed?: boolean;
  rateLimit?: { key: string; limit: number; windowSecs: number; scope?: 'user' | 'organization' };
  // Called from the catch before handleApiError so routes can record failure
  // side effects (e.g. agent-failure alerts) without re-wrapping the handler.
  onError?: (err: unknown, orgId: string | null) => Promise<void> | void;
  // The response shows protected customer data (names, contact details,
  // addresses, messages): a successful one records who read it in the customer
  // data access log. `idParam` (a route parameter) or `idQuery` (a search
  // parameter) names the record read.
  customerData?: { resource: CustomerDataResource; idParam?: string; idQuery?: string };
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
      // Before the billing gate and rate limit so a forbidden caller neither
      // learns the org's billing state nor spends its budget.
      if (options.requireAdmin) await assertOrgAdmin();
      if (org.lifecycleStatus !== 'active') throw new ConflictError('Workspace deletion is in progress.');
      if (options.requireBillingWriteAllowed) assertBillingWriteAllowed(org);
      if (options.rateLimit) {
        const { key, limit, windowSecs } = options.rateLimit;
        let identity = org.id;
        if (options.rateLimit.scope === 'user') {
          const userId = getE2EAuthIdentity()?.userId ?? (await auth()).userId;
          if (!userId) throw new UnauthorizedError();
          identity = `${org.id}:${userId}`;
        }
        const rl = await rateLimit(`${key}:${identity}`, limit, windowSecs);
        if (!rl.success) return tooManyRequests(rl.reset);
      }
      const params = (routeCtx ? await routeCtx.params : {}) as P;
      const req = request ?? new Request(PLACEHOLDER_REQUEST_URL);
      const response = await handler({ org, request: req, params });
      if (options.customerData && response.ok) {
        await recordMemberAccess(org.id, options.customerData, params, req);
      }
      return response;
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

// The access log must never cost the merchant the page: a failed write is
// logged and the response goes out.
async function recordMemberAccess(
  organizationId: string,
  customerData: NonNullable<OrgRouteOptions['customerData']>,
  params: unknown,
  request: Request,
): Promise<void> {
  try {
    const userId = getE2EAuthIdentity()?.userId ?? (await auth()).userId;
    const fromParam = customerData.idParam
      ? (params as Record<string, unknown> | null)?.[customerData.idParam]
      : undefined;
    const resourceId = typeof fromParam === 'string'
      ? fromParam
      : customerData.idQuery ? new URL(request.url).searchParams.get(customerData.idQuery) : null;
    await recordCustomerDataAccess({
      organizationId,
      actor: { type: 'member', id: userId ?? 'unknown' },
      resource: customerData.resource,
      resourceId,
    });
  } catch (err) {
    logger.error({ err, orgId: organizationId, resource: customerData.resource }, '[Access log] Could not record customer data access');
  }
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
