import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api/errors';
import { hasValidInternalSecret } from '@/lib/server/auth-utils';

export interface InternalRouteOptions<State> {
  context: string;
  errorMessage: string;
  createState?: () => State;
  onError?: (error: unknown, state: State) => Promise<void> | void;
}

export interface InternalRouteContext<State> {
  request: Request;
  state: State;
}

export function withInternalRoute<State = undefined>(
  options: InternalRouteOptions<State>,
  handler: (ctx: InternalRouteContext<State>) => Promise<Response> | Response,
) {
  return async function internalRoute(request: Request): Promise<Response> {
    const state = options.createState ? options.createState() : (undefined as State);

    try {
      if (!hasValidInternalSecret(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      return await handler({ request, state });
    } catch (error) {
      if (options.onError) {
        try {
          await options.onError(error, state);
        } catch {
          // Preserve the original route error.
        }
      }
      return handleApiError(error, options.context, options.errorMessage);
    }
  };
}
