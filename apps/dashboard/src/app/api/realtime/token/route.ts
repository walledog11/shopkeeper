import { NextResponse } from 'next/server';
import { ApiError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';
import { mintRealtimeToken } from '@/lib/realtime/token';

// Mints a short-lived token the browser hands to the gateway SSE endpoint
// (/events?token=…). The token grants only an org-scoped subscription — no data
// flows over the channel — and is verified by the gateway with the shared
// INTERNAL_API_SECRET.
export const GET = withOrgRoute(
  {
    context: 'Realtime token GET',
    errorMessage: 'Failed to mint realtime token',
    rateLimit: { key: 'realtime:token', limit: 60, windowSecs: 60 },
  },
  async ({ org }) => {
    const secret = process.env.INTERNAL_API_SECRET;
    if (!secret) throw new ApiError('Realtime not configured', 503);

    const { token, expiresAt } = mintRealtimeToken(org.id, secret);
    return NextResponse.json({ token, expiresAt });
  },
);
