import { describe, expect, it } from 'vitest';
import {
  parseProductAnalyticsConfig,
  resolveAnalyticsEnvironment,
} from './config.js';

describe('parseProductAnalyticsConfig', () => {
  it('defaults to disabled outside production', () => {
    expect(parseProductAnalyticsConfig({ NODE_ENV: 'development' })).toEqual({
      enabled: false,
      environment: 'development',
      host: 'https://us.i.posthog.com',
    });
  });

  it('requires an explicit strict boolean in production', () => {
    expect(() => parseProductAnalyticsConfig({ NODE_ENV: 'production' })).toThrow(
      /explicitly set/,
    );
    expect(() =>
      parseProductAnalyticsConfig({
        NODE_ENV: 'production',
        PRODUCT_ANALYTICS_ENABLED: 'yes',
      }),
    ).toThrow(/either true or false/);
  });

  it('requires a token and HTTPS host when enabled', () => {
    expect(() =>
      parseProductAnalyticsConfig({
        NODE_ENV: 'production',
        PRODUCT_ANALYTICS_ENABLED: 'true',
      }),
    ).toThrow(/POSTHOG_PROJECT_TOKEN/);

    expect(() =>
      parseProductAnalyticsConfig({
        NODE_ENV: 'production',
        PRODUCT_ANALYTICS_ENABLED: 'true',
        POSTHOG_PROJECT_TOKEN: 'phc_test',
        POSTHOG_HOST: 'http://posthog.example.com',
      }),
    ).toThrow(/HTTPS URL/);

    expect(() =>
      parseProductAnalyticsConfig({
        NODE_ENV: 'production',
        PRODUCT_ANALYTICS_ENABLED: 'true',
        POSTHOG_PROJECT_TOKEN: 'phc_test',
        POSTHOG_HOST: 'not-a-url',
      }),
    ).toThrow(/HTTPS URL/);
  });

  it('returns enabled configuration with normalized environment metadata', () => {
    expect(
      parseProductAnalyticsConfig({
        NODE_ENV: 'production',
        PRODUCT_ANALYTICS_ENABLED: 'true',
        POSTHOG_PROJECT_TOKEN: ' phc_test ',
        POSTHOG_HOST: 'https://posthog.example.com',
        RAILWAY_ENVIRONMENT_NAME: 'staging',
      }),
    ).toEqual({
      enabled: true,
      environment: 'staging',
      projectToken: 'phc_test',
      host: 'https://posthog.example.com',
    });
  });

  it('always disables analytics in tests', () => {
    expect(
      parseProductAnalyticsConfig({
        NODE_ENV: 'test',
        PRODUCT_ANALYTICS_ENABLED: 'true',
        POSTHOG_PROJECT_TOKEN: 'phc_shell_value',
      }),
    ).toMatchObject({ enabled: false, environment: 'test' });
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
