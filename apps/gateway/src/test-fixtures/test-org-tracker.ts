import { cleanupTestData } from '@shopkeeper/db/test-helpers';

/** Tracks org ids created during a test file and cleans them in afterEach. */
export function createTestOrgTracker() {
  const orgIds: string[] = [];
  return {
    track(orgId: string) {
      orgIds.push(orgId);
    },
    async cleanupAll() {
      for (const id of orgIds.splice(0)) {
        await cleanupTestData(id);
      }
    },
  };
}

export async function cleanupSingleTestOrg(orgId: string | null | undefined) {
  if (orgId) {
    await cleanupTestData(orgId);
  }
}
