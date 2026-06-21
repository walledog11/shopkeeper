import { getGatewayBaseUrl } from '@/lib/server/gateway-url';

// The per-org Photon/Spectrum webhook URL the merchant pastes into their
// Spectrum project. The endpoint lives on the gateway (it owns the long-lived
// per-org Spectrum app), so it is built from the gateway base URL + the
// integration id. Returns null when the gateway URL is not configured.
export function buildPhotonWebhookUrl(integrationId: string): string | null {
  const base = getGatewayBaseUrl();
  return base ? `${base}/webhooks/photon/${integrationId}` : null;
}
