import express from 'express';
import { registerMetaWebhookRoutes } from './webhooks-meta.js';
import { registerEmailWebhookRoutes } from './webhooks-email.js';
import { registerTwilioWebhookRoutes } from './webhooks-twilio.js';
import { registerShopifyWebhookRoutes } from './webhooks-shopify.js';

export {
  recordWebhookSignatureFailure,
  type WebhookSignatureProvider,
  type WebhookSignatureFailureReason,
  type WebhookSignatureAlertDependencies,
  type WebhookSignatureAlertResult,
} from './webhooks-signature-alerts.js';

const router = express.Router();

registerMetaWebhookRoutes(router);
registerEmailWebhookRoutes(router);
registerTwilioWebhookRoutes(router);
registerShopifyWebhookRoutes(router);

export default router;