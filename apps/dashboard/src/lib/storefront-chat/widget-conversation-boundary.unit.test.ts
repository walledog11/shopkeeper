/**
 * @vitest-environment jsdom
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const widgetSourcePath = resolve(
  process.cwd(),
  '../../extensions/shopkeeper-chat/assets/shopkeeper-chat.js',
);

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as Response;
}

async function flushPromises() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe('storefront widget conversation boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.textContent = '';
  });

  it('marks a rollover and does not let an old optimistic echo suppress new-episode text', async () => {
    document.body.innerHTML = `
      <div
        id="shopkeeper-chat-root"
        data-proxy="/apps/shopkeeper-chat"
        data-shop="example.myshopify.com"
      ></div>
    `;

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    let postCount = 0;
    let getCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/bootstrap')) {
        return response({
          token: 'session-token',
          sessionId: 'session-1',
          messages: [{ id: 'old-agent', text: 'How can I help?', from: 'agent', at: null }],
        });
      }
      if (url.endsWith('/messages') && init?.method === 'POST') {
        postCount += 1;
        return response({ accepted: true, isNewThread: postCount === 2 }, 202);
      }
      if (url.endsWith('/messages')) {
        getCount += 1;
        const messages = [
          { id: 'new-customer', text: 'Repeat', from: 'customer', at: null },
        ];
        if (getCount > 1) {
          messages.push({ id: 'other-tab', text: 'Repeat', from: 'customer', at: null });
        }
        return response({ messages });
      }
      throw new Error(`Unexpected widget request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    let poll: (() => void) | undefined;
    vi.spyOn(window, 'setInterval').mockImplementation((handler) => {
      poll = handler as () => void;
      return undefined as unknown as ReturnType<typeof setInterval>;
    });
    vi.spyOn(window, 'setTimeout').mockImplementation(
      () => undefined as unknown as ReturnType<typeof setTimeout>,
    );

    const widgetSource = await readFile(widgetSourcePath, 'utf8');
    window.eval(widgetSource);

    const root = document.getElementById('shopkeeper-chat-root');
    const shadow = root?.shadowRoot;
    expect(shadow).not.toBeNull();
    (shadow?.querySelector('.launcher') as HTMLButtonElement).click();
    await flushPromises();

    const form = shadow?.querySelector('.composer') as HTMLFormElement;
    const input = shadow?.querySelector('.composer textarea') as HTMLTextAreaElement;
    input.value = 'Repeat';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    input.value = 'Repeat';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    const divider = shadow?.querySelector('.conversation-boundary');
    expect(divider?.textContent).toBe('New conversation');
    expect(divider?.getAttribute('role')).toBe('separator');

    const log = shadow?.querySelector('.log') as HTMLElement;
    const customerMessages = Array.from(log.querySelectorAll('.msg.me'));
    expect(Array.from(log.children).indexOf(divider as Element)).toBeLessThan(
      Array.from(log.children).indexOf(customerMessages[1]!),
    );

    expect(poll).toBeTypeOf('function');
    poll?.();
    await flushPromises();
    poll?.();
    await flushPromises();

    expect(Array.from(log.querySelectorAll('.msg.me .bubble'), (bubble) => bubble.textContent)).toEqual([
      'Repeat',
      'Repeat',
      'Repeat',
    ]);
  });
});
