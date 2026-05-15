import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac, randomUUID } from 'node:crypto'
import { db } from '@clerk/db'
import { cleanupTestData, createTestOrg } from '@clerk/db/test-helpers'
import { POST } from './route'

const WEBHOOK_SIGNING_BYTES = Buffer.from('clerk webhook test fixture')
const CLERK_WEBHOOK_SECRET = WEBHOOK_SIGNING_BYTES.toString('base64')
const WEBHOOK_URL = 'http://localhost:3000/api/webhooks/clerk'

let org: Awaited<ReturnType<typeof createTestOrg>> | null

async function createOrg() {
  org = await createTestOrg()
  return org
}

function createSignedRequest(event: Record<string, unknown>) {
  const payload = JSON.stringify(event)
  const msgId = `msg_${randomUUID().replaceAll('-', '')}`
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = createHmac('sha256', Buffer.from(CLERK_WEBHOOK_SECRET.replace(/^whsec_/, ''), 'base64'))
    .update(`${msgId}.${timestamp}.${payload}`)
    .digest('base64')

  return new Request(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'svix-id': msgId,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${signature}`,
    },
    body: payload,
  })
}

beforeEach(() => {
  org = null
  vi.stubEnv('CLERK_WEBHOOK_SECRET', CLERK_WEBHOOK_SECRET)
})

afterEach(async () => {
  await cleanupTestData(org?.id)
  org = null
  vi.unstubAllEnvs()
})

describe('POST /api/webhooks/clerk', () => {
  it('deletes local organization data when Clerk deletes an organization', async () => {
    const testOrg = await createOrg()

    const response = await POST(createSignedRequest({
      object: 'event',
      type: 'organization.deleted',
      data: {
        object: 'organization',
        id: testOrg.clerkOrgId,
        deleted: true,
      },
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ received: true, deleted: 1 })

    const organization = await db.organization.findUnique({ where: { id: testOrg.id } })
    expect(organization).toBeNull()
    org = null
  })

  it('removes local org memberships when Clerk deletes a user', async () => {
    const testOrg = await createOrg()

    await db.orgMember.create({
      data: {
        organizationId: testOrg.id,
        clerkUserId: 'user_deleted',
      },
    })

    const response = await POST(createSignedRequest({
      object: 'event',
      type: 'user.deleted',
      data: {
        object: 'user',
        id: 'user_deleted',
        deleted: true,
      },
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ received: true, deleted: 1 })

    await expect(db.organization.findUniqueOrThrow({ where: { id: testOrg.id } })).resolves.toBeTruthy()
    await expect(db.orgMember.count({ where: { organizationId: testOrg.id } })).resolves.toBe(0)
  })

  it('removes a local org membership when Clerk removes that membership', async () => {
    const testOrg = await createOrg()

    await db.orgMember.create({
      data: {
        organizationId: testOrg.id,
        clerkUserId: 'user_removed_from_org',
      },
    })

    const response = await POST(createSignedRequest({
      object: 'event',
      type: 'organizationMembership.deleted',
      data: {
        object: 'organization_membership',
        organization: {
          id: testOrg.clerkOrgId,
        },
        public_user_data: {
          user_id: 'user_removed_from_org',
        },
      },
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ received: true, deleted: 1 })
    await expect(db.orgMember.count({ where: { organizationId: testOrg.id } })).resolves.toBe(0)
  })

  it('accepts unsupported signed events without mutating local records', async () => {
    const testOrg = await createOrg()

    const response = await POST(createSignedRequest({
      object: 'event',
      type: 'session.created',
      data: {
        object: 'session',
        id: 'sess_unsupported',
      },
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ received: true, ignored: true })
    await expect(db.organization.findUniqueOrThrow({ where: { id: testOrg.id } })).resolves.toBeTruthy()
  })

  it('rejects missing signatures', async () => {
    const response = await POST(new Request(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user.deleted', data: { id: 'user_deleted' } }),
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Missing signature' })
  })

  it('rejects invalid signatures', async () => {
    const response = await POST(new Request(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': 'msg_invalid',
        'svix-timestamp': Math.floor(Date.now() / 1000).toString(),
        'svix-signature': 'v1,invalid',
      },
      body: JSON.stringify({ type: 'user.deleted', data: { id: 'user_deleted' } }),
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid signature' })
  })

  it('fails closed when the signing secret is not configured', async () => {
    vi.stubEnv('CLERK_WEBHOOK_SECRET', '')

    const response = await POST(createSignedRequest({
      object: 'event',
      type: 'user.deleted',
      data: {
        object: 'user',
        id: 'user_deleted',
        deleted: true,
      },
    }))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Webhook not configured' })
  })
})
