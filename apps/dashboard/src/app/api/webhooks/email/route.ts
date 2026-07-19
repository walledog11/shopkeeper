import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import logger from '@/lib/server/logger';
import { getGatewayBaseUrl } from '@/lib/server/gateway-url';
import { fetchProviderWithDeadline } from '@/lib/server/provider-fetch';

// Postmark inbound email webhook — proxied to the gateway.
// In dev, Postmark can't reach localhost:8080 directly, so this
// Next.js route (exposed via ngrok on port 3000) forwards the request.
// Configure Postmark's inbound webhook URL to:
//   https://<ngrok-url>/api/webhooks/email
function verifyPostmarkBasicAuth(authorization: string | null): boolean {
  const username = process.env.POSTMARK_INBOUND_USERNAME;
  const password = process.env.POSTMARK_INBOUND_PASSWORD;
  if (!authorization || !username || !password || !authorization.startsWith('Basic ')) return false;

  const expected = Buffer.from(`${username}:${password}`, 'utf8');
  const received = Buffer.from(authorization.slice('Basic '.length), 'base64');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const authorization = request.headers.get('authorization');
    if (!verifyPostmarkBasicAuth(authorization)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const response = await fetchProviderWithDeadline(`${getGatewayBaseUrl({ required: true })}/webhooks/email/inbound`, {
      cache: 'no-store',
      redirect: 'manual',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization && { Authorization: authorization }),
      },
      body: JSON.stringify(body),
    }, {
      provider: 'gateway',
      operation: 'email webhook forwarding',
    });

    const text = await response.text();
    return new NextResponse(text, { status: response.status });
  } catch (error) {
    logger.error({ err: error }, '[Email Webhook Proxy] Failed to forward to gateway');
    return new NextResponse('Gateway unreachable', { status: 502 });
  }
}
