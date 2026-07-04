import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestIntegration,
  createTestOrg,
} from '@shopkeeper/db/test-helpers';
import {
  GMAIL_PUBSUB_AUDIENCE,
  GMAIL_PUSH_SERVICE_ACCOUNT,
  webhookFixture,
} from '../test-fixtures/webhook-routes-test-fixture.js';

const {
  app,
  googleTokenVerifySpy,
  queueAddSpy,
} = webhookFixture;

let org: { id: string };
let additionalOrgIds: string[] = [];

function pushEnvelope(emailAddress: string, historyId = '123456789') {
  return {
    message: {
      data: Buffer.from(JSON.stringify({ emailAddress, historyId })).toString('base64'),
      messageId: 'pubsub-message-1',
      publishTime: '2026-07-03T12:00:00.000Z',
    },
    subscription: 'projects/test-project/subscriptions/gmail-inbound-push',
  };
}

function postPush(payload: object, token = 'valid-google-token') {
  const pending = request(app).post('/webhooks/gmail/push');
  if (token) pending.set('Authorization', `Bearer ${token}`);
  return pending.send(payload);
}

async function createGmailIntegration(organizationId: string, mailbox: string) {
  const integration = await createTestIntegration(organizationId, {
    externalAccountId: mailbox,
  });
  return db.integration.update({
    where: { id: integration.id },
    data: {
      metadata: {
        provider: 'gmail',
        gmail: { inboundStatus: 'active', historyId: '100' },
      },
    },
  });
}

beforeEach(() => {
  org = webhookFixture.org;
  additionalOrgIds = [];
  vi.stubEnv('GMAIL_NATIVE_INBOUND', 'true');
});

afterEach(async () => {
  await Promise.all(additionalOrgIds.map((organizationId) => cleanupTestData(organizationId)));
  vi.unstubAllEnvs();
});

describe('POST /webhooks/gmail/push', () => {
  it('rejects missing and invalid bearer tokens', async () => {
    const missing = await postPush(pushEnvelope('owner@example.com'), '');
    expect(missing.status).toBe(401);
    expect(googleTokenVerifySpy).not.toHaveBeenCalled();

    googleTokenVerifySpy.mockRejectedValueOnce(new Error('invalid signature'));
    const invalid = await postPush(pushEnvelope('owner@example.com'), 'invalid-token');
    expect(invalid.status).toBe(401);
    expect(queueAddSpy).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'issuer',
      claims: {
        aud: GMAIL_PUBSUB_AUDIENCE,
        email: GMAIL_PUSH_SERVICE_ACCOUNT,
        email_verified: true,
        iss: 'https://malicious.example.com',
      },
    },
    {
      label: 'audience',
      claims: {
        aud: 'https://malicious.example.com/webhook',
        email: GMAIL_PUSH_SERVICE_ACCOUNT,
        email_verified: true,
        iss: 'https://accounts.google.com',
      },
    },
    {
      label: 'service-account email',
      claims: {
        aud: GMAIL_PUBSUB_AUDIENCE,
        email: 'attacker@test-project.iam.gserviceaccount.com',
        email_verified: true,
        iss: 'https://accounts.google.com',
      },
    },
    {
      label: 'verified-email flag',
      claims: {
        aud: GMAIL_PUBSUB_AUDIENCE,
        email: GMAIL_PUSH_SERVICE_ACCOUNT,
        email_verified: false,
        iss: 'https://accounts.google.com',
      },
    },
  ])('rejects an unexpected $label claim', async ({ claims }) => {
    googleTokenVerifySpy.mockResolvedValueOnce({
      getPayload: () => claims,
    });

    const response = await postPush(pushEnvelope('owner@example.com'));

    expect(response.status).toBe(401);
    expect(queueAddSpy).not.toHaveBeenCalled();
  });

  it('rejects malformed Pub/Sub envelopes and decoded Gmail payloads', async () => {
    const malformedEnvelope = await postPush({ message: { data: 'not base64' } });
    expect(malformedEnvelope.status).toBe(400);

    const malformedNotification = await postPush({
      message: {
        data: Buffer.from(JSON.stringify({
          emailAddress: 'not-an-email',
          historyId: 'history-1',
        })).toString('base64'),
        messageId: 'pubsub-message-2',
      },
      subscription: 'projects/test-project/subscriptions/gmail-inbound-push',
    });
    expect(malformedNotification.status).toBe(400);
    expect(queueAddSpy).not.toHaveBeenCalled();
  });

  it('acknowledges an unknown mailbox without queueing work', async () => {
    const response = await postPush(pushEnvelope('unknown@example.com'));

    expect(response.status).toBe(204);
    expect(queueAddSpy).not.toHaveBeenCalled();
  });

  it('acknowledges valid notifications without queueing when rollout is disabled', async () => {
    vi.stubEnv('GMAIL_NATIVE_INBOUND', 'false');
    await createGmailIntegration(org.id, 'owner@example.com');

    const response = await postPush(pushEnvelope('owner@example.com'));

    expect(response.status).toBe(204);
    expect(queueAddSpy).not.toHaveBeenCalled();
  });

  it('queues one stable, deduplicated sync job per matching Gmail integration', async () => {
    const mailbox = `shared-${org.id.slice(0, 8)}@example.com`;
    const first = await createGmailIntegration(org.id, mailbox.toUpperCase());
    const additionalOrg = await createTestOrg();
    additionalOrgIds.push(additionalOrg.id);
    const second = await createGmailIntegration(additionalOrg.id, mailbox);

    const forwardingOrg = await createTestOrg();
    additionalOrgIds.push(forwardingOrg.id);
    const postmark = await createTestIntegration(forwardingOrg.id, {
      externalAccountId: mailbox,
    });
    await db.integration.update({
      where: { id: postmark.id },
      data: {
        metadata: { provider: 'postmark' },
      },
    });

    const firstResponse = await postPush(pushEnvelope(mailbox, '987654321'));
    const secondResponse = await postPush(pushEnvelope(mailbox, '987654321'));

    expect(firstResponse.status).toBe(204);
    expect(secondResponse.status).toBe(204);
    expect(queueAddSpy).toHaveBeenCalledTimes(4);

    const expectedJobIds = new Set([
      `gmail-sync-${first.id}-987654321`,
      `gmail-sync-${second.id}-987654321`,
    ]);
    for (const [jobName, jobData, options] of queueAddSpy.mock.calls) {
      expect(jobName).toBe('sync-gmail-mailbox');
      expect(jobData).toMatchObject({
        notifiedHistoryId: '987654321',
      });
      expect(jobData.traceId).toEqual(expect.any(String));
      expect(expectedJobIds).toContain(options.jobId);
    }
  });

  it('returns a retryable error when durable enqueueing fails', async () => {
    const mailbox = `failure-${org.id.slice(0, 8)}@example.com`;
    await createGmailIntegration(org.id, mailbox);
    queueAddSpy.mockRejectedValueOnce(new Error('Redis unavailable'));

    const response = await postPush(pushEnvelope(mailbox));

    expect(response.status).toBe(500);
  });

  it('passes the configured audience to Google token verification', async () => {
    await postPush(pushEnvelope('unknown@example.com'));

    expect(googleTokenVerifySpy).toHaveBeenCalledWith({
      audience: GMAIL_PUBSUB_AUDIENCE,
      idToken: 'valid-google-token',
    });
    expect(process.env.GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT).toBe(GMAIL_PUSH_SERVICE_ACCOUNT);
  });
});
