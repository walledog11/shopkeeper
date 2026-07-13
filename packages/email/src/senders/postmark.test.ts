import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmail = vi.hoisted(() => vi.fn());

vi.mock('postmark', () => ({
  ServerClient: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.sendEmail = sendEmail;
  }),
}));

import { PostmarkSender } from './postmark';

beforeEach(() => {
  sendEmail.mockReset().mockResolvedValue({ MessageID: 'postmark-message-1' });
  vi.stubEnv('POSTMARK_API_KEY', 'test-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('PostmarkSender.send', () => {
  it('returns Postmark MessageID for durable delivery reconciliation', async () => {
    const sender = new PostmarkSender();

    await expect(sender.send({
      to: 'customer@example.test',
      fromAddress: 'support@example.test',
      fromName: 'Support',
      subject: 'Hello',
      text: 'Hi',
      headers: [{ name: 'Message-ID', value: '<message-1@mail.test>' }],
    })).resolves.toEqual({ providerMessageId: 'postmark-message-1' });

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      Headers: [{ Name: 'Message-ID', Value: '<message-1@mail.test>' }],
    }));
  });
});
