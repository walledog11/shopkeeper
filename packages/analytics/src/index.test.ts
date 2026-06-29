import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureProductEvent,
  initializeProductAnalytics,
  installProductAnalytics,
  NoopAnalyticsSink,
  productEventInsertId,
  RecordingAnalyticsSink,
  shutdownProductAnalytics,
  type AnalyticsLogger,
  type ProductEvent,
} from './index.js';

const ORGANIZATION_ID = '9d1a7a51-2c0b-4d24-989f-e86362c01446';

function recordingLogger() {
  const warnings: Array<{ fields: Parameters<AnalyticsLogger['warn']>[0]; message: string }> = [];
  return {
    logger: {
      warn(fields: Parameters<AnalyticsLogger['warn']>[0], message: string) {
        warnings.push({ fields, message });
      },
    },
    warnings,
  };
}

afterEach(() => {
  installProductAnalytics({
    sink: new NoopAnalyticsSink(),
    environment: 'test',
  });
});

describe('captureProductEvent', () => {
  it('attaches the exact safe common payload', async () => {
    const sink = new RecordingAnalyticsSink();
    installProductAnalytics({ sink, environment: 'staging' });

    await captureProductEvent({
      event: 'onboarding_step_completed',
      organizationId: ORGANIZATION_ID,
      source: 'dashboard',
      step: 'email',
      insertId: productEventInsertId.onboardingStepCompleted(ORGANIZATION_ID, 'email'),
    });

    expect(sink.events).toEqual([
      {
        event: 'onboarding_step_completed',
        distinctId: ORGANIZATION_ID,
        properties: {
          organization_id: ORGANIZATION_ID,
          schema_version: 1,
          environment: 'staging',
          source: 'dashboard',
          '$process_person_profile': false,
          step: 'email',
          '$insert_id': `onboarding_step_completed:${ORGANIZATION_ID}:email`,
        },
      },
    ]);
  });

  it('logs and swallows sink failures without logging the payload', async () => {
    const { logger, warnings } = recordingLogger();
    installProductAnalytics({
      sink: {
        async capture() {
          throw new RangeError('provider response containing sensitive data');
        },
      },
      environment: 'production',
      logger,
    });

    await expect(
      captureProductEvent({
        event: 'workspace_created',
        organizationId: ORGANIZATION_ID,
        source: 'dashboard',
      }),
    ).resolves.toBeUndefined();

    expect(warnings).toEqual([
      {
        fields: {
          event: 'workspace_created',
          source: 'dashboard',
          organizationId: ORGANIZATION_ID,
          errorClass: 'RangeError',
        },
        message: '[ProductAnalytics] Event capture failed',
      },
    ]);
    expect(JSON.stringify(warnings)).not.toContain('sensitive data');
  });

  it('logs and swallows invalid runtime input', async () => {
    const sink = new RecordingAnalyticsSink();
    const { logger, warnings } = recordingLogger();
    installProductAnalytics({ sink, environment: 'test', logger });

    await captureProductEvent({
      event: 'workspace_created',
      organizationId: 'clerk_org_id',
      source: 'dashboard',
    } as ProductEvent);

    expect(sink.events).toEqual([]);
    expect(warnings[0]).toMatchObject({
      fields: {
        event: 'workspace_created',
        source: 'dashboard',
        organizationId: 'clerk_org_id',
        errorClass: 'TypeError',
      },
    });
  });

  it('swallows logger failures as part of the analytics boundary', async () => {
    installProductAnalytics({
      sink: {
        async capture() {
          throw new Error('capture failed');
        },
      },
      environment: 'production',
      logger: {
        warn() {
          throw new Error('logger failed');
        },
      },
    });

    await expect(
      captureProductEvent({
        event: 'workspace_created',
        organizationId: ORGANIZATION_ID,
        source: 'dashboard',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('analytics lifecycle', () => {
  it('initializes a no-op sink when test analytics variables leak from the shell', () => {
    expect(() =>
      initializeProductAnalytics({
        delivery: 'immediate',
        env: {
          NODE_ENV: 'test',
          PRODUCT_ANALYTICS_ENABLED: 'true',
          POSTHOG_PROJECT_TOKEN: 'phc_real_shell_token',
        },
      }),
    ).not.toThrow();
  });

  it('flushes the installed sink and swallows shutdown failures', async () => {
    const { logger, warnings } = recordingLogger();
    const shutdown = vi.fn(async () => {
      throw new Error('network unavailable');
    });
    installProductAnalytics({
      sink: { capture: async () => {}, shutdown },
      environment: 'production',
      logger,
    });

    await expect(shutdownProductAnalytics()).resolves.toBeUndefined();

    expect(shutdown).toHaveBeenCalledOnce();
    expect(warnings).toEqual([
      {
        fields: { errorClass: 'Error' },
        message: '[ProductAnalytics] Shutdown flush failed',
      },
    ]);
  });

  it('does nothing when the installed sink has no shutdown hook', async () => {
    installProductAnalytics({
      sink: new NoopAnalyticsSink(),
      environment: 'test',
    });

    await expect(shutdownProductAnalytics()).resolves.toBeUndefined();
  });

  it('bounds shutdown when a batched sink cannot flush', async () => {
    const { logger, warnings } = recordingLogger();
    installProductAnalytics({
      sink: {
        capture: async () => {},
        shutdown: () => new Promise(() => {}),
      },
      environment: 'production',
      logger,
    });

    await expect(shutdownProductAnalytics(5)).resolves.toBeUndefined();

    expect(warnings).toEqual([
      {
        fields: { errorClass: 'Error' },
        message: '[ProductAnalytics] Shutdown flush failed',
      },
    ]);
  });
});
