import { auth, clerkClient } from '@clerk/nextjs/server';
import { vi } from 'vitest';

type ClerkSession = Awaited<ReturnType<typeof auth>>;
type ClerkClient = Awaited<ReturnType<typeof clerkClient>>;

/**
 * Signs the test in as an active member of a Clerk org: `auth()` resolves the
 * session and `clerkClient()` confirms the membership `getOrCreateOrg` checks
 * before it records an OrgMember. The test file mocks the module itself, with
 * `vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(), clerkClient: vi.fn() }))`.
 */
export function mockClerkSession(session: { userId: string; orgId: string; orgRole?: string }) {
  vi.mocked(auth).mockResolvedValue(session as unknown as ClerkSession);
  vi.mocked(clerkClient).mockResolvedValue({
    organizations: {
      getOrganizationMembershipList: async ({ userId = [] }: { userId?: string[] }) => ({
        data: userId.map(id => ({ publicUserData: { userId: id } })),
        totalCount: userId.length,
      }),
    },
  } as unknown as ClerkClient);
}
