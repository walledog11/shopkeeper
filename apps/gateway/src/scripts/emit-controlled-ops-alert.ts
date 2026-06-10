import { loadGatewayEnv } from '../config/load-env.js';
import { getGatewayOpsAlertConfig } from '../config/runtime-config.js';
import { getOpsAlertCounterClient } from '../ops-alert-counter.js';
import { emitOpsAlert } from '../ops-alerts.js';
import { recordWebhookSignatureFailure } from '../routes/webhooks-signature-alerts.js';
import { closeGatewayRedisConnections } from '../clients/redis-client.js';

loadGatewayEnv();

const VALID_CATEGORIES = ['queue_health', 'webhook_signature'] as const;
type ControlledCategory = typeof VALID_CATEGORIES[number];

function parseCategory(raw: string | undefined): ControlledCategory {
  const value = raw?.trim();
  if (!value || !VALID_CATEGORIES.includes(value as ControlledCategory)) {
    throw new Error(`Usage: npx tsx src/scripts/emit-controlled-ops-alert.ts <${VALID_CATEGORIES.join('|')}>`);
  }
  return value as ControlledCategory;
}

function validationConfig() {
  const base = getGatewayOpsAlertConfig();
  return {
    ...base,
    enabled: true,
    windowSecs: 60,
    webhookSignatureThreshold: 1,
    queueFailedThreshold: 1,
    queueWaitingThreshold: 1,
  };
}

async function emitQueueHealthAlert(): Promise<void> {
  const config = validationConfig();
  const result = emitOpsAlert({
    category: 'queue_health',
    message: 'Controlled alert validation: queue_health',
    level: 'warning',
    service: 'gateway',
    tags: { queue: 'inbound' },
    fingerprint: ['ops-alert', 'queue_health', 'gateway', 'queue:inbound', 'metric:validation'],
    extra: {
      validation: true,
      metric: 'validation',
      queue: 'inbound',
      threshold: 1,
      windowSecs: config.windowSecs,
    },
  }, { config });

  console.log(JSON.stringify({ category: 'queue_health', ...result }, null, 2));
}

async function emitWebhookSignatureAlert(): Promise<void> {
  const config = validationConfig();
  const counterClient = getOpsAlertCounterClient();
  const result = await recordWebhookSignatureFailure('shopify', 'missing_signature', {
    counterClient,
    config,
    route: '/webhooks/shopify',
    request: {
      method: 'POST',
      path: '/webhooks/shopify',
      userAgent: 'shopkeeper-controlled-validation/1.0',
      contentType: 'application/json',
      requestId: 'controlled-validation',
      ip: null,
    },
  });

  console.log(JSON.stringify({ category: 'webhook_signature', emitted: result.emitted, window: result.window }, null, 2));
}

async function main(): Promise<void> {
  const category = parseCategory(process.argv[2]);

  try {
    if (category === 'queue_health') {
      await emitQueueHealthAlert();
      return;
    }

    await emitWebhookSignatureAlert();
  } finally {
    await closeGatewayRedisConnections();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
