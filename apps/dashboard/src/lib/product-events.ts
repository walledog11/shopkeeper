export type ClientProductEvent =
  | {
      event: 'onboarding_step_completed';
      step: 'store' | 'shopify' | 'email' | 'autonomy' | 'plan';
    }
  | {
      event: 'integration_connection_started';
      platform: 'shopify' | 'email' | 'ig_dm' | 'imessage';
    };

export async function captureClientProductEvent(event: ClientProductEvent): Promise<void> {
  try {
    await fetch('/api/product-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true,
    });
  } catch {
    // Product analytics is best-effort and must not interrupt the user flow.
  }
}
