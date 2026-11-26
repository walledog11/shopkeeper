import express from 'express';
import { registerMetaWebhookRoutes } from './webhooks-meta.js';
import { registerEmailWebhookRoutes } from './webhooks-email.js';
import { registerTelegramWebhookRoutes } from './webhooks-telegram.js';
import { registerShopifyWebhookRoutes } from './webhooks-shopify.js';
import { registerPhotonWebhookRoutes } from './webhooks-photon.js';
import { registerGmailWebhookRoutes } from './webhooks-gmail.js';
import { registerSocialApiWebhookRoutes } from './webhooks-socialapi.js';

const router = express.Router();

registerMetaWebhookRoutes(router);
registerEmailWebhookRoutes(router);
registerTelegramWebhookRoutes(router);
registerShopifyWebhookRoutes(router);
registerPhotonWebhookRoutes(router);
registerGmailWebhookRoutes(router);
registerSocialApiWebhookRoutes(router);

export default router;
