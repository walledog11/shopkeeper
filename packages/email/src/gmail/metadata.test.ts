import { describe, expect, it } from 'vitest';
import {
  buildGmailWatchFailureUpdate,
  metadataWithGmailState,
  readGmailHistoryId,
  readStoredGmailHistoryId,
} from './metadata.js';

describe('gmail metadata helpers', () => {
  it('reads numeric and string history IDs from push payloads', () => {
    expect(readGmailHistoryId('12345')).toBe('12345');
    expect(readGmailHistoryId(987654321)).toBe('987654321');
    expect(readGmailHistoryId('not-numeric')).toBe('');
  });

  it('merges gmail state without dropping unrelated metadata', () => {
    const merged = metadataWithGmailState(
      { provider: 'gmail', inboundMode: 'hybrid', gmail: { historyId: '10', lastError: 'old' } },
      { inboundStatus: 'active', historyId: '20' },
      { clearLastError: true, confirmReadScope: true },
    );

    expect(merged).toMatchObject({
      provider: 'gmail',
      inboundMode: 'hybrid',
      oauthScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      gmail: {
        historyId: '20',
        inboundStatus: 'active',
      },
    });
    expect(merged.gmail).not.toHaveProperty('lastError');
  });

  it('reads stored history IDs only when valid', () => {
    expect(readStoredGmailHistoryId({ gmail: { historyId: '42' } })).toBe('42');
    expect(readStoredGmailHistoryId({ gmail: { historyId: 'bad' } })).toBeNull();
  });

  it('marks watch authentication failures for reauthorization', () => {
    const failure = buildGmailWatchFailureUpdate(
      { gmail: { watchFailureCount: 1 } },
      'watch_authentication',
      new Date('2026-07-08T00:00:00.000Z'),
    );

    expect(failure.markReauthorization).toBe(true);
    expect(failure.metadata.gmail).toMatchObject({
      inboundStatus: 'reauthorization_required',
      lastError: 'watch_authentication',
      watchFailureCount: 2,
      watchLastAttemptAt: '2026-07-08T00:00:00.000Z',
    });
  });
});
