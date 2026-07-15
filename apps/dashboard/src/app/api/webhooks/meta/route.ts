import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getGatewayBaseUrl } from '@/lib/server/gateway-url';

function verifyMetaWebhookSignature(signature: string | null, body: Buffer): boolean {
  const appSecret = (
    process.env.INSTAGRAM_WEBHOOK_APP_SECRET
    ?? process.env.INSTAGRAM_APP_SECRET
    ?? ''
  ).trim();
  if (!signature || !appSecret || !signature.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', appSecret).update(body).digest('hex')}`, 'utf8');
  const received = Buffer.from(signature, 'utf8');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function proxy(request: NextRequest, body?: Buffer) {
  const url = `${getGatewayBaseUrl({ required: true })}/webhooks/meta${request.nextUrl.search}`;

  const res = await fetch(url, {
    cache: 'no-store',
    redirect: 'manual',
    method: request.method,
    headers: request.headers,
    body: body ? new Uint8Array(body) : undefined,
  });

  const text = await res.text();
  return new NextResponse(text, { status: res.status });
}

export async function GET(request: NextRequest) {
  return proxy(request);
}

export async function POST(request: NextRequest) {
  const body = Buffer.from(await request.arrayBuffer());
  if (!verifyMetaWebhookSignature(request.headers.get('x-hub-signature-256'), body)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  return proxy(request, body);
}
