import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FOLLOW_UP_DAYS,
  isOrgPostResolutionFollowUpEnabled,
  resolveFollowUpDays,
} from './post-resolution-followup-config.js';

describe('isOrgPostResolutionFollowUpEnabled', () => {
  it('is disabled when the global flag is off', () => {
    vi.stubEnv('POST_RESOLUTION_FOLLOWUP_MONITOR_ENABLED', 'false');
    expect(isOrgPostResolutionFollowUpEnabled({ postResolutionFollowUpEnabled: true })).toBe(false);
    vi.unstubAllEnvs();
  });

  it('defaults to enabled for orgs when the global flag is on', () => {
    vi.stubEnv('POST_RESOLUTION_FOLLOWUP_MONITOR_ENABLED', '1');
    expect(isOrgPostResolutionFollowUpEnabled({})).toBe(true);
    vi.unstubAllEnvs();
  });

  it('respects an explicit org opt-out', () => {
    vi.stubEnv('POST_RESOLUTION_FOLLOWUP_MONITOR_ENABLED', '1');
    expect(isOrgPostResolutionFollowUpEnabled({ postResolutionFollowUpEnabled: false })).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe('resolveFollowUpDays', () => {
  it('falls back to the default window when unset', () => {
    expect(resolveFollowUpDays({})).toBe(DEFAULT_FOLLOW_UP_DAYS);
  });

  it('respects a configured window', () => {
    expect(resolveFollowUpDays({ postResolutionFollowUpDays: 10 })).toBe(10);
  });

  it('ignores a non-positive window', () => {
    expect(resolveFollowUpDays({ postResolutionFollowUpDays: 0 })).toBe(DEFAULT_FOLLOW_UP_DAYS);
  });
});
