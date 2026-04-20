import { NextRequest, NextResponse } from 'next/server';

const GATEWAY_URL = process.env.GATEWAY_INTERNAL_URL || 'http://localhost:8080';

async function proxy(request: NextRequest) {
  const url = `${GATEWAY_URL}/webhooks/meta${request.nextUrl.search}`;
  const body = request.method === 'GET' ? undefined : await request.arrayBuffer();

  const res = await fetch(url, {
    method: request.method,
    headers: request.headers,
    body: body ? Buffer.from(body) : undefined,
  });

  const text = await res.text();
  return new NextResponse(text, { status: res.status });
}

export const GET = proxy;
export const POST = proxy;
