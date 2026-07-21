import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import type { OrgSettings } from '@shopkeeper/agent/types';
import { isDeliveryExceptionMonitorEnabled } from '../config/runtime-config.js';

export function isOrgDeliveryExceptionWatchEnabled(settings: unknown): boolean {
  if (!isDeliveryExceptionMonitorEnabled()) return false;
  const resolved = resolveAgentSettings(settings as Partial<OrgSettings> | null);
  return resolved.deliveryExceptionWatchEnabled !== false;
}
