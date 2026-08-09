import { CHANNEL } from '../constants.js';
import type { DbChannelType } from '@shopkeeper/db';

export function formatChannelLabel(channelType: DbChannelType): string {
  return channelType === CHANNEL.IG_DM
    ? 'Instagram DM'
    : channelType === CHANNEL.TIKTOK
      ? 'TikTok Shop'
    // Without a case here the fallback title-cases the enum member and shows the
    // merchant "Shopify_chat", which is a database value, not a place.
    : channelType === CHANNEL.SHOPIFY_CHAT
      ? 'storefront chat'
    : channelType.charAt(0).toUpperCase() + channelType.slice(1);
}
