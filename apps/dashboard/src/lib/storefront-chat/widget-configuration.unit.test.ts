/** @vitest-environment jsdom */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CHAT_SETTINGS } from './configuration';

const source = await readFile(resolve(process.cwd(), '../../extensions/shopkeeper-chat/assets/shopkeeper-chat.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const response = (value: unknown) => ({ ok: true, json: async () => value });

beforeEach(() => {
  document.body.innerHTML = '<input id="merchant-field"><div id="shopkeeper-chat-root" data-config-url="/config" data-panel-title="Legacy title" data-accent="#334455" data-shop-name="My store" data-proxy="/chat"><span hidden></span></div>';
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn() }));
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); document.body.textContent = '';
});

describe('storefront presentation configuration', () => {
  it('mounts published settings before displaying a launcher without opening a session', async () => {
    const fetch = vi.fn(async () => response({ enabled: true, configuration: { settings: {
      ...DEFAULT_CHAT_SETTINGS, title: 'Merchant support', accentColor: '#ffffff', launcherStyle: 'icon',
      position: 'left', offsetX: 32, showOnMobile: false,
    } } }));
    vi.stubGlobal('fetch', fetch);
    window.eval(source);
    const root = document.getElementById('shopkeeper-chat-root')!;
    expect(root.shadowRoot).toBeNull();
    await flush();
    expect(root.shadowRoot!.querySelector('h2')!.textContent).toBe('Merchant support');
    expect(root.dataset).toMatchObject({ position: 'left', launcherStyle: 'icon', showMobile: 'false' });
    expect(root.style.getPropertyValue('--sk-offset-x')).toBe('32px');
    expect(root.style.getPropertyValue('--sk-accent-text')).toBe('#000000');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/config', expect.objectContaining({ cache: 'no-store' }));
  });

  it('keeps existing theme settings until the first dashboard publish', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ enabled: true, configuration: null })));
    window.eval(source); await flush();
    const root = document.getElementById('shopkeeper-chat-root')!;
    expect(root.shadowRoot!.querySelector('h2')!.textContent).toBe('Legacy title');
    expect(root.style.getPropertyValue('--sk-accent')).toBe('#334455');
    expect(root.style.getPropertyValue('--sk-accent-text')).toBe('#ffffff');
  });

  it('does not treat the welcome message as a previous conversation on the first send', async () => {
    vi.spyOn(window, 'setInterval').mockReturnValue(1 as unknown as ReturnType<typeof setInterval>);
    vi.spyOn(window, 'setTimeout').mockReturnValue(1 as unknown as ReturnType<typeof setTimeout>);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/config') return response({ enabled: true, configuration: { settings: DEFAULT_CHAT_SETTINGS } });
      if (url.endsWith('/bootstrap')) return response({ sessionId: 'test', token: 'test', messages: [] });
      return response({ accepted: true, isNewThread: true });
    }));
    window.eval(source); await flush();
    const shadow = document.getElementById('shopkeeper-chat-root')!.shadowRoot!;
    shadow.querySelector<HTMLButtonElement>('.launcher')!.click(); await flush();
    expect(shadow.querySelector('[data-welcome]')!.textContent).toContain(DEFAULT_CHAT_SETTINGS.greeting);
    shadow.querySelector<HTMLTextAreaElement>('textarea')!.value = 'My first question';
    shadow.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(shadow.querySelector('.conversation-boundary')).toBeNull();
  });

  it.each(['disabled', 'failed'])('keeps chat hidden when configuration is %s', async outcome => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (outcome === 'failed') throw new Error('offline');
      return response({ enabled: false });
    }));
    window.eval(source); await flush();
    expect(document.getElementById('shopkeeper-chat-root')!.shadowRoot).toBeNull();
  });

  it('previews messages and verification with the real renderer without network calls or stealing focus', async () => {
    const root = document.getElementById('shopkeeper-chat-root')!;
    delete root.dataset.configUrl;
    root.dataset.preview = '1';
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    window.eval(source);
    const merchantField = document.getElementById('merchant-field')!;
    merchantField.focus();
    const update = (scene: string) => root.dispatchEvent(new CustomEvent('shopkeeper:preview', { detail: {
      settings: { ...DEFAULT_CHAT_SETTINGS, title: '<img src=x onerror=alert(1)>' }, scene,
    } }));
    update('conversation');
    const shadow = root.shadowRoot!;
    expect(shadow.querySelector('h2')!.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(shadow.querySelector('h2 img')).toBeNull();
    expect(shadow.querySelectorAll('.msg.me')).toHaveLength(1);
    expect(document.activeElement).toBe(merchantField);
    update('verification');
    expect(shadow.querySelector('.card')!.textContent).toContain('Order number');
    expect(document.activeElement).toBe(merchantField);
    const fields = shadow.querySelectorAll<HTMLInputElement>('.card input');
    fields[0].value = '#1025'; fields[1].value = 'test@example.com';
    shadow.querySelector<HTMLButtonElement>('.card button')!.click(); await flush();
    expect(shadow.querySelector('.card')!.textContent).toContain('Enter your code');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('closes an open panel without locking page scroll when resizing into a hidden placement', () => {
    const media = { matches: false, addEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', () => media);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    const root = document.getElementById('shopkeeper-chat-root')!;
    delete root.dataset.configUrl;
    root.dataset.preview = '1';
    window.eval(source);
    root.dispatchEvent(new CustomEvent('shopkeeper:preview', { detail: {
      settings: { ...DEFAULT_CHAT_SETTINGS, showOnMobile: false }, scene: 'welcome',
    } }));
    expect(root.shadowRoot!.querySelector('.panel')!.getAttribute('data-open')).toBe('1');
    media.matches = true;
    window.dispatchEvent(new Event('resize'));
    expect(root.shadowRoot!.querySelector('.panel')!.getAttribute('data-open')).toBe('0');
    expect(document.body.dataset.skScrollLocked).not.toBe('1');
  });

  it('updates a preview in place without losing messages, drafts, or its closed state', () => {
    const root = document.getElementById('shopkeeper-chat-root')!;
    delete root.dataset.configUrl;
    root.dataset.preview = '1';
    vi.stubGlobal('fetch', vi.fn());
    window.eval(source);
    const update = (settings = DEFAULT_CHAT_SETTINGS) => root.dispatchEvent(new CustomEvent('shopkeeper:preview', {
      detail: { settings, scene: 'welcome' },
    }));
    update();
    const shadow = root.shadowRoot!;
    const input = shadow.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(shadow.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
    input.value = 'A sample question';
    shadow.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const message = shadow.querySelector('.msg.me');
    input.value = 'An unfinished message';
    update({ ...DEFAULT_CHAT_SETTINGS, greeting: 'Updated welcome', accentColor: '#30694e' });
    expect(shadow.querySelector('.msg.me')).toBe(message);
    expect(input.value).toBe('An unfinished message');
    expect(shadow.querySelector('[data-welcome] .bubble')!.textContent).toBe('Updated welcome');
    shadow.querySelector<HTMLButtonElement>('.header-close')!.click();
    update({ ...DEFAULT_CHAT_SETTINGS, title: 'New name' });
    expect(shadow.querySelector('.panel')!.getAttribute('data-open')).toBe('0');
    expect(shadow.querySelector('.msg.me')).toBe(message);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retains an in-progress verification form when changing preview branding', () => {
    const root = document.getElementById('shopkeeper-chat-root')!;
    delete root.dataset.configUrl;
    root.dataset.preview = '1';
    window.eval(source);
    const update = (title: string) => root.dispatchEvent(new CustomEvent('shopkeeper:preview', {
      detail: { settings: { ...DEFAULT_CHAT_SETTINGS, title }, scene: 'welcome' },
    }));
    update('Store');
    const shadow = root.shadowRoot!;
    shadow.querySelector<HTMLButtonElement>('.verify-open')!.click();
    const order = shadow.querySelector<HTMLInputElement>('.card input')!;
    order.value = '#1234';
    update('Store support');
    expect(shadow.querySelector('.card input')).toBe(order);
    expect(order.value).toBe('#1234');
  });
});
