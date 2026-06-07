import { ForbiddenError } from '@/lib/api/errors';

export function requireOrgAdmin(orgRole: string | null | undefined): void {
  if (orgRole !== 'org:admin') {
    throw new ForbiddenError('Admin role required');
  }
}
