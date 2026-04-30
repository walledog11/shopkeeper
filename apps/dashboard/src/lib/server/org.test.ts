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
    process.env.E2E_AUTH_BYPASS = 'false'
    process.env.E2E_CLERK_ORG_ID = 'org_e2e_test'
    process.env.E2E_CLERK_USER_ID = 'user_e2e_test'
    process.env.E2E_TEST_ORG_NAME = 'E2E Test Store'
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

  it('uses the E2E bypass org without calling Clerk auth when explicitly enabled', async () => {
    const org = { id: 'org_db_e2e', clerkOrgId: 'org_e2e_test', name: 'E2E Test Store' }
    process.env.E2E_AUTH_BYPASS = 'true'
    mockFindUnique.mockResolvedValue(org)

    await expect(getOrCreateOrg()).resolves.toEqual(org)
    expect(auth).not.toHaveBeenCalled()
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { clerkOrgId: 'org_e2e_test' } })
  })

  it('does not use the E2E bypass outside NODE_ENV=test', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    process.env.E2E_AUTH_BYPASS = 'true'
    vi.mocked(auth).mockResolvedValue({
      userId: null,
      orgId: null,
    } as unknown as ReturnType<typeof auth> extends Promise<infer T> ? T : never)

    await expect(getOrCreateOrg()).rejects.toBeInstanceOf(UnauthorizedError)
    expect(auth).toHaveBeenCalled()

    process.env.NODE_ENV = originalNodeEnv
  })
})
