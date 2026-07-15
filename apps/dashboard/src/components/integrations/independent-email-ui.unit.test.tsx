import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PLATFORM_CONFIG } from '@/lib/integrations/catalog';
import type { Integration } from '@/types';
import { ConnectedAccountRow } from './ConnectedAccountRow';
import { IntegrationActionsSection } from './IntegrationConfigureSections';
import { deriveIntegrationHealth } from './integration-card-helpers';

vi.mock('@/hooks/useOrg', () => ({
  useOrg: () => ({
    data: { id: 'org-id', inboundEmailDomain: 'inbound.example.test' },
  }),
}));

const EMAIL_CONFIG = PLATFORM_CONFIG.find((config) => config.id === 'email')!;

describe('independent email integration UI', () => {
  it('shows both connected addresses and marks only the selected default', () => {
    const gmail = integration({
      id: 'gmail-id',
      emailProvider: 'gmail',
      externalAccountId: 'merchant@gmail.test',
      isDefaultEmail: true,
    });
    const forwarding = integration({
      id: 'postmark-id',
      emailProvider: 'postmark',
      externalAccountId: 'support@example.test',
      isDefaultEmail: false,
    });

    const html = renderToStaticMarkup(
      <>
        <ConnectedAccountRow connectType="email" integration={gmail} />
        <ConnectedAccountRow connectType="email" integration={forwarding} />
      </>,
    );

    expect(html).toContain('merchant@gmail.test');
    expect(html).toContain('support@example.test');
    expect(html.match(/Default/g)).toHaveLength(1);
    expect(html.match(/Connected/g)).toHaveLength(1);
  });

  it('offers default switching only on a connected non-default provider', () => {
    const forwarding = integration({
      id: 'postmark-id',
      emailProvider: 'postmark',
      externalAccountId: 'support@example.test',
      isDefaultEmail: false,
    });
    const onSetDefaultEmail = vi.fn();

    const html = renderToStaticMarkup(
      <IntegrationActionsSection
        config={EMAIL_CONFIG}
        connected={[forwarding]}
        kbSyncing={false}
        kbSyncResult={null}
        onReauthorize={() => undefined}
        onKbSync={() => undefined}
        onDisconnect={() => undefined}
        onSetDefaultEmail={onSetDefaultEmail}
        email="support@example.test"
        setEmail={() => undefined}
        emailLoading={false}
        onEmailSave={() => undefined}
      />,
    );

    expect(html).toContain('Use for new emails');
    expect(html).toContain('support@example.test');
  });

  it('does not label disconnected forwarding as connected', () => {
    const html = renderToStaticMarkup(
      <IntegrationActionsSection
        config={EMAIL_CONFIG}
        connected={[]}
        kbSyncing={false}
        kbSyncResult={null}
        onReauthorize={() => undefined}
        onKbSync={() => undefined}
        onDisconnect={() => undefined}
        email=""
        setEmail={() => undefined}
        emailLoading={false}
        onEmailSave={() => undefined}
      />,
    );

    expect(html).toContain('Forwarding address');
    expect(html).not.toContain('Connected');
  });

  it('does not apply Gmail degradation to the forwarded Email card', () => {
    const gmail = integration({
      emailProvider: 'gmail',
      metadata: {
        provider: 'gmail',
        oauthScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
        gmail: { inboundStatus: 'degraded' },
      },
    });
    const forwarding = integration({ emailProvider: 'postmark' });

    expect(deriveIntegrationHealth('email', [gmail], null, true).state).toBe('needs-attention');
    expect(deriveIntegrationHealth('email', [forwarding], null, true)).toEqual({
      state: 'waiting',
      note: null,
      canFix: false,
    });
  });
});

function integration(overrides: Partial<Integration>): Integration {
  return {
    id: 'integration-id',
    organizationId: 'org-id',
    platform: 'email',
    emailProvider: 'postmark',
    externalAccountId: 'support@example.test',
    fromEmail: null,
    tokenExpiresAt: null,
    metadata: { provider: 'postmark' },
    createdAt: '2026-07-13T00:00:00.000Z',
    ...overrides,
  };
}
