import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac, randomUUID } from 'node:crypto'
import { db } from '@shopkeeper/db'
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers'
import { POST } from './route'

const WEBHOOK_SIGNING_BYTES = Buffer.from('clerk webhook test fixture')
const CLERK_WEBHOOK_SECRET = WEBHOOK_SIGNING_BYTES.toString('base64')
const WEBHOOK_URL = 'http://localhost:3000/api/webhooks/clerk'

let org: Awaited<ReturnType<typeof createTestOrg>> | null
let waitlistId: string | null

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

  return new NextRequest(WEBHOOK_URL, {
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
  waitlistId = null
  vi.stubEnv('CLERK_WEBHOOK_SECRET', CLERK_WEBHOOK_SECRET)
})

afterEach(async () => {
  if (waitlistId) await db.waitlistEntry.deleteMany({ where: { id: waitlistId } })
  await cleanupTestData(org?.id)
  org = null
  vi.unstubAllEnvs()
})

describe('POST /api/webhooks/clerk', () => {
  it('marks a waitlist signup converted only after Clerk verifies the primary email', async () => {
    const email = `clerk-waitlist-${randomUUID()}@example.com`
    const entry = await db.waitlistEntry.create({ data: { email, source: 'hero', attribution: {} } })
    waitlistId = entry.id
    const event = (type: string, status: string) => ({
      object: 'event', type,
      data: { object: 'user', id: 'user_waitlist', primary_email_address_id: 'email_primary',
        email_addresses: [{ id: 'email_primary', email_address: email, verification: { status } }],
      },
    })
    expect((await POST(createSignedRequest(event('user.created', 'unverified')))).status).toBe(200)
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })).stage).toBe('waiting')
    expect((await POST(createSignedRequest(event('user.updated', 'verified')))).status).toBe(200)
    const converted = await db.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })
    expect(converted.stage).toBe('signed_up')
    expect(converted.signedUpAt).not.toBeNull()
    await POST(createSignedRequest(event('user.updated', 'verified')))
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })).signedUpAt).toEqual(converted.signedUpAt)
  })

  it('retains billing and credentials until cleanup after Clerk deletes an organization', async () => {
    const testOrg = await createOrg()
    await db.organization.update({ where: { id: testOrg.id }, data: { stripeSubscriptionId: 'sub_cleanup' } })

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
    expect(await response.json()).toEqual({ received: true, deletionPending: true })

    const organization = await db.organization.findUnique({ where: { id: testOrg.id } })
    expect(organization?.lifecycleStatus).toBe('deleting')
    expect(organization?.stripeSubscriptionId).toBe('sub_cleanup')
    const cleanup = await db.workspaceDeletion.findUniqueOrThrow({ where: { organizationId: testOrg.id } })
    expect(cleanup.clerkDeletedAt).not.toBeNull()
    expect(cleanup.stripeCanceledAt).toBeNull()
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
    const response = await POST(new NextRequest(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user.deleted', data: { id: 'user_deleted' } }),
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Missing signature' })
  })

  it('rejects invalid signatures', async () => {
    const response = await POST(new NextRequest(WEBHOOK_URL, {
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
