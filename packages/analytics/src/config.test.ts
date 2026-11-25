import { describe, expect, it } from 'vitest';
import {
  resolveAnalyticsEnvironment,
  resolveProductAnalyticsConfig,
} from './config.js';

describe('resolveProductAnalyticsConfig', () => {
  it('defaults to disabled outside production', () => {
    expect(resolveProductAnalyticsConfig({ NODE_ENV: 'development' })).toEqual({
      config: {
        enabled: false,
        environment: 'development',
        host: 'https://us.i.posthog.com',
      },
      problem: null,
    });
  });

  it('turns capture off, with the reason, without an explicit strict boolean in production', () => {
    expect(resolveProductAnalyticsConfig({ NODE_ENV: 'production' })).toMatchObject({
      config: { enabled: false, environment: 'production' },
      problem: expect.stringMatching(/explicitly set/),
    });
    expect(
      resolveProductAnalyticsConfig({
        NODE_ENV: 'production',
        PRODUCT_ANALYTICS_ENABLED: 'yes',
      }),
    ).toMatchObject({
      config: { enabled: false },
      problem: expect.stringMatching(/either true or false/),
    });
  });

  it('turns capture off when enabled without a token and HTTPS host', () => {
    expect(
      resolveProductAnalyticsConfig({
        NODE_ENV: 'production',
        PRODUCT_ANALYTICS_ENABLED: 'true',
      }),
    ).toMatchObject({
      config: { enabled: false },
      problem: expect.stringMatching(/POSTHOG_PROJECT_TOKEN/),
    });

    for (const host of ['http://posthog.example.com', 'not-a-url']) {
      expect(
        resolveProductAnalyticsConfig({
          NODE_ENV: 'production',
          PRODUCT_ANALYTICS_ENABLED: 'true',
          POSTHOG_PROJECT_TOKEN: 'phc_test',
          POSTHOG_HOST: host,
        }),
      ).toMatchObject({
        config: { enabled: false },
        problem: expect.stringMatching(/HTTPS URL/),
      });
    }
  });

  it('returns enabled configuration with normalized environment metadata', () => {
    expect(
      resolveProductAnalyticsConfig({
        NODE_ENV: 'production',
        PRODUCT_ANALYTICS_ENABLED: 'true',
        POSTHOG_PROJECT_TOKEN: ' phc_test ',
        POSTHOG_HOST: 'https://posthog.example.com',
        RAILWAY_ENVIRONMENT_NAME: 'staging',
      }),
    ).toEqual({
      config: {
        enabled: true,
        environment: 'staging',
        projectToken: 'phc_test',
        host: 'https://posthog.example.com',
      },
      problem: null,
    });
  });

  it('always disables analytics in tests', () => {
    expect(
      resolveProductAnalyticsConfig({
        NODE_ENV: 'test',
        PRODUCT_ANALYTICS_ENABLED: 'true',
        POSTHOG_PROJECT_TOKEN: 'phc_shell_value',
      }),
    ).toMatchObject({ config: { enabled: false, environment: 'test' }, problem: null });
  });
});

describe('resolveAnalyticsEnvironment', () => {
  it.each([
    [{ NODE_ENV: 'test' }, 'test'],
    [{ NODE_ENV: 'production', VERCEL_ENV: 'preview' }, 'preview'],
    [{ NODE_ENV: 'development', VERCEL_ENV: 'development' }, 'development'],
    [{ NODE_ENV: 'production', VERCEL_ENV: 'production' }, 'production'],
    [{ NODE_ENV: 'production', RAILWAY_ENVIRONMENT_NAME: 'staging' }, 'staging'],
    [{ NODE_ENV: 'production', RAILWAY_ENVIRONMENT_NAME: 'preview-1' }, 'preview'],
    [{ NODE_ENV: 'production', RAILWAY_ENVIRONMENT_NAME: 'production' }, 'production'],
    [{ NODE_ENV: 'production' }, 'production'],
  ] as const)('maps deployment variables to %s', (env, expected) => {
    expect(resolveAnalyticsEnvironment(env)).toBe(expected);
  });
});
