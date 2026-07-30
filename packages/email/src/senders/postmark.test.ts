import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendEmail, serverClient } = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  serverClient: vi.fn(),
}));

vi.mock('postmark', () => ({
  ServerClient: serverClient.mockImplementation(function (this: Record<string, unknown>) {
    this.sendEmail = sendEmail;
  }),
}));

import { PostmarkSender } from './postmark';

beforeEach(() => {
  sendEmail.mockReset().mockResolvedValue({ MessageID: 'postmark-message-1' });
  serverClient.mockClear();
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

    expect(serverClient).toHaveBeenCalledWith('test-key', { timeout: 15 });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      Headers: [{ Name: 'Message-ID', Value: '<message-1@mail.test>' }],
    }));
  });

  // Postmark treats a present-but-empty HtmlBody as an HTML send, so a text-only
  // reply must omit the field rather than pass undefined through.
  it('omits HtmlBody and Attachments for a text-only reply', async () => {
    await new PostmarkSender().send({
      to: 'customer@example.test',
      fromAddress: 'support@example.test',
      fromName: 'Support',
      subject: 'Hello',
      text: 'Hi',
    });

    const payload = sendEmail.mock.calls[0][0];
    expect(payload).not.toHaveProperty('HtmlBody');
    expect(payload).not.toHaveProperty('Attachments');
    expect(payload.TextBody).toBe('Hi');
  });

  it('sends HtmlBody alongside the plain-text fallback', async () => {
    await new PostmarkSender().send({
      to: 'customer@example.test',
      fromAddress: 'support@example.test',
      fromName: 'Support',
      subject: 'Hello',
      text: 'Hi',
      html: '<p>Hi</p>',
    });

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      TextBody: 'Hi',
      HtmlBody: '<p>Hi</p>',
    }));
  });

  it('maps attachments to Postmark\'s shape', async () => {
    await new PostmarkSender().send({
      to: 'customer@example.test',
      fromAddress: 'support@example.test',
      fromName: 'Support',
      subject: 'Hello',
      text: 'Hi',
      attachments: [{ name: 'label.pdf', contentType: 'application/pdf', contentBase64: 'cGRm' }],
    });

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      Attachments: [{
        Name: 'label.pdf',
        Content: 'cGRm',
        ContentType: 'application/pdf',
        ContentID: null,
      }],
    }));
  });

  it('omits Attachments when the array is empty', async () => {
    await new PostmarkSender().send({
      to: 'customer@example.test',
      fromAddress: 'support@example.test',
      fromName: 'Support',
      subject: 'Hello',
      text: 'Hi',
      attachments: [],
    });

    expect(sendEmail.mock.calls[0][0]).not.toHaveProperty('Attachments');
  });
});
