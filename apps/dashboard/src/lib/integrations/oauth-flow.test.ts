/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  finishOAuthPopup,
  isOAuthDoneMessage,
  isOAuthPopupWindow,
  openOAuthPopup,
  OAUTH_DONE_MESSAGE_TYPE,
  OAUTH_POPUP_NAME,
  OAUTH_POPUP_SESSION_KEY,
  resolveOAuthCompletionMode,
  watchOAuthPopup,
} from './oauth-flow';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

function mockDesktop(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches })));
}

describe('oauth-flow', () => {
  it('accepts only fully typed OAuth done messages', () => {
    expect(isOAuthDoneMessage({
      type: OAUTH_DONE_MESSAGE_TYPE,
      outcome: { status: 'connected', provider: 'shopify' },
    })).toBe(true);
    expect(isOAuthDoneMessage({
      type: OAUTH_DONE_MESSAGE_TYPE,
      outcome: { status: 'failed', provider: 'gmail', error: 'made_up' },
    })).toBe(false);
    expect(isOAuthDoneMessage({ type: 'other' })).toBe(false);
  });

  it('opens a blank named desktop popup, marks it, then navigates with popup mode', () => {
    mockDesktop(true);
    const popupStorage = { setItem: vi.fn() };
    const popup = {
      closed: false,
      focus: vi.fn(),
      location: { href: '' },
      sessionStorage: popupStorage,
    } as unknown as Window;
    const open = vi.spyOn(window, 'open').mockReturnValue(popup);

    const result = openOAuthPopup('/api/integrations/gmail/auth?returnTo=%2Fonboarding');

    expect(result).toEqual({ mode: 'popup', popup });
    expect(open).toHaveBeenCalledWith('', OAUTH_POPUP_NAME, expect.any(String));
    expect(popupStorage.setItem).toHaveBeenCalledWith(OAUTH_POPUP_SESSION_KEY, '1');
    expect(popup.location.href).toBe(
      '/api/integrations/gmail/auth?returnTo=%2Fonboarding&mode=popup',
    );
    expect(popup.focus).toHaveBeenCalledOnce();
  });

  it.each([
    { label: 'mobile', desktop: false, popup: undefined },
    { label: 'popup-blocked', desktop: true, popup: null },
  ])('uses redirect mode for $label launches', ({ desktop, popup }) => {
    mockDesktop(desktop);
    const open = vi.spyOn(window, 'open').mockReturnValue(popup ?? null);

    expect(openOAuthPopup('/api/integrations/shopify/auth?shop=fixture')).toEqual({
      mode: 'redirect',
    });
    if (desktop) expect(open).toHaveBeenCalledWith('', OAUTH_POPUP_NAME, expect.any(String));
    else expect(open).not.toHaveBeenCalled();
  });

  it('uses the session marker only when completion mode is unavailable', () => {
    window.sessionStorage.setItem(OAUTH_POPUP_SESSION_KEY, '1');
    expect(isOAuthPopupWindow()).toBe(true);
    expect(resolveOAuthCompletionMode(null)).toBe('popup');
    expect(resolveOAuthCompletionMode('redirect')).toBe('redirect');
  });

  it('publishes one popup result and attempts to close', () => {
    const postMessage = vi.fn();
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    Object.defineProperty(window, 'opener', {
      configurable: true,
      value: { postMessage },
    });
    const payload = {
      type: OAUTH_DONE_MESSAGE_TYPE,
      outcome: { status: 'connected', provider: 'instagram' },
    } as const;

    finishOAuthPopup(payload);

    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith(payload, window.location.origin);
    expect(close).toHaveBeenCalledOnce();
  });

  it('fires a popup closure callback once and disposes its watcher', () => {
    vi.useFakeTimers();
    const popup = { closed: false } as Window;
    const onClosed = vi.fn();
    const dispose = watchOAuthPopup(popup, onClosed);

    vi.advanceTimersByTime(800);
    expect(onClosed).not.toHaveBeenCalled();
    Object.defineProperty(popup, 'closed', { configurable: true, value: true });
    vi.advanceTimersByTime(400);
    expect(onClosed).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1200);
    expect(onClosed).toHaveBeenCalledOnce();

    dispose();
    vi.useRealTimers();
  });

  it('cancels a retained popup watcher before closure', () => {
    vi.useFakeTimers();
    const popup = { closed: false } as Window;
    const onClosed = vi.fn();
    const dispose = watchOAuthPopup(popup, onClosed);
    dispose();
    Object.defineProperty(popup, 'closed', { configurable: true, value: true });
    vi.advanceTimersByTime(800);
    expect(onClosed).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
