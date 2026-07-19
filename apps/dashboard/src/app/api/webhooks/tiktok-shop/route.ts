import { NextRequest, NextResponse } from "next/server";
import logger from "@/lib/server/logger";
import { getGatewayBaseUrl } from "@/lib/server/gateway-url";
import { fetchProviderWithDeadline } from "@/lib/server/provider-fetch";

export async function POST(request: NextRequest) {
  try {
    const body = Buffer.from(await request.arrayBuffer());
    const response = await fetchProviderWithDeadline(`${getGatewayBaseUrl({ required: true })}/webhooks/tiktok-shop`, {
      cache: "no-store",
      redirect: "manual",
      method: "POST",
      headers: request.headers,
      body: new Uint8Array(body),
    }, {
      provider: "gateway",
      operation: "TikTok Shop webhook forwarding",
    });

    const text = await response.text();
    return new NextResponse(text, { status: response.status });
  } catch (error) {
    logger.error({ err: error }, "[TikTok Shop Webhook Proxy] Failed to forward to gateway");
    return new NextResponse("Gateway unreachable", { status: 502 });
  }
}
