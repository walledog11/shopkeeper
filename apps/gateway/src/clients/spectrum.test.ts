import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImessageSpectrumApp, SpectrumIntegration } from './spectrum.js';
import {
  clearSpectrumAppCache,
  getSpectrumAppForIntegration,
  getSpectrumAppForIntegrationId,
  getSpectrumAppForOrganization,
  readSpectrumCredentials,
  SpectrumIntegrationConfigError,
  stopAllSpectrumApps,
} from './spectrum.js';

const mocks = vi.hoisted(() => ({
  spectrum: vi.fn(),
  imessageConfig: vi.fn(),
  integrationFindFirst: vi.fn(),
  integrationFindUnique: vi.fn(),
}));

vi.mock('spectrum-ts', () => ({
  Spectrum: mocks.spectrum,
}));

vi.mock('spectrum-ts/providers/imessage', () => ({
  imessage: {
    config: mocks.imessageConfig,
  },
}));

vi.mock('@shopkeeper/db', () => ({
  ChannelType: { imessage: 'imessage', email: 'email' },
  db: {
    integration: {
      findFirst: mocks.integrationFindFirst,
      findUnique: mocks.integrationFindUnique,
    },
  },
}));

function makeIntegration(overrides: Partial<SpectrumIntegration> = {}): SpectrumIntegration {
  return {
    id: 'integration_1',
    organizationId: 'org_1',
    platform: 'imessage',
    externalAccountId: ' project_1 ',
    accessToken: ' project_secret_1 ',
    refreshToken: ' webhook_secret_1 ',
    ...overrides,
  };
}

beforeEach(() => {
  clearSpectrumAppCache();
  vi.clearAllMocks();
  mocks.imessageConfig.mockReturnValue({ provider: 'imessage' });
});

describe('Spectrum app factory', () => {
  it('builds a Spectrum app from an iMessage Integration and caches it', async () => {
    const app = { id: 'spectrum_app_1' } as unknown as ImessageSpectrumApp;
    mocks.spectrum.mockResolvedValue(app);

    const integration = makeIntegration();

    await expect(getSpectrumAppForIntegration(integration)).resolves.toBe(app);
    await expect(getSpectrumAppForIntegration(integration)).resolves.toBe(app);

    expect(mocks.imessageConfig).toHaveBeenCalledTimes(1);
    expect(mocks.spectrum).toHaveBeenCalledTimes(1);
    expect(mocks.spectrum).toHaveBeenCalledWith({
      projectId: 'project_1',
      projectSecret: 'project_secret_1',
      webhookSecret: 'webhook_secret_1',
      providers: [{ provider: 'imessage' }],
    });
  });

  it('caches app creation promises so concurrent requests share one init', async () => {
    const app = { id: 'spectrum_app_1' } as unknown as ImessageSpectrumApp;
    mocks.spectrum.mockResolvedValue(app);

    const integration = makeIntegration();
    const first = getSpectrumAppForIntegration(integration);
    const second = getSpectrumAppForIntegration(integration);

    await expect(Promise.all([first, second])).resolves.toEqual([app, app]);
    expect(mocks.spectrum).toHaveBeenCalledTimes(1);
  });

  it('rebuilds against new credentials when a secret rotates and stops the stale app', async () => {
    const oldApp = { id: 'old', stop: vi.fn().mockResolvedValue(undefined) } as unknown as ImessageSpectrumApp;
    const newApp = { id: 'new', stop: vi.fn().mockResolvedValue(undefined) } as unknown as ImessageSpectrumApp;
    mocks.spectrum.mockResolvedValueOnce(oldApp).mockResolvedValueOnce(newApp);

    await expect(getSpectrumAppForIntegration(makeIntegration())).resolves.toBe(oldApp);

    const rotated = makeIntegration({ refreshToken: ' rotated_webhook_secret ' });
    await expect(getSpectrumAppForIntegration(rotated)).resolves.toBe(newApp);

    expect(mocks.spectrum).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect((oldApp as unknown as { stop: ReturnType<typeof vi.fn> }).stop).toHaveBeenCalledTimes(1));
  });

  it('stops every cached app on shutdown and clears the cache', async () => {
    const app = { id: 'a', stop: vi.fn().mockResolvedValue(undefined) } as unknown as ImessageSpectrumApp;
    mocks.spectrum.mockResolvedValue(app);

    await getSpectrumAppForIntegration(makeIntegration());
    await stopAllSpectrumApps();

    expect((app as unknown as { stop: ReturnType<typeof vi.fn> }).stop).toHaveBeenCalledTimes(1);

    await getSpectrumAppForIntegration(makeIntegration());
    expect(mocks.spectrum).toHaveBeenCalledTimes(2);
  });

  it('evicts rejected app initialization so the next call can retry', async () => {
    const integration = makeIntegration();
    const app = { id: 'spectrum_app_2' } as unknown as ImessageSpectrumApp;
    mocks.spectrum
      .mockRejectedValueOnce(new Error('transient grpc failure'))
      .mockResolvedValueOnce(app);

    await expect(getSpectrumAppForIntegration(integration)).rejects.toThrow('transient grpc failure');
    await expect(getSpectrumAppForIntegration(integration)).resolves.toBe(app);

    expect(mocks.spectrum).toHaveBeenCalledTimes(2);
  });

  it('loads an iMessage integration by organization for outbound workers', async () => {
    const app = { id: 'spectrum_app_1' } as unknown as ImessageSpectrumApp;
    const integration = makeIntegration();
    mocks.integrationFindFirst.mockResolvedValue(integration);
    mocks.spectrum.mockResolvedValue(app);

    await expect(getSpectrumAppForOrganization('org_1')).resolves.toBe(app);

    expect(mocks.integrationFindFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org_1', platform: 'imessage' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        organizationId: true,
        platform: true,
        externalAccountId: true,
        accessToken: true,
        refreshToken: true,
      },
    });
  });

  it('loads an iMessage integration by id for webhook routes', async () => {
    const app = { id: 'spectrum_app_1' } as unknown as ImessageSpectrumApp;
    const integration = makeIntegration({ id: 'integration_webhook' });
    mocks.integrationFindUnique.mockResolvedValue(integration);
    mocks.spectrum.mockResolvedValue(app);

    await expect(getSpectrumAppForIntegrationId('integration_webhook')).resolves.toBe(app);

    expect(mocks.integrationFindUnique).toHaveBeenCalledWith({
      where: { id: 'integration_webhook' },
      select: {
        id: true,
        organizationId: true,
        platform: true,
        externalAccountId: true,
        accessToken: true,
        refreshToken: true,
      },
    });
  });

  it('rejects missing credentials before constructing Spectrum', () => {
    expect(() => readSpectrumCredentials(makeIntegration({ accessToken: '  ', refreshToken: null })))
      .toThrow(SpectrumIntegrationConfigError);
    expect(() => readSpectrumCredentials(makeIntegration({ accessToken: '  ', refreshToken: null })))
      .toThrow('accessToken, refreshToken');
    expect(mocks.spectrum).not.toHaveBeenCalled();
  });

  it('rejects non-iMessage integrations', () => {
    expect(() => readSpectrumCredentials(makeIntegration({ platform: 'email' }))).toThrow(
      'Integration integration_1 is email, not imessage',
    );
    expect(mocks.spectrum).not.toHaveBeenCalled();
  });
});
