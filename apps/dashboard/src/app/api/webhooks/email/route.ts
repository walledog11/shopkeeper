import { NextResponse } from 'next/server';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8080';

// Postmark inbound email webhook — proxied to the gateway.
// In dev, Postmark can't reach localhost:8080 directly, so this
// Next.js route (exposed via ngrok on port 3000) forwards the request.
// Configure Postmark's inbound webhook URL to:
//   https://<ngrok-url>/api/webhooks/email
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const response = await fetch(`${GATEWAY_URL}/webhooks/email/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    return new NextResponse(text, { status: response.status });
  } catch (error) {
    console.error('[Email Webhook Proxy] Failed to forward to gateway:', error);
    return new NextResponse('Gateway unreachable', { status: 502 });
  }
}
