import { NextResponse } from 'next/server';
import logger from '@/lib/server/logger';
import { getGatewayBaseUrl } from '@/lib/server/gateway-url';

// Postmark inbound email webhook — proxied to the gateway.
// In dev, Postmark can't reach localhost:8080 directly, so this
// Next.js route (exposed via ngrok on port 3000) forwards the request.
// Configure Postmark's inbound webhook URL to:
//   https://<ngrok-url>/api/webhooks/email
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const authorization = request.headers.get('authorization');

    const response = await fetch(`${getGatewayBaseUrl({ required: true })}/webhooks/email/inbound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization && { Authorization: authorization }),
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    return new NextResponse(text, { status: response.status });
  } catch (error) {
    logger.error({ err: error }, '[Email Webhook Proxy] Failed to forward to gateway');
    return new NextResponse('Gateway unreachable', { status: 502 });
  }
}
