import { NextResponse } from 'next/server';
import {
  CUSTOMER_MEMORY_VERSION,
  EMPTY_MEMORY,
  boundMemory,
  db,
  isEmptyMemory,
  type CustomerMemory,
  type CustomerMemoryInteraction,
  type CustomerMemoryPolicyFlags,
} from '@clerk/db';
import type { Prisma } from '@prisma/client';
import { BadRequestError } from '@/lib/api/errors';
import { assertEntityInOrg, withOrgRoute } from '@/lib/api/route';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPolicyFlags(value: unknown): CustomerMemoryPolicyFlags {
  if (!isRecord(value)) return {};

  const flags: CustomerMemoryPolicyFlags = {};
  if (typeof value.vip === 'boolean') flags.vip = value.vip;
  if (typeof value.complaintPattern === 'boolean') flags.complaintPattern = value.complaintPattern;
  if (typeof value.priorRefundsTotal === 'number' && Number.isFinite(value.priorRefundsTotal) && value.priorRefundsTotal >= 0) {
    flags.priorRefundsTotal = value.priorRefundsTotal;
  }
  if (typeof value.priorRefundsCount === 'number' && Number.isFinite(value.priorRefundsCount) && value.priorRefundsCount >= 0) {
    flags.priorRefundsCount = value.priorRefundsCount;
  }
  return flags;
}

function readInteraction(value: unknown): CustomerMemoryInteraction | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.threadId !== 'string' ||
    typeof value.channel !== 'string' ||
    !(typeof value.tag === 'string' || value.tag === null) ||
    typeof value.closedAt !== 'string' ||
    typeof value.outcome !== 'string'
  ) {
    return null;
  }

  return {
    threadId: value.threadId,
    channel: value.channel,
    tag: value.tag,
    closedAt: value.closedAt,
    outcome: value.outcome,
  };
}

function readStoredMemory(value: unknown): CustomerMemory {
  if (isEmptyMemory(value) || !isRecord(value)) return EMPTY_MEMORY;

  return boundMemory({
    summary: typeof value.summary === 'string' ? value.summary : '',
    keyFacts: Array.isArray(value.keyFacts)
      ? value.keyFacts.filter((fact): fact is string => typeof fact === 'string')
      : [],
    policyFlags: readPolicyFlags(value.policyFlags),
    recentInteractions: Array.isArray(value.recentInteractions)
      ? value.recentInteractions
          .map(readInteraction)
          .filter((interaction): interaction is CustomerMemoryInteraction => interaction !== null)
      : [],
    version: CUSTOMER_MEMORY_VERSION,
  });
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
  return value
    .map((item) => {
      if (typeof item !== 'string') {
        throw new BadRequestError('keyFacts must contain only strings');
      }
      return item.trim();
    })
    .filter(Boolean);
}

function toJsonInput(value: CustomerMemory): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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
      memory: readStoredMemory(customer.memory),
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

    const current = readStoredMemory(customer.memory);
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
        memory: toJsonInput(next),
        memoryUpdatedAt: new Date(),
      },
      select: { memory: true, memoryUpdatedAt: true },
    });

    return NextResponse.json({
      memory: readStoredMemory(updated.memory),
      memoryUpdatedAt: updated.memoryUpdatedAt?.toISOString() ?? null,
    });
  },
);
