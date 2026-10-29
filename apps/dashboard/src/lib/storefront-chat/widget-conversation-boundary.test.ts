/**
 * @vitest-environment jsdom
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const widgetSourcePath = resolve(
  process.cwd(),
  '../../extensions/shopkeeper-chat/assets/shopkeeper-chat.js',
);
const fakeTimer = 1 as unknown as ReturnType<typeof setTimeout>;

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as Response;
}

async function flushPromises() {
  for (let index = 0; index < 30; index += 1) await Promise.resolve();
}

describe('storefront widget delivery and conversation boundaries', () => {
  beforeEach(() => {
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

  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.textContent = '';
    localStorage.clear();
  });

  it('preserves a draft during bootstrap and retries an uncertain send with the same id', async () => {
    let finishBootstrap!: (response: Response) => void;
    const bootstrapping = new Promise<Response>(resolve => { finishBootstrap = resolve; });
    const sent: { text: string; clientMessageId: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/bootstrap')) return bootstrapping;
      if (init?.method === 'POST') {
        sent.push(JSON.parse(String(init.body)));
        if (sent.length === 1) throw new Error('response lost');
        return response({ accepted: true }, 202);
      }
      return response({ messages: [
        { id: 'echo', from: 'customer', text: 'First question', clientMessageId: sent[0].clientMessageId },
        { id: 'other-tab', from: 'customer', text: 'First question', clientMessageId: 'different-id' },
      ] });
    }));
    let poll!: () => void;
    vi.spyOn(window, 'setInterval').mockImplementation(handler => { poll = handler as () => void; return fakeTimer; });
    vi.spyOn(window, 'setTimeout').mockImplementation(() => fakeTimer);
    window.eval(await readFile(widgetSourcePath, 'utf8'));
    const shadow = document.getElementById('shopkeeper-chat-root')!.shadowRoot!;
    (shadow.querySelector('.launcher') as HTMLButtonElement).click();
    const form = shadow.querySelector('.composer') as HTMLFormElement;
    const input = shadow.querySelector('textarea') as HTMLTextAreaElement;
    const submit = () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    input.value = 'First question';
    submit();
    expect(input.value).toBe('First question');
    expect(sent).toHaveLength(0);
    finishBootstrap(response({ sessionId: 's1', token: 't1', messages: [] }));
    await flushPromises();
    submit();
    await flushPromises();
    expect(input.value).toBe('First question');
    expect(shadow.querySelector('.retry-send')).not.toBeNull();
    submit();
    await flushPromises();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect(input.value).toBe('');
    poll();
    await flushPromises();
    expect(shadow.querySelectorAll('.msg.me')).toHaveLength(2);
    expect(shadow.querySelector('.retry-send')).toBeNull();
  });

  it('distinguishes a slow reply from a handoff and stops composing when the session expires', async () => {
    let expired = false;
    let escalated = false;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/bootstrap')) return response({ sessionId: 's1', token: 't1', messages: [] });
      if (init?.method === 'POST') return response({ accepted: true }, 202);
      return response({ messages: [], escalated }, expired ? 404 : 200);
    }));
    let poll!: () => void;
    let waiting!: () => void;
    vi.spyOn(window, 'setInterval').mockImplementation(handler => { poll = handler as () => void; return fakeTimer; });
    vi.spyOn(window, 'setTimeout').mockImplementation((handler, delay) => {
      if (delay === 20_000) waiting = handler as () => void;
      return fakeTimer;
    });
    window.eval(await readFile(widgetSourcePath, 'utf8'));
    const shadow = document.getElementById('shopkeeper-chat-root')!.shadowRoot!;
    (shadow.querySelector('.launcher') as HTMLButtonElement).click();
    await flushPromises();
    const input = shadow.querySelector('textarea') as HTMLTextAreaElement;
    input.value = 'Question';
    shadow.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();
    waiting();
    expect(shadow.querySelector('.log')!.textContent).toContain('Still waiting');
    expect(shadow.querySelector('.log')!.textContent).not.toContain('passed to the shop');
    escalated = true;
    poll();
    await flushPromises();
    expect(shadow.querySelector('.log')!.textContent).toContain('passed to the shop');
    expect(shadow.querySelector('.log')!.textContent).not.toContain('Still waiting');
    input.value = 'Unsent draft';
    expired = true;
    poll();
    await flushPromises();
    expect((shadow.querySelector('.composer button') as HTMLButtonElement).disabled).toBe(true);
    expect(shadow.querySelector('.connection-status')!.textContent).toContain('chat has ended');
    expect(input.value).toBe('Unsent draft');
  });

  it('marks a rollover and does not let an old optimistic echo suppress new-episode text', async () => {
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
