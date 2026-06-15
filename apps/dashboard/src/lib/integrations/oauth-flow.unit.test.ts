/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import {
  isOAuthDoneMessage,
  isOAuthPopupWindow,
  OAUTH_DONE_MESSAGE_TYPE,
  OAUTH_POPUP_NAME,
  OAUTH_POPUP_SESSION_KEY,
} from './oauth-flow';

describe('oauth-flow', () => {
  it('recognizes oauth done messages', () => {
    expect(isOAuthDoneMessage({
      type: OAUTH_DONE_MESSAGE_TYPE,
      connected: 'shopify',
      error: null,
    })).toBe(true);
    expect(isOAuthDoneMessage({ type: 'other' })).toBe(false);
  });

  it('detects oauth popup windows by name or session marker', () => {
    const originalName = window.name;
    const storage = window.sessionStorage;

    window.name = OAUTH_POPUP_NAME;
    storage.removeItem(OAUTH_POPUP_SESSION_KEY);
    expect(isOAuthPopupWindow()).toBe(true);

    window.name = '';
    storage.setItem(OAUTH_POPUP_SESSION_KEY, '1');
    expect(isOAuthPopupWindow()).toBe(true);

    window.name = originalName;
    storage.removeItem(OAUTH_POPUP_SESSION_KEY);
  });
});
