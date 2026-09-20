import { describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '../test-helpers/json-response.js';
import { createSocialApiClient, SOCIALAPI_PRODUCTION_BASE_URL } from './client.js';

function client(fetchImpl: typeof fetch) {
  return createSocialApiClient({ apiKey: 'sapi_key_test', fetchImpl });
}

describe('SocialAPI client', () => {
  it('starts assigned-brand Instagram OAuth without exposing the API key in the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      auth_url: 'https://www.instagram.com/oauth/authorize?state=provider-state',
      state: 'provider-state',
    }, 202));

    await expect(client(fetchMock).beginInstagramConnect({
      brandId: 'brand-1',
      redirectUri: 'https://dashboard.test/api/integrations/instagram/callback',
    })).resolves.toMatchObject({ ok: true, data: { state: 'provider-state' } });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${SOCIALAPI_PRODUCTION_BASE_URL}/accounts/connect`);
    expect(url).not.toContain('sapi_key_test');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sapi_key_test' });
    expect(JSON.parse(String(init.body))).toEqual({
      brand_id: 'brand-1',
      platform: 'instagram',
      metadata: {},
      redirect_uri: 'https://dashboard.test/api/integrations/instagram/callback',
    });
  });

  it('exchanges the provider state and validates the Instagram account response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      account_id: 'acc-1',
      platform: 'instagram',
      username: 'merchant',
    }, 201));

    await expect(client(fetchMock).exchangeInstagramCode({
      code: 'one-time-code',
      redirectUri: 'https://dashboard.test/callback',
      state: 'provider-state',
    })).resolves.toEqual({
      ok: true,
      data: { accountId: 'acc-1', platform: 'instagram', username: 'merchant' },
      httpStatus: 201,
      requestId: null,
    });
  });

  it('resolves an account only inside the assigned brand', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      count: 1,
      data: [{
        id: 'acc-1',
        brand_id: 'brand-1',
        platform: 'instagram',
        username: 'merchant',
        name: 'Merchant',
        status: 'active',
        reconnect_reason: null,
      }],
    }));

    const api = client(fetchMock);
    await expect(api.getInstagramAccount({ accountId: 'acc-1', brandId: 'brand-1' }))
      .resolves.toMatchObject({ ok: true, data: { id: 'acc-1', brandId: 'brand-1' } });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get('brand_id')).toBe('brand-1');
  });

  it('sends text to the pinned conversation and account', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      message_id: 'message-1',
      message_ids: ['message-1'],
    }, { headers: { 'x-request-id': 'request-1' } }));

    await expect(client(fetchMock).sendInstagramText({
      accountId: 'acc-1',
      conversationId: 'conversation/1',
      text: 'Hello',
    })).resolves.toEqual({
      ok: true,
      data: { messageId: 'message-1', messageIds: ['message-1'] },
      httpStatus: 200,
      requestId: 'request-1',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${SOCIALAPI_PRODUCTION_BASE_URL}/inbox/conversations/conversation%2F1/messages`);
    expect(JSON.parse(String(init.body))).toEqual({ account_id: 'acc-1', text: 'Hello' });
  });

  it('lists bounded Instagram conversations and exposes identity fields for the spike', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [{
        id: 'conversation-1',
        account_id: 'acc-1',
        platform: 'instagram',
        platform_id: 'native-thread-1',
        participant_id: 'native-sender-1',
        participant_name: 'Customer',
        participant_picture: 'https://media.test/customer.jpg',
        last_message: 'Where is my order?',
        last_message_at: '2026-09-09T20:00:00Z',
        status: 'active',
      }],
      pagination: { has_more: true, next_cursor: 'next-page' },
    }));

    await expect(client(fetchMock).listInstagramConversations({ accountId: 'acc-1', limit: 10 }))
      .resolves.toEqual({
        ok: true,
        data: {
          data: [expect.objectContaining({
            id: 'conversation-1',
            platformId: 'native-thread-1',
            participantId: 'native-sender-1',
          })],
          hasMore: true,
          nextCursor: 'next-page',
        },
        httpStatus: 200,
        requestId: null,
      });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get('account_id')).toBe('acc-1');
    expect(url.searchParams.get('platform')).toBe('instagram');
    expect(url.searchParams.get('limit')).toBe('10');
  });

  it('lists conversation messages with provider and native ids for deduplication evidence', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [{
        id: 'sapi-message-1',
        conversation_id: 'conversation/1',
        platform_id: 'native-message-1',
        sender_id: 'native-sender-1',
        sender_name: 'Customer',
        direction: 'inbound',
        text: null,
        attachment_type: 'image',
        attachment_url: 'https://media.test/image.jpg',
        created_at: '2026-09-09T20:00:00Z',
      }],
      pagination: { has_more: false },
    }));

    await expect(client(fetchMock).listConversationMessages({
      conversationId: 'conversation/1',
      limit: 25,
    })).resolves.toMatchObject({
      ok: true,
      data: {
        data: [{
          id: 'sapi-message-1',
          conversationId: 'conversation/1',
          platformId: 'native-message-1',
          senderId: 'native-sender-1',
          attachmentType: 'image',
        }],
        hasMore: false,
        nextCursor: null,
      },
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${SOCIALAPI_PRODUCTION_BASE_URL}/inbox/conversations/conversation%2F1/messages?limit=25`,
    );
  });

  it('rejects unbounded inbox reads before calling the provider', async () => {
    const fetchMock = vi.fn();
    const api = client(fetchMock);
    await expect(api.listInstagramConversations({ accountId: 'acc', limit: 101 }))
      .resolves.toMatchObject({ ok: false, error: { category: 'validation' } });
    await expect(api.listConversationMessages({ conversationId: 'conversation', limit: 201 }))
      .resolves.toMatchObject({ ok: false, error: { category: 'validation' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists webhook configuration without requiring endpoint secrets', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      count: 1,
      data: [{
        id: 'webhook-1',
        url: 'https://gateway.test/webhooks/socialapi',
        events: ['dm.received', 'dm.sent'],
        is_active: true,
        created_at: '2026-09-09T20:00:00Z',
      }],
    }));

    await expect(client(fetchMock).listWebhookEndpoints()).resolves.toEqual({
      ok: true,
      data: [{
        id: 'webhook-1',
        url: 'https://gateway.test/webhooks/socialapi',
        events: ['dm.received', 'dm.sent'],
        isActive: true,
        createdAt: '2026-09-09T20:00:00Z',
      }],
      httpStatus: 200,
      requestId: null,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${SOCIALAPI_PRODUCTION_BASE_URL}/webhooks`);
  });

  it('does not call the provider for an empty or oversized message', async () => {
    const fetchMock = vi.fn();
    const api = client(fetchMock);
    await expect(api.sendInstagramText({ accountId: 'acc', conversationId: 'conversation', text: '' }))
      .resolves.toMatchObject({ ok: false, error: { category: 'validation' } });
    await expect(api.sendInstagramText({ accountId: 'acc', conversationId: 'conversation', text: 'é'.repeat(501) }))
      .resolves.toMatchObject({ ok: false, error: { category: 'validation' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts only a 204 disconnect response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(client(fetchMock).disconnectInstagramAccount('acc/1')).resolves.toEqual({
      ok: true,
      data: { disconnected: true },
      httpStatus: 204,
      requestId: null,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${SOCIALAPI_PRODUCTION_BASE_URL}/accounts/acc%2F1`);
  });

  it.each([
    [401, 'invalid_token', 'authentication'],
    [403, 'brand_scope_denied', 'isolation'],
    [403, 'outside_messaging_window', 'response_window'],
    [429, 'rate_limited', 'rate_limit'],
    [503, 'unavailable', 'transient_provider_failure'],
  ] as const)('classifies HTTP %s / %s as %s', async (status, code, category) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      error: { code, message: 'provider error', meta: {} },
    }, status));
    await expect(client(fetchMock).listInstagramAccounts('brand-1')).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ category, code, httpStatus: status }),
    });
  });

  it('fails closed on malformed success payloads and transport timeouts', async () => {
    const malformedFetch = vi.fn().mockResolvedValue(jsonResponse({ success: true }, 200));
    await expect(client(malformedFetch).sendInstagramText({
      accountId: 'acc', conversationId: 'conversation', text: 'Hello',
    })).resolves.toMatchObject({ ok: false, error: { category: 'validation' } });

    const timeoutFetch = vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    await expect(client(timeoutFetch).listInstagramAccounts('brand-1'))
      .resolves.toMatchObject({ ok: false, error: { category: 'transient_provider_failure' } });
  });

  it('rejects a non-HTTPS non-local base URL', () => {
    expect(() => createSocialApiClient({
      apiKey: 'key',
      baseUrl: 'http://provider.example/v1',
    })).toThrow('must use HTTPS');
  });
});
