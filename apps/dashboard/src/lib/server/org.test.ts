import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'
import { db } from '@shopkeeper/db'

const { mockAuth, mockGetOrganization, mockGetUser } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetOrganization: vi.fn(),
  mockGetUser: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  clerkClient: vi.fn(),
}))

import { auth, clerkClient } from '@clerk/nextjs/server'
import { NoActiveOrganizationError, UnauthorizedError } from '@/lib/api/errors'
import { resolveAgentSettings } from '@shopkeeper/agent/settings'
import type { OrgSettings } from '@/types'
import { getOrCreateOrg } from './org'

type AuthResult = ReturnType<typeof auth> extends Promise<infer T> ? T : never

const createdClerkOrgIds: string[] = []

function trackClerkOrg(id: string) {
  createdClerkOrgIds.push(id)
  return id
}

async function seedOrg(clerkOrgId: string, name = 'Acme') {
  return db.organization.create({
    data: { clerkOrgId, name },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.E2E_AUTH_BYPASS = 'false'
  delete process.env.E2E_CLERK_ORG_ID
  delete process.env.E2E_CLERK_USER_ID
  delete process.env.E2E_TEST_ORG_NAME
  vi.mocked(clerkClient).mockResolvedValue({
    organizations: { getOrganization: mockGetOrganization },
    users: { getUser: mockGetUser },
  } as unknown as Awaited<ReturnType<typeof clerkClient>>)
})

afterEach(async () => {
  for (const clerkOrgId of createdClerkOrgIds) {
    await db.organization.deleteMany({ where: { clerkOrgId } }).catch(() => undefined)
  }
  createdClerkOrgIds.length = 0
})

describe('getOrCreateOrg', () => {
  it('throws UnauthorizedError when the user is signed out', async () => {
    mockAuth.mockResolvedValue({ userId: null, orgId: null } as unknown as AuthResult)

    await expect(getOrCreateOrg()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('throws NoActiveOrganizationError when there is no active org', async () => {
    mockAuth.mockResolvedValue({ userId: 'usr_test', orgId: null } as unknown as AuthResult)

    await expect(getOrCreateOrg()).rejects.toBeInstanceOf(NoActiveOrganizationError)
  })

  it('returns the existing organization when one is already provisioned', async () => {
    const clerkOrgId = trackClerkOrg(`org_clerk_${randomUUID()}`)
    const seeded = await seedOrg(clerkOrgId, 'Acme Existing')
    mockAuth.mockResolvedValue({ userId: 'usr_test', orgId: clerkOrgId } as unknown as AuthResult)

    const result = await getOrCreateOrg()

    expect(result.id).toBe(seeded.id)
    expect(result.clerkOrgId).toBe(clerkOrgId)
    expect(mockGetOrganization).not.toHaveBeenCalled()
  })

  it('uses the E2E bypass org without calling Clerk auth when explicitly enabled', async () => {
    const clerkOrgId = trackClerkOrg(`org_e2e_${randomUUID()}`)
    process.env.E2E_AUTH_BYPASS = 'true'
    process.env.E2E_CLERK_ORG_ID = clerkOrgId
    process.env.E2E_CLERK_USER_ID = 'user_e2e_test'
    process.env.E2E_TEST_ORG_NAME = 'E2E Test Store'

    const result = await getOrCreateOrg()

    expect(result.clerkOrgId).toBe(clerkOrgId)
    expect(result.name).toBe('E2E Test Store')
    expect(auth).not.toHaveBeenCalled()

    const persisted = await db.organization.findUnique({ where: { clerkOrgId } })
    expect(persisted?.id).toBe(result.id)
  })

  it('seeds settings.aiContext from welcome metadata on first creation', async () => {
    const clerkOrgId = trackClerkOrg(`org_clerk_${randomUUID()}`)
    mockAuth.mockResolvedValue({ userId: 'usr_test', orgId: clerkOrgId } as unknown as AuthResult)
    mockGetOrganization.mockResolvedValue({ name: 'Acme' })
    mockGetUser.mockResolvedValue({
      unsafeMetadata: { useCases: ['organize', 'automate'], teamSize: 'solo' },
    })

    await getOrCreateOrg()

    const persisted = await db.organization.findUniqueOrThrow({ where: { clerkOrgId } })
    expect(persisted.name).toBe('Acme')
    const settings = resolveAgentSettings(persisted.settings as Partial<OrgSettings>)
    expect(settings.aiContext).toBe(
      'Solo merchant using Shopkeeper to organize support tickets and automate responses to common questions.'
    )
    expect(settings.agentName).toBe('Shopkeeper')
  })

  it('falls back to default settings when welcome metadata is missing', async () => {
    const clerkOrgId = trackClerkOrg(`org_clerk_${randomUUID()}`)
    mockAuth.mockResolvedValue({ userId: 'usr_test', orgId: clerkOrgId } as unknown as AuthResult)
    mockGetOrganization.mockResolvedValue({ name: 'Acme' })
    mockGetUser.mockResolvedValue({ unsafeMetadata: {} })

    await getOrCreateOrg()

    const persisted = await db.organization.findUniqueOrThrow({ where: { clerkOrgId } })
    const settings = resolveAgentSettings(persisted.settings as Partial<OrgSettings>)
    expect(settings.aiContext).toBe('')
  })

  it('still creates the org when fetching the Clerk user fails', async () => {
    const clerkOrgId = trackClerkOrg(`org_clerk_${randomUUID()}`)
    mockAuth.mockResolvedValue({ userId: 'usr_test', orgId: clerkOrgId } as unknown as AuthResult)
    mockGetOrganization.mockResolvedValue({ name: 'Acme' })
    mockGetUser.mockRejectedValue(new Error('clerk down'))

    await getOrCreateOrg()

    const persisted = await db.organization.findUniqueOrThrow({ where: { clerkOrgId } })
    const settings = resolveAgentSettings(persisted.settings as Partial<OrgSettings>)
    expect(settings.aiContext).toBe('')
  })

  it('does not use the E2E bypass outside NODE_ENV=test', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('E2E_AUTH_BYPASS', 'true')
    mockAuth.mockResolvedValue({ userId: null, orgId: null } as unknown as AuthResult)

    await expect(getOrCreateOrg()).rejects.toBeInstanceOf(UnauthorizedError)
    expect(auth).toHaveBeenCalled()

    vi.unstubAllEnvs()
  })
})
