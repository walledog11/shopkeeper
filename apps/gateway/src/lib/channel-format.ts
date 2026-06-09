import { CHANNEL } from '../constants.js';
import type { DbChannelType } from '@shopkeeper/db';

export function formatChannelLabel(channelType: DbChannelType): string {
  return channelType === CHANNEL.IG_DM
    ? 'Instagram DM'
    : channelType.charAt(0).toUpperCase() + channelType.slice(1);
}
