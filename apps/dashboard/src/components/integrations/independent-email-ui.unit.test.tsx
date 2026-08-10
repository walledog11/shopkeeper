import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { getIntegrationDefinition, type WorkspaceIntegrationDefinition } from '@/lib/integrations/catalog';
import type { Integration } from '@/types';
import { ConnectedAccountRow } from './ConnectedAccountRow';
import { ForwardingEmailDetails, type IntegrationCardCallbacks } from './IntegrationCardDetails';
import { deriveIntegrationCardModels } from './integration-presentation';
import { deriveIntegrationHealth } from './integration-card-helpers';

vi.mock('@/hooks/useOrg', () => ({
  useOrg: () => ({
    data: { id: 'org-id', inboundEmailDomain: 'inbound.example.test' },
  }),
}));

const EMAIL_CONFIG = getIntegrationDefinition('email') as WorkspaceIntegrationDefinition;
const GMAIL_CONFIG = getIntegrationDefinition('gmail') as WorkspaceIntegrationDefinition;
const FLAGS = {
  gmailNativeInboundEnabled: true,
  instagramIntegrationEnabled: true,
  tiktokShopConfigured: true,
  telegramBotUsername: null,
  imessageHandle: null,
};

function forwardingModel(integrations: Integration[]) {
  return deriveIntegrationCardModels({
    integrations,
    flags: FLAGS,
    isAdmin: true,
    definitions: [EMAIL_CONFIG],
  })[0];
}

const callbacks: IntegrationCardCallbacks = {
  connectForwardingEmail: vi.fn(async () => true),
  updateEmailAddress: vi.fn(async () => true),
  disconnect: vi.fn(async () => undefined),
  setDefaultEmail: vi.fn(async () => undefined),
  launchOAuth: vi.fn(),
  syncShopifyKnowledgeBase: vi.fn(async () => ({ syncedPolicies: 0, syncedPages: 0 })),
};

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
      <ForwardingEmailDetails model={forwardingModel([forwarding])} callbacks={{
        ...callbacks,
        setDefaultEmail: onSetDefaultEmail,
      }} />,
    );

    expect(html).toContain('Use for new emails');
    expect(html).toContain('support@example.test');
  });

  it('does not label disconnected forwarding as connected', () => {
    const html = renderToStaticMarkup(
      <ForwardingEmailDetails model={forwardingModel([])} callbacks={callbacks} />,
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

    expect(deriveIntegrationHealth(GMAIL_CONFIG, gmail, null, true).state).toBe('needs-attention');
    expect(deriveIntegrationHealth(EMAIL_CONFIG, forwarding, null, true)).toEqual({
      state: 'waiting',
      note: null,
      recoveryAction: null,
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
