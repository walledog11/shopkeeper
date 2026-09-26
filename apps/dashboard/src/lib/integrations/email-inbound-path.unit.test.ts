import { describe, expect, it } from 'vitest';

import type { Integration } from '@/types';
import { dualInboundDeliveryMessage, assessWorkspaceEmailInbound } from './email-inbound-path';

function emailIntegration(
  emailProvider: 'gmail' | 'postmark',
  metadata: Record<string, unknown>,
): Integration {
  return {
    id: `${emailProvider}-id`,
    organizationId: 'org-id',
    platform: 'email',
    emailProvider,
    externalAccountId: 'support@example.com',
    fromEmail: 'support@example.com',
    tokenExpiresAt: null,
    createdAt: new Date().toISOString(),
    metadata,
  };
}

describe('email-inbound-path', () => {
  it('surfaces dual delivery copy when Gmail watch and forwarding are both active', () => {
    const assessment = assessWorkspaceEmailInbound([
      emailIntegration('gmail', { provider: 'gmail', gmail: { inboundStatus: 'active' } }),
      emailIntegration('postmark', { provider: 'postmark' }),
    ]);

    expect(dualInboundDeliveryMessage(assessment)).toMatch(/both active/i);
  });
});
