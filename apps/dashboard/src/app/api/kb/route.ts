import { NextResponse } from 'next/server';
import { withOrgRoute } from '@/lib/api/route';
import { getKbPageData } from '@/lib/server/kb-page-data';

export const GET = withOrgRoute(
  { context: 'KB GET', errorMessage: 'Failed to fetch knowledge bases' },
  async ({ org }) => {
    return NextResponse.json(await getKbPageData(org));
  },
);
