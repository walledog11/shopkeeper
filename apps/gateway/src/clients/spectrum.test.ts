import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImessageSpectrumApp } from './spectrum.js';
import {
  clearSpectrumAppCache,
  getPlatformSpectrumApp,
  SpectrumIntegrationConfigError,
  stopAllSpectrumApps,
} from './spectrum.js';

const mocks = vi.hoisted(() => ({
  spectrum: vi.fn(),
  imessageConfig: vi.fn(),
  getSpectrumConfig: vi.fn(),
}));

vi.mock('spectrum-ts', () => ({
  Spectrum: mocks.spectrum,
}));

vi.mock('spectrum-ts/providers/imessage', () => ({
  imessage: {
    config: mocks.imessageConfig,
  },
}));

vi.mock('../config/runtime-config.js', () => ({
  getSpectrumConfig: mocks.getSpectrumConfig,
}));

const CREDS = {
  projectId: 'project_1',
  projectSecret: 'project_secret_1',
  webhookSecret: 'webhook_secret_1',
};

beforeEach(() => {
  clearSpectrumAppCache();
  vi.clearAllMocks();
  mocks.imessageConfig.mockReturnValue({ provider: 'imessage' });
  mocks.getSpectrumConfig.mockReturnValue({ ...CREDS });
});

describe('platform Spectrum app', () => {
  it('builds a Spectrum app from env credentials and caches it', async () => {
    const app = { id: 'spectrum_app_1' } as unknown as ImessageSpectrumApp;
    mocks.spectrum.mockResolvedValue(app);

    await expect(getPlatformSpectrumApp()).resolves.toBe(app);
    await expect(getPlatformSpectrumApp()).resolves.toBe(app);

    expect(mocks.imessageConfig).toHaveBeenCalledTimes(1);
    expect(mocks.spectrum).toHaveBeenCalledTimes(1);
    expect(mocks.spectrum).toHaveBeenCalledWith({
      projectId: 'project_1',
      projectSecret: 'project_secret_1',
      webhookSecret: 'webhook_secret_1',
      providers: [{ provider: 'imessage' }],
    });
  });

  it('caches the init promise so concurrent callers share one init', async () => {
    const app = { id: 'spectrum_app_1' } as unknown as ImessageSpectrumApp;
    mocks.spectrum.mockResolvedValue(app);

    const first = getPlatformSpectrumApp();
    const second = getPlatformSpectrumApp();

    await expect(Promise.all([first, second])).resolves.toEqual([app, app]);
    expect(mocks.spectrum).toHaveBeenCalledTimes(1);
  });

  it('rebuilds against new credentials when a secret rotates and stops the stale app', async () => {
    const oldApp = { id: 'old', stop: vi.fn().mockResolvedValue(undefined) } as unknown as ImessageSpectrumApp;
    const newApp = { id: 'new', stop: vi.fn().mockResolvedValue(undefined) } as unknown as ImessageSpectrumApp;
    mocks.spectrum.mockResolvedValueOnce(oldApp).mockResolvedValueOnce(newApp);

    await expect(getPlatformSpectrumApp()).resolves.toBe(oldApp);

    mocks.getSpectrumConfig.mockReturnValue({ ...CREDS, webhookSecret: 'rotated_webhook_secret' });
    await expect(getPlatformSpectrumApp()).resolves.toBe(newApp);

    expect(mocks.spectrum).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect((oldApp as unknown as { stop: ReturnType<typeof vi.fn> }).stop).toHaveBeenCalledTimes(1));
  });

  it('stops the cached app on shutdown and clears the cache', async () => {
    const app = { id: 'a', stop: vi.fn().mockResolvedValue(undefined) } as unknown as ImessageSpectrumApp;
    mocks.spectrum.mockResolvedValue(app);

    await getPlatformSpectrumApp();
    await stopAllSpectrumApps();

    expect((app as unknown as { stop: ReturnType<typeof vi.fn> }).stop).toHaveBeenCalledTimes(1);

    await getPlatformSpectrumApp();
    expect(mocks.spectrum).toHaveBeenCalledTimes(2);
  });

  it('evicts a rejected initialization so the next call can retry', async () => {
    const app = { id: 'spectrum_app_2' } as unknown as ImessageSpectrumApp;
    mocks.spectrum
      .mockRejectedValueOnce(new Error('transient grpc failure'))
      .mockResolvedValueOnce(app);

    await expect(getPlatformSpectrumApp()).rejects.toThrow('transient grpc failure');
    await expect(getPlatformSpectrumApp()).resolves.toBe(app);

    expect(mocks.spectrum).toHaveBeenCalledTimes(2);
  });

  it('throws when iMessage is not configured, before constructing Spectrum', () => {
    mocks.getSpectrumConfig.mockReturnValue(null);
    expect(() => getPlatformSpectrumApp()).toThrow(SpectrumIntegrationConfigError);
    expect(mocks.spectrum).not.toHaveBeenCalled();
  });
});
