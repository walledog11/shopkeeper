import { getGatewayBaseUrl } from "@/lib/server/gateway-url";
import { fetchProviderWithDeadline } from "@/lib/server/provider-fetch";

export interface GatewayRuntimeFlags {
  monitors: {
    orderRisk: boolean;
    returnLifecycle: boolean;
    deliveryException: boolean;
  };
}

export async function fetchGatewayRuntimeFlags(): Promise<GatewayRuntimeFlags> {
  const base = getGatewayBaseUrl({ required: true });
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    throw new Error("[gateway/runtime-flags] INTERNAL_API_SECRET unset");
  }

  const res = await fetchProviderWithDeadline(`${base}/internal/runtime-flags`, {
    method: "GET",
    headers: {
      "x-internal-secret": secret,
    },
  }, {
    provider: "gateway",
    operation: "runtime-flags",
    timeoutMs: 5_000,
  });

  if (!res.ok) {
    throw new Error(`[gateway/runtime-flags] gateway returned ${res.status}`);
  }

  return await res.json() as GatewayRuntimeFlags;
}
