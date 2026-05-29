import { NextResponse } from 'next/server';
import {
  CUSTOMER_MEMORY_VERSION,
  boundMemory,
  db,
  parseStoredMemory,
  toCustomerMemoryJson,
} from '@clerk/db';
import { BadRequestError } from '@/lib/api/errors';
import { assertEntityInOrg, withOrgRoute } from '@/lib/api/route';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSummary(value: unknown, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') {
    throw new BadRequestError('summary must be a string');
  }
  return value.trim();
}

function normalizeKeyFacts(value: unknown, fallback: string[]): string[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value)) {
    throw new BadRequestError('keyFacts must be an array');
  }
  return value.flatMap((item) => {
      if (typeof item !== 'string') {
        throw new BadRequestError('keyFacts must contain only strings');
      }
      const trimmed = item.trim();
      return trimmed ? [trimmed] : [];
    });
}

export const GET = withOrgRoute<{ id: string }>(
  {
    context: 'Customer Memory GET',
    errorMessage: 'Failed to fetch customer memory',
    rateLimit: { key: 'customer-memory:get', limit: 120, windowSecs: 60 },
  },
  async ({ org, params }) => {
    const customer = await db.customer.findFirst({
      where: { id: params.id, deletedAt: null },
      select: { id: true, organizationId: true, memory: true, memoryUpdatedAt: true },
    });
    assertEntityInOrg(customer, org.id, 'Customer not found');

    return NextResponse.json({
      memory: parseStoredMemory(customer.memory),
      memoryUpdatedAt: customer.memoryUpdatedAt?.toISOString() ?? null,
    });
  },
);

export const PATCH = withOrgRoute<{ id: string }>(
  {
    context: 'Customer Memory PATCH',
    errorMessage: 'Failed to update customer memory',
    rateLimit: { key: 'customer-memory:patch', limit: 60, windowSecs: 60 },
  },
  async ({ org, request, params }) => {
    const body = await request.json().catch(() => {
      throw new BadRequestError('Invalid JSON');
    });
    if (!isRecord(body)) {
      throw new BadRequestError('Request body must be an object');
    }
    if (body.summary === undefined && body.keyFacts === undefined) {
      throw new BadRequestError('Missing summary or keyFacts');
    }

    const customer = await db.customer.findFirst({
      where: { id: params.id, deletedAt: null },
      select: { id: true, organizationId: true, memory: true, memoryUpdatedAt: true },
    });
    assertEntityInOrg(customer, org.id, 'Customer not found');

    const current = parseStoredMemory(customer.memory);
    const next = boundMemory({
      ...current,
      summary: normalizeSummary(body.summary, current.summary),
      keyFacts: normalizeKeyFacts(body.keyFacts, current.keyFacts),
      version: CUSTOMER_MEMORY_VERSION,
    });

    const summaryChanged = next.summary !== current.summary;
    const factsChanged = next.keyFacts.length !== current.keyFacts.length
      || next.keyFacts.some((fact, i) => fact !== current.keyFacts[i]);
    if (!summaryChanged && !factsChanged) {
      return NextResponse.json({
        memory: current,
        memoryUpdatedAt: customer.memoryUpdatedAt?.toISOString() ?? null,
      });
    }

    const updated = await db.customer.update({
      where: { id: customer.id },
      data: {
        memory: toCustomerMemoryJson(next),
        memoryUpdatedAt: new Date(),
      },
      select: { memory: true, memoryUpdatedAt: true },
    });

    return NextResponse.json({
      memory: parseStoredMemory(updated.memory),
      memoryUpdatedAt: updated.memoryUpdatedAt?.toISOString() ?? null,
    });
  },
);
