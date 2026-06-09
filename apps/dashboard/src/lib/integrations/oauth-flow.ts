export const OAUTH_POPUP_NAME = 'shopkeeper_oauth_popup';
export const OAUTH_DONE_MESSAGE_TYPE = 'shopkeeper-oauth-done';

export interface OAuthDoneMessage {
  type: typeof OAUTH_DONE_MESSAGE_TYPE;
  connected: string | null;
  error: string | null;
}

export function buildOAuthAuthUrl(path: string, params: Record<string, string | undefined>): string {
  const url = new URL(path, typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

export function openOAuthPopup(url: string): Window | null {
  if (typeof window === 'undefined') return null;

  const desktop = window.matchMedia('(min-width: 768px)').matches;
  if (!desktop) {
    window.location.href = url;
    return null;
  }

  const features = 'width=720,height=820,menubar=no,toolbar=no,location=no,status=no';
  const popup = window.open(url, OAUTH_POPUP_NAME, features);
  if (!popup) {
    window.location.href = url;
    return null;
  }

  popup.focus();
  return popup;
}

export function watchOAuthPopup(popup: Window, onClosed: () => void): () => void {
  const timer = window.setInterval(() => {
    if (popup.closed) {
      window.clearInterval(timer);
      onClosed();
    }
  }, 400);

  return () => window.clearInterval(timer);
}

export function isOAuthDoneMessage(data: unknown): data is OAuthDoneMessage {
  if (!data || typeof data !== 'object') return false;
  const message = data as Partial<OAuthDoneMessage>;
  return message.type === OAUTH_DONE_MESSAGE_TYPE;
}
