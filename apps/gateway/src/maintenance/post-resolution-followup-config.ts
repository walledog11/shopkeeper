import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import type { OrgSettings } from '@shopkeeper/agent/types';
import { isPostResolutionFollowUpMonitorEnabled } from '../config/runtime-config.js';

export const DEFAULT_FOLLOW_UP_DAYS = 5;

export function isOrgPostResolutionFollowUpEnabled(settings: unknown): boolean {
  if (!isPostResolutionFollowUpMonitorEnabled()) return false;
  const resolved = resolveAgentSettings(settings as Partial<OrgSettings> | null);
  return resolved.postResolutionFollowUpEnabled !== false;
}

export function resolveFollowUpDays(settings: unknown): number {
  const resolved = resolveAgentSettings(settings as Partial<OrgSettings> | null);
  const days = resolved.postResolutionFollowUpDays;
  return typeof days === 'number' && days > 0 ? days : DEFAULT_FOLLOW_UP_DAYS;
}
