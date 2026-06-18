import express from 'express';
import { registerMetaWebhookRoutes } from './webhooks-meta.js';
import { registerEmailWebhookRoutes } from './webhooks-email.js';
import { registerTelegramWebhookRoutes } from './webhooks-telegram.js';
import { registerShopifyWebhookRoutes } from './webhooks-shopify.js';
import { registerPhotonWebhookRoutes } from './webhooks-photon.js';

export {
  recordWebhookSignatureFailure,
  buildWebhookSignatureRequestMetadata,
  type WebhookSignatureProvider,
  type WebhookSignatureFailureReason,
  type WebhookSignatureAlertDependencies,
  type WebhookSignatureAlertResult,
  type WebhookSignatureRequestMetadata,
} from './webhooks-signature-alerts.js';

const router = express.Router();

registerMetaWebhookRoutes(router);
registerEmailWebhookRoutes(router);
registerTelegramWebhookRoutes(router);
registerShopifyWebhookRoutes(router);
registerPhotonWebhookRoutes(router);

export default router;
