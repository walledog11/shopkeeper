import { describe, expect, it } from 'vitest';
import {
  assertSafeTestRuntime,
  parseCanaryArgs,
  type CanaryArgs,
} from './canary-dashboard-send-reply-hop.js';

const validArgs: CanaryArgs = {
  execute: true,
  organizationId: 'org_1',
  threadId: 'thread_1',
  text: 'cross-service send_reply canary run_1',
};

const validEnv: NodeJS.ProcessEnv = {
  E2E_TEST_RUN: 'true',
  E2E_OUTBOUND_MODE: 'record',
  OUTBOUND_EMAIL_ASYNC: 'false',
  DASHBOARD_INTERNAL_URL: 'http://127.0.0.1:3100',
};

describe('cross-service send-reply canary safety', () => {
  it('parses the controlled CLI contract and trims values', () => {
    expect(parseCanaryArgs([
      'node',
      'canary.ts',
      '--org-id= org_1 ',
      '--thread-id=thread_1',
      '--text=cross-service send_reply canary run_1',
      '--execute',
    ])).toEqual(validArgs);

    expect(parseCanaryArgs(['node', 'canary.ts', '--org-id= '])).toEqual({
      execute: false,
      organizationId: null,
      threadId: null,
      text: null,
    });
  });

  it('accepts only the isolated loopback record-mode runtime', () => {
    expect(() => assertSafeTestRuntime(validArgs, validEnv)).not.toThrow();
    expect(() => assertSafeTestRuntime(validArgs, {
      ...validEnv,
      DASHBOARD_INTERNAL_URL: undefined,
      DASHBOARD_URL: 'http://localhost:3100',
    })).not.toThrow();
  });

  it.each([
    [{ ...validArgs, execute: false }, validEnv, 'Usage:'],
    [{ ...validArgs, organizationId: null }, validEnv, 'Usage:'],
    [{ ...validArgs, threadId: null }, validEnv, 'Usage:'],
    [{ ...validArgs, text: null }, validEnv, 'Usage:'],
    [validArgs, { ...validEnv, E2E_TEST_RUN: 'false' }, 'E2E_TEST_RUN=true'],
    [validArgs, { ...validEnv, E2E_OUTBOUND_MODE: 'send' }, 'E2E_TEST_RUN=true'],
    [validArgs, { ...validEnv, OUTBOUND_EMAIL_ASYNC: 'true' }, 'OUTBOUND_EMAIL_ASYNC=false'],
    [{ ...validArgs, text: 'not controlled' }, validEnv, 'controlled cross-service'],
    [validArgs, { ...validEnv, DASHBOARD_INTERNAL_URL: 'https://dashboard.example.com' }, 'loopback'],
    [validArgs, { ...validEnv, DASHBOARD_INTERNAL_URL: 'http://dashboard.example.com' }, 'loopback'],
  ] satisfies Array<[CanaryArgs, NodeJS.ProcessEnv, string]>)(
    'rejects unsafe arguments or runtime configuration',
    (args, env, message) => {
      expect(() => assertSafeTestRuntime(args, env)).toThrow(message);
    },
  );
});
