import type { DbChannelType } from '@shopkeeper/db';
import { BadRequestError } from '@/lib/api/errors';
import { requireJsonObject } from '@/lib/api/body';
import { CHANNEL_TYPE } from '@shopkeeper/agent/thread-constants';

type ChannelTypeValue = (typeof CHANNEL_TYPE)[keyof typeof CHANNEL_TYPE];

export function parseCreateIntegrationBody(body: unknown) {
  const candidate = requireJsonObject(body, { message: 'Validation failed' });
  const { platform, externalAccountId, fromEmail } = candidate;

  if (!platform || !externalAccountId) {
    throw new BadRequestError('Missing platform or externalAccountId');
  }

  if (typeof platform !== 'string' || !Object.values(CHANNEL_TYPE).includes(platform as ChannelTypeValue)) {
    throw new BadRequestError('Invalid platform');
  }

  return {
    platform: platform as DbChannelType,
    externalAccountId,
    fromEmail,
  };
}
