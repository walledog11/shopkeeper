import express from 'express';
import { registerMetaWebhookRoutes } from './webhooks-meta.js';
import { registerEmailWebhookRoutes } from './webhooks-email.js';
import { registerTelegramWebhookRoutes } from './webhooks-telegram.js';
import { registerShopifyWebhookRoutes } from './webhooks-shopify.js';
import { registerTikTokShopWebhookRoutes } from './webhooks-tiktok-shop.js';
import { registerPhotonWebhookRoutes } from './webhooks-photon.js';
import { registerGmailWebhookRoutes } from './webhooks-gmail.js';

const router = express.Router();

registerMetaWebhookRoutes(router);
registerEmailWebhookRoutes(router);
registerTelegramWebhookRoutes(router);
registerShopifyWebhookRoutes(router);
registerTikTokShopWebhookRoutes(router);
registerPhotonWebhookRoutes(router);
registerGmailWebhookRoutes(router);

export default router;
