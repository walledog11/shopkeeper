import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { BadRequestError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestError(`${field} is required`);
  }
  return value.trim();
}

function normalizeStringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new BadRequestError(`${field} must be an array`);
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean);
}

export const GET = withOrgRoute(
  { context: 'Canned Responses GET', errorMessage: 'Failed to fetch canned responses' },
  async ({ org }) => {
    const responses = await db.cannedResponse.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ responses });
  },
);

export const POST = withOrgRoute(
  { context: 'Canned Responses POST', errorMessage: 'Failed to create canned response' },
  async ({ org, request }) => {
    const { title, body, tags, channels } = await request.json();
    const response = await db.cannedResponse.create({
      data: {
        organizationId: org.id,
        title: requireNonEmptyString(title, 'title'),
        body: requireNonEmptyString(body, 'body'),
        tags: normalizeStringArray(tags, 'tags'),
        channels: normalizeStringArray(channels, 'channels'),
      },
    });
    return NextResponse.json({ response }, { status: 201 });
  },
);
