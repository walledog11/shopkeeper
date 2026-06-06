import { NextResponse } from 'next/server';
import {
  CUSTOMER_MEMORY_VERSION,
  boundMemory,
  db,
  parseStoredMemory,
  toCustomerMemoryJson,
} from '@clerk/db';
import { readRequiredJsonObject } from '@/lib/api/body';
import { assertEntityInOrg, withOrgRoute } from '@/lib/api/route';
import {
  normalizeMemoryKeyFacts,
  normalizeMemorySummary,
  parseCustomerMemoryPatchBody,
} from '@/app/api/customers/_lib/validation';

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
    const body = parseCustomerMemoryPatchBody(await readRequiredJsonObject(request));

    const customer = await db.customer.findFirst({
      where: { id: params.id, deletedAt: null },
      select: { id: true, organizationId: true, memory: true, memoryUpdatedAt: true },
    });
    assertEntityInOrg(customer, org.id, 'Customer not found');

    const current = parseStoredMemory(customer.memory);
    const next = boundMemory({
      ...current,
      summary: normalizeMemorySummary(body.summary, current.summary),
      keyFacts: normalizeMemoryKeyFacts(body.keyFacts, current.keyFacts),
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
