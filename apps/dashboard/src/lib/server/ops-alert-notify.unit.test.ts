import { describe, expect, it } from 'vitest';
import { buildOpsAlertScope } from '@shopkeeper/agent/observability';
import { buildOpsAlertCaptureContext } from './ops-alert-notify';

describe('buildOpsAlertCaptureContext', () => {
  it('carries the alert scope through to Sentry unchanged', () => {
    const input = {
      category: 'provider_send' as const,
      message: 'Meta sends are failing',
      tags: { provider: 'meta', channel: 'ig_dm' },
    };

    const context = buildOpsAlertCaptureContext(input, buildOpsAlertScope(input, 'dashboard'));

    expect(context).toEqual({
      level: 'warning',
      tags: {
        category: 'provider_send',
        service: 'dashboard',
        provider: 'meta',
        channel: 'ig_dm',
      },
      extra: {},
      fingerprint: ['ops-alert', 'provider_send', 'dashboard', 'provider:meta', 'channel:ig_dm'],
    });
  });

  // The Telegram push strips `extra` because an operator chat is not a private
  // surface (AUD-017). Sentry is, and the identifiers are what make an alert
  // actionable — so this path deliberately keeps them.
  it('keeps the tenant identifiers the Telegram push strips', () => {
    const input = {
      category: 'agent_failure' as const,
      message: 'Agent tool threw',
      level: 'error' as const,
      tags: { tool: 'send_reply', orgId: 'org_123' },
      extra: { threadId: 'thread_123' },
    };

    const context = buildOpsAlertCaptureContext(input, buildOpsAlertScope(input, 'dashboard'));

    expect(context.level).toBe('error');
    expect(context.tags).toMatchObject({ tool: 'send_reply', orgId: 'org_123' });
    expect(context.extra).toEqual({ threadId: 'thread_123' });
  });

  it('folds a truncated error detail into extra', () => {
    const input = {
      category: 'provider_cleanup' as const,
      message: 'Instagram disconnect failed',
      error: new Error('x'.repeat(400)),
    };

    const context = buildOpsAlertCaptureContext(input, buildOpsAlertScope(input, 'dashboard'));

    expect(context.extra.error).toBe('x'.repeat(300));
  });
});
