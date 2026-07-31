import { describe, expect, it } from 'vitest';
import { buildOpsAlertScope } from '@shopkeeper/agent/observability';
import { formatOpsAlertMessage } from './ops-alert-notify.js';

describe('formatOpsAlertMessage', () => {
  it('leads with the level and message, then the operator-facing tags', () => {
    const input = {
      category: 'queue_health' as const,
      message: 'Inbound jobs are stuck',
      tags: { queue: 'inbound' },
    };

    const text = formatOpsAlertMessage(input, buildOpsAlertScope(input, 'gateway'));

    expect(text).toBe([
      '[WARN] Inbound jobs are stuck',
      'category=queue_health service=gateway queue=inbound',
    ].join('\n'));
  });

  // /health/queues is behind auth because it exposes tenant identifiers
  // (AUD-017). The alert push must not become the leak that route isn't.
  it('never carries tenant identifiers from tags or extra', () => {
    const input = {
      category: 'agent_failure' as const,
      message: 'Agent tool threw',
      level: 'error' as const,
      tags: { tool: 'send_reply', orgId: 'org_secret', threadId: 'thread_secret' },
      extra: { customerEmail: 'shopper@example.com', orderId: '6127770140906' },
    };

    const text = formatOpsAlertMessage(input, buildOpsAlertScope(input, 'gateway'));

    expect(text).toContain('[ERROR] Agent tool threw');
    expect(text).toContain('tool=send_reply');
    expect(text).not.toContain('org_secret');
    expect(text).not.toContain('thread_secret');
    expect(text).not.toContain('shopper@example.com');
    expect(text).not.toContain('6127770140906');
  });

  it('appends a truncated error detail when one is present', () => {
    const input = {
      category: 'provider_send' as const,
      message: 'Postmark sends are failing',
      tags: { provider: 'postmark' },
      error: new Error('x'.repeat(400)),
    };

    const text = formatOpsAlertMessage(input, buildOpsAlertScope(input, 'gateway'));

    expect(text.endsWith('x'.repeat(300))).toBe(true);
  });
});
