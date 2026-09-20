import { verifyRealtimeToken as verifyRealtimeTokenWithSecret } from '@shopkeeper/shared/realtime';
import { getInternalApiSecret } from '../config/env.js';

export function verifyRealtimeToken(token: string | undefined | null): string | null {
  return verifyRealtimeTokenWithSecret(token, getInternalApiSecret());
}
