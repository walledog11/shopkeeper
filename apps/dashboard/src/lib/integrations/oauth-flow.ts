export const OAUTH_POPUP_NAME = 'shopkeeper_oauth_popup';
export const OAUTH_POPUP_SESSION_KEY = 'shopkeeper-oauth-popup';
export const OAUTH_RESULT_CHANNEL = 'shopkeeper-oauth-result';
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

export function markOAuthPopupSession(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(OAUTH_POPUP_SESSION_KEY, '1');
  } catch {
    // Ignore storage failures in restricted contexts.
  }
}

export function clearOAuthPopupSession(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(OAUTH_POPUP_SESSION_KEY);
  } catch {
    // Ignore storage failures in restricted contexts.
  }
}

/** Detect OAuth popup even after cross-origin redirects null out window.opener. */
export function isOAuthPopupWindow(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.name === OAUTH_POPUP_NAME) return true;
  try {
    return sessionStorage.getItem(OAUTH_POPUP_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function publishOAuthDone(payload: OAuthDoneMessage): void {
  if (typeof window === 'undefined') return;

  if (window.opener && window.opener !== window) {
    try {
      window.opener.postMessage(payload, window.location.origin);
    } catch {
      // Cross-origin redirects can break opener references.
    }
  }

  try {
    const channel = new BroadcastChannel(OAUTH_RESULT_CHANNEL);
    channel.postMessage(payload);
    channel.close();
  } catch {
    // BroadcastChannel may be unavailable in some environments.
  }
}

export function subscribeOAuthDone(onResult: (payload: OAuthDoneMessage) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  function onMessage(event: MessageEvent) {
    if (event.origin !== window.location.origin || !isOAuthDoneMessage(event.data)) return;
    onResult(event.data);
  }

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(OAUTH_RESULT_CHANNEL);
    channel.onmessage = (event: MessageEvent<OAuthDoneMessage>) => {
      if (isOAuthDoneMessage(event.data)) onResult(event.data);
    };
  } catch {
    // Ignore BroadcastChannel setup failures.
  }

  window.addEventListener('message', onMessage);
  return () => {
    window.removeEventListener('message', onMessage);
    channel?.close();
  };
}

export function finishOAuthPopup(payload: OAuthDoneMessage): void {
  publishOAuthDone(payload);
  clearOAuthPopupSession();
  window.close();
}

export function openOAuthPopup(url: string): Window | null {
  if (typeof window === 'undefined') return null;

  const desktop = window.matchMedia('(min-width: 768px)').matches;
  if (!desktop) {
    markOAuthPopupSession();
    window.location.href = url;
    return null;
  }

  const features = 'width=720,height=820,menubar=no,toolbar=no,location=no,status=no';
  const popup = window.open(url, OAUTH_POPUP_NAME, features);
  if (!popup) {
    markOAuthPopupSession();
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
