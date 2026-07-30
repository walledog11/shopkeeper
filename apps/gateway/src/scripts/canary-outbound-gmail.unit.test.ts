import { describe, expect, it } from 'vitest';
import {
  assertOutboundGmailCanaryRuntime,
  buildSelfCanaryAddress,
  parseOutboundGmailCanaryArgs,
  type OutboundGmailCanaryArgs,
} from './canary-outbound-gmail.js';

const validArgs: OutboundGmailCanaryArgs = {
  acknowledgeSelfEmail: true,
  execute: true,
  integrationId: 'integration_1',
};

describe('outbound Gmail canary safety', () => {
  it('parses the explicit execution contract', () => {
    expect(parseOutboundGmailCanaryArgs([
      'node',
      'canary.ts',
      '--integration-id= integration_1 ',
      '--acknowledge-self-email',
      '--execute',
    ])).toEqual(validArgs);
  });

  it.each([
    { ...validArgs, execute: false },
    { ...validArgs, acknowledgeSelfEmail: false },
    { ...validArgs, integrationId: null },
  ])('rejects incomplete execution arguments', (args) => {
    expect(() => assertOutboundGmailCanaryRuntime(args, {
      GATEWAY_URL: 'https://gateway.up.railway.app',
      INTERNAL_API_SECRET: 'secret',
    })).toThrow('Usage:');
  });

  it('accepts only loopback or HTTPS Railway gateway targets', () => {
    expect(assertOutboundGmailCanaryRuntime(validArgs, {
      GATEWAY_URL: 'https://gateway.up.railway.app',
      INTERNAL_API_SECRET: 'secret',
    }).hostname).toBe('gateway.up.railway.app');
    expect(assertOutboundGmailCanaryRuntime(validArgs, {
      GATEWAY_URL: 'http://127.0.0.1:3001',
      INTERNAL_API_SECRET: 'secret',
    }).hostname).toBe('127.0.0.1');
    expect(() => assertOutboundGmailCanaryRuntime(validArgs, {
      GATEWAY_URL: 'https://example.com',
      INTERNAL_API_SECRET: 'secret',
    })).toThrow('GATEWAY_URL');
    expect(() => assertOutboundGmailCanaryRuntime(validArgs, {
      GATEWAY_URL: 'https://gateway.up.railway.app',
    })).toThrow('INTERNAL_API_SECRET');
  });

  it('builds a fresh plus-address only from the connected account', () => {
    expect(buildSelfCanaryAddress('Owner+old@example.com', '2026-07-29T21:00Z'))
      .toBe('Owner+shopkeeper-canary-20260729t2100z@example.com');
    expect(() => buildSelfCanaryAddress('not-an-address', 'marker')).toThrow('valid email');
    expect(() => buildSelfCanaryAddress('owner@example.com', '---')).toThrow('marker');
  });
});
