// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CHAT_SETTINGS, type ChatConfigurationResponse } from '@/lib/storefront-chat/configuration';
import { useChatEditor } from './useChatEditor';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const initialData: ChatConfigurationResponse = {
  shop: 'store.myshopify.com', shopName: 'Store', enabled: false,
  configuration: { schemaVersion: 1, revision: 1, publishedAt: '2026-01-01T00:00:00Z', settings: DEFAULT_CHAT_SETTINGS },
};
const draftKey = 'chat-draft:workspace:store';
let root: Root;
let editor: ReturnType<typeof useChatEditor>;

function Probe() {
  const value = useChatEditor(initialData, draftKey, true);
  useEffect(() => { editor = value; }, [value]);
  return null;
}
beforeEach(() => {
  sessionStorage.clear();
  root = createRoot(document.createElement('div'));
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); sessionStorage.clear(); });

describe('chat editor recovery', () => {
  it('keeps edits typed during a slow save and saves them against the new revision', async () => {
    let finish!: (response: Response) => void;
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      requests.push(JSON.parse(init.body as string));
      return new Promise<Response>(resolve => { finish = resolve; });
    }));
    await act(async () => root.render(<Probe />));
    act(() => editor.change({ greeting: 'First edit' }));
    await act(async () => editor.run('save'));
    act(() => editor.change({ greeting: 'Typed while saving' }));
    await act(async () => finish(Response.json({ configuration: {
      ...initialData.configuration, revision: 2, settings: { ...DEFAULT_CHAT_SETTINGS, greeting: 'First edit' },
    } })));
    expect(editor.settings.greeting).toBe('Typed while saving');
    expect(editor.dirty).toBe(true);
    expect(editor.busy).toBe(false);
    await act(async () => editor.run('save'));
    expect(requests[1]).toMatchObject({ revision: 2, settings: { greeting: 'Typed while saving' } });
    await act(async () => finish(Response.json({ configuration: {
      ...initialData.configuration, revision: 3, settings: { ...DEFAULT_CHAT_SETTINGS, greeting: 'Typed while saving' },
    } })));
    expect(editor.dirty).toBe(false);
    expect(sessionStorage.getItem(draftKey)).toBeNull();
  });

  it('does not enable chat when saving the displayed design fails', async () => {
    const methods: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      methods.push(init.method!);
      return Response.json({ error: 'Save failed' }, { status: 503 });
    }));
    await act(async () => root.render(<Probe />));
    act(() => editor.change({ greeting: 'My greeting' }));
    await act(async () => editor.run('enable'));
    expect(methods).toEqual(['PUT']);
    expect(editor.data.enabled).toBe(false);
    expect(editor.busy).toBe(false);
    expect(editor.settings.greeting).toBe('My greeting');
    expect(JSON.parse(sessionStorage.getItem(draftKey)!)).toMatchObject({ settings: { greeting: 'My greeting' } });
  });

  it('saves the design before enabling and does not publish an old preview', async () => {
    const methods: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      methods.push(init.method!);
      return init.method === 'PUT' ? Response.json({ configuration: {
        ...initialData.configuration, revision: 2, settings: JSON.parse(init.body as string).settings,
      } }) : Response.json({ enabled: true });
    }));
    await act(async () => root.render(<Probe />));
    act(() => editor.change({ greeting: 'Ready for customers' }));
    await act(async () => editor.run('enable'));
    expect(methods).toEqual(['PUT', 'PATCH']);
    expect(editor.data.configuration?.settings.greeting).toBe('Ready for customers');
    expect(editor.data.enabled).toBe(true);
  });

  it('restores a stale draft without letting it overwrite another tab’s saved version', async () => {
    sessionStorage.setItem(draftKey, JSON.stringify({ revision: 0, settings: { ...DEFAULT_CHAT_SETTINGS, greeting: 'Unsaved draft' } }));
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await act(async () => root.render(<Probe />));
    expect(editor.settings.greeting).toBe('Unsaved draft');
    expect(editor.conflict).toBe(true);
    act(() => editor.change({ accentColor: '#30694e' }));
    await act(async () => editor.run('save'));
    expect(fetch).not.toHaveBeenCalled();
    expect(editor.conflict).toBe(true);
  });
});
