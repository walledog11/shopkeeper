import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImessageSpectrumApp } from './spectrum.js';
import {
  clearSpectrumAppCache,
  getPlatformSpectrumApp,
  sendImessageOnSpace,
  SpectrumIntegrationConfigError,
} from './spectrum.js';

const mocks = vi.hoisted(() => ({
  spectrum: vi.fn(),
  imessage: vi.fn(),
  imessageConfig: vi.fn(),
  getSpectrumConfig: vi.fn(),
  recordProviderSendFailureInBackground: vi.fn(),
}));

vi.mock('spectrum-ts', () => ({
  Spectrum: mocks.spectrum,
}));

vi.mock('spectrum-ts/providers/imessage', () => ({
  imessage: Object.assign(mocks.imessage, { config: mocks.imessageConfig }),
}));

vi.mock('../config/runtime-config.js', () => ({
  getSpectrumConfig: mocks.getSpectrumConfig,
}));

vi.mock('../logger.js', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../provider-send-alerts.js', () => ({
  recordProviderSendFailureInBackground: mocks.recordProviderSendFailureInBackground,
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

describe('iMessage send failures', () => {
  it('records provider_send when space.send fails', async () => {
    const send = vi.fn().mockRejectedValue(new Error('space unavailable'));
    await expect(
      sendImessageOnSpace({ id: 'space_1', send }, 'hello', {
        orgId: 'org_1',
        threadId: 'thread_1',
      }),
    ).rejects.toThrow('space unavailable');

    expect(mocks.recordProviderSendFailureInBackground).toHaveBeenCalledWith(
      'imessage',
      'operator_notify',
      'org_1',
      expect.objectContaining({
        threadId: 'thread_1',
        detail: 'space unavailable',
        extra: { spaceId: 'space_1' },
      }),
    );
  });
});
