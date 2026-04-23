import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockFindUnique,
  mockCreate,
  mockFindUniqueOrThrow,
  mockGetOrganization,
} = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
  mockFindUniqueOrThrow: vi.fn(),
  mockGetOrganization: vi.fn(),
}))

vi.mock('@clerk/db', () => ({
  db: {
    organization: {
      findUnique: mockFindUnique,
      create: mockCreate,
      findUniqueOrThrow: mockFindUniqueOrThrow,
    },
  },
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}))

import { auth, clerkClient } from '@clerk/nextjs/server'
import { NoActiveOrganizationError, UnauthorizedError } from '@/lib/api/errors'
import { getOrCreateOrg } from './org'

describe('getOrCreateOrg', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(clerkClient).mockResolvedValue({
      organizations: {
        getOrganization: mockGetOrganization,
      },
    } as unknown as Awaited<ReturnType<typeof clerkClient>>)
  })

  it('throws UnauthorizedError when the user is signed out', async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: null,
      orgId: null,
    } as unknown as ReturnType<typeof auth> extends Promise<infer T> ? T : never)

    await expect(getOrCreateOrg()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('throws NoActiveOrganizationError when there is no active org', async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: 'usr_test',
      orgId: null,
    } as unknown as ReturnType<typeof auth> extends Promise<infer T> ? T : never)

    await expect(getOrCreateOrg()).rejects.toBeInstanceOf(NoActiveOrganizationError)
  })

  it('returns the existing organization when one is already provisioned', async () => {
    const org = { id: 'org_db_123', clerkOrgId: 'org_clerk_123', name: 'Acme' }
    vi.mocked(auth).mockResolvedValue({
      userId: 'usr_test',
      orgId: 'org_clerk_123',
    } as unknown as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockFindUnique.mockResolvedValue(org)

    await expect(getOrCreateOrg()).resolves.toEqual(org)
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { clerkOrgId: 'org_clerk_123' } })
    expect(mockGetOrganization).not.toHaveBeenCalled()
  })
})
